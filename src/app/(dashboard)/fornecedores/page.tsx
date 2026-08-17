"use client";

import * as React from "react";
import { PageHeader } from "@/components/layout/page-header";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { EmptyState } from "@/components/dashboard/empty-state";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { BarChartH } from "@/components/charts/bar-chart-h";
import { DonutChart } from "@/components/charts/donut-chart";
import { Money } from "@/components/dashboard/money";
import { useFornecedoresAnalytics } from "@/lib/hooks/use-fornecedores-analytics";
import { formatCurrency, formatNumber, formatPercent } from "@/lib/utils/format";
import { cn } from "@/lib/utils";
import { useMoedaExibicao } from "@/lib/hooks/use-moeda-exibicao";
import { useTranslation } from "@/lib/hooks/use-translation";

const CURVE_LABELS: Record<string, string> = {
  A: "Curva A",
  B: "Curva B",
  C: "Curva C",
};

const CURVE_TONE: Record<string, "positive" | "accent" | "warning" | "negative"> = {
  A: "positive",
  B: "accent",
  C: "warning",
};

export default function FornecedoresPage() {
  const { t } = useTranslation();
  const currency = useMoedaExibicao();

  const { data, loading, error } = useFornecedoresAnalytics();

  const suppliers = data?.topSuppliers ?? [];
  const officialSuppliers = data?.officialSuppliers ?? [];
  const totalSuppliers = data?.totalSuppliers ?? 0;
  const totalRevenue = data?.totalRevenue ?? 0;
  const avgTicket = data?.avgTicket ?? 0;

  // Concentração: top 1-2 fornecedores
  const topN = suppliers.slice(0, 2);
  const concentrationPct = topN.reduce((sum, s) => sum + s.cumulativeShare, 0);

  // Curva ABC
  const curveData = [
    { key: "A", label: "Curva A", value: suppliers.filter((s) => s.curve === "A").length },
    { key: "B", label: "Curva B", value: suppliers.filter((s) => s.curve === "B").length },
    { key: "C", label: "Curva C", value: suppliers.filter((s) => s.curve === "C").length },
  ].filter((d) => d.value > 0);

  if (error) {
    return (
      <div className="space-y-8">
        <PageHeader eyebrow={t("fornecedores.header.eyebrow")} title={t("fornecedores.header.title")} description={t("fornecedores.header.desc")} />
        <div className="rounded-lg border border-negative/30 bg-negative/10 px-4 py-3 text-sm text-negative">
          Não foi possível carregar os fornecedores: {error}
        </div>
      </div>
    );
  }

  if (!data?.hasData) {
    return (
      <div className="space-y-8">
        <PageHeader eyebrow={t("fornecedores.header.eyebrow")} title={t("fornecedores.header.title")} description={t("fornecedores.header.desc")} />
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
        eyebrow={t("fornecedores.header.eyebrow")}
        title={t("fornecedores.header.title")}
        description={t("fornecedores.header.desc")}
      >
        <Badge variant="ghost">
          {t("fornecedores.header.badge", { count: formatNumber(totalSuppliers) })}
        </Badge>
      </PageHeader>

      <section className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard label={t("fornecedores.kpi.total")} value={formatCurrency(totalRevenue, currency, { compact: true })} accent="accent" />
        <KpiCard label={t("fornecedores.kpi.ticket")} value={formatCurrency(avgTicket, currency)} />
        <KpiCard label={t("fornecedores.kpi.active")} value={formatNumber(data.suppliersCount)} caption={t("fornecedores.kpi.active.caption")} />
        <KpiCard
          label={t("fornecedores.kpi.concentration")}
          caption={t("fornecedores.kpi.concentration.caption", { count: 2 })}
          value={formatPercent(concentrationPct, { decimals: 1 })}
          accent="warning"
        />
      </section>

      <section className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>{t("fornecedores.chart.ranking.title")}</CardTitle>
          </CardHeader>
          <CardContent>
            <BarChartH
              rows={suppliers.slice(0, 10).map((s) => ({
                key: s.id,
                label: s.name,
                value: s.revenue,
                secondary: `${s.orders} pedidos · ${CURVE_LABELS[s.curve] || s.curve}`,
              }))}
              maxRows={10}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t("fornecedores.chart.curve.title")}</CardTitle>
          </CardHeader>
          <CardContent>
            <DonutChart
              data={curveData}
              centerLabel={t("fornecedores.chart.curve.center")}
              centerValue={String(data.suppliersCount)}
              isCurrency={false}
              height={200}
            />
          </CardContent>
        </Card>
      </section>

      <Card>
        <CardHeader>
          <CardTitle>{t("fornecedores.table.ranking.title")}</CardTitle>
        </CardHeader>
        <CardContent className="px-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-y border-border text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                  <th className="text-left font-medium py-2 px-5">{t("fornecedores.table.col.supplier")}</th>
                  <th className="text-right font-medium py-2 px-5">{t("fornecedores.table.col.orders")}</th>
                  <th className="text-right font-medium py-2 px-5">{t("fornecedores.table.col.total")}</th>
                  <th className="text-right font-medium py-2 px-5">{t("fornecedores.table.col.ticket")}</th>
                  <th className="text-right font-medium py-2 px-5">{t("fornecedores.table.col.share")}</th>
                  <th className="text-center font-medium py-2 px-5">{t("fornecedores.table.col.curve")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {suppliers.map((s) => (
                  <tr key={s.id} className="hover:bg-muted/30 transition-colors">
                    <td className="py-2.5 px-5 truncate max-w-[200px]">{s.name}</td>
                    <td className="py-2.5 px-5 text-right tabular text-muted-foreground">{s.orders}</td>
                    <td className="py-2.5 px-5 text-right tabular font-medium"><Money value={s.revenue} /></td>
                    <td className="py-2.5 px-5 text-right tabular text-muted-foreground">{formatCurrency(s.averageTicket, currency)}</td>
                    <td className="py-2.5 px-5 text-right tabular text-muted-foreground">{formatPercent(s.share, { decimals: 1 })}</td>
                    <td className="py-2.5 px-5 text-center">
                      <Badge
                        variant="outline"
                        className={cn(
                          s.curve === "A" && "bg-positive/10 text-positive border-positive/30",
                          s.curve === "B" && "bg-accent/10 text-accent border-accent/30",
                          s.curve === "C" && "bg-warning/10 text-warning border-warning/30"
                        )}
                      >
                        {CURVE_LABELS[s.curve]}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {officialSuppliers.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>{t("fornecedores.table.official.title")}</CardTitle>
            <p className="mt-2 text-xs text-muted-foreground">{t("fornecedores.table.official.desc")}</p>
          </CardHeader>
          <CardContent className="px-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-y border-border text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                    <th className="text-left font-medium py-2 px-5">{t("fornecedores.table.col.supplier")}</th>
                    <th className="text-right font-medium py-2 px-5">{t("fornecedores.table.col.products")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {officialSuppliers.map((o) => (
                    <tr key={o.supplierId} className="hover:bg-muted/30 transition-colors">
                      <td className="py-2.5 px-5 truncate max-w-[300px]">{o.supplierName}</td>
                      <td className="py-2.5 px-5 text-right tabular text-muted-foreground">{formatNumber(o.productsCount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
