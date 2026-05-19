"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { useFilters } from "@/lib/store/filters";
import { convertFromBRL } from "@/lib/utils/currency";
import { formatCurrency } from "@/lib/utils/format";
import { EXCHANGE_RATES } from "@/lib/mock/seed";

interface Props {
  matrix: number[][]; // [weekday=7][week=6]
  max: number;
}

const DAYS = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
const WEEKS = ["Sem 1", "Sem 2", "Sem 3", "Sem 4", "Sem 5", "Sem 6"];

export function Heatmap({ matrix, max }: Props) {
  const currency = useFilters((s) => s.currency);
  return (
    <div className="flex gap-3">
      <div className="flex flex-col justify-around pt-5 text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
        {DAYS.map((d) => (
          <span key={d}>{d}</span>
        ))}
      </div>
      <div className="flex-1 min-w-0">
        <div className="grid grid-cols-6 gap-1 mb-1 pl-1 text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
          {WEEKS.map((w) => (
            <span key={w} className="text-center">{w}</span>
          ))}
        </div>
        <div className="grid grid-cols-6 gap-1">
          {[0, 1, 2, 3, 4, 5].map((week) => (
            <div key={week} className="flex flex-col gap-1">
              {DAYS.map((_, day) => {
                const v = matrix[day]?.[week] ?? 0;
                const intensity = max > 0 ? v / max : 0;
                return (
                  <div
                    key={day}
                    title={`${DAYS[day]} · ${WEEKS[week]} · ${formatCurrency(
                      convertFromBRL(v, currency, EXCHANGE_RATES),
                      currency,
                      { compact: true }
                    )}`}
                    className={cn(
                      "h-7 rounded-sm border border-border transition-transform hover:scale-[1.06] hover:z-10",
                      intensity === 0 ? "bg-muted/40" : ""
                    )}
                    style={
                      intensity > 0
                        ? {
                            background: `hsl(var(--accent) / ${Math.max(0.08, intensity * 0.95)})`,
                          }
                        : undefined
                    }
                  />
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
