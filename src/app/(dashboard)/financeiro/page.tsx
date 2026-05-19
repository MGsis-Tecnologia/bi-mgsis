"use client";

import * as React from "react";
import { PageHeader } from "@/components/layout/page-header";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { RevenueAreaChart } from "@/components/charts/revenue-area-chart";
import { Money } from "@/components/dashboard/money";
import { useFilteredOrders } from "@/lib/hooks/use-dataset";
import { useFilters } from "@/lib/store/filters";
import { computeKpis } from "@/lib/analytics/kpis";
import { monthlySeries } from "@/lib/analytics/timeseries";
import { formatPercent } from "@/lib/utils/format";
import { cn } from "@/lib/utils";

export default function FinanceiroPage() {
  const orders = useFilteredOrders();
  const getRange = useFilters((s) => s.getRange);
  const preset = useFilters((s) => s.preset);
  const customRange = useFilters((s) => s.customRange);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const range = React.useMemo(() => getRange(), [preset, customRange, getRange]);

  const kpi = React.useMemo(() => computeKpis(orders), [orders]);
  const series = React.useMemo(() => monthlySeries(orders, range), [orders, range]);

  const shipping = orders.reduce((s, o) => (o.status === "cancelado" ? s : s + o.shippingBRL), 0);
  const taxesEstimate = kpi.revenue * 0.088; // simulated
  const fixed = kpi.revenue * 0.07; // simulated fixed costs
  const variable = kpi.cost;
  const netProfit = kpi.revenue - variable - taxesEstimate - fixed - shipping;
  const netMargin = kpi.revenue > 0 ? netProfit / kpi.revenue : 0;

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Financeiro"
        title="Saúde financeira."
        description="Receitas, custos, impostos estimados, DRE simplificado e tendência operacional."
      >
        <Badge variant="ghost">simulação demonstrativa</Badge>
      </PageHeader>

      <section className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard label="Receita bruta" value={<><Money brl={kpi.revenue} compact /></> as never} accent="accent" />
        <KpiCard label="Custos diretos" value={<><Money brl={variable} compact /></> as never} />
        <KpiCard label="Lucro líquido" value={<><Money brl={netProfit} compact /></> as never} accent={netProfit >= 0 ? "positive" : "negative"} />
        <KpiCard label="Margem líquida" value={formatPercent(netMargin, { decimals: 1 })} />
      </section>

      <section className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Fluxo de receita e lucro</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-72">
              <RevenueAreaChart data={series} height={280} />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>DRE simplificado</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <DREItem label="(+) Receita bruta" value={kpi.revenue} weight="strong" />
            <DREItem label="(−) Descontos" value={-kpi.discountTotal} tone="negative" />
            <DREItem label="(−) Impostos (est.)" value={-taxesEstimate} tone="negative" />
            <DREItem label="(=) Receita líquida" value={kpi.revenue - kpi.discountTotal - taxesEstimate} weight="strong" border />
            <DREItem label="(−) Custo dos produtos" value={-variable} tone="negative" />
            <DREItem label="(=) Lucro bruto" value={kpi.revenue - kpi.discountTotal - taxesEstimate - variable} weight="strong" border />
            <DREItem label="(−) Frete" value={-shipping} tone="negative" />
            <DREItem label="(−) Despesas fixas (est.)" value={-fixed} tone="negative" />
            <DREItem label="(=) Lucro líquido" value={netProfit} weight="strong" tone={netProfit >= 0 ? "positive" : "negative"} border />
          </CardContent>
        </Card>
      </section>

      <Card>
        <CardHeader>
          <CardTitle>Indicadores financeiros</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-x-6 gap-y-4">
          <Indicator label="Margem bruta" value={formatPercent(kpi.marginPct, { decimals: 1 })} />
          <Indicator label="Margem líquida" value={formatPercent(netMargin, { decimals: 1 })} />
          <Indicator label="Impostos / Receita" value={formatPercent(taxesEstimate / Math.max(1, kpi.revenue), { decimals: 1 })} />
          <Indicator label="Despesas fixas / Receita" value={formatPercent(fixed / Math.max(1, kpi.revenue), { decimals: 1 })} />
          <Indicator label="Pedidos" value={kpi.ordersCount.toLocaleString("pt-BR")} />
          <Indicator label="Ticket médio" value={<><Money brl={kpi.averageTicket} /></> as never} />
          <Indicator label="Desconto médio" value={formatPercent(kpi.discountTotal / Math.max(1, kpi.revenue), { decimals: 1 })} />
          <Indicator label="Frete embarcado" value={<><Money brl={shipping} compact /></> as never} />
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
        <Money brl={value} />
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
