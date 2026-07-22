import { NextResponse } from "next/server";
import { getPrisma } from "@/lib/server/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Healthcheck de LIVENESS: responde 200 sempre que o processo Next está de pé.
// A conexão com o banco é reportada no corpo (databaseReachable) mas NÃO
// derruba o healthcheck — senão o Coolify faz rollback do app inteiro só
// porque o banco está indisponível.
//
// A criação preguiçosa das tabelas (CREATE TABLE IF NOT EXISTS) acontece aqui
// na primeira chamada em que o banco estiver acessível.
export async function GET() {
  let databaseReachable = false;
  try {
    const prisma = await getPrisma();
    await prisma.$queryRaw`SELECT 1`;
    databaseReachable = true;
  } catch {
    databaseReachable = false;
  }
  return NextResponse.json({ status: "ok", databaseReachable });
}
