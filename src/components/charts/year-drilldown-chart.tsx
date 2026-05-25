"use client";

import * as React from "react";
import {
  BarChart,
  Bar,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  LabelList,
  ResponsiveContainer,
} from "recharts";
import { useFilters } from "@/lib/store/filters";
import { formatCurrency } from "@/lib/utils/format";

const YEAR_COLORS = [
  "hsl(var(--accent))",
  "#3b82f6",
  "#22c55e",
  "#f59e0b",
  "#a855f7",
];

interface Props {
  years: string[];
  byYear: Record<string, number>;
}

export function YearDrilldownChart({ years, byYear }: Props) {
  const currency = useFilters((s) => s.currency);
  const fmt = (v: number) => formatCurrency(v, currency, { compact: true });

  const data = years.map((yr) => ({
    year: yr,
    revenue: byYear[yr] ?? 0,
  }));

  return (
    <div style={{ width: "100%", height: 400 }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 32, right: 24, left: 8, bottom: 16 }} barCategoryGap="40%">
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
          <XAxis
            dataKey="year"
            tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 13, fontWeight: 500 }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }}
            tickFormatter={(v: number) => fmt(v)}
            axisLine={false}
            tickLine={false}
            width={76}
          />
          <Tooltip
            cursor={{ fill: "hsl(var(--muted)/0.3)" }}
            contentStyle={{
              background: "hsl(var(--surface))",
              border: "1px solid hsl(var(--border))",
              borderRadius: 6,
              fontSize: 13,
            }}
            formatter={(value: number) => [fmt(value), "Receita"]}
          />
          <Bar dataKey="revenue" radius={[4, 4, 0, 0]}>
            {data.map((_, idx) => (
              <Cell key={idx} fill={YEAR_COLORS[idx % YEAR_COLORS.length]} />
            ))}
            <LabelList
              dataKey="revenue"
              position="top"
              formatter={(v: number) => fmt(v)}
              style={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
