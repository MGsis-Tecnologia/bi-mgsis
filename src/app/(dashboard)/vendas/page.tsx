"use client";

import * as React from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { PageHeader } from "@/components/layout/page-header";
import { KpiCard } from "@/components/dashboard/kpi-card";
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
import { dailySeries, heatmapByDayOfWeek, monthlySeries } from "@/lib/analytics/timeseries";
import { formatCurrency, formatNumber, formatPercent } from "@/lib/utils/format";
import { convertFromBRL } from "@/lib/utils/currency";
import { EXCHANGE_RATES } from "@/lib/mock/seed";

const REGION_LABELS: Record<string, string> = {
  sudeste: "Sudeste",
  sul: "Sul",
  "centro-oeste": "Centro-Oeste",
  nordeste: "Nordeste",
  norte: "Norte",
};

export default function VendasPage() {
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

  const byRegion = React.useMemo(() => {
    const m: Record<string, number> = {};
    for (const o of orders) {
      if (o.status === "cancelado") continue;
      m[o.region] = (m[o.region] ?? 0) + o.totalBRL;
    }
    return Object.entries(m)
      .map(([k, v]) => ({ key: k, label: REGION_LABELS[k] ?? k, value: v }))
      .sort((a, b) => b.value - a.value);
  }, [orders]);

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Análise de vendas"
        title="Como vendemos."
        description="Evolução temporal, sazonalidade, distribuição regional e comparativos."
      />

      <section className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard
          label="Receita"
          value={formatCurrency(convertFromBRL(kpi.revenue, currency, EXCHANGE_RATES), currency, {
            compact: true,
          })}
          accent="accent"
        />
        <KpiCard label="Pedidos" value={formatNumber(kpi.ordersCount)} />
        <KpiCard
          label="Ticket médio"
          value={formatCurrency(
            convertFromBRL(kpi.averageTicket, currency, EXCHANGE_RATES),
            currency
          )}
        />
        <KpiCard label="Margem" value={formatPercent(kpi.marginPct, { decimals: 1 })} />
      </section>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle>Evolução temporal</CardTitle>
              <p className="mt-1 text-xs text-muted-foreground">
                Comparativos diários e mensais no período selecionado.
              </p>
            </div>
            <Tabs defaultValue="month">
              <TabsList>
                <TabsTrigger value="month">Mensal</TabsTrigger>
                <TabsTrigger value="day">Diário</TabsTrigger>
                <TabsTrigger value="bars">Pedidos × Receita</TabsTrigger>
              </TabsList>
              <TabsContent value="month">
                <div className="h-72 mt-3">
                  <RevenueAreaChart data={monthly} height={280} />
                </div>
              </TabsContent>
              <TabsContent value="day">
                <div className="h-72 mt-3">
                  <RevenueAreaChart data={daily} height={280} />
                </div>
              </TabsContent>
              <TabsContent value="bars">
                <div className="h-72 mt-3">
                  <ResponsiveContainer width="100%" height={280}>
                    <BarChart data={monthly} margin={{ top: 12, right: 12, left: 0, bottom: 0 }}>
                      <ChartDefs />
                      <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="2 4" vertical={false} />
                      <XAxis
                        dataKey="label"
                        tickLine={false}
                        axisLine={false}
                        tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }}
                      />
                      <YAxis
                        tickLine={false}
                        axisLine={false}
                        tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }}
                        tickFormatter={(v) =>
                          formatCurrency(convertFromBRL(Number(v), currency, EXCHANGE_RATES), currency, {
                            compact: true,
                          })
                        }
                        width={60}
                      />
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
              <CardTitle>Sazonalidade · dia × semana</CardTitle>
              <Badge variant="ghost">heatmap</Badge>
            </div>
          </CardHeader>
          <CardContent>
            <Heatmap matrix={heatmap.matrix} max={heatmap.max} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Receita por região</CardTitle>
          </CardHeader>
          <CardContent>
            <BarChartH rows={byRegion} />
          </CardContent>
        </Card>
      </section>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Últimos pedidos</CardTitle>
            <Badge variant="ghost">{orders.length.toLocaleString("pt-BR")} resultados</Badge>
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
  const ds = useDataset();
  const orders = useFilteredOrders();
  const recent = React.useMemo(
    () => [...orders].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 12),
    [orders]
  );
  const customerById = React.useMemo(() => new Map(ds.customers.map((c) => [c.id, c])), [ds.customers]);
  const sellerById = React.useMemo(() => new Map(ds.sellers.map((s) => [s.id, s])), [ds.sellers]);

  const STATUS: Record<string, { label: string; variant: "positive" | "warning" | "negative" | "default" }> = {
    pago: { label: "Pago", variant: "positive" },
    pendente: { label: "Pendente", variant: "warning" },
    cancelado: { label: "Cancelado", variant: "negative" },
    devolvido: { label: "Devolvido", variant: "warning" },
  };

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-y border-border text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
            <th className="text-left font-medium py-2 px-5">Pedido</th>
            <th className="text-left font-medium py-2 px-5">Cliente</th>
            <th className="text-left font-medium py-2 px-5">Vendedor</th>
            <th className="text-left font-medium py-2 px-5">Canal</th>
            <th className="text-right font-medium py-2 px-5">Itens</th>
            <th className="text-right font-medium py-2 px-5">Total</th>
            <th className="text-right font-medium py-2 px-5">Margem</th>
            <th className="text-left font-medium py-2 px-5">Status</th>
            <th className="text-right font-medium py-2 px-5">Data</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {recent.map((o) => {
            const cust = customerById.get(o.customerId);
            const sell = sellerById.get(o.sellerId);
            const s = STATUS[o.status] ?? STATUS.pago!;
            return (
              <tr key={o.id} className="hover:bg-muted/30 transition-colors">
                <td className="py-2.5 px-5 font-mono text-xs">{o.number}</td>
                <td className="py-2.5 px-5 truncate max-w-[180px]">{cust?.name ?? "—"}</td>
                <td className="py-2.5 px-5 text-muted-foreground">{sell?.name ?? "—"}</td>
                <td className="py-2.5 px-5 text-muted-foreground capitalize">{o.channel.replace("-", " ")}</td>
                <td className="py-2.5 px-5 text-right tabular">{o.items.length}</td>
                <td className="py-2.5 px-5 text-right tabular font-medium">
                  <Money brl={o.totalBRL} />
                </td>
                <td className="py-2.5 px-5 text-right tabular text-muted-foreground">
                  {formatPercent(o.marginPct, { decimals: 1 })}
                </td>
                <td className="py-2.5 px-5">
                  <Badge variant={s.variant}>{s.label}</Badge>
                </td>
                <td className="py-2.5 px-5 text-right tabular text-muted-foreground">
                  {new Date(o.date).toLocaleDateString("pt-BR")}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
