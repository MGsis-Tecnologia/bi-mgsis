import type { ImportedOrder } from "@/lib/types/dataset";
import type { DateRange } from "@/lib/types";
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
}

export function emptyKpi(): KpiSnapshot {
  return { revenue: 0, cost: 0, profit: 0, marginPct: 0, ordersCount: 0, averageTicket: 0, uniqueCustomers: 0, itemsSold: 0 };
}

export function computeKpis(orders: ImportedOrder[]): KpiSnapshot {
  let revenue = 0, cost = 0, items = 0;
  const customers = new Set<string>();
  for (const o of orders) {
    revenue += o.totalBRL;
    cost += o.costBRL;
    for (const it of o.items) items += it.quantity;
    customers.add(o.clientId);
  }
  const profit = revenue - cost;
  return {
    revenue, cost, profit,
    marginPct: revenue > 0 ? profit / revenue : 0,
    ordersCount: orders.length,
    averageTicket: orders.length > 0 ? revenue / orders.length : 0,
    uniqueCustomers: customers.size,
    itemsSold: items,
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

export function computeKpisWithComparison(allOrders: ImportedOrder[], range: DateRange): KpiWithDelta {
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

export function revenueBySubgroup(orders: ImportedOrder[]): Record<string, { id: string; label: string; value: number }> {
  const out: Record<string, { id: string; label: string; value: number }> = {};
  for (const o of orders) {
    for (const it of o.items) {
      if (!out[it.subgroupId]) {
        out[it.subgroupId] = { id: it.subgroupId, label: it.subgroupName, value: 0 };
      }
      out[it.subgroupId]!.value += it.totalBRL;
    }
  }
  return out;
}
