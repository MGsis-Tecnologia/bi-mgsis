import type { Customer, Order } from "@/lib/types";

export interface CustomerMetric {
  customer: Customer;
  orders: number;
  revenue: number;
  averageTicket: number;
  lastPurchaseAt: string | null;
  recencyDays: number;
  ltv: number; // here equivalent to revenue (12m sample)
}

export function customerMetrics(orders: Order[], customers: Customer[]): CustomerMetric[] {
  const now = Date.now();
  const map = new Map<string, { rev: number; cnt: number; lastTs: number }>();
  for (const o of orders) {
    if (o.status === "cancelado") continue;
    const ts = new Date(o.date).getTime();
    const cur = map.get(o.customerId) ?? { rev: 0, cnt: 0, lastTs: 0 };
    cur.rev += o.totalBRL;
    cur.cnt += 1;
    if (ts > cur.lastTs) cur.lastTs = ts;
    map.set(o.customerId, cur);
  }
  return customers.map((c) => {
    const s = map.get(c.id);
    return {
      customer: c,
      orders: s?.cnt ?? 0,
      revenue: s?.rev ?? 0,
      averageTicket: s && s.cnt > 0 ? s.rev / s.cnt : 0,
      lastPurchaseAt: s?.lastTs ? new Date(s.lastTs).toISOString() : null,
      recencyDays: s?.lastTs ? Math.floor((now - s.lastTs) / 86400000) : Infinity,
      ltv: s?.rev ?? 0,
    };
  });
}

export function segmentBreakdown(customers: Customer[]) {
  const out: Record<string, number> = {};
  for (const c of customers) out[c.segment] = (out[c.segment] ?? 0) + 1;
  return out;
}
