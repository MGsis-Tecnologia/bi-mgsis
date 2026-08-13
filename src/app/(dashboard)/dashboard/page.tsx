"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowUpRight, Layers, Target, TrendingUp, Zap } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { InsightCard } from "@/components/dashboard/insight-card";
import { EmptyState } from "@/components/dashboard/empty-state";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { RevenueAreaChart, MiniSparkArea } from "@/components/charts/revenue-area-chart";
import { BarChartH } from "@/components/charts/bar-chart-h";
import { DonutChart } from "@/components/charts/donut-chart";
import { Heatmap } from "@/components/charts/heatmap";
import { Money } from "@/components/dashboard/money";
import { useDashboardAnalytics } from "@/lib/hooks/use-dashboard-analytics";
import { useFilters } from "@/lib/store/filters";
import { comparisonLabel } from "@/lib/utils/dates";
import { formatCurrency, formatNumber, formatPercent } from "@/lib/utils/format";
import { useTranslation } from "@/lib/hooks/use-translation";
import { usePrimeiroNome } from "@/components/providers/usuario-provider";
import { useMoedaExibicao } from "@/lib/hooks/use-moeda-exibicao";
import type { DictionaryKey } from "@/lib/i18n/dictionaries";

export default function ExecutiveDashboardPage() {
  const { t } = useTranslation();
  const currency = useMoedaExibicao();
  const getRange = useFilters((s) => s.getRange);
  const preset = useFilters((s) => s.preset);
  const customRange = useFilters((s) => s.customRange);

  // Tudo agregado no servidor: o navegador recebe números prontos, não linhas.
  const { data, loading, error } = useDashboardAnalytics();

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const range = React.useMemo(() => getRange(), [preset, customRange, getRange]);
  const cmpLabel = React.useMemo(() => comparisonLabel(preset, range), [preset, range]);

  const kpi = data?.kpi;
  const monthly = data?.monthly ?? [];
  const daily = data?.daily ?? [];
  const yearly = data?.yearly ?? [];
  const insights = data?.insights ?? [];
  const heatmap = data?.heatmap ?? { matrix: [], max: 0 };
  const donutData = data?.donutData ?? [];
  const channelRevenue = data?.channelRevenue ?? [];
  const topProducts = data?.topProducts ?? [];
  const topSellers = data?.topSellers ?? [];
  const sparkMonthly = monthly.slice(-12);
  const goalProgress = kpi ? Math.min(1.4, kpi.revenue / (kpi.previous.revenue * 1.08 || 1)) : 0;

  // A chave sai direto da hora. Antes o código escolhia um texto em português
  // e depois comparava esse texto para achar a chave — o que quebraria calado
  // se alguém editasse a tradução.
  const saudacao = React.useMemo<DictionaryKey>(() => {
    const h = new Date().getHours();
    if (h < 12) return "dashboard.header.greeting.morning";
    if (h < 18) return "dashboard.header.greeting.afternoon";
    return "dashboard.header.greeting.evening";
  }, []);

  // Sem nome (sessão ainda não hidratada), a saudação vai sozinha em vez de
  // mostrar uma vírgula solta.
  const primeiroNome = usePrimeiroNome();
  const titulo = primeiroNome ? `${t(saudacao)}, ${primeiroNome}.` : `${t(saudacao)}.`;

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow={t("dashboard.header.eyebrow")}
        title={titulo}
        description={t("dashboard.header.description", { count: formatNumber(kpi?.ordersCount ?? 0) })}
      >
        <Badge variant={loading ? "warning" : "positive"} className="gap-1.5">
          <span className="relative inline-block h-1.5 w-1.5 rounded-full bg-positive pulse-dot" />
          {loading ? "Carregando…" : t("dashboard.header.synced")}
        </Badge>
      </PageHeader>

      {/* Brand tagline */}
      <div className="flex items-center gap-4">
        <span className="h-px flex-1 bg-border/60" />
        <p className="text-[36px] font-serif italic tracking-wide text-muted-foreground select-none whitespace-nowrap">
          Inteligência que conecta gestão e resultado
        </p>
        <span className="h-px flex-1 bg-border/60" />
      </div>

      {error ? (
        <div className="rounded-lg border border-negative/30 bg-negative/10 px-4 py-3 text-sm text-negative">
          Não foi possível carregar os indicadores: {error}
        </div>
      ) : !kpi || !data?.hasData ? (
        loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-[128px] animate-pulse rounded-lg bg-muted/40" />
            ))}
          </div>
        ) : (
          <EmptyState />
        )
      ) : (
        <>
          {/* Período sem movimento, mas a empresa tem dados: sem este aviso a tela
              zerada parece defeito. Acontece no começo de mês, por exemplo. */}
          {kpi.ordersCount === 0 && (
            <div className="rounded-lg border border-border bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
              Nenhum movimento no período selecionado. Ajuste o filtro de data para ver
              os indicadores.
            </div>
          )}

          {/* HERO ROW */}
          <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="reveal reveal-1">
              <KpiCard
                label={t("dashboard.kpi.revenue.label")}
                caption={t("dashboard.kpi.revenue.caption")}
                value={formatCurrency(kpi.revenue, currency, { compact: true })}
                delta={kpi.delta.revenue} deltaTooltip={cmpLabel} accent="accent" size="lg"
                spark={<MiniSparkArea data={sparkMonthly} />}
              />
            </div>
            <div className="reveal reveal-2">
              <KpiCard
                label={t("dashboard.kpi.profit.label")}
                caption={`${t("dashboard.kpi.profit.caption")} ${formatPercent(kpi.marginPct, { decimals: 1 })}`}
                value={formatCurrency(kpi.profit, currency, { compact: true })}
                delta={kpi.delta.profit} deltaTooltip={cmpLabel}
                accent={kpi.profit >= 0 ? "positive" : "negative"} size="lg"
                spark={<MiniSparkArea data={sparkMonthly} color="positive" />}
              />
            </div>
            <div className="reveal reveal-3">
              <KpiCard
                label={t("dashboard.kpi.ticket.label")}
                caption={t("dashboard.kpi.ticket.caption", { count: formatNumber(kpi.uniqueCustomers) })}
                value={formatCurrency(kpi.averageTicket, currency)}
                delta={kpi.delta.averageTicket} deltaTooltip={cmpLabel} size="lg"
              />
            </div>
            <div className="reveal reveal-4">
              <KpiCard
                label={t("dashboard.kpi.orders.label")}
                caption={t("dashboard.kpi.orders.caption", { count: formatNumber(kpi.itemsSold) })}
                value={formatNumber(kpi.ordersCount)}
                delta={kpi.delta.ordersCount} deltaTooltip={cmpLabel} size="lg"
              />
            </div>
          </section>

          {/* Trend + Insights */}
          <section className="grid grid-cols-1 lg:grid-cols-3 gap-3">
            <Card className="lg:col-span-2 reveal reveal-2">
              <Tabs defaultValue="month">
                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 p-5">
                  <div>
                    <div className="text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground">{t("dashboard.trend.title")}</div>
                    <div className="mt-2 flex items-baseline gap-3">
                      <span className="display-figure text-[36px] leading-none tabular"><Money value={kpi.revenue} compact /></span>
                      <span className="text-xs text-muted-foreground tabular flex items-center gap-1">vs. <Money value={kpi.previous.revenue} compact /></span>
                    </div>
                  </div>
                  <TabsList>
                    <TabsTrigger value="month">{t("dashboard.trend.tab.month")}</TabsTrigger>
                    <TabsTrigger value="day">{t("dashboard.trend.tab.day")}</TabsTrigger>
                    <TabsTrigger value="year">{t("dashboard.trend.tab.year")}</TabsTrigger>
                    <TabsTrigger value="profit">{t("dashboard.trend.tab.profit")}</TabsTrigger>
                  </TabsList>
                </div>
                <div className="px-2 pb-2">
                  <TabsContent value="month" className="mt-0"><RevenueAreaChart data={monthly} height={280} /></TabsContent>
                  <TabsContent value="day" className="mt-0"><RevenueAreaChart data={daily} height={280} /></TabsContent>
                  <TabsContent value="year" className="mt-0"><RevenueAreaChart data={yearly} height={280} /></TabsContent>
                  <TabsContent value="profit" className="mt-0"><RevenueAreaChart data={monthly} height={280} compareKey="profit" /></TabsContent>
                </div>
              </Tabs>
              {(() => {
                const positives = monthly.filter((m) => m.revenue > 0).map((m) => m.revenue);
                const maxValue = positives.length > 0 ? Math.max(...positives) : 0;
                const minValue = positives.length > 0 ? Math.min(...positives) : 0;
                const avgValue = positives.length > 0 ? positives.reduce((s, v) => s + v, 0) / positives.length : 0;
                return (
                  <div className="border-t border-border grid grid-cols-3 divide-x divide-border">
                    <MiniStat label={t("dashboard.trend.stat.max")} value={<Money value={maxValue} compact />} />
                    <MiniStat label={t("dashboard.trend.stat.min")} value={<Money value={minValue} compact />} />
                    <MiniStat label={t("dashboard.trend.stat.avg")} value={<Money value={avgValue} compact />} />
                  </div>
                );
              })()}
            </Card>

            <Card className="reveal reveal-3 overflow-hidden">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle>{t("dashboard.insights.title")}</CardTitle>
                  <Badge variant="ghost" className="gap-1"><Zap className="h-3 w-3" /> IA</Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-2.5 pb-4">
                {insights.length === 0
                  ? <p className="text-sm text-muted-foreground">{t("dashboard.insights.empty")}</p>
                  : insights.map((ins, i) => <InsightCard key={ins.id} insight={ins} index={i} />)}
              </CardContent>
            </Card>
          </section>

          {/* Subgrupos + Canais */}
          <section className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            <Card className="reveal reveal-3">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle>{t("dashboard.chart.category.title")}</CardTitle>
                  <Link href="/produtos" className="inline-flex items-center gap-1 text-[11px] text-accent hover:underline">
                    {t("dashboard.chart.category.link")} <ArrowUpRight className="h-3 w-3" />
                  </Link>
                </div>
              </CardHeader>
              <CardContent>
                <DonutChart data={donutData} centerLabel={t("dashboard.chart.category.center")} centerValue={formatCurrency(kpi.revenue, currency, { compact: true })} height={220} />
              </CardContent>
            </Card>
            <Card className="reveal reveal-4">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle>{t("dashboard.chart.channel.title")}</CardTitle>
                  <Badge variant="ghost" className="gap-1"><Layers className="h-3 w-3" /> {t("dashboard.chart.channel.badge", { count: channelRevenue.length })}</Badge>
                </div>
              </CardHeader>
              <CardContent><BarChartH rows={channelRevenue} /></CardContent>
            </Card>
          </section>

          {/* Heatmap + Meta */}
          <section className="grid grid-cols-1 lg:grid-cols-3 gap-3">
            <Card className="lg:col-span-2 reveal reveal-4">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle>{t("dashboard.heatmap.title")}</CardTitle>
                  <span className="text-[11px] text-muted-foreground">{t("dashboard.heatmap.desc")}</span>
                </div>
              </CardHeader>
              <CardContent><Heatmap matrix={heatmap.matrix} max={heatmap.max} /></CardContent>
            </Card>
            <Card className="reveal reveal-5">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle>{t("dashboard.goal.title")}</CardTitle>
                  <Badge variant={goalProgress >= 1 ? "positive" : "warning"} className="gap-1">
                    <Target className="h-3 w-3" />{formatPercent(goalProgress, { decimals: 0 })}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-5">
                <div>
                  <div className="flex items-baseline justify-between mb-1.5">
                    <span className="text-xs text-muted-foreground">{t("dashboard.goal.acc")}</span>
                    <span className="display-figure text-2xl tabular"><Money value={kpi.revenue} compact /></span>
                  </div>
                  <div className="relative h-2 w-full overflow-hidden rounded-full bg-muted">
                    <div className="h-full rounded-full bg-foreground transition-[width] duration-700" style={{ width: `${Math.min(100, goalProgress * 100)}%` }} />
                  </div>
                  <div className="mt-1.5 flex justify-between text-[11px] tabular text-muted-foreground">
                    <span>0</span>
                    <span>{t("dashboard.goal.target")}<Money value={kpi.previous.revenue * 1.08} compact /></span>
                  </div>
                </div>
                <div className="divider-fade" />
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">{t("dashboard.goal.proj.title")}</span>
                    <Badge variant={kpi.delta.revenue > 0 ? "positive" : "warning"} className="gap-1">
                      <TrendingUp className="h-3 w-3" />{formatPercent(kpi.delta.revenue, { signed: true, decimals: 1 })}
                    </Badge>
                  </div>
                  <p className="text-[12.5px] leading-relaxed text-muted-foreground">
                    {t("dashboard.goal.proj.desc1")}<span className="text-foreground font-medium"><Money value={kpi.revenue * 1.05} compact /></span>.
                  </p>
                </div>
              </CardContent>
            </Card>
          </section>

          {/* Top performers */}
          <section className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            <Card className="reveal reveal-5">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle>{t("dashboard.top.products.title")}</CardTitle>
                  <Link href="/produtos" className="inline-flex items-center gap-1 text-[11px] text-accent hover:underline">
                    {t("dashboard.top.products.link")} <ArrowUpRight className="h-3 w-3" />
                  </Link>
                </div>
              </CardHeader>
              <CardContent>
                <BarChartH rows={topProducts.slice(0, 7).map((e) => ({ key: e.item.id, label: e.item.name, value: e.revenue, secondary: `${e.units} un · ${e.curve}` }))} maxRows={7} />
              </CardContent>
            </Card>
            <Card className="reveal reveal-6">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle>{t("dashboard.top.sellers.title")}</CardTitle>
                  <Link href="/vendedores" className="inline-flex items-center gap-1 text-[11px] text-accent hover:underline">
                    {t("dashboard.top.sellers.link")} <ArrowUpRight className="h-3 w-3" />
                  </Link>
                </div>
              </CardHeader>
              <CardContent>
                <BarChartH
                  rows={topSellers.slice(0, 7).map((s) => ({ key: s.seller.id, label: s.seller.name, value: s.revenue, secondary: t("dashboard.top.sellers.meta", { percent: formatPercent(s.achievement, { decimals: 0 }) }), tone: s.achievement >= 1 ? "positive" : s.achievement >= 0.8 ? "accent" : "muted" }))}
                  maxRows={7}
                />
              </CardContent>
            </Card>
          </section>
        </>
      )}
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
