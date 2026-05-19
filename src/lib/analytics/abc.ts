import type { Customer, Order, Product } from "@/lib/types";

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
    let curve: "A" | "B" | "C" = "C";
    if (cum <= 0.8) curve = "A";
    else if (cum <= 0.95) curve = "B";
    return { ...e, share, cumulativeShare: cum, curve };
  });
}

export function productABC(orders: Order[], products: Product[]): ABCEntry<Product>[] {
  const byProduct = new Map<string, { revenue: number; units: number }>();
  for (const o of orders) {
    if (o.status === "cancelado") continue;
    for (const it of o.items) {
      const cur = byProduct.get(it.productId) ?? { revenue: 0, units: 0 };
      cur.revenue += it.unitPriceBRL * it.quantity * (1 - it.discountPct);
      cur.units += it.quantity;
      byProduct.set(it.productId, cur);
    }
  }
  const productMap = new Map(products.map((p) => [p.id, p]));
  const entries = [...byProduct.entries()]
    .map(([id, v]) => {
      const item = productMap.get(id);
      return item ? { item, revenue: v.revenue, units: v.units } : null;
    })
    .filter(Boolean) as { item: Product; revenue: number; units: number }[];
  return classifyABC(entries);
}

export function customerABC(orders: Order[], customers: Customer[]): ABCEntry<Customer>[] {
  const byCustomer = new Map<string, { revenue: number; units: number }>();
  for (const o of orders) {
    if (o.status === "cancelado") continue;
    const cur = byCustomer.get(o.customerId) ?? { revenue: 0, units: 0 };
    cur.revenue += o.totalBRL;
    cur.units += 1;
    byCustomer.set(o.customerId, cur);
  }
  const cmap = new Map(customers.map((c) => [c.id, c]));
  const entries = [...byCustomer.entries()]
    .map(([id, v]) => {
      const item = cmap.get(id);
      return item ? { item, revenue: v.revenue, units: v.units } : null;
    })
    .filter(Boolean) as { item: Customer; revenue: number; units: number }[];
  return classifyABC(entries);
}
