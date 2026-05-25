"use client";

import * as React from "react";
import {
  Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { CheckCircle2 } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { EmptyState } from "@/components/dashboard/empty-state";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ChartDefs } from "@/components/charts/chart-defs";
import { ChartTooltip } from "@/components/charts/chart-tooltip";
import { usePayables, useFilteredPayables } from "@/lib/hooks/use-payables";
import { useFilters } from "@/lib/store/filters";
import {
  computePayablesKpis, agingBreakdown, bySupplier, dueTimeline,
  computePaymentStats, monthlyPaymentAnalysis, supplierPaymentAnalysis,
  type AgingBucketId, type GroupRow, type MonthlyPaymentRow, type SupplierPaymentRow,
} from "@/lib/analytics/payables";
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

export default function ContasPagarPage() {
  const { t } = useTranslation();
  const pay = usePayables();
  const allRows = useFilteredPayables();
  const currency = useFilters((s) => s.currency);

  const pendingRows = React.useMemo(() => allRows.filter((r) => !r.isPaid), [allRows]);
  const hasPaidData  = allRows.some((r) => r.isPaid);

  const kpi       = React.useMemo(() => computePayablesKpis(pendingRows), [pendingRows]);
  const aging     = React.useMemo(() => agingBreakdown(pendingRows), [pendingRows]);
  const suppliers = React.useMemo(() => bySupplier(pendingRows), [pendingRows]);
  const timeline  = React.useMemo(() => dueTimeline(pendingRows), [pendingRows]);

  const payStats    = React.useMemo(() => computePaymentStats(allRows), [allRows]);
  const monthlyPay  = React.useMemo(() => monthlyPaymentAnalysis(allRows), [allRows]);
  const supplierPay = React.useMemo(() => supplierPaymentAnalysis(allRows), [allRows]);

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
    current: t("pagar.aging.current"),
    d1_30:   t("pagar.aging.d1_30"),
    d31_60:  t("pagar.aging.d31_60"),
    d61_90:  t("pagar.aging.d61_90"),
    d90plus: t("pagar.aging.d90plus"),
  };
  const agingData = aging.map((a) => ({
    label: agingLabel[a.id],
    value: a.total,
    fill: AGING_COLORS[a.id],
  }));

  if (!pay.hasData) {
    return (
      <div className="space-y-8">
        <PageHeader eyebrow={t("pagar.header.eyebrow")} title={t("pagar.header.title")} description={t("pagar.header.desc")} />
        <EmptyState title={t("pagar.empty.title")} description={t("pagar.empty.desc")} />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow={t("pagar.header.eyebrow")}
        title={t("pagar.header.title")}
        description={t("pagar.header.desc")}
      >
        <Badge variant="ghost">{t("pagar.table.badge", { count: formatNumber(allRows.length) })}</Badge>
      </PageHeader>

      {pendingRows.length === 0 && !hasPaidData && (
        <div className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          {t("pagar.empty.filtered")}
        </div>
      )}

      {/* ── A PAGAR (pending) ───────────────────────────────────────────────── */}
      {pendingRows.length > 0 && (
        <>
          <section className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <KpiCard
              label={t("pagar.kpi.total")}
              value={formatCurrency(kpi.total, currency, { compact: true })}
              accent="accent"
              caption={`${formatNumber(kpi.titlesCount)} · ${formatNumber(kpi.suppliersCount)} ${t("pagar.kpi.suppliers").toLowerCase()}`}
            />
            <KpiCard
              label={t("pagar.kpi.upcoming")}
              value={formatCurrency(kpi.upcoming, currency, { compact: true })}
              accent="positive"
              caption={t("pagar.kpi.caption_count", { count: kpi.upcomingCount })}
            />
            <KpiCard
              label={t("pagar.kpi.overdue")}
              value={formatCurrency(kpi.overdue, currency, { compact: true })}
              accent="negative"
              caption={t("pagar.kpi.caption_count", { count: kpi.overdueCount })}
            />
            <KpiCard
              label={t("pagar.kpi.overdue_pct")}
              value={formatPercent(kpi.overduePct, { decimals: 1 })}
              accent={kpi.overduePct > 0.2 ? "negative" : "default"}
              caption={t("pagar.kpi.overdue_pct_caption")}
            />
          </section>

          <Card>
            <CardHeader><CardTitle>{t("pagar.indicators.title")}</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-x-6 gap-y-4">
              <Indicator label={t("pagar.kpi.titles")} value={formatNumber(kpi.titlesCount)} />
              <Indicator label={t("pagar.kpi.suppliers")} value={formatNumber(kpi.suppliersCount)} />
              <Indicator label={t("pagar.kpi.avg_ticket")} value={formatCurrency(kpi.avgTicket, currency, { compact: true })} />
              <Indicator label={t("pagar.kpi.avg_delay")} value={t("pagar.delay.days", { count: Math.round(kpi.avgDaysOverdue) })} />
              <Indicator label={t("pagar.kpi.due7")} value={formatCurrency(kpi.dueNext7, currency, { compact: true })} />
              <Indicator label={t("pagar.kpi.due30")} value={formatCurrency(kpi.dueNext30, currency, { compact: true })} />
            </CardContent>
          </Card>

          <section className="grid grid-cols-1 lg:grid-cols-3 gap-3">
            <Card>
              <CardHeader>
                <CardTitle>{t("pagar.aging.title")}</CardTitle>
                <p className="mt-1 text-xs text-muted-foreground">{t("pagar.aging.desc")}</p>
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
                      <Bar dataKey="value" name={t("pagar.kpi.total")} radius={[3, 3, 0, 0]}>
                        {agingData.map((d, i) => <Cell key={i} fill={d.fill} />)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle>{t("pagar.timeline.title")}</CardTitle>
                <p className="mt-1 text-xs text-muted-foreground">{t("pagar.timeline.desc")}</p>
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
                      <Bar dataKey="overdue" name={t("pagar.timeline.overdue")} stackId="due" fill="hsl(var(--negative))" />
                      <Bar dataKey="upcoming" name={t("pagar.timeline.upcoming")} stackId="due" fill="hsl(var(--accent))" radius={[3, 3, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          </section>

          <Card>
            <CardHeader><CardTitle>{t("pagar.bysupplier.title")}</CardTitle></CardHeader>
            <CardContent className="px-0">
              <GroupTable rows={suppliers} nameHeader={t("pagar.table.supplier")} maxRows={10} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>{t("pagar.table.title")}</CardTitle>
                <Badge variant="ghost">{t("pagar.table.badge", { count: formatNumber(pendingRows.length) })}</Badge>
              </div>
            </CardHeader>
            <CardContent className="px-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-y border-border text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                      <th className="text-left font-medium py-2 px-5">{t("pagar.table.document")}</th>
                      <th className="text-left font-medium py-2 px-5">{t("pagar.table.supplier")}</th>
                      <th className="text-left font-medium py-2 px-5">{t("pagar.table.due")}</th>
                      <th className="text-right font-medium py-2 px-5">{t("pagar.table.amount")}</th>
                      <th className="text-center font-medium py-2 px-5">{t("pagar.table.status")}</th>
                      <th className="text-right font-medium py-2 px-5">{t("pagar.table.delay")}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {detail.map((r, i) => (
                      <tr key={`${r.documentId}-${i}`} className="hover:bg-muted/30 transition-colors">
                        <td className="py-2.5 px-5 font-mono text-xs">{r.documentId}</td>
                        <td className="py-2.5 px-5 truncate max-w-[200px]">{r.supplierName || r.supplierId}</td>
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
                            {r.status === "overdue" ? t("pagar.status.overdue") : t("pagar.status.upcoming")}
                          </span>
                        </td>
                        <td className={cn("py-2.5 px-5 text-right tabular", r.daysOverdue > 0 ? "text-negative font-medium" : "text-muted-foreground")}>
                          {r.daysOverdue > 0 ? t("pagar.delay.days", { count: r.daysOverdue }) : "—"}
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

      {/* ── ANÁLISE DE PAGAMENTOS (paid items) ───────────────────────────────── */}
      {hasPaidData && (
        <>
          <div className="flex items-center gap-2 pt-2">
            <CheckCircle2 className="h-4 w-4 text-positive" />
            <h2 className="text-base font-semibold">Análise de Pagamentos</h2>
            <Badge variant="ghost">{formatNumber(payStats.paidCount)} pagamento(s)</Badge>
          </div>

          <section className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <KpiCard
              label="Total pago"
              value={formatCurrency(payStats.totalPaid, currency, { compact: true })}
              accent="positive"
              caption={`de ${formatCurrency(payStats.totalAll, currency, { compact: true })} total`}
            />
            <KpiCard
              label="Taxa de pagamento"
              value={formatPercent(payStats.paymentRate, { decimals: 1 })}
              accent={payStats.paymentRate >= 0.8 ? "positive" : payStats.paymentRate >= 0.5 ? "default" : "negative"}
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
              caption="média entre vencimento e pagamento"
            />
            <KpiCard
              label="Pago no prazo"
              value={formatPercent(payStats.pctOnTime, { decimals: 1 })}
              accent={payStats.pctOnTime >= 0.7 ? "positive" : "negative"}
              caption={`${formatNumber(Math.round(payStats.pctOnTime * payStats.paidCount))} de ${formatNumber(payStats.paidCount)}`}
            />
          </section>

          {monthlyPay.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Pago vs. Pendente · por mês de vencimento</CardTitle>
                <p className="mt-1 text-xs text-muted-foreground">
                  Valor total por mês de vencimento — barra verde = pago, cinza = ainda pendente.
                </p>
              </CardHeader>
              <CardContent>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={monthlyPay} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barCategoryGap="28%" barGap={2}>
                      <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="2 4" vertical={false} />
                      <XAxis dataKey="label" tickLine={false} axisLine={false}
                        tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }} tickMargin={8} />
                      <YAxis tickLine={false} axisLine={false} width={56}
                        tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }}
                        tickFormatter={(v) => formatCurrency(Number(v), currency, { compact: true })} />
                      <Tooltip cursor={{ fill: "hsl(var(--muted) / 0.4)" }} content={<ChartTooltip />} />
                      <Bar dataKey="paid" name="Pago" stackId="pay" fill="hsl(var(--positive))" />
                      <Bar dataKey="pending" name="Pendente" stackId="pay" fill="hsl(var(--muted-foreground) / 0.3)" radius={[3, 3, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>

                <div className="mt-4 overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-border text-[10px] uppercase tracking-wider text-muted-foreground">
                        <th className="py-1.5 px-3 text-left">Mês (venc.)</th>
                        <th className="py-1.5 px-3 text-right">A pagar</th>
                        <th className="py-1.5 px-3 text-right">Pago</th>
                        <th className="py-1.5 px-3 text-right">% pago</th>
                        <th className="py-1.5 px-3 text-right">Atraso médio</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {monthlyPay.map((m) => (
                        <tr key={m.key} className="hover:bg-muted/20 transition-colors">
                          <td className="py-1.5 px-3 font-medium">{m.label}</td>
                          <td className="py-1.5 px-3 text-right tabular text-muted-foreground">
                            {formatCurrency(m.totalDue, currency, { compact: true })}
                          </td>
                          <td className="py-1.5 px-3 text-right tabular text-positive">
                            {formatCurrency(m.paid, currency, { compact: true })}
                          </td>
                          <td className="py-1.5 px-3 text-right tabular">
                            <PaymentRateBadge rate={m.paymentRate} />
                          </td>
                          <td className="py-1.5 px-3 text-right tabular text-muted-foreground">
                            {m.avgDelayDays !== null ? <DelayBadge days={m.avgDelayDays} /> : "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}

          {supplierPay.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Comportamento de pagamento · por fornecedor</CardTitle>
                <p className="mt-1 text-xs text-muted-foreground">
                  Atraso médio em dias entre vencimento e data de pagamento. Negativo = pago antecipado.
                </p>
              </CardHeader>
              <CardContent className="px-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-y border-border text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                        <th className="text-left font-medium py-2 px-5 w-8">#</th>
                        <th className="text-left font-medium py-2 px-5">Fornecedor</th>
                        <th className="text-right font-medium py-2 px-5">Pago</th>
                        <th className="text-right font-medium py-2 px-5">Pendente</th>
                        <th className="text-right font-medium py-2 px-5">Taxa</th>
                        <th className="text-right font-medium py-2 px-5">Atraso médio</th>
                        <th className="text-right font-medium py-2 px-5">Títulos</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {supplierPay.slice(0, 15).map((s, i) => (
                        <tr key={s.supplierId} className="hover:bg-muted/30 transition-colors">
                          <td className="py-2.5 px-5 font-mono text-[10px] text-muted-foreground">
                            {String(i + 1).padStart(2, "0")}
                          </td>
                          <td className="py-2.5 px-5 truncate max-w-[220px] font-medium">{s.supplierName || s.supplierId}</td>
                          <td className="py-2.5 px-5 text-right tabular text-positive font-medium">
                            {formatCurrency(s.paid, currency, { compact: true })}
                          </td>
                          <td className={cn("py-2.5 px-5 text-right tabular", s.pending > 0 && "text-negative")}>
                            {s.pending > 0 ? formatCurrency(s.pending, currency, { compact: true }) : "—"}
                          </td>
                          <td className="py-2.5 px-5 text-right">
                            <PaymentRateBadge rate={s.paymentRate} />
                          </td>
                          <td className="py-2.5 px-5 text-right">
                            {s.avgDelayDays !== null ? <DelayBadge days={s.avgDelayDays} /> : <span className="text-muted-foreground">—</span>}
                          </td>
                          <td className="py-2.5 px-5 text-right tabular text-muted-foreground text-xs">
                            {s.paidCount > 0 && <span className="text-positive">{s.paidCount}✓</span>}
                            {s.paidCount > 0 && s.pendingCount > 0 && " "}
                            {s.pendingCount > 0 && <span className="text-muted-foreground">{s.pendingCount}⏳</span>}
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

function PaymentRateBadge({ rate }: { rate: number }) {
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
  rows, nameHeader, maxRows = 8,
}: {
  rows: GroupRow[];
  nameHeader: string;
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
            <th className="text-right font-medium py-2 px-5">{t("pagar.group.titles")}</th>
            <th className="text-right font-medium py-2 px-5">{t("pagar.group.upcoming")}</th>
            <th className="text-right font-medium py-2 px-5">{t("pagar.group.overdue")}</th>
            <th className="text-right font-medium py-2 px-5">{t("pagar.group.total")}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {display.map((g, i) => (
            <tr key={g.id} className="hover:bg-muted/30 transition-colors">
              <td className="py-2.5 px-5 font-mono text-[10px] text-muted-foreground">
                {String(i + 1).padStart(2, "0")}
              </td>
              <td className="py-2.5 px-5 truncate max-w-[240px]">{g.label || "—"}</td>
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
