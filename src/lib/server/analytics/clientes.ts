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
 *
 * ## Duas tabelas, mesmo padrão de paginação
 *
 * "Base de Clientes" (curva ABC) e "Clientes mais lucrativos" listam TODOS os
 * clientes ativos no período, não só um recorte — como fizemos em Produtos.
 * `getClientesData` devolve a PRIMEIRA página de cada uma ({@link LINHAS_INICIAIS}
 * itens); `getClientesPagina` busca o resto conforme a rolagem, com busca
 * opcional por nome ou id.
 *
 * Na Base de Clientes, a busca filtra o conjunto JÁ CLASSIFICADO: segmento,
 * participação e curva ABC de cada cliente são calculados sobre TODOS os
 * clientes ativos, sem olhar o texto digitado — a busca decide só quais linhas
 * aparecem, não que curva cada cliente tem. Os KPIs de topo (`resumo`) seguem
 * a mesma regra: nunca recortam pela busca.
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
  /** PRIMEIRA página ({@link LINHAS_INICIAIS} itens), já classificados — o gráfico usa os 10 primeiros. */
  topClients: ClienteMetrica[];
  /** Contagem por segmento sobre TODOS os clientes, incluindo os inativos. */
  segments: Record<string, number>;
  activeCustomers: number;
  totalRevenue: number;
  avgLTV: number;
  churnRisk: number;
  /** Clientes distintos em todo o histórico — base do bucket "inativo". */
  totalClients: number;
  /** Primeira página do ranking por lucro; o resto vem de `getClientesPagina`. */
  profitRanking: ClienteLucro[];
  profitTotals: { orders: number; revenue: number; cost: number; profit: number; count: number };
  hasData: boolean;
}

export type TabelaClientes = "base" | "lucro";

export interface PaginaClientes {
  tabela: TabelaClientes;
  rows: ClienteMetrica[] | ClienteLucro[];
  /** Itens que casam com a busca (ou o total de ativos, sem busca). */
  total: number;
}

/** Linhas da primeira página de cada tabela. As seguintes vêm de `getClientesPagina`. */
export const LINHAS_INICIAIS = 15;

const escopo = { escopoGraficos: true } as const;

interface OpcoesPagina {
  busca: string;
  offset: number;
  limite: number;
}

/** `%` e `_` do texto digitado são literais, não curingas do LIKE. */
function escapaLike(s: string): string {
  return s.replace(/[\\%_]/g, (c) => `\\${c}`);
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

/**
 * Base de Clientes: classifica TODOS os clientes ativos (segmento, participação,
 * curva ABC) e devolve uma página do ranking por receita, com busca opcional.
 */
async function rankingClientes(
  db: PrismaClient,
  f: AnalyticsFilters,
  hoje: string,
  o: OpcoesPagina
) {
  const p = new Params();
  const prefixo = comPedidos(f, p, escopo);
  const dia = p.add(hoje);
  const lim = p.add(o.limite);
  const off = p.add(o.offset);
  const busca = o.busca.trim();
  const filtroBusca = busca
    ? `WHERE (name ILIKE ${p.add(`%${escapaLike(busca)}%`)} OR id ILIKE ${p.add(`%${escapaLike(busca)}%`)})`
    : "";

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
    filtrado AS (SELECT * FROM classificado ${filtroBusca}),
    pagina AS (
      SELECT * FROM filtrado ORDER BY revenue DESC, id LIMIT ${lim} OFFSET ${off}
    )
    SELECT (SELECT row_to_json(r) FROM resumo r) AS resumo,
           (SELECT COUNT(*)::int FROM filtrado) AS total_filtrado,
           (SELECT COALESCE(json_agg(x ORDER BY x.revenue DESC, x.id), '[]'::json) FROM (
              SELECT id, name, orders, revenue, cost, last_date, recency_days,
                     segment, share, cum,
                     CASE WHEN cum <= 0.8 THEN 'A' WHEN cum <= 0.95 THEN 'B' ELSE 'C' END AS curve
              FROM pagina
            ) x) AS pagina`;

  const [row] = await consultaAnalitica<{
    resumo: Record<string, unknown>;
    pagina: unknown[];
    total_filtrado: number;
  }>(db, sql, p.values);

  const resumo = (row?.resumo ?? {}) as Record<string, number>;
  const pagina = (row?.pagina ?? []) as {
    id: string; name: string; orders: number; revenue: unknown; cost: unknown;
    last_date: string; recency_days: number; segment: string;
    share: unknown; cum: unknown; curve: string;
  }[];

  return {
    topClients: pagina.map((r) => {
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
    total: Number(row?.total_filtrado ?? 0),
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
}

/**
 * Clientes mais lucrativos: uma página, ordenada por lucro (receita − custo),
 * com busca opcional. Os totais (`resumo`) somam TODOS os clientes ativos,
 * nunca só a busca — é o que o rodapé da tabela mostra.
 */
async function rankingLucroClientes(db: PrismaClient, f: AnalyticsFilters, o: OpcoesPagina) {
  const p = new Params();
  const prefixo = comPedidos(f, p, escopo);
  const lim = p.add(o.limite);
  const off = p.add(o.offset);
  const busca = o.busca.trim();
  const filtroBusca = busca
    ? `WHERE (name ILIKE ${p.add(`%${escapaLike(busca)}%`)} OR id ILIKE ${p.add(`%${escapaLike(busca)}%`)})`
    : "";

  const sql = `${prefixo},
    agg AS (
      SELECT client_id AS id, MIN(client_name) AS name, COUNT(*)::int AS orders,
             SUM(total) AS revenue, SUM(cost) AS cost
      FROM pe GROUP BY client_id
    ),
    resumo AS (
      SELECT COUNT(*)::int AS count,
             COALESCE(SUM(orders), 0)::int AS orders,
             COALESCE(SUM(revenue), 0) AS revenue,
             COALESCE(SUM(cost), 0) AS cost
      FROM agg
    ),
    filtrado AS (SELECT * FROM agg ${filtroBusca}),
    pagina AS (
      SELECT * FROM filtrado ORDER BY (revenue - cost) DESC, id LIMIT ${lim} OFFSET ${off}
    )
    SELECT (SELECT row_to_json(r) FROM resumo r) AS resumo,
           (SELECT COUNT(*)::int FROM filtrado) AS total_filtrado,
           (SELECT COALESCE(json_agg(x ORDER BY (x.revenue - x.cost) DESC, x.id), '[]'::json) FROM pagina x) AS pagina`;

  const [row] = await consultaAnalitica<{
    resumo: Record<string, unknown>;
    pagina: unknown[];
    total_filtrado: number;
  }>(db, sql, p.values);

  const resumo = (row?.resumo ?? {}) as Record<string, number>;
  const pagina = (row?.pagina ?? []) as
    { id: string; name: string; orders: number; revenue: unknown; cost: unknown }[];
  const revenue = Number(resumo.revenue ?? 0);
  const cost = Number(resumo.cost ?? 0);

  return {
    profitRanking: pagina.map((r) => {
      const rev = Number(r.revenue);
      const c = Number(r.cost);
      return {
        clientId: r.id,
        clientName: r.name,
        orders: r.orders,
        revenue: rev,
        cost: c,
        profit: rev - c,
        marginPct: rev > 0 ? (rev - c) / rev : 0,
        avgTicket: r.orders > 0 ? rev / r.orders : 0,
      };
    }),
    total: Number(row?.total_filtrado ?? 0),
    profitTotals: {
      count: Number(resumo.count ?? 0),
      orders: Number(resumo.orders ?? 0),
      revenue,
      cost,
      profit: revenue - cost,
    },
  };
}

/**
 * Clientes distintos em TODO o histórico — é o `ds.clients.length` antigo, e
 * a diferença para os ativos é o bucket "inativo" do gráfico de segmentos.
 * GROUP BY em vez de COUNT(DISTINCT): ver a armadilha na seção 8 do plano.
 */
async function totalClientes(db: PrismaClient, f: AnalyticsFilters): Promise<number> {
  const p = new Params();
  const cond = ["order_type = 'VENDA'"];
  if (f.empresaId !== "all") cond.push(`empresa_id = ${p.add(f.empresaId)}`);
  if (f.currency !== "ALL") cond.push(`currency_id = ${p.add(f.currency)}`);
  const sql = `SELECT COUNT(*)::int AS n FROM (
                 SELECT client_id FROM sale_items
                 WHERE ${cond.join(" AND ")} GROUP BY client_id) t`;
  const [row] = await consultaAnalitica<{ n: number }>(db, sql, p.values);
  return row?.n ?? 0;
}

async function temAlgumDado(db: PrismaClient): Promise<boolean> {
  const [row] = await db.$queryRawUnsafe<{ existe: boolean }[]>(
    "SELECT EXISTS (SELECT 1 FROM sale_items WHERE order_type = 'VENDA') AS existe"
  );
  return row?.existe ?? false;
}

export async function getClientesData(
  db: PrismaClient,
  f: AnalyticsFilters,
  hoje: string
): Promise<ClientesData> {
  const primeiraPagina = { busca: "", offset: 0, limite: LINHAS_INICIAIS };

  const [base, lucro, totalClients, hasData] = await Promise.all([
    rankingClientes(db, f, hoje, primeiraPagina),
    rankingLucroClientes(db, f, primeiraPagina),
    totalClientes(db, f),
    temAlgumDado(db),
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
    profitRanking: lucro.profitRanking,
    profitTotals: lucro.profitTotals,
    hasData,
  };
}

/** Uma página de uma das duas tabelas grandes, conforme a rolagem. */
export async function getClientesPagina(
  db: PrismaClient,
  f: AnalyticsFilters,
  hoje: string,
  tabela: TabelaClientes,
  offset: number,
  limite: number,
  busca: string
): Promise<PaginaClientes> {
  if (tabela === "base") {
    const r = await rankingClientes(db, f, hoje, { busca, offset, limite });
    return { tabela, rows: r.topClients, total: r.total };
  }
  const r = await rankingLucroClientes(db, f, { busca, offset, limite });
  return { tabela, rows: r.profitRanking, total: r.total };
}
