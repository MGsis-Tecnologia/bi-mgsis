import { NextRequest, NextResponse } from "next/server";
import { saveDatabaseUrl } from "@/lib/server/db-config";
import { testConnection, resetPrismaClient, getPrisma } from "@/lib/server/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  let url: string;
  try {
    const body = (await req.json()) as { url?: string };
    url = (body.url ?? "").trim();
    if (!url) return NextResponse.json({ error: "URL não informada" }, { status: 400 });
  } catch {
    return NextResponse.json({ error: "Corpo inválido" }, { status: 400 });
  }

  // Testa a conexão antes de salvar
  try {
    await testConnection(url);
  } catch (err) {
    return NextResponse.json(
      { error: `Falha na conexão: ${(err as Error).message}` },
      { status: 422 }
    );
  }

  // Salva config e reinicia o cliente
  await saveDatabaseUrl(url);
  await resetPrismaClient();

  // Cria as tabelas (getPrisma executa a migration na primeira chamada)
  try {
    await getPrisma();
  } catch (err) {
    return NextResponse.json(
      { error: `Conexão salva mas falha ao criar tabelas: ${(err as Error).message}` },
      { status: 500 }
    );
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set("db_configured", "1", {
    httpOnly: true,
    sameSite: "lax",
    maxAge: 30 * 24 * 60 * 60,
    path: "/",
  });
  return res;
}
