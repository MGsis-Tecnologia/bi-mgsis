import type { PrismaClient } from "@prisma/client";
import type { DatasetKind } from "@/lib/server/dataset-storage";

/**
 * Estado de uma importação de arquivo.
 *
 * O job existe porque o processamento não cabe na requisição: o arquivo de
 * vendas do cliente tem ~245 MB, e uma requisição síncrona morreria no timeout
 * do proxy muito antes do fim. O upload responde na hora com o id, e a tela
 * pergunta o progresso aqui.
 */

export type StatusJob = "recebido" | "processando" | "concluido" | "erro";

export interface EstadoJob {
  id: string;
  kind: DatasetKind | null;
  filename: string;
  bytes: number;
  status: StatusJob;
  lidas: number;
  gravadas: number;
  ignoradas: number;
  erro: string;
  avisos: string[];
  concluidoEm: string | null;
}

/** Jobs mais velhos que isto são varridos — ver `limpaJobsAntigos`. */
const RETENCAO_HORAS = 24;

export async function criaJob(
  db: PrismaClient,
  id: string,
  filename: string,
  bytes: number
): Promise<void> {
  await db.importJob.create({ data: { id, filename, bytes, status: "recebido" } });
}

/**
 * As atualizações de progresso precisam de uma conexão FORA da transação de
 * gravação: dentro dela, nada seria visível até o commit — que é justamente o
 * fim do trabalho que se quer acompanhar.
 */
export async function atualizaJob(
  db: PrismaClient,
  id: string,
  dados: Partial<{
    kind: string;
    status: StatusJob;
    lidas: number;
    gravadas: number;
    ignoradas: number;
    erro: string;
    avisos: string;
    concluidoEm: Date;
  }>
): Promise<void> {
  await db.importJob.update({ where: { id }, data: dados }).catch(() => {
    // Um job apagado no meio do caminho não pode derrubar a importação.
  });
}

export async function buscaJob(db: PrismaClient, id: string): Promise<EstadoJob | null> {
  const j = await db.importJob.findUnique({ where: { id } });
  if (!j) return null;

  let avisos: string[] = [];
  try {
    avisos = JSON.parse(j.avisos) as string[];
  } catch {
    avisos = [];
  }

  return {
    id: j.id,
    kind: (j.kind || null) as DatasetKind | null,
    filename: j.filename,
    bytes: j.bytes,
    status: j.status as StatusJob,
    lidas: j.lidas,
    gravadas: j.gravadas,
    ignoradas: j.ignoradas,
    erro: j.erro,
    avisos,
    concluidoEm: j.concluidoEm?.toISOString() ?? null,
  };
}

/**
 * Um processo reiniciado no meio de uma importação deixa o job preso em
 * "processando" para sempre, e a tela ficaria girando. Como não há retomada,
 * o honesto é marcar como erro na primeira vez que alguém olhar.
 */
export async function encerraJobsOrfaos(db: PrismaClient): Promise<void> {
  await db.importJob
    .updateMany({
      where: {
        status: { in: ["recebido", "processando"] },
        atualizadoEm: { lt: new Date(Date.now() - 10 * 60_000) },
      },
      data: {
        status: "erro",
        erro: "A importação foi interrompida (o servidor reiniciou). Envie o arquivo de novo.",
      },
    })
    .catch(() => {});
}

export async function limpaJobsAntigos(db: PrismaClient): Promise<void> {
  await db.importJob
    .deleteMany({
      where: { criadoEm: { lt: new Date(Date.now() - RETENCAO_HORAS * 3_600_000) } },
    })
    .catch(() => {});
}
