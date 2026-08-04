import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { getCatalogPrisma } from "@/lib/server/catalog-db";
import { getPrisma } from "@/lib/server/db";
import { buildTenantUrl } from "@/lib/server/db-config";
import { hashToken } from "@/lib/server/tokens";
import { signToken, setSessionCookie } from "@/lib/server/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

  if (!token || !name || password.length < 6) {
    return NextResponse.json(
      { error: "Preencha seu nome e uma senha (mínimo 6 caracteres)" },
      { status: 400 }
    );
  }

  const catalog = await getCatalogPrisma();
  const invite = await catalog.inviteToken.findUnique({ where: { tokenHash: hashToken(token) } });

  if (!invite || invite.usedAt || invite.expiresAt < new Date()) {
    return NextResponse.json({ error: "Link de convite inválido ou expirado" }, { status: 400 });
  }

  const empresa = await catalog.empresa.findUnique({ where: { id: invite.empresaId } });
  if (!empresa) {
    return NextResponse.json({ error: "Empresa não encontrada" }, { status: 400 });
  }

  const tenantDb = await getPrisma(buildTenantUrl(empresa.dbName));

  const passwordHash = await bcrypt.hash(password, 12);
  const existingUser = await tenantDb.user.findUnique({ where: { email: invite.email } });

  // Mesmo link serve pra dois casos: ativação de conta nova (nenhum usuário
  // com esse e-mail ainda) e redefinição/reativação de uma já existente
  // (convite gerado por POST /api/users/[id]/reset-link) — nesse segundo
  // caso, troca a senha e destrava a conta em vez de tentar criar duplicata.
  const user = existingUser
    ? await tenantDb.user.update({
        where: { id: existingUser.id },
        data: { passwordHash, isActive: true, failedLoginAttempts: 0 },
      })
    : await tenantDb.user.create({
        data: { email: invite.email, name, passwordHash, role: invite.role },
      });

  await catalog.$transaction([
    catalog.inviteToken.update({ where: { id: invite.id }, data: { usedAt: new Date() } }),
    catalog.empresa.update({ where: { id: empresa.id }, data: { status: "ativa" } }),
  ]);

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
