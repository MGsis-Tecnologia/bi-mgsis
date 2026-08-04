import { NextResponse } from "next/server";
import { getSession } from "@/lib/server/auth";
import { getCatalogPrisma } from "@/lib/server/catalog-db";
import type { SessionPayload } from "@/lib/server/auth-core";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function requireAdmin(): Promise<SessionPayload | null> {
  const session = await getSession();
  if (!session || (session.role !== "admin" && !session.isMaster)) return null;
  return session;
}

// GET /api/users/invites — convites pendentes (não usados, não expirados) da
// própria empresa. Cada um ocupa uma licença até ser usado, cancelado ou
// expirar — ver POST /api/users (checagem do limite).
export async function GET() {
  const session = await requireAdmin();
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 403 });

  const catalog = await getCatalogPrisma();
  const invites = await catalog.inviteToken.findMany({
    where: { empresaId: session.empresaId, usedAt: null, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: "asc" },
    select: { id: true, email: true, role: true, createdAt: true, expiresAt: true },
  });

  return NextResponse.json({ invites });
}
