import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/server/auth";
import { getTenantPrisma } from "@/lib/server/tenant";
import { isValidKind, getMeta, upsertMeta, deleteDataset } from "@/lib/server/dataset-storage";
import type { DatasetKind } from "@/lib/server/dataset-storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Ctx {
  params: Promise<{ kind: string }>;
}

// GET /api/datasets/[kind] — retorna só metadata (sem rows)
export async function GET(_req: NextRequest, ctx: Ctx) {
  const { kind } = await ctx.params;
  if (!isValidKind(kind)) return NextResponse.json({ error: "invalid kind" }, { status: 400 });

  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  const db = await getTenantPrisma(session);

  const meta = await getMeta(db, kind);
  if (!meta) return NextResponse.json({ kind, present: false });
  return NextResponse.json({ kind, present: true, meta });
}

// PATCH /api/datasets/[kind] — atualiza metadata após envio dos lotes
export async function PATCH(req: NextRequest, ctx: Ctx) {
  const { kind } = await ctx.params;
  if (!isValidKind(kind)) return NextResponse.json({ error: "invalid kind" }, { status: 400 });

  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  const db = await getTenantPrisma(session);

  let payload: { filename?: string; rowCount?: number; importedAt?: string };
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json body" }, { status: 400 });
  }

  if (!payload.filename || payload.rowCount === undefined || !payload.importedAt) {
    return NextResponse.json({ error: "filename, rowCount e importedAt são obrigatórios" }, { status: 400 });
  }

  await upsertMeta(db, {
    kind: kind as DatasetKind,
    filename: payload.filename,
    rowCount: payload.rowCount,
    importedAt: payload.importedAt,
  });

  return NextResponse.json({ kind, present: true });
}

// DELETE /api/datasets/[kind] — remove linhas e metadata
export async function DELETE(_req: NextRequest, ctx: Ctx) {
  const { kind } = await ctx.params;
  if (!isValidKind(kind)) return NextResponse.json({ error: "invalid kind" }, { status: 400 });

  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  const db = await getTenantPrisma(session);

  await deleteDataset(db, kind);
  return NextResponse.json({ kind, present: false });
}
