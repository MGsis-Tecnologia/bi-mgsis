import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/server/auth";
import { getTenantPrisma } from "@/lib/server/tenant";
import type { SessionPayload } from "@/lib/server/auth-core";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Ctx {
  params: Promise<{ id: string }>;
}

async function requireAdmin(): Promise<SessionPayload | null> {
  const session = await getSession();
  if (!session || (session.role !== "admin" && !session.isMaster)) return null;
  return session;
}

// PATCH /api/users/[id] — inativa (imediato) ou muda o papel de um usuário da
// própria empresa. NÃO aceita isActive:true: reativar exige o fluxo de link
// de redefinição (POST /api/users/[id]/reset-link + /api/ativar), pra sempre
// trocar a senha de quem estava bloqueado — nunca reabrir com a senha antiga.
export async function PATCH(req: NextRequest, ctx: Ctx) {
  const session = await requireAdmin();
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 403 });

  const { id: idParam } = await ctx.params;
  const id = Number(idParam);
  if (!Number.isInteger(id)) {
    return NextResponse.json({ error: "Id inválido" }, { status: 400 });
  }

  let isActive: boolean | undefined;
  let role: string | undefined;
  try {
    const body = (await req.json()) as { isActive?: boolean; role?: string };
    isActive = typeof body.isActive === "boolean" ? body.isActive : undefined;
    role = body.role === "admin" || body.role === "user" ? body.role : undefined;
  } catch {
    return NextResponse.json({ error: "Corpo inválido" }, { status: 400 });
  }

  if (isActive === undefined && role === undefined) {
    return NextResponse.json({ error: "Nada para atualizar" }, { status: 400 });
  }

  if (isActive === true) {
    return NextResponse.json(
      { error: "Reative enviando um novo link de redefinição de senha, não é possível reativar direto." },
      { status: 400 }
    );
  }

  if (!session.isMaster && id === session.userId && isActive === false) {
    return NextResponse.json({ error: "Você não pode inativar a própria conta" }, { status: 400 });
  }

  const db = await getTenantPrisma(session);
  const user = await db.user.update({
    where: { id },
    data: { ...(isActive !== undefined && { isActive }), ...(role !== undefined && { role }) },
  });

  return NextResponse.json({ ok: true, user: { id: user.id, isActive: user.isActive, role: user.role } });
}
