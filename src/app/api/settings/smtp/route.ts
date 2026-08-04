import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/server/auth";
import { getSmtpConfigSafe, saveSmtpConfig } from "@/lib/server/mailer";
import type { SessionPayload } from "@/lib/server/auth-core";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  host: z.string().trim().min(1),
  port: z.coerce.number().int().min(1).max(65535),
  secure: z.boolean(),
  user: z.string().trim().min(1),
  password: z.string().optional(),
  fromName: z.string().trim().min(1),
  fromEmail: z.string().trim().email(),
});

// Só o master: a conta SMTP é única para todo o sistema, não uma configuração
// por empresa. Admin de empresa não lê nem grava (nem o host, nem o remetente).
async function requireMaster(): Promise<SessionPayload | null> {
  const session = await getSession();
  if (!session || !session.isMaster) return null;
  return session;
}

export async function GET() {
  const session = await requireMaster();
  if (!session) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 403 });
  }
  const config = await getSmtpConfigSafe();
  return NextResponse.json({ config });
}

export async function PUT(req: NextRequest) {
  const session = await requireMaster();
  if (!session) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 403 });
  }

  let parsed;
  try {
    parsed = bodySchema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "Dados inválidos. Confira servidor, porta e e-mails." }, { status: 400 });
  }

  await saveSmtpConfig(parsed);
  return NextResponse.json({ ok: true });
}
