"use client";

import { create } from "zustand";
import { FALLBACK_RATES } from "@/lib/types/dataset";

const TTL_MS = 60 * 60 * 1000; // 1 hour

interface ExchangeRatesState {
  rates: Record<string, number>; // currencyId → value in R$
  lastFetch: number;
  isLoading: boolean;
  fetchError: string | null;
  fetchRates: () => Promise<void>;
}

export const useExchangeRates = create<ExchangeRatesState>()((set, get) => ({
  rates: { ...FALLBACK_RATES },
  lastFetch: 0,
  isLoading: false,
  fetchError: null,

  fetchRates: async () => {
    const { lastFetch, isLoading } = get();
    if (isLoading || Date.now() - lastFetch < TTL_MS) return;
    set({ isLoading: true, fetchError: null });
    try {
      const res = await fetch("https://open.er-api.com/v6/latest/BRL");
      const data = await res.json();
      if (data?.rates) {
        // API returns: how many foreign units per 1 BRL
        // To get "R$ per 1 foreign unit": 1 / rate
        const updated: Record<string, number> = {
          "1": 1,
          "2": data.rates.USD ? 1 / data.rates.USD : FALLBACK_RATES["2"]!,
          "3": data.rates.PYG ? 1 / data.rates.PYG : FALLBACK_RATES["3"]!,
        };
        set({ rates: updated, lastFetch: Date.now(), isLoading: false });
      } else {
        set({ isLoading: false });
      }
    } catch {
      set({ isLoading: false, fetchError: "Câmbio offline — usando taxas aproximadas." });
    }
  },
}));
