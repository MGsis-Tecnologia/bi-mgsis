import { NextResponse } from "next/server";
import { summarizeAll } from "@/lib/server/dataset-storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const summaries = await summarizeAll();
  return NextResponse.json({ datasets: summaries }, { status: 200 });
}
