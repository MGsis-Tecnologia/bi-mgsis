import type { Order, Seller } from "@/lib/types";

export interface SellerMetric {
  seller: Seller;
  revenue: number;
  orders: number;
  averageTicket: number;
  marginPct: number;
  commissionDue: number;
  goalMonthly: number;
  achievement: number; // 0..1+
}

export function sellerMetrics(
  orders: Order[],
  sellers: Seller[],
  monthsCovered = 12
): SellerMetric[] {
  const map = new Map<string, { rev: number; cnt: number; profit: number }>();
  for (const o of orders) {
    if (o.status === "cancelado") continue;
    const cur = map.get(o.sellerId) ?? { rev: 0, cnt: 0, profit: 0 };
    cur.rev += o.totalBRL;
    cur.profit += o.profitBRL;
    cur.cnt += 1;
    map.set(o.sellerId, cur);
  }
  return sellers
    .map((s) => {
      const stat = map.get(s.id) ?? { rev: 0, cnt: 0, profit: 0 };
      const monthlyAvg = stat.rev / Math.max(1, monthsCovered);
      return {
        seller: s,
        revenue: stat.rev,
        orders: stat.cnt,
        averageTicket: stat.cnt > 0 ? stat.rev / stat.cnt : 0,
        marginPct: stat.rev > 0 ? stat.profit / stat.rev : 0,
        commissionDue: stat.rev * s.commissionRate,
        goalMonthly: s.monthlyGoalBRL,
        achievement: s.monthlyGoalBRL > 0 ? monthlyAvg / s.monthlyGoalBRL : 0,
      };
    })
    .sort((a, b) => b.revenue - a.revenue);
}
