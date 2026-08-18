import type { PrismaClient } from "@prisma/client";

/**
 * Câmbio médio mensal: da magnitude do ERP para fatores multiplicativos.
 *
 * ## O problema que este arquivo resolve
 *
 * O ERP guarda UMA linha por par e mês, com um número que é uma MAGNITUDE:
 * `(moeda_origem=3, moeda_destino=2, 7350)` quer dizer "1 dólar custa 7.350
 * guaranis". Converter com ele exige saber a direção — multiplica indo
 * US$ → G$, divide indo G$ → US$.
 *
 * Deixar essa decisão para o tempo da consulta é convite a erro: são 15 telas
 * e dezenas de agregações, e quem escrever a próxima precisa lembrar da regra.
 * Um `divide` esquecido não gera erro nenhum, só um relatório 54 milhões de
 * vezes errado.
 *
 * Então a decisão é tomada UMA vez, aqui: cada linha do ERP vira duas na
 * `cambio_mensal` — o sentido direto e o inverso (1/taxa) — e da consulta em
 * diante é sempre `valor * taxa`.
 *
 * ## O que a tabela final contém, por mês
 *
 *   X → X   = 1            (identidade, para a moeda de exibição igual à da linha)
 *   F → L   = taxa         (estrangeira para local: o número do ERP)
 *   L → F   = 1/taxa       (local para estrangeira)
 *   F1 → F2 = t1 / t2      (cruzado, derivado pelo local — nunca contradiz os
 *                           dois caminhos, porque sai do mesmo lugar)
 *
 * Mês sem cotação de um par recebe a do mês MAIS PRÓXIMO daquele par, marcado
 * com `derivada = true`. Sem isso, um mês vazio faria a conversão cair no
 * `COALESCE(taxa, 1)` e somar dólar como se fosse guarani.
 */

export interface LinhaCambioMensal {
  /** 'YYYY-MM'. */
  competencia: string;
  /** Moeda em que o preço está expresso — a local, na prática. */
  moedaOrigem: string;
  /** Moeda cotada — a estrangeira, na prática. */
  moedaDestino: string;
  /** Quantas unidades de `moedaOrigem` valem 1 de `moedaDestino`. */
  taxa: number;
}

export interface ProblemaCambio {
  indice: number;
  motivo: string;
}

/**
 * Faixa aceitável por par, na leitura "quantas unidades de A por 1 de B".
 *
 * Existe porque G$ e US$ diferem em ~4 zeros: um par ao contrário não gera erro
 * no banco, só um relatório milhares de vezes maior ou menor. Os limites são
 * folgados de propósito — barram inversão e erro de escala, não oscilação.
 */
const FAIXAS: Record<string, [number, number]> = {
  "3>2": [1_000, 50_000], // guaranis por 1 dólar
  "3>1": [200, 10_000], // guaranis por 1 real
  "1>2": [0.5, 50], // reais por 1 dólar
  // Os mesmos ao contrário, para a inversão ser recusada em vez de aceita.
  "2>3": [0.00002, 0.001],
  "1>3": [0.0001, 0.005],
  "2>1": [0.02, 2],
};

function foraDaFaixa(l: LinhaCambioMensal): string | null {
  const faixa = FAIXAS[`${l.moedaOrigem}>${l.moedaDestino}`];
  if (!faixa || (l.taxa >= faixa[0] && l.taxa <= faixa[1])) return null;
  return (
    `câmbio ${l.taxa} fora da faixa esperada para ${l.moedaOrigem}→${l.moedaDestino} ` +
    `(${faixa[0]}–${faixa[1]}) — par ao contrário ou erro de escala`
  );
}

/** Descarta o que não dá para usar e explica cada recusa. */
export function valida(linhas: LinhaCambioMensal[]): {
  validas: LinhaCambioMensal[];
  problemas: ProblemaCambio[];
} {
  const validas: LinhaCambioMensal[] = [];
  const problemas: ProblemaCambio[] = [];
  const vistas = new Set<string>();

  for (let i = 0; i < linhas.length; i++) {
    const l = linhas[i]!;

    if (!/^\d{4}-\d{2}$/.test(l.competencia)) {
      problemas.push({ indice: i, motivo: `competência inválida: "${l.competencia}"` });
      continue;
    }
    if (!(l.taxa > 0) || !Number.isFinite(l.taxa)) {
      problemas.push({ indice: i, motivo: `câmbio inválido: ${l.taxa}` });
      continue;
    }
    if (l.moedaOrigem === l.moedaDestino) {
      problemas.push({ indice: i, motivo: `origem e destino iguais (${l.moedaOrigem})` });
      continue;
    }
    const fora = foraDaFaixa(l);
    if (fora) {
      problemas.push({ indice: i, motivo: fora });
      continue;
    }
    // A view já agrupa por (par, mês); repetição aqui é sinal de envio duplicado.
    const chave = `${l.competencia}|${l.moedaOrigem}|${l.moedaDestino}`;
    if (vistas.has(chave)) continue;
    vistas.add(chave);
    validas.push(l);
  }

  return { validas, problemas };
}

export interface CoberturaCambio {
  meses: number;
  linhas: number;
  derivadas: number;
  de: string;
  ate: string;
  moedas: string[];
  ms: number;
}

/**
 * Reescreve `cambio_mensal` inteira a partir das linhas recebidas.
 *
 * Força bruta de propósito: são algumas centenas de linhas, e reescrever tudo é
 * mais simples — e mais fácil de conferir — do que atualizar incrementalmente.
 *
 * Tudo numa transação: enquanto ela não commita, as telas continuam convertendo
 * pela tabela antiga inteira, nunca por meia tabela.
 */
export async function reconstroiCambioMensal(
  db: PrismaClient,
  linhas: LinhaCambioMensal[]
): Promise<CoberturaCambio> {
  const inicio = Date.now();

  // Cada linha do ERP dá o par nos dois sentidos. `local` é a moeda em que o
  // preço está expresso (a origem, no vocabulário da view).
  const locais = new Set<string>();
  const estrangeiras = new Set<string>();
  const competencias = new Set<string>();
  for (const l of linhas) {
    locais.add(l.moedaOrigem);
    estrangeiras.add(l.moedaDestino);
    competencias.add(l.competencia);
  }

  const resultado = await db.$transaction(
    async (tx) => {
      await tx.$executeRawUnsafe(`DELETE FROM cambio_mensal`);
      if (linhas.length === 0) return { linhas: 0, derivadas: 0 };

      // A tabela temporária evita um INSERT gigante com milhares de parâmetros
      // e deixa o preenchimento dos buracos ser feito em SQL, que é onde a
      // busca pelo mês mais próximo fica legível.
      await tx.$executeRawUnsafe(`
        CREATE TEMP TABLE recebido (
          competencia text, moeda_origem text, moeda_destino text, taxa double precision
        ) ON COMMIT DROP`);

      const valores: unknown[] = [];
      const tuplas = linhas.map((l, i) => {
        valores.push(l.competencia, l.moedaOrigem, l.moedaDestino, l.taxa);
        const b = i * 4;
        return `($${b + 1}, $${b + 2}, $${b + 3}, $${b + 4}::double precision)`;
      });
      await tx.$executeRawUnsafe(
        `INSERT INTO recebido VALUES ${tuplas.join(", ")}`,
        ...valores
      );

      // ── Preenchimento e derivação, tudo num comando ──────────────────────
      //
      // `grade` = todo mês coberto × todo par que o ERP manda. `mais_proximo`
      // resolve o buraco: para cada célula sem cotação, a do mês mais próximo
      // daquele par, empate ficando com o passado — usar cotação futura para
      // um mês passado é o menos defensável dos dois.
      const inseridas = await tx.$executeRawUnsafe(`
        WITH meses AS (
          SELECT DISTINCT competencia FROM recebido
        ),
        pares AS (
          SELECT DISTINCT moeda_origem, moeda_destino FROM recebido
        ),
        grade AS (
          SELECT m.competencia, p.moeda_origem, p.moeda_destino
          FROM meses m CROSS JOIN pares p
        ),
        preenchido AS (
          SELECT g.competencia, g.moeda_origem, g.moeda_destino,
                 COALESCE(r.taxa, v.taxa) AS taxa,
                 (r.taxa IS NULL) AS derivada
          FROM grade g
          LEFT JOIN recebido r
                 ON r.competencia = g.competencia
                AND r.moeda_origem = g.moeda_origem
                AND r.moeda_destino = g.moeda_destino
          LEFT JOIN LATERAL (
            SELECT x.taxa
            FROM recebido x
            WHERE x.moeda_origem = g.moeda_origem
              AND x.moeda_destino = g.moeda_destino
            ORDER BY
              -- distância em meses, com o passado ganhando o empate
              abs((substring(x.competencia,1,4)::int * 12 + substring(x.competencia,6,2)::int)
                - (substring(g.competencia,1,4)::int * 12 + substring(g.competencia,6,2)::int)),
              x.competencia DESC
            LIMIT 1
          ) v ON true
        ),
        -- Do jeito que o ERP manda: "taxa unidades de origem por 1 de destino".
        -- Vira fator multiplicativo do sentido ESTRANGEIRA → LOCAL.
        direto AS (
          SELECT competencia, moeda_destino AS origem, moeda_origem AS destino,
                 taxa, derivada
          FROM preenchido WHERE taxa IS NOT NULL AND taxa > 0
        ),
        inverso AS (
          SELECT competencia, destino AS origem, origem AS destino,
                 1 / taxa AS taxa, true AS derivada
          FROM direto
        ),
        cruzado AS (
          SELECT a.competencia, a.origem, b.origem AS destino,
                 a.taxa / b.taxa AS taxa, true AS derivada
          FROM direto a
          JOIN direto b ON b.competencia = a.competencia AND b.destino = a.destino
          WHERE a.origem <> b.origem
        ),
        identidade AS (
          SELECT competencia, origem, origem AS destino, 1::double precision AS taxa, true AS derivada
          FROM direto
          UNION
          SELECT competencia, destino, destino, 1::double precision, true FROM direto
        ),
        tudo AS (
          SELECT * FROM direto
          UNION ALL SELECT * FROM inverso
          UNION ALL SELECT * FROM cruzado
          UNION ALL SELECT * FROM identidade
        )
        INSERT INTO cambio_mensal (competencia, moeda_origem, moeda_destino, taxa, derivada)
        SELECT competencia, origem, destino,
               -- Se o mesmo sentido vier por dois caminhos, o não-derivado vence.
               (array_agg(taxa ORDER BY derivada))[1],
               bool_and(derivada)
        FROM tudo
        GROUP BY competencia, origem, destino`);

      const [d] = await tx.$queryRawUnsafe<{ n: number }[]>(
        `SELECT COUNT(*)::int AS n FROM cambio_mensal WHERE derivada`
      );
      return { linhas: inseridas, derivadas: Number(d?.n ?? 0) };
    },
    { timeout: 120_000, maxWait: 30_000 }
  );

  const [cob] = await db.$queryRawUnsafe<{
    meses: number; de: string | null; ate: string | null;
  }[]>(
    `SELECT COUNT(DISTINCT competencia)::int AS meses,
            MIN(competencia) AS de, MAX(competencia) AS ate FROM cambio_mensal`
  );

  return {
    meses: Number(cob?.meses ?? 0),
    linhas: resultado.linhas,
    derivadas: resultado.derivadas,
    de: cob?.de ?? "",
    ate: cob?.ate ?? "",
    moedas: [...new Set([...locais, ...estrangeiras])].sort(),
    ms: Date.now() - inicio,
  };
}
