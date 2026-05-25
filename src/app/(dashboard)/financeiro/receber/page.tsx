"use client";

import * as React from "react";
import {
  Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { CheckCircle2, Clock, TrendingDown } from "lucide-react";
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
  computePaymentStats, monthlyCollectionAnalysis, clientPaymentAnalysis,
  type AgingBucketId, type GroupRow, type MonthlyCollectionRow, type ClientPaymentRow,
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
  const allRows = useFilteredReceivables();
  const currency = useFilters((s) => s.currency);

  // Split pending vs paid
  const pendingRows = React.useMemo(() => allRows.filter((r) => !r.isPaid), [allRows]);
  const hasPaidData  = allRows.some((r) => r.isPaid);

  // Existing analytics — operate on pending only
  const kpi      = React.useMemo(() => computeReceivablesKpis(pendingRows), [pendingRows]);
  const aging    = React.useMemo(() => agingBreakdown(pendingRows), [pendingRows]);
  const clients  = React.useMemo(() => byClient(pendingRows), [pendingRows]);
  const sellers  = React.useMemo(() => bySeller(pendingRows), [pendingRows]);
  const cities   = React.useMemo(() => byCity(pendingRows), [pendingRows]);
  const timeline = React.useMemo(() => dueTimeline(pendingRows), [pendingRows]);

  // Payment performance analytics — all rows (paid + pending)
  const payStats       = React.useMemo(() => computePaymentStats(allRows), [allRows]);
  const monthlyCol     = React.useMemo(() => monthlyCollectionAnalysis(allRows), [allRows]);
  const clientPayment  = React.useMemo(() => clientPaymentAnalysis(allRows), [allRows]);

  const detail = React.useMemo(() => {
    return [...pendingRows]
      .sort((a, b) => {
        if (a.status !== b.status) return a.status === "overdue" ? -1 : 1;
        if (a.status === "overdue") return b.daysOverdue - a.daysOverdue;
        return a.daysUntilDue - b.daysUntilDue;
      })
      .slice(0, 18);
  }, [pendingRows]);

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

  if (!rec.hasData) {
    return (
      <div className="space-y-8">
        <PageHeader eyebrow={t("receber.header.eyebrow")} title={t("receber.header.title")} description={t("receber.header.desc")} />
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
        <Badge variant="ghost">{t("receber.table.badge", { count: formatNumber(allRows.length) })}</Badge>
      </PageHeader>

      {pendingRows.length === 0 && !hasPaidData && (
        <div className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          {t("receber.empty.filtered")}
        </div>
      )}

      {/* ── A RECEBER (pending) ─────────────────────────────────────────────── */}
      {pendingRows.length > 0 && (
        <>
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

          <Card>
            <CardHeader><CardTitle>{t("receber.indicators.title")}</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-x-6 gap-y-4">
              <Indicator label={t("receber.kpi.titles")} value={formatNumber(kpi.titlesCount)} />
              <Indicator label={t("receber.kpi.clients")} value={formatNumber(kpi.clientsCount)} />
              <Indicator label={t("receber.kpi.avg_ticket")} value={formatCurrency(kpi.avgTicket, currency, { compact: true })} />
              <Indicator label={t("receber.kpi.avg_delay")} value={t("receber.delay.days", { count: Math.round(kpi.avgDaysOverdue) })} />
              <Indicator label={t("receber.kpi.due7")} value={formatCurrency(kpi.dueNext7, currency, { compact: true })} />
              <Indicator label={t("receber.kpi.due30")} value={formatCurrency(kpi.dueNext30, currency, { compact: true })} />
            </CardContent>
          </Card>

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
                      <Tooltip cursor={{ fill: "hsl(var(--muted) / 0.4)" }} content={<ChartTooltip />} />
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
                      <Bar dataKey="overdue" name={t("receber.timeline.overdue")} stackId="due" fill="hsl(var(--negative))" />
                      <Bar dataKey="upcoming" name={t("receber.timeline.upcoming")} stackId="due" fill="hsl(var(--accent))" radius={[3, 3, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          </section>

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

          <Card>
            <CardHeader><CardTitle>{t("receber.byseller.title")}</CardTitle></CardHeader>
            <CardContent className="px-0">
              <GroupTable rows={sellers} nameHeader={t("receber.table.seller")} fallbackLabel={t("receber.noseller")} maxRows={10} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>{t("receber.table.title")}</CardTitle>
                <Badge variant="ghost">{t("receber.table.badge", { count: formatNumber(pendingRows.length) })}</Badge>
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
                            r.status === "overdue" ? "bg-negative/10 text-negative" : "bg-positive/10 text-positive"
                          )}>
                            {r.status === "overdue" ? t("receber.status.overdue") : t("receber.status.upcoming")}
                          </span>
                        </td>
                        <td className={cn("py-2.5 px-5 text-right tabular", r.daysOverdue > 0 ? "text-negative font-medium" : "text-muted-foreground")}>
                          {r.daysOverdue > 0 ? t("receber.delay.days", { count: r.daysOverdue }) : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </>
      )}

      {/* ── ANÁLISE DE RECEBIMENTOS (paid items) ──────────────────────────────── */}
      {hasPaidData && (
        <>
          <div className="flex items-center gap-2 pt-2">
            <CheckCircle2 className="h-4 w-4 text-positive" />
            <h2 className="text-base font-semibold">Análise de Recebimentos</h2>
            <Badge variant="ghost">{formatNumber(payStats.paidCount)} recebimento(s)</Badge>
          </div>

          {/* Payment KPIs */}
          <section className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <KpiCard
              label="Total recebido"
              value={formatCurrency(payStats.totalReceived, currency, { compact: true })}
              accent="positive"
              caption={`de ${formatCurrency(payStats.totalAll, currency, { compact: true })} total`}
            />
            <KpiCard
              label="Taxa de recebimento"
              value={formatPercent(payStats.collectionRate, { decimals: 1 })}
              accent={payStats.collectionRate >= 0.8 ? "positive" : payStats.collectionRate >= 0.5 ? "default" : "negative"}
              caption={`${formatNumber(payStats.paidCount)} títulos pagos`}
            />
            <KpiCard
              label="Atraso médio"
              value={payStats.avgDelayDays > 0
                ? `${Math.round(payStats.avgDelayDays)} dias`
                : payStats.avgDelayDays < 0
                  ? `${Math.abs(Math.round(payStats.avgDelayDays))} dias antecipado`
                  : "No prazo"}
              accent={payStats.avgDelayDays > 15 ? "negative" : payStats.avgDelayDays <= 0 ? "positive" : "default"}
              caption="média entre vencimento e recebimento"
            />
            <KpiCard
              label="Pago no prazo"
              value={formatPercent(payStats.pctOnTime, { decimals: 1 })}
              accent={payStats.pctOnTime >= 0.7 ? "positive" : "negative"}
              caption={`${formatNumber(Math.round(payStats.pctOnTime * payStats.paidCount))} de ${formatNumber(payStats.paidCount)}`}
            />
          </section>

          {/* Monthly collection chart */}
          {monthlyCol.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Recebido vs. Pendente · por mês de vencimento</CardTitle>
                <p className="mt-1 text-xs text-muted-foreground">
                  Valor total por mês de vencimento — barra verde = recebido, cinza = ainda pendente.
                </p>
              </CardHeader>
              <CardContent>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={monthlyCol} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barCategoryGap="28%" barGap={2}>
                      <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="2 4" vertical={false} />
                      <XAxis dataKey="label" tickLine={false} axisLine={false}
                        tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }} tickMargin={8} />
                      <YAxis tickLine={false} axisLine={false} width={56}
                        tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }}
                        tickFormatter={(v) => formatCurrency(Number(v), currency, { compact: true })} />
                      <Tooltip cursor={{ fill: "hsl(var(--muted) / 0.4)" }} content={<ChartTooltip />} />
                      <Bar dataKey="received" name="Recebido" stackId="col" fill="hsl(var(--positive))" />
                      <Bar dataKey="pending" name="Pendente" stackId="col" fill="hsl(var(--muted-foreground) / 0.3)" radius={[3, 3, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>

                {/* Monthly detail mini-table */}
                <div className="mt-4 overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-border text-[10px] uppercase tracking-wider text-muted-foreground">
                        <th className="py-1.5 px-3 text-left">Mês (venc.)</th>
                        <th className="py-1.5 px-3 text-right">A receber</th>
                        <th className="py-1.5 px-3 text-right">Recebido</th>
                        <th className="py-1.5 px-3 text-right">% recebido</th>
                        <th className="py-1.5 px-3 text-right">Atraso médio</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {monthlyCol.map((m) => (
                        <tr key={m.key} className="hover:bg-muted/20 transition-colors">
                          <td className="py-1.5 px-3 font-medium">{m.label}</td>
                          <td className="py-1.5 px-3 text-right tabular text-muted-foreground">
                            {formatCurrency(m.totalDue, currency, { compact: true })}
                          </td>
                          <td className="py-1.5 px-3 text-right tabular text-positive">
                            {formatCurrency(m.received, currency, { compact: true })}
                          </td>
                          <td className="py-1.5 px-3 text-right tabular">
                            <CollectionRateBadge rate={m.collectionRate} />
                          </td>
                          <td className="py-1.5 px-3 text-right tabular text-muted-foreground">
                            {m.avgDelayDays !== null
                              ? <DelayBadge days={m.avgDelayDays} />
                              : "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Per-client payment behaviour */}
          {clientPayment.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Comportamento de recebimento · por cliente</CardTitle>
                <p className="mt-1 text-xs text-muted-foreground">
                  Atraso médio em dias entre vencimento e data de recebimento. Negativo = pago antecipado.
                </p>
              </CardHeader>
              <CardContent className="px-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-y border-border text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                        <th className="text-left font-medium py-2 px-5 w-8">#</th>
                        <th className="text-left font-medium py-2 px-5">Cliente</th>
                        <th className="text-right font-medium py-2 px-5">Recebido</th>
                        <th className="text-right font-medium py-2 px-5">Pendente</th>
                        <th className="text-right font-medium py-2 px-5">Taxa</th>
                        <th className="text-right font-medium py-2 px-5">Atraso médio</th>
                        <th className="text-right font-medium py-2 px-5">Títulos</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {clientPayment.slice(0, 15).map((c, i) => (
                        <tr key={c.clientId} className="hover:bg-muted/30 transition-colors">
                          <td className="py-2.5 px-5 font-mono text-[10px] text-muted-foreground">
                            {String(i + 1).padStart(2, "0")}
                          </td>
                          <td className="py-2.5 px-5 truncate max-w-[220px] font-medium">{c.clientName || c.clientId}</td>
                          <td className="py-2.5 px-5 text-right tabular text-positive font-medium">
                            {formatCurrency(c.received, currency, { compact: true })}
                          </td>
                          <td className={cn("py-2.5 px-5 text-right tabular", c.pending > 0 && "text-negative")}>
                            {c.pending > 0 ? formatCurrency(c.pending, currency, { compact: true }) : "—"}
                          </td>
                          <td className="py-2.5 px-5 text-right">
                            <CollectionRateBadge rate={c.collectionRate} />
                          </td>
                          <td className="py-2.5 px-5 text-right">
                            {c.avgDelayDays !== null ? <DelayBadge days={c.avgDelayDays} /> : <span className="text-muted-foreground">—</span>}
                          </td>
                          <td className="py-2.5 px-5 text-right tabular text-muted-foreground text-xs">
                            {c.paidCount > 0 && <span className="text-positive">{c.paidCount}✓</span>}
                            {c.paidCount > 0 && c.pendingCount > 0 && " "}
                            {c.pendingCount > 0 && <span className="text-muted-foreground">{c.pendingCount}⏳</span>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function Indicator({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">{label}</div>
      <div className="mt-1 display-figure text-2xl tabular leading-none">{value}</div>
    </div>
  );
}

function CollectionRateBadge({ rate }: { rate: number }) {
  const pct = (rate * 100).toFixed(1) + "%";
  return (
    <span className={cn(
      "inline-block rounded-full px-2 py-0.5 text-[10px] font-medium",
      rate >= 0.9 ? "bg-positive/15 text-positive"
        : rate >= 0.5 ? "bg-amber-500/15 text-amber-600"
        : "bg-negative/15 text-negative"
    )}>
      {pct}
    </span>
  );
}

function DelayBadge({ days }: { days: number }) {
  const rounded = Math.round(days);
  if (rounded < 0) {
    return <span className="text-positive text-xs font-medium">{Math.abs(rounded)}d antecip.</span>;
  }
  if (rounded === 0) {
    return <span className="text-positive text-xs">No prazo</span>;
  }
  return (
    <span className={cn("text-xs font-medium", rounded > 30 ? "text-negative" : rounded > 7 ? "text-amber-600" : "text-muted-foreground")}>
      +{rounded}d
    </span>
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
              <td className={cn("py-2.5 px-5 text-right tabular", g.overdue > 0 && "text-negative font-medium")}>
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
