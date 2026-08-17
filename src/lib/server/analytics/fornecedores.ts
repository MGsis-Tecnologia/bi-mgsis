import type { PrismaClient } from "@prisma/client";
import {
  Params,
  consultaAnalitica,
  exprTaxa,
  joinCambio,
  type AnalyticsFilters,
} from "./base";

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
  const porFornecedor = async (): Promise<FornecedorMetrica[]> => {
    const p = new Params();
    const taxa = exprTaxa(f);
    const cambio = joinCambio(f, p, "bc.pedido_data", "bc.moeda_id");
    const where = whereFornecedores(f, p);

    const sql = `
      SELECT
        bc.fornecedor_id AS id,
        MIN(bc.fornecedor_nome) AS name,
        COUNT(DISTINCT bc.pedido_documento)::int AS orders,
        COALESCE(SUM(bc.produto_valor_total * ${taxa}), 0) AS revenue,
        MAX(bc.pedido_data) AS last_date
      FROM compra_items bc
      ${cambio}
      WHERE ${where}
        AND bc.pedido_data >= ${p.add(f.from)}
        AND bc.pedido_data <= ${p.add(f.to)}
        AND bc.fornecedor_nome <> ''
      GROUP BY bc.fornecedor_id
      ORDER BY revenue DESC
      LIMIT 18`;

    const rows = await consultaAnalitica<{
      id: string;
      name: string;
      orders: number;
      revenue: unknown;
      last_date: string;
    }>(db, sql, p.values);

    const totalRevenue = rows.reduce((sum, r) => sum + Number(r.revenue), 0);

    return rows.map((r, idx) => {
      const revenue = Number(r.revenue);
      const share = totalRevenue > 0 ? revenue / totalRevenue : 0;
      const cumulativeShare = rows
        .slice(0, idx + 1)
        .reduce((sum, s) => sum + (totalRevenue > 0 ? Number(s.revenue) / totalRevenue : 0), 0);
      const curve = cumulativeShare <= 0.8 ? "A" : cumulativeShare <= 0.95 ? "B" : "C";

      const hojeDate = new Date(hoje).getTime();
      const lastDate = new Date(r.last_date).getTime();
      const recencyDays = Math.floor((hojeDate - lastDate) / (1000 * 60 * 60 * 24));

      return {
        id: r.id,
        name: r.name,
        orders: r.orders,
        revenue,
        averageTicket: r.orders > 0 ? revenue / r.orders : 0,
        lastPurchaseDate: r.last_date || null,
        recencyDays,
        share,
        cumulativeShare,
        curve: curve as "A" | "B" | "C",
      };
    });
  };

  const fornecedoresOficiais = async (): Promise<FornecedorOficial[]> => {
    const p = new Params();
    const where = whereFornecedores(f, p);

    const sql = `
      WITH produtos_fornecedor AS (
        SELECT DISTINCT fornecedor_id, produto_id
        FROM compra_items
        WHERE ${where}
          AND pedido_data >= ${p.add(f.from)}
          AND pedido_data <= ${p.add(f.to)}
      )
      SELECT fornecedor_id, COUNT(*) AS produtos_count
      FROM produtos_fornecedor
      GROUP BY fornecedor_id
      ORDER BY produtos_count DESC
      LIMIT 25`;

    const rows = await consultaAnalitica<{
      fornecedor_id: string;
      produtos_count: number;
    }>(db, sql, p.values);

    // Buscar nomes
    const nomes = await db.$queryRawUnsafe<{ id: string; nome: string }[]>(
      `SELECT DISTINCT fornecedor_id AS id, fornecedor_nome AS nome FROM compra_items WHERE fornecedor_id = ANY($1)`,
      rows.map((r) => r.fornecedor_id)
    );

    const nomeMap = new Map(nomes.map((n) => [n.id, n.nome]));

    return rows.map((r) => ({
      supplierId: r.fornecedor_id,
      supplierName: nomeMap.get(r.fornecedor_id) || "",
      productsCount: r.produtos_count,
    }));
  };

  const temAlgumDado = async (): Promise<boolean> => {
    const [row] = await db.$queryRawUnsafe<{ existe: boolean }[]>(
      "SELECT EXISTS (SELECT 1 FROM compra_items LIMIT 1) AS existe"
    );
    return row?.existe ?? false;
  };

  const [suppliers, oficiais, hasData] = await Promise.all([
    porFornecedor(),
    fornecedoresOficiais(),
    temAlgumDado(),
  ]);

  const totalSuppliers = await (async () => {
    const p = new Params();
    const where = whereFornecedores(f, p);
    const [row] = await consultaAnalitica<{ n: number }>(
      db,
      `SELECT COUNT(DISTINCT fornecedor_id) AS n FROM compra_items WHERE ${where}`,
      p.values
    );
    return row?.n ?? 0;
  })();

  const totalRevenue = suppliers.reduce((sum, s) => sum + s.revenue, 0);
  const totalOrders = suppliers.reduce((sum, s) => sum + s.orders, 0);

  return {
    topSuppliers: suppliers,
    totalSuppliers,
    totalRevenue,
    avgTicket: totalOrders > 0 ? totalRevenue / totalOrders : 0,
    suppliersCount: suppliers.length,
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
