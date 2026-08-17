import type { PrismaClient } from "@prisma/client";
import {
  Params,
  consultaAnalitica,
  exprTaxa,
  joinCambio,
  type AnalyticsFilters,
} from "./base";

/**
 * Agregações da tela de Fornecedores.
 *
 * Segue o padrão de clientes.ts, mas sem segmentação RFM — apenas ranking
 * por gasto total, curva ABC, e informações de recência.
 */

export interface FornecedorMetrica {
  id: string;
  name: string;
  orders: number;
  revenue: number;
  averageTicket: number;
  lastPurchaseDate: string | null;
  recencyDays: number;
  share: number;
  cumulativeShare: number;
  curve: "A" | "B" | "C";
}

export interface FornecedorOficial {
  supplierId: string;
  supplierName: string;
  productsCount: number;
}

export interface FornecedoresData {
  topSuppliers: FornecedorMetrica[];
  totalSuppliers: number;
  totalRevenue: number;
  avgTicket: number;
  suppliersCount: number;
  officialSuppliers: FornecedorOficial[];
  hasData: boolean;
}

export async function getFornecedoresData(
  db: PrismaClient,
  f: AnalyticsFilters,
  hoje: string
): Promise<FornecedoresData> {
  /**
   * Ranking de fornecedores por gasto total, já com curva ABC.
   * Espelha a lógica de topClients em clientes.ts.
   */
  const porFornecedor = async (): Promise<{
    suppliers: FornecedorMetrica[];
    totalRevenue: number;
    avgTicket: number;
  }> => {
    const p = new Params();
    const taxa = exprTaxa(f);
    const cambio = joinCambio(f, p, "bc.pedido_data", "bc.moeda_id");
    const where = whereFornecedores(f, p);
    const dia = p.add(hoje);
    const limite = p.add(18);

    const sql = `
      WITH agg AS (
        SELECT bc.fornecedor_id AS id,
               MIN(bc.fornecedor_nome) AS name,
               COUNT(DISTINCT bc.pedido_documento)::int AS orders,
               COALESCE(SUM(bc.produto_valor_total * ${taxa}), 0) AS revenue,
               MAX(bc.pedido_data) AS last_date
        FROM bi_compras bc
        ${cambio}
        WHERE ${where}
          AND bc.pedido_data >= ${p.add(f.from)}
          AND bc.pedido_data <= ${p.add(f.to)}
          AND bc.fornecedor_nome <> ''
        GROUP BY bc.fornecedor_id
      ),
      mx AS (
        SELECT COALESCE(MAX(revenue), 0) AS max_revenue,
               NULLIF(SUM(revenue), 0) AS total_revenue,
               COALESCE(SUM(orders), 0)::int AS total_orders,
               COUNT(*)::int AS ativos
        FROM agg
      ),
      classificado AS (
        SELECT a.*,
               m.max_revenue,
               m.total_revenue,
               (${dia}::date - a.last_date::date) AS recency_days,
               COALESCE(a.revenue / m.total_revenue, 0) AS share,
               COALESCE(SUM(a.revenue) OVER (ORDER BY a.revenue DESC, a.id), 0) /
                 NULLIF(m.total_revenue, 0) AS cum
        FROM agg a
        CROSS JOIN mx m
      ),
      topo AS (
        SELECT id, name, orders, revenue, last_date, recency_days, share, cum,
               CASE WHEN cum <= 0.8 THEN 'A' WHEN cum <= 0.95 THEN 'B' ELSE 'C' END AS curve
        FROM classificado
        ORDER BY revenue DESC, id
        LIMIT ${limite}
      ),
      resumo AS (
        SELECT COALESCE(SUM(revenue), 0) AS total_revenue,
               COALESCE(SUM(orders), 0)::int AS total_orders,
               COUNT(*)::int AS ativos
        FROM agg
      )
      SELECT
        (SELECT row_to_json(r) FROM resumo r) AS resumo,
        (SELECT COALESCE(json_agg(x), '[]'::json) FROM (
          SELECT id, name, orders, revenue, last_date, recency_days, share, cum AS cumulative_share, curve
          FROM topo
        ) x) AS topo`;

    const [row] = await consultaAnalitica<{
      resumo: { total_revenue: unknown; total_orders: number; ativos: number };
      topo: {
        id: string;
        name: string;
        orders: number;
        revenue: unknown;
        last_date: string;
        recency_days: number;
        share: unknown;
        cumulative_share: unknown;
        curve: string;
      }[];
    }>(db, sql, p.values);

    const resumo = row?.resumo ?? { total_revenue: 0, total_orders: 0, ativos: 0 };
    const topo = row?.topo ?? [];
    const totalRevenue = Number(resumo.total_revenue);
    const totalOrders = resumo.total_orders;

    return {
      suppliers: topo.map((r) => {
        const revenue = Number(r.revenue);
        return {
          id: r.id,
          name: r.name,
          orders: r.orders,
          revenue,
          averageTicket: r.orders > 0 ? revenue / r.orders : 0,
          lastPurchaseDate: r.last_date || null,
          recencyDays: r.recency_days,
          share: Number(r.share),
          cumulativeShare: Number(r.cumulative_share),
          curve: r.curve as "A" | "B" | "C",
        };
      }),
      totalRevenue,
      avgTicket: totalOrders > 0 ? totalRevenue / totalOrders : 0,
    };
  };

  /**
   * Fornecedores oficiais por produto: a última compra em quantidade ≥ mediana.
   * Descarta reposições pontuais pequenas no mercado local.
   */
  const fornecedoresOficiais = async (): Promise<FornecedorOficial[]> => {
    const p = new Params();
    const taxa = exprTaxa(f);
    const cambio = joinCambio(f, p, "bc.pedido_data", "bc.moeda_id");
    const where = whereFornecedores(f, p);

    const sql = `
      WITH mediana_por_produto AS (
        SELECT bc.produto_id,
               PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY bc.produto_quantidade) AS mediana
        FROM bi_compras bc
        ${cambio}
        WHERE ${where}
          AND bc.produto_id <> ''
        GROUP BY bc.produto_id
      ),
      elegivel AS (
        SELECT bc.produto_id, bc.fornecedor_id, bc.fornecedor_nome, bc.pedido_data, bc.produto_quantidade,
               ROW_NUMBER() OVER (PARTITION BY bc.produto_id ORDER BY bc.pedido_data DESC) AS rn
        FROM bi_compras bc
        INNER JOIN mediana_por_produto m ON m.produto_id = bc.produto_id
        ${cambio}
        WHERE ${where}
          AND bc.produto_id <> ''
          AND bc.fornecedor_nome <> ''
          AND bc.produto_quantidade >= m.mediana
      )
      SELECT bc.fornecedor_id, MIN(bc.fornecedor_nome) AS fornecedor_nome,
             COUNT(DISTINCT elegivel.produto_id)::int AS produtos_count
      FROM bi_compras bc
      INNER JOIN elegivel ON elegivel.fornecedor_id = bc.fornecedor_id
                         AND elegivel.produto_id = bc.produto_id
                         AND elegivel.rn = 1
      GROUP BY bc.fornecedor_id
      ORDER BY produtos_count DESC
      LIMIT 25`;

    const rows = await consultaAnalitica<{
      fornecedor_id: string;
      fornecedor_nome: string;
      produtos_count: number;
    }>(db, sql, p.values);

    return rows.map((r) => ({
      supplierId: r.fornecedor_id,
      supplierName: r.fornecedor_nome,
      productsCount: r.produtos_count,
    }));
  };

  const temAlgumDado = async (): Promise<boolean> => {
    const [row] = await db.$queryRawUnsafe<{ existe: boolean }[]>(
      "SELECT EXISTS (SELECT 1 FROM bi_compras) AS existe"
    );
    return row?.existe ?? false;
  };

  const [base, oficiais, hasData] = await Promise.all([
    porFornecedor(),
    fornecedoresOficiais(),
    temAlgumDado(),
  ]);

  // Contar total de fornecedores distintos (não filtrados por top 18)
  const totalSuppliers = await (async () => {
    const p = new Params();
    const where = whereFornecedores(f, p);
    const sql = `
      SELECT COUNT(DISTINCT fornecedor_id)::int AS n
      FROM bi_compras
      WHERE ${where}
        AND fornecedor_nome <> ''`;
    const [row] = await consultaAnalitica<{ n: number }>(db, sql, p.values);
    return row?.n ?? 0;
  })();

  return {
    topSuppliers: base.suppliers,
    totalSuppliers,
    totalRevenue: base.totalRevenue,
    avgTicket: base.avgTicket,
    suppliersCount: base.suppliers.length,
    officialSuppliers: oficiais,
    hasData,
  };
}

function whereFornecedores(f: AnalyticsFilters, p: Params): string {
  const cond = [];
  if (f.empresaId !== "all") cond.push(`empresa_id = ${p.add(f.empresaId)}`);
  if (f.currency !== "ALL") cond.push(`moeda_id = ${p.add(f.currency)}`);
  return cond.join(" AND ") || "1=1";
}

export type { AnalyticsFilters };
