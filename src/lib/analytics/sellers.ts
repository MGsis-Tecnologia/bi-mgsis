import type { ImportedOrder, ImportedSeller } from "@/lib/types/dataset";

export interface SellerMetric {
  seller: ImportedSeller;
  revenue: number;
  orders: number;
  averageTicket: number;
  marginPct: number;
  discount: number;      // desconto concedido total (display)
  discountPct: number;   // discount / (revenue + discount) — % sobre a venda bruta
  achievement: number; // 0..1 — proportional to top seller (best = 1.0)
}

export function sellerMetrics(orders: ImportedOrder[], sellers: ImportedSeller[]): SellerMetric[] {
  const map = new Map<string, { rev: number; cnt: number; profit: number; disc: number }>();
  for (const o of orders) {
    const cur = map.get(o.sellerId) ?? { rev: 0, cnt: 0, profit: 0, disc: 0 };
    cur.rev += o.totalBRL;
    cur.profit += o.profitBRL;
    cur.disc += o.discountBRL;
    cur.cnt += 1;
    map.set(o.sellerId, cur);
  }

  const results = sellers.map((s) => {
    const stat = map.get(s.id) ?? { rev: 0, cnt: 0, profit: 0, disc: 0 };
    return {
      seller: s,
      revenue: stat.rev,
      orders: stat.cnt,
      averageTicket: stat.cnt > 0 ? stat.rev / stat.cnt : 0,
      marginPct: stat.rev > 0 ? stat.profit / stat.rev : 0,
      discount: stat.disc,
      discountPct: stat.rev + stat.disc > 0 ? stat.disc / (stat.rev + stat.disc) : 0,
      achievement: 0, // filled below
    };
  }).sort((a, b) => b.revenue - a.revenue);

  const maxRevenue = results[0]?.revenue ?? 1;
  for (const r of results) {
    r.achievement = maxRevenue > 0 ? r.revenue / maxRevenue : 0;
  }
  return results;
}
