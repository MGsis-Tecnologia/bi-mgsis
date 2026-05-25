import type { ImportedOrder } from "@/lib/types/dataset";

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
  const rows: YearlyRow[] = [...map.values()]
    .sort((a, b) => b.total - a.total)
    .slice(0, topN)
    .map((entry) => {
      let growth: number | null = null;
      if (years.length >= 2) {
        const last = entry.byYear[years[years.length - 1]!] ?? 0;
        const prev = entry.byYear[years[years.length - 2]!] ?? 0;
        growth = prev > 0 ? (last - prev) / prev : null;
      }
      return { key: entry.label, label: entry.label, byYear: entry.byYear, total: entry.total, growth };
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
