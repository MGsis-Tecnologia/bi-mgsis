"use client";

import * as React from "react";
import { Users } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { EmptyState } from "@/components/dashboard/empty-state";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { BarChartH } from "@/components/charts/bar-chart-h";
import { DonutChart } from "@/components/charts/donut-chart";
import { Money } from "@/components/dashboard/money";
import { useClientesAnalytics } from "@/lib/hooks/use-clientes-analytics";
import { formatNumber, formatPercent } from "@/lib/utils/format";
import { cn } from "@/lib/utils";
import { useTranslation } from "@/lib/hooks/use-translation";

const SEGMENT_LABELS: Record<string, string> = {
  vip: "VIP",
  fiel: "Fiel",
  promissor: "Promissor",
  novo: "Novo",
  "em-risco": "Em risco",
  inativo: "Inativo",
};

const SEGMENT_TONE: Record<string, "positive" | "accent" | "warning" | "negative" | "default"> = {
  vip: "positive",
  fiel: "positive",
  promissor: "accent",
  novo: "accent",
  "em-risco": "warning",
  inativo: "negative",
} as const;

export default function ClientesPage() {
  const { t } = useTranslation();

  // Tudo agregado no servidor: segmentação RFM, curvas ABC e ranking por lucro
  // chegam prontos, com as contagens calculadas sobre a base inteira.
  const { data, loading, error } = useClientesAnalytics();

  const abc = data?.topClients ?? [];
  const segments = data?.segments ?? {};
  const segmentsArr = Object.entries(segments).map(([k, v]) => ({
    key: k,
    label: SEGMENT_LABELS[k] ?? k,
    value: v,
  }));

  const activeCustomers = data?.activeCustomers ?? 0;
  const avgLTV = data?.avgLTV ?? 0;
  const churnRisk = data?.churnRisk ?? 0;
  // O gráfico de LTV usa os 10 primeiros do mesmo ranking por receita.
  const topByLTV = abc.slice(0, 10);
  const profitRanking = data?.profitRanking ?? [];

  if (error) {
    return (
      <div className="space-y-8">
        <PageHeader eyebrow={t("clientes.header.eyebrow")} title={t("clientes.header.title")} description={t("clientes.header.desc")} />
        <div className="rounded-lg border border-negative/30 bg-negative/10 px-4 py-3 text-sm text-negative">
          Não foi possível carregar os clientes: {error}
        </div>
      </div>
    );
  }

  if (!data?.hasData) {
    return (
      <div className="space-y-8">
        <PageHeader eyebrow={t("clientes.header.eyebrow")} title={t("clientes.header.title")} description={t("clientes.header.desc")} />
        {loading ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {Array.from({ length: 4 }).map((_, i) => (
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
        eyebrow={t("clientes.header.eyebrow")}
        title={t("clientes.header.title")}
        description={t("clientes.header.desc")}
      >
        <Badge variant="ghost" className="gap-1">
          <Users className="h-3 w-3" />
          {t("clientes.header.badge", { count: formatNumber(data.totalClients) })}
        </Badge>
      </PageHeader>

      <section className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard label={t("clientes.kpi.active")} value={formatNumber(activeCustomers)} caption={t("clientes.kpi.active.caption")} accent="accent" />
        <KpiCard label={t("clientes.kpi.ltv")} value={<><Money value={avgLTV} compact /></> as never} />
        <KpiCard label={t("clientes.kpi.vip")} caption={t("clientes.kpi.vip.caption")} value={formatNumber(segments.vip ?? 0)} accent="positive" />
        <KpiCard label={t("clientes.kpi.risk")} caption={t("clientes.kpi.risk.caption")} value={formatNumber(churnRisk)} accent="negative" />
      </section>

      <section className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>{t("clientes.chart.ltv.title")}</CardTitle>
          </CardHeader>
          <CardContent>
            <BarChartH
              rows={topByLTV.map((m) => ({
                key: m.id,
                label: m.name,
                value: m.ltv,
                secondary: `${m.orders} pedidos · ${SEGMENT_LABELS[m.segment] ?? m.segment}`,
              }))}
              maxRows={10}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t("clientes.chart.rfm.title")}</CardTitle>
          </CardHeader>
          <CardContent>
            <DonutChart
              data={segmentsArr}
              centerLabel={t("clientes.chart.rfm.center")}
              centerValue={String(segmentsArr.length)}
              isCurrency={false}
              height={200}
            />
          </CardContent>
        </Card>
      </section>

      <Card>
        <CardHeader>
          <CardTitle>{t("clientes.table.title")}</CardTitle>
        </CardHeader>
        <CardContent className="px-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-y border-border text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                  <th className="text-left font-medium py-2 px-5">{t("clientes.table.col.customer")}</th>
                  <th className="text-right font-medium py-2 px-5">{t("clientes.table.col.orders")}</th>
                  <th className="text-right font-medium py-2 px-5">{t("clientes.table.col.ltv")}</th>
                  <th className="text-right font-medium py-2 px-5">{t("clientes.table.col.ticket")}</th>
                  <th className="text-right font-medium py-2 px-5">{t("clientes.table.col.recency")}</th>
                  <th className="text-left font-medium py-2 px-5">{t("clientes.table.col.segment")}</th>
                  <th className="text-left font-medium py-2 px-5">{t("clientes.table.col.curve")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {abc.map((e) => (
                  <tr key={e.id} className="hover:bg-muted/30 transition-colors">
                    <td className="py-2.5 px-5">
                      <div className="font-medium truncate max-w-[220px]">{e.name}</div>
                      <div className="text-xs text-muted-foreground font-mono">{e.id}</div>
                    </td>
                    <td className="py-2.5 px-5 text-right tabular">{e.orders}</td>
                    <td className="py-2.5 px-5 text-right tabular font-medium">
                      <Money value={e.ltv} />
                    </td>
                    <td className="py-2.5 px-5 text-right tabular text-muted-foreground">
                      <Money value={e.averageTicket} />
                    </td>
                    <td className="py-2.5 px-5 text-right tabular text-muted-foreground">
                      {e.lastPurchaseDate === null ? "—" : `${e.recencyDays}d`}
                    </td>
                    <td className="py-2.5 px-5">
                      <Badge variant={SEGMENT_TONE[e.segment]} className="capitalize">
                        {SEGMENT_LABELS[e.segment] ?? e.segment}
                      </Badge>
                    </td>
                    <td className="py-2.5 px-5">
                      <span
                        className={cn(
                          "inline-flex h-5 w-5 items-center justify-center rounded font-mono text-[11px] font-medium",
                          e.curve === "A" && "bg-positive/15 text-positive border border-positive/30",
                          e.curve === "B" && "bg-warning/15 text-warning border border-warning/30",
                          e.curve === "C" && "bg-muted text-muted-foreground border border-border"
                        )}
                      >
                        {e.curve}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Clientes mais lucrativos</CardTitle>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                Ordenado por lucro total (receita − custo) no período.
              </p>
            </div>
            <Badge variant="ghost">{data.profitTotals.count} clientes</Badge>
          </div>
        </CardHeader>
        <CardContent className="px-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-y border-border text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                  <th className="text-left font-medium py-2 px-5">#</th>
                  <th className="text-left font-medium py-2 px-5">Cliente</th>
                  <th className="text-right font-medium py-2 px-5">Pedidos</th>
                  <th className="text-right font-medium py-2 px-5">Receita</th>
                  <th className="text-right font-medium py-2 px-5">Custo</th>
                  <th className="text-right font-medium py-2 px-5">Lucro</th>
                  <th className="text-right font-medium py-2 px-5">Margem</th>
                  <th className="text-right font-medium py-2 px-5">Ticket médio</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {profitRanking.map((e, i) => (
                  <tr key={e.clientId} className="hover:bg-muted/30 transition-colors">
                    <td className="py-2.5 px-5 font-mono text-xs text-muted-foreground tabular">
                      {(i + 1).toString().padStart(2, "0")}
                    </td>
                    <td className="py-2.5 px-5">
                      <div className="font-medium truncate max-w-[220px]">{e.clientName}</div>
                      <div className="text-xs text-muted-foreground font-mono">{e.clientId}</div>
                    </td>
                    <td className="py-2.5 px-5 text-right tabular text-muted-foreground">{e.orders}</td>
                    <td className="py-2.5 px-5 text-right tabular"><Money value={e.revenue} /></td>
                    <td className="py-2.5 px-5 text-right tabular text-muted-foreground"><Money value={e.cost} /></td>
                    <td className={cn("py-2.5 px-5 text-right tabular font-medium", e.profit >= 0 ? "text-positive" : "text-negative")}>
                      <Money value={e.profit} />
                    </td>
                    <td className="py-2.5 px-5 text-right tabular">
                      <span className={cn(
                        "inline-block rounded-full px-2 py-0.5 text-[10px] font-medium",
                        e.marginPct >= 0.3 ? "bg-positive/15 text-positive"
                          : e.marginPct >= 0.1 ? "bg-amber-500/15 text-amber-600"
                          : "bg-negative/15 text-negative"
                      )}>
                        {formatPercent(e.marginPct, { decimals: 1 })}
                      </span>
                    </td>
                    <td className="py-2.5 px-5 text-right tabular text-muted-foreground">
                      <Money value={e.avgTicket} />
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-border text-[11px] font-medium">
                  <td className="py-2.5 px-5" />
                  {/* Totais sobre TODOS os clientes do período, não só os 25 exibidos. */}
                  <td className="py-2.5 px-5 uppercase tracking-[0.1em] text-muted-foreground">
                    Total · {data.profitTotals.count} clientes
                  </td>
                  <td className="py-2.5 px-5 text-right tabular text-muted-foreground">
                    {formatNumber(data.profitTotals.orders)}
                  </td>
                  <td className="py-2.5 px-5 text-right tabular">
                    <Money value={data.profitTotals.revenue} />
                  </td>
                  <td className="py-2.5 px-5 text-right tabular text-muted-foreground">
                    <Money value={data.profitTotals.cost} />
                  </td>
                  <td className="py-2.5 px-5 text-right tabular text-positive font-medium">
                    <Money value={data.profitTotals.profit} />
                  </td>
                  <td className="py-2.5 px-5 text-right tabular">
                    {(() => {
                      const rev = data.profitTotals.revenue;
                      const pft = data.profitTotals.profit;
                      const pct = rev > 0 ? pft / rev : 0;
                      return (
                        <span className={cn(
                          "inline-block rounded-full px-2 py-0.5 text-[10px] font-medium",
                          pct >= 0.3 ? "bg-positive/15 text-positive"
                            : pct >= 0.1 ? "bg-amber-500/15 text-amber-600"
                            : "bg-negative/15 text-negative"
                        )}>
                          {formatPercent(pct, { decimals: 1 })}
                        </span>
                      );
                    })()}
                  </td>
                  <td className="py-2.5 px-5" />
                </tr>
              </tfoot>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
