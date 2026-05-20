"use client";

import * as React from "react";
import { PageHeader } from "@/components/layout/page-header";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { EmptyState } from "@/components/dashboard/empty-state";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { RevenueAreaChart } from "@/components/charts/revenue-area-chart";
import { Money } from "@/components/dashboard/money";
import { useDataset, useFilteredOrders } from "@/lib/hooks/use-dataset";
import { useFilters } from "@/lib/store/filters";
import { computeKpis } from "@/lib/analytics/kpis";
import { monthlySeries } from "@/lib/analytics/timeseries";
import { formatPercent } from "@/lib/utils/format";
import { cn } from "@/lib/utils";
import { useTranslation } from "@/lib/hooks/use-translation";

export default function FinanceiroPage() {
  const { t } = useTranslation();
  const ds = useDataset();
  const orders = useFilteredOrders();
  const getRange = useFilters((s) => s.getRange);
  const preset = useFilters((s) => s.preset);
  const customRange = useFilters((s) => s.customRange);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const range = React.useMemo(() => getRange(), [preset, customRange, getRange]);

  const kpi = React.useMemo(() => computeKpis(orders), [orders]);
  const series = React.useMemo(() => monthlySeries(orders, range), [orders, range]);

  const taxesEstimate = kpi.revenue * 0.088;
  const fixed = kpi.revenue * 0.07;
  const variable = kpi.cost;
  const netProfit = kpi.revenue - variable - taxesEstimate - fixed;
  const netMargin = kpi.revenue > 0 ? netProfit / kpi.revenue : 0;

  if (!ds.hasData) {
    return (
      <div className="space-y-8">
        <PageHeader eyebrow={t("financeiro.header.eyebrow")} title={t("financeiro.header.title")} description={t("financeiro.header.desc")} />
        <EmptyState />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow={t("financeiro.header.eyebrow")}
        title={t("financeiro.header.title")}
        description={t("financeiro.header.desc")}
      >
        <Badge variant="ghost">{t("financeiro.header.badge")}</Badge>
      </PageHeader>

      <section className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard label={t("financeiro.kpi.revenue")} value={<><Money value={kpi.revenue} compact /></> as never} accent="accent" />
        <KpiCard label={t("financeiro.kpi.costs")} value={<><Money value={variable} compact /></> as never} />
        <KpiCard label={t("financeiro.kpi.net_profit")} value={<><Money value={netProfit} compact /></> as never} accent={netProfit >= 0 ? "positive" : "negative"} />
        <KpiCard label={t("financeiro.kpi.net_margin")} value={formatPercent(netMargin, { decimals: 1 })} />
      </section>

      <section className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>{t("financeiro.chart.flow.title")}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-72">
              <RevenueAreaChart data={series} height={280} />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t("financeiro.dre.title")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <DREItem label={t("financeiro.dre.gross_revenue")} value={kpi.revenue} weight="strong" />
            <DREItem label={t("financeiro.dre.taxes")} value={-taxesEstimate} tone="negative" />
            <DREItem label={t("financeiro.dre.net_revenue")} value={kpi.revenue - taxesEstimate} weight="strong" border />
            <DREItem label={t("financeiro.dre.cogs")} value={-variable} tone="negative" />
            <DREItem label={t("financeiro.dre.gross_profit")} value={kpi.revenue - taxesEstimate - variable} weight="strong" border />
            <DREItem label={t("financeiro.dre.fixed")} value={-fixed} tone="negative" />
            <DREItem label={t("financeiro.dre.net_profit")} value={netProfit} weight="strong" tone={netProfit >= 0 ? "positive" : "negative"} border />
          </CardContent>
        </Card>
      </section>

      <Card>
        <CardHeader>
          <CardTitle>{t("financeiro.indicators.title")}</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-x-6 gap-y-4">
          <Indicator label={t("financeiro.indicators.gross_margin")} value={formatPercent(kpi.marginPct, { decimals: 1 })} />
          <Indicator label={t("financeiro.indicators.net_margin")} value={formatPercent(netMargin, { decimals: 1 })} />
          <Indicator label={t("financeiro.indicators.taxes_rev")} value={formatPercent(taxesEstimate / Math.max(1, kpi.revenue), { decimals: 1 })} />
          <Indicator label={t("financeiro.indicators.fixed_rev")} value={formatPercent(fixed / Math.max(1, kpi.revenue), { decimals: 1 })} />
          <Indicator label={t("financeiro.indicators.orders")} value={kpi.ordersCount.toLocaleString("pt-BR")} />
          <Indicator label={t("financeiro.indicators.ticket")} value={<><Money value={kpi.averageTicket} /></> as never} />
        </CardContent>
      </Card>
    </div>
  );
}

function DREItem({
  label,
  value,
  weight = "regular",
  tone = "default",
  border,
}: {
  label: string;
  value: number;
  weight?: "regular" | "strong";
  tone?: "default" | "positive" | "negative";
  border?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex items-center justify-between py-1.5 text-sm",
        border && "border-t border-border pt-2.5 mt-1"
      )}
    >
      <span className={cn(weight === "strong" && "font-medium")}>{label}</span>
      <span
        className={cn(
          "tabular",
          weight === "strong" && "font-medium",
          tone === "positive" && "text-positive",
          tone === "negative" && "text-negative"
        )}
      >
        <Money value={value} />
      </span>
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
