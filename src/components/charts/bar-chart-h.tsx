"use client";

import * as React from "react";
import { useFilters } from "@/lib/store/filters";
import { formatCurrency, formatNumber } from "@/lib/utils/format";
import { cn } from "@/lib/utils";

interface Row {
  key: string;
  label: string;
  value: number;
  secondary?: number | string;
  tone?: "accent" | "positive" | "negative" | "muted";
}

interface Props {
  rows: Row[];
  format?: "currency" | "number" | "percent";
  className?: string;
  showRank?: boolean;
  maxRows?: number;
}

export function BarChartH({
  rows,
  format = "currency",
  className,
  showRank = true,
  maxRows = 10,
}: Props) {
  const currency = useFilters((s) => s.currency);
  const display = rows.slice(0, maxRows);
  const max = Math.max(...display.map((r) => r.value), 1);

  const fmt = (v: number) => {
    if (format === "currency") {
      return formatCurrency(v, currency, { compact: true });
    }
    if (format === "percent") return `${(v * 100).toFixed(1)}%`;
    return formatNumber(v, { compact: true });
  };

  return (
    <div className={cn("flex flex-col divide-y divide-border", className)}>
      {display.map((row, i) => (
        <div key={row.key} className="grid grid-cols-[24px_1fr_auto] items-center gap-3 py-2.5">
          {showRank ? (
            <span className="text-[10px] font-mono text-muted-foreground tabular">
              {(i + 1).toString().padStart(2, "0")}
            </span>
          ) : (
            <span />
          )}
          <div className="min-w-0">
            <div className="truncate text-[13px] font-medium text-foreground">{row.label}</div>
            <div className="relative mt-1 h-1 w-full rounded-full bg-muted/60 overflow-hidden">
              <div
                className={cn(
                  "absolute inset-y-0 left-0 rounded-full transition-[width] duration-700",
                  row.tone === "positive" && "bg-positive",
                  row.tone === "negative" && "bg-negative",
                  row.tone === "muted" && "bg-muted-foreground/50",
                  (!row.tone || row.tone === "accent") && "bg-foreground"
                )}
                style={{ width: `${(row.value / max) * 100}%` }}
              />
            </div>
          </div>
          <div className="text-right shrink-0">
            <div className="text-[13px] font-medium tabular text-foreground">{fmt(row.value)}</div>
            {row.secondary !== undefined && (
              <div className="text-[11px] text-muted-foreground tabular">{row.secondary}</div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
