"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Channel, CurrencyCode, DatePreset, DateRange, Region } from "@/lib/types";
import { presetRange } from "@/lib/utils/dates";

interface FiltersState {
  preset: DatePreset;
  customRange: { from: string; to: string } | null;
  currency: CurrencyCode;
  region: Region | "all";
  channel: Channel | "all";
  sellerId: string | "all";
  categoryId: string | "all";
  setPreset: (p: DatePreset) => void;
  setCustomRange: (r: { from: Date; to: Date }) => void;
  setCurrency: (c: CurrencyCode) => void;
  setRegion: (r: Region | "all") => void;
  setChannel: (c: Channel | "all") => void;
  setSeller: (id: string | "all") => void;
  setCategory: (id: string | "all") => void;
  resetFilters: () => void;
  getRange: () => DateRange;
}

export const useFilters = create<FiltersState>()(
  persist(
    (set, get) => ({
      preset: "12m",
      customRange: null,
      currency: "BRL",
      region: "all",
      channel: "all",
      sellerId: "all",
      categoryId: "all",
      setPreset: (preset) => set({ preset, customRange: null }),
      setCustomRange: ({ from, to }) =>
        set({
          preset: "custom",
          customRange: { from: from.toISOString(), to: to.toISOString() },
        }),
      setCurrency: (currency) => set({ currency }),
      setRegion: (region) => set({ region }),
      setChannel: (channel) => set({ channel }),
      setSeller: (sellerId) => set({ sellerId }),
      setCategory: (categoryId) => set({ categoryId }),
      resetFilters: () =>
        set({
          preset: "12m",
          customRange: null,
          region: "all",
          channel: "all",
          sellerId: "all",
          categoryId: "all",
        }),
      getRange: () => {
        const { preset, customRange } = get();
        if (preset === "custom" && customRange) {
          return { from: new Date(customRange.from), to: new Date(customRange.to) };
        }
        return presetRange(preset);
      },
    }),
    {
      name: "dash-bi-filters",
      partialize: (s) => ({
        preset: s.preset,
        customRange: s.customRange,
        currency: s.currency,
        region: s.region,
        channel: s.channel,
        sellerId: s.sellerId,
        categoryId: s.categoryId,
      }),
    }
  )
);
