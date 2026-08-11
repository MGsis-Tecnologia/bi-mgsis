/**
 * Peças compartilhadas pelas agregações de painel (dashboard, vendas, …).
 *
 * Tudo que é comum ao contrato de filtros e à montagem do SQL vive aqui, para
 * que cada tela migrada só descreva as suas próprias agregações.
 */

import type { PrismaClient } from "@prisma/client";

// ─── Contrato de filtros ─────────────────────────────────────────────────────

export interface AnalyticsFilters {
  /** YYYY-MM-DD, inclusivo. */
  from: string;
  to: string;
  /** Período de comparação (null quando não há, ex.: preset "todos"). */
  cmpFrom: string | null;
  cmpTo: string | null;
  /** "ALL" = todas as moedas convertidas · "1"|"2"|"3" = só aquela, sem conversão. */
  currency: string;
  /** currencyId → taxa. Usado só quando currency === "ALL". */
  rates: Record<string, number>;
  empresaId: string; // "all" | id exato
  channel: string; // "all" | nome
  sellerId: string; // "all" | id
  subgroupId: string; // "all" | id
}

// ─── Execução ────────────────────────────────────────────────────────────────

/** Só `<n>MB` — o valor vem do ambiente e entra no SQL como literal. */
export const WORK_MEM = (() => {
  const v = process.env.ANALYTICS_WORK_MEM?.trim();
  return v && /^\d{1,4}MB$/.test(v) ? v : "64MB";
})();

/**
 * Roda uma consulta de análise com `work_mem` elevado.
 *
 * O padrão do Postgres (4 MB) é dimensionado para transação, não para painel:
 * os `GROUP BY` destas telas passam disso e caem em ordenação externa, gravando
 * dezenas de MB em disco e perdendo a paralelização. Medido em /prospeccao com
 * 287 mil linhas: a agregação por produto cai de 1.240 ms para 615 ms, e o
 * resumo de 1.612 ms para 557 ms.
 *
 * `SET LOCAL` só vale até o fim da transação, e é por isso que a consulta
 * precisa vir dentro dela: sem `LOCAL`, o ajuste ficaria na conexão do pool e
 * vazaria para a próxima requisição, que pode ser uma importação.
 *
 * Uma transação por consulta (em vez de uma para todas) preserva o
 * `Promise.all` das telas — cada consulta segue numa conexão própria.
 */
export async function consultaAnalitica<T>(
  db: PrismaClient,
  sql: string,
  valores: unknown[] = []
): Promise<T[]> {
  return db.$transaction(
    async (tx) => {
      await tx.$executeRawUnsafe(`SET LOCAL work_mem = '${WORK_MEM}'`);
      return tx.$queryRawUnsafe<T[]>(sql, ...valores);
    },
    { timeout: 120_000, maxWait: 30_000 }
  );
}

// ─── Parâmetros ──────────────────────────────────────────────────────────────

/** Acumula parâmetros posicionais ($1, $2…) para não interpolar valor em SQL. */
export class Params {
  readonly values: unknown[] = [];
  add(v: unknown): string {
    this.values.push(v);
    return `$${this.values.length}`;
  }
}

// ─── Conversão de moeda ──────────────────────────────────────────────────────

/**
 * Em "ALL" cada linha é multiplicada pela taxa da sua moeda (o `?? 1` do código
 * antigo vira COALESCE); com moeda específica não há conversão, só filtro.
 */
export function joinTaxas(f: AnalyticsFilters, p: Params): string {
  if (f.currency !== "ALL") return "";
  const linhas = Object.entries(f.rates);
  if (linhas.length === 0) return "";
  const values = linhas
    .map(([cid, taxa]) => `(${p.add(cid)}::text, ${p.add(taxa)}::double precision)`)
    .join(", ");
  return `LEFT JOIN (VALUES ${values}) AS r(cid, taxa) ON r.cid = s.currency_id`;
}

export function exprTaxa(f: AnalyticsFilters): string {
  return f.currency === "ALL" ? "COALESCE(r.taxa, 1)" : "1";
}

// ─── Filtros → WHERE ─────────────────────────────────────────────────────────

/** Empresa e moeda: valem para qualquer escopo. `tipo` separa venda de devolução. */
export function whereBase(f: AnalyticsFilters, p: Params, tipo = "VENDA"): string {
  const cond = [`s.order_type = ${p.add(tipo)}`];
  if (f.empresaId !== "all") cond.push(`s.empresa_id = ${p.add(f.empresaId)}`);
  if (f.currency !== "ALL") cond.push(`s.currency_id = ${p.add(f.currency)}`);
  return cond.join(" AND ");
}

/**
 * Base + canal + vendedor + subgrupo.
 *
 * O subgrupo é um semi-join de propósito: no código antigo o pedido entra se
 * QUALQUER item dele for do subgrupo, e aí o pedido INTEIRO é somado
 * (`o.items.some(...)`). Filtrar linha a linha mudaria os totais.
 */
export function whereGraficos(f: AnalyticsFilters, p: Params, tipo = "VENDA"): string {
  const cond = [whereBase(f, p, tipo)];
  if (f.channel !== "all") cond.push(`lower(s.channel) = lower(${p.add(f.channel)})`);
  if (f.sellerId !== "all") cond.push(`s.seller_id = ${p.add(f.sellerId)}`);
  if (f.subgroupId !== "all") {
    cond.push(
      `EXISTS (SELECT 1 FROM sale_items x
               WHERE x.order_id = s.order_id AND x.subgroup_id = ${p.add(f.subgroupId)})`
    );
  }
  return cond.join(" AND ");
}

// ─── CTEs ────────────────────────────────────────────────────────────────────

export interface OpcoesLinhas {
  /** true = aplica canal/vendedor/subgrupo além de empresa/moeda. */
  escopoGraficos: boolean;
  /** "VENDA" (padrão) ou "DEVOLUCAO VENDA". */
  tipo?: string;
  /** Sobrescreve o período (usado no comparativo). */
  from?: string;
  to?: string;
}

/** Linhas do período, já convertidas — base de todas as agregações por item. */
export function cteLinhas(f: AnalyticsFilters, p: Params, o: OpcoesLinhas): string {
  const tipo = o.tipo ?? "VENDA";
  const where = o.escopoGraficos ? whereGraficos(f, p, tipo) : whereBase(f, p, tipo);
  const taxa = exprTaxa(f);
  return `
    SELECT s.order_id, s.date, s.client_id, s.client_name, s.client_city,
           s.seller_id, s.seller_name, s.channel, s.currency_id,
           s.product_id, s.product_name, s.subgroup_id, s.subgroup_name, s.quantity,
           s.total_orig    * ${taxa} AS total,
           s.cost_orig     * ${taxa} AS cost,
           s.discount_orig * ${taxa} AS discount
    FROM sale_items s
    ${joinTaxas(f, p)}
    WHERE ${where}
      AND s.date >= ${p.add(o.from ?? f.from)} AND s.date <= ${p.add(o.to ?? f.to)}`;
}

/**
 * Reduz as linhas a um registro por pedido, com hash aggregate.
 *
 * Existe por desempenho, e a diferença é grande: `COUNT(DISTINCT order_id)`
 * obriga o Postgres a ordenar as linhas todas. Medido em 12 meses (~340 mil
 * linhas), o mesmo KPI leva 2.985 ms com COUNT(DISTINCT) e 1.070 ms agregando
 * por pedido antes — quase 3×.
 *
 * É seguro porque cada `order_id` tem exatamente uma data, um cliente, um
 * vendedor, um canal e uma moeda (verificado nos 499.408 pedidos da base), então
 * `MIN(...)` devolve o valor único da coluna, não um valor arbitrário.
 */
export const CTE_PEDIDOS = `
  SELECT order_id,
         MIN(date)        AS date,
         MIN(client_id)   AS client_id,
         MIN(client_name) AS client_name,
         MIN(client_city) AS client_city,
         MIN(seller_id)   AS seller_id,
         MIN(seller_name) AS seller_name,
         MIN(channel)     AS channel,
         MIN(currency_id) AS currency_id,
         SUM(total)       AS total,
         SUM(cost)        AS cost,
         SUM(discount)    AS discount,
         SUM(quantity)    AS quantity
  FROM l GROUP BY order_id`;

/** `WITH l AS (linhas), pe AS (pedidos)` — prefixo das consultas por pedido. */
export function comPedidos(f: AnalyticsFilters, p: Params, o: OpcoesLinhas): string {
  return `WITH l AS (${cteLinhas(f, p, o)}), pe AS (${CTE_PEDIDOS})`;
}

// ─── Séries ──────────────────────────────────────────────────────────────────

export interface SeriePonto {
  key: string;
  revenue: number;
  cost: number;
  profit: number;
  discount: number;
  orders: number;
}

export const SERIE_SELECT = `
  COALESCE(SUM(total), 0)    AS revenue,
  COALESCE(SUM(cost), 0)     AS cost,
  COALESCE(SUM(discount), 0) AS discount,
  COUNT(*)::int              AS orders`;

export interface SerieRow {
  key: string;
  revenue: unknown;
  cost: unknown;
  discount: unknown;
  orders: number;
}

export function montaSerie(rows: SerieRow[]): SeriePonto[] {
  return rows.map((r) => {
    const revenue = Number(r.revenue);
    const cost = Number(r.cost);
    return {
      key: r.key,
      revenue,
      cost,
      profit: revenue - cost,
      discount: Number(r.discount),
      orders: r.orders,
    };
  });
}

// ─── Heatmap ─────────────────────────────────────────────────────────────────

/**
 * Espelha o heatmapByDayOfWeek: soma por PEDIDO, em semana de calendário dentro
 * do mês, alinhada pelo dia da semana em que o mês começou.
 */
export const HEATMAP_SELECT = `
  EXTRACT(DOW FROM date::date)::int AS weekday,
  LEAST(5, (EXTRACT(DAY FROM date::date)::int - 1
            + EXTRACT(DOW FROM date_trunc('month', date::date))::int) / 7)::int AS week,
  COALESCE(SUM(total), 0) AS value`;

export interface HeatmapCelula {
  weekday: number;
  week: number;
  value: number;
}
