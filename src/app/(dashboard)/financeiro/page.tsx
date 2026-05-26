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
import { formatPercent, formatNumber } from "@/lib/utils/format";
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

  // Apenas valores reais do dataset de vendas
  const grossProfit = kpi.revenue - kpi.cost;
  const grossMargin = kpi.revenue > 0 ? grossProfit / kpi.revenue : 0;

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

      {/* KPIs — somente dados reais */}
      <section className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard
          label={t("financeiro.kpi.revenue")}
          value={<><Money value={kpi.revenue} compact /></> as never}
          accent="accent"
          caption={`${formatNumber(kpi.ordersCount)} pedidos`}
        />
        <KpiCard
          label={t("financeiro.kpi.costs")}
          value={<><Money value={kpi.cost} compact /></> as never}
          caption="CMV — custo das mercadorias"
        />
        <KpiCard
          label="Lucro Bruto"
          value={<><Money value={grossProfit} compact /></> as never}
          accent={grossProfit >= 0 ? "positive" : "negative"}
          caption="Receita − CMV"
        />
        <KpiCard
          label="Margem Bruta"
          value={formatPercent(grossMargin, { decimals: 1 })}
          accent={grossMargin >= 0.25 ? "positive" : grossMargin < 0.1 ? "negative" : "default"}
          caption="Lucro Bruto / Receita"
        />
      </section>

      {/* Gráfico + DRE real */}
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
            <DREItem label={t("financeiro.dre.cogs")} value={-kpi.cost} tone="negative" />
            <DREItem
              label={t("financeiro.dre.gross_profit")}
              value={grossProfit}
              weight="strong"
              tone={grossProfit >= 0 ? "positive" : "negative"}
              border
            />
            <div className="pt-3 text-[11px] text-muted-foreground leading-relaxed">
              O DRE completo com despesas operacionais está disponível em{" "}
              <a href="/financeiro/dre" className="text-accent hover:underline">
                Caixa &amp; DRE
              </a>
              , após importar o arquivo de movimentação bancária.
            </div>
          </CardContent>
        </Card>
      </section>

      {/* Indicadores — apenas reais */}
      <Card>
        <CardHeader>
          <CardTitle>{t("financeiro.indicators.title")}</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-x-6 gap-y-4">
          <Indicator label={t("financeiro.indicators.gross_margin")} value={formatPercent(grossMargin, { decimals: 1 })} />
          <Indicator label={t("financeiro.indicators.orders")} value={kpi.ordersCount.toLocaleString("pt-BR")} />
          <Indicator label={t("financeiro.indicators.ticket")} value={<><Money value={kpi.averageTicket} /></> as never} />
          <Indicator label="Custo / Receita" value={formatPercent(kpi.revenue > 0 ? kpi.cost / kpi.revenue : 0, { decimals: 1 })} />
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
