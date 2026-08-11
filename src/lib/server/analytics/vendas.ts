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
 * Agregações da tela de Análise de Vendas.
 *
 * Diferença importante em relação ao painel executivo: aqui os KPIs usam o
 * escopo COMPLETO de filtros (canal, vendedor, subgrupo), porque a tela chama
 * `computeKpis(orders)` sobre a lista já filtrada — e não `ds.orders`, como o
 * dashboard faz. Os números seguem o comportamento de cada tela.
 */

export interface VendasKpis {
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
  ordersWithDiscount: number;
  pctOrdersWithDiscount: number;
}

export interface CidadeVenda {
  /** Texto cru de `client_city` — a normalização/geocodificação fica no cliente. */
  city: string;
  currencyId: string;
  totalSales: number;
  orderCount: number;
}

export interface PedidoRecente {
  id: string;
  clientName: string;
  sellerName: string;
  channel: string;
  items: number;
  total: number;
  marginPct: number;
  date: string;
}

export interface VendasData {
  kpi: VendasKpis;
  /** Devoluções no período (valor positivo; a tela exibe negativo). */
  totalReturns: number;
  monthly: SeriePonto[];
  daily: SeriePonto[];
  yearly: SeriePonto[];
  heatmap: HeatmapCelula[];
  channels: { key: string; label: string; value: number }[];
  cities: CidadeVenda[];
  recentOrders: PedidoRecente[];
  hasData: boolean;
}

interface KpiRow {
  revenue: unknown;
  cost: unknown;
  discount: unknown;
  items_sold: unknown;
  orders_count: number;
  unique_customers: number;
  orders_with_discount: number;
}

const KPI_SELECT = `
  COALESCE(SUM(total), 0)                          AS revenue,
  COALESCE(SUM(cost), 0)                           AS cost,
  COALESCE(SUM(discount), 0)                       AS discount,
  COALESCE(SUM(quantity), 0)                       AS items_sold,
  COUNT(*)::int                                    AS orders_count,
  COUNT(DISTINCT client_id)::int                   AS unique_customers,
  COUNT(*) FILTER (WHERE discount > 0)::int        AS orders_with_discount`;

function montaKpi(r: KpiRow | undefined): VendasKpis {
  const revenue = Number(r?.revenue ?? 0);
  const cost = Number(r?.cost ?? 0);
  const discount = Number(r?.discount ?? 0);
  const ordersCount = r?.orders_count ?? 0;
  const ordersWithDiscount = r?.orders_with_discount ?? 0;
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
    ordersWithDiscount,
    pctOrdersWithDiscount: ordersCount > 0 ? ordersWithDiscount / ordersCount : 0,
  };
}

export async function getVendasData(
  db: PrismaClient,
  f: AnalyticsFilters
): Promise<VendasData> {
  const escopo = { escopoGraficos: true } as const;

  const kpi = async (): Promise<VendasKpis> => {
    const p = new Params();
    const sql = `${comPedidos(f, p, escopo)} SELECT ${KPI_SELECT} FROM pe`;
    const [row] = await consultaAnalitica<KpiRow>(db, sql, p.values);
    return montaKpi(row);
  };

  // Devoluções são a mesma tabela com outro `order_type`; a tela só usa o total.
  const devolucoes = async (): Promise<number> => {
    const p = new Params();
    const sql = `${comPedidos(f, p, { escopoGraficos: true, tipo: "DEVOLUCAO VENDA" })}
                 SELECT COALESCE(SUM(total), 0) AS v FROM pe`;
    const [row] = await consultaAnalitica<{ v: unknown }>(db, sql, p.values);
    return Number(row?.v ?? 0);
  };

  const serie = async (expr: string): Promise<SeriePonto[]> => {
    const p = new Params();
    const sql = `${comPedidos(f, p, escopo)}
                 SELECT ${expr} AS key, ${SERIE_SELECT} FROM pe GROUP BY 1 ORDER BY 1`;
    return montaSerie(await consultaAnalitica<SerieRow>(db, sql, p.values));
  };

  const heatmap = async (): Promise<HeatmapCelula[]> => {
    const p = new Params();
    const sql = `${comPedidos(f, p, escopo)} SELECT ${HEATMAP_SELECT} FROM pe GROUP BY 1, 2 ORDER BY 1, 2`;
    const rows = await consultaAnalitica<{ weekday: number; week: number; value: unknown }>(db, sql, p.values);
    return rows.map((r) => ({ weekday: r.weekday, week: r.week, value: Number(r.value) }));
  };

  const canais = async () => {
    const p = new Params();
    const sql = `${comPedidos(f, p, escopo)}
                 SELECT channel AS key, COALESCE(SUM(total), 0) AS value
                 FROM pe GROUP BY 1 ORDER BY 2 DESC`;
    const rows = await consultaAnalitica<{ key: string; value: unknown }>(db, sql, p.values);
    return rows.map((r) => ({ key: r.key, label: r.key, value: Number(r.value) }));
  };

  /**
   * Agrega por cidade CRUA. A normalização de nome e a geocodificação continuam
   * no cliente (geo-sales.ts): é lógica de apresentação, com tabela de
   * coordenadas e heurística de país — reescrever aquilo em SQL seria trocar
   * código testado por uma tradução arriscada. Aqui o ganho já está feito: o
   * cliente passa a receber algumas centenas de cidades em vez de 1,4 milhão
   * de linhas. A moeda entra porque a heurística de país usa ela.
   */
  const cidades = async (): Promise<CidadeVenda[]> => {
    const p = new Params();
    const sql = `${comPedidos(f, p, escopo)}
      SELECT client_city AS city, currency_id,
             COALESCE(SUM(total), 0) AS total_sales, COUNT(*)::int AS order_count
      FROM pe WHERE client_city <> '' GROUP BY 1, 2 ORDER BY 1, 2`;
    const rows = await consultaAnalitica<
      { city: string; currency_id: string; total_sales: unknown; order_count: number }
    >(db, sql, p.values);
    return rows.map((r) => ({
      city: r.city,
      currencyId: r.currency_id,
      totalSales: Number(r.total_sales),
      orderCount: r.order_count,
    }));
  };

  // Últimos 12 pedidos — a tabela da tela. Ordenação por data, como no original.
  const recentes = async (): Promise<PedidoRecente[]> => {
    const p = new Params();
    const limite = p.add(12);
    const sql = `${comPedidos(f, p, escopo)}
      SELECT order_id AS id, client_name, seller_name, channel,
             quantity AS items, total, cost, date
      FROM pe ORDER BY date DESC, order_id DESC LIMIT ${limite}`;
    const rows = await consultaAnalitica<
      {
        id: string; client_name: string; seller_name: string; channel: string;
        items: unknown; total: unknown; cost: unknown; date: string;
      }
    >(db, sql, p.values);
    return rows.map((r) => {
      const total = Number(r.total);
      const cost = Number(r.cost);
      return {
        id: r.id,
        clientName: r.client_name,
        sellerName: r.seller_name,
        channel: r.channel,
        items: Number(r.items),
        total,
        marginPct: total > 0 ? (total - cost) / total : 0,
        date: r.date,
      };
    });
  };

  const temAlgumDado = async (): Promise<boolean> => {
    const [row] = await db.$queryRawUnsafe<{ existe: boolean }[]>(
      "SELECT EXISTS (SELECT 1 FROM sale_items WHERE order_type = 'VENDA') AS existe"
    );
    return row?.existe ?? false;
  };

  const [k, ret, monthly, daily, yearly, heat, channels, cities, recentOrders, hasData] =
    await Promise.all([
      kpi(),
      devolucoes(),
      serie("substring(date, 1, 7)"),
      serie("substring(date, 1, 10)"),
      serie("substring(date, 1, 4)"),
      heatmap(),
      canais(),
      cidades(),
      recentes(),
      temAlgumDado(),
    ]);

  return {
    kpi: k,
    totalReturns: ret,
    monthly,
    daily,
    yearly,
    heatmap: heat,
    channels,
    cities,
    recentOrders,
    hasData,
  };
}

export type { AnalyticsFilters };
