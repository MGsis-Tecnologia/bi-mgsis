import { NextResponse } from "next/server";
import { getSession } from "@/lib/server/auth";
import { getCatalogPrisma } from "@/lib/server/catalog-db";
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

// DELETE /api/users/invites/[id] — cancela um convite pendente antes de ser
// usado, liberando a licença na hora (sem esperar os 7 dias de expiração). O
// link já enviado por e-mail vira inválido em seguida (mesma checagem de
// /api/ativar: token não encontrado).
export async function DELETE(_req: Request, ctx: Ctx) {
  const session = await requireAdmin();
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 403 });

  const { id: idParam } = await ctx.params;
  const id = Number(idParam);
  if (!Number.isInteger(id)) {
    return NextResponse.json({ error: "Id inválido" }, { status: 400 });
  }

  const catalog = await getCatalogPrisma();
  const invite = await catalog.inviteToken.findUnique({ where: { id } });

  // empresaId precisa bater com a sessão — nunca deixar cancelar convite de
  // outra empresa só porque adivinhou o id.
  if (!invite || invite.empresaId !== session.empresaId) {
    return NextResponse.json({ error: "Convite não encontrado" }, { status: 404 });
  }
  if (invite.usedAt) {
    return NextResponse.json({ error: "Esse convite já foi usado, não dá pra cancelar" }, { status: 400 });
  }

  await catalog.inviteToken.delete({ where: { id } });

  return NextResponse.json({ ok: true });
}
