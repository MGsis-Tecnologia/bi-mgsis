import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/server/auth";
import { getCatalogPrisma } from "@/lib/server/catalog-db";
import { getPrisma, resetPrismaClient } from "@/lib/server/db";
import { buildTenantUrl, getDatabaseUrl, getDbNameFromUrl } from "@/lib/server/db-config";
import type { SessionPayload } from "@/lib/server/auth-core";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Ctx {
  params: Promise<{ id: string }>;
}

const STATUS_VALIDOS = new Set(["ativa", "suspensa", "pendente"]);

async function requireMaster(): Promise<SessionPayload | null> {
  const session = await getSession();
  if (!session || !session.isMaster) return null;
  return session;
}

async function parseId(ctx: Ctx): Promise<number | null> {
  const { id } = await ctx.params;
  const n = Number(id);
  return Number.isInteger(n) ? n : null;
}

/**
 * Bancos que NUNCA podem ser derrubados, mesmo que exista uma Empresa
 * apontando pra eles: o banco default do processo (onde mora o catalog e, na
 * instalação de empresa única, o próprio tenant do master). A empresa criada
 * pelo /master/bootstrap aponta justamente pra esse banco — sem esta trava,
 * excluí-la apagaria o sistema inteiro, catalog junto.
 */
function bancosProtegidos(): Set<string> {
  const nomes = new Set<string>();
  const base = getDatabaseUrl();
  if (base) nomes.add(getDbNameFromUrl(base));
  const catalogUrl = process.env.CATALOG_DATABASE_URL;
  if (catalogUrl) nomes.add(getDbNameFromUrl(catalogUrl));
  return nomes;
}

// PATCH /api/master/empresas/[id] — edita nome/e-mail do responsável e/ou muda
// o status. Suspender é o caminho não destrutivo pra cortar o acesso de todos
// os usuários da empresa (ver getTenantPrisma em src/lib/server/tenant.ts).
export async function PATCH(req: NextRequest, ctx: Ctx) {
  const session = await requireMaster();
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 403 });

  const id = await parseId(ctx);
  if (id === null) return NextResponse.json({ error: "Id inválido" }, { status: 400 });

  let nome: string | undefined;
  let emailMaster: string | undefined;
  let status: string | undefined;
  let maxUsers: number | undefined;
  try {
    const body = (await req.json()) as {
      nome?: string;
      emailMaster?: string;
      status?: string;
      maxUsers?: number;
    };
    nome = body.nome?.trim() || undefined;
    emailMaster = body.emailMaster?.trim().toLowerCase() || undefined;
    status = body.status && STATUS_VALIDOS.has(body.status) ? body.status : undefined;
    maxUsers = Number.isInteger(body.maxUsers) && (body.maxUsers as number) >= 1 ? body.maxUsers : undefined;
  } catch {
    return NextResponse.json({ error: "Corpo inválido" }, { status: 400 });
  }

  if (!nome && !emailMaster && !status && maxUsers === undefined) {
    return NextResponse.json({ error: "Nada para atualizar" }, { status: 400 });
  }

  const catalog = await getCatalogPrisma();
  const atual = await catalog.empresa.findUnique({ where: { id } });
  if (!atual) return NextResponse.json({ error: "Empresa não encontrada" }, { status: 404 });

  // Suspender a empresa do próprio master o trancaria fora da administração:
  // getTenantPrisma libera o master, mas o login de qualquer outro usuário dela
  // para de funcionar e não haveria como reverter pela interface.
  if (status && status !== "ativa" && id === session.empresaId) {
    return NextResponse.json(
      { error: "Você não pode suspender a empresa da sua própria sessão" },
      { status: 400 }
    );
  }

  const empresa = await catalog.empresa.update({
    where: { id },
    data: {
      ...(nome && { nome }),
      ...(emailMaster && { emailMaster }),
      ...(status && { status }),
      ...(maxUsers !== undefined && { maxUsers }),
    },
  });

  // Libera as conexões abertas com o tenant suspenso — o acesso já está barrado
  // pelo status, isto só evita segurar pool à toa.
  if (status && status !== "ativa") {
    await resetPrismaClient(buildTenantUrl(empresa.dbName)).catch(() => {});
  }

  return NextResponse.json({ ok: true, empresa });
}

// DELETE /api/master/empresas/[id]?confirm=<nome exato da empresa>
// Destrutivo e irreversível: remove o cadastro E derruba a database do tenant,
// com todos os dados dela. O `confirm` com o nome exato existe pra que uma
// chamada acidental (ou um clique errado) não apague uma empresa inteira.
export async function DELETE(req: NextRequest, ctx: Ctx) {
  const session = await requireMaster();
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 403 });

  const id = await parseId(ctx);
  if (id === null) return NextResponse.json({ error: "Id inválido" }, { status: 400 });

  const catalog = await getCatalogPrisma();
  const empresa = await catalog.empresa.findUnique({ where: { id } });
  if (!empresa) return NextResponse.json({ error: "Empresa não encontrada" }, { status: 404 });

  if (id === session.empresaId) {
    return NextResponse.json(
      { error: "Você não pode excluir a empresa da sua própria sessão" },
      { status: 400 }
    );
  }

  if (bancosProtegidos().has(empresa.dbName)) {
    return NextResponse.json(
      {
        error:
          `A empresa "${empresa.nome}" aponta para o banco principal do sistema ` +
          `(${empresa.dbName}), onde vive o catalog. Excluí-la apagaria a instalação ` +
          `inteira. Suspenda-a se quiser cortar o acesso.`,
      },
      { status: 400 }
    );
  }

  const confirm = req.nextUrl.searchParams.get("confirm") ?? "";
  if (confirm.trim() !== empresa.nome) {
    return NextResponse.json(
      { error: "Confirmação não confere: digite o nome exato da empresa." },
      { status: 400 }
    );
  }

  // dbName é gerado como `empresa_<só dígitos>`, mas confere antes de interpolar
  // em SQL cru — defesa em profundidade, igual ao POST de criação.
  if (!/^[a-z0-9_]+$/.test(empresa.dbName)) {
    return NextResponse.json({ error: "Nome de database inválido" }, { status: 400 });
  }

  // Derruba a database ANTES de apagar o cadastro: se o DROP falhar, a empresa
  // continua registrada e a operação pode ser repetida. Na ordem inversa, uma
  // falha deixaria uma database órfã sem nenhum registro apontando pra ela.
  const adminDb = await getPrisma();
  await resetPrismaClient(buildTenantUrl(empresa.dbName)).catch(() => {});
  try {
    // Sem encerrar as sessões abertas o DROP falha com "database is being
    // accessed by other users" — inclusive por conexões de outra instância.
    await adminDb.$executeRawUnsafe(
      `SELECT pg_terminate_backend(pid) FROM pg_stat_activity
       WHERE datname = $1 AND pid <> pg_backend_pid()`,
      empresa.dbName
    );
    await adminDb.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${empresa.dbName}"`);
  } catch (err) {
    return NextResponse.json(
      { error: `Falha ao remover a database da empresa: ${(err as Error).message}` },
      { status: 500 }
    );
  }

  await catalog.empresa.delete({ where: { id } });

  return NextResponse.json({ ok: true });
}
