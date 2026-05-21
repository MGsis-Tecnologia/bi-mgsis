"use client";

import * as React from "react";
import { Package, TrendingUp, ArrowRight, Layers } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { EmptyState } from "@/components/dashboard/empty-state";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { BarChartH } from "@/components/charts/bar-chart-h";
import { DonutChart } from "@/components/charts/donut-chart";
import { Money } from "@/components/dashboard/money";
import { useDataset, useFilteredOrders } from "@/lib/hooks/use-dataset";
import { productABC, subgroupABC } from "@/lib/analytics/abc";
import { revenueBySubgroup } from "@/lib/analytics/kpis";
import { formatNumber, formatPercent } from "@/lib/utils/format";
import { cn } from "@/lib/utils";
import { useTranslation } from "@/lib/hooks/use-translation";

export default function ProdutosPage() {
  const { t } = useTranslation();
  const ds = useDataset();
  const orders = useFilteredOrders();

  const abc = React.useMemo(() => productABC(orders, ds.products), [orders, ds.products]);
  const catABC = React.useMemo(() => subgroupABC(orders), [orders]);
  const rbs = React.useMemo(() => revenueBySubgroup(orders), [orders]);
  const donut = Object.values(rbs).sort((a, b) => b.value - a.value).map((v) => ({ key: v.id, label: v.label, value: v.value }));

  const aCount = abc.filter((e) => e.curve === "A").length;
  const bCount = abc.filter((e) => e.curve === "B").length;
  const cCount = abc.filter((e) => e.curve === "C").length;
  const totalUnits = abc.reduce((s, e) => s + e.units, 0);
  const totalRevenue = abc.reduce((s, e) => s + e.revenue, 0);

  if (!ds.hasData) {
    return (
      <div className="space-y-8">
        <PageHeader eyebrow={t("produtos.header.eyebrow")} title={t("produtos.header.title")} description={t("produtos.header.desc")} />
        <EmptyState />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow={t("produtos.header.eyebrow")}
        title={t("produtos.header.title")}
        description={t("produtos.header.desc")}
      >
        <Badge variant="ghost" className="gap-1">
          <Package className="h-3 w-3" />
          {t("produtos.header.badge", { count: ds.products.length })}
        </Badge>
      </PageHeader>

      <section className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard label={t("produtos.kpi.units")} value={formatNumber(totalUnits)} />
        <KpiCard label={t("produtos.kpi.revenue")} value={<><Money value={totalRevenue} compact /></> as never} accent="accent" />
        <KpiCard label={t("produtos.kpi.curveA")} caption={t("produtos.kpi.curveA.caption", { count: aCount })} value={formatPercent(aCount / Math.max(1, abc.length))} />
        <KpiCard label={t("produtos.kpi.stuck")} caption={t("produtos.kpi.stuck.caption")} value={formatNumber(ds.products.length - abc.length)} />
      </section>

      <section className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>{t("produtos.chart.ranking.title")}</CardTitle>
              <Badge variant="ghost" className="gap-1">
                <TrendingUp className="h-3 w-3" /> {t("produtos.chart.ranking.badge")}
              </Badge>
            </div>
          </CardHeader>
          <CardContent>
            <BarChartH
              rows={abc.slice(0, 12).map((e) => ({
                key: e.item.id,
                label: e.item.name,
                value: e.revenue,
                secondary: `${formatNumber(e.units)} un · ${e.curve}`,
                tone: e.curve === "A" ? "accent" : "muted",
              }))}
              maxRows={12}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t("produtos.chart.mix.title")}</CardTitle>
          </CardHeader>
          <CardContent>
            <DonutChart data={donut} centerLabel={t("produtos.chart.mix.center")} centerValue={String(donut.length)} isCurrency height={200} />
            <a
              href="#categorias-abc"
              className="mt-3 flex items-center justify-center gap-1.5 rounded-md border border-border py-2 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground"
            >
              {t("produtos.chart.mix.link")}
              <ArrowRight className="h-3 w-3" />
            </a>
          </CardContent>
        </Card>
      </section>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>{t("produtos.table.title")}</CardTitle>
            <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <CurvaLegend curve="A" count={aCount} />
              <CurvaLegend curve="B" count={bCount} />
              <CurvaLegend curve="C" count={cCount} />
            </div>
          </div>
        </CardHeader>
        <CardContent className="px-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-y border-border text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                  <th className="text-left font-medium py-2 px-5">#</th>
                  <th className="text-left font-medium py-2 px-5">{t("produtos.table.col.product")}</th>
                  <th className="text-left font-medium py-2 px-5">{t("produtos.table.col.category")}</th>
                  <th className="text-right font-medium py-2 px-5">{t("produtos.table.col.units")}</th>
                  <th className="text-right font-medium py-2 px-5">{t("produtos.table.col.revenue")}</th>
                  <th className="text-right font-medium py-2 px-5">{t("produtos.table.col.share")}</th>
                  <th className="text-right font-medium py-2 px-5">{t("produtos.table.col.acc")}</th>
                  <th className="text-left font-medium py-2 px-5">{t("produtos.table.col.curve")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {abc.slice(0, 24).map((e, i) => (
                  <tr key={e.item.id} className="hover:bg-muted/30 transition-colors">
                    <td className="py-2 px-5 font-mono text-xs text-muted-foreground tabular">
                      {(i + 1).toString().padStart(2, "0")}
                    </td>
                    <td className="py-2 px-5 max-w-[260px] truncate">
                      <div className="font-medium">{e.item.name}</div>
                      <div className="text-xs text-muted-foreground font-mono">{e.item.id}</div>
                    </td>
                    <td className="py-2 px-5 text-muted-foreground">{e.item.subgroupName}</td>
                    <td className="py-2 px-5 text-right tabular">{formatNumber(e.units)}</td>
                    <td className="py-2 px-5 text-right tabular font-medium">
                      <Money value={e.revenue} />
                    </td>
                    <td className="py-2 px-5 text-right tabular text-muted-foreground">
                      {formatPercent(e.share, { decimals: 2 })}
                    </td>
                    <td className="py-2 px-5 text-right tabular text-muted-foreground">
                      {formatPercent(e.cumulativeShare, { decimals: 1 })}
                    </td>
                    <td className="py-2 px-5">
                      <CurvaBadge curve={e.curve} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Card id="categorias-abc" className="scroll-mt-24">
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Layers className="h-4 w-4 text-muted-foreground" />
              <div>
                <CardTitle>{t("produtos.cat.title")}</CardTitle>
                <p className="mt-0.5 text-[11px] text-muted-foreground">{t("produtos.cat.desc")}</p>
              </div>
            </div>
            <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <CurvaLegend curve="A" count={catABC.filter((c) => c.curve === "A").length} />
              <CurvaLegend curve="B" count={catABC.filter((c) => c.curve === "B").length} />
              <CurvaLegend curve="C" count={catABC.filter((c) => c.curve === "C").length} />
            </div>
          </div>
        </CardHeader>
        <CardContent className="px-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-y border-border text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                  <th className="text-left font-medium py-2 px-5">#</th>
                  <th className="text-left font-medium py-2 px-5">{t("produtos.table.col.category")}</th>
                  <th className="text-right font-medium py-2 px-5">{t("produtos.cat.col.skus")}</th>
                  <th className="text-right font-medium py-2 px-5">{t("produtos.table.col.units")}</th>
                  <th className="text-right font-medium py-2 px-5">{t("produtos.table.col.revenue")}</th>
                  <th className="text-right font-medium py-2 px-5">{t("produtos.table.col.share")}</th>
                  <th className="text-right font-medium py-2 px-5">{t("produtos.table.col.acc")}</th>
                  <th className="text-left font-medium py-2 px-5">{t("produtos.table.col.curve")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {catABC.map((c, i) => (
                  <tr key={c.id} className="hover:bg-muted/30 transition-colors">
                    <td className="py-2 px-5 font-mono text-xs text-muted-foreground tabular">
                      {(i + 1).toString().padStart(2, "0")}
                    </td>
                    <td className="py-2 px-5 max-w-[280px] truncate font-medium">{c.name || "—"}</td>
                    <td className="py-2 px-5 text-right tabular text-muted-foreground">{formatNumber(c.productCount)}</td>
                    <td className="py-2 px-5 text-right tabular">{formatNumber(c.units)}</td>
                    <td className="py-2 px-5 text-right tabular font-medium">
                      <Money value={c.revenue} />
                    </td>
                    <td className="py-2 px-5 text-right tabular text-muted-foreground">
                      {formatPercent(c.share, { decimals: 2 })}
                    </td>
                    <td className="py-2 px-5 text-right tabular text-muted-foreground">
                      {formatPercent(c.cumulativeShare, { decimals: 1 })}
                    </td>
                    <td className="py-2 px-5">
                      <CurvaBadge curve={c.curve} />
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-border text-[11px] font-medium">
                  <td className="py-2.5 px-5" />
                  <td className="py-2.5 px-5 uppercase tracking-[0.1em] text-muted-foreground">
                    {t("produtos.cat.total", { count: catABC.length })}
                  </td>
                  <td className="py-2.5 px-5 text-right tabular text-muted-foreground">
                    {formatNumber(catABC.reduce((s, c) => s + c.productCount, 0))}
                  </td>
                  <td className="py-2.5 px-5 text-right tabular">
                    {formatNumber(catABC.reduce((s, c) => s + c.units, 0))}
                  </td>
                  <td className="py-2.5 px-5 text-right tabular">
                    <Money value={catABC.reduce((s, c) => s + c.revenue, 0)} />
                  </td>
                  <td className="py-2.5 px-5" colSpan={3} />
                </tr>
              </tfoot>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function CurvaBadge({ curve }: { curve: "A" | "B" | "C" }) {
  return (
    <span
      className={cn(
        "inline-flex h-5 w-5 items-center justify-center rounded font-mono text-[11px] font-medium",
        curve === "A" && "bg-positive/15 text-positive border border-positive/30",
        curve === "B" && "bg-warning/15 text-warning border border-warning/30",
        curve === "C" && "bg-muted text-muted-foreground border border-border"
      )}
    >
      {curve}
    </span>
  );
}

function CurvaLegend({ curve, count }: { curve: "A" | "B" | "C"; count: number }) {
  return (
    <span className="inline-flex items-center gap-1">
      <CurvaBadge curve={curve} />
      <span className="tabular">{count}</span>
    </span>
  );
}
