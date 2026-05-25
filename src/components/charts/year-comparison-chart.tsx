"use client";

import * as React from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Cell,
} from "recharts";
import { useFilters } from "@/lib/store/filters";
import { formatCurrency } from "@/lib/utils/format";
import type { YearlyResult } from "@/lib/analytics/yearly";

// Up to 5 years, each with a distinct colour
const YEAR_COLORS = [
  "hsl(var(--accent))",
  "#3b82f6",
  "#22c55e",
  "#f59e0b",
  "#a855f7",
];

interface Props {
  data: YearlyResult;
  className?: string;
}

export function YearComparisonChart({ data, className }: Props) {
  const currency = useFilters((s) => s.currency);
  const { years, rows } = data;

  const chartData = rows.map((r) => {
    const entry: Record<string, string | number> = { name: r.label };
    for (const yr of years) {
      entry[yr] = r.byYear[yr] ?? 0;
    }
    return entry;
  });

  const fmt = (v: number) => formatCurrency(v, currency, { compact: true });

  return (
    <div className={className} style={{ width: "100%", height: 340 }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={chartData}
          margin={{ top: 8, right: 16, left: 8, bottom: 60 }}
          barCategoryGap="28%"
          barGap={2}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
          <XAxis
            dataKey="name"
            tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }}
            angle={-35}
            textAnchor="end"
            interval={0}
            height={64}
          />
          <YAxis
            tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }}
            tickFormatter={(v: number) => fmt(v)}
            width={72}
          />
          <Tooltip
            cursor={{ fill: "hsl(var(--muted)/0.3)" }}
            contentStyle={{
              background: "hsl(var(--surface))",
              border: "1px solid hsl(var(--border))",
              borderRadius: 6,
              fontSize: 12,
            }}
            formatter={(value: number, name: string) => [fmt(value), name]}
          />
          <Legend
            wrapperStyle={{ fontSize: 12, paddingTop: 8 }}
            formatter={(value) => <span style={{ color: "hsl(var(--foreground))" }}>{value}</span>}
          />
          {years.map((yr, idx) => (
            <Bar key={yr} dataKey={yr} fill={YEAR_COLORS[idx % YEAR_COLORS.length]} radius={[2, 2, 0, 0]} />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
