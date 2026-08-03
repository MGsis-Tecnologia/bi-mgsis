import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/server/auth";
import { getTenantPrisma } from "@/lib/server/tenant";
import { getCatalogPrisma } from "@/lib/server/catalog-db";
import { generateToken } from "@/lib/server/tokens";
import { sendMail } from "@/lib/server/mailer";
import type { SessionPayload } from "@/lib/server/auth-core";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const INVITE_EXPIRATION_MS = 7 * 86_400_000;

async function requireAdmin(): Promise<SessionPayload | null> {
  const session = await getSession();
  if (!session || (session.role !== "admin" && !session.isMaster)) return null;
  return session;
}

// GET /api/users — lista os usuários da PRÓPRIA empresa (tenant da sessão)
export async function GET() {
  const session = await requireAdmin();
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 403 });

  const db = await getTenantPrisma(session);
  const users = await db.user.findMany({
    orderBy: { createdAt: "asc" },
    include: { menuAccess: { select: { menuKey: true } } },
  });

  return NextResponse.json({
    users: users.map((u) => ({
      id: u.id,
      email: u.email,
      name: u.name,
      role: u.role,
      isActive: u.isActive,
      createdAt: u.createdAt,
      menuKeys: u.menuAccess.map((m) => m.menuKey),
    })),
  });
}

// POST /api/users — convida um novo usuário interno (mesmo mecanismo de
// InviteToken usado pra ativação da empresa, agora escopado ao empresaId da
// sessão e com o papel escolhido pelo admin).
export async function POST(req: NextRequest) {
  const session = await requireAdmin();
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 403 });

  let email: string, name: string, role: string;
  try {
    const body = (await req.json()) as { email?: string; name?: string; role?: string };
    email = (body.email ?? "").trim().toLowerCase();
    name = (body.name ?? "").trim();
    role = body.role === "admin" ? "admin" : "user";
  } catch {
    return NextResponse.json({ error: "Corpo inválido" }, { status: 400 });
  }

  if (!email || !name) {
    return NextResponse.json({ error: "Preencha nome e e-mail" }, { status: 400 });
  }

  const tenantDb = await getTenantPrisma(session);
  const existingUser = await tenantDb.user.findUnique({ where: { email } });
  if (existingUser) {
    return NextResponse.json({ error: "Já existe um usuário com esse e-mail" }, { status: 409 });
  }

  const catalog = await getCatalogPrisma();
  const invite = generateToken();
  await catalog.inviteToken.create({
    data: {
      empresaId: session.empresaId,
      tokenHash: invite.hash,
      email,
      role,
      expiresAt: new Date(Date.now() + INVITE_EXPIRATION_MS),
    },
  });

  const activationLink = `${req.nextUrl.origin}/ativar?token=${invite.token}`;

  let emailSent = false;
  let emailError: string | undefined;
  try {
    await sendMail(tenantDb, {
      to: email,
      subject: "Você foi convidado — MGSIS Analytics",
      html: `<p>Você foi convidado para acessar o MGSIS Analytics.</p>
             <p><a href="${activationLink}">Clique aqui para ativar sua conta</a> (link válido por 7 dias).</p>
             <p style="color:#888;font-size:12px">Se você não esperava este e-mail, ignore.</p>`,
    });
    emailSent = true;
  } catch (err) {
    emailError = (err as Error).message;
  }

  return NextResponse.json({ ok: true, activationLink, emailSent, emailError });
}
