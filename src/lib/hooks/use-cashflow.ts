"use client";

import * as React from "react";
import { useDatasetStore } from "@/lib/store/dataset";
import { useExchangeRates } from "@/lib/store/exchange-rates";
import { useFilters } from "@/lib/store/filters";
import type { CaixaItem } from "@/lib/types/dataset";

const EMPTY_ITEMS: CaixaItem[] = [];

export interface CaixaView {
  items: CaixaItem[];
  hasData: boolean;
}

export function useCaixa(): CaixaView {
  const items = useDatasetStore((s) => s.caixa?.items ?? EMPTY_ITEMS);
  const currency = useFilters((s) => s.currency);
  const rates = useExchangeRates((s) => s.rates);

  return React.useMemo(() => {
    if (items.length === 0) return { items: [], hasData: false };

    const filtered: CaixaItem[] = [];
    for (const item of items) {
      if (currency !== "ALL" && item.moedaId !== currency) continue;
      if (currency === "ALL" && item.moedaId !== "1") {
        const rate = rates[item.moedaId] ?? 1;
        filtered.push({ ...item, valorDocumento: item.valorDocumento * rate });
      } else {
        filtered.push(item);
      }
    }

    return { items: filtered, hasData: true };
  }, [items, currency, rates]);
}

// Filter by date range (caixa_data_emissao)
export function useFilteredCaixa(): CaixaItem[] {
  const { items } = useCaixa();
  const preset = useFilters((s) => s.preset);
  const customRange = useFilters((s) => s.customRange);
  const getRange = useFilters((s) => s.getRange);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const range = React.useMemo(() => getRange(), [preset, customRange, getRange]);

  return React.useMemo(() => {
    const fromMs = range.from.getTime();
    const toMs = range.to.getTime();
    return items.filter((item) => {
      const ms = new Date(item.date + "T00:00:00").getTime();
      return ms >= fromMs && ms <= toMs;
    });
  }, [items, range]);
}
