"use client";

import * as React from "react";
import { ChevronDown, TrendingUp, TrendingDown, Minus, X } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/dashboard/empty-state";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Money } from "@/components/dashboard/money";
import { YearComparisonChart } from "@/components/charts/year-comparison-chart";
import { YearDrilldownChart } from "@/components/charts/year-drilldown-chart";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { useDataset } from "@/lib/hooks/use-dataset";
import { yearlyByOrder, yearlyByItem, type YearlyRow, type YearlyResult } from "@/lib/analytics/yearly";
import { cn } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────────────────────

type DimTab = "vendedores" | "subgrupos" | "canais" | "clientes" | "produtos";

const TABS: { id: DimTab; label: string }[] = [
  { id: "vendedores", label: "Vendedores" },
  { id: "subgrupos",  label: "Subgrupos" },
  { id: "canais",     label: "Canais" },
  { id: "clientes",   label: "Clientes" },
  { id: "produtos",   label: "Produtos" },
];

// ─── Growth badge ─────────────────────────────────────────────────────────────

function GrowthBadge({ growth }: { growth: number | null }) {
  if (growth === null) return <span className="text-muted-foreground text-xs">—</span>;
  const pct = growth * 100;
  const Icon = pct === 0 ? Minus : pct > 0 ? TrendingUp : TrendingDown;
  return (
    <span className={cn(
      "inline-flex items-center gap-0.5 text-xs font-medium tabular",
      pct > 0 ? "text-emerald-500" : pct < 0 ? "text-rose-500" : "text-muted-foreground"
    )}>
      <Icon className="h-3 w-3" />
      {pct > 0 ? "+" : ""}{pct.toFixed(1)}%
    </span>
  );
}

// ─── Searchable entity picker ─────────────────────────────────────────────────

interface PickerProps {
  placeholder: string;
  options: { key: string; label: string }[];
  value: string | null;
  onChange: (key: string | null) => void;
}

function EntityPicker({ placeholder, options, value, onChange }: PickerProps) {
  const [open, setOpen] = React.useState(false);
  const [search, setSearch] = React.useState("");

  const selected = value ? options.find((o) => o.key === value) : null;
  const filtered = search
    ? options.filter((o) => o.label.toLowerCase().includes(search.toLowerCase()))
    : options;

  return (
    <div className="flex items-center gap-1">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            className={cn(
              "flex h-9 min-w-[200px] max-w-[280px] items-center justify-between gap-2 rounded-md border border-border bg-surface px-3 text-sm transition-colors",
              "hover:bg-muted/40 focus:outline-none focus:ring-2 focus:ring-ring/30",
              selected ? "text-foreground font-medium" : "text-muted-foreground"
            )}
          >
            <span className="truncate">{selected ? selected.label : placeholder}</span>
            <ChevronDown className="h-4 w-4 shrink-0 opacity-60" />
          </button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-72 p-0">
          <div className="p-2 border-b border-border">
            <input
              autoFocus
              placeholder="Buscar…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-sm bg-transparent px-2 py-1.5 text-sm outline-none placeholder:text-muted-foreground"
            />
          </div>
          <div className="max-h-60 overflow-y-auto py-1">
            <button
              className={cn(
                "w-full px-3 py-2 text-left text-sm transition-colors hover:bg-muted/60",
                !value && "font-medium text-foreground bg-muted/30"
              )}
              onClick={() => { onChange(null); setOpen(false); setSearch(""); }}
            >
              {placeholder}
            </button>
            {filtered.map((opt) => (
              <button
                key={opt.key}
                className={cn(
                  "w-full truncate px-3 py-2 text-left text-sm transition-colors hover:bg-muted/60",
                  value === opt.key && "font-medium text-foreground bg-muted/30"
                )}
                onClick={() => { onChange(opt.key); setOpen(false); setSearch(""); }}
              >
                {opt.label}
              </button>
            ))}
            {filtered.length === 0 && (
              <p className="px-3 py-2 text-xs text-muted-foreground">Nenhum resultado.</p>
            )}
          </div>
        </PopoverContent>
      </Popover>

      {selected && (
        <button
          onClick={() => onChange(null)}
          className="flex h-9 w-9 items-center justify-center rounded-md border border-border text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors"
          title="Limpar filtro"
        >
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}

// ─── Drill-down view (single entity) ─────────────────────────────────────────

function DrilldownView({ row, years }: { row: YearlyRow; years: string[] }) {
  return (
    <div className="space-y-6">
      {/* KPI cards — one per year */}
      <div className={cn("grid gap-3", years.length <= 3 ? "grid-cols-3" : years.length === 4 ? "grid-cols-4" : "grid-cols-5")}>
        {years.map((yr, idx) => {
          const revenue = row.byYear[yr] ?? 0;
          const prev = idx > 0 ? (row.byYear[years[idx - 1]!] ?? 0) : null;
          const growth = prev !== null && prev > 0 ? (revenue - prev) / prev : null;
          return (
            <Card key={yr} className="relative overflow-hidden">
              <CardContent className="pt-4 pb-4">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{yr}</p>
                <p className="mt-1 text-lg font-semibold tabular text-foreground">
                  <Money value={revenue} compact />
                </p>
                {growth !== null && (
                  <p className="mt-0.5 text-xs">
                    <GrowthBadge growth={growth} />
                    <span className="ml-1 text-muted-foreground">vs {years[idx - 1]}</span>
                  </p>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Large single-entity chart */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">{row.label} · evolução anual</CardTitle>
        </CardHeader>
        <CardContent className="pb-4">
          <YearDrilldownChart years={years} byYear={row.byYear} />
        </CardContent>
      </Card>

      {/* Year-by-year table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">Detalhamento por ano</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="px-4 py-2.5 text-left text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Ano</th>
                <th className="px-4 py-2.5 text-right text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Receita</th>
                <th className="px-4 py-2.5 text-right text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Var. anual</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {years.map((yr, idx) => {
                const revenue = row.byYear[yr] ?? 0;
                const prev = idx > 0 ? (row.byYear[years[idx - 1]!] ?? 0) : null;
                const growth = prev !== null && prev > 0 ? (revenue - prev) / prev : null;
                return (
                  <tr key={yr} className="hover:bg-muted/20 transition-colors">
                    <td className="px-4 py-3 font-medium text-foreground">{yr}</td>
                    <td className="px-4 py-3 text-right tabular text-foreground">
                      <Money value={revenue} />
                    </td>
                    <td className="px-4 py-3 text-right">
                      <GrowthBadge growth={growth} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Overview view (all entities) ────────────────────────────────────────────

function OverviewView({ result }: { result: YearlyResult }) {
  const { years, rows } = result;
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">
            Receita por ano · {rows.length} {rows.length === 1 ? "item" : "itens"}
          </CardTitle>
        </CardHeader>
        <CardContent className="pb-2">
          <YearComparisonChart data={{ years, rows }} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">Detalhamento por ano</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="px-4 py-2.5 text-left text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Item</th>
                  {years.map((yr) => (
                    <th key={yr} className="px-4 py-2.5 text-right text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{yr}</th>
                  ))}
                  <th className="px-4 py-2.5 text-right text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Total</th>
                  <th className="px-4 py-2.5 text-right text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Var. anual</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((row, i) => (
                  <tr key={row.key} className={cn("transition-colors hover:bg-muted/20", i % 2 !== 0 && "bg-muted/10")}>
                    <td className="px-4 py-2.5 font-medium text-foreground max-w-[200px] truncate">{row.label}</td>
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
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ComparativoPage() {
  const ds = useDataset();
  const [tab, setTab] = React.useState<DimTab>("vendedores");
  const [selectedKey, setSelectedKey] = React.useState<string | null>(null);

  // Reset selection when tab changes
  React.useEffect(() => { setSelectedKey(null); }, [tab]);

  const result = React.useMemo((): YearlyResult | null => {
    if (!ds.hasData) return null;
    const orders = ds.orders;
    switch (tab) {
      case "vendedores": return yearlyByOrder(orders, (o) => o.sellerId, (o) => o.sellerName);
      case "canais":     return yearlyByOrder(orders, (o) => o.channel, (o) => o.channel);
      case "clientes":   return yearlyByOrder(orders, (o) => o.clientId, (o) => o.clientName);
      case "subgrupos":  return yearlyByItem(orders, (_sid, sname) => ({ key: sname, label: sname }));
      case "produtos":   return yearlyByItem(orders, (_sid, _sn, pid, pname) => ({ key: pid, label: pname }));
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

  const pickerLabel: Record<DimTab, string> = {
    vendedores: "Todos os vendedores",
    subgrupos:  "Todos os subgrupos",
    canais:     "Todos os canais",
    clientes:   "Todos os clientes",
    produtos:   "Todos os produtos",
  };

  const pickerOptions = result
    ? result.rows.map((r) => ({ key: r.key, label: r.label }))
    : [];

  const selectedRow = selectedKey && result
    ? result.rows.find((r) => r.key === selectedKey) ?? null
    : null;

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Análise comparativa"
        title="Comparativo anual."
        description="Evolução de receita por ano · identifique crescimento ou retração por dimensão."
      />

      {/* Controls row */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Dimension tabs */}
        <div className="flex gap-1 rounded-md border border-border bg-muted/30 p-1">
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

        {/* Entity picker */}
        <EntityPicker
          placeholder={pickerLabel[tab]}
          options={pickerOptions}
          value={selectedKey}
          onChange={setSelectedKey}
        />
      </div>

      {/* Content */}
      {result && result.rows.length > 0 ? (
        selectedRow
          ? <DrilldownView row={selectedRow} years={result.years} />
          : <OverviewView result={result} />
      ) : (
        <p className="text-sm text-muted-foreground">Sem dados para a dimensão selecionada.</p>
      )}
    </div>
  );
}
