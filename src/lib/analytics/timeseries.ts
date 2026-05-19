import type { DateRange, Order } from "@/lib/types";
import { eachDayKey, eachMonthKey } from "@/lib/utils/dates";

export interface TimePoint {
  key: string;
  label: string;
  revenue: number;
  orders: number;
  profit: number;
  cost: number;
}

function monthLabel(key: string): string {
  const [y, m] = key.split("-");
  const date = new Date(Number(y), Number(m) - 1, 1);
  return new Intl.DateTimeFormat("pt-BR", { month: "short" }).format(date);
}

function dayLabel(key: string): string {
  const d = new Date(key);
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short" }).format(d);
}

export function monthlySeries(orders: Order[], range: DateRange): TimePoint[] {
  const keys = eachMonthKey(range);
  const map = new Map<string, TimePoint>();
  for (const k of keys) {
    map.set(k, { key: k, label: monthLabel(k), revenue: 0, orders: 0, profit: 0, cost: 0 });
  }
  for (const o of orders) {
    if (o.status === "cancelado") continue;
    const d = new Date(o.date);
    const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const cur = map.get(k);
    if (!cur) continue;
    cur.revenue += o.totalBRL;
    cur.profit += o.profitBRL;
    cur.cost += o.costBRL;
    cur.orders += 1;
  }
  return [...map.values()];
}

export function dailySeries(orders: Order[], range: DateRange): TimePoint[] {
  const keys = eachDayKey(range);
  const map = new Map<string, TimePoint>();
  for (const k of keys) {
    map.set(k, { key: k, label: dayLabel(k), revenue: 0, orders: 0, profit: 0, cost: 0 });
  }
  for (const o of orders) {
    if (o.status === "cancelado") continue;
    const k = o.date.slice(0, 10);
    const cur = map.get(k);
    if (!cur) continue;
    cur.revenue += o.totalBRL;
    cur.profit += o.profitBRL;
    cur.cost += o.costBRL;
    cur.orders += 1;
  }
  return [...map.values()];
}

export interface HeatmapCell {
  weekday: number; // 0..6 (Sun..Sat)
  hour: number; // 0..23 (here we'll use day-of-month bands)
  intensity: number;
}

export function heatmapByDayOfWeek(orders: Order[]): {
  matrix: number[][]; // [weekday][weekOfMonth]
  max: number;
} {
  const matrix: number[][] = Array.from({ length: 7 }, () => Array(6).fill(0));
  let max = 0;
  for (const o of orders) {
    if (o.status === "cancelado") continue;
    const d = new Date(o.date);
    const wd = d.getDay();
    const week = Math.min(5, Math.floor((d.getDate() - 1) / 7));
    matrix[wd]![week]! += o.totalBRL;
    if (matrix[wd]![week]! > max) max = matrix[wd]![week]!;
  }
  return { matrix, max };
}
