"use client";

import * as React from "react";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/dashboard/empty-state";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Money } from "@/components/dashboard/money";
import { YearComparisonChart } from "@/components/charts/year-comparison-chart";
import { useDataset } from "@/lib/hooks/use-dataset";
import { yearlyByOrder, yearlyByItem } from "@/lib/analytics/yearly";
import { formatPercent } from "@/lib/utils/format";
import { cn } from "@/lib/utils";

type DimTab = "vendedores" | "subgrupos" | "canais" | "clientes" | "produtos";

const TABS: { id: DimTab; label: string }[] = [
  { id: "vendedores", label: "Vendedores" },
  { id: "subgrupos",  label: "Subgrupos" },
  { id: "canais",     label: "Canais" },
  { id: "clientes",   label: "Clientes" },
  { id: "produtos",   label: "Produtos" },
];

function GrowthBadge({ growth }: { growth: number | null }) {
  if (growth === null) return <span className="text-muted-foreground text-xs">—</span>;
  const pct = growth * 100;
  const positive = pct >= 0;
  const Icon = pct === 0 ? Minus : positive ? TrendingUp : TrendingDown;
  return (
    <span className={cn("inline-flex items-center gap-0.5 text-xs font-medium tabular",
      positive ? "text-emerald-500" : "text-rose-500"
    )}>
      <Icon className="h-3 w-3" />
      {positive ? "+" : ""}{pct.toFixed(1)}%
    </span>
  );
}

export default function ComparativoPage() {
  const ds = useDataset();
  const [tab, setTab] = React.useState<DimTab>("vendedores");

  const result = React.useMemo(() => {
    const orders = ds.orders; // all years, no date filter
    if (!ds.hasData) return null;

    switch (tab) {
      case "vendedores":
        return yearlyByOrder(orders, (o) => o.sellerId, (o) => o.sellerName);
      case "canais":
        return yearlyByOrder(orders, (o) => o.channel, (o) => o.channel);
      case "clientes":
        return yearlyByOrder(orders, (o) => o.clientId, (o) => o.clientName);
      case "subgrupos":
        return yearlyByItem(orders, (_sid, sname) => ({ key: sname, label: sname }));
      case "produtos":
        return yearlyByItem(orders, (_sid, _sname, pid, pname) => ({ key: pid, label: pname }));
    }
  }, [ds.hasData, ds.orders, tab]);

  if (!ds.hasData) {
    return (
      <div className="space-y-8">
        <PageHeader
          eyebrow="Análise comparativa"
          title="Comparativo anual."
          description="Compare o desempenho ano a ano por vendedor, subgrupo, canal, cliente e produto."
        />
        <EmptyState />
      </div>
    );
  }

  const years = result?.years ?? [];
  const rows = result?.rows ?? [];

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Análise comparativa"
        title="Comparativo anual."
        description="Evolução de receita por ano · identifique crescimento ou retração por dimensão."
      />

      {/* Dimension tabs */}
      <div className="flex gap-1 rounded-md border border-border bg-muted/30 p-1 w-fit">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={cn(
              "rounded px-3 py-1.5 text-sm font-medium transition-colors",
              tab === t.id
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Chart */}
      {rows.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">
              Receita por ano · {TABS.find((t) => t.id === tab)?.label}
            </CardTitle>
          </CardHeader>
          <CardContent className="pb-2">
            <YearComparisonChart data={{ years, rows }} />
          </CardContent>
        </Card>
      )}

      {/* Detail table */}
      {rows.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Detalhamento por ano</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/30">
                    <th className="px-4 py-2.5 text-left text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                      {TABS.find((t) => t.id === tab)?.label}
                    </th>
                    {years.map((yr) => (
                      <th key={yr} className="px-4 py-2.5 text-right text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                        {yr}
                      </th>
                    ))}
                    <th className="px-4 py-2.5 text-right text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                      Total
                    </th>
                    <th className="px-4 py-2.5 text-right text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                      Var. anual
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {rows.map((row, i) => (
                    <tr key={row.key} className={cn("transition-colors hover:bg-muted/20", i % 2 === 0 ? "" : "bg-muted/10")}>
                      <td className="px-4 py-2.5 font-medium text-foreground max-w-[180px] truncate">
                        {row.label}
                      </td>
                      {years.map((yr) => (
                        <td key={yr} className="px-4 py-2.5 text-right tabular text-muted-foreground">
                          <Money value={row.byYear[yr] ?? 0} compact />
                        </td>
                      ))}
                      <td className="px-4 py-2.5 text-right tabular font-medium text-foreground">
                        <Money value={row.total} compact />
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        <GrowthBadge growth={row.growth} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {rows.length === 0 && (
        <p className="text-sm text-muted-foreground">Sem dados para a dimensão selecionada.</p>
      )}
    </div>
  );
}
