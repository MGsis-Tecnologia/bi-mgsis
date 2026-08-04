import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/server/auth";
import { getTenantPrisma } from "@/lib/server/tenant";
import { getCatalogPrisma } from "@/lib/server/catalog-db";
import { generateToken } from "@/lib/server/tokens";
import { sendMail } from "@/lib/server/mailer";
import type { SessionPayload } from "@/lib/server/auth-core";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RESET_EXPIRATION_MS = 7 * 86_400_000;

interface Ctx {
  params: Promise<{ id: string }>;
}

async function requireAdmin(): Promise<SessionPayload | null> {
  const session = await getSession();
  if (!session || (session.role !== "admin" && !session.isMaster)) return null;
  return session;
}

// POST /api/users/[id]/reset-link — gera e envia um novo link de definição de
// senha pro usuário. É o ÚNICO jeito de liberar alguém bloqueado (por 3
// tentativas erradas ou inativado à mão): a conta só volta a ficar ativa
// quando o link for de fato usado em /api/ativar, nunca por um toggle direto
// de isActive — por isso PATCH /api/users/[id] não aceita mais isActive:true.
export async function POST(_req: NextRequest, ctx: Ctx) {
  const session = await requireAdmin();
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 403 });

  const { id: idParam } = await ctx.params;
  const id = Number(idParam);
  if (!Number.isInteger(id)) {
    return NextResponse.json({ error: "Id inválido" }, { status: 400 });
  }

  const tenantDb = await getTenantPrisma(session);
  const user = await tenantDb.user.findUnique({ where: { id } });
  if (!user) return NextResponse.json({ error: "Usuário não encontrado" }, { status: 404 });

  const catalog = await getCatalogPrisma();
  const reset = generateToken();
  await catalog.inviteToken.create({
    data: {
      empresaId: session.empresaId,
      tokenHash: reset.hash,
      email: user.email,
      role: user.role,
      expiresAt: new Date(Date.now() + RESET_EXPIRATION_MS),
    },
  });

  const activationLink = `${_req.nextUrl.origin}/ativar?token=${reset.token}`;

  let emailSent = false;
  let emailError: string | undefined;
  try {
    await sendMail({
      to: user.email,
      subject: "Redefinição de senha — MGSIS Analytics",
      html: `<p>Foi solicitada uma redefinição de senha para a sua conta.</p>
             <p><a href="${activationLink}">Clique aqui para criar uma nova senha</a> (link válido por 7 dias).</p>
             <p style="color:#888;font-size:12px">Se você não esperava este e-mail, ignore.</p>`,
    });
    emailSent = true;
  } catch (err) {
    emailError = (err as Error).message;
  }

  return NextResponse.json({ ok: true, activationLink, emailSent, emailError });
}
