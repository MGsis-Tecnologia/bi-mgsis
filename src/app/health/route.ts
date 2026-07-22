import { NextResponse } from "next/server";
import { getPrisma } from "@/lib/server/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Rota de healthcheck do Docker/Coolify. Fica fora do padrão /api/* de
// propósito (é a única exceção, igual ao fluxo de referência).
//
// Além de reportar a saúde, dispara getPrisma() — que no primeiro boot roda o
// CREATE TABLE IF NOT EXISTS e valida a conexão. Assim o próprio healthcheck
// bootstrapa o schema antes da primeira requisição de usuário.
export async function GET() {
  try {
    const prisma = await getPrisma();
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json({ status: "ok", databaseReachable: true });
  } catch (err) {
    return NextResponse.json(
      {
        status: "error",
        databaseReachable: false,
        error: (err as Error).message,
      },
      { status: 503 }
    );
  }
}
