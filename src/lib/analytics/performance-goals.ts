import type { ImportedOrder } from "@/lib/types/dataset";

export interface Goal {
  id: string;
  name: string;
  type: "revenue" | "orders" | "margin" | "ticket";
  target: number;
  period: "month" | "quarter" | "year";
  owner?: string; // seller name or "all"
}

export interface PerformanceVsGoal {
  goalId: string;
  goalName: string;
  type: string;
  target: number;
  actual: number;
  variance: number; // actual - target
  variancePct: number; // (actual - target) / target * 100
  achievement: number; // actual / target * 100
  status: "exceeded" | "on-track" | "at-risk" | "missed";
  owner?: string;
}

export const DEFAULT_GOALS: Goal[] = [
  {
    id: "revenue-month",
    name: "Monthly Revenue",
    type: "revenue",
    target: 50000,
    period: "month",
  },
  {
    id: "orders-month",
    name: "Monthly Orders",
    type: "orders",
    target: 100,
    period: "month",
  },
  {
    id: "margin-month",
    name: "Monthly Profit Margin",
    type: "margin",
    target: 25,
    period: "month",
  },
  {
    id: "ticket-month",
    name: "Average Ticket",
    type: "ticket",
    target: 500,
    period: "month",
  },
];

function getStatus(achievement: number): PerformanceVsGoal["status"] {
  if (achievement >= 100) return "exceeded";
  if (achievement >= 85) return "on-track";
  if (achievement >= 70) return "at-risk";
  return "missed";
}

export function calculatePerformanceVsGoals(
  orders: ImportedOrder[],
  goals: Goal[] = DEFAULT_GOALS
): PerformanceVsGoal[] {
  const results: PerformanceVsGoal[] = [];

  for (const goal of goals) {
    let actual = 0;

    switch (goal.type) {
      case "revenue":
        actual = orders.reduce((sum, o) => sum + o.totalBRL, 0);
        break;
      case "orders":
        actual = orders.length;
        break;
      case "margin": {
        const totalRevenue = orders.reduce((sum, o) => sum + o.totalBRL, 0);
        const totalProfit = orders.reduce((sum, o) => sum + o.profitBRL, 0);
        actual = totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0;
        break;
      }
      case "ticket":
        actual = orders.length > 0 ? orders.reduce((sum, o) => sum + o.totalBRL, 0) / orders.length : 0;
        break;
    }

    const variance = actual - goal.target;
    const variancePct = goal.target > 0 ? (variance / goal.target) * 100 : 0;
    const achievement = goal.target > 0 ? (actual / goal.target) * 100 : 0;

    results.push({
      goalId: goal.id,
      goalName: goal.name,
      type: goal.type,
      target: goal.target,
      actual,
      variance,
      variancePct,
      achievement,
      status: getStatus(achievement),
      owner: goal.owner,
    });
  }

  return results;
}

export function calculateSellerGoals(
  orders: ImportedOrder[],
  sellerId?: string
): PerformanceVsGoal[] {
  const sellerOrders = sellerId
    ? orders.filter((o) => o.sellerId === sellerId)
    : orders;

  return calculatePerformanceVsGoals(sellerOrders);
}

export function getStatusColor(status: PerformanceVsGoal["status"]): string {
  switch (status) {
    case "exceeded":
      return "hsl(var(--accent))"; // green
    case "on-track":
      return "hsl(var(--primary))";
    case "at-risk":
      return "hsl(var(--chart-4))"; // orange
    case "missed":
      return "hsl(var(--destructive))"; // red
  }
}

export function getStatusLabel(status: PerformanceVsGoal["status"]): string {
  switch (status) {
    case "exceeded":
      return "Exceeded";
    case "on-track":
      return "On Track";
    case "at-risk":
      return "At Risk";
    case "missed":
      return "Missed";
  }
}
