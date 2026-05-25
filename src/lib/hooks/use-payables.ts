"use client";

import * as React from "react";
import { useDatasetStore } from "@/lib/store/dataset";
import { useExchangeRates } from "@/lib/store/exchange-rates";
import { useFilters } from "@/lib/store/filters";
import { buildPayableRow, todayMs, type PayableRow } from "@/lib/analytics/payables";
import type { PayableItem } from "@/lib/types/dataset";

const EMPTY_ITEMS: PayableItem[] = [];

export interface PayablesView {
  rows: PayableRow[];
  entryTypes: string[];
  hasData: boolean;
}

export function usePayables(): PayablesView {
  const items = useDatasetStore((s) => s.payables?.items ?? EMPTY_ITEMS);
  const currency = useFilters((s) => s.currency);
  const rates = useExchangeRates((s) => s.rates);

  return React.useMemo(() => {
    if (items.length === 0) {
      return { rows: [], entryTypes: [], hasData: false };
    }

    const reference = todayMs();
    const rows: PayableRow[] = [];
    for (const item of items) {
      if (currency !== "ALL" && item.currencyId !== currency) continue;
      const rate = currency === "ALL" ? (rates[item.currencyId] ?? 1) : 1;
      rows.push(buildPayableRow(item, item.amountOrig * rate, reference));
    }

    const typeSet = new Set<string>();
    for (const r of rows) {
      if (r.entryType) typeSet.add(r.entryType);
    }

    return {
      rows,
      entryTypes: [...typeSet].sort(),
      hasData: true,
    };
  }, [items, currency, rates]);
}

// Apply global filters: period (by due date).
// Same logic as receivables: for non-custom presets, only apply lower bound so
// future "a vencer" titles remain visible.
export function useFilteredPayables(): PayableRow[] {
  const { rows } = usePayables();
  const preset = useFilters((s) => s.preset);
  const customRange = useFilters((s) => s.customRange);
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
      return true;
    });
  }, [rows, range, preset]);
}
