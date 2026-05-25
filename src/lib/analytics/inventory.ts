import type {
  ImportedOrder,
  ImportedProduct,
  InventoryItem,
} from "@/lib/types/dataset";

// ─── Health classification ────────────────────────────────────────────────────
// Each SKU receives one of five statuses based on on-hand stock vs. demand
// observed in the selected period:
//   rupture   — stock = 0 AND demand > 0 in the period (lost-sale risk)
//   risk      — stock > 0 but coverage in days ≤ RISK_DAYS (close to running out)
//   excess    — stock > 0 AND no movement in the period OR coverage ≥ EXCESS_DAYS
//   no_movement — stock > 0 AND no sales recorded ever in the period
//   normal    — everything else
export type StockStatus = "rupture" | "risk" | "normal" | "excess" | "no_movement";

// Tunable thresholds (days). Kept module-local — exposed if future UI lets the
// user customize the analysis.
const RISK_DAYS   = 15;   // coverage ≤ 15 days → at risk
const EXCESS_DAYS = 180;  // coverage ≥ 180 days → excess

export interface InventoryRow {
  productId: string;
  description: string;          // prefers description from sales (often more current); falls back to inventory file
  manufacturerCode: string;
  subgroupId: string;
  subgroupName: string;
  stock: number;
  costTotalUSD: number;         // total value of on-hand stock in US$
  unitCostUSD: number;          // costTotalUSD / stock when stock > 0
  unitsSold: number;            // sum of quantity in period
  revenueSold: number;          // sum of totalBRL in period (display currency)
  costSold: number;             // sum of costBRL in period
  ordersCount: number;          // # of distinct orders that contain the SKU
  lastSaleDate: string;         // ISO YYYY-MM-DD ("" if never sold)
  daysSinceLastSale: number;    // Number.POSITIVE_INFINITY if never sold
  avgDailyDemand: number;       // unitsSold / days-in-range
  coverageDays: number;         // stock / avgDailyDemand (POSITIVE_INFINITY if no demand)
  status: StockStatus;
  hasInventory: boolean;        // false → SKU sold in period but missing from inventory file
}

export interface InventoryAnalysis {
  rows: InventoryRow[];
  totals: {
    skus: number;
    skusInStock: number;        // stock > 0
    totalUnits: number;
    totalValueUSD: number;
    rupture: number;
    risk: number;
    excess: number;
    noMovement: number;
    normal: number;
    skusMissingFromInventory: number;
  };
}

export interface AnalysisOptions {
  periodDays: number;
  /** Reference date for "days since last sale". Defaults to today. */
  referenceDate?: Date;
}

function daysBetween(a: Date, b: Date): number {
  return Math.floor((a.getTime() - b.getTime()) / 86400000);
}

function classify(row: Omit<InventoryRow, "status">): StockStatus {
  if (row.stock <= 0 && row.unitsSold > 0)              return "rupture";
  if (row.stock <= 0)                                   return "no_movement"; // 0 stock, 0 sales — treated as dormant
  if (row.unitsSold === 0)                              return "no_movement";
  if (row.coverageDays <= RISK_DAYS)                    return "risk";
  if (row.coverageDays >= EXCESS_DAYS)                  return "excess";
  return "normal";
}

/**
 * Build the per-SKU inventory analysis. Joins the inventory snapshot with the
 * sales movement observed in `orders` (already filtered by the global date
 * range / filters) plus the full product catalogue (for category metadata).
 *
 * SKUs that exist in sales but are absent from the inventory file are still
 * surfaced — flagged with `hasInventory=false`, stock=0 — because the user
 * needs to spot data gaps as much as ruptures.
 */
export function inventoryAnalysis(
  inventory: InventoryItem[],
  orders: ImportedOrder[],
  products: ImportedProduct[],
  opts: AnalysisOptions
): InventoryAnalysis {
  const referenceDate = opts.referenceDate ?? new Date();
  const periodDays = Math.max(1, opts.periodDays);

  // Aggregate sales movement per productId
  type Movement = {
    unitsSold: number;
    revenueSold: number;
    costSold: number;
    orders: Set<string>;
    lastSaleTs: number; // ms epoch, 0 if never
    productName: string;
    subgroupId: string;
    subgroupName: string;
  };
  const movement = new Map<string, Movement>();

  for (const order of orders) {
    const orderTs = new Date(order.date + "T00:00:00").getTime();
    for (const it of order.items) {
      let m = movement.get(it.productId);
      if (!m) {
        m = {
          unitsSold: 0,
          revenueSold: 0,
          costSold: 0,
          orders: new Set<string>(),
          lastSaleTs: 0,
          productName: it.productName,
          subgroupId: it.subgroupId,
          subgroupName: it.subgroupName,
        };
        movement.set(it.productId, m);
      }
      m.unitsSold += it.quantity;
      m.revenueSold += it.totalBRL;
      m.costSold += it.costBRL;
      m.orders.add(order.id);
      if (orderTs > m.lastSaleTs) m.lastSaleTs = orderTs;
    }
  }

  // Product catalogue fallback (subgroup metadata for SKUs without sales in period)
  const productMap = new Map(products.map((p) => [p.id, p]));

  const rows: InventoryRow[] = [];
  const seen = new Set<string>();

  for (const item of inventory) {
    seen.add(item.productId);
    const m = movement.get(item.productId);
    const cat = productMap.get(item.productId);
    const description = (m?.productName || cat?.name || item.description || "").trim();
    const subgroupId = m?.subgroupId ?? cat?.subgroupId ?? "";
    const subgroupName = m?.subgroupName ?? cat?.subgroupName ?? "";

    const unitsSold = m?.unitsSold ?? 0;
    const lastSaleDate = m && m.lastSaleTs > 0 ? new Date(m.lastSaleTs).toISOString().slice(0, 10) : "";
    const daysSinceLastSale = m && m.lastSaleTs > 0
      ? Math.max(0, daysBetween(referenceDate, new Date(m.lastSaleTs)))
      : Number.POSITIVE_INFINITY;

    const avgDailyDemand = unitsSold / periodDays;
    const coverageDays = avgDailyDemand > 0
      ? item.stock / avgDailyDemand
      : Number.POSITIVE_INFINITY;
    const unitCostUSD = item.stock > 0 ? item.costTotalUSD / item.stock : 0;

    const partial: Omit<InventoryRow, "status"> = {
      productId: item.productId,
      description,
      manufacturerCode: item.manufacturerCode,
      subgroupId,
      subgroupName,
      stock: item.stock,
      costTotalUSD: item.costTotalUSD,
      unitCostUSD,
      unitsSold,
      revenueSold: m?.revenueSold ?? 0,
      costSold: m?.costSold ?? 0,
      ordersCount: m?.orders.size ?? 0,
      lastSaleDate,
      daysSinceLastSale,
      avgDailyDemand,
      coverageDays,
      hasInventory: true,
    };
    rows.push({ ...partial, status: classify(partial) });
  }

  // SKUs that moved in the period but are absent from the inventory snapshot —
  // surfaced as rupture candidates (stock=0, but they sold), since that's the
  // actionable signal.
  for (const [productId, m] of movement) {
    if (seen.has(productId)) continue;
    const cat = productMap.get(productId);
    const description = (m.productName || cat?.name || "").trim();
    const partial: Omit<InventoryRow, "status"> = {
      productId,
      description,
      manufacturerCode: "",
      subgroupId: m.subgroupId,
      subgroupName: m.subgroupName,
      stock: 0,
      costTotalUSD: 0,
      unitCostUSD: 0,
      unitsSold: m.unitsSold,
      revenueSold: m.revenueSold,
      costSold: m.costSold,
      ordersCount: m.orders.size,
      lastSaleDate: m.lastSaleTs > 0 ? new Date(m.lastSaleTs).toISOString().slice(0, 10) : "",
      daysSinceLastSale: m.lastSaleTs > 0
        ? Math.max(0, daysBetween(referenceDate, new Date(m.lastSaleTs)))
        : Number.POSITIVE_INFINITY,
      avgDailyDemand: m.unitsSold / periodDays,
      coverageDays: 0,
      hasInventory: false,
    };
    rows.push({ ...partial, status: "rupture" });
  }

  // Totals
  const totals = {
    skus: rows.length,
    skusInStock: 0,
    totalUnits: 0,
    totalValueUSD: 0,
    rupture: 0,
    risk: 0,
    excess: 0,
    noMovement: 0,
    normal: 0,
    skusMissingFromInventory: 0,
  };
  for (const r of rows) {
    if (r.stock > 0) totals.skusInStock++;
    totals.totalUnits += r.stock;
    totals.totalValueUSD += r.costTotalUSD;
    if (!r.hasInventory) totals.skusMissingFromInventory++;
    switch (r.status) {
      case "rupture":     totals.rupture++; break;
      case "risk":        totals.risk++; break;
      case "excess":      totals.excess++; break;
      case "no_movement": totals.noMovement++; break;
      case "normal":      totals.normal++; break;
    }
  }

  return { rows, totals };
}

// ─── Aggregations for charts ──────────────────────────────────────────────────

export interface CategoryStockEntry {
  id: string;
  name: string;
  skus: number;
  units: number;
  valueUSD: number;
  unitsSold: number;
  revenueSold: number;
}

export function stockByCategory(rows: InventoryRow[]): CategoryStockEntry[] {
  const map = new Map<string, CategoryStockEntry>();
  for (const r of rows) {
    const id = r.subgroupId || "__none__";
    const name = r.subgroupName || "Sem categoria";
    let entry = map.get(id);
    if (!entry) {
      entry = { id, name, skus: 0, units: 0, valueUSD: 0, unitsSold: 0, revenueSold: 0 };
      map.set(id, entry);
    }
    entry.skus++;
    entry.units += r.stock;
    entry.valueUSD += r.costTotalUSD;
    entry.unitsSold += r.unitsSold;
    entry.revenueSold += r.revenueSold;
  }
  return [...map.values()].sort((a, b) => b.valueUSD - a.valueUSD);
}

export interface StatusSlice {
  key: StockStatus;
  label: string;
  count: number;
  valueUSD: number;
}

const STATUS_LABEL: Record<StockStatus, string> = {
  rupture:     "Ruptura",
  risk:        "Em risco",
  normal:      "Normal",
  excess:      "Excesso",
  no_movement: "Sem giro",
};

export function statusDistribution(rows: InventoryRow[]): StatusSlice[] {
  const order: StockStatus[] = ["rupture", "risk", "normal", "excess", "no_movement"];
  const acc = new Map<StockStatus, StatusSlice>();
  for (const k of order) acc.set(k, { key: k, label: STATUS_LABEL[k], count: 0, valueUSD: 0 });
  for (const r of rows) {
    const s = acc.get(r.status)!;
    s.count++;
    s.valueUSD += r.costTotalUSD;
  }
  return order.map((k) => acc.get(k)!);
}

export function statusLabel(s: StockStatus): string {
  return STATUS_LABEL[s];
}

// Top movers by units sold in the period
export function topMovers(rows: InventoryRow[], limit = 10): InventoryRow[] {
  return [...rows]
    .filter((r) => r.unitsSold > 0)
    .sort((a, b) => b.unitsSold - a.unitsSold)
    .slice(0, limit);
}

// Top dormant: high stock value but zero/low movement
export function topDormant(rows: InventoryRow[], limit = 10): InventoryRow[] {
  return [...rows]
    .filter((r) => r.stock > 0 && r.unitsSold === 0)
    .sort((a, b) => b.costTotalUSD - a.costTotalUSD)
    .slice(0, limit);
}

// Items most at risk of rupture: rupture first (sorted by revenue lost), then
// "risk" (lowest coverage first).
export function topRuptureRisk(rows: InventoryRow[], limit = 10): InventoryRow[] {
  return [...rows]
    .filter((r) => r.status === "rupture" || r.status === "risk")
    .sort((a, b) => {
      if (a.status !== b.status) return a.status === "rupture" ? -1 : 1;
      if (a.status === "rupture") {
        // Highest revenue lost potential → harder to ignore
        return b.revenueSold - a.revenueSold;
      }
      // Within risk: lowest coverage first
      return a.coverageDays - b.coverageDays;
    })
    .slice(0, limit);
}
