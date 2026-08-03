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

  const existingUser = await tenantDb.user.findUnique({ where: { email: invite.email } });
  if (existingUser) {
    return NextResponse.json({ error: "Já existe um usuário com esse e-mail" }, { status: 409 });
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const user = await tenantDb.user.create({
    data: { email: invite.email, name, passwordHash, role: invite.role },
  });

  await catalog.$transaction([
    catalog.inviteToken.update({ where: { id: invite.id }, data: { usedAt: new Date() } }),
    catalog.empresa.update({ where: { id: empresa.id }, data: { status: "ativa" } }),
  ]);

  const sessionToken = await signToken({
    userId: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    empresaId: empresa.id,
    isMaster: false,
    // Usuário recém-criado nasce sem nenhuma linha em MenuPermission (nega
    // por padrão) — o admin concede acesso depois pela tela de Usuários.
    allowedMenus: [],
  });

  return setSessionCookie(NextResponse.json({ ok: true }), sessionToken);
}
