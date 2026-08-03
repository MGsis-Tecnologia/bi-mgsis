import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/server/auth";
import { getTenantPrisma } from "@/lib/server/tenant";
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

  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  const db = await getTenantPrisma(session);

  const sp = req.nextUrl.searchParams;
  const skip = Math.max(0, parseInt(sp.get("skip") ?? "0", 10));
  const take = Math.min(50_000, Math.max(1, parseInt(sp.get("take") ?? "10000", 10)));

  const [rows, meta] = await Promise.all([getRows(db, kind, skip, take), getMeta(db, kind)]);
  return NextResponse.json({ rows, total: meta?.rowCount ?? 0 });
}

// POST /api/datasets/[kind]/rows  — insere um lote de linhas
export async function POST(req: NextRequest, ctx: Ctx) {
  const { kind } = await ctx.params;
  if (!isValidKind(kind)) return NextResponse.json({ error: "invalid kind" }, { status: 400 });

  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  const db = await getTenantPrisma(session);

  let rows: unknown[];
  try {
    const body = (await req.json()) as { rows?: unknown[] };
    rows = Array.isArray(body.rows) ? body.rows : [];
  } catch (e) {
    console.error("❌ JSON parse error:", e);
    return NextResponse.json({ error: "invalid json body" }, { status: 400 });
  }

  try {
    console.log(`📝 Inserindo ${rows.length} linhas para ${kind}...`);
    const inserted = await insertRows(db, kind, rows);
    console.log(`✅ ${inserted} linhas inseridas`);
    return NextResponse.json({ inserted });
  } catch (e) {
    console.error(`❌ Insert error for ${kind}:`, e);
    return NextResponse.json({ error: (e as Error).message || "Insert failed" }, { status: 500 });
  }
}

// DELETE /api/datasets/[kind]/rows — apaga todas as linhas (mantém metadata)
export async function DELETE(_req: NextRequest, ctx: Ctx) {
  const { kind } = await ctx.params;
  if (!isValidKind(kind)) return NextResponse.json({ error: "invalid kind" }, { status: 400 });

  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  const db = await getTenantPrisma(session);

  await clearRows(db, kind);
  return NextResponse.json({ cleared: true });
}
