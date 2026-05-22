import type { ReceivableItem } from "@/lib/types/dataset";

const DAY_MS = 86400000;

// ─── Aging buckets ────────────────────────────────────────────────────────────

export type AgingBucketId = "current" | "d1_30" | "d31_60" | "d61_90" | "d90plus";

export const AGING_ORDER: AgingBucketId[] = ["current", "d1_30", "d31_60", "d61_90", "d90plus"];

// ─── Computed row (a ReceivableItem enriched with aging / display value) ──────

export interface ReceivableRow extends ReceivableItem {
  amountBRL: number;                  // display value: original currency, or converted to R$ in ALL mode
  status: "overdue" | "upcoming";
  daysOverdue: number;                // > 0 only when overdue
  daysUntilDue: number;               // >= 0, days from today to dueDate (0 when overdue)
  agingBucket: AgingBucketId;
}

function dayStart(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

/** Today at 00:00 local time, in ms — the reference point for all aging math. */
export function todayMs(): number {
  return dayStart(new Date());
}

export function buildReceivableRow(
  item: ReceivableItem,
  amountBRL: number,
  reference: number
): ReceivableRow {
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

  return {
    ...item,
    amountBRL,
    status: overdue ? "overdue" : "upcoming",
    daysOverdue,
    daysUntilDue,
    agingBucket,
  };
}

// ─── KPIs ─────────────────────────────────────────────────────────────────────

export interface ReceivablesKpis {
  total: number;
  overdue: number;
  overdueCount: number;
  upcoming: number;
  upcomingCount: number;
  overduePct: number;       // overdue / total
  titlesCount: number;
  clientsCount: number;
  avgDaysOverdue: number;   // value-weighted average days overdue (overdue titles only)
  avgTicket: number;        // total / titlesCount
  dueNext7: number;
  dueNext30: number;
}

export function emptyReceivablesKpis(): ReceivablesKpis {
  return {
    total: 0, overdue: 0, overdueCount: 0, upcoming: 0, upcomingCount: 0,
    overduePct: 0, titlesCount: 0, clientsCount: 0, avgDaysOverdue: 0,
    avgTicket: 0, dueNext7: 0, dueNext30: 0,
  };
}

export function computeReceivablesKpis(rows: ReceivableRow[]): ReceivablesKpis {
  let total = 0, overdue = 0, upcoming = 0, overdueCount = 0, upcomingCount = 0;
  let weightedDays = 0, dueNext7 = 0, dueNext30 = 0;
  const clients = new Set<string>();

  for (const r of rows) {
    total += r.amountBRL;
    clients.add(r.clientId);
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
    clientsCount: clients.size,
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

export function agingBreakdown(rows: ReceivableRow[]): AgingRow[] {
  const map = new Map<AgingBucketId, AgingRow>();
  for (const id of AGING_ORDER) map.set(id, { id, total: 0, count: 0 });
  for (const r of rows) {
    const a = map.get(r.agingBucket)!;
    a.total += r.amountBRL;
    a.count++;
  }
  return AGING_ORDER.map((id) => map.get(id)!);
}

// ─── Group-by aggregations (client / seller / city) ───────────────────────────

export interface GroupRow {
  id: string;
  label: string;
  total: number;
  overdue: number;
  upcoming: number;
  count: number;
}

function groupBy(
  rows: ReceivableRow[],
  keyFn: (r: ReceivableRow) => { id: string; label: string }
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

export function byClient(rows: ReceivableRow[]): GroupRow[] {
  return groupBy(rows, (r) => ({ id: r.clientId, label: r.clientName || r.clientId }));
}

export function bySeller(rows: ReceivableRow[]): GroupRow[] {
  return groupBy(rows, (r) => ({
    id: r.sellerId || "__none__",
    label: r.sellerName || "",
  }));
}

export function byCity(rows: ReceivableRow[]): GroupRow[] {
  return groupBy(rows, (r) => {
    const city = r.clientCity?.trim();
    return { id: city || "__none__", label: city || "" };
  });
}

// ─── Due-date timeline (curva de vencimentos) ─────────────────────────────────

export interface DuePoint {
  key: string;        // YYYY-MM
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

export function dueTimeline(rows: ReceivableRow[]): DuePoint[] {
  const map = new Map<string, DuePoint>();
  for (const r of rows) {
    const key = r.dueDate.slice(0, 7); // YYYY-MM
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
