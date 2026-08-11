import type { PrismaClient } from "@prisma/client";
import { Params, comPedidos, consultaAnalitica, type AnalyticsFilters } from "./base";

/**
 * Agregações da tela de Produtos.
 *
 * Tudo aqui é de nível de ITEM (`l`), não de pedido: a tela analisa produto e
 * subgrupo, que só existem na linha. O escopo de filtros é o COMPLETO
 * (canal/vendedor/subgrupo), porque a tela usa `useFilteredOrders()`.
 *
 * As curvas ABC dependem da participação acumulada sobre TODOS os produtos do
 * período, então a classificação é feita no banco com window function; só
 * depois vem o recorte que a tela exibe. Os contadores por curva e os totais
 * são calculados sobre a lista inteira, não sobre o recorte.
 */

export interface ProdutoABC {
  id: string;
  name: string;
  subgroupName: string;
  manufacturerCode: string | null;
  units: number;
  revenue: number;
  share: number;
  cumulativeShare: number;
  curve: "A" | "B" | "C";
}

export interface SubgrupoABC {
  id: string;
  name: string;
  revenue: number;
  units: number;
  productCount: number;
  share: number;
  cumulativeShare: number;
  curve: "A" | "B" | "C";
}

export interface ProdutoLucro {
  productId: string;
  productName: string;
  subgroupName: string;
  manufacturerCode: string | null;
  units: number;
  revenue: number;
  cost: number;
  profit: number;
  marginPct: number;
}

export interface ProdutosData {
  /** Recorte que a tela mostra (tabela usa 24, gráfico usa 12). */
  topProducts: ProdutoABC[];
  /** Contagens e totais sobre TODOS os produtos com venda no período. */
  curveCounts: { A: number; B: number; C: number };
  totals: { units: number; revenue: number };
  /** Produtos com venda no período (= abc.length no código antigo). */
  productsWithSales: number;
  /** Produtos distintos em todo o histórico — o KPI "parados" é a diferença. */
  totalProducts: number;
  /** Lista completa: a tabela de categorias não recorta. */
  subgroups: SubgrupoABC[];
  profitRanking: ProdutoLucro[];
  profitTotals: { units: number; revenue: number; cost: number; profit: number; count: number };
  hasData: boolean;
}

/**
 * Código do fabricante vem do dataset de ESTOQUE, não de vendas. Subconsulta
 * correlacionada porque roda só sobre as poucas linhas já recortadas.
 */
const MFR = `(SELECT MIN(i.manufacturer_code) FROM inventory_items i
              WHERE i.product_id = t.id AND i.manufacturer_code <> '')`;

export async function getProdutosData(
  db: PrismaClient,
  f: AnalyticsFilters
): Promise<ProdutosData> {
  const escopo = { escopoGraficos: true } as const;

  /** ABC de produtos: classifica todos, devolve o recorte + os agregados. */
  const abc = async () => {
    const p = new Params();
    const prefixo = comPedidos(f, p, escopo);
    const limite = p.add(24);
    const sql = `${prefixo},
      agg AS (
        SELECT product_id AS id, MIN(product_name) AS name,
               MIN(subgroup_name) AS subgroup_name,
               SUM(total) AS revenue, SUM(quantity) AS units
        FROM l GROUP BY product_id
      ),
      tot AS (SELECT NULLIF(SUM(revenue), 0) AS total FROM agg),
      acc AS (
        SELECT a.*,
               a.revenue / t.total AS share,
               SUM(a.revenue) OVER (ORDER BY a.revenue DESC, a.id) / t.total AS cum
        FROM agg a CROSS JOIN tot t WHERE t.total IS NOT NULL
      ),
      classificado AS (
        SELECT *, CASE WHEN cum <= 0.8 THEN 'A' WHEN cum <= 0.95 THEN 'B' ELSE 'C' END AS curve
        FROM acc
      ),
      resumo AS (
        SELECT COUNT(*) FILTER (WHERE curve = 'A')::int AS a,
               COUNT(*) FILTER (WHERE curve = 'B')::int AS b,
               COUNT(*) FILTER (WHERE curve = 'C')::int AS c,
               COUNT(*)::int AS total_produtos,
               COALESCE(SUM(units), 0) AS total_units,
               COALESCE(SUM(revenue), 0) AS total_revenue
        FROM classificado
      ),
      topo AS (SELECT * FROM classificado ORDER BY revenue DESC, id LIMIT ${limite})
      SELECT (SELECT row_to_json(r) FROM resumo r) AS resumo,
             (SELECT COALESCE(json_agg(x), '[]'::json) FROM (
                SELECT t.id, t.name, t.subgroup_name, t.units, t.revenue,
                       t.share, t.cum, t.curve, ${MFR} AS mfr
                FROM topo t ORDER BY t.revenue DESC, t.id
              ) x) AS topo`;
    const [row] = await consultaAnalitica<{ resumo: Record<string, unknown>; topo: unknown[] }>(db, sql, p.values);
    const resumo = (row?.resumo ?? {}) as Record<string, number>;
    const topo = (row?.topo ?? []) as {
      id: string; name: string; subgroup_name: string; units: unknown; revenue: unknown;
      share: unknown; cum: unknown; curve: string; mfr: string | null;
    }[];
    return {
      topProducts: topo.map((r) => ({
        id: r.id,
        name: r.name,
        subgroupName: r.subgroup_name,
        manufacturerCode: r.mfr,
        units: Number(r.units),
        revenue: Number(r.revenue),
        share: Number(r.share),
        cumulativeShare: Number(r.cum),
        curve: r.curve as "A" | "B" | "C",
      })),
      curveCounts: { A: Number(resumo.a ?? 0), B: Number(resumo.b ?? 0), C: Number(resumo.c ?? 0) },
      totals: {
        units: Number(resumo.total_units ?? 0),
        revenue: Number(resumo.total_revenue ?? 0),
      },
      productsWithSales: Number(resumo.total_produtos ?? 0),
    };
  };

  /** ABC por subgrupo — lista completa, a tela não recorta. */
  const subgrupos = async (): Promise<SubgrupoABC[]> => {
    const p = new Params();
    // Duas etapas de propósito: agrupar por (subgrupo, produto) e depois contar
    // linhas é bem mais barato que COUNT(DISTINCT product_id) por subgrupo, que
    // obriga o Postgres a ordenar. Medido: 2.355 ms contra ~250 ms.
    const sql = `${comPedidos(f, p, escopo)},
      por_produto AS (
        SELECT subgroup_id, product_id, MIN(subgroup_name) AS name,
               SUM(total) AS revenue, SUM(quantity) AS units
        FROM l GROUP BY subgroup_id, product_id
      ),
      agg AS (
        SELECT subgroup_id AS id, MIN(name) AS name,
               SUM(revenue) AS revenue, SUM(units) AS units,
               COUNT(*)::int AS product_count
        FROM por_produto GROUP BY subgroup_id
      ),
      tot AS (SELECT NULLIF(SUM(revenue), 0) AS total FROM agg)
      SELECT a.id, a.name, a.revenue, a.units, a.product_count,
             COALESCE(a.revenue / t.total, 0) AS share,
             COALESCE(SUM(a.revenue) OVER (ORDER BY a.revenue DESC, a.id) / t.total, 0) AS cum,
             CASE WHEN t.total IS NULL THEN 'C'
                  WHEN SUM(a.revenue) OVER (ORDER BY a.revenue DESC, a.id) / t.total <= 0.8 THEN 'A'
                  WHEN SUM(a.revenue) OVER (ORDER BY a.revenue DESC, a.id) / t.total <= 0.95 THEN 'B'
                  ELSE 'C' END AS curve
      FROM agg a CROSS JOIN tot t
      ORDER BY a.revenue DESC, a.id`;
    const rows = await consultaAnalitica<
      {
        id: string; name: string; revenue: unknown; units: unknown; product_count: number;
        share: unknown; cum: unknown; curve: string;
      }
    >(db, sql, p.values);
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      revenue: Number(r.revenue),
      units: Number(r.units),
      productCount: r.product_count,
      share: Number(r.share),
      cumulativeShare: Number(r.cum),
      curve: r.curve as "A" | "B" | "C",
    }));
  };

  /** Ranking por lucro: recorte de 30 + totais sobre a lista inteira (o tfoot). */
  const lucro = async () => {
    const p = new Params();
    const prefixo = comPedidos(f, p, escopo);
    const limite = p.add(30);
    const sql = `${prefixo},
      agg AS (
        SELECT product_id AS id, MIN(product_name) AS name,
               MIN(subgroup_name) AS subgroup_name,
               SUM(quantity) AS units, SUM(total) AS revenue, SUM(cost) AS cost
        FROM l GROUP BY product_id
      ),
      resumo AS (
        SELECT COUNT(*)::int AS count,
               COALESCE(SUM(units), 0) AS units,
               COALESCE(SUM(revenue), 0) AS revenue,
               COALESCE(SUM(cost), 0) AS cost
        FROM agg
      ),
      topo AS (
        SELECT * FROM agg ORDER BY (revenue - cost) DESC, id LIMIT ${limite}
      )
      SELECT (SELECT row_to_json(r) FROM resumo r) AS resumo,
             (SELECT COALESCE(json_agg(x), '[]'::json) FROM (
                SELECT t.id, t.name, t.subgroup_name, t.units, t.revenue, t.cost, ${MFR} AS mfr
                FROM topo t ORDER BY (t.revenue - t.cost) DESC, t.id
              ) x) AS topo`;
    const [row] = await consultaAnalitica<{ resumo: Record<string, unknown>; topo: unknown[] }>(db, sql, p.values);
    const resumo = (row?.resumo ?? {}) as Record<string, number>;
    const topo = (row?.topo ?? []) as {
      id: string; name: string; subgroup_name: string;
      units: unknown; revenue: unknown; cost: unknown; mfr: string | null;
    }[];
    const revenue = Number(resumo.revenue ?? 0);
    const cost = Number(resumo.cost ?? 0);
    return {
      profitRanking: topo.map((r) => {
        const rev = Number(r.revenue);
        const c = Number(r.cost);
        return {
          productId: r.id,
          productName: r.name,
          subgroupName: r.subgroup_name,
          manufacturerCode: r.mfr,
          units: Number(r.units),
          revenue: rev,
          cost: c,
          profit: rev - c,
          marginPct: rev > 0 ? (rev - c) / rev : 0,
        };
      }),
      profitTotals: {
        count: Number(resumo.count ?? 0),
        units: Number(resumo.units ?? 0),
        revenue,
        cost,
        profit: revenue - cost,
      },
    };
  };

  /**
   * Produtos distintos em TODO o histórico, sem filtro de data — é o
   * `ds.products.length` do código antigo, base do KPI de produtos parados.
   * Só empresa e moeda se aplicam, como no `deriveProducts` original.
   *
   * Sem CTE de conversão (não há valor a somar) e com GROUP BY em vez de
   * COUNT(DISTINCT): sobre a tabela inteira a diferença medida foi de
   * 13.294 ms para 545 ms.
   */
  const totalProdutos = async (): Promise<number> => {
    const p = new Params();
    const cond = ["order_type = 'VENDA'"];
    if (f.empresaId !== "all") cond.push(`empresa_id = ${p.add(f.empresaId)}`);
    if (f.currency !== "ALL") cond.push(`currency_id = ${p.add(f.currency)}`);
    const sql = `SELECT COUNT(*)::int AS n FROM (
                   SELECT product_id FROM sale_items
                   WHERE ${cond.join(" AND ")} GROUP BY product_id) t`;
    const [row] = await consultaAnalitica<{ n: number }>(db, sql, p.values);
    return row?.n ?? 0;
  };

  const temAlgumDado = async (): Promise<boolean> => {
    const [row] = await db.$queryRawUnsafe<{ existe: boolean }[]>(
      "SELECT EXISTS (SELECT 1 FROM sale_items WHERE order_type = 'VENDA') AS existe"
    );
    return row?.existe ?? false;
  };

  const [a, subs, l, total, hasData] = await Promise.all([
    abc(),
    subgrupos(),
    lucro(),
    totalProdutos(),
    temAlgumDado(),
  ]);

  return {
    ...a,
    subgroups: subs,
    ...l,
    totalProducts: total,
    hasData,
  };
}
