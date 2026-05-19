"use client";

import * as React from "react";
import { Package, TrendingUp } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { BarChartH } from "@/components/charts/bar-chart-h";
import { DonutChart } from "@/components/charts/donut-chart";
import { Money } from "@/components/dashboard/money";
import { useDataset, useFilteredOrders } from "@/lib/hooks/use-dataset";
import { productABC } from "@/lib/analytics/abc";
import { revenueByCategory } from "@/lib/analytics/kpis";
import { formatNumber, formatPercent } from "@/lib/utils/format";
import { cn } from "@/lib/utils";

const CATEGORY_LABELS: Record<string, string> = {
  eletronicos: "Eletrônicos",
  moda: "Moda",
  "casa-decoracao": "Casa & Decoração",
  "esporte-lazer": "Esporte & Lazer",
  "beleza-saude": "Beleza & Saúde",
  "alimentos-bebidas": "Alimentos & Bebidas",
  "livros-midia": "Livros & Mídia",
};

export default function ProdutosPage() {
  const ds = useDataset();
  const orders = useFilteredOrders();

  const abc = React.useMemo(() => productABC(orders, ds.products), [orders, ds.products]);
  const categoryById = React.useMemo(() => new Map(ds.products.map((p) => [p.id, p.category])), [ds.products]);
  const rbc = React.useMemo(() => revenueByCategory(orders, categoryById), [orders, categoryById]);
  const donut = Object.entries(rbc)
    .map(([k, v]) => ({ key: k, label: CATEGORY_LABELS[k] ?? k, value: v }))
    .sort((a, b) => b.value - a.value);

  const aCount = abc.filter((e) => e.curve === "A").length;
  const bCount = abc.filter((e) => e.curve === "B").length;
  const cCount = abc.filter((e) => e.curve === "C").length;
  const totalUnits = abc.reduce((s, e) => s + e.units, 0);
  const totalRevenue = abc.reduce((s, e) => s + e.revenue, 0);

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Catálogo · produtos"
        title="O que vende."
        description="Curva ABC, mix por categoria, top performers e itens em risco."
      >
        <Badge variant="ghost" className="gap-1">
          <Package className="h-3 w-3" />
          {ds.products.length} SKUs ativos
        </Badge>
      </PageHeader>

      <section className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard
          label="Unidades vendidas"
          value={formatNumber(totalUnits)}
        />
        <KpiCard
          label="Receita"
          value={<><Money brl={totalRevenue} compact /></> as never}
          accent="accent"
        />
        <KpiCard label="Curva A · top 20%" caption={`${aCount} SKUs`} value={formatPercent(aCount / Math.max(1, abc.length))} />
        <KpiCard label="SKUs sem giro" caption="Sem venda no período" value={formatNumber(ds.products.length - abc.length)} />
      </section>

      <section className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Ranking de produtos</CardTitle>
              <Badge variant="ghost" className="gap-1">
                <TrendingUp className="h-3 w-3" /> top 12
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
                tone: e.curve === "A" ? "accent" : e.curve === "B" ? "muted" : "muted",
              }))}
              maxRows={12}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Mix por categoria</CardTitle>
          </CardHeader>
          <CardContent>
            <DonutChart data={donut} centerLabel="Categorias" centerValue={String(donut.length)} isCurrency height={200} />
          </CardContent>
        </Card>
      </section>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Curva ABC</CardTitle>
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
                  <th className="text-left font-medium py-2 px-5">Produto</th>
                  <th className="text-left font-medium py-2 px-5">Categoria</th>
                  <th className="text-right font-medium py-2 px-5">Unidades</th>
                  <th className="text-right font-medium py-2 px-5">Receita</th>
                  <th className="text-right font-medium py-2 px-5">Share</th>
                  <th className="text-right font-medium py-2 px-5">Acum.</th>
                  <th className="text-left font-medium py-2 px-5">Curva</th>
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
                      <div className="text-xs text-muted-foreground font-mono">{e.item.sku}</div>
                    </td>
                    <td className="py-2 px-5 text-muted-foreground">{CATEGORY_LABELS[e.item.category]}</td>
                    <td className="py-2 px-5 text-right tabular">{formatNumber(e.units)}</td>
                    <td className="py-2 px-5 text-right tabular font-medium">
                      <Money brl={e.revenue} />
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
