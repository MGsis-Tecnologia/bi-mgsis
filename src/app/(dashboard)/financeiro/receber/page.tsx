"use client";

import * as React from "react";
import {
  Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { PageHeader } from "@/components/layout/page-header";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { EmptyState } from "@/components/dashboard/empty-state";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { BarChartH } from "@/components/charts/bar-chart-h";
import { ChartDefs } from "@/components/charts/chart-defs";
import { ChartTooltip } from "@/components/charts/chart-tooltip";
import { useReceivables, useFilteredReceivables } from "@/lib/hooks/use-receivables";
import { useFilters } from "@/lib/store/filters";
import {
  computeReceivablesKpis, agingBreakdown, byClient, bySeller, byCity, dueTimeline,
  type AgingBucketId, type GroupRow,
} from "@/lib/analytics/receivables";
import { formatCurrency, formatNumber, formatPercent } from "@/lib/utils/format";
import { useTranslation } from "@/lib/hooks/use-translation";
import { cn } from "@/lib/utils";

const AGING_COLORS: Record<AgingBucketId, string> = {
  current: "hsl(var(--positive))",
  d1_30:   "hsl(var(--negative) / 0.4)",
  d31_60:  "hsl(var(--negative) / 0.62)",
  d61_90:  "hsl(var(--negative) / 0.82)",
  d90plus: "hsl(var(--negative))",
};

export default function ContasReceberPage() {
  const { t } = useTranslation();
  const rec = useReceivables();
  const rows = useFilteredReceivables();
  const currency = useFilters((s) => s.currency);

  const kpi = React.useMemo(() => computeReceivablesKpis(rows), [rows]);
  const aging = React.useMemo(() => agingBreakdown(rows), [rows]);
  const clients = React.useMemo(() => byClient(rows), [rows]);
  const sellers = React.useMemo(() => bySeller(rows), [rows]);
  const cities = React.useMemo(() => byCity(rows), [rows]);
  const timeline = React.useMemo(() => dueTimeline(rows), [rows]);

  const detail = React.useMemo(() => {
    return [...rows]
      .sort((a, b) => {
        if (a.status !== b.status) return a.status === "overdue" ? -1 : 1;
        if (a.status === "overdue") return b.daysOverdue - a.daysOverdue;
        return a.daysUntilDue - b.daysUntilDue;
      })
      .slice(0, 18);
  }, [rows]);

  const agingLabel: Record<AgingBucketId, string> = {
    current: t("receber.aging.current"),
    d1_30:   t("receber.aging.d1_30"),
    d31_60:  t("receber.aging.d31_60"),
    d61_90:  t("receber.aging.d61_90"),
    d90plus: t("receber.aging.d90plus"),
  };
  const agingData = aging.map((a) => ({
    label: agingLabel[a.id],
    value: a.total,
    fill: AGING_COLORS[a.id],
  }));

  const cityRows = cities.map((c) => ({
    key: c.id,
    label: c.label || t("receber.nocity"),
    value: c.total,
    secondary: t("receber.table.badge", { count: c.count }),
  }));

  // No receivables file imported at all
  if (!rec.hasData) {
    return (
      <div className="space-y-8">
        <PageHeader
          eyebrow={t("receber.header.eyebrow")}
          title={t("receber.header.title")}
          description={t("receber.header.desc")}
        />
        <EmptyState title={t("receber.empty.title")} description={t("receber.empty.desc")} />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow={t("receber.header.eyebrow")}
        title={t("receber.header.title")}
        description={t("receber.header.desc")}
      >
        <Badge variant="ghost">{t("receber.table.badge", { count: formatNumber(rows.length) })}</Badge>
      </PageHeader>

      {rows.length === 0 && (
        <div className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          {t("receber.empty.filtered")}
        </div>
      )}

      {/* Headline KPIs */}
      <section className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard
          label={t("receber.kpi.total")}
          value={formatCurrency(kpi.total, currency, { compact: true })}
          accent="accent"
          caption={`${formatNumber(kpi.titlesCount)} · ${formatNumber(kpi.clientsCount)} ${t("receber.kpi.clients").toLowerCase()}`}
        />
        <KpiCard
          label={t("receber.kpi.upcoming")}
          value={formatCurrency(kpi.upcoming, currency, { compact: true })}
          accent="positive"
          caption={t("receber.kpi.caption_count", { count: kpi.upcomingCount })}
        />
        <KpiCard
          label={t("receber.kpi.overdue")}
          value={formatCurrency(kpi.overdue, currency, { compact: true })}
          accent="negative"
          caption={t("receber.kpi.caption_count", { count: kpi.overdueCount })}
        />
        <KpiCard
          label={t("receber.kpi.overdue_pct")}
          value={formatPercent(kpi.overduePct, { decimals: 1 })}
          accent={kpi.overduePct > 0.2 ? "negative" : "default"}
          caption={t("receber.kpi.overdue_pct_caption")}
        />
      </section>

      {/* Portfolio indicators */}
      <Card>
        <CardHeader><CardTitle>{t("receber.indicators.title")}</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-x-6 gap-y-4">
          <Indicator label={t("receber.kpi.titles")} value={formatNumber(kpi.titlesCount)} />
          <Indicator label={t("receber.kpi.clients")} value={formatNumber(kpi.clientsCount)} />
          <Indicator label={t("receber.kpi.avg_ticket")} value={formatCurrency(kpi.avgTicket, currency, { compact: true })} />
          <Indicator
            label={t("receber.kpi.avg_delay")}
            value={t("receber.delay.days", { count: Math.round(kpi.avgDaysOverdue) })}
          />
          <Indicator label={t("receber.kpi.due7")} value={formatCurrency(kpi.dueNext7, currency, { compact: true })} />
          <Indicator label={t("receber.kpi.due30")} value={formatCurrency(kpi.dueNext30, currency, { compact: true })} />
        </CardContent>
      </Card>

      {/* Aging + Due timeline */}
      <section className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <Card>
          <CardHeader>
            <CardTitle>{t("receber.aging.title")}</CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">{t("receber.aging.desc")}</p>
          </CardHeader>
          <CardContent>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={agingData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="2 4" vertical={false} />
                  <XAxis dataKey="label" tickLine={false} axisLine={false} interval={0}
                    tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 9 }} />
                  <YAxis tickLine={false} axisLine={false} width={52}
                    tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }}
                    tickFormatter={(v) => formatCurrency(Number(v), currency, { compact: true })} />
                  <Tooltip cursor={{ fill: "hsl(var(--muted) / 0.4)" }}
                    content={<ChartTooltip />} />
                  <Bar dataKey="value" name={t("receber.kpi.total")} radius={[3, 3, 0, 0]}>
                    {agingData.map((d, i) => <Cell key={i} fill={d.fill} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>{t("receber.timeline.title")}</CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">{t("receber.timeline.desc")}</p>
          </CardHeader>
          <CardContent>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={timeline} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <ChartDefs />
                  <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="2 4" vertical={false} />
                  <XAxis dataKey="label" tickLine={false} axisLine={false}
                    tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }} tickMargin={8} />
                  <YAxis tickLine={false} axisLine={false} width={56}
                    tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }}
                    tickFormatter={(v) => formatCurrency(Number(v), currency, { compact: true })} />
                  <Tooltip cursor={{ fill: "hsl(var(--muted) / 0.4)" }} content={<ChartTooltip />} />
                  <Bar dataKey="overdue" name={t("receber.timeline.overdue")} stackId="due"
                    fill="hsl(var(--negative))" />
                  <Bar dataKey="upcoming" name={t("receber.timeline.upcoming")} stackId="due"
                    fill="hsl(var(--accent))" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </section>

      {/* Top debtor clients + by city */}
      <section className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <Card className="lg:col-span-2">
          <CardHeader><CardTitle>{t("receber.byclient.title")}</CardTitle></CardHeader>
          <CardContent className="px-0">
            <GroupTable rows={clients} nameHeader={t("receber.table.client")} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>{t("receber.bycity.title")}</CardTitle></CardHeader>
          <CardContent>
            {cityRows.length > 0
              ? <BarChartH rows={cityRows} maxRows={8} />
              : <p className="py-8 text-center text-sm text-muted-foreground">—</p>}
          </CardContent>
        </Card>
      </section>

      {/* By seller */}
      <Card>
        <CardHeader><CardTitle>{t("receber.byseller.title")}</CardTitle></CardHeader>
        <CardContent className="px-0">
          <GroupTable rows={sellers} nameHeader={t("receber.table.seller")}
            fallbackLabel={t("receber.noseller")} maxRows={10} />
        </CardContent>
      </Card>

      {/* Detail table */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>{t("receber.table.title")}</CardTitle>
            <Badge variant="ghost">{t("receber.table.badge", { count: formatNumber(rows.length) })}</Badge>
          </div>
        </CardHeader>
        <CardContent className="px-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-y border-border text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                  <th className="text-left font-medium py-2 px-5">{t("receber.table.document")}</th>
                  <th className="text-left font-medium py-2 px-5">{t("receber.table.client")}</th>
                  <th className="text-left font-medium py-2 px-5">{t("receber.table.seller")}</th>
                  <th className="text-left font-medium py-2 px-5">{t("receber.table.due")}</th>
                  <th className="text-right font-medium py-2 px-5">{t("receber.table.amount")}</th>
                  <th className="text-center font-medium py-2 px-5">{t("receber.table.status")}</th>
                  <th className="text-right font-medium py-2 px-5">{t("receber.table.delay")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {detail.map((r, i) => (
                  <tr key={`${r.documentId}-${i}`} className="hover:bg-muted/30 transition-colors">
                    <td className="py-2.5 px-5 font-mono text-xs">{r.documentId}</td>
                    <td className="py-2.5 px-5 truncate max-w-[200px]">{r.clientName || r.clientId}</td>
                    <td className="py-2.5 px-5 text-muted-foreground truncate max-w-[140px]">
                      {r.sellerName || t("receber.noseller")}
                    </td>
                    <td className="py-2.5 px-5 text-muted-foreground tabular">
                      {new Date(r.dueDate + "T00:00:00").toLocaleDateString("pt-BR")}
                    </td>
                    <td className="py-2.5 px-5 text-right tabular font-medium">
                      {formatCurrency(r.amountBRL, currency)}
                    </td>
                    <td className="py-2.5 px-5 text-center">
                      <span className={cn(
                        "inline-block rounded-full px-2 py-0.5 text-[10px] font-medium",
                        r.status === "overdue"
                          ? "bg-negative/10 text-negative"
                          : "bg-positive/10 text-positive"
                      )}>
                        {r.status === "overdue" ? t("receber.status.overdue") : t("receber.status.upcoming")}
                      </span>
                    </td>
                    <td className={cn(
                      "py-2.5 px-5 text-right tabular",
                      r.daysOverdue > 0 ? "text-negative font-medium" : "text-muted-foreground"
                    )}>
                      {r.daysOverdue > 0 ? t("receber.delay.days", { count: r.daysOverdue }) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function Indicator({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">{label}</div>
      <div className="mt-1 display-figure text-2xl tabular leading-none">{value}</div>
    </div>
  );
}

function GroupTable({
  rows, nameHeader, fallbackLabel, maxRows = 8,
}: {
  rows: GroupRow[];
  nameHeader: string;
  fallbackLabel?: string;
  maxRows?: number;
}) {
  const { t } = useTranslation();
  const currency = useFilters((s) => s.currency);
  const display = rows.slice(0, maxRows);

  if (display.length === 0) {
    return <p className="py-8 text-center text-sm text-muted-foreground">—</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-y border-border text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
            <th className="text-left font-medium py-2 px-5 w-8">#</th>
            <th className="text-left font-medium py-2 px-5">{nameHeader}</th>
            <th className="text-right font-medium py-2 px-5">{t("receber.group.titles")}</th>
            <th className="text-right font-medium py-2 px-5">{t("receber.group.upcoming")}</th>
            <th className="text-right font-medium py-2 px-5">{t("receber.group.overdue")}</th>
            <th className="text-right font-medium py-2 px-5">{t("receber.group.total")}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {display.map((g, i) => (
            <tr key={g.id} className="hover:bg-muted/30 transition-colors">
              <td className="py-2.5 px-5 font-mono text-[10px] text-muted-foreground">
                {String(i + 1).padStart(2, "0")}
              </td>
              <td className="py-2.5 px-5 truncate max-w-[240px]">{g.label || fallbackLabel || "—"}</td>
              <td className="py-2.5 px-5 text-right tabular text-muted-foreground">{g.count}</td>
              <td className="py-2.5 px-5 text-right tabular">
                {formatCurrency(g.upcoming, currency, { compact: true })}
              </td>
              <td className={cn(
                "py-2.5 px-5 text-right tabular",
                g.overdue > 0 && "text-negative font-medium"
              )}>
                {formatCurrency(g.overdue, currency, { compact: true })}
              </td>
              <td className="py-2.5 px-5 text-right tabular font-medium">
                {formatCurrency(g.total, currency, { compact: true })}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
