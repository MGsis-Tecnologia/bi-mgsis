"use client";

import * as React from "react";
import {
  AlertOctagon,
  AlertTriangle,
  Boxes,
  Layers,
  PackageX,
  Search,
  TrendingUp,
} from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { EmptyState } from "@/components/dashboard/empty-state";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { BarChartH } from "@/components/charts/bar-chart-h";
import { Money } from "@/components/dashboard/money";
import { useDataset, useFilteredOrders } from "@/lib/hooks/use-dataset";
import { useDatasetStore } from "@/lib/store/dataset";
import { useFilters } from "@/lib/store/filters";
import {
  inventoryAnalysis,
  stockByCategory,
  statusDistribution,
  statusLabel,
  topDormant,
  topMovers,
  topRuptureRisk,
  type InventoryRow,
  type StockStatus,
} from "@/lib/analytics/inventory";
import { formatCurrency, formatNumber, formatPercent } from "@/lib/utils/format";
import { cn } from "@/lib/utils";

export default function EstoquePage() {
  const inventory = useDatasetStore((s) => s.inventory);
  const ds = useDataset();
  const orders = useFilteredOrders();

  const getRange = useFilters((s) => s.getRange);
  const preset = useFilters((s) => s.preset);
  const customRange = useFilters((s) => s.customRange);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const range = React.useMemo(() => getRange(), [preset, customRange, getRange]);
  const periodDays = Math.max(
    1,
    Math.round((range.to.getTime() - range.from.getTime()) / 86400000) + 1
  );

  const [statusFilter, setStatusFilter] = React.useState<StockStatus | "all">("all");
  const [query, setQuery] = React.useState("");

  const analysis = React.useMemo(
    () => inventoryAnalysis(inventory?.items ?? [], orders, ds.products, { periodDays }),
    [inventory?.items, orders, ds.products, periodDays]
  );
  const rows = analysis.rows;

  const byCategory = React.useMemo(() => stockByCategory(rows), [rows]);
  const statuses = React.useMemo(() => statusDistribution(rows), [rows]);
  const movers = React.useMemo(() => topMovers(rows, 10), [rows]);
  const dormant = React.useMemo(() => topDormant(rows, 10), [rows]);
  const rupture = React.useMemo(() => topRuptureRisk(rows, 12), [rows]);

  const filteredRows = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows
      .filter((r) => (statusFilter === "all" ? true : r.status === statusFilter))
      .filter((r) => {
        if (!q) return true;
        return (
          r.description.toLowerCase().includes(q) ||
          r.productId.toLowerCase().includes(q) ||
          r.manufacturerCode.toLowerCase().includes(q) ||
          r.subgroupName.toLowerCase().includes(q)
        );
      })
      .sort((a, b) => b.costTotalUSD - a.costTotalUSD);
  }, [rows, statusFilter, query]);

  if (!inventory || inventory.items.length === 0) {
    return (
      <div className="space-y-8">
        <PageHeader
          eyebrow="Catálogo · estoque"
          title="O que está em estoque."
          description="Cobertura, ruptura, dormência e capital alocado por SKU — cruzando snapshot atual com o movimento de vendas do período."
        />
        <EmptyState
          title="Nenhum dado de estoque importado"
          description="Importe um arquivo de estoque (produto_id; produto_descricao; produto_fabricante; estoque_item; valor_estoque) para liberar a análise."
        />
      </div>
    );
  }

  const { totals } = analysis;
  const rupturePct = totals.skus > 0 ? totals.rupture / totals.skus : 0;
  const valueAtRisk = rows
    .filter((r) => r.status === "risk")
    .reduce((s, r) => s + r.costTotalUSD, 0);
  const valueDormant = rows
    .filter((r) => r.status === "no_movement" || r.status === "excess")
    .reduce((s, r) => s + r.costTotalUSD, 0);

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Catálogo · estoque"
        title="O que está em estoque."
        description="Cobertura, ruptura, dormência e capital alocado por SKU — cruzando snapshot atual com o movimento de vendas do período."
      >
        <Badge variant="ghost" className="gap-1">
          <Boxes className="h-3 w-3" />
          {formatNumber(totals.skus)} SKU(s) · {formatCurrency(totals.totalValueUSD, "2", { compact: true })}
        </Badge>
      </PageHeader>

      {/* KPIs */}
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard
          label="Capital em estoque"
          caption={`${formatNumber(totals.totalUnits)} unidades`}
          value={formatCurrency(totals.totalValueUSD, "2", { compact: true })}
          accent="accent"
        />
        <KpiCard
          label="Ruptura"
          caption={`${formatPercent(rupturePct, { decimals: 1 })} do catálogo`}
          value={formatNumber(totals.rupture)}
          accent="negative"
        />
        <KpiCard
          label="Em risco"
          caption={`${formatCurrency(valueAtRisk, "2", { compact: true })} sob risco`}
          value={formatNumber(totals.risk)}
        />
        <KpiCard
          label="Sem giro + excesso"
          caption={`${formatCurrency(valueDormant, "2", { compact: true })} parados`}
          value={formatNumber(totals.noMovement + totals.excess)}
        />
      </section>

      {/* Status mix + categories */}
      <section className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle>Distribuição por status</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2.5">
              {statuses.map((s) => (
                <StatusBar
                  key={s.key}
                  status={s.key}
                  count={s.count}
                  valueUSD={s.valueUSD}
                  total={totals.skus}
                  active={statusFilter === s.key}
                  onClick={() =>
                    setStatusFilter((prev) => (prev === s.key ? "all" : s.key))
                  }
                />
              ))}
            </div>
            <p className="mt-4 text-[11px] text-muted-foreground">
              Período de movimento: {formatNumber(periodDays)} dias ·
              {" "}
              <button
                type="button"
                onClick={() => setStatusFilter("all")}
                className="underline-offset-2 hover:underline"
              >
                limpar filtro
              </button>
            </p>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Capital em estoque por categoria</CardTitle>
              <Badge variant="ghost" className="gap-1">
                <Layers className="h-3 w-3" />
                top 10
              </Badge>
            </div>
          </CardHeader>
          <CardContent>
            <BarChartH
              rows={byCategory.slice(0, 10).map((c) => ({
                key: c.id,
                label: c.name,
                value: c.valueUSD,
                secondary: `${formatNumber(c.skus)} SKUs · ${formatNumber(c.units)} un`,
                tone: "accent",
              }))}
              format="currency"
              maxRows={10}
            />
          </CardContent>
        </Card>
      </section>

      {/* Rupture / risk + movers */}
      <section className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <AlertOctagon className="h-4 w-4 text-negative" />
                Ruptura & risco
              </CardTitle>
              <Badge variant="negative" className="gap-1">
                {formatNumber(totals.rupture + totals.risk)} item(ns)
              </Badge>
            </div>
            <p className="mt-1 text-[11px] text-muted-foreground">
              Sem estoque mas com saída no período, ou cobertura ≤ 15 dias.
            </p>
          </CardHeader>
          <CardContent className="px-0">
            <CompactList rows={rupture} mode="rupture" emptyMessage="Sem rupturas ou riscos no período." />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-positive" />
                Top movimentação
              </CardTitle>
              <Badge variant="positive" className="gap-1">
                top 10
              </Badge>
            </div>
            <p className="mt-1 text-[11px] text-muted-foreground">
              Itens com maior saída no período — base para repor.
            </p>
          </CardHeader>
          <CardContent className="px-0">
            <CompactList rows={movers} mode="movers" emptyMessage="Sem movimentação no período." />
          </CardContent>
        </Card>
      </section>

      {/* Dormant capital */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <PackageX className="h-4 w-4 text-warning" />
              Capital parado · sem giro
            </CardTitle>
            <Badge variant="warning" className="gap-1">
              {formatCurrency(valueDormant, "2", { compact: true })} parados
            </Badge>
          </div>
          <p className="mt-1 text-[11px] text-muted-foreground">
            SKUs com estoque positivo e zero saída no período — ordenados pelo maior valor imobilizado.
          </p>
        </CardHeader>
        <CardContent className="px-0">
          <CompactList rows={dormant} mode="dormant" emptyMessage="Sem itens parados no período." />
        </CardContent>
      </Card>

      {/* Detailed table */}
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle>Detalhamento por SKU</CardTitle>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                {formatNumber(filteredRows.length)} de {formatNumber(rows.length)} itens
                {statusFilter !== "all" && ` · filtro: ${statusLabel(statusFilter)}`}
                {totals.skusMissingFromInventory > 0 && (
                  <>
                    {" "}· <span className="text-warning">
                      {totals.skusMissingFromInventory} SKU(s) vendidos sem registro no estoque
                    </span>
                  </>
                )}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Buscar SKU, descrição, fabricante…"
                  className="h-8 w-64 rounded-md border border-border bg-background pl-8 pr-3 text-xs text-foreground placeholder:text-muted-foreground focus:border-foreground/50 focus:outline-none"
                />
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent className="px-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-y border-border text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                  <th className="text-left font-medium py-2 px-5">SKU</th>
                  <th className="text-left font-medium py-2 px-5">Descrição</th>
                  <th className="text-left font-medium py-2 px-5">Fabricante</th>
                  <th className="text-left font-medium py-2 px-5">Categoria</th>
                  <th className="text-right font-medium py-2 px-5">Estoque</th>
                  <th className="text-right font-medium py-2 px-5">Custo total · US$</th>
                  <th className="text-right font-medium py-2 px-5">Saída · período</th>
                  <th className="text-right font-medium py-2 px-5">Receita · período</th>
                  <th className="text-right font-medium py-2 px-5">Cobertura</th>
                  <th className="text-right font-medium py-2 px-5">Última saída</th>
                  <th className="text-left font-medium py-2 px-5">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filteredRows.slice(0, 200).map((r) => (
                  <tr key={r.productId} className="hover:bg-muted/30 transition-colors">
                    <td className="py-2 px-5 font-mono text-xs text-muted-foreground tabular">
                      {r.productId}
                    </td>
                    <td className="py-2 px-5 max-w-[280px] truncate">
                      <div className={cn("font-medium", !r.hasInventory && "text-warning")}>
                        {r.description || "—"}
                      </div>
                      {!r.hasInventory && (
                        <div className="text-[10px] text-warning">
                          fora do snapshot de estoque
                        </div>
                      )}
                    </td>
                    <td className="py-2 px-5 font-mono text-xs text-muted-foreground">
                      {r.manufacturerCode || "—"}
                    </td>
                    <td className="py-2 px-5 text-muted-foreground truncate max-w-[160px]">
                      {r.subgroupName || "—"}
                    </td>
                    <td className="py-2 px-5 text-right tabular">
                      {formatNumber(r.stock)}
                    </td>
                    <td className="py-2 px-5 text-right tabular font-medium">
                      {formatCurrency(r.costTotalUSD, "2", { compact: r.costTotalUSD >= 10000 })}
                    </td>
                    <td className="py-2 px-5 text-right tabular">
                      {r.unitsSold > 0 ? formatNumber(r.unitsSold) : "—"}
                    </td>
                    <td className="py-2 px-5 text-right tabular text-muted-foreground">
                      {r.revenueSold > 0 ? <Money value={r.revenueSold} compact /> : "—"}
                    </td>
                    <td className="py-2 px-5 text-right tabular">
                      <CoverageCell row={r} />
                    </td>
                    <td className="py-2 px-5 text-right tabular text-muted-foreground text-xs">
                      {r.lastSaleDate ? (
                        <>
                          <div>{r.lastSaleDate}</div>
                          {Number.isFinite(r.daysSinceLastSale) && (
                            <div className="text-[10px]">há {r.daysSinceLastSale}d</div>
                          )}
                        </>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="py-2 px-5">
                      <StatusBadge status={r.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {filteredRows.length === 0 && (
              <div className="py-10 text-center text-xs text-muted-foreground">
                Nenhum item para o filtro atual.
              </div>
            )}
            {filteredRows.length > 200 && (
              <div className="border-t border-border py-2.5 px-5 text-[11px] text-muted-foreground">
                Mostrando os 200 primeiros por valor. Use a busca para refinar.
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

const STATUS_TONES: Record<StockStatus, { dot: string; text: string; border: string; bg: string }> = {
  rupture:     { dot: "bg-negative",        text: "text-negative",         border: "border-negative/30", bg: "bg-negative/10" },
  risk:        { dot: "bg-warning",         text: "text-warning",          border: "border-warning/30",  bg: "bg-warning/10" },
  normal:      { dot: "bg-positive",        text: "text-positive",         border: "border-positive/30", bg: "bg-positive/10" },
  excess:      { dot: "bg-accent",          text: "text-accent",           border: "border-accent/30",   bg: "bg-accent/10" },
  no_movement: { dot: "bg-muted-foreground",text: "text-muted-foreground", border: "border-border",      bg: "bg-muted/40" },
};

function StatusBadge({ status }: { status: StockStatus }) {
  const tone = STATUS_TONES[status];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-medium",
        tone.border,
        tone.bg,
        tone.text
      )}
    >
      <span className={cn("h-1.5 w-1.5 rounded-full", tone.dot)} />
      {statusLabel(status)}
    </span>
  );
}

function StatusBar({
  status,
  count,
  valueUSD,
  total,
  active,
  onClick,
}: {
  status: StockStatus;
  count: number;
  valueUSD: number;
  total: number;
  active: boolean;
  onClick: () => void;
}) {
  const tone = STATUS_TONES[status];
  const pct = total > 0 ? count / total : 0;
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "w-full text-left rounded-md border px-3 py-2 transition-colors",
        active ? "border-foreground/40 bg-muted/40" : "border-transparent hover:bg-muted/30"
      )}
    >
      <div className="flex items-center justify-between gap-2 text-[12px]">
        <span className="inline-flex items-center gap-1.5 text-foreground">
          <span className={cn("h-2 w-2 rounded-full", tone.dot)} />
          {statusLabel(status)}
        </span>
        <span className="tabular font-medium">{formatNumber(count)}</span>
      </div>
      <div className="mt-1.5 relative h-1 w-full rounded-full bg-muted/60 overflow-hidden">
        <div
          className={cn("absolute inset-y-0 left-0 rounded-full", tone.dot)}
          style={{ width: `${Math.min(100, pct * 100)}%` }}
        />
      </div>
      <div className="mt-1.5 flex items-center justify-between text-[10px] text-muted-foreground tabular">
        <span>{formatPercent(pct, { decimals: 1 })} dos SKUs</span>
        <span>{formatCurrency(valueUSD, "2", { compact: true })}</span>
      </div>
    </button>
  );
}

function CoverageCell({ row }: { row: InventoryRow }) {
  if (row.stock <= 0) return <span className="text-negative font-medium">0d</span>;
  if (!Number.isFinite(row.coverageDays)) return <span className="text-muted-foreground">—</span>;
  const days = Math.round(row.coverageDays);
  const tone =
    days <= 15 ? "text-warning" : days >= 180 ? "text-accent" : "text-foreground";
  return (
    <span className={cn("font-medium", tone)}>
      {days >= 999 ? "999+ d" : `${formatNumber(days)} d`}
    </span>
  );
}

// Compact list used by the rupture/movers/dormant cards
function CompactList({
  rows,
  mode,
  emptyMessage,
}: {
  rows: InventoryRow[];
  mode: "rupture" | "movers" | "dormant";
  emptyMessage: string;
}) {
  if (rows.length === 0) {
    return <div className="px-5 py-8 text-center text-xs text-muted-foreground">{emptyMessage}</div>;
  }
  return (
    <ul className="divide-y divide-border">
      {rows.map((r, i) => (
        <li
          key={r.productId}
          className="grid grid-cols-[24px_1fr_auto] items-center gap-3 px-5 py-2.5"
        >
          <span className="text-[10px] font-mono text-muted-foreground tabular">
            {(i + 1).toString().padStart(2, "0")}
          </span>
          <div className="min-w-0">
            <div className="truncate text-[13px] font-medium text-foreground">
              {r.description || r.productId}
            </div>
            <div className="mt-0.5 flex items-center gap-2 text-[10px] text-muted-foreground font-mono">
              <span>{r.productId}</span>
              {r.manufacturerCode && <span>· {r.manufacturerCode}</span>}
              {r.subgroupName && <span className="truncate">· {r.subgroupName}</span>}
            </div>
          </div>
          <div className="text-right shrink-0">
            {mode === "rupture" && <RuptureMeta row={r} />}
            {mode === "movers" && <MoversMeta row={r} />}
            {mode === "dormant" && <DormantMeta row={r} />}
          </div>
        </li>
      ))}
    </ul>
  );
}

function RuptureMeta({ row }: { row: InventoryRow }) {
  if (row.status === "rupture") {
    return (
      <div className="space-y-0.5">
        <StatusBadge status="rupture" />
        <div className="text-[10px] text-muted-foreground tabular">
          {formatNumber(row.unitsSold)} un / período · {formatNumber(row.ordersCount)} pedidos
        </div>
      </div>
    );
  }
  return (
    <div className="space-y-0.5">
      <div className="flex items-center justify-end gap-1.5 text-[12px] font-medium text-warning tabular">
        <AlertTriangle className="h-3 w-3" />
        {Math.round(row.coverageDays)} d
      </div>
      <div className="text-[10px] text-muted-foreground tabular">
        estoque {formatNumber(row.stock)} · sai {row.avgDailyDemand.toFixed(2)}/dia
      </div>
    </div>
  );
}

function MoversMeta({ row }: { row: InventoryRow }) {
  return (
    <div className="space-y-0.5">
      <div className="text-[12px] font-medium tabular text-foreground">
        {formatNumber(row.unitsSold)} un
      </div>
      <div className="text-[10px] text-muted-foreground tabular">
        estoque {formatNumber(row.stock)} · cobertura{" "}
        {Number.isFinite(row.coverageDays) ? `${Math.round(row.coverageDays)} d` : "—"}
      </div>
    </div>
  );
}

function DormantMeta({ row }: { row: InventoryRow }) {
  return (
    <div className="space-y-0.5">
      <div className="text-[12px] font-medium tabular text-foreground">
        {formatCurrency(row.costTotalUSD, "2", { compact: true })}
      </div>
      <div className="text-[10px] text-muted-foreground tabular">
        {formatNumber(row.stock)} un parados
        {row.lastSaleDate ? ` · última saída ${row.lastSaleDate}` : " · sem histórico"}
      </div>
    </div>
  );
}
