import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { getCatalogPrisma } from "@/lib/server/catalog-db";
import { getPrisma } from "@/lib/server/db";
import { buildTenantUrl } from "@/lib/server/db-config";
import { hashToken } from "@/lib/server/tokens";
import { signToken, setSessionCookie } from "@/lib/server/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const LINK_INVALIDO = "Link inválido ou expirado";

/**
 * Resolve o token pro convite ainda válido, ou devolve `null`. Usado pelo GET
 * (que só descreve o link pra tela se montar) e pelo POST.
 */
async function carregaConvite(token: string) {
  if (!token) return null;
  const catalog = await getCatalogPrisma();
  const invite = await catalog.inviteToken.findUnique({ where: { tokenHash: hashToken(token) } });
  if (!invite || invite.usedAt || invite.expiresAt < new Date()) return null;
  return invite;
}

// GET /api/ativar?token=… — descreve o link pra tela saber o que pedir. Um
// convite de conta nova precisa do nome; uma redefinição de senha (o próprio
// usuário, via "Esqueci minha senha") não, porque o nome já está cadastrado —
// antes o campo aparecia mesmo assim e o valor digitado era ignorado.
//
// Não expõe nada que quem tem o token já não saiba: ele chegou por e-mail na
// caixa do dono da conta.
export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token") ?? "";
  const invite = await carregaConvite(token);
  if (!invite) return NextResponse.json({ error: LINK_INVALIDO }, { status: 400 });

  const catalog = await getCatalogPrisma();
  const empresa = await catalog.empresa.findUnique({ where: { id: invite.empresaId } });
  if (!empresa) return NextResponse.json({ error: LINK_INVALIDO }, { status: 400 });

  const tenantDb = await getPrisma(buildTenantUrl(empresa.dbName));
  const existingUser = await tenantDb.user.findUnique({ where: { email: invite.email } });

  return NextResponse.json({
    ok: true,
    email: invite.email,
    kind: invite.kind === "self_reset" ? "self_reset" : "invite",
    // Só quem ainda não tem conta precisa se apresentar.
    precisaNome: !existingUser,
  });
}

export async function POST(req: NextRequest) {
  let token: string, name: string, password: string;
  try {
    const body = (await req.json()) as { token?: string; name?: string; password?: string };
    token = body.token ?? "";
    name = (body.name ?? "").trim();
    password = body.password ?? "";
  } catch {
    return NextResponse.json({ error: "Corpo inválido" }, { status: 400 });
  }

  if (password.length < 6) {
    return NextResponse.json({ error: "A senha deve ter pelo menos 6 caracteres" }, { status: 400 });
  }

  const invite = await carregaConvite(token);
  if (!invite) return NextResponse.json({ error: LINK_INVALIDO }, { status: 400 });

  const catalog = await getCatalogPrisma();
  const empresa = await catalog.empresa.findUnique({ where: { id: invite.empresaId } });
  if (!empresa) {
    return NextResponse.json({ error: "Empresa não encontrada" }, { status: 400 });
  }

  const tenantDb = await getPrisma(buildTenantUrl(empresa.dbName));
  const existingUser = await tenantDb.user.findUnique({ where: { email: invite.email } });

  // O nome só é pedido de quem ainda não tem cadastro — pra quem já tem, o
  // que vier no corpo é ignorado (é o registro que manda).
  if (!existingUser && !name) {
    return NextResponse.json({ error: "Informe o seu nome" }, { status: 400 });
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const autoReset = invite.kind === "self_reset";

  // ── Redefinição pedida pelo próprio usuário ────────────────────────────
  // Poder MÍNIMO: troca a senha de uma conta que já existe e já está ativa, e
  // nada além disso. Não cria usuário, não reativa conta bloqueada e não toca
  // no status da empresa — é o que impede que "Esqueci minha senha" vire o
  // atalho para contornar o bloqueio das 3 tentativas erradas (esse continua
  // saindo só de POST /api/users/[id]/reset-link, com um admin no comando).
  //
  // A conta é conferida AQUI, e não só na emissão do link: entre pedir e usar
  // cabe o bloqueio acontecer, e um link emitido antes disso não pode valer
  // como perdão retroativo.
  if (autoReset) {
    if (!existingUser || !existingUser.isActive) {
      return NextResponse.json({ error: LINK_INVALIDO }, { status: 400 });
    }
  }

  // O ramo `create` é inalcançável quando `autoReset` — a checagem acima já
  // devolveu erro se não houvesse usuário.
  const user = existingUser
    ? await tenantDb.user.update({
        where: { id: existingUser.id },
        data: autoReset
          ? // Zera o contador de tentativas: a conta está ativa (logo, com
            // menos de 3 falhas) e quem provou acesso ao e-mail não deve
            // carregar strike de uma senha que nem existe mais.
            { passwordHash, failedLoginAttempts: 0 }
          : // Link do admin: além da senha, destrava a conta.
            { passwordHash, isActive: true, failedLoginAttempts: 0 },
      })
    : await tenantDb.user.create({
        data: { email: invite.email, name, passwordHash, role: invite.role },
      });

  // Queimar o token é comum aos dois fluxos; marcar a empresa como ativa é
  // exclusivo do convite — numa redefinição de senha isso deixaria um usuário
  // comum reabrir sozinho uma empresa suspensa.
  const queimaToken = catalog.inviteToken.update({
    where: { id: invite.id },
    data: { usedAt: new Date() },
  });
  await (autoReset
    ? queimaToken
    : catalog.$transaction([
        queimaToken,
        catalog.empresa.update({ where: { id: empresa.id }, data: { status: "ativa" } }),
      ]));

  // "admin" enxerga tudo; "user" novo nasce sem nenhuma linha em
  // MenuPermission (nega por padrão), e um "user" existente sendo
  // redefinido mantém as permissões que já tinha.
  let allowedMenus: string[] | undefined;
  if (user.role !== "admin") {
    const permissions = await tenantDb.menuPermission.findMany({ where: { userId: user.id } });
    allowedMenus = permissions.map((p) => p.menuKey);
  }

  const sessionToken = await signToken({
    userId: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    empresaId: empresa.id,
    isMaster: false,
    allowedMenus,
  });

  return setSessionCookie(NextResponse.json({ ok: true }), sessionToken);
}
