"use client";

import * as React from "react";
import { Trophy } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Money } from "@/components/dashboard/money";
import { useDataset, useFilteredOrders } from "@/lib/hooks/use-dataset";
import { sellerMetrics } from "@/lib/analytics/sellers";
import { formatNumber, formatPercent } from "@/lib/utils/format";
import { cn } from "@/lib/utils";

const REGION_LABELS: Record<string, string> = {
  sudeste: "Sudeste",
  sul: "Sul",
  "centro-oeste": "Centro-Oeste",
  nordeste: "Nordeste",
  norte: "Norte",
};

export default function VendedoresPage() {
  const ds = useDataset();
  const orders = useFilteredOrders();
  const metrics = React.useMemo(() => sellerMetrics(orders, ds.sellers), [orders, ds.sellers]);

  const totalCommission = metrics.reduce((s, m) => s + m.commissionDue, 0);
  const totalGoal = ds.sellers.reduce((s, m) => s + m.monthlyGoalBRL * 12, 0);
  const teamRevenue = metrics.reduce((s, m) => s + m.revenue, 0);
  const teamAchievement = totalGoal > 0 ? teamRevenue / totalGoal : 0;
  const top = metrics[0];

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Time comercial"
        title="Quem vende."
        description="Ranking, meta vs. realizado, comissão estimada e performance."
      >
        <Badge variant="ghost" className="gap-1">
          <Trophy className="h-3 w-3" />
          {ds.sellers.length} vendedores
        </Badge>
      </PageHeader>

      <section className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard
          label="Receita do time"
          value={<><Money brl={teamRevenue} compact /></> as never}
          accent="accent"
        />
        <KpiCard label="Meta atingida" value={formatPercent(teamAchievement, { decimals: 0 })} accent={teamAchievement >= 1 ? "positive" : "default"} />
        <KpiCard
          label="Comissão estimada"
          value={<><Money brl={totalCommission} compact /></> as never}
        />
        <KpiCard
          label="Top performer"
          caption={top?.seller.name}
          value={<><Money brl={top?.revenue ?? 0} compact /></> as never}
          accent="positive"
        />
      </section>

      <Card>
        <CardHeader>
          <CardTitle>Ranking de vendedores</CardTitle>
        </CardHeader>
        <CardContent className="px-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-y border-border text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                  <th className="text-left font-medium py-2 px-5">#</th>
                  <th className="text-left font-medium py-2 px-5">Vendedor</th>
                  <th className="text-left font-medium py-2 px-5">Região</th>
                  <th className="text-right font-medium py-2 px-5">Pedidos</th>
                  <th className="text-right font-medium py-2 px-5">Receita</th>
                  <th className="text-right font-medium py-2 px-5">Ticket médio</th>
                  <th className="text-right font-medium py-2 px-5">Margem</th>
                  <th className="text-left font-medium py-2 px-5 w-[200px]">Meta vs. realizado</th>
                  <th className="text-right font-medium py-2 px-5">Comissão</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {metrics.map((m, i) => (
                  <tr key={m.seller.id} className="hover:bg-muted/30 transition-colors">
                    <td className="py-3 px-5 font-mono text-xs text-muted-foreground tabular">
                      {(i + 1).toString().padStart(2, "0")}
                    </td>
                    <td className="py-3 px-5">
                      <div className="flex items-center gap-2.5">
                        <div className="grid h-7 w-7 place-items-center rounded-full bg-muted text-[10px] font-medium text-foreground">
                          {m.seller.name
                            .split(" ")
                            .map((p) => p[0])
                            .slice(0, 2)
                            .join("")}
                        </div>
                        <div>
                          <div className="font-medium">{m.seller.name}</div>
                          <div className="text-xs text-muted-foreground font-mono">{m.seller.code}</div>
                        </div>
                      </div>
                    </td>
                    <td className="py-3 px-5 text-muted-foreground">
                      {REGION_LABELS[m.seller.region] ?? m.seller.region}
                    </td>
                    <td className="py-3 px-5 text-right tabular">{formatNumber(m.orders)}</td>
                    <td className="py-3 px-5 text-right tabular font-medium">
                      <Money brl={m.revenue} compact />
                    </td>
                    <td className="py-3 px-5 text-right tabular text-muted-foreground">
                      <Money brl={m.averageTicket} />
                    </td>
                    <td className="py-3 px-5 text-right tabular text-muted-foreground">
                      {formatPercent(m.marginPct, { decimals: 1 })}
                    </td>
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
                    <td className="py-3 px-5 text-right tabular font-medium">
                      <Money brl={m.commissionDue} />
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
