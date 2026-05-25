import type { ImportedOrder } from "@/lib/types/dataset";

// ─── Projection ───────────────────────────────────────────────────────────────

export interface YearProjection {
  currentYear: string;
  ytd: number;        // revenue earned so far this year
  projected: number;  // estimated full-year revenue
  remaining: number;  // projected − ytd (the "to be earned" portion)
  elapsedPct: number; // what fraction of the year's pattern has elapsed (0–1)
  method: "seasonal" | "linear";
  priorYearsUsed: number; // how many prior years were used for the seasonal ratio
}

/**
 * Compute a year projection from a "YYYY-MM" → revenue map.
 *
 * Seasonal method: for each prior year, calculates what fraction of that year's
 * total fell in months ≤ currentMonth, then averages those fractions.
 * Falls back to linear (elapsed days / days in year) when no prior-year data exists.
 */
export function computeProjection(
  revenueByYearMonth: Record<string, number>,
  today: Date = new Date()
): YearProjection | null {
  const currentYear = today.getFullYear().toString();
  const currentMonth = (today.getMonth() + 1).toString().padStart(2, "0");

  // YTD: all months in current year up through current month
  let ytd = 0;
  for (const [ym, rev] of Object.entries(revenueByYearMonth)) {
    if (ym.startsWith(currentYear) && ym.slice(5, 7) <= currentMonth) ytd += rev;
  }
  if (ytd === 0) return null;

  // Identify prior years present in the data
  const priorYears = [
    ...new Set(
      Object.keys(revenueByYearMonth)
        .map((ym) => ym.slice(0, 4))
        .filter((yr) => yr < currentYear)
    ),
  ].sort();

  // Seasonal: compute Jan-to-currentMonth fraction for each prior year
  const ratios: number[] = [];
  for (const yr of priorYears) {
    let full = 0, partial = 0;
    for (const [ym, rev] of Object.entries(revenueByYearMonth)) {
      if (!ym.startsWith(yr)) continue;
      full += rev;
      if (ym.slice(5, 7) <= currentMonth) partial += rev;
    }
    if (full > 0 && partial > 0) ratios.push(partial / full);
  }

  let elapsedPct: number;
  let method: "seasonal" | "linear";

  if (ratios.length >= 1) {
    elapsedPct = ratios.reduce((a, b) => a + b, 0) / ratios.length;
    method = "seasonal";
  } else {
    const yr = today.getFullYear();
    const daysInYear = yr % 4 === 0 && (yr % 100 !== 0 || yr % 400 === 0) ? 366 : 365;
    const start = new Date(yr, 0, 1);
    const dayOfYear = Math.ceil((today.getTime() - start.getTime()) / 86400000) + 1;
    elapsedPct = dayOfYear / daysInYear;
    method = "linear";
  }

  const projected = elapsedPct > 0 ? ytd / elapsedPct : ytd;
  return {
    currentYear,
    ytd,
    projected,
    remaining: Math.max(0, projected - ytd),
    elapsedPct,
    method,
    priorYearsUsed: ratios.length,
  };
}

export interface YearlyRow {
  key: string;
  label: string;
  byYear: Record<string, number>; // year string → revenue
  total: number;
  growth: number | null; // % change last two available years, null if only 1 year
}

export interface YearlyResult {
  years: string[];
  rows: YearlyRow[];
}

function buildYearlyResult(
  map: Map<string, { label: string; byYear: Record<string, number>; total: number }>,
  years: string[],
  topN: number
): YearlyResult {
  const rows: YearlyRow[] = [...map.entries()]
    .sort(([, a], [, b]) => b.total - a.total)
    .slice(0, topN)
    .map(([mapKey, entry]) => {
      let growth: number | null = null;
      if (years.length >= 2) {
        const last = entry.byYear[years[years.length - 1]!] ?? 0;
        const prev = entry.byYear[years[years.length - 2]!] ?? 0;
        growth = prev > 0 ? (last - prev) / prev : null;
      }
      return { key: mapKey, label: entry.label, byYear: entry.byYear, total: entry.total, growth };
    });

  return { years, rows };
}

// Aggregate orders by a key derived from the order itself (seller, channel, client)
export function yearlyByOrder(
  orders: ImportedOrder[],
  keyFn: (o: ImportedOrder) => string,
  labelFn: (o: ImportedOrder) => string,
  topN = 15
): YearlyResult {
  const yearSet = new Set<string>();
  const map = new Map<string, { label: string; byYear: Record<string, number>; total: number }>();

  for (const o of orders) {
    const year = o.date.slice(0, 4);
    const key = keyFn(o);
    const label = labelFn(o);
    yearSet.add(year);

    const entry = map.get(key) ?? { label, byYear: {}, total: 0 };
    entry.byYear[year] = (entry.byYear[year] ?? 0) + o.totalBRL;
    entry.total += o.totalBRL;
    map.set(key, entry);
  }

  const years = [...yearSet].sort();
  return buildYearlyResult(map, years, topN);
}

// Aggregate orders at the line-item level (product, subgroup)
export function yearlyByItem(
  orders: ImportedOrder[],
  keyFn: (subgroupId: string, subgroupName: string, productId: string, productName: string) => { key: string; label: string },
  topN = 15
): YearlyResult {
  const yearSet = new Set<string>();
  const map = new Map<string, { label: string; byYear: Record<string, number>; total: number }>();

  for (const o of orders) {
    const year = o.date.slice(0, 4);
    yearSet.add(year);

    for (const it of o.items) {
      const { key, label } = keyFn(it.subgroupId, it.subgroupName, it.productId, it.productName);
      const entry = map.get(key) ?? { label, byYear: {}, total: 0 };
      entry.byYear[year] = (entry.byYear[year] ?? 0) + it.totalBRL;
      entry.total += it.totalBRL;
      map.set(key, entry);
    }
  }

  const years = [...yearSet].sort();
  return buildYearlyResult(map, years, topN);
}
