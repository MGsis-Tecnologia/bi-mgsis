"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { AppCurrencyId } from "@/lib/types/dataset";
import type { DatePreset, DateRange } from "@/lib/types";
import { presetRange } from "@/lib/utils/dates";

interface FiltersState {
  preset: DatePreset;
  customRange: { from: string; to: string } | null;
  currency: AppCurrencyId;      // "1"|"2"|"3" = filter by that currency; "ALL" = all + convert to R$
  channel: string | "all";      // "Atacado" | "Varejo" | "all"
  sellerId: string | "all";
  subgroupId: string | "all";   // replaces categoryId
  setPreset: (p: DatePreset) => void;
  setCustomRange: (r: { from: Date; to: Date }) => void;
  setCurrency: (c: AppCurrencyId) => void;
  setChannel: (c: string | "all") => void;
  setSeller: (id: string | "all") => void;
  setSubgroup: (id: string | "all") => void;
  resetFilters: () => void;
  getRange: () => DateRange;
}

export const useFilters = create<FiltersState>()(
  persist(
    (set, get) => ({
      preset: "12m",
      customRange: null,
      currency: "ALL",
      channel: "all",
      sellerId: "all",
      subgroupId: "all",
      setPreset: (preset) => set({ preset, customRange: null }),
      setCustomRange: ({ from, to }) =>
        set({ preset: "custom", customRange: { from: from.toISOString(), to: to.toISOString() } }),
      setCurrency: (currency) => set({ currency }),
      setChannel: (channel) => set({ channel }),
      setSeller: (sellerId) => set({ sellerId }),
      setSubgroup: (subgroupId) => set({ subgroupId }),
      resetFilters: () =>
        set({ preset: "12m", customRange: null, channel: "all", sellerId: "all", subgroupId: "all" }),
      getRange: () => {
        const { preset, customRange } = get();
        if (preset === "custom" && customRange) {
          return { from: new Date(customRange.from), to: new Date(customRange.to) };
        }
        return presetRange(preset);
      },
    }),
    {
      name: "mgsis-filters",
      partialize: (s) => ({
        preset: s.preset,
        customRange: s.customRange,
        currency: s.currency,
        channel: s.channel,
        sellerId: s.sellerId,
        subgroupId: s.subgroupId,
      }),
    }
  )
);
