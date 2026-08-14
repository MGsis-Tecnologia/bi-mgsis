import type { PrismaClient } from "@prisma/client";
import { DATASETS, type NomeDataset } from "./contrato";
import type { Periodo } from "./periodo";

/**
 * Substitui um período inteiro, em transação.
 *
 * O plano previa uma tabela de staging antes da troca. Ela não é necessária
 * aqui porque **o período chega numa requisição só**: apagar e inserir dentro
 * da mesma transação já dá a mesma garantia, com menos peças. Enquanto a
 * transação não commita, quem lê continua vendo o período antigo inteiro — em
 * nenhum momento existe meio período visível, que é o defeito da importação de
 * CSV de hoje.
 *
 * Se um cliente tiver mês grande demais para uma requisição, o caminho é
 * mandar um intervalo menor (ver `periodo.ts`), não parcelar o mesmo período.
 */

/** Acima disto o lote é recusado, com instrução de partir o período. */
export const MAX_LINHAS = 150_000;

/** Lotes do createMany. Acima de ~5 mil o ganho some e o pico de memória sobe. */
const LOTE_INSERCAO = 5_000;

export interface ResultadoSubstituicao {
  removidas: number;
  inseridas: number;
  ms: number;
}

export async function substituiPeriodo(
  db: PrismaClient,
  dataset: NomeDataset,
  periodo: Periodo,
  linhas: unknown[]
): Promise<ResultadoSubstituicao> {
  const def = DATASETS[dataset];
  const inicio = Date.now();

  const resultado = await db.$transaction(
    async (tx) => {
      let removidas: number;

      if (def.colunaData === null || periodo.de === null) {
        // Estoque: foto do momento, substituída por inteiro.
        removidas = await tx.$executeRawUnsafe(`DELETE FROM ${def.tabela}`);
      } else {
        removidas = await tx.$executeRawUnsafe(
          `DELETE FROM ${def.tabela} WHERE ${def.colunaData} >= $1 AND ${def.colunaData} <= $2`,
          periodo.de,
          periodo.ate
        );
      }

      let inseridas = 0;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const delegate = (tx as any)[def.delegate];
      for (let i = 0; i < linhas.length; i += LOTE_INSERCAO) {
        const r = await delegate.createMany({
          data: linhas.slice(i, i + LOTE_INSERCAO),
        });
        inseridas += r.count;
      }

      return { removidas, inseridas };
    },
    // Um mês de vendas são ~21 mil linhas; a carga inicial de estoque, 112 mil.
    // O padrão do Prisma (5 s) estoura nos lotes grandes.
    { timeout: 180_000, maxWait: 30_000 }
  );

  return { ...resultado, ms: Date.now() - inicio };
}

/**
 * Linhas fora do período declarado seriam apagadas pelo envio seguinte e nunca
 * apareceriam — pior, sem erro nenhum. Recusar na entrada transforma um erro de
 * configuração do agente (fuso, mês errado) em falha visível na hora.
 */
export function conferePertinencia(
  dataset: NomeDataset,
  periodo: Periodo,
  linhas: Record<string, unknown>[]
): { indice: number; valor: string } | null {
  const def = DATASETS[dataset];
  if (def.colunaData === null || periodo.de === null) return null;

  const campo = CAMPO_DE_DATA[dataset];
  for (let i = 0; i < linhas.length; i++) {
    const v = linhas[i]![campo] as string;
    if (v < periodo.de || v > periodo.ate!) return { indice: i, valor: v };
  }
  return null;
}

/** Campo (camelCase, como chega no JSON) que carrega a data de emissão. */
const CAMPO_DE_DATA: Record<NomeDataset, string> = {
  vendas: "date",
  compras: "pedidoData",
  orcamentos: "orcamentoData",
  receber: "issueDate",
  pagar: "issueDate",
  caixa: "date",
  estoque: "",
  // Sem coluna de data para conferir: o câmbio vai sempre inteiro (periodo
  // "tudo"), então não existe recorte que uma linha possa violar.
  cambio: "",
};
