import { NextResponse } from "next/server";
import { getSession } from "@/lib/server/auth";
import { getTenantPrisma } from "@/lib/server/tenant";
import { summarizeAll } from "@/lib/server/dataset-storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const db = await getTenantPrisma(session);
  const summaries = await summarizeAll(db);
  return NextResponse.json({ datasets: summaries }, { status: 200 });
}
