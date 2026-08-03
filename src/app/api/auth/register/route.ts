import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { getPrisma } from "@/lib/server/db";
import { signToken, setSessionCookie } from "@/lib/server/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  let email: string, name: string, password: string;
  try {
    const body = (await req.json()) as { email?: string; name?: string; password?: string };
    email = (body.email ?? "").trim().toLowerCase();
    name = (body.name ?? "").trim();
    password = body.password ?? "";
  } catch {
    return NextResponse.json({ error: "Corpo inválido" }, { status: 400 });
  }

  if (!email || !name || password.length < 6) {
    return NextResponse.json(
      { error: "Preencha nome, e-mail e senha (mínimo 6 caracteres)" },
      { status: 400 }
    );
  }

  const db = await getPrisma();

  // Só permite cadastro quando não existe nenhum usuário (primeiro acesso)
  const count = await db.user.count();
  if (count > 0) {
    return NextResponse.json(
      { error: "Registro não permitido: já existe um administrador" },
      { status: 403 }
    );
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const user = await db.user.create({
    data: { email, name, passwordHash, role: "admin" },
  });

  // Cadastro do 1º admin do tenant atual (fluxo legado, hoje só usado antes do
  // catalog existir). empresaId 0 = "sem empresa resolvida ainda"; quem passa
  // por aqui não tem CNPJ/RUC pra vincular. Novos tenants (fase 5 em diante)
  // ganham seu primeiro admin pelo link de convite, que já sabe o empresaId.
  const token = await signToken({
    userId: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    empresaId: 0,
    isMaster: false,
  });

  return setSessionCookie(NextResponse.json({ ok: true }), token);
}
