import { NextRequest, NextResponse } from "next/server";
import {
  deleteDataset,
  isValidKind,
  readDataset,
  writeDataset,
} from "@/lib/server/dataset-storage";

// Node runtime — we read/write the filesystem. Edge would fail here.
export const runtime = "nodejs";
// Server-side persistence is mutable on every request; never cache the responses.
export const dynamic = "force-dynamic";

interface Ctx {
  params: Promise<{ kind: string }>;
}

export async function GET(_req: NextRequest, ctx: Ctx) {
  const { kind } = await ctx.params;
  if (!isValidKind(kind)) return NextResponse.json({ error: "invalid kind" }, { status: 400 });

  const data = await readDataset(kind);
  if (!data) return NextResponse.json({ kind, present: false }, { status: 200 });
  return NextResponse.json({ kind, present: true, data }, { status: 200 });
}

export async function PUT(req: NextRequest, ctx: Ctx) {
  const { kind } = await ctx.params;
  if (!isValidKind(kind)) return NextResponse.json({ error: "invalid kind" }, { status: 400 });

  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json body" }, { status: 400 });
  }

  if (!payload || typeof payload !== "object") {
    return NextResponse.json({ error: "expected object body" }, { status: 400 });
  }

  await writeDataset(kind, payload);
  return NextResponse.json({ kind, present: true }, { status: 200 });
}

export async function DELETE(_req: NextRequest, ctx: Ctx) {
  const { kind } = await ctx.params;
  if (!isValidKind(kind)) return NextResponse.json({ error: "invalid kind" }, { status: 400 });
  await deleteDataset(kind);
  return NextResponse.json({ kind, present: false }, { status: 200 });
}
