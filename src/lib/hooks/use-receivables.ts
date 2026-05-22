"use client";

import * as React from "react";
import { useDatasetStore } from "@/lib/store/dataset";
import { useExchangeRates } from "@/lib/store/exchange-rates";
import { useFilters } from "@/lib/store/filters";
import { buildReceivableRow, todayMs, type ReceivableRow } from "@/lib/analytics/receivables";
import type { ReceivableItem } from "@/lib/types/dataset";

const EMPTY_ITEMS: ReceivableItem[] = [];

export interface ReceivablesView {
  rows: ReceivableRow[];                       // currency-filtered + converted
  sellers: { id: string; name: string }[];
  entryTypes: string[];
  hasData: boolean;                            // true when a receivables file is loaded
}

// ─── Build display rows applying the currency mode (mirrors useDataset) ───────

export function useReceivables(): ReceivablesView {
  const items = useDatasetStore((s) => s.receivables?.items ?? EMPTY_ITEMS);
  const currency = useFilters((s) => s.currency);
  const rates = useExchangeRates((s) => s.rates);

  return React.useMemo(() => {
    if (items.length === 0) {
      return { rows: [], sellers: [], entryTypes: [], hasData: false };
    }

    const reference = todayMs();
    const rows: ReceivableRow[] = [];
    for (const item of items) {
      // Currency filter: skip titles that don't match when a specific currency is selected
      if (currency !== "ALL" && item.currencyId !== currency) continue;
      // ALL mode converts each title to R$ by its currency rate
      const rate = currency === "ALL" ? (rates[item.currencyId] ?? 1) : 1;
      rows.push(buildReceivableRow(item, item.amountOrig * rate, reference));
    }

    const sellerMap = new Map<string, string>();
    const typeSet = new Set<string>();
    for (const r of rows) {
      if (r.sellerId && !sellerMap.has(r.sellerId)) sellerMap.set(r.sellerId, r.sellerName);
      if (r.entryType) typeSet.add(r.entryType);
    }

    return {
      rows,
      sellers: [...sellerMap.entries()]
        .map(([id, name]) => ({ id, name }))
        .sort((a, b) => a.name.localeCompare(b.name)),
      entryTypes: [...typeSet].sort(),
      hasData: true,
    };
  }, [items, currency, rates]);
}

// ─── Apply the global filters: period (by due date) + seller ──────────────────
// The date-range presets all end "today", so applying their upper bound would
// hide every future ("a vencer") title. We therefore use only the lower bound
// for standard presets and honour both bounds for an explicit custom range.

export function useFilteredReceivables(): ReceivableRow[] {
  const { rows } = useReceivables();
  const preset = useFilters((s) => s.preset);
  const customRange = useFilters((s) => s.customRange);
  const sellerId = useFilters((s) => s.sellerId);
  const getRange = useFilters((s) => s.getRange);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const range = React.useMemo(() => getRange(), [preset, customRange, getRange]);

  return React.useMemo(() => {
    const fromMs = range.from.getTime();
    const toMs = range.to.getTime();
    const isCustom = preset === "custom";

    return rows.filter((r) => {
      const dueMs = new Date(r.dueDate + "T00:00:00").getTime();
      if (dueMs < fromMs) return false;
      if (isCustom && dueMs > toMs) return false;
      if (sellerId !== "all" && r.sellerId !== sellerId) return false;
      return true;
    });
  }, [rows, range, preset, sellerId]);
}
