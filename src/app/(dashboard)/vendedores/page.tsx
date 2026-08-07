"use client";

import * as React from "react";
import { Info, Trophy } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { EmptyState } from "@/components/dashboard/empty-state";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Money } from "@/components/dashboard/money";
import { useVendedoresAnalytics } from "@/lib/hooks/use-vendedores-analytics";
import { formatNumber, formatPercent } from "@/lib/utils/format";
import { cn } from "@/lib/utils";
import { useTranslation } from "@/lib/hooks/use-translation";

export default function VendedoresPage() {
  const { t } = useTranslation();

  // Tudo agregado no servidor: desempenho, prospecção (que compara o período
  // com o histórico completo) e consistência chegam prontos.
  const { data, loading, error } = useVendedoresAnalytics();

  const metrics = data?.metrics ?? [];
  const prospection = data?.prospection ?? [];
  const consistency = data?.consistency ?? [];
  const teamRevenue = data?.teamRevenue ?? 0;
  const totalReturns = data?.totalReturns ?? 0;
  const avgAchievement = data?.avgAchievement ?? 0;
  const top = metrics[0];
  const returnsPctOfSales = teamRevenue > 0 ? totalReturns / teamRevenue : 0;

  if (error) {
    return (
      <div className="space-y-8">
        <PageHeader eyebrow={t("vendedores.header.eyebrow")} title={t("vendedores.header.title")} description={t("vendedores.header.desc")} />
        <div className="rounded-lg border border-negative/30 bg-negative/10 px-4 py-3 text-sm text-negative">
          Não foi possível carregar os vendedores: {error}
        </div>
      </div>
    );
  }

  if (!data?.hasData) {
    return (
      <div className="space-y-8">
        <PageHeader eyebrow={t("vendedores.header.eyebrow")} title={t("vendedores.header.title")} description={t("vendedores.header.desc")} />
        {loading ? (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
            {Array.from({ length: 5 }).map((_, i) => (
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
      <PageHeader
        eyebrow={t("vendedores.header.eyebrow")}
        title={t("vendedores.header.title")}
        description={t("vendedores.header.desc")}
      >
        <Badge variant="ghost" className="gap-1">
          <Trophy className="h-3 w-3" />
          {t("vendedores.header.badge", { count: data.totalSellers })}
        </Badge>
      </PageHeader>

      <section className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
        <KpiCard
          label={t("vendedores.kpi.revenue")}
          value={<><Money value={teamRevenue} compact /></> as never}
          accent="accent"
        />
        <KpiCard
          label="Devoluções"
          caption={`${formatPercent(returnsPctOfSales, { decimals: 1 })} das vendas`}
          value={<span className="text-negative"><Money value={-totalReturns} compact /></span> as never}
          accent="negative"
        />
        <KpiCard
          label={t("vendedores.kpi.goal")}
          value={formatPercent(avgAchievement, { decimals: 0 })}
          accent={avgAchievement >= 0.8 ? "positive" : "default"}
        />
        <KpiCard
          label={t("vendedores.kpi.sellers")}
          value={formatNumber(data.totalSellers)}
        />
        <KpiCard
          label={t("vendedores.kpi.top")}
          caption={top?.name}
          value={<><Money value={top?.revenue ?? 0} compact /></> as never}
          accent="positive"
        />
      </section>

      <Card>
        <CardHeader>
          <CardTitle>{t("vendedores.table.title")}</CardTitle>
        </CardHeader>
        <CardContent className="px-0">
          <div className="overflow-x-auto overflow-y-auto max-h-[720px]">
            <table className="w-full text-sm">
              <thead className="[&_th]:sticky [&_th]:top-0 [&_th]:z-10 [&_th]:bg-surface [&_th]:border-b [&_th]:border-border">
                <tr className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                  <th className="text-left font-medium py-2 px-5">#</th>
                  <th className="text-left font-medium py-2 px-5">{t("vendedores.table.col.seller")}</th>
                  <th className="text-right font-medium py-2 px-5">{t("vendedores.table.col.orders")}</th>
                  <th className="text-right font-medium py-2 px-5">{t("vendedores.table.col.revenue")}</th>
                  <th className="text-right font-medium py-2 px-5">{t("vendedores.table.col.ticket")}</th>
                  <th className="text-right font-medium py-2 px-5">{t("vendedores.table.col.margin")}</th>
                  <th className="text-right font-medium py-2 px-5">% Desc.</th>
                  <th className="text-right font-medium py-2 px-5">Devoluções</th>
                  <th className="text-right font-medium py-2 px-5">% Dev.</th>
                  <th className="text-left font-medium py-2 px-5 w-[200px]">{t("vendedores.table.col.goal")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {metrics.map((m, i) => (
                  <tr key={m.id} className="hover:bg-muted/30 transition-colors">
                    <td className="py-3 px-5 font-mono text-xs text-muted-foreground tabular">
                      {(i + 1).toString().padStart(2, "0")}
                    </td>
                    <td className="py-3 px-5">
                      <div className="flex items-center gap-2.5">
                        <div className="grid h-7 w-7 place-items-center rounded-full bg-muted text-[10px] font-medium text-foreground">
                          {m.name
                            .split(" ")
                            .map((p) => p[0])
                            .slice(0, 2)
                            .join("")}
                        </div>
                        <div className="font-medium">{m.name}</div>
                      </div>
                    </td>
                    <td className="py-3 px-5 text-right tabular">{formatNumber(m.orders)}</td>
                    <td className="py-3 px-5 text-right tabular font-medium">
                      <Money value={m.revenue} compact />
                    </td>
                    <td className="py-3 px-5 text-right tabular text-muted-foreground">
                      <Money value={m.averageTicket} />
                    </td>
                    <td className="py-3 px-5 text-right tabular text-muted-foreground">
                      {formatPercent(m.marginPct, { decimals: 1 })}
                    </td>
                    <td className={cn(
                      "py-3 px-5 text-right tabular font-medium",
                      m.discountPct >= 0.15 ? "text-negative" : m.discountPct >= 0.07 ? "text-warning" : "text-muted-foreground"
                    )}>
                      {formatPercent(m.discountPct, { decimals: 1 })}
                    </td>
                    {(() => {
                      const ret = m.returns;
                      const retPct = m.revenue > 0 ? ret / m.revenue : 0;
                      return (
                        <>
                          <td className={cn(
                            "py-3 px-5 text-right tabular",
                            ret > 0 ? "text-negative font-medium" : "text-muted-foreground"
                          )}>
                            {ret > 0 ? <Money value={-ret} compact /> : "—"}
                          </td>
                          <td className={cn(
                            "py-3 px-5 text-right tabular font-medium",
                            retPct >= 0.1 ? "text-negative" : retPct >= 0.05 ? "text-warning" : "text-muted-foreground"
                          )}>
                            {ret > 0 ? formatPercent(retPct, { decimals: 1 }) : "—"}
                          </td>
                        </>
                      );
                    })()}
                    <td className="py-3 px-5">
                      <div className="flex items-center gap-2">
                        <Progress
                          value={m.achievement}
                          tone={m.achievement >= 1 ? "positive" : m.achievement >= 0.8 ? "default" : "warning"}
                          className="flex-1"
                        />
                        <span
                          className={cn(
                            "tabular text-[11px] font-medium w-12 text-right",
                            m.achievement >= 1 ? "text-positive" : "text-foreground"
                          )}
                        >
                          {formatPercent(m.achievement, { decimals: 0 })}
                        </span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Prospecção & carteira */}
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <CardTitle>Prospecção &amp; carteira</CardTitle>
              <p className="mt-1 text-[11px] text-muted-foreground">
                Período = filtro atual · base de comparação = todo o histórico.
                <span className="text-positive"> Novo</span> = 1ª compra com o vendedor dentro do período ·
                <span className="text-negative"> Churn</span> = comprava antes do período e não comprou nele.
              </p>
            </div>
            <Badge variant="ghost">{formatNumber(prospection.length)} vendedores</Badge>
          </div>
        </CardHeader>
        <CardContent className="px-0">
          <div className="overflow-x-auto overflow-y-auto max-h-[720px]">
            <table className="w-full text-sm">
              <thead className="[&_th]:sticky [&_th]:top-0 [&_th]:z-10 [&_th]:bg-surface [&_th]:border-b [&_th]:border-border">
                <tr className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                  <th className="text-left font-medium py-2 px-5">#</th>
                  <th className="text-left font-medium py-2 px-5">Vendedor</th>
                  <th className="text-right font-medium py-2 px-5">Clientes</th>
                  <th className="text-right font-medium py-2 px-5">Novos</th>
                  <th className="text-right font-medium py-2 px-5">Churn</th>
                  <th className="text-right font-medium py-2 px-5">Ticket · novos</th>
                  <th className="text-right font-medium py-2 px-5">Ticket · antigos</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {prospection.map((p, i) => (
                  <tr key={p.id} className="hover:bg-muted/30 transition-colors">
                    <td className="py-2.5 px-5 font-mono text-xs text-muted-foreground tabular">
                      {(i + 1).toString().padStart(2, "0")}
                    </td>
                    <td className="py-2.5 px-5 font-medium max-w-[220px] truncate">{p.name}</td>
                    <td className="py-2.5 px-5 text-right tabular text-muted-foreground">
                      {formatNumber(p.activeClients)}
                    </td>
                    <td className={cn(
                      "py-2.5 px-5 text-right tabular font-medium",
                      p.newClients > 0 ? "text-positive" : "text-muted-foreground"
                    )}>
                      {formatNumber(p.newClients)}
                    </td>
                    <td className={cn(
                      "py-2.5 px-5 text-right tabular font-medium",
                      p.churnedClients > 0 ? "text-negative" : "text-muted-foreground"
                    )}>
                      {formatNumber(p.churnedClients)}
                    </td>
                    <td className="py-2.5 px-5 text-right tabular">
                      {p.ticketNew > 0 ? <Money value={p.ticketNew} /> : "—"}
                    </td>
                    <td className="py-2.5 px-5 text-right tabular text-muted-foreground">
                      {p.ticketOld > 0 ? <Money value={p.ticketOld} /> : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {prospection.length === 0 && (
              <div className="py-10 text-center text-xs text-muted-foreground">
                Sem movimento de carteira no período.
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Consistência & concentração */}
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <CardTitle>Consistência &amp; concentração</CardTitle>
              <p className="mt-1 text-[11px] text-muted-foreground">
                Como a receita do período foi construída — receita diluída é resiliente; concentrada em poucos
                pedidos/dias é frágil. Base de calendário = dias em que a empresa faturou.
              </p>
            </div>
            <Badge variant="ghost">{formatNumber(consistency.length)} vendedores</Badge>
          </div>
        </CardHeader>
        <CardContent className="px-0">
          <div className="overflow-x-auto overflow-y-auto max-h-[720px]">
            <table className="w-full text-sm">
              <thead className="[&_th]:sticky [&_th]:top-0 [&_th]:z-10 [&_th]:bg-surface [&_th]:border-b [&_th]:border-border">
                <tr className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                  <th className="text-left font-medium py-2 px-5">#</th>
                  <th className="text-left font-medium py-2 px-5">Vendedor</th>
                  <th className="text-right font-medium py-2 px-5">Receita</th>
                  <th className="text-right font-medium py-2 px-5">Dias ativos</th>
                  <th className="text-right font-medium py-2 px-5">Cobertura</th>
                  <th className="text-right font-medium py-2 px-5">Top 3 pedidos</th>
                  <th className="text-right font-medium py-2 px-5">Maior cliente</th>
                  <th className="text-right font-medium py-2 px-5">Últ. 5 dias</th>
                  <th className="text-right font-medium py-2 px-5">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="inline-flex items-center gap-1 cursor-help underline decoration-dotted underline-offset-2">
                          Irregularidade
                          <Info className="h-3 w-3 opacity-60" />
                        </span>
                      </TooltipTrigger>
                      <TooltipContent align="end" className="max-w-[290px] normal-case tracking-normal">
                        <div className="space-y-1.5">
                          <div className="font-medium">Irregularidade (CV)</div>
                          <div className="text-muted-foreground">
                            Desvio padrão ÷ média do faturamento diário — dias sem venda contam como zero.
                            Mede os &quot;picos e vales&quot; do fluxo.
                          </div>
                          <div className="space-y-1 pt-0.5">
                            <div className="flex items-center gap-1.5">
                              <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground shrink-0" />
                              <span><strong>0 – 0,8</strong> · fluxo constante, saudável</span>
                            </div>
                            <div className="flex items-center gap-1.5">
                              <span className="h-1.5 w-1.5 rounded-full bg-warning shrink-0" />
                              <span><strong>0,8 – 1,5</strong> · alguma irregularidade</span>
                            </div>
                            <div className="flex items-center gap-1.5">
                              <span className="h-1.5 w-1.5 rounded-full bg-negative shrink-0" />
                              <span><strong>≥ 1,5</strong> · picos e vales fortes</span>
                            </div>
                          </div>
                        </div>
                      </TooltipContent>
                    </Tooltip>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {consistency.map((c, i) => (
                  <tr key={c.id} className="hover:bg-muted/30 transition-colors">
                    <td className="py-2.5 px-5 font-mono text-xs text-muted-foreground tabular">
                      {(i + 1).toString().padStart(2, "0")}
                    </td>
                    <td className="py-2.5 px-5 font-medium max-w-[200px] truncate">{c.name}</td>
                    <td className="py-2.5 px-5 text-right tabular">
                      <Money value={c.revenue} compact />
                    </td>
                    <td className="py-2.5 px-5 text-right tabular text-muted-foreground">
                      {formatNumber(c.activeDays)}/{formatNumber(c.operatingDays)}
                    </td>
                    <td className={cn("py-2.5 px-5 text-right tabular font-medium", coverageTone(c.dayCoverage))}>
                      {formatPercent(c.dayCoverage, { decimals: 0 })}
                    </td>
                    <td className={cn("py-2.5 px-5 text-right tabular font-medium", riskTone(c.top3Pct, 0.4, 0.25))}>
                      {formatPercent(c.top3Pct, { decimals: 1 })}
                      <div className="text-[10px] font-normal text-muted-foreground">
                        top 1: {formatPercent(c.top1Pct, { decimals: 1 })}
                      </div>
                    </td>
                    <td className={cn("py-2.5 px-5 text-right tabular font-medium", riskTone(c.topClientPct, 0.4, 0.25))}>
                      {formatPercent(c.topClientPct, { decimals: 1 })}
                    </td>
                    <td className={cn("py-2.5 px-5 text-right tabular font-medium", riskTone(c.last5Pct, 0.5, 0.35))}>
                      {formatPercent(c.last5Pct, { decimals: 1 })}
                    </td>
                    <td className={cn("py-2.5 px-5 text-right tabular font-medium", riskTone(c.cv, 1.5, 0.8))}>
                      {c.cv.toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {consistency.length === 0 && (
              <div className="py-10 text-center text-xs text-muted-foreground">
                Sem vendas no período.
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// Quanto MAIOR o valor, maior o risco (concentração, irregularidade).
function riskTone(value: number, high: number, mid: number): string {
  if (value >= high) return "text-negative";
  if (value >= mid) return "text-warning";
  return "text-muted-foreground";
}

// Quanto MENOR a cobertura de dias, maior o risco.
function coverageTone(value: number): string {
  if (value < 0.3) return "text-negative";
  if (value < 0.5) return "text-warning";
  return "text-positive";
}
