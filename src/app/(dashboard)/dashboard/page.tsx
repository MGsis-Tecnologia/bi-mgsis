"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowUpRight, Layers, Target, TrendingUp, Zap } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { InsightCard } from "@/components/dashboard/insight-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { RevenueAreaChart, MiniSparkArea } from "@/components/charts/revenue-area-chart";
import { BarChartH } from "@/components/charts/bar-chart-h";
import { DonutChart } from "@/components/charts/donut-chart";
import { Heatmap } from "@/components/charts/heatmap";
import { Money } from "@/components/dashboard/money";
import { useDataset, useFilteredOrders } from "@/lib/hooks/use-dataset";
import { useFilters } from "@/lib/store/filters";
import {
  computeKpisWithComparison,
  revenueByCategory,
} from "@/lib/analytics/kpis";
import {
  dailySeries,
  heatmapByDayOfWeek,
  monthlySeries,
} from "@/lib/analytics/timeseries";
import { generateInsights } from "@/lib/analytics/insights";
import { sellerMetrics } from "@/lib/analytics/sellers";
import { productABC } from "@/lib/analytics/abc";
import { formatCurrency, formatNumber, formatPercent } from "@/lib/utils/format";
import { convertFromBRL } from "@/lib/utils/currency";
import { EXCHANGE_RATES } from "@/lib/mock/seed";

const CATEGORY_LABELS: Record<string, string> = {
  eletronicos: "Eletrônicos",
  moda: "Moda",
  "casa-decoracao": "Casa & Decoração",
  "esporte-lazer": "Esporte & Lazer",
  "beleza-saude": "Beleza & Saúde",
  "alimentos-bebidas": "Alimentos & Bebidas",
  "livros-midia": "Livros & Mídia",
};

const CHANNEL_LABELS: Record<string, string> = {
  ecommerce: "E-commerce",
  marketplace: "Marketplace",
  "loja-fisica": "Loja física",
  b2b: "B2B",
  telemarketing: "Telemarketing",
};

export default function ExecutiveDashboardPage() {
  const ds = useDataset();
  const orders = useFilteredOrders();
  const currency = useFilters((s) => s.currency);
  const getRange = useFilters((s) => s.getRange);
  const preset = useFilters((s) => s.preset);
  const customRange = useFilters((s) => s.customRange);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const range = React.useMemo(() => getRange(), [preset, customRange, getRange]);

  const kpi = React.useMemo(
    () => computeKpisWithComparison(ds.orders, range),
    [ds.orders, range]
  );

  const monthly = React.useMemo(() => monthlySeries(orders, range), [orders, range]);
  const daily = React.useMemo(() => dailySeries(orders, range), [orders, range]);
  const insights = React.useMemo(() => generateInsights(ds.orders, ds.products, range), [
    ds,
    range,
  ]);
  const heatmap = React.useMemo(() => heatmapByDayOfWeek(orders), [orders]);

  const productCategoryById = React.useMemo(
    () => new Map(ds.products.map((p) => [p.id, p.category])),
    [ds.products]
  );

  const rbc = React.useMemo(
    () => revenueByCategory(orders, productCategoryById),
    [orders, productCategoryById]
  );
  const donutData = Object.entries(rbc)
    .map(([k, v]) => ({ key: k, label: CATEGORY_LABELS[k] ?? k, value: v }))
    .sort((a, b) => b.value - a.value);

  const channelRevenue = React.useMemo(() => {
    const m: Record<string, number> = {};
    for (const o of orders) {
      if (o.status === "cancelado") continue;
      m[o.channel] = (m[o.channel] ?? 0) + o.totalBRL;
    }
    return Object.entries(m)
      .map(([k, v]) => ({ key: k, label: CHANNEL_LABELS[k] ?? k, value: v }))
      .sort((a, b) => b.value - a.value);
  }, [orders]);

  const topProducts = React.useMemo(() => productABC(orders, ds.products), [orders, ds.products]);

  const topSellers = React.useMemo(() => sellerMetrics(orders, ds.sellers), [orders, ds.sellers]);

  const sparkMonthly = monthly.slice(-12);
  const goalProgress = Math.min(1.4, kpi.revenue / (kpi.previous.revenue * 1.08 || 1));

  const greeting = React.useMemo(() => {
    const h = new Date().getHours();
    if (h < 12) return "Bom dia";
    if (h < 18) return "Boa tarde";
    return "Boa noite";
  }, []);

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Visão executiva · ao vivo"
        title={`${greeting}, Rogério.`}
        description={`Resumo comercial do período selecionado · ${formatNumber(orders.length)} pedidos analisados.`}
      >
        <Badge variant="positive" className="gap-1.5">
          <span className="relative inline-block h-1.5 w-1.5 rounded-full bg-positive text-positive pulse-dot" />
          Dados sincronizados
        </Badge>
      </PageHeader>

      {/* HERO ROW — 4 large KPIs */}
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="reveal reveal-1">
          <KpiCard
            label="Faturamento"
            caption="Receita líquida no período"
            value={formatCurrency(
              convertFromBRL(kpi.revenue, currency, EXCHANGE_RATES),
              currency,
              { compact: true }
            )}
            delta={kpi.delta.revenue}
            accent="accent"
            size="lg"
            spark={<MiniSparkArea data={sparkMonthly} />}
          />
        </div>
        <div className="reveal reveal-2">
          <KpiCard
            label="Lucro Operacional"
            caption={`Margem ${formatPercent(kpi.marginPct, { decimals: 1 })}`}
            value={formatCurrency(
              convertFromBRL(kpi.profit, currency, EXCHANGE_RATES),
              currency,
              { compact: true }
            )}
            delta={kpi.delta.profit}
            accent={kpi.profit >= 0 ? "positive" : "negative"}
            size="lg"
            spark={<MiniSparkArea data={sparkMonthly} color="positive" />}
          />
        </div>
        <div className="reveal reveal-3">
          <KpiCard
            label="Ticket médio"
            caption={`${formatNumber(kpi.uniqueCustomers)} clientes únicos`}
            value={formatCurrency(
              convertFromBRL(kpi.averageTicket, currency, EXCHANGE_RATES),
              currency,
              { compact: false }
            )}
            delta={kpi.delta.averageTicket}
            size="lg"
          />
        </div>
        <div className="reveal reveal-4">
          <KpiCard
            label="Pedidos"
            caption={`${formatNumber(kpi.itemsSold)} itens vendidos`}
            value={formatNumber(kpi.ordersCount)}
            delta={kpi.delta.ordersCount}
            size="lg"
          />
        </div>
      </section>

      {/* MAIN AREA — Trend + Insights */}
      <section className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <Card className="lg:col-span-2 reveal reveal-2">
          <Tabs defaultValue="month">
            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 p-5">
              <div>
                <div className="text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
                  Evolução de receita
                </div>
                <div className="mt-2 flex items-baseline gap-3">
                  <span className="display-figure text-[36px] leading-none tabular">
                    <Money brl={kpi.revenue} compact />
                  </span>
                  <span className="text-xs text-muted-foreground tabular">
                    vs. <Money brl={kpi.previous.revenue} compact /> no período anterior
                  </span>
                </div>
              </div>
              <TabsList>
                <TabsTrigger value="month">Mensal</TabsTrigger>
                <TabsTrigger value="day">Diário</TabsTrigger>
                <TabsTrigger value="profit">Lucro</TabsTrigger>
              </TabsList>
            </div>
            <div className="px-2 pb-2">
              <TabsContent value="month" className="mt-0">
                <RevenueAreaChart data={monthly} height={280} />
              </TabsContent>
              <TabsContent value="day" className="mt-0">
                <RevenueAreaChart data={daily} height={280} />
              </TabsContent>
              <TabsContent value="profit" className="mt-0">
                <RevenueAreaChart data={monthly} height={280} compareKey="profit" />
              </TabsContent>
            </div>
          </Tabs>
          <div className="border-t border-border grid grid-cols-3 divide-x divide-border">
            <MiniStat
              label="Maior mês"
              value={
                <Money
                  brl={Math.max(...monthly.map((m) => m.revenue), 0)}
                  compact
                />
              }
            />
            <MiniStat
              label="Menor mês"
              value={
                <Money
                  brl={Math.min(...monthly.filter((m) => m.revenue > 0).map((m) => m.revenue), 0)}
                  compact
                />
              }
            />
            <MiniStat
              label="Média mensal"
              value={
                <Money
                  brl={
                    monthly.length > 0
                      ? monthly.reduce((s, m) => s + m.revenue, 0) / monthly.length
                      : 0
                  }
                  compact
                />
              }
            />
          </div>
        </Card>

        <Card className="reveal reveal-3 overflow-hidden">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Insights automáticos</CardTitle>
              <Badge variant="ghost" className="gap-1">
                <Zap className="h-3 w-3" /> IA
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-2.5 pb-4">
            {insights.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Sem destaques no período. Ajuste os filtros para refinar.
              </p>
            ) : (
              insights.map((ins, i) => <InsightCard key={ins.id} insight={ins} index={i} />)
            )}
          </CardContent>
        </Card>
      </section>

      {/* Composition: categories donut + channels bar */}
      <section className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <Card className="reveal reveal-3">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Receita por categoria</CardTitle>
              <Link
                href="/produtos"
                className="inline-flex items-center gap-1 text-[11px] text-accent hover:underline"
              >
                ver produtos <ArrowUpRight className="h-3 w-3" />
              </Link>
            </div>
          </CardHeader>
          <CardContent>
            <DonutChart
              data={donutData}
              centerLabel="Total"
              centerValue={formatCurrency(
                convertFromBRL(kpi.revenue, currency, EXCHANGE_RATES),
                currency,
                { compact: true }
              )}
              height={220}
            />
          </CardContent>
        </Card>

        <Card className="reveal reveal-4">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Receita por canal</CardTitle>
              <Badge variant="ghost" className="gap-1">
                <Layers className="h-3 w-3" /> {channelRevenue.length} canais
              </Badge>
            </div>
          </CardHeader>
          <CardContent>
            <BarChartH rows={channelRevenue} />
          </CardContent>
        </Card>
      </section>

      {/* Heatmap + Meta */}
      <section className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <Card className="lg:col-span-2 reveal reveal-4">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Mapa de calor · dia × semana</CardTitle>
              <span className="text-[11px] text-muted-foreground">
                concentração de receita ao longo do mês
              </span>
            </div>
          </CardHeader>
          <CardContent>
            <Heatmap matrix={heatmap.matrix} max={heatmap.max} />
          </CardContent>
        </Card>

        <Card className="reveal reveal-5">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Meta vs. realizado</CardTitle>
              <Badge variant={goalProgress >= 1 ? "positive" : "warning"} className="gap-1">
                <Target className="h-3 w-3" />
                {formatPercent(goalProgress, { decimals: 0 })}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-5">
            <div>
              <div className="flex items-baseline justify-between mb-1.5">
                <span className="text-xs text-muted-foreground">Receita acumulada</span>
                <span className="display-figure text-2xl tabular">
                  <Money brl={kpi.revenue} compact />
                </span>
              </div>
              <div className="relative h-2 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-foreground transition-[width] duration-700"
                  style={{ width: `${Math.min(100, goalProgress * 100)}%` }}
                />
              </div>
              <div className="mt-1.5 flex justify-between text-[11px] tabular text-muted-foreground">
                <span>0</span>
                <span>
                  Meta:{" "}
                  <Money brl={kpi.previous.revenue * 1.08} compact />
                </span>
              </div>
            </div>

            <div className="divider-fade" />

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Aceleração projetada</span>
                <Badge variant={kpi.delta.revenue > 0 ? "positive" : "warning"} className="gap-1">
                  <TrendingUp className="h-3 w-3" />
                  {formatPercent(kpi.delta.revenue, { signed: true, decimals: 1 })}
                </Badge>
              </div>
              <p className="text-[12.5px] leading-relaxed text-muted-foreground">
                Mantendo o ritmo atual, o trimestre fecha com receita estimada de{" "}
                <span className="text-foreground font-medium">
                  <Money brl={kpi.revenue * 1.05} compact />
                </span>
                .
              </p>
            </div>
          </CardContent>
        </Card>
      </section>

      {/* Top performers row */}
      <section className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <Card className="reveal reveal-5">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Produtos mais vendidos</CardTitle>
              <Link
                href="/produtos"
                className="inline-flex items-center gap-1 text-[11px] text-accent hover:underline"
              >
                ranking completo <ArrowUpRight className="h-3 w-3" />
              </Link>
            </div>
          </CardHeader>
          <CardContent>
            <BarChartH
              rows={topProducts.slice(0, 7).map((e) => ({
                key: e.item.id,
                label: e.item.name,
                value: e.revenue,
                secondary: `${e.units} un · ${e.curve}`,
              }))}
              maxRows={7}
            />
          </CardContent>
        </Card>

        <Card className="reveal reveal-6">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Top vendedores</CardTitle>
              <Link
                href="/vendedores"
                className="inline-flex items-center gap-1 text-[11px] text-accent hover:underline"
              >
                ver performance <ArrowUpRight className="h-3 w-3" />
              </Link>
            </div>
          </CardHeader>
          <CardContent>
            <BarChartH
              rows={topSellers.slice(0, 7).map((s) => ({
                key: s.seller.id,
                label: s.seller.name,
                value: s.revenue,
                secondary: `${formatPercent(s.achievement, { decimals: 0 })} da meta`,
                tone: s.achievement >= 1 ? "positive" : s.achievement >= 0.8 ? "accent" : "muted",
              }))}
              maxRows={7}
            />
          </CardContent>
        </Card>
      </section>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="p-4">
      <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">{label}</div>
      <div className="mt-1 display-figure text-xl tabular">{value}</div>
    </div>
  );
}
