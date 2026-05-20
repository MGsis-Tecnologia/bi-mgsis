import type { ImportedOrder, ImportedClient } from "@/lib/types/dataset";

export interface CustomerMetric {
  client: ImportedClient;
  orders: number;
  revenue: number;
  averageTicket: number;
  lastPurchaseDate: string | null;
  recencyDays: number;
  ltv: number;
  segment: "vip" | "fiel" | "promissor" | "novo" | "em-risco" | "inativo";
}

function computeSegment(
  cnt: number,
  recencyDays: number,
  revenue: number,
  maxRevenue: number
): CustomerMetric["segment"] {
  if (cnt === 0) return "inativo";
  if (recencyDays > 90) return "em-risco";
  if (cnt === 1) return "novo";
  if (revenue >= maxRevenue * 0.6) return "vip";
  if (cnt >= 5) return "fiel";
  return "promissor";
}

export function customerMetrics(orders: ImportedOrder[], clients: ImportedClient[]): CustomerMetric[] {
  const now = Date.now();
  const map = new Map<string, { rev: number; cnt: number; lastTs: number }>();
  for (const o of orders) {
    const ts = new Date(o.date + "T00:00:00").getTime();
    const cur = map.get(o.clientId) ?? { rev: 0, cnt: 0, lastTs: 0 };
    cur.rev += o.totalBRL;
    cur.cnt += 1;
    if (ts > cur.lastTs) cur.lastTs = ts;
    map.set(o.clientId, cur);
  }
  const allRevs = [...map.values()].map((v) => v.rev);
  const maxRevenue = allRevs.length > 0 ? Math.max(...allRevs) : 1;

  return clients.map((c) => {
    const s = map.get(c.id);
    const recencyDays = s?.lastTs ? Math.floor((now - s.lastTs) / 86400000) : Infinity;
    return {
      client: c,
      orders: s?.cnt ?? 0,
      revenue: s?.rev ?? 0,
      averageTicket: s && s.cnt > 0 ? s.rev / s.cnt : 0,
      lastPurchaseDate: s?.lastTs ? new Date(s.lastTs).toISOString().slice(0, 10) : null,
      recencyDays,
      ltv: s?.rev ?? 0,
      segment: computeSegment(s?.cnt ?? 0, recencyDays, s?.rev ?? 0, maxRevenue),
    };
  });
}

export function segmentBreakdown(metrics: CustomerMetric[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const m of metrics) out[m.segment] = (out[m.segment] ?? 0) + 1;
  return out;
}
