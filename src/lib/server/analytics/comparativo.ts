import type { PrismaClient } from "@prisma/client";
import { Params, consultaAnalitica, cteLinhas, whereBase, type AnalyticsFilters } from "./base";

/**
 * Agregações do Comparativo Anual.
 *
 * Duas diferenças em relação às outras telas:
 *
 *  - **Não há filtro de período.** A comparação é ano a ano sobre todo o
 *    histórico; o seletor de datas não se aplica.
 *  - **Escopo BASE de filtros** (só empresa e moeda), porque a tela consome
 *    `ds.orders` e não a lista filtrada.
 *
 * A projeção do ano corrente NÃO é calculada aqui: ela depende de "hoje" e
 * continua no cliente, com `computeProjection`. Por isso a série mensal de cada
 * item vai junto — são 15 itens × ~55 meses, alguns kB, e evita uma segunda
 * viagem ao servidor quando o usuário seleciona um item.
 */

export type Dimensao = "vendedores" | "subgrupos" | "canais" | "clientes" | "produtos";

interface Config {
  key: string;
  label: string;
}

/**
 * Espelha os `keyFn`/`labelFn` do código antigo. Atenção ao subgrupo: ele é
 * chaveado pelo NOME, não pelo id — subgrupos homônimos se fundem, e mudar isso
 * alteraria os números.
 *
 * Todas as dimensões agregam por ITEM, inclusive vendedor, canal e cliente, que
 * no código antigo somavam o total do PEDIDO. Dá no mesmo, porque cada pedido
 * tem um único vendedor, canal e cliente (verificado nos 499.408 pedidos), e
 * evita o GROUP BY por pedido — que aqui, sem filtro de data, custa caro: a
 * série mensal medida caiu de 7.283 ms para 1.401 ms, com resultado idêntico.
 */
const DIMENSOES: Record<Dimensao, Config> = {
  vendedores: { key: "seller_id", label: "seller_name" },
  canais: { key: "channel", label: "channel" },
  clientes: { key: "client_id", label: "client_name" },
  subgrupos: { key: "subgroup_name", label: "subgroup_name" },
  produtos: { key: "product_id", label: "product_name" },
};

/** Mesma constante do código antigo (`topN` em yearly.ts). */
const TOP_N = 15;

export interface LinhaAnual {
  key: string;
  label: string;
  byYear: Record<string, number>;
  /** "YYYY-MM" → receita. Usado pela projeção, no cliente. */
  byMonth: Record<string, number>;
  total: number;
  growth: number | null;
}

export interface ComparativoData {
  years: string[];
  rows: LinhaAnual[];
  hasData: boolean;
}

// Todo o histórico: a tela não tem filtro de período.
const PERIODO_TOTAL = { from: "0000-01-01", to: "9999-12-31" } as const;

export async function getComparativoData(
  db: PrismaClient,
  f: AnalyticsFilters,
  dimensao: Dimensao
): Promise<ComparativoData> {
  const cfg = DIMENSOES[dimensao];
  const opcoes = { escopoGraficos: false, ...PERIODO_TOTAL } as const;

  /** Os TOP_N itens por receita total, e os anos presentes na base. */
  const topEAnos = async () => {
    const pTop = new Params();
    const sqlTop = `WITH l AS (${cteLinhas(f, pTop, opcoes)})
      SELECT ${cfg.key} AS key, MIN(${cfg.label}) AS label, SUM(total) AS total
      FROM l GROUP BY 1 ORDER BY 3 DESC LIMIT ${pTop.add(TOP_N)}`;

    // Os anos saem direto da tabela: não há valor a converter, e passar pela
    // CTE de conversão custava 3.377 ms contra 1.197 ms medidos.
    const pAnos = new Params();
    const sqlAnos = `SELECT DISTINCT substring(s.date, 1, 4) AS y
                     FROM sale_items s WHERE ${whereBase(f, pAnos)} ORDER BY 1`;

    const [top, anos] = await Promise.all([
      consultaAnalitica<{ key: string; label: string; total: unknown }>(db, sqlTop, pTop.values),
      consultaAnalitica<{ y: string }>(db, sqlAnos, pAnos.values),
    ]);
    return { top, anos: anos.map((a) => a.y) };
  };

  const { top, anos } = await topEAnos();

  if (top.length === 0) {
    const [row] = await db.$queryRawUnsafe<{ existe: boolean }[]>(
      "SELECT EXISTS (SELECT 1 FROM sale_items WHERE order_type = 'VENDA') AS existe"
    );
    return { years: anos, rows: [], hasData: row?.existe ?? false };
  }

  /**
   * Série mensal só dos itens do topo. O ano sai do mês (`substring`), então
   * uma agregação atende tanto a tabela por ano quanto a projeção.
   */
  const porMes = async () => {
    const p = new Params();
    const linhas = cteLinhas(f, p, opcoes);
    const chaves = top.map((t) => p.add(t.key)).join(", ");
    const sql = `WITH l AS (${linhas})
      SELECT ${cfg.key} AS key, substring(date, 1, 7) AS mes, SUM(total) AS v
      FROM l WHERE ${cfg.key} IN (${chaves})
      GROUP BY 1, 2`;
    return consultaAnalitica<{ key: string; mes: string; v: unknown }>(db, sql, p.values);
  };

  const meses = await porMes();

  const porChave = new Map<string, { byMonth: Record<string, number>; byYear: Record<string, number> }>();
  for (const t of top) porChave.set(t.key, { byMonth: {}, byYear: {} });
  for (const m of meses) {
    const alvo = porChave.get(m.key);
    if (!alvo) continue;
    const v = Number(m.v);
    alvo.byMonth[m.mes] = (alvo.byMonth[m.mes] ?? 0) + v;
    const ano = m.mes.slice(0, 4);
    alvo.byYear[ano] = (alvo.byYear[ano] ?? 0) + v;
  }

  const ultimo = anos[anos.length - 1];
  const penultimo = anos[anos.length - 2];

  const rows: LinhaAnual[] = top.map((t) => {
    const dados = porChave.get(t.key)!;
    // Crescimento entre os dois últimos anos da BASE, não do item — igual ao
    // buildYearlyResult original.
    let growth: number | null = null;
    if (anos.length >= 2) {
      const last = dados.byYear[ultimo!] ?? 0;
      const prev = dados.byYear[penultimo!] ?? 0;
      growth = prev > 0 ? (last - prev) / prev : null;
    }
    return {
      key: t.key,
      label: t.label,
      byYear: dados.byYear,
      byMonth: dados.byMonth,
      total: Number(t.total),
      growth,
    };
  });

  return { years: anos, rows, hasData: true };
}
