"use client";

import * as React from "react";
import { getDataset } from "@/lib/mock/seed";
import type { Order } from "@/lib/types";
import { useFilters } from "@/lib/store/filters";
import { isInRange } from "@/lib/utils/dates";

export function useDataset() {
  // Dataset is deterministic — safe to compute once per client lifecycle
  return React.useMemo(() => getDataset(), []);
}

export function useFilteredOrders(): Order[] {
  const ds = useDataset();
  const preset = useFilters((s) => s.preset);
  const customRange = useFilters((s) => s.customRange);
  const region = useFilters((s) => s.region);
  const channel = useFilters((s) => s.channel);
  const sellerId = useFilters((s) => s.sellerId);
  const categoryId = useFilters((s) => s.categoryId);
  const getRange = useFilters((s) => s.getRange);

  // Re-evaluate when any filter changes
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const range = React.useMemo(() => getRange(), [preset, customRange, getRange]);

  const categoryByProduct = React.useMemo(
    () => new Map(ds.products.map((p) => [p.id, p.category])),
    [ds.products]
  );

  return React.useMemo(() => {
    return ds.orders.filter((o) => {
      if (!isInRange(o.date, range)) return false;
      if (region !== "all" && o.region !== region) return false;
      if (channel !== "all" && o.channel !== channel) return false;
      if (sellerId !== "all" && o.sellerId !== sellerId) return false;
      if (categoryId !== "all") {
        // any item from chosen category
        const ok = o.items.some((it) => categoryByProduct.get(it.productId) === categoryId);
        if (!ok) return false;
      }
      return true;
    });
  }, [ds.orders, range, region, channel, sellerId, categoryId, categoryByProduct]);
}
