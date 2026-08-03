import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/server/auth";
import { getTenantPrisma } from "@/lib/server/tenant";
import { sendTestEmail } from "@/lib/server/mailer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({ to: z.string().trim().email() });

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session || (session.role !== "admin" && !session.isMaster)) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 403 });
  }

  let to: string;
  try {
    ({ to } = bodySchema.parse(await req.json()));
  } catch {
    return NextResponse.json({ error: "Informe um e-mail de destino válido" }, { status: 400 });
  }

  try {
    const db = await getTenantPrisma(session);
    await sendTestEmail(db, to);
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
