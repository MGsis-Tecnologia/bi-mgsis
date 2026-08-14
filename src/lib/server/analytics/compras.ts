import type { PrismaClient } from "@prisma/client";
import {
  Params,
  consultaAnalitica,
  exprTaxa,
  joinCambio,
  montaSerie,
  type AnalyticsFilters,
  type HeatmapCelula,
  type SeriePonto,
  type SerieRow,
} from "./base";

/**
 * Agregações da tela de Análise de Compras.
 *
 * Segue o padrão de vendas.ts, mas com as diferenças inerentes a compras:
 * - Não há canal de compra
 * - Não há vendedor (quem compra é a empresa)
 * - Não há desconto (ou não é relevante)
 * - Não há subgrupo (ou não é tão importante)
 * - Os agrupamentos principais são por data, fornecedor, produto
 *
 * KPIs: valor total, quantidade de itens, média de valor, fornecedores únicos
 *
 * A tabela é `compra_items`, populada pela importação — e não `bi_compras`,
 * que é a view do ERP e existe do outro lado, no servidor do cliente. Os nomes
 * das colunas são os mesmos da view de propósito, para o leiaute do arquivo, a
 * tabela e estas consultas falarem uma língua só.
 */

export interface ComprasKpis {
  totalValue: number;
  itemsCount: number;
  averageValue: number;
  averageTicket: number;
  uniqueSuppliers: number;
  ordersCount: number;
}

export interface FornecedorCompra {
  /** Texto cru do nome do fornecedor — compatível com a normalização do cliente. */
  supplier: string;
  currencyId: string;
  totalPurchases: number;
  orderCount: number;
}

export interface CompraRecente {
  id: string;
  supplierName: string;
  items: number;
  total: number;
  date: string;
}

export interface ComprasData {
  kpi: ComprasKpis;
  monthly: SeriePonto[];
  daily: SeriePonto[];
  yearly: SeriePonto[];
  heatmap: HeatmapCelula[];
  suppliers: FornecedorCompra[];
  recentOrders: CompraRecente[];
  hasData: boolean;
}

interface KpiRow {
  total_value: unknown;
  items_count: unknown;
  unique_suppliers: number;
  orders_count: number;
}

/**
 * `taxa` entra aqui, e não só no filtro: sem ela o cartão de KPI somava as
 * moedas cruas — uma compra de US$ 100 valia 100 ao lado de 1.000.000 em
 * guaranis, e o total ficava indistinguível do total só em G$. Os gráficos
 * logo abaixo já convertiam, então os dois se contradiziam na mesma tela.
 */
const kpiSelect = (taxa: string) => `
  COALESCE(SUM(produto_valor_total * ${taxa}), 0) AS total_value,
  COALESCE(SUM(produto_quantidade), 0)            AS items_count,
  COUNT(DISTINCT fornecedor_id)::int              AS unique_suppliers,
  COUNT(DISTINCT pedido_documento)::int           AS orders_count`;

function montaKpi(r: KpiRow | undefined): ComprasKpis {
  const totalValue = Number(r?.total_value ?? 0);
  const itemsCount = Number(r?.items_count ?? 0);
  const ordersCount = r?.orders_count ?? 0;
  const uniqueSuppliers = r?.unique_suppliers ?? 0;
  return {
    totalValue,
    itemsCount,
    averageValue: itemsCount > 0 ? totalValue / itemsCount : 0,
    averageTicket: ordersCount > 0 ? totalValue / ordersCount : 0,
    uniqueSuppliers,
    ordersCount,
  };
}

export async function getComprasData(
  db: PrismaClient,
  f: AnalyticsFilters
): Promise<ComprasData> {
  const kpi = async (): Promise<ComprasKpis> => {
    const p = new Params();
    const taxa = exprTaxa(f);
    const cambio = joinCambio(f, p, "bc.pedido_data", "bc.moeda_id");
    const where = whereCompras(f, p);
    const sql = `
      SELECT ${kpiSelect(taxa)}
      FROM compra_items bc
      ${cambio}
      WHERE ${where}
        AND bc.pedido_data >= ${p.add(f.from)}
        AND bc.pedido_data <= ${p.add(f.to)}
        AND bc.produto_valor_total * ${taxa} > 0`;
    const [row] = await consultaAnalitica<KpiRow>(db, sql, p.values);
    return montaKpi(row);
  };

  const serie = async (expr: string): Promise<SeriePonto[]> => {
    const p = new Params();
    const taxa = exprTaxa(f);
    const cambio = joinCambio(f, p, "bc.pedido_data", "bc.moeda_id");
    const where = whereCompras(f, p);
    const sql = `
      SELECT ${expr} AS key,
             COALESCE(SUM(bc.produto_valor_total * ${taxa}), 0)    AS revenue,
             0                                                      AS cost,
             0                                                      AS discount,
             COUNT(DISTINCT bc.pedido_documento)::int             AS orders
      FROM compra_items bc
      ${cambio}
      WHERE ${where}
        AND bc.pedido_data >= ${p.add(f.from)}
        AND bc.pedido_data <= ${p.add(f.to)}
      GROUP BY 1
      ORDER BY 1`;
    return montaSerie(await consultaAnalitica<SerieRow>(db, sql, p.values));
  };

  const heatmap = async (): Promise<HeatmapCelula[]> => {
    const p = new Params();
    const taxa = exprTaxa(f);
    const cambio = joinCambio(f, p, "bc.pedido_data", "bc.moeda_id");
    const where = whereCompras(f, p);
    const sql = `
      SELECT EXTRACT(DOW FROM bc.pedido_data::date)::int AS weekday,
             LEAST(5, (EXTRACT(DAY FROM bc.pedido_data::date)::int - 1
                      + EXTRACT(DOW FROM date_trunc('month', bc.pedido_data::date))::int) / 7)::int AS week,
             COALESCE(SUM(bc.produto_valor_total * ${taxa}), 0) AS value
      FROM compra_items bc
      ${cambio}
      WHERE ${where}
        AND bc.pedido_data >= ${p.add(f.from)}
        AND bc.pedido_data <= ${p.add(f.to)}
      GROUP BY 1, 2
      ORDER BY 1, 2`;
    const rows = await consultaAnalitica<{ weekday: number; week: number; value: unknown }>(db, sql, p.values);
    return rows.map((r) => ({ weekday: r.weekday, week: r.week, value: Number(r.value) }));
  };

  /**
   * Agrega por fornecedor. Traz o nome tal qual está no banco,
   * e a moeda para contexto de geocodificação (se necessário).
   */
  const fornecedores = async (): Promise<FornecedorCompra[]> => {
    const p = new Params();
    const taxa = exprTaxa(f);
    const cambio = joinCambio(f, p, "bc.pedido_data", "bc.moeda_id");
    const where = whereCompras(f, p);
    const sql = `
      SELECT bc.fornecedor_nome AS supplier,
             bc.moeda_id AS currency_id,
             COALESCE(SUM(bc.produto_valor_total * ${taxa}), 0) AS total_purchases,
             COUNT(DISTINCT bc.pedido_documento)::int AS order_count
      FROM compra_items bc
      ${cambio}
      WHERE ${where}
        AND bc.pedido_data >= ${p.add(f.from)}
        AND bc.pedido_data <= ${p.add(f.to)}
        AND bc.fornecedor_nome <> ''
      GROUP BY 1, 2
      ORDER BY 3 DESC`;
    const rows = await consultaAnalitica<
      { supplier: string; currency_id: string; total_purchases: unknown; order_count: number }
    >(db, sql, p.values);
    return rows.map((r) => ({
      supplier: r.supplier,
      currencyId: r.currency_id,
      totalPurchases: Number(r.total_purchases),
      orderCount: r.order_count,
    }));
  };

  /**
   * Últimas 12 compras — a tabela da tela. Ordenação por data, como no original.
   */
  const recentes = async (): Promise<CompraRecente[]> => {
    const p = new Params();
    const taxa = exprTaxa(f);
    const cambio = joinCambio(f, p, "bc.pedido_data", "bc.moeda_id");
    const where = whereCompras(f, p);
    const limite = p.add(12);
    const sql = `
      SELECT bc.pedido_documento AS id,
             bc.fornecedor_nome,
             COUNT(*)::int AS items,
             COALESCE(SUM(bc.produto_valor_total * ${taxa}), 0) AS total,
             MAX(bc.pedido_data) AS date
      FROM compra_items bc
      ${cambio}
      WHERE ${where}
        AND bc.pedido_data >= ${p.add(f.from)}
        AND bc.pedido_data <= ${p.add(f.to)}
      GROUP BY bc.pedido_documento, bc.fornecedor_nome
      ORDER BY date DESC, id DESC
      LIMIT ${limite}`;
    const rows = await consultaAnalitica<
      {
        id: string;
        fornecedor_nome: string;
        items: number;
        total: unknown;
        date: string;
      }
    >(db, sql, p.values);
    return rows.map((r) => ({
      id: r.id,
      supplierName: r.fornecedor_nome,
      items: r.items,
      total: Number(r.total),
      date: r.date,
    }));
  };

  const temAlgumDado = async (): Promise<boolean> => {
    const [row] = await db.$queryRawUnsafe<{ existe: boolean }[]>(
      "SELECT EXISTS (SELECT 1 FROM compra_items WHERE pedido_tipo = 'COMPRA') AS existe"
    );
    return row?.existe ?? false;
  };

  const [k, monthly, daily, yearly, heat, suppliers, recentOrders, hasData] = await Promise.all([
    kpi(),
    serie("substring(bc.pedido_data, 1, 7)"),
    serie("substring(bc.pedido_data, 1, 10)"),
    serie("substring(bc.pedido_data, 1, 4)"),
    heatmap(),
    fornecedores(),
    recentes(),
    temAlgumDado(),
  ]);

  return {
    kpi: k,
    monthly,
    daily,
    yearly,
    heatmap: heat,
    suppliers,
    recentOrders,
    hasData,
  };
}

/**
 * Filtros base para compras: empresa, moeda e data.
 * Não há canal, vendedor ou subgrupo em compras.
 */
function whereCompras(f: AnalyticsFilters, p: Params): string {
  const cond = ["bc.pedido_tipo = 'COMPRA'"];
  if (f.empresaId !== "all") cond.push(`bc.empresa_id = ${p.add(f.empresaId)}`);
  if (f.currency !== "ALL") cond.push(`bc.moeda_id = ${p.add(f.currency)}`);
  return cond.join(" AND ");
}

export type { AnalyticsFilters };
