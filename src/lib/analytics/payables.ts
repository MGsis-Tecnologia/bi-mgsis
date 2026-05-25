import type { PayableItem } from "@/lib/types/dataset";

const DAY_MS = 86400000;

// ─── Aging buckets ────────────────────────────────────────────────────────────

export type AgingBucketId = "current" | "d1_30" | "d31_60" | "d61_90" | "d90plus";

export const AGING_ORDER: AgingBucketId[] = ["current", "d1_30", "d31_60", "d61_90", "d90plus"];

// ─── Computed row (PayableItem enriched with aging / display value) ────────────

export interface PayableRow extends PayableItem {
  amountBRL: number;
  status: "overdue" | "upcoming" | "paid";
  daysOverdue: number;
  daysUntilDue: number;
  agingBucket: AgingBucketId;
}

function dayStart(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

export function todayMs(): number {
  return dayStart(new Date());
}

export function buildPayableRow(
  item: PayableItem,
  amountBRL: number,
  reference: number
): PayableRow {
  if (item.isPaid) {
    return { ...item, amountBRL, status: "paid", daysOverdue: 0, daysUntilDue: 0, agingBucket: "current" };
  }

  const dueMs = dayStart(new Date(item.dueDate + "T00:00:00"));
  const diffDays = Math.round((reference - dueMs) / DAY_MS);
  const overdue = diffDays > 0;
  const daysOverdue = overdue ? diffDays : 0;
  const daysUntilDue = overdue ? 0 : -diffDays;

  let agingBucket: AgingBucketId;
  if (daysOverdue <= 0) agingBucket = "current";
  else if (daysOverdue <= 30) agingBucket = "d1_30";
  else if (daysOverdue <= 60) agingBucket = "d31_60";
  else if (daysOverdue <= 90) agingBucket = "d61_90";
  else agingBucket = "d90plus";

  return { ...item, amountBRL, status: overdue ? "overdue" : "upcoming", daysOverdue, daysUntilDue, agingBucket };
}

// ─── KPIs ─────────────────────────────────────────────────────────────────────

export interface PayablesKpis {
  total: number;
  overdue: number;
  overdueCount: number;
  upcoming: number;
  upcomingCount: number;
  overduePct: number;
  titlesCount: number;
  suppliersCount: number;
  avgDaysOverdue: number;
  avgTicket: number;
  dueNext7: number;
  dueNext30: number;
}

export function emptyPayablesKpis(): PayablesKpis {
  return {
    total: 0, overdue: 0, overdueCount: 0, upcoming: 0, upcomingCount: 0,
    overduePct: 0, titlesCount: 0, suppliersCount: 0, avgDaysOverdue: 0,
    avgTicket: 0, dueNext7: 0, dueNext30: 0,
  };
}

export function computePayablesKpis(rows: PayableRow[]): PayablesKpis {
  let total = 0, overdue = 0, upcoming = 0, overdueCount = 0, upcomingCount = 0;
  let weightedDays = 0, dueNext7 = 0, dueNext30 = 0;
  const suppliers = new Set<string>();

  for (const r of rows) {
    total += r.amountBRL;
    suppliers.add(r.supplierId);
    if (r.status === "overdue") {
      overdue += r.amountBRL;
      overdueCount++;
      weightedDays += r.daysOverdue * r.amountBRL;
    } else {
      upcoming += r.amountBRL;
      upcomingCount++;
      if (r.daysUntilDue <= 7) dueNext7 += r.amountBRL;
      if (r.daysUntilDue <= 30) dueNext30 += r.amountBRL;
    }
  }

  return {
    total, overdue, overdueCount, upcoming, upcomingCount,
    overduePct: total > 0 ? overdue / total : 0,
    titlesCount: rows.length,
    suppliersCount: suppliers.size,
    avgDaysOverdue: overdue > 0 ? weightedDays / overdue : 0,
    avgTicket: rows.length > 0 ? total / rows.length : 0,
    dueNext7, dueNext30,
  };
}

// ─── Aging breakdown ──────────────────────────────────────────────────────────

export interface AgingRow {
  id: AgingBucketId;
  total: number;
  count: number;
}

export function agingBreakdown(rows: PayableRow[]): AgingRow[] {
  const map = new Map<AgingBucketId, AgingRow>();
  for (const id of AGING_ORDER) map.set(id, { id, total: 0, count: 0 });
  for (const r of rows) {
    const a = map.get(r.agingBucket)!;
    a.total += r.amountBRL;
    a.count++;
  }
  return AGING_ORDER.map((id) => map.get(id)!);
}

// ─── Group-by aggregations ────────────────────────────────────────────────────

export interface GroupRow {
  id: string;
  label: string;
  total: number;
  overdue: number;
  upcoming: number;
  count: number;
}

function groupBy(
  rows: PayableRow[],
  keyFn: (r: PayableRow) => { id: string; label: string }
): GroupRow[] {
  const map = new Map<string, GroupRow>();
  for (const r of rows) {
    const { id, label } = keyFn(r);
    let g = map.get(id);
    if (!g) {
      g = { id, label, total: 0, overdue: 0, upcoming: 0, count: 0 };
      map.set(id, g);
    }
    g.total += r.amountBRL;
    g.count++;
    if (r.status === "overdue") g.overdue += r.amountBRL;
    else g.upcoming += r.amountBRL;
  }
  return [...map.values()].sort((a, b) => b.total - a.total);
}

export function bySupplier(rows: PayableRow[]): GroupRow[] {
  return groupBy(rows, (r) => ({ id: r.supplierId, label: r.supplierName || r.supplierId }));
}

// ─── Due-date timeline ────────────────────────────────────────────────────────

export interface DuePoint {
  key: string;
  label: string;
  overdue: number;
  upcoming: number;
  total: number;
}

function monthLabel(key: string): string {
  const [y, m] = key.split("-");
  const d = new Date(Number(y), Number(m) - 1, 1);
  return new Intl.DateTimeFormat("pt-BR", { month: "short", year: "2-digit" }).format(d);
}

export function dueTimeline(rows: PayableRow[]): DuePoint[] {
  const map = new Map<string, DuePoint>();
  for (const r of rows) {
    const key = r.dueDate.slice(0, 7);
    let p = map.get(key);
    if (!p) {
      p = { key, label: monthLabel(key), overdue: 0, upcoming: 0, total: 0 };
      map.set(key, p);
    }
    if (r.status === "overdue") p.overdue += r.amountBRL;
    else p.upcoming += r.amountBRL;
    p.total += r.amountBRL;
  }
  return [...map.values()].sort((a, b) => a.key.localeCompare(b.key));
}

// ─── Payment performance analytics ───────────────────────────────────────────

function paymentDelayDays(dueDate: string, paidDate: string): number {
  const due  = new Date(dueDate  + "T00:00:00").getTime();
  const paid = new Date(paidDate + "T00:00:00").getTime();
  return Math.round((paid - due) / DAY_MS);
}

export interface PaymentStats {
  totalPaid: number;
  totalPending: number;
  totalAll: number;
  paymentRate: number;
  paidCount: number;
  pendingCount: number;
  avgDelayDays: number;
  pctOnTime: number;
}

export function computePaymentStats(rows: PayableRow[]): PaymentStats {
  let totalPaid = 0, totalPending = 0;
  let paidCount = 0, pendingCount = 0;
  let delaySum = 0, onTimeCount = 0;

  for (const r of rows) {
    if (r.isPaid) {
      totalPaid += r.amountBRL;
      paidCount++;
      const d = paymentDelayDays(r.dueDate, r.paidDate);
      delaySum += d;
      if (d <= 0) onTimeCount++;
    } else {
      totalPending += r.amountBRL;
      pendingCount++;
    }
  }

  const totalAll = totalPaid + totalPending;
  return {
    totalPaid, totalPending, totalAll,
    paymentRate: totalAll > 0 ? totalPaid / totalAll : 0,
    paidCount, pendingCount,
    avgDelayDays: paidCount > 0 ? delaySum / paidCount : 0,
    pctOnTime: paidCount > 0 ? onTimeCount / paidCount : 0,
  };
}

// Monthly: group by dueDate month — paid vs pending per month
export interface MonthlyPaymentRow {
  key: string;
  label: string;
  paid: number;
  pending: number;
  totalDue: number;
  paymentRate: number;
  avgDelayDays: number | null;
  paidCount: number;
}

export function monthlyPaymentAnalysis(rows: PayableRow[]): MonthlyPaymentRow[] {
  type Entry = { paid: number; pending: number; delaySum: number; paidCount: number };
  const map = new Map<string, Entry>();

  for (const r of rows) {
    const key = r.dueDate.slice(0, 7);
    const e = map.get(key) ?? { paid: 0, pending: 0, delaySum: 0, paidCount: 0 };
    if (r.isPaid) {
      e.paid += r.amountBRL;
      e.paidCount++;
      e.delaySum += paymentDelayDays(r.dueDate, r.paidDate);
    } else {
      e.pending += r.amountBRL;
    }
    map.set(key, e);
  }

  return [...map.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, e]) => {
      const totalDue = e.paid + e.pending;
      return {
        key,
        label: monthLabel(key),
        paid: e.paid,
        pending: e.pending,
        totalDue,
        paymentRate: totalDue > 0 ? e.paid / totalDue : 0,
        avgDelayDays: e.paidCount > 0 ? e.delaySum / e.paidCount : null,
        paidCount: e.paidCount,
      };
    });
}

// Per-supplier payment behaviour summary
export interface SupplierPaymentRow {
  supplierId: string;
  supplierName: string;
  paid: number;
  pending: number;
  totalDue: number;
  paymentRate: number;
  avgDelayDays: number | null;
  paidCount: number;
  pendingCount: number;
}

export function supplierPaymentAnalysis(rows: PayableRow[]): SupplierPaymentRow[] {
  type Entry = SupplierPaymentRow & { delaySum: number };
  const map = new Map<string, Entry>();

  for (const r of rows) {
    let e = map.get(r.supplierId);
    if (!e) {
      e = {
        supplierId: r.supplierId, supplierName: r.supplierName,
        paid: 0, pending: 0, totalDue: 0, paymentRate: 0, avgDelayDays: null,
        paidCount: 0, pendingCount: 0, delaySum: 0,
      };
      map.set(r.supplierId, e);
    }
    if (r.isPaid) {
      e.paid += r.amountBRL;
      e.paidCount++;
      e.delaySum += paymentDelayDays(r.dueDate, r.paidDate);
    } else {
      e.pending += r.amountBRL;
      e.pendingCount++;
    }
  }

  return [...map.values()].map(({ delaySum, ...e }) => {
    const totalDue = e.paid + e.pending;
    return {
      ...e,
      totalDue,
      paymentRate: totalDue > 0 ? e.paid / totalDue : 0,
      avgDelayDays: e.paidCount > 0 ? delaySum / e.paidCount : null,
    };
  }).sort((a, b) => b.totalDue - a.totalDue);
}
