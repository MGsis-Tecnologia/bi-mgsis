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
  Legend,
  ResponsiveContainer,
} from "recharts";
import { useFilters } from "@/lib/store/filters";
import { formatCurrency } from "@/lib/utils/format";
import type { YearProjection } from "@/lib/analytics/yearly";

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
  projection?: YearProjection | null;
}

export function YearDrilldownChart({ years, byYear, projection }: Props) {
  const currency = useFilters((s) => s.currency);
  const fmt = (v: number) => formatCurrency(v, currency, { compact: true });

  const hasProjection = !!projection && years.includes(projection.currentYear);

  const data = years.map((yr, idx) => {
    const color = YEAR_COLORS[idx % YEAR_COLORS.length];
    if (hasProjection && yr === projection!.currentYear) {
      return { year: `${yr} ★`, actual: projection!.ytd, remaining: projection!.remaining, color };
    }
    return { year: yr, actual: byYear[yr] ?? 0, remaining: 0, color };
  });

  const projectedTotal = hasProjection ? projection!.projected : 0;

  return (
    <div style={{ width: "100%", height: 420 }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 36, right: 24, left: 8, bottom: 16 }} barCategoryGap="40%">
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
              fontSize: 12,
            }}
            formatter={(value: number, name: string) => [
              fmt(value),
              name === "actual" ? "Realizado" : "Projeção (estimado)",
            ]}
          />
          {hasProjection && (
            <Legend
              wrapperStyle={{ fontSize: 11, paddingTop: 4 }}
              payload={[
                { value: "Realizado", type: "square", color: YEAR_COLORS[(years.indexOf(projection!.currentYear)) % YEAR_COLORS.length] },
                { value: `Projeção ${projection!.currentYear} (est.)`, type: "square", color: "hsl(var(--muted-foreground))" },
              ]}
            />
          )}

          {/* Actual revenue bars */}
          <Bar dataKey="actual" stackId="a" radius={hasProjection ? [0, 0, 4, 4] : [4, 4, 0, 0]}>
            {data.map((entry, idx) => (
              <Cell key={idx} fill={entry.color} />
            ))}
            {/* Label on top only when no projection stacked above */}
            {!hasProjection && (
              <LabelList
                dataKey="actual"
                position="top"
                formatter={(v: number) => fmt(v)}
                style={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }}
              />
            )}
          </Bar>

          {/* Projection remaining (stacked on top for current year only) */}
          {hasProjection && (
            <Bar dataKey="remaining" stackId="a" radius={[4, 4, 0, 0]} fill="hsl(var(--muted-foreground))" fillOpacity={0.25}>
              <LabelList
                dataKey="remaining"
                position="top"
                content={({ x, y, width, index }) => {
                  if (index === undefined || data[index]?.remaining === 0) return null;
                  return (
                    <text
                      x={Number(x) + Number(width) / 2}
                      y={Number(y) - 6}
                      textAnchor="middle"
                      fill="hsl(var(--muted-foreground))"
                      fontSize={11}
                    >
                      {fmt(projectedTotal)} est.
                    </text>
                  );
                }}
              />
            </Bar>
          )}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
