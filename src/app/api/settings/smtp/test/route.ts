import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/server/auth";
import { sendTestEmail } from "@/lib/server/mailer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({ to: z.string().trim().email() });

export async function POST(req: NextRequest) {
  // Só o master — mesma regra de /api/settings/smtp: conta de envio única do
  // sistema, não configurável por empresa.
  const session = await getSession();
  if (!session || !session.isMaster) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 403 });
  }

  let to: string;
  try {
    ({ to } = bodySchema.parse(await req.json()));
  } catch {
    return NextResponse.json({ error: "Informe um e-mail de destino válido" }, { status: 400 });
  }

  try {
    await sendTestEmail(to);
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
