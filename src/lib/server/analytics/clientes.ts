import type { PrismaClient } from "@prisma/client";
import { Params, comPedidos, consultaAnalitica, type AnalyticsFilters } from "./base";

/**
 * Agregações da tela de Clientes.
 *
 * Nível de PEDIDO (`pe`): tudo aqui conta pedidos e soma o total do pedido.
 * Escopo COMPLETO de filtros, porque a tela usa `useFilteredOrders()`.
 *
 * A segmentação RFM depende de "hoje" — no código antigo, `Date.now()` do
 * navegador. Por isso a data vem do cliente como parâmetro (`hoje`), em vez de
 * `CURRENT_DATE`: o servidor pode estar em outro fuso, e um cliente mudaria de
 * "em risco" para "fiel" dependendo da hora em que a página fosse aberta.
 */

export type Segmento = "vip" | "fiel" | "promissor" | "novo" | "em-risco" | "inativo";

export interface ClienteMetrica {
  id: string;
  name: string;
  orders: number;
  revenue: number;
  averageTicket: number;
  /** null quando o cliente não comprou no período. */
  lastPurchaseDate: string | null;
  recencyDays: number;
  ltv: number;
  segment: Segmento;
  share: number;
  cumulativeShare: number;
  curve: "A" | "B" | "C";
}

export interface ClienteLucro {
  clientId: string;
  clientName: string;
  orders: number;
  revenue: number;
  cost: number;
  profit: number;
  marginPct: number;
  avgTicket: number;
}

export interface ClientesData {
  /** Top 18 por receita, já classificados — o gráfico usa os 10 primeiros. */
  topClients: ClienteMetrica[];
  /** Contagem por segmento sobre TODOS os clientes, incluindo os inativos. */
  segments: Record<string, number>;
  activeCustomers: number;
  totalRevenue: number;
  avgLTV: number;
  churnRisk: number;
  /** Clientes distintos em todo o histórico — base do bucket "inativo". */
  totalClients: number;
  profitRanking: ClienteLucro[];
  profitTotals: { orders: number; revenue: number; cost: number; profit: number; count: number };
  hasData: boolean;
}

/**
 * Espelha `computeSegment` de customers.ts, na mesma ordem de precedência.
 * Clientes sem pedido no período não entram aqui — são "inativo" por ausência.
 */
const SEGMENTO_SQL = `
  CASE
    WHEN recency_days > 90                     THEN 'em-risco'
    WHEN orders = 1                            THEN 'novo'
    WHEN revenue >= max_revenue * 0.6          THEN 'vip'
    WHEN orders >= 5                           THEN 'fiel'
    ELSE 'promissor'
  END`;

export async function getClientesData(
  db: PrismaClient,
  f: AnalyticsFilters,
  hoje: string
): Promise<ClientesData> {
  const escopo = { escopoGraficos: true } as const;

  /**
   * Uma consulta monta tudo o que depende do agregado por cliente: o recorte
   * exibido, as contagens por segmento e os totais. Evita repetir o mesmo
   * GROUP BY em quatro consultas.
   */
  const porCliente = async () => {
    const p = new Params();
    const prefixo = comPedidos(f, p, escopo);
    const dia = p.add(hoje);
    const limite = p.add(18);
    const sql = `${prefixo},
      agg AS (
        SELECT client_id AS id, MIN(client_name) AS name,
               COUNT(*)::int AS orders,
               SUM(total) AS revenue, SUM(cost) AS cost,
               MAX(date) AS last_date
        FROM pe GROUP BY client_id
      ),
      mx AS (SELECT COALESCE(MAX(revenue), 0) AS max_revenue,
                    NULLIF(SUM(revenue), 0) AS total_revenue,
                    COUNT(*)::int AS ativos,
                    COALESCE(SUM(revenue), 0) AS soma_receita,
                    COALESCE(SUM(cost), 0) AS soma_custo,
                    COALESCE(SUM(orders), 0)::int AS soma_pedidos
             FROM agg),
      com_segmento AS (
        SELECT a.*, m.max_revenue, m.total_revenue,
               (${dia}::date - a.last_date::date) AS recency_days
        FROM agg a CROSS JOIN mx m
      ),
      classificado AS (
        SELECT c.*, ${SEGMENTO_SQL} AS segment,
               COALESCE(c.revenue / c.total_revenue, 0) AS share,
               COALESCE(SUM(c.revenue) OVER (ORDER BY c.revenue DESC, c.id) / c.total_revenue, 0) AS cum
        FROM com_segmento c
      ),
      resumo AS (
        SELECT (SELECT ativos FROM mx)        AS ativos,
               (SELECT soma_receita FROM mx)  AS receita,
               (SELECT soma_custo FROM mx)    AS custo,
               (SELECT soma_pedidos FROM mx)  AS pedidos,
               COUNT(*) FILTER (WHERE segment = 'vip')::int       AS vip,
               COUNT(*) FILTER (WHERE segment = 'fiel')::int      AS fiel,
               COUNT(*) FILTER (WHERE segment = 'promissor')::int AS promissor,
               COUNT(*) FILTER (WHERE segment = 'novo')::int      AS novo,
               COUNT(*) FILTER (WHERE segment = 'em-risco')::int  AS em_risco
        FROM classificado
      ),
      topo AS (
        SELECT * FROM classificado ORDER BY revenue DESC, id LIMIT ${limite}
      )
      SELECT (SELECT row_to_json(r) FROM resumo r) AS resumo,
             (SELECT COALESCE(json_agg(x), '[]'::json) FROM (
                SELECT id, name, orders, revenue, cost, last_date, recency_days,
                       segment, share, cum,
                       CASE WHEN cum <= 0.8 THEN 'A' WHEN cum <= 0.95 THEN 'B' ELSE 'C' END AS curve
                FROM topo ORDER BY revenue DESC, id
              ) x) AS topo`;
    const [row] = await consultaAnalitica<{ resumo: Record<string, unknown>; topo: unknown[] }>(db, sql, p.values);
    const resumo = (row?.resumo ?? {}) as Record<string, number>;
    const topo = (row?.topo ?? []) as {
      id: string; name: string; orders: number; revenue: unknown; cost: unknown;
      last_date: string; recency_days: number; segment: string;
      share: unknown; cum: unknown; curve: string;
    }[];
    return {
      topClients: topo.map((r) => {
        const revenue = Number(r.revenue);
        return {
          id: r.id,
          name: r.name,
          orders: r.orders,
          revenue,
          averageTicket: r.orders > 0 ? revenue / r.orders : 0,
          lastPurchaseDate: r.last_date || null,
          recencyDays: r.recency_days,
          ltv: revenue,
          segment: r.segment as Segmento,
          share: Number(r.share),
          cumulativeShare: Number(r.cum),
          curve: r.curve as "A" | "B" | "C",
        };
      }),
      ativos: Number(resumo.ativos ?? 0),
      receita: Number(resumo.receita ?? 0),
      custo: Number(resumo.custo ?? 0),
      pedidos: Number(resumo.pedidos ?? 0),
      segmentos: {
        vip: Number(resumo.vip ?? 0),
        fiel: Number(resumo.fiel ?? 0),
        promissor: Number(resumo.promissor ?? 0),
        novo: Number(resumo.novo ?? 0),
        "em-risco": Number(resumo.em_risco ?? 0),
      } as Record<string, number>,
    };
  };

  const lucro = async (): Promise<ClienteLucro[]> => {
    const p = new Params();
    const prefixo = comPedidos(f, p, escopo);
    const limite = p.add(25);
    const sql = `${prefixo},
      agg AS (
        SELECT client_id AS id, MIN(client_name) AS name, COUNT(*)::int AS orders,
               SUM(total) AS revenue, SUM(cost) AS cost
        FROM pe GROUP BY client_id
      )
      SELECT id, name, orders, revenue, cost
      FROM agg ORDER BY (revenue - cost) DESC, id LIMIT ${limite}`;
    const rows = await consultaAnalitica<
      { id: string; name: string; orders: number; revenue: unknown; cost: unknown }
    >(db, sql, p.values);
    return rows.map((r) => {
      const revenue = Number(r.revenue);
      const cost = Number(r.cost);
      return {
        clientId: r.id,
        clientName: r.name,
        orders: r.orders,
        revenue,
        cost,
        profit: revenue - cost,
        marginPct: revenue > 0 ? (revenue - cost) / revenue : 0,
        avgTicket: r.orders > 0 ? revenue / r.orders : 0,
      };
    });
  };

  /**
   * Clientes distintos em TODO o histórico — é o `ds.clients.length` antigo, e
   * a diferença para os ativos é o bucket "inativo" do gráfico de segmentos.
   * GROUP BY em vez de COUNT(DISTINCT): ver a armadilha na seção 8 do plano.
   */
  const totalClientes = async (): Promise<number> => {
    const p = new Params();
    const cond = ["order_type = 'VENDA'"];
    if (f.empresaId !== "all") cond.push(`empresa_id = ${p.add(f.empresaId)}`);
    if (f.currency !== "ALL") cond.push(`currency_id = ${p.add(f.currency)}`);
    const sql = `SELECT COUNT(*)::int AS n FROM (
                   SELECT client_id FROM sale_items
                   WHERE ${cond.join(" AND ")} GROUP BY client_id) t`;
    const [row] = await consultaAnalitica<{ n: number }>(db, sql, p.values);
    return row?.n ?? 0;
  };

  const temAlgumDado = async (): Promise<boolean> => {
    const [row] = await db.$queryRawUnsafe<{ existe: boolean }[]>(
      "SELECT EXISTS (SELECT 1 FROM sale_items WHERE order_type = 'VENDA') AS existe"
    );
    return row?.existe ?? false;
  };

  const [base, profitRanking, totalClients, hasData] = await Promise.all([
    porCliente(),
    lucro(),
    totalClientes(),
    temAlgumDado(),
  ]);

  // "inativo" não sai de consulta: é quem existe no histórico e não comprou no
  // período. O código antigo chegava no mesmo número percorrendo todos os
  // clientes e marcando os de contagem zero.
  const inativos = Math.max(0, totalClients - base.ativos);
  const segments: Record<string, number> = { ...base.segmentos };
  if (inativos > 0) segments.inativo = inativos;
  for (const k of Object.keys(segments)) if (segments[k] === 0) delete segments[k];

  return {
    topClients: base.topClients,
    segments,
    activeCustomers: base.ativos,
    totalRevenue: base.receita,
    avgLTV: base.ativos > 0 ? base.receita / base.ativos : 0,
    churnRisk: base.segmentos["em-risco"] ?? 0,
    totalClients,
    profitRanking,
    profitTotals: {
      count: base.ativos,
      orders: base.pedidos,
      revenue: base.receita,
      cost: base.custo,
      profit: base.receita - base.custo,
    },
    hasData,
  };
}
