"use client";

import * as React from "react";
import dynamic from "next/dynamic";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { PageHeader } from "@/components/layout/page-header";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { EmptyState } from "@/components/dashboard/empty-state";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { RevenueAreaChart } from "@/components/charts/revenue-area-chart";
import { Heatmap } from "@/components/charts/heatmap";
import { BarChartH } from "@/components/charts/bar-chart-h";
import { ChartDefs } from "@/components/charts/chart-defs";
import { ChartTooltip } from "@/components/charts/chart-tooltip";
import { Money } from "@/components/dashboard/money";
import { useDataset, useFilteredOrders } from "@/lib/hooks/use-dataset";
import { useFilters } from "@/lib/store/filters";
import { computeKpis } from "@/lib/analytics/kpis";
import { aggregateSalesByCity, getMaxSales } from "@/lib/analytics/geo-sales";
import { dailySeries, heatmapByDayOfWeek, monthlySeries } from "@/lib/analytics/timeseries";
import { formatCurrency, formatNumber, formatPercent } from "@/lib/utils/format";
import { useTranslation } from "@/lib/hooks/use-translation";

const SalesHeatmapGeo = dynamic(() => import("@/components/charts/sales-heatmap-geo").then((mod) => ({ default: mod.SalesHeatmapGeo })), {
  ssr: false,
  loading: () => <div className="w-full h-96 bg-muted/20 rounded-lg flex items-center justify-center"><p className="text-sm text-muted-foreground">Carregando mapa...</p></div>,
});

export default function VendasPage() {
  const { t } = useTranslation();
  const ds = useDataset();
  const orders = useFilteredOrders();
  const currency = useFilters((s) => s.currency);
  const getRange = useFilters((s) => s.getRange);
  const preset = useFilters((s) => s.preset);
  const customRange = useFilters((s) => s.customRange);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const range = React.useMemo(() => getRange(), [preset, customRange, getRange]);

  const kpi = React.useMemo(() => computeKpis(orders), [orders]);
  const monthly = React.useMemo(() => monthlySeries(orders, range), [orders, range]);
  const daily = React.useMemo(() => dailySeries(orders, range), [orders, range]);
  const heatmap = React.useMemo(() => heatmapByDayOfWeek(orders), [orders]);

  const byChannel = React.useMemo(() => {
    const m: Record<string, number> = {};
    for (const o of orders) m[o.channel] = (m[o.channel] ?? 0) + o.totalBRL;
    return Object.entries(m).map(([k, v]) => ({ key: k, label: k, value: v })).sort((a, b) => b.value - a.value);
  }, [orders]);

  const citiesSales = React.useMemo(() => aggregateSalesByCity(orders), [orders]);
  const maxSales = React.useMemo(() => getMaxSales(citiesSales), [citiesSales]);

  // Debug: log orders com clientCity
  React.useEffect(() => {
    console.log("Primeiros 5 orders com clientCity:");
    orders.slice(0, 5).forEach((o) => {
      console.log(`  ${o.id}: ${o.clientName} - Cidade: ${o.clientCity || "NÃO DEFINIDA"}`);
    });
    console.log(`Total de cidades encontradas: ${Object.keys(citiesSales).length}`);
    console.log("Cidades com vendas:", Object.keys(citiesSales));
  }, [orders, citiesSales]);

  if (!ds.hasData) {
    return (
      <div className="space-y-8">
        <PageHeader eyebrow={t("vendas.header.eyebrow")} title={t("vendas.header.title")} description={t("vendas.header.desc")} />
        <EmptyState />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <PageHeader eyebrow={t("vendas.header.eyebrow")} title={t("vendas.header.title")} description={t("vendas.header.desc")} />

      <section className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard label={t("vendas.kpi.revenue")} value={formatCurrency(kpi.revenue, currency, { compact: true })} accent="accent" />
        <KpiCard label={t("vendas.kpi.orders")} value={formatNumber(kpi.ordersCount)} />
        <KpiCard label={t("vendas.kpi.ticket")} value={formatCurrency(kpi.averageTicket, currency)} />
        <KpiCard label={t("vendas.kpi.margin")} value={formatPercent(kpi.marginPct, { decimals: 1 })} />
      </section>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle>{t("vendas.chart.evolution.title")}</CardTitle>
              <p className="mt-1 text-xs text-muted-foreground">{t("vendas.chart.evolution.desc")}</p>
            </div>
            <Tabs defaultValue="month">
              <TabsList>
                <TabsTrigger value="month">{t("dashboard.trend.tab.month")}</TabsTrigger>
                <TabsTrigger value="day">{t("dashboard.trend.tab.day")}</TabsTrigger>
                <TabsTrigger value="bars">{t("dashboard.trend.tab.bars")}</TabsTrigger>
              </TabsList>
              <TabsContent value="month"><div className="h-72 mt-3"><RevenueAreaChart data={monthly} height={280} /></div></TabsContent>
              <TabsContent value="day"><div className="h-72 mt-3"><RevenueAreaChart data={daily} height={280} /></div></TabsContent>
              <TabsContent value="bars">
                <div className="h-72 mt-3">
                  <ResponsiveContainer width="100%" height={280}>
                    <BarChart data={monthly} margin={{ top: 12, right: 12, left: 0, bottom: 0 }}>
                      <ChartDefs />
                      <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="2 4" vertical={false} />
                      <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }} />
                      <YAxis tickLine={false} axisLine={false} tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }} tickFormatter={(v) => formatCurrency(Number(v), currency, { compact: true })} width={60} />
                      <Tooltip cursor={{ fill: "hsl(var(--muted) / 0.4)" }} content={<ChartTooltip />} />
                      <Bar dataKey="revenue" name="Receita" fill="hsl(var(--accent))" radius={[3, 3, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </TabsContent>
            </Tabs>
          </div>
        </CardHeader>
      </Card>

      <section className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>{t("vendas.chart.season.title")}</CardTitle>
              <Badge variant="ghost">{t("vendas.chart.season.badge")}</Badge>
            </div>
          </CardHeader>
          <CardContent><Heatmap matrix={heatmap.matrix} max={heatmap.max} /></CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>{t("vendas.chart.region.title")}</CardTitle></CardHeader>
          <CardContent><BarChartH rows={byChannel} /></CardContent>
        </Card>
      </section>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Mapa de Vendas por Cidade</CardTitle>
              <p className="mt-1 text-xs text-muted-foreground">Vendas por localização geográfica (Brasil e Paraguai)</p>
            </div>
            <Badge variant="ghost">{Object.keys(citiesSales).length} cidades</Badge>
          </div>
        </CardHeader>
        <CardContent>
          <SalesHeatmapGeo cities={citiesSales} maxSales={maxSales} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>{t("vendas.orders.title")}</CardTitle>
            <Badge variant="ghost">{t("vendas.orders.badge", { count: orders.length.toLocaleString("pt-BR") })}</Badge>
          </div>
        </CardHeader>
        <CardContent className="px-0">
          <RecentOrdersTable />
        </CardContent>
      </Card>
    </div>
  );
}

function RecentOrdersTable() {
  const { t } = useTranslation();
  const orders = useFilteredOrders();
  const recent = React.useMemo(() => [...orders].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 12), [orders]);

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-y border-border text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
            <th className="text-left font-medium py-2 px-5">{t("vendas.table.order")}</th>
            <th className="text-left font-medium py-2 px-5">{t("vendas.table.customer")}</th>
            <th className="text-left font-medium py-2 px-5">{t("vendas.table.seller")}</th>
            <th className="text-left font-medium py-2 px-5">{t("vendas.table.channel")}</th>
            <th className="text-right font-medium py-2 px-5">{t("vendas.table.items")}</th>
            <th className="text-right font-medium py-2 px-5">{t("vendas.table.total")}</th>
            <th className="text-right font-medium py-2 px-5">{t("vendas.table.margin")}</th>
            <th className="text-right font-medium py-2 px-5">{t("vendas.table.date")}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {recent.map((o) => (
            <tr key={o.id} className="hover:bg-muted/30 transition-colors">
              <td className="py-2.5 px-5 font-mono text-xs">{o.id}</td>
              <td className="py-2.5 px-5 truncate max-w-[180px]">{o.clientName}</td>
              <td className="py-2.5 px-5 text-muted-foreground">{o.sellerName}</td>
              <td className="py-2.5 px-5 text-muted-foreground">{o.channel}</td>
              <td className="py-2.5 px-5 text-right tabular">{o.items.reduce((s, it) => s + it.quantity, 0)}</td>
              <td className="py-2.5 px-5 text-right tabular font-medium"><Money value={o.totalBRL} /></td>
              <td className="py-2.5 px-5 text-right tabular text-muted-foreground">{formatPercent(o.marginPct, { decimals: 1 })}</td>
              <td className="py-2.5 px-5 text-right tabular text-muted-foreground">{new Date(o.date + "T00:00:00").toLocaleDateString("pt-BR")}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
