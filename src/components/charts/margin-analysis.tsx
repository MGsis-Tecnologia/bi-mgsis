"use client";

import * as React from "react";
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import type { MarginMetrics, ProductMargin, SellerMargin } from "@/lib/analytics/margins";
import { formatCurrency, formatPercent } from "@/lib/utils/format";
import { useTranslation } from "@/lib/hooks/use-translation";

interface MarginAnalysisProps {
  metrics: MarginMetrics;
  productMargins: ProductMargin[];
  sellerMargins: SellerMargin[];
  currency: string;
}

export function MarginAnalysis({
  metrics,
  productMargins,
  sellerMargins,
  currency,
}: MarginAnalysisProps) {
  const { t } = useTranslation();
  const topProducts = React.useMemo(() => productMargins.slice(0, 10), [productMargins]);
  const topSellers = React.useMemo(() => sellerMargins.slice(0, 8), [sellerMargins]);

  const marginTrend = React.useMemo(
    () =>
      productMargins
        .sort((a, b) => a.marginPct - b.marginPct)
        .slice(0, 10)
        .map((p) => ({
          name: p.productName.substring(0, 15),
          margin: Math.round(p.marginPct * 10) / 10,
        })),
    [productMargins]
  );

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-muted/30 rounded-lg p-4 space-y-1">
          <p className="text-xs text-muted-foreground">{t("vendas.margens.margin")}</p>
          <p className="text-2xl font-bold">{formatPercent(metrics.profitMargin, { decimals: 1 })}</p>
          <p className="text-xs text-muted-foreground">{metrics.profitMarginBps} bps</p>
        </div>
        <div className="bg-muted/30 rounded-lg p-4 space-y-1">
          <p className="text-xs text-muted-foreground">{t("vendas.margens.profit")}</p>
          <p className="text-2xl font-bold">{formatCurrency(metrics.totalProfit, currency, { compact: true })}</p>
          <p className="text-xs text-muted-foreground">
            vs Receita: {formatPercent((metrics.totalProfit / metrics.totalRevenue) * 100, { decimals: 1 })}
          </p>
        </div>
        <div className="bg-muted/30 rounded-lg p-4 space-y-1">
          <p className="text-xs text-muted-foreground">{t("vendas.margens.avg")}</p>
          <p className="text-2xl font-bold">{formatPercent(metrics.averageOrderMargin, { decimals: 1 })}</p>
        </div>
        <div className="bg-muted/30 rounded-lg p-4 space-y-1">
          <p className="text-xs text-muted-foreground">{t("vendas.margens.range")}</p>
          <p className="text-sm font-semibold">
            {formatPercent(metrics.lowestMargin, { decimals: 1 })} a{" "}
            {formatPercent(metrics.highestMargin, { decimals: 1 })}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-white dark:bg-slate-950 rounded-lg p-4 border border-border">
          <h3 className="text-sm font-semibold mb-4">{t("vendas.margens.cost")}</h3>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart
              data={[
                {
                  name: "Financeiro",
                  Receita: metrics.totalRevenue,
                  Custo: metrics.totalCost,
                  Lucro: metrics.totalProfit,
                },
              ]}
              margin={{ top: 20, right: 30, left: 0, bottom: 0 }}
            >
              <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="2 4" vertical={false} />
              <XAxis dataKey="name" tickLine={false} axisLine={false} tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }} />
              <YAxis tickLine={false} axisLine={false} tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }} />
              <Tooltip
                contentStyle={{
                  backgroundColor: "hsl(var(--background))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: "6px",
                }}
                formatter={(value) => formatCurrency(Number(value), currency, { compact: true })}
              />
              <Legend />
              <Bar dataKey="Receita" fill="hsl(var(--primary))" />
              <Bar dataKey="Custo" fill="hsl(var(--destructive))" />
              <Bar dataKey="Lucro" fill="hsl(var(--accent))" />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-white dark:bg-slate-950 rounded-lg p-4 border border-border">
          <h3 className="text-sm font-semibold mb-4">{t("vendas.margens.sellers")}</h3>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={topSellers} margin={{ top: 20, right: 30, left: 0, bottom: 0 }}>
              <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="2 4" vertical={false} />
              <XAxis
                dataKey="sellerName"
                tickLine={false}
                axisLine={false}
                tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 9 }}
                angle={-45}
                textAnchor="end"
                height={60}
              />
              <YAxis tickLine={false} axisLine={false} tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }} />
              <Tooltip
                contentStyle={{
                  backgroundColor: "hsl(var(--background))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: "6px",
                }}
                formatter={(value) => formatCurrency(Number(value), currency, { compact: true })}
              />
              <Bar dataKey="profit" fill="hsl(var(--accent))" name="Lucro" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="bg-white dark:bg-slate-950 rounded-lg p-4 border border-border">
        <h3 className="text-sm font-semibold mb-4">Distribuição de Margens por Produto</h3>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={marginTrend}>
            <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="2 4" vertical={false} />
            <XAxis
              dataKey="name"
              tickLine={false}
              axisLine={false}
              tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 9 }}
              angle={-45}
              textAnchor="end"
              height={60}
            />
            <YAxis
              tickLine={false}
              axisLine={false}
              tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }}
              label={{ value: "Margem %", angle: -90, position: "insideLeft" }}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: "hsl(var(--background))",
                border: "1px solid hsl(var(--border))",
                borderRadius: "6px",
              }}
              formatter={(value) => `${Number(value).toFixed(1)}%`}
            />
            <Bar dataKey="margin" fill="hsl(var(--chart-2))" />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-white dark:bg-slate-950 rounded-lg p-4 border border-border">
          <h3 className="text-sm font-semibold mb-4">{t("vendas.margens.products")}</h3>
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {topProducts.map((product, idx) => (
              <div key={product.productId} className="flex items-center justify-between text-sm pb-2 border-b border-border last:border-b-0">
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">{product.productName}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatCurrency(product.revenue, currency, { compact: true })} revenue
                  </p>
                </div>
                <div className="text-right ml-2">
                  <p className="font-semibold">{formatPercent(product.marginPct, { decimals: 1 })}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatCurrency(product.profit, currency, { compact: true })}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white dark:bg-slate-950 rounded-lg p-4 border border-border">
          <h3 className="text-sm font-semibold mb-4">Top Vendedores por Margem</h3>
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {topSellers.map((seller) => (
              <div key={seller.sellerId} className="flex items-center justify-between text-sm pb-2 border-b border-border last:border-b-0">
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">{seller.sellerName}</p>
                  <p className="text-xs text-muted-foreground">
                    {seller.orderCount} orders
                  </p>
                </div>
                <div className="text-right ml-2">
                  <p className="font-semibold">{formatPercent(seller.marginPct, { decimals: 1 })}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatCurrency(seller.profit, currency, { compact: true })}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
