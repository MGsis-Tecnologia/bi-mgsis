"use client";

import * as React from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { TimePoint } from "@/lib/analytics/timeseries";
import { useFilters } from "@/lib/store/filters";
import { convertFromBRL } from "@/lib/utils/currency";
import { formatCurrency } from "@/lib/utils/format";
import { EXCHANGE_RATES } from "@/lib/mock/seed";
import { ChartDefs } from "./chart-defs";
import { ChartTooltip } from "./chart-tooltip";

interface Props {
  data: TimePoint[];
  height?: number;
  showAxis?: boolean;
  showGrid?: boolean;
  compareKey?: "revenue" | "profit";
}

export function RevenueAreaChart({
  data,
  height = 280,
  showAxis = true,
  showGrid = true,
  compareKey = "revenue",
}: Props) {
  const currency = useFilters((s) => s.currency);

  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 12, right: 12, left: showAxis ? 4 : 0, bottom: 0 }}>
        <ChartDefs />
        {showGrid && (
          <CartesianGrid
            stroke="hsl(var(--border))"
            strokeDasharray="2 4"
            vertical={false}
          />
        )}
        {showAxis && (
          <XAxis
            dataKey="label"
            tickLine={false}
            axisLine={false}
            tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }}
            tickMargin={8}
          />
        )}
        {showAxis && (
          <YAxis
            tickLine={false}
            axisLine={false}
            tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }}
            tickFormatter={(v) =>
              formatCurrency(convertFromBRL(Number(v), currency, EXCHANGE_RATES), currency, {
                compact: true,
              })
            }
            width={56}
          />
        )}
        <Tooltip
          cursor={{ stroke: "hsl(var(--foreground))", strokeDasharray: "2 3", strokeOpacity: 0.4 }}
          content={<ChartTooltip />}
        />
        <Area
          type="monotone"
          dataKey={compareKey}
          name={compareKey === "revenue" ? "Receita" : "Lucro"}
          stroke="hsl(var(--accent))"
          strokeWidth={1.6}
          fill="url(#gradAccent)"
          activeDot={{ r: 3.5, strokeWidth: 0, fill: "hsl(var(--accent))" }}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export function MiniSparkArea({ data, color = "accent" }: { data: TimePoint[]; color?: "accent" | "positive" }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={data} margin={{ top: 2, right: 2, left: 2, bottom: 2 }}>
        <ChartDefs />
        <Area
          type="monotone"
          dataKey="revenue"
          stroke={`hsl(var(--${color}))`}
          strokeWidth={1.2}
          fill={`url(#grad${color === "accent" ? "Accent" : "Positive"})`}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
