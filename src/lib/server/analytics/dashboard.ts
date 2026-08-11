import type { PrismaClient } from "@prisma/client";
import {
  HEATMAP_SELECT,
  Params,
  SERIE_SELECT,
  comPedidos,
  consultaAnalitica,
  montaSerie,
  type AnalyticsFilters,
  type HeatmapCelula,
  type SeriePonto,
  type SerieRow,
} from "./base";

/**
 * Agregações do painel executivo, feitas no Postgres.
 *
 * Substitui o caminho antigo (baixar todas as linhas para o navegador e somar
 * em JavaScript). O contrato de filtros é o de `base.ts`, traduzido para `WHERE`.
 *
 * As séries voltam ESPARSAS (só os períodos com movimento). Preencher os vazios
 * e formatar rótulos continua no cliente, reaproveitando eachMonthKey/eachDayKey:
 * é onde a formatação por locale já existe e está testada.
 */

export type DashboardFilters = AnalyticsFilters;

export interface Kpis {
  revenue: number;
  cost: number;
  profit: number;
  marginPct: number;
  ordersCount: number;
  averageTicket: number;
  uniqueCustomers: number;
  itemsSold: number;
  discount: number;
  discountPct: number;
}

export interface FatiaValor {
  key: string;
  label: string;
  value: number;
}

export interface ProdutoTop {
  id: string;
  name: string;
  revenue: number;
  units: number;
  share: number;
  cumulativeShare: number;
  curve: "A" | "B" | "C";
}

export interface VendedorTop {
  id: string;
  name: string;
  revenue: number;
  orders: number;
  averageTicket: number;
  marginPct: number;
  achievement: number;
}

export interface DashboardData {
  kpi: Kpis;
  previous: Kpis;
  monthly: SeriePonto[];
  daily: SeriePonto[];
  yearly: SeriePonto[];
  subgroups: FatiaValor[];
  channels: FatiaValor[];
  heatmap: HeatmapCelula[];
  topProducts: ProdutoTop[];
  topSellers: VendedorTop[];
  hasData: boolean;
}

interface KpiRow {
  revenue: unknown;
  cost: unknown;
  discount: unknown;
  items_sold: unknown;
  orders_count: number;
  unique_customers: number;
}

const KPI_SELECT = `
  COALESCE(SUM(total), 0)        AS revenue,
  COALESCE(SUM(cost), 0)         AS cost,
  COALESCE(SUM(discount), 0)     AS discount,
  COALESCE(SUM(quantity), 0)     AS items_sold,
  COUNT(*)::int                  AS orders_count,
  COUNT(DISTINCT client_id)::int AS unique_customers`;

function montaKpi(r: KpiRow | undefined): Kpis {
  const revenue = Number(r?.revenue ?? 0);
  const cost = Number(r?.cost ?? 0);
  const discount = Number(r?.discount ?? 0);
  const ordersCount = r?.orders_count ?? 0;
  const profit = revenue - cost;
  return {
    revenue,
    cost,
    profit,
    marginPct: revenue > 0 ? profit / revenue : 0,
    ordersCount,
    averageTicket: ordersCount > 0 ? revenue / ordersCount : 0,
    uniqueCustomers: r?.unique_customers ?? 0,
    itemsSold: Number(r?.items_sold ?? 0),
    discount,
    discountPct: revenue + discount > 0 ? discount / (revenue + discount) : 0,
  };
}

export async function getDashboardData(
  db: PrismaClient,
  f: AnalyticsFilters
): Promise<DashboardData> {
  // ATENÇÃO ao escopo: os cartões de KPI usam apenas empresa/moeda, sem canal,
  // vendedor e subgrupo. É o comportamento da tela hoje — ela chama
  // `computeKpisWithComparison(ds.orders, ...)`, e não a lista filtrada. Está
  // replicado assim de propósito, para os números não mudarem na migração.
  const SEM_FILTROS_DE_GRAFICO = { escopoGraficos: false } as const;
  const COM_FILTROS_DE_GRAFICO = { escopoGraficos: true } as const;

  const kpiAtual = async (): Promise<Kpis> => {
    const p = new Params();
    const sql = `${comPedidos(f, p, SEM_FILTROS_DE_GRAFICO)} SELECT ${KPI_SELECT} FROM pe`;
    const [row] = await consultaAnalitica<KpiRow>(db, sql, p.values);
    return montaKpi(row);
  };

  const kpiAnterior = async (): Promise<Kpis> => {
    if (!f.cmpFrom || !f.cmpTo) return montaKpi(undefined);
    const p = new Params();
    const sql = `${comPedidos(f, p, {
      escopoGraficos: false,
      from: f.cmpFrom,
      to: f.cmpTo,
    })} SELECT ${KPI_SELECT} FROM pe`;
    const [row] = await consultaAnalitica<KpiRow>(db, sql, p.values);
    return montaKpi(row);
  };

  const serieAgrupada = async (expr: string): Promise<SeriePonto[]> => {
    const p = new Params();
    const sql = `${comPedidos(f, p, COM_FILTROS_DE_GRAFICO)}
                 SELECT ${expr} AS key, ${SERIE_SELECT} FROM pe GROUP BY 1 ORDER BY 1`;
    return montaSerie(await consultaAnalitica<SerieRow>(db, sql, p.values));
  };

  /**
   * `origem` decide o nível: subgrupo é somado por ITEM (`l`), porque um pedido
   * pode ter itens de subgrupos diferentes; canal é atributo do pedido (`pe`).
   * É a mesma distinção que o código antigo fazia entre `o.items` e `o`.
   */
  const fatias = async (
    origem: "l" | "pe",
    idCol: string,
    labelCol: string
  ): Promise<FatiaValor[]> => {
    const p = new Params();
    const sql = `${comPedidos(f, p, COM_FILTROS_DE_GRAFICO)}
                 SELECT ${idCol} AS key, MIN(${labelCol}) AS label,
                        COALESCE(SUM(total), 0) AS value
                 FROM ${origem} GROUP BY 1 ORDER BY 3 DESC`;
    const rows = await consultaAnalitica<{ key: string; label: string; value: unknown }>(db, sql, p.values);
    return rows.map((r) => ({ key: r.key, label: r.label, value: Number(r.value) }));
  };

  const heatmap = async (): Promise<HeatmapCelula[]> => {
    const p = new Params();
    const sql = `${comPedidos(f, p, COM_FILTROS_DE_GRAFICO)}
                 SELECT ${HEATMAP_SELECT} FROM pe GROUP BY 1, 2 ORDER BY 1, 2`;
    const rows = await consultaAnalitica<{ weekday: number; week: number; value: unknown }>(db, sql, p.values);
    return rows.map((r) => ({ weekday: r.weekday, week: r.week, value: Number(r.value) }));
  };

  // ABC de produtos: a curva depende da participação acumulada sobre TODOS os
  // produtos, então a classificação é feita no banco com window function e só
  // depois os primeiros são recortados. Nível de ITEM.
  const topProducts = async (): Promise<ProdutoTop[]> => {
    const p = new Params();
    const prefixo = comPedidos(f, p, COM_FILTROS_DE_GRAFICO);
    const limite = p.add(12);
    const sql = `${prefixo},
      agg AS (
        SELECT product_id AS id, MIN(product_name) AS name,
               SUM(total) AS revenue, SUM(quantity) AS units
        FROM l GROUP BY product_id
      ),
      tot AS (SELECT NULLIF(SUM(revenue), 0) AS total FROM agg),
      acc AS (
        SELECT a.*,
               a.revenue / t.total AS share,
               SUM(a.revenue) OVER (ORDER BY a.revenue DESC, a.id) / t.total AS cum
        FROM agg a CROSS JOIN tot t WHERE t.total IS NOT NULL
      )
      SELECT id, name, revenue, units, share, cum,
             CASE WHEN cum <= 0.8 THEN 'A' WHEN cum <= 0.95 THEN 'B' ELSE 'C' END AS curve
      FROM acc ORDER BY revenue DESC LIMIT ${limite}`;
    const rows = await consultaAnalitica<
      {
        id: string; name: string; revenue: unknown; units: unknown;
        share: unknown; cum: unknown; curve: string;
      }
    >(db, sql, p.values);
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      revenue: Number(r.revenue),
      units: Number(r.units),
      share: Number(r.share),
      cumulativeShare: Number(r.cum),
      curve: r.curve as "A" | "B" | "C",
    }));
  };

  // Nível de pedido: o vendedor é atributo do pedido, e contar linhas em vez de
  // pedidos daria um "nº de pedidos" inflado.
  const topSellers = async (): Promise<VendedorTop[]> => {
    const p = new Params();
    const prefixo = comPedidos(f, p, COM_FILTROS_DE_GRAFICO);
    const limite = p.add(12);
    const sql = `${prefixo},
      agg AS (
        SELECT seller_id AS id, MIN(seller_name) AS name,
               SUM(total) AS revenue, SUM(cost) AS cost, COUNT(*)::int AS orders
        FROM pe GROUP BY seller_id
      )
      SELECT id, name, revenue, cost, orders,
             revenue / NULLIF(MAX(revenue) OVER (), 0) AS achievement
      FROM agg ORDER BY revenue DESC LIMIT ${limite}`;
    const rows = await consultaAnalitica<
      {
        id: string; name: string; revenue: unknown; cost: unknown;
        orders: number; achievement: unknown;
      }
    >(db, sql, p.values);
    return rows.map((r) => {
      const revenue = Number(r.revenue);
      const cost = Number(r.cost);
      return {
        id: r.id,
        name: r.name,
        revenue,
        orders: r.orders,
        averageTicket: r.orders > 0 ? revenue / r.orders : 0,
        marginPct: revenue > 0 ? (revenue - cost) / revenue : 0,
        achievement: Number(r.achievement ?? 0),
      };
    });
  };

  // "Tem dado?" é sobre a EMPRESA ter vendas, não sobre o período filtrado ter.
  // A tela usa isso para decidir entre o painel e o convite a importar dados —
  // e um mês sem movimento precisa mostrar o painel zerado, não sugerir que o
  // banco está vazio.
  const temAlgumDado = async (): Promise<boolean> => {
    const [row] = await db.$queryRawUnsafe<{ existe: boolean }[]>(
      "SELECT EXISTS (SELECT 1 FROM sale_items WHERE order_type = 'VENDA') AS existe"
    );
    return row?.existe ?? false;
  };

  const [kpi, previous, monthly, daily, yearly, subgroups, channels, heat, produtos, vendedores, hasData] =
    await Promise.all([
      kpiAtual(),
      kpiAnterior(),
      serieAgrupada("substring(date, 1, 7)"),
      serieAgrupada("substring(date, 1, 10)"),
      serieAgrupada("substring(date, 1, 4)"),
      fatias("l", "subgroup_id", "subgroup_name"),
      fatias("pe", "channel", "channel"),
      heatmap(),
      topProducts(),
      topSellers(),
      temAlgumDado(),
    ]);

  return {
    kpi,
    previous,
    monthly,
    daily,
    yearly,
    subgroups,
    channels,
    heatmap: heat,
    topProducts: produtos,
    topSellers: vendedores,
    hasData,
  };
}
