import { NextRequest, NextResponse } from "next/server";
import { isValidKind, clearRows, insertRows, getRows, getMeta } from "@/lib/server/dataset-storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Ctx {
  params: Promise<{ kind: string }>;
}

// GET /api/datasets/[kind]/rows?skip=0&take=10000
export async function GET(req: NextRequest, ctx: Ctx) {
  const { kind } = await ctx.params;
  if (!isValidKind(kind)) return NextResponse.json({ error: "invalid kind" }, { status: 400 });

  const sp = req.nextUrl.searchParams;
  const skip = Math.max(0, parseInt(sp.get("skip") ?? "0", 10));
  const take = Math.min(50_000, Math.max(1, parseInt(sp.get("take") ?? "10000", 10)));

  const [rows, meta] = await Promise.all([getRows(kind, skip, take), getMeta(kind)]);
  return NextResponse.json({ rows, total: meta?.rowCount ?? 0 });
}

// POST /api/datasets/[kind]/rows  — insere um lote de linhas
export async function POST(req: NextRequest, ctx: Ctx) {
  const { kind } = await ctx.params;
  if (!isValidKind(kind)) return NextResponse.json({ error: "invalid kind" }, { status: 400 });

  let rows: unknown[];
  try {
    const body = (await req.json()) as { rows?: unknown[] };
    rows = Array.isArray(body.rows) ? body.rows : [];
  } catch {
    return NextResponse.json({ error: "invalid json body" }, { status: 400 });
  }

  const inserted = await insertRows(kind, rows);
  return NextResponse.json({ inserted });
}

// DELETE /api/datasets/[kind]/rows — apaga todas as linhas (mantém metadata)
export async function DELETE(_req: NextRequest, ctx: Ctx) {
  const { kind } = await ctx.params;
  if (!isValidKind(kind)) return NextResponse.json({ error: "invalid kind" }, { status: 400 });
  await clearRows(kind);
  return NextResponse.json({ cleared: true });
}
