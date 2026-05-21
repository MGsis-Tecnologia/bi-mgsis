"use client";

import * as React from "react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell, ResponsiveContainer } from "recharts";
import type { PerformanceVsGoal } from "@/lib/analytics/performance-goals";
import { getStatusColor, getStatusLabel } from "@/lib/analytics/performance-goals";
import { formatCurrency, formatPercent, formatNumber } from "@/lib/utils/format";
import { Badge } from "@/components/ui/badge";

interface PerformanceGoalsProps {
  goals: PerformanceVsGoal[];
  currency: string;
}

export function PerformanceGoals({ goals, currency }: PerformanceGoalsProps) {
  const exceeded = goals.filter((g) => g.status === "exceeded").length;
  const onTrack = goals.filter((g) => g.status === "on-track").length;
  const atRisk = goals.filter((g) => g.status === "at-risk").length;
  const missed = goals.filter((g) => g.status === "missed").length;

  const chartData = goals.map((goal) => ({
    name: goal.goalName.replace("Monthly ", "").replace("Average ", ""),
    achievement: Math.min(goal.achievement, 150),
    actual: goal.actual,
    target: goal.target,
    status: goal.status,
  }));

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-muted/30 rounded-lg p-4 space-y-1">
          <p className="text-xs text-muted-foreground">Exceeded</p>
          <p className="text-2xl font-bold text-accent">{exceeded}</p>
          <p className="text-xs text-muted-foreground">{((exceeded / goals.length) * 100).toFixed(0)}% of goals</p>
        </div>
        <div className="bg-muted/30 rounded-lg p-4 space-y-1">
          <p className="text-xs text-muted-foreground">On Track</p>
          <p className="text-2xl font-bold text-primary">{onTrack}</p>
          <p className="text-xs text-muted-foreground">{((onTrack / goals.length) * 100).toFixed(0)}% of goals</p>
        </div>
        <div className="bg-muted/30 rounded-lg p-4 space-y-1">
          <p className="text-xs text-muted-foreground">At Risk</p>
          <p className="text-2xl font-bold text-chart-4">{atRisk}</p>
          <p className="text-xs text-muted-foreground">{((atRisk / goals.length) * 100).toFixed(0)}% of goals</p>
        </div>
        <div className="bg-muted/30 rounded-lg p-4 space-y-1">
          <p className="text-xs text-muted-foreground">Missed</p>
          <p className="text-2xl font-bold text-destructive">{missed}</p>
          <p className="text-xs text-muted-foreground">{((missed / goals.length) * 100).toFixed(0)}% of goals</p>
        </div>
      </div>

      <div className="bg-white dark:bg-slate-950 rounded-lg p-4 border border-border">
        <h3 className="text-sm font-semibold mb-4">Achievement vs Goals</h3>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={chartData}>
            <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="2 4" vertical={false} />
            <XAxis
              dataKey="name"
              tickLine={false}
              axisLine={false}
              tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }}
            />
            <YAxis
              tickLine={false}
              axisLine={false}
              tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }}
              label={{ value: "Achievement %", angle: -90, position: "insideLeft" }}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: "hsl(var(--background))",
                border: "1px solid hsl(var(--border))",
                borderRadius: "6px",
              }}
              formatter={(value) => `${Number(value).toFixed(0)}%`}
            />
            <Bar dataKey="achievement" radius={[4, 4, 0, 0]}>
              {chartData.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={getStatusColor(entry.status)} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
        <div className="mt-2 flex justify-center gap-6 text-xs text-muted-foreground">
          <span>100% = Target Achieved</span>
          <span>150% = Maximum shown</span>
        </div>
      </div>

      <div className="space-y-3">
        {goals.map((goal) => (
          <div
            key={goal.goalId}
            className="bg-white dark:bg-slate-950 rounded-lg p-4 border border-border space-y-3"
          >
            <div className="flex items-center justify-between">
              <div>
                <h4 className="text-sm font-semibold">{goal.goalName}</h4>
                <p className="text-xs text-muted-foreground mt-1">Type: {goal.type}</p>
              </div>
              <Badge style={{ backgroundColor: getStatusColor(goal.status) }}>
                {getStatusLabel(goal.status)}
              </Badge>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Actual vs Target</span>
                <span className="font-semibold">
                  {goal.type === "margin" || goal.type === "ticket"
                    ? goal.actual.toFixed(goal.type === "margin" ? 1 : 0)
                    : formatCurrency(goal.actual, "BRL", { compact: true })}
                  {" / "}
                  {goal.type === "margin" || goal.type === "ticket"
                    ? goal.target.toFixed(goal.type === "margin" ? 1 : 0)
                    : formatCurrency(goal.target, "BRL", { compact: true })}
                </span>
              </div>

              <div className="relative h-2 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full transition-all"
                  style={{
                    width: `${Math.min(goal.achievement, 100)}%`,
                    backgroundColor: getStatusColor(goal.status),
                  }}
                />
              </div>

              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>
                  {goal.variancePct >= 0 ? "+" : ""}
                  {formatPercent(goal.variancePct, { decimals: 1 })} vs target
                </span>
                <span>{formatPercent(goal.achievement, { decimals: 0 })} achievement</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
