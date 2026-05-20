"use client";

import * as React from "react";
import { formatCurrency, formatNumber } from "@/lib/utils/format";
import { useFilters } from "@/lib/store/filters";

interface RechartsTooltipPayloadItem {
  name: string;
  value: number;
  color: string;
  dataKey: string;
  payload?: Record<string, unknown>;
}

export function ChartTooltip({
  active,
  payload,
  label,
  formatter,
  showCurrency = true,
}: {
  active?: boolean;
  payload?: RechartsTooltipPayloadItem[];
  label?: string;
  formatter?: (v: number, key: string) => string;
  showCurrency?: boolean;
}) {
  const currency = useFilters((s) => s.currency);
  if (!active || !payload || payload.length === 0) return null;

  return (
    <div className="rounded-md border border-border bg-surface-elevated/95 px-3 py-2 text-xs shadow-xl shadow-foreground/10 backdrop-blur">
      {label !== undefined && (
        <div className="pb-1.5 text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
          {String(label)}
        </div>
      )}
      <div className="flex flex-col gap-1">
        {payload.map((entry, i) => {
          const isCurrency =
            showCurrency &&
            !["orders", "quantity", "count"].some((k) => entry.dataKey.toLowerCase().includes(k));
          const v = entry.value;
          const out =
            formatter?.(v, entry.dataKey) ??
            (isCurrency
              ? formatCurrency(v, currency, { compact: false })
              : formatNumber(v));
          return (
            <div key={i} className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-2">
                <span
                  className="h-2 w-2 rounded-full"
                  style={{ background: entry.color }}
                />
                <span className="text-foreground/80">{entry.name}</span>
              </div>
              <span className="tabular font-medium text-foreground">{out}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
