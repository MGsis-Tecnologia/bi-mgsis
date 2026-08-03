import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/server/auth";
import { getTenantPrisma } from "@/lib/server/tenant";
import { ALL_MENU_KEYS } from "@/lib/menu-catalog";
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

// PUT /api/users/[id]/menu-permissions — substitui o conjunto inteiro de
// menus liberados pro usuário (allow-list por presença de linha).
export async function PUT(req: NextRequest, ctx: Ctx) {
  const session = await requireAdmin();
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 403 });

  const { id: idParam } = await ctx.params;
  const userId = Number(idParam);
  if (!Number.isInteger(userId)) {
    return NextResponse.json({ error: "Id inválido" }, { status: 400 });
  }

  let menuKeys: string[];
  try {
    const body = (await req.json()) as { menuKeys?: string[] };
    menuKeys = Array.isArray(body.menuKeys) ? body.menuKeys.filter((k) => ALL_MENU_KEYS.includes(k)) : [];
  } catch {
    return NextResponse.json({ error: "Corpo inválido" }, { status: 400 });
  }

  const db = await getTenantPrisma(session);

  await db.$transaction([
    db.menuPermission.deleteMany({ where: { userId } }),
    ...(menuKeys.length
      ? [db.menuPermission.createMany({ data: menuKeys.map((menuKey) => ({ userId, menuKey })) })]
      : []),
  ]);

  return NextResponse.json({ ok: true, menuKeys });
}
