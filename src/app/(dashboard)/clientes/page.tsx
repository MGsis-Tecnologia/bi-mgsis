"use client";

import * as React from "react";
import { Users } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { BarChartH } from "@/components/charts/bar-chart-h";
import { DonutChart } from "@/components/charts/donut-chart";
import { Money } from "@/components/dashboard/money";
import { useDataset, useFilteredOrders } from "@/lib/hooks/use-dataset";
import { customerMetrics, segmentBreakdown } from "@/lib/analytics/customers";
import { customerABC } from "@/lib/analytics/abc";
import { formatNumber } from "@/lib/utils/format";
import { cn } from "@/lib/utils";

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
  const ds = useDataset();
  const orders = useFilteredOrders();

  const metrics = React.useMemo(() => customerMetrics(orders, ds.customers), [orders, ds.customers]);
  const abc = React.useMemo(() => customerABC(orders, ds.customers), [orders, ds.customers]);
  const segments = React.useMemo(() => segmentBreakdown(ds.customers), [ds.customers]);
  const segmentsArr = Object.entries(segments).map(([k, v]) => ({
    key: k,
    label: SEGMENT_LABELS[k] ?? k,
    value: v,
  }));

  const activeCustomers = metrics.filter((m) => m.orders > 0);
  const totalRevenue = metrics.reduce((s, m) => s + m.revenue, 0);
  const avgLTV = activeCustomers.length > 0 ? totalRevenue / activeCustomers.length : 0;
  const churnRisk = metrics.filter((m) => m.customer.segment === "em-risco").length;

  const topByLTV = [...activeCustomers].sort((a, b) => b.ltv - a.ltv).slice(0, 10);

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Catálogo · clientes"
        title="Quem compra."
        description="Segmentação RFM, LTV, ranking e clientes em risco."
      >
        <Badge variant="ghost" className="gap-1">
          <Users className="h-3 w-3" />
          {formatNumber(ds.customers.length)} cadastrados
        </Badge>
      </PageHeader>

      <section className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard label="Clientes ativos" value={formatNumber(activeCustomers.length)} caption="Compraram no período" accent="accent" />
        <KpiCard label="LTV médio" value={<><Money brl={avgLTV} compact /></> as never} />
        <KpiCard label="VIP" caption="Top engajados" value={formatNumber(segments.vip ?? 0)} accent="positive" />
        <KpiCard label="Em risco" caption="Sem comprar há 90+ dias" value={formatNumber(churnRisk)} accent="negative" />
      </section>

      <section className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Top clientes por LTV</CardTitle>
          </CardHeader>
          <CardContent>
            <BarChartH
              rows={topByLTV.map((m) => ({
                key: m.customer.id,
                label: m.customer.name,
                value: m.ltv,
                secondary: `${m.orders} pedidos · ${SEGMENT_LABELS[m.customer.segment]}`,
              }))}
              maxRows={10}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Segmentação RFM</CardTitle>
          </CardHeader>
          <CardContent>
            <DonutChart
              data={segmentsArr}
              centerLabel="Segmentos"
              centerValue={String(segmentsArr.length)}
              isCurrency={false}
              height={200}
            />
          </CardContent>
        </Card>
      </section>

      <Card>
        <CardHeader>
          <CardTitle>Base de clientes</CardTitle>
        </CardHeader>
        <CardContent className="px-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-y border-border text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                  <th className="text-left font-medium py-2 px-5">Cliente</th>
                  <th className="text-left font-medium py-2 px-5">Cidade</th>
                  <th className="text-right font-medium py-2 px-5">Pedidos</th>
                  <th className="text-right font-medium py-2 px-5">LTV</th>
                  <th className="text-right font-medium py-2 px-5">Ticket médio</th>
                  <th className="text-right font-medium py-2 px-5">Recência</th>
                  <th className="text-left font-medium py-2 px-5">Segmento</th>
                  <th className="text-left font-medium py-2 px-5">Curva</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {abc.slice(0, 18).map((e) => {
                  const m = metrics.find((mm) => mm.customer.id === e.item.id);
                  if (!m) return null;
                  return (
                    <tr key={e.item.id} className="hover:bg-muted/30 transition-colors">
                      <td className="py-2.5 px-5">
                        <div className="font-medium truncate max-w-[220px]">{e.item.name}</div>
                        <div className="text-xs text-muted-foreground font-mono">{e.item.code}</div>
                      </td>
                      <td className="py-2.5 px-5 text-muted-foreground">{e.item.city}</td>
                      <td className="py-2.5 px-5 text-right tabular">{m.orders}</td>
                      <td className="py-2.5 px-5 text-right tabular font-medium">
                        <Money brl={m.ltv} />
                      </td>
                      <td className="py-2.5 px-5 text-right tabular text-muted-foreground">
                        <Money brl={m.averageTicket} />
                      </td>
                      <td className="py-2.5 px-5 text-right tabular text-muted-foreground">
                        {m.recencyDays === Infinity ? "—" : `${m.recencyDays}d`}
                      </td>
                      <td className="py-2.5 px-5">
                        <Badge variant={SEGMENT_TONE[m.customer.segment]} className="capitalize">
                          {SEGMENT_LABELS[m.customer.segment]}
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
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
