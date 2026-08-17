"use client";

import * as React from "react";
import { PageHeader } from "@/components/layout/page-header";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { EmptyState } from "@/components/dashboard/empty-state";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { RevenueAreaChart } from "@/components/charts/revenue-area-chart";
import { Heatmap } from "@/components/charts/heatmap";
import { BarChartH } from "@/components/charts/bar-chart-h";
import { Money } from "@/components/dashboard/money";
import { useComprasAnalytics, type CompraRecente } from "@/lib/hooks/use-compras-analytics";
import { formatCurrency, formatNumber } from "@/lib/utils/format";
import { useMoedaExibicao } from "@/lib/hooks/use-moeda-exibicao";
import { useTranslation } from "@/lib/hooks/use-translation";

export default function ComprasPage() {
  const { t } = useTranslation();
  const currency = useMoedaExibicao();

  const { data, loading, error } = useComprasAnalytics();

  const kpi = data?.kpi;
  const monthly = data?.monthly ?? [];
  const daily = data?.daily ?? [];
  const yearly = data?.yearly ?? [];
  const heatmap = data?.heatmap ?? { matrix: [], max: 0 };
  const suppliers = data?.suppliers ?? [];
  const maxValue = data?.maxValue ?? 0;

  if (error) {
    return (
      <div className="space-y-8">
        <PageHeader eyebrow={t("compras.header.eyebrow")} title={t("compras.header.title")} description={t("compras.header.desc")} />
        <div className="rounded-lg border border-negative/30 bg-negative/10 px-4 py-3 text-sm text-negative">
          Não foi possível carregar as compras: {error}
        </div>
      </div>
    );
  }

  if (!kpi || !data?.hasData) {
    return (
      <div className="space-y-8">
        <PageHeader eyebrow={t("compras.header.eyebrow")} title={t("compras.header.title")} description={t("compras.header.desc")} />
        {loading ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="h-[104px] animate-pulse rounded-lg bg-muted/40" />
            ))}
          </div>
        ) : (
          <EmptyState />
        )}
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <PageHeader eyebrow={t("compras.header.eyebrow")} title={t("compras.header.title")} description={t("compras.header.desc")} />

      <section className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard label={t("compras.kpi.total")} value={formatCurrency(kpi.totalValue, currency, { compact: true })} accent="accent" />
        <KpiCard label={t("compras.kpi.orders")} value={formatNumber(kpi.ordersCount)} />
        <KpiCard label={t("compras.kpi.ticket")} value={formatCurrency(kpi.averageTicket, currency)} />
        <KpiCard label={t("compras.kpi.suppliers")} value={formatNumber(kpi.uniqueSuppliers)} />
      </section>

      <Card>
        <Tabs defaultValue="month">
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <CardTitle>{t("compras.chart.evolution.title")}</CardTitle>
                <p className="mt-1 text-xs text-muted-foreground">{t("compras.chart.evolution.desc")}</p>
              </div>
              <TabsList>
                <TabsTrigger value="month">{t("dashboard.trend.tab.month")}</TabsTrigger>
                <TabsTrigger value="day">{t("dashboard.trend.tab.day")}</TabsTrigger>
                <TabsTrigger value="year">{t("dashboard.trend.tab.year")}</TabsTrigger>
              </TabsList>
            </div>
          </CardHeader>
          <CardContent>
            <TabsContent value="month" className="mt-0"><div className="h-80"><RevenueAreaChart data={monthly} height={320} /></div></TabsContent>
            <TabsContent value="day" className="mt-0"><div className="h-80"><RevenueAreaChart data={daily} height={320} /></div></TabsContent>
            <TabsContent value="year" className="mt-0"><div className="h-80"><RevenueAreaChart data={yearly} height={320} /></div></TabsContent>
          </CardContent>
        </Tabs>
      </Card>

      <section className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>{t("compras.chart.season.title")}</CardTitle>
              <Badge variant="ghost">{t("compras.chart.season.badge")}</Badge>
            </div>
          </CardHeader>
          <CardContent><Heatmap matrix={heatmap.matrix} max={heatmap.max} /></CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>{t("compras.chart.suppliers.title")}</CardTitle></CardHeader>
          <CardContent>
            <BarChartH
              rows={suppliers.slice(0, 10).map((s) => ({
                key: s.supplier,
                label: s.supplier,
                value: s.totalPurchases,
              }))}
            />
          </CardContent>
        </Card>
      </section>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>{t("compras.orders.title")}</CardTitle>
            <Badge variant="ghost">{t("compras.orders.badge", { count: kpi.ordersCount.toLocaleString("pt-BR") })}</Badge>
          </div>
        </CardHeader>
        <CardContent className="px-0">
          <RecentOrdersTable orders={data.recentOrders} />
        </CardContent>
      </Card>
    </div>
  );
}

function RecentOrdersTable({ orders: recent }: { orders: CompraRecente[] }) {
  const { t } = useTranslation();

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-y border-border text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
            <th className="text-left font-medium py-2 px-5">{t("compras.table.order")}</th>
            <th className="text-left font-medium py-2 px-5">{t("compras.table.supplier")}</th>
            <th className="text-right font-medium py-2 px-5">{t("compras.table.items")}</th>
            <th className="text-right font-medium py-2 px-5">{t("compras.table.total")}</th>
            <th className="text-right font-medium py-2 px-5">{t("compras.table.date")}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {recent.map((o) => (
            <tr key={o.id} className="hover:bg-muted/30 transition-colors">
              <td className="py-2.5 px-5 font-mono text-xs">{o.id}</td>
              <td className="py-2.5 px-5 truncate max-w-[200px]">{o.supplierName}</td>
              <td className="py-2.5 px-5 text-right tabular">{o.items}</td>
              <td className="py-2.5 px-5 text-right tabular font-medium"><Money value={o.total} /></td>
              <td className="py-2.5 px-5 text-right tabular text-muted-foreground">{new Date(o.date + "T00:00:00").toLocaleDateString("pt-BR")}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
