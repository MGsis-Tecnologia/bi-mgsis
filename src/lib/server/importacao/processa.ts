import { createReadStream } from "node:fs";
import { stat, unlink } from "node:fs/promises";
import Papa from "papaparse";
import * as XLSX from "xlsx";
import type { PrismaClient } from "@prisma/client";
import { processRows, type ParseResult } from "@/lib/parsers/csv-parser";
import { clearRows, insertRows, upsertMeta, type DatasetKind } from "@/lib/server/dataset-storage";
import { detectaPivo, normaliza, reconstroiCambioDiario, type LinhaCambio } from "@/lib/server/ingest/cambio";
import { atualizaJob } from "./jobs";

/**
 * Importação de arquivo, feita no servidor (fase E).
 *
 * O que isto substitui: o navegador lia o CSV inteiro, montava 1,4 milhão de
 * objetos em memória e mandava ~473 POSTs sequenciais de 3.000 linhas. Se a aba
 * fechasse no meio, o dado ficava pela metade — e ninguém sabia.
 *
 * Aqui o arquivo é lido em **streaming**: linhas entram, viram lote, o lote é
 * gravado e é descartado. A memória fica limitada ao lote, não ao arquivo, que é
 * o que permite processar 245 MB num VPS enxuto.
 *
 * ## Por que uma transação só, longa
 *
 * O `DELETE` e todos os `INSERT` ficam na MESMA transação, aberta durante todo o
 * parse. Custa uma conexão do pool por vários minutos, e em troca dá a garantia
 * que faltava: enquanto ela não commita, quem está olhando o relatório vê o
 * dataset **antigo inteiro** — nunca meio dataset. Se falhar na linha 900 mil,
 * nada muda. É a mesma escolha da fase D (`substituiPeriodo`), esticada.
 *
 * Não bloqueia leitura: `DELETE` pega ROW EXCLUSIVE, que não conflita com
 * `SELECT`. O custo real é a conexão presa e o vacuum adiado.
 *
 * ## Por que `processRows` por lote
 *
 * `processRows` é puro — recebe linhas cruas e devolve itens tipados. Chamá-lo
 * por lote em vez de uma vez só reaproveita **exatamente** o mesmo código que o
 * navegador usava (detecção de leiaute, datas BR/Excel, validações), sem manter
 * duas implementações que divergem. A detecção é estável entre lotes porque
 * depende das colunas, que o Papa lê uma vez no cabeçalho.
 */

/** Linhas cruas acumuladas antes de virar lote. Acima disso o ganho some. */
const LOTE = 5_000;

/**
 * XLSX não tem leitura em streaming — a planilha inteira vira objeto em memória.
 * Os arquivos grandes do cliente são CSV; o teto existe para um XLSX inesperado
 * não derrubar o processo.
 */
const MAX_XLSX_BYTES = 50 * 1024 * 1024;

/** Extrai `kind` e itens do resultado do parser, qualquer que seja o leiaute. */
function itensDe(r: ParseResult): { kind: DatasetKind; itens: unknown[] } | null {
  if (r.kind === "sales" && r.dataset) return { kind: "sales", itens: r.dataset.items };
  if (r.kind === "receivable" && r.receivables) return { kind: "receivable", itens: r.receivables.items };
  if (r.kind === "payable" && r.payables) return { kind: "payable", itens: r.payables.items };
  if (r.kind === "inventory" && r.inventory) return { kind: "inventory", itens: r.inventory.items };
  if (r.kind === "caixa" && r.caixa) return { kind: "caixa", itens: r.caixa.items };
  if (r.kind === "orcamento" && r.orcamento) return { kind: "orcamento", itens: r.orcamento.items };
  if (r.kind === "compras" && r.compras) return { kind: "compras", itens: r.compras.items };
  if (r.kind === "cambio" && r.cambio) return { kind: "cambio", itens: r.cambio.items };
  return null;
}

class ErroImportacao extends Error {}

/**
 * Lê o arquivo linha a linha e entrega lotes de linhas CRUAS.
 *
 * `aoLote` pode demorar (é ele que grava no banco): o stream é pausado enquanto
 * roda, senão o Papa continuaria empurrando linhas e a memória cresceria sem
 * limite — exatamente o que o streaming existe para evitar.
 */
async function leEmLotes(
  caminho: string,
  nomeArquivo: string,
  aoLote: (linhas: Record<string, unknown>[]) => Promise<void>
): Promise<void> {
  const ext = nomeArquivo.split(".").pop()?.toLowerCase() ?? "";

  if (ext === "xlsx" || ext === "xls") {
    const { size } = await stat(caminho);
    if (size > MAX_XLSX_BYTES) {
      throw new ErroImportacao(
        `Planilha de ${(size / 1024 / 1024).toFixed(0)} MB é grande demais para XLSX ` +
          `(limite ${MAX_XLSX_BYTES / 1024 / 1024} MB). Exporte como CSV — esse não tem limite.`
      );
    }
    const wb = XLSX.readFile(caminho, { cellDates: false });
    const sheet = wb.Sheets[wb.SheetNames[0]!]!;
    const linhas = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "", raw: true });
    for (let i = 0; i < linhas.length; i += LOTE) {
      await aoLote(linhas.slice(i, i + LOTE));
    }
    return;
  }

  if (ext !== "csv") {
    throw new ErroImportacao("Formato não suportado. Use CSV, XLSX ou XLS.");
  }

  await new Promise<void>((resolve, reject) => {
    const entrada = createReadStream(caminho);
    const parser = Papa.parse(Papa.NODE_STREAM_INPUT, { header: true, skipEmptyLines: true });

    const buffer: Record<string, unknown>[] = [];
    let ocupado = false;
    let terminou = false;
    let falhou = false;

    const descarrega = async (fim: boolean) => {
      if (falhou) return;
      ocupado = true;
      parser.pause();
      try {
        while (buffer.length >= LOTE || (fim && buffer.length > 0)) {
          await aoLote(buffer.splice(0, LOTE));
        }
        ocupado = false;
        if (fim) resolve();
        else parser.resume();
      } catch (err) {
        falhou = true;
        entrada.destroy();
        reject(err);
      }
    };

    parser.on("data", (linha: Record<string, unknown>) => {
      buffer.push(linha);
      if (buffer.length >= LOTE && !ocupado) void descarrega(false);
    });
    parser.on("end", () => {
      terminou = true;
      if (!ocupado) void descarrega(true);
    });
    parser.on("error", (err: Error) => {
      falhou = true;
      reject(err);
    });
    entrada.on("error", (err) => {
      falhou = true;
      reject(err);
    });

    // O `end` pode chegar enquanto um lote está sendo gravado; nesse caso o
    // `descarrega` em curso resolve a promessa ao ver que já terminou.
    parser.on("close", () => {
      if (terminou && !ocupado && !falhou) resolve();
    });

    entrada.pipe(parser);
  });
}

export interface ResultadoImportacao {
  kind: DatasetKind;
  gravadas: number;
  ignoradas: number;
  avisos: string[];
  ms: number;
}

/**
 * Processa o arquivo já gravado em `caminho` e substitui o dataset inteiro.
 *
 * `db` é usado para a transação de dados; `dbProgresso` precisa ser um client
 * SEPARADO para escrever o progresso, porque uma escrita dentro da transação só
 * apareceria no commit.
 */
export async function processaArquivo(
  db: PrismaClient,
  jobId: string,
  caminho: string,
  nomeArquivo: string
): Promise<ResultadoImportacao> {
  const inicio = Date.now();
  await atualizaJob(db, jobId, { status: "processando" });

  let kind: DatasetKind | null = null;
  let lidas = 0;
  let gravadas = 0;
  let ignoradas = 0;
  const avisos: string[] = [];
  let ultimoAviso = 0;
  /**
   * Pivô do câmbio — a moeda contra a qual o ERP cota. É deduzido do PRIMEIRO
   * lote e reusado nos demais, pela mesma razão que o leiaute é: é uma
   * propriedade do arquivo, não do lote, e reduzi-lo por lote faria a
   * normalização mudar de sentido no meio da importação.
   */
  let pivo: string | null = null;

  try {
    await db.$transaction(
      async (tx) => {
        const txDb = tx as unknown as PrismaClient;

        await leEmLotes(caminho, nomeArquivo, async (linhas) => {
          const r = processRows(linhas, nomeArquivo);
          const extraido = itensDe(r);

          if (!extraido) {
            // O primeiro lote é quem decide se o arquivo serve: se o leiaute
            // não for reconhecido ali, não adianta ler o resto.
            throw new ErroImportacao(
              r.errors[0] ?? "Leiaute do arquivo não reconhecido. Confira as colunas."
            );
          }

          if (kind === null) {
            kind = extraido.kind;
            await atualizaJob(db, jobId, { kind });
            // A primeira gravação limpa o que havia. Dentro da transação, então
            // quem estiver lendo continua vendo o dataset antigo até o commit.
            await clearRows(txDb, kind);
          } else if (extraido.kind !== kind) {
            throw new ErroImportacao(
              `O arquivo mistura leiautes (${kind} e ${extraido.kind}). Importe um tipo por arquivo.`
            );
          }

          lidas += linhas.length;
          ignoradas += r.skipped;
          for (const a of r.warnings) if (!avisos.includes(a) && avisos.length < 20) avisos.push(a);

          // Câmbio passa pela mesma normalização da ingestão por API: sentido
          // canônico (X → pivô) e recusa de taxa fora de faixa. Sem isso, um
          // par invertido no arquivo viraria relatório com valor milhares de
          // vezes maior, sem erro nenhum no caminho.
          if (extraido.kind === "cambio") {
            const cru = extraido.itens as LinhaCambio[];
            pivo ??= detectaPivo(cru);
            const { validas, problemas } = normaliza(cru, pivo ?? "");
            extraido.itens = validas;
            ignoradas += problemas.length;
            for (const p of problemas.slice(0, 5)) {
              const a = `Cotação recusada: ${p.motivo}`;
              if (!avisos.includes(a) && avisos.length < 20) avisos.push(a);
            }
          }

          if (extraido.itens.length > 0) {
            gravadas += await insertRows(txDb, extraido.kind, extraido.itens);
          }

          // Progresso fora da transação, e não a cada lote: são ~284 lotes num
          // arquivo de vendas, e um UPDATE por lote seria ruído no banco.
          if (Date.now() - ultimoAviso > 1_000) {
            ultimoAviso = Date.now();
            await atualizaJob(db, jobId, { lidas, gravadas, ignoradas });
          }
        });

        if (kind === null) {
          throw new ErroImportacao("Arquivo vazio — nenhuma linha para importar.");
        }

        await upsertMeta(txDb, {
          kind,
          filename: nomeArquivo,
          rowCount: gravadas,
          importedAt: new Date().toISOString(),
        });
      },
      // Um arquivo de 245 MB leva minutos. O padrão do Prisma (5 s) e até o
      // teto da fase D (3 min) são curtos demais para a carga inicial.
      { timeout: 60 * 60_000, maxWait: 60_000 }
    );
  } catch (err) {
    const msg = err instanceof ErroImportacao ? err.message : (err as Error).message;
    await atualizaJob(db, jobId, {
      status: "erro",
      erro: msg,
      lidas,
      gravadas: 0, // a transação voltou atrás: nada foi gravado
      ignoradas,
      avisos: JSON.stringify(avisos),
      concluidoEm: new Date(),
    });
    await unlink(caminho).catch(() => {});
    throw err;
  }

  // `cambio_diario` é derivada de `cambio`, e a reconstrução só pode vir DEPOIS
  // do commit: ela lê a tabela inteira e, de dentro da transação, enxergaria o
  // estado antigo. Fica fora do rollback de propósito — se ela falhar, o câmbio
  // novo já está gravado e basta reimportar o mesmo arquivo.
  if (kind === "cambio") {
    const cob = await reconstroiCambioDiario(db);
    avisos.push(
      `Cotações diárias reconstruídas: ${cob.linhas} linhas cobrindo ${cob.dias} dias ` +
        `(${cob.de} a ${cob.ate}), pivô ${cob.pivo}.`
    );
  }

  await atualizaJob(db, jobId, {
    status: "concluido",
    lidas,
    gravadas,
    ignoradas,
    avisos: JSON.stringify(avisos),
    concluidoEm: new Date(),
  });
  await unlink(caminho).catch(() => {});

  return { kind: kind!, gravadas, ignoradas, avisos, ms: Date.now() - inicio };
}
