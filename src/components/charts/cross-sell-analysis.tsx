"use client";

import * as React from "react";
import {
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import type { CrossSellPair } from "@/lib/analytics/cross-sell";
import { formatCurrency } from "@/lib/utils/format";
import { Badge } from "@/components/ui/badge";

interface CrossSellAnalysisProps {
  pairs: CrossSellPair[];
  currency: string;
}

export function CrossSellAnalysis({ pairs, currency }: CrossSellAnalysisProps) {
  const topByLift = React.useMemo(() => pairs.slice(0, 10), [pairs]);
  const topByRevenue = React.useMemo(
    () => [...pairs].sort((a, b) => b.revenue - a.revenue).slice(0, 10),
    [pairs]
  );

  const scatterData = React.useMemo(
    () =>
      pairs.slice(0, 15).map((p) => ({
        name: `${p.productA.substring(0, 12)} + ${p.productB.substring(0, 12)}`,
        confidence: p.confidence,
        lift: p.lift,
        coOccurrences: p.coOccurrences,
        revenue: p.revenue,
      })),
    [pairs]
  );

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <div className="bg-muted/30 rounded-lg p-4 space-y-1">
          <p className="text-xs text-muted-foreground">Total Pairs</p>
          <p className="text-2xl font-bold">{pairs.length}</p>
          <p className="text-xs text-muted-foreground">Product combinations</p>
        </div>
        <div className="bg-muted/30 rounded-lg p-4 space-y-1">
          <p className="text-xs text-muted-foreground">Avg Confidence</p>
          <p className="text-2xl font-bold">
            {(pairs.reduce((sum, p) => sum + p.confidence, 0) / pairs.length).toFixed(1)}%
          </p>
          <p className="text-xs text-muted-foreground">Cross-sell rate</p>
        </div>
        <div className="bg-muted/30 rounded-lg p-4 space-y-1">
          <p className="text-xs text-muted-foreground">Avg Lift</p>
          <p className="text-2xl font-bold">
            {(pairs.reduce((sum, p) => sum + p.lift, 0) / pairs.length).toFixed(2)}x
          </p>
          <p className="text-xs text-muted-foreground">Correlation strength</p>
        </div>
      </div>

      <div className="bg-white dark:bg-slate-950 rounded-lg p-4 border border-border">
        <h3 className="text-sm font-semibold mb-4">Product Correlation (Lift vs Confidence)</h3>
        <ResponsiveContainer width="100%" height={300}>
          <ScatterChart margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
            <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="2 4" />
            <XAxis
              dataKey="confidence"
              type="number"
              tickLine={false}
              axisLine={false}
              tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }}
              label={{ value: "Confidence %", position: "insideBottomRight", offset: -10 }}
            />
            <YAxis
              dataKey="lift"
              type="number"
              tickLine={false}
              axisLine={false}
              tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }}
              label={{ value: "Lift", angle: -90, position: "insideLeft" }}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: "hsl(var(--background))",
                border: "1px solid hsl(var(--border))",
                borderRadius: "6px",
              }}
              cursor={{ strokeDasharray: "3 3" }}
              formatter={(value, name) => {
                if (name === "confidence") return `${Number(value).toFixed(1)}%`;
                if (name === "lift") return `${Number(value).toFixed(2)}x`;
                return Number(value);
              }}
            />
            <Scatter name="Pairs" data={scatterData} fill="hsl(var(--accent))" />
          </ScatterChart>
        </ResponsiveContainer>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-white dark:bg-slate-950 rounded-lg p-4 border border-border">
          <h3 className="text-sm font-semibold mb-4">Top 10 by Correlation (Lift)</h3>
          <div className="space-y-3 max-h-96 overflow-y-auto">
            {topByLift.map((pair, idx) => (
              <div key={`${pair.productAId}-${pair.productBId}`} className="space-y-2 pb-3 border-b border-border last:border-b-0">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">
                      <span className="text-accent font-bold">{idx + 1}.</span> {pair.productA}
                    </p>
                    <p className="text-xs text-muted-foreground">+</p>
                    <p className="text-sm font-medium">{pair.productB}</p>
                  </div>
                  <div className="text-right">
                    <Badge variant="secondary">{pair.lift.toFixed(2)}x</Badge>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-2 text-xs text-muted-foreground">
                  <div>
                    <p className="font-semibold">{pair.coOccurrences}x</p>
                    <p>bought together</p>
                  </div>
                  <div>
                    <p className="font-semibold">{pair.confidence.toFixed(0)}%</p>
                    <p>confidence</p>
                  </div>
                  <div>
                    <p className="font-semibold">{pair.support.toFixed(1)}%</p>
                    <p>support</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white dark:bg-slate-950 rounded-lg p-4 border border-border">
          <h3 className="text-sm font-semibold mb-4">Top 10 by Revenue</h3>
          <div className="space-y-3 max-h-96 overflow-y-auto">
            {topByRevenue.map((pair, idx) => (
              <div key={`${pair.productAId}-${pair.productBId}`} className="space-y-2 pb-3 border-b border-border last:border-b-0">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">
                      <span className="text-accent font-bold">{idx + 1}.</span> {pair.productA}
                    </p>
                    <p className="text-xs text-muted-foreground">+</p>
                    <p className="text-sm font-medium">{pair.productB}</p>
                  </div>
                  <div className="text-right">
                    <Badge variant="secondary">
                      {formatCurrency(pair.revenue, currency, { compact: true })}
                    </Badge>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-2 text-xs text-muted-foreground">
                  <div>
                    <p className="font-semibold">{pair.coOccurrences}x</p>
                    <p>bought together</p>
                  </div>
                  <div>
                    <p className="font-semibold">{pair.lift.toFixed(2)}x</p>
                    <p>lift</p>
                  </div>
                  <div>
                    <p className="font-semibold">{(pair.revenue / pair.coOccurrences).toFixed(0)}</p>
                    <p>avg value</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
