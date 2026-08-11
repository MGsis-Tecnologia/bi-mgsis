import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/server/auth";
import { getTenantPrisma } from "@/lib/server/tenant";
import { buscaJob, encerraJobsOrfaos } from "@/lib/server/importacao/jobs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Progresso de uma importação. A tela consulta isto enquanto o job roda. */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  const { id } = await ctx.params;
  const db = await getTenantPrisma(session);

  // Um processo reiniciado deixaria o job preso em "processando" e a tela
  // girando para sempre; aqui ele vira erro, que é o que de fato aconteceu.
  await encerraJobsOrfaos(db);

  const job = await buscaJob(db, id);
  if (!job) {
    return NextResponse.json({ error: "Importação não encontrada" }, { status: 404 });
  }

  return NextResponse.json(job);
}
