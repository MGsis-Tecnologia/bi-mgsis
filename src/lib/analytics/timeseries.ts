import type { ImportedOrder } from "@/lib/types/dataset";
import type { DateRange } from "@/lib/types";
import { eachDayKey, eachMonthKey } from "@/lib/utils/dates";

export interface TimePoint {
  key: string;
  label: string;
  revenue: number;
  orders: number;
  profit: number;
  cost: number;
  discount: number;      // desconto concedido no período (display)
  discountPct: number;   // discount / (revenue + discount)
}

function monthLabel(key: string): string {
  const [y, m] = key.split("-");
  const date = new Date(Number(y), Number(m) - 1, 1);
  return new Intl.DateTimeFormat("pt-BR", { month: "short" }).format(date);
}

function dayLabel(key: string): string {
  const d = new Date(key + "T00:00:00");
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short" }).format(d);
}

// Preenche discountPct de cada ponto (após a soma) e devolve a lista.
function finalizeDiscount(points: TimePoint[]): TimePoint[] {
  for (const p of points) {
    p.discountPct = p.revenue + p.discount > 0 ? p.discount / (p.revenue + p.discount) : 0;
  }
  return points;
}

export function monthlySeries(orders: ImportedOrder[], range: DateRange): TimePoint[] {
  const keys = eachMonthKey(range);
  const map = new Map<string, TimePoint>();
  for (const k of keys) {
    map.set(k, { key: k, label: monthLabel(k), revenue: 0, orders: 0, profit: 0, cost: 0, discount: 0, discountPct: 0 });
  }
  for (const o of orders) {
    const k = o.date.slice(0, 7); // YYYY-MM
    const cur = map.get(k);
    if (!cur) continue;
    cur.revenue += o.totalBRL;
    cur.profit += o.profitBRL;
    cur.cost += o.costBRL;
    cur.discount += o.discountBRL;
    cur.orders += 1;
  }
  return finalizeDiscount([...map.values()]);
}

export function dailySeries(orders: ImportedOrder[], range: DateRange): TimePoint[] {
  const keys = eachDayKey(range);
  const map = new Map<string, TimePoint>();
  for (const k of keys) {
    map.set(k, { key: k, label: dayLabel(k), revenue: 0, orders: 0, profit: 0, cost: 0, discount: 0, discountPct: 0 });
  }
  for (const o of orders) {
    const k = o.date.slice(0, 10); // YYYY-MM-DD
    const cur = map.get(k);
    if (!cur) continue;
    cur.revenue += o.totalBRL;
    cur.profit += o.profitBRL;
    cur.cost += o.costBRL;
    cur.discount += o.discountBRL;
    cur.orders += 1;
  }
  return finalizeDiscount([...map.values()]);
}

export function heatmapByDayOfWeek(orders: ImportedOrder[]): { matrix: number[][]; max: number } {
  const matrix: number[][] = Array.from({ length: 7 }, () => Array(6).fill(0));
  let max = 0;
  for (const o of orders) {
    const d = new Date(o.date + "T00:00:00");
    const wd = d.getDay(); // 0=domingo … 6=sábado
    // Semana de CALENDÁRIO dentro do mês (não faixa por número do dia): alinha
    // pelo dia da semana em que o mês começou, para cada semana começar no
    // domingo. Assim dias consecutivos ficam na mesma coluna, como num calendário.
    const firstWeekday = new Date(d.getFullYear(), d.getMonth(), 1).getDay();
    const week = Math.min(5, Math.floor((d.getDate() - 1 + firstWeekday) / 7));
    matrix[wd]![week]! += o.totalBRL;
    if (matrix[wd]![week]! > max) max = matrix[wd]![week]!;
  }
  return { matrix, max };
}
