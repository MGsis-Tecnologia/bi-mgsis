"use client";

import * as React from "react";
import {
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
} from "recharts";
import { ChartTooltip } from "./chart-tooltip";

interface Slice {
  key: string;
  label: string;
  value: number;
}

interface Props {
  data: Slice[];
  centerLabel?: string;
  centerValue?: string;
  height?: number;
  showLegend?: boolean;
  isCurrency?: boolean;
}

const SLICE_COLORS = [
  "hsl(var(--chart-1))",
  "hsl(var(--chart-2))",
  "hsl(var(--chart-3))",
  "hsl(var(--chart-4))",
  "hsl(var(--chart-5))",
  "hsl(var(--chart-6))",
  "hsl(var(--muted-foreground))",
];

export function DonutChart({
  data,
  centerLabel,
  centerValue,
  height = 240,
  showLegend = true,
  isCurrency = true,
}: Props) {
  const total = data.reduce((s, d) => s + d.value, 0);
  return (
    <div className="flex flex-col md:flex-row gap-4 md:items-center">
      <div className="relative" style={{ height, width: height }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              dataKey="value"
              nameKey="label"
              innerRadius="68%"
              outerRadius="92%"
              paddingAngle={1.5}
              stroke="hsl(var(--surface))"
              strokeWidth={1.5}
              startAngle={90}
              endAngle={-270}
            >
              {data.map((_, i) => (
                <Cell key={i} fill={SLICE_COLORS[i % SLICE_COLORS.length]} />
              ))}
            </Pie>
            <Tooltip content={<ChartTooltip showCurrency={isCurrency} />} />
          </PieChart>
        </ResponsiveContainer>
        {(centerLabel || centerValue) && (
          <div className="absolute inset-0 grid place-items-center pointer-events-none text-center">
            <div>
              {centerLabel && (
                <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                  {centerLabel}
                </div>
              )}
              {centerValue && (
                <div className="display-figure text-[28px] leading-tight">{centerValue}</div>
              )}
            </div>
          </div>
        )}
      </div>
      {showLegend && (
        <div className="flex-1 grid grid-cols-1 gap-1.5">
          {data.map((d, i) => (
            <div key={d.key} className="flex items-center justify-between gap-3 py-1 group">
              <div className="flex items-center gap-2 min-w-0">
                <span
                  className="h-2.5 w-2.5 rounded-sm shrink-0"
                  style={{ background: SLICE_COLORS[i % SLICE_COLORS.length] }}
                />
                <span className="truncate text-[12.5px]">{d.label}</span>
              </div>
              <div className="text-right shrink-0 tabular">
                <span className="text-[12.5px] font-medium">
                  {total > 0 ? ((d.value / total) * 100).toFixed(1) : "0"}%
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
