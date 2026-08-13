import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/server/auth";
import { getCatalogPrisma } from "@/lib/server/catalog-db";
import { getPrisma } from "@/lib/server/db";
import { buildTenantUrl } from "@/lib/server/db-config";
import { deployTenantMigrations } from "@/lib/server/migrate";
import { getTenantPrisma } from "@/lib/server/tenant";
import { generateToken } from "@/lib/server/tokens";
import { sendMail } from "@/lib/server/mailer";
import { getAppUrl } from "@/lib/server/app-url";
import type { SessionPayload } from "@/lib/server/auth-core";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Moeda em que a empresa lê os próprios números — "1" R$, "2" US$, "3" G$.
 *
 * É o destino da conversão quando o filtro está em "Todas as moedas", e o pivô
 * da tabela de câmbio. Trocar depois exige reenviar o câmbio, porque a tabela
 * densa é derivada contra ela.
 */
const MOEDAS_VALIDAS = new Set(["1", "2", "3"]);

const INVITE_EXPIRATION_MS = 7 * 86_400_000;

async function requireMaster(): Promise<SessionPayload | null> {
  const session = await getSession();
  if (!session || !session.isMaster) return null;
  return session;
}

export async function GET() {
  if (!(await requireMaster())) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 403 });
  }
  const catalog = await getCatalogPrisma();
  const empresas = await catalog.empresa.findMany({ orderBy: { createdAt: "desc" } });
  return NextResponse.json({ empresas });
}

export async function POST(req: NextRequest) {
  const session = await requireMaster();
  if (!session) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 403 });
  }

  let nome: string, cnpjRucRaw: string, emailMaster: string, maxUsers: number;
  let moedaPadrao: string;
  try {
    const body = (await req.json()) as {
      nome?: string;
      cnpjRuc?: string;
      emailMaster?: string;
      maxUsers?: number;
      moedaPadrao?: string;
    };
    nome = (body.nome ?? "").trim();
    cnpjRucRaw = body.cnpjRuc ?? "";
    emailMaster = (body.emailMaster ?? "").trim().toLowerCase();
    maxUsers = Number.isInteger(body.maxUsers) ? (body.maxUsers as number) : 5;
    // Padrão R$ para não mudar o comportamento de quem já existe; empresa
    // paraguaia deve ser cadastrada com "3".
    moedaPadrao = MOEDAS_VALIDAS.has(body.moedaPadrao ?? "") ? (body.moedaPadrao as string) : "1";
  } catch {
    return NextResponse.json({ error: "Corpo inválido" }, { status: 400 });
  }

  const cnpjRuc = cnpjRucRaw.replace(/\D/g, "");
  if (!nome || !cnpjRuc || !emailMaster) {
    return NextResponse.json(
      { error: "Preencha nome, CNPJ/RUC e e-mail do responsável" },
      { status: 400 }
    );
  }
  if (maxUsers < 1) {
    return NextResponse.json({ error: "O máximo de licenças precisa ser pelo menos 1" }, { status: 400 });
  }

  const dbName = `empresa_${cnpjRuc}`;
  // cnpjRuc já é só dígitos (regex acima), então dbName só pode ter [a-z0-9_] —
  // essa checagem é defesa em profundidade antes de interpolar em SQL cru.
  if (!/^[a-z0-9_]+$/.test(dbName)) {
    return NextResponse.json({ error: "CNPJ/RUC inválido" }, { status: 400 });
  }

  const catalog = await getCatalogPrisma();

  const existing = await catalog.empresa.findUnique({ where: { cnpjRuc } });
  if (existing) {
    return NextResponse.json(
      { error: "Já existe uma empresa cadastrada com esse CNPJ/RUC" },
      { status: 409 }
    );
  }

  // 1. Provisiona a database do tenant — mesmo servidor Postgres, database nova.
  //    CREATE DATABASE não pode rodar dentro de transação, por isso é uma
  //    chamada solta (fora de $transaction). Usa a conexão default só pra
  //    emitir o comando — não é acesso a dado de nenhum tenant específico.
  const adminDb = await getPrisma();
  await adminDb.$executeRawUnsafe(`CREATE DATABASE "${dbName}"`);

  // 2. Aplica as migrations versionadas na database nova (fase 7). Antes isso
  //    dependia da migração preguiçosa disparada pela primeira conexão; agora o
  //    tenant já nasce registrado em `_prisma_migrations`, no mesmo histórico
  //    auditável dos demais.
  try {
    await deployTenantMigrations(buildTenantUrl(dbName));
  } catch (err) {
    // A database acabou de ser criada nesta requisição e está vazia: derrubá-la
    // deixa o cadastro repetível. Sem isso, o CNPJ ficaria travado por uma
    // database órfã que faria o próximo CREATE DATABASE falhar.
    await adminDb.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${dbName}"`).catch(() => {});
    return NextResponse.json(
      { error: `Falha ao criar o schema da empresa: ${(err as Error).message}` },
      { status: 500 }
    );
  }

  // 3. Registra a empresa e os tokens no catalog.
  const empresa = await catalog.empresa.create({
    data: { cnpjRuc, nome, dbName, status: "pendente", emailMaster, maxUsers, moedaPadrao },
  });

  const integration = generateToken();
  await catalog.integrationToken.create({
    data: { empresaId: empresa.id, tokenHash: integration.hash },
  });

  const invite = generateToken();
  await catalog.inviteToken.create({
    data: {
      empresaId: empresa.id,
      tokenHash: invite.hash,
      email: emailMaster,
      expiresAt: new Date(Date.now() + INVITE_EXPIRATION_MS),
    },
  });

  const activationLink = `${getAppUrl(req)}/ativar?token=${invite.token}`;

  let emailSent = false;
  let emailError: string | undefined;
  try {
    // SMTP do sistema (catalog) — conta de envio única, não depende de qual
    // empresa o master está usando na sessão nem da empresa recém-criada.
    await sendMail({
      to: emailMaster,
      subject: `Ative sua conta — ${nome}`,
      html: `<p>Você foi cadastrado como administrador de <b>${nome}</b> no MGSIS Analytics.</p>
             <p><a href="${activationLink}">Clique aqui para ativar sua conta</a> (link válido por 7 dias).</p>
             <p style="color:#888;font-size:12px">Se você não esperava este e-mail, ignore.</p>`,
    });
    emailSent = true;
  } catch (err) {
    emailError = (err as Error).message;
  }

  return NextResponse.json({
    ok: true,
    empresa,
    integrationToken: integration.token,
    activationLink,
    emailSent,
    emailError,
  });
}
