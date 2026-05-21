import type { ImportedOrder, ImportedProduct, ImportedClient } from "@/lib/types/dataset";

export interface ABCEntry<T> {
  item: T;
  revenue: number;
  units: number;
  share: number;
  cumulativeShare: number;
  curve: "A" | "B" | "C";
}

function classifyABC<T>(entries: { item: T; revenue: number; units: number }[]): ABCEntry<T>[] {
  const total = entries.reduce((s, e) => s + e.revenue, 0);
  if (total === 0) return entries.map((e) => ({ ...e, share: 0, cumulativeShare: 0, curve: "C" }));
  const sorted = [...entries].sort((a, b) => b.revenue - a.revenue);
  let cum = 0;
  return sorted.map((e) => {
    const share = e.revenue / total;
    cum += share;
    const curve: "A" | "B" | "C" = cum <= 0.8 ? "A" : cum <= 0.95 ? "B" : "C";
    return { ...e, share, cumulativeShare: cum, curve };
  });
}

export function productABC(orders: ImportedOrder[], products: ImportedProduct[]): ABCEntry<ImportedProduct>[] {
  const byProduct = new Map<string, { revenue: number; units: number }>();
  for (const o of orders) {
    for (const it of o.items) {
      const cur = byProduct.get(it.productId) ?? { revenue: 0, units: 0 };
      cur.revenue += it.totalBRL;
      cur.units += it.quantity;
      byProduct.set(it.productId, cur);
    }
  }
  const productMap = new Map(products.map((p) => [p.id, p]));
  const entries = [...byProduct.entries()]
    .map(([id, v]) => { const item = productMap.get(id); return item ? { item, ...v } : null; })
    .filter(Boolean) as { item: ImportedProduct; revenue: number; units: number }[];
  return classifyABC(entries);
}

export interface SubgroupABCEntry {
  id: string;
  name: string;
  revenue: number;
  units: number;
  productCount: number;
  share: number;
  cumulativeShare: number;
  curve: "A" | "B" | "C";
}

/** ABC analysis aggregated by product category (subgroup). */
export function subgroupABC(orders: ImportedOrder[]): SubgroupABCEntry[] {
  const bySubgroup = new Map<string, { name: string; revenue: number; units: number; products: Set<string> }>();
  for (const o of orders) {
    for (const it of o.items) {
      const cur = bySubgroup.get(it.subgroupId) ?? { name: it.subgroupName, revenue: 0, units: 0, products: new Set<string>() };
      cur.revenue += it.totalBRL;
      cur.units += it.quantity;
      cur.products.add(it.productId);
      bySubgroup.set(it.subgroupId, cur);
    }
  }
  const total = [...bySubgroup.values()].reduce((s, v) => s + v.revenue, 0);
  const sorted = [...bySubgroup.entries()].sort((a, b) => b[1].revenue - a[1].revenue);
  let cum = 0;
  return sorted.map(([id, v]) => {
    const share = total === 0 ? 0 : v.revenue / total;
    cum += share;
    const curve: "A" | "B" | "C" = total === 0 ? "C" : cum <= 0.8 ? "A" : cum <= 0.95 ? "B" : "C";
    return {
      id,
      name: v.name,
      revenue: v.revenue,
      units: v.units,
      productCount: v.products.size,
      share,
      cumulativeShare: cum,
      curve,
    };
  });
}

export function customerABC(orders: ImportedOrder[], clients: ImportedClient[]): ABCEntry<ImportedClient>[] {
  const byClient = new Map<string, { revenue: number; units: number }>();
  for (const o of orders) {
    const cur = byClient.get(o.clientId) ?? { revenue: 0, units: 0 };
    cur.revenue += o.totalBRL;
    cur.units += 1;
    byClient.set(o.clientId, cur);
  }
  const cmap = new Map(clients.map((c) => [c.id, c]));
  const entries = [...byClient.entries()]
    .map(([id, v]) => { const item = cmap.get(id); return item ? { item, ...v } : null; })
    .filter(Boolean) as { item: ImportedClient; revenue: number; units: number }[];
  return classifyABC(entries);
}
