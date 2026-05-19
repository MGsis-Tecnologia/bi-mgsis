import type { DateRange, Order, ProductCategory } from "@/lib/types";
import { isInRange, previousComparableRange } from "@/lib/utils/dates";

export interface KpiSnapshot {
  revenue: number;
  cost: number;
  profit: number;
  marginPct: number;
  ordersCount: number;
  averageTicket: number;
  uniqueCustomers: number;
  itemsSold: number;
  discountTotal: number;
}

export function emptyKpi(): KpiSnapshot {
  return {
    revenue: 0,
    cost: 0,
    profit: 0,
    marginPct: 0,
    ordersCount: 0,
    averageTicket: 0,
    uniqueCustomers: 0,
    itemsSold: 0,
    discountTotal: 0,
  };
}

export function computeKpis(orders: Order[]): KpiSnapshot {
  let revenue = 0;
  let cost = 0;
  let discount = 0;
  let items = 0;
  const customers = new Set<string>();
  let validOrders = 0;
  for (const o of orders) {
    if (o.status === "cancelado") continue;
    revenue += o.totalBRL;
    cost += o.costBRL;
    discount += o.discountBRL;
    for (const it of o.items) items += it.quantity;
    customers.add(o.customerId);
    validOrders++;
  }
  const profit = revenue - cost;
  return {
    revenue,
    cost,
    profit,
    marginPct: revenue > 0 ? profit / revenue : 0,
    ordersCount: validOrders,
    averageTicket: validOrders > 0 ? revenue / validOrders : 0,
    uniqueCustomers: customers.size,
    itemsSold: items,
    discountTotal: discount,
  };
}

export interface KpiWithDelta extends KpiSnapshot {
  previous: KpiSnapshot;
  delta: {
    revenue: number;
    profit: number;
    marginPct: number;
    ordersCount: number;
    averageTicket: number;
    uniqueCustomers: number;
  };
}

export function computeKpisWithComparison(
  allOrders: Order[],
  range: DateRange
): KpiWithDelta {
  const current = allOrders.filter((o) => isInRange(o.date, range));
  const prev = previousComparableRange(range);
  const previous = allOrders.filter((o) => isInRange(o.date, prev));
  const cur = computeKpis(current);
  const pre = computeKpis(previous);
  const safeDelta = (a: number, b: number) => (b === 0 ? 0 : (a - b) / Math.abs(b));
  return {
    ...cur,
    previous: pre,
    delta: {
      revenue: safeDelta(cur.revenue, pre.revenue),
      profit: safeDelta(cur.profit, pre.profit),
      marginPct: cur.marginPct - pre.marginPct,
      ordersCount: safeDelta(cur.ordersCount, pre.ordersCount),
      averageTicket: safeDelta(cur.averageTicket, pre.averageTicket),
      uniqueCustomers: safeDelta(cur.uniqueCustomers, pre.uniqueCustomers),
    },
  };
}

export function revenueByCategory(orders: Order[], productCategoryById: Map<string, ProductCategory>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const o of orders) {
    if (o.status === "cancelado") continue;
    for (const it of o.items) {
      const cat = productCategoryById.get(it.productId);
      if (!cat) continue;
      out[cat] = (out[cat] ?? 0) + it.unitPriceBRL * it.quantity * (1 - it.discountPct);
    }
  }
  return out;
}
