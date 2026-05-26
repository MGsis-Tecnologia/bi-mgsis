"use client";

import * as React from "react";
import {
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { CheckCircle2, Loader2, Upload, XCircle } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ChartTooltip } from "@/components/charts/chart-tooltip";
import { useCaixa, useFilteredCaixa } from "@/lib/hooks/use-cashflow";
import { useFilters } from "@/lib/store/filters";
import {
  buildDre,
  byCentroCusto,
  cashflowTimeSeries,
  computeCashflowKpis,
  expenseBreakdown,
  type DreRow,
} from "@/lib/analytics/cashflow";
import { formatCurrency, formatPercent, formatNumber } from "@/lib/utils/format";
import { cn } from "@/lib/utils";
import { parseFile } from "@/lib/parsers/csv-parser";
import { useDatasetStore, CAIXA_IDB_KEY } from "@/lib/store/dataset";
import { idbSet } from "@/lib/store/idb";

const PIE_COLORS = [
  "hsl(var(--chart-1))",
  "hsl(var(--chart-2))",
  "hsl(var(--chart-3))",
  "hsl(var(--chart-4))",
  "hsl(var(--chart-5))",
  "hsl(var(--chart-6))",
  "hsl(var(--muted-foreground))",
];

type ChartMode = "monthly" | "daily";

export default function DrePage() {
  const caixa = useCaixa();
  const items = useFilteredCaixa();
  const currency = useFilters((s) => s.currency);
  const [chartMode, setChartMode] = React.useState<ChartMode>("monthly");
  const [dreExpanded, setDreExpanded] = React.useState<Set<string>>(new Set());

  const kpis       = React.useMemo(() => computeCashflowKpis(items), [items]);
  const series     = React.useMemo(() => cashflowTimeSeries(items, chartMode), [items, chartMode]);
  const dreRows    = React.useMemo(() => buildDre(items), [items]);
  const pieData    = React.useMemo(() => expenseBreakdown(items), [items]);
  const ccRows     = React.useMemo(() => byCentroCusto(items).slice(0, 10), [items]);

  const fmt = (v: number) => formatCurrency(v, currency, { compact: true });

  if (!caixa.hasData) {
    return (
      <div className="space-y-8">
        <PageHeader
          eyebrow="Financeiro · Caixa & DRE"
          title="Ingressos & DRE"
          description="Fluxo de caixa, demonstrativo de resultado e análise de despesas."
        />
        <InlineImport />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Financeiro · Caixa & DRE"
        title="Ingressos & DRE"
        description="Fluxo de caixa, demonstrativo de resultado e análise de despesas."
      >
        <Badge variant="ghost">{formatNumber(items.length)} movimentações</Badge>
      </PageHeader>

      {/* ── KPI Cards ──────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KpiCard
          label="Ingressos"
          value={fmt(kpis.ingressos)}
          accent="positive"
          caption="Entradas no período"
        />
        <KpiCard
          label="Gastos"
          value={fmt(kpis.gastos)}
          accent="negative"
          caption="Saídas no período"
        />
        <KpiCard
          label="Saldo"
          value={fmt(kpis.saldo)}
          accent={kpis.saldo >= 0 ? "positive" : "negative"}
          caption="Ingressos − Gastos"
        />
        <KpiCard
          label="Margem"
          value={formatPercent(kpis.margem, { decimals: 1 })}
          accent={kpis.margem >= 0.1 ? "positive" : kpis.margem < 0 ? "negative" : "default"}
          caption="Saldo / Ingressos"
        />
      </div>

      {/* ── Fluxo de Caixa (line chart) ────────────────────────────────────── */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-sm">Fluxo de Caixa</CardTitle>
          <div className="flex gap-1">
            {(["monthly", "daily"] as ChartMode[]).map((m) => (
              <button
                key={m}
                onClick={() => setChartMode(m)}
                className={cn(
                  "rounded px-2.5 py-1 text-[11px] transition-colors",
                  chartMode === m
                    ? "bg-muted text-foreground font-medium"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {m === "monthly" ? "Mensal" : "Diário"}
              </button>
            ))}
          </div>
        </CardHeader>
        <CardContent>
          {series.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">
              Sem dados no período selecionado.
            </p>
          ) : (
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={series} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="2 4" vertical={false} />
                <XAxis
                  dataKey="label"
                  tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }}
                  tickLine={false}
                  axisLine={false}
                  interval="preserveStartEnd"
                />
                <YAxis
                  tickLine={false}
                  axisLine={false}
                  tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }}
                  tickFormatter={(v) => fmt(v as number)}
                  width={72}
                />
                <Tooltip content={<ChartTooltip showCurrency />} />
                <Legend
                  iconType="circle"
                  iconSize={8}
                  wrapperStyle={{ fontSize: 11, paddingTop: 8 }}
                  formatter={(value) =>
                    value === "ingressos" ? "Ingressos" : "Gastos"
                  }
                />
                <Line
                  type="monotone"
                  dataKey="ingressos"
                  stroke="hsl(210 100% 56%)"
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4 }}
                />
                <Line
                  type="monotone"
                  dataKey="gastos"
                  stroke="hsl(var(--negative))"
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4 }}
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* ── DRE + Pie ──────────────────────────────────────────────────────── */}
      <div className="grid gap-4 lg:grid-cols-5">
        {/* DRE Table */}
        <Card className="lg:col-span-3">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Demonstrativo de Resultado (DRE)</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {dreRows.length === 0 ? (
              <p className="px-5 py-6 text-sm text-muted-foreground">Sem dados.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-y border-border">
                      <th className="py-2 pl-5 pr-2 text-left text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
                        Conta
                      </th>
                      <th className="py-2 px-3 text-right text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
                        Ingressos
                      </th>
                      <th className="py-2 px-3 text-right text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
                        Gastos
                      </th>
                      <th className="py-2 pl-3 pr-5 text-right text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
                        Saldo
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/60">
                    {dreRows.map((row) => (
                      <DreTableRow
                        key={`${row.planoContaCodigo}-${row.planoContaId}`}
                        row={row}
                        currency={currency}
                        expanded={dreExpanded}
                        onToggle={(code) =>
                          setDreExpanded((prev) => {
                            const next = new Set(prev);
                            if (next.has(code)) next.delete(code);
                            else next.add(code);
                            return next;
                          })
                        }
                      />
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-border bg-muted/30">
                      <td className="py-2.5 pl-5 pr-2 text-xs font-semibold">Total</td>
                      <td className="py-2.5 px-3 text-right text-xs font-semibold tabular text-positive">
                        {fmt(kpis.ingressos)}
                      </td>
                      <td className="py-2.5 px-3 text-right text-xs font-semibold tabular text-negative">
                        {fmt(kpis.gastos)}
                      </td>
                      <td
                        className={cn(
                          "py-2.5 pl-3 pr-5 text-right text-xs font-semibold tabular",
                          kpis.saldo >= 0 ? "text-positive" : "text-negative"
                        )}
                      >
                        {fmt(kpis.saldo)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Expense Pie */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Despesas por Conta</CardTitle>
          </CardHeader>
          <CardContent>
            {pieData.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                Sem despesas no período.
              </p>
            ) : (
              <ExpensePieChart data={pieData} fmt={fmt} />
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── Centro de Custo ────────────────────────────────────────────────── */}
      {ccRows.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Por Centro de Custo</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-y border-border">
                    <th className="py-2 pl-5 pr-2 text-left text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
                      Centro de Custo
                    </th>
                    <th className="py-2 px-3 text-right text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
                      Ingressos
                    </th>
                    <th className="py-2 px-3 text-right text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
                      Gastos
                    </th>
                    <th className="py-2 pl-3 pr-5 text-right text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
                      Saldo
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {ccRows.map((row) => (
                    <tr key={row.id} className="hover:bg-muted/30">
                      <td className="py-2.5 pl-5 pr-2 text-foreground">{row.descricao}</td>
                      <td className="py-2.5 px-3 text-right tabular text-positive">
                        {fmt(row.ingressos)}
                      </td>
                      <td className="py-2.5 px-3 text-right tabular text-negative">
                        {fmt(row.gastos)}
                      </td>
                      <td
                        className={cn(
                          "py-2.5 pl-3 pr-5 text-right tabular",
                          row.saldo >= 0 ? "text-positive" : "text-negative"
                        )}
                      >
                        {fmt(row.saldo)}
                      </td>
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

// ─── DRE table row (with indentation by level) ───────────────────────────────

function DreTableRow({
  row,
  currency,
  expanded,
  onToggle,
}: {
  row: DreRow;
  currency: string;
  expanded: Set<string>;
  onToggle: (code: string) => void;
}) {
  const fmt = (v: number) => formatCurrency(v, currency, { compact: true });
  const indent = (row.level - 1) * 14;
  const isExpanded = expanded.has(row.planoContaCodigo);

  return (
    <tr
      className={cn(
        "hover:bg-muted/30 transition-colors",
        row.isParent && "font-medium"
      )}
    >
      <td className="py-2.5 pr-2" style={{ paddingLeft: `${20 + indent}px` }}>
        <div className="flex items-center gap-1.5">
          {row.isParent && (
            <button
              onClick={() => onToggle(row.planoContaCodigo)}
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              <span className="text-[11px]">{isExpanded ? "▾" : "▸"}</span>
            </button>
          )}
          <span className="text-muted-foreground tabular mr-1.5 text-[10px]">
            {row.planoContaCodigo}
          </span>
          <span className={cn(row.isParent ? "text-foreground" : "text-foreground/80")}>
            {row.planoContaDescricao}
          </span>
        </div>
      </td>
      <td className="py-2.5 px-3 text-right tabular">
        {row.ingressos > 0 ? (
          <span className="text-positive">{fmt(row.ingressos)}</span>
        ) : (
          <span className="text-muted-foreground/40">—</span>
        )}
      </td>
      <td className="py-2.5 px-3 text-right tabular">
        {row.gastos > 0 ? (
          <span className="text-negative">{fmt(row.gastos)}</span>
        ) : (
          <span className="text-muted-foreground/40">—</span>
        )}
      </td>
      <td
        className={cn(
          "py-2.5 pl-3 pr-5 text-right tabular",
          row.saldo >= 0 ? "text-positive" : "text-negative"
        )}
      >
        {fmt(row.saldo)}
      </td>
    </tr>
  );
}

// ─── Inline import (shown when no caixa data) ────────────────────────────────

type ImportStatus = "idle" | "parsing" | "success" | "error";

function InlineImport() {
  const setCaixa = useDatasetStore((s) => s.setCaixa);
  const [drag, setDrag] = React.useState(false);
  const [status, setStatus] = React.useState<ImportStatus>("idle");
  const [message, setMessage] = React.useState("");
  const inputRef = React.useRef<HTMLInputElement>(null);

  async function handleFile(file: File) {
    if (!/\.(csv|xlsx|xls)$/i.test(file.name)) {
      setStatus("error");
      setMessage("Formato inválido. Use CSV, XLSX ou XLS.");
      return;
    }
    setStatus("parsing");
    setMessage("");
    const result = await parseFile(file);
    if (result.kind === "caixa" && result.caixa) {
      await idbSet(CAIXA_IDB_KEY, result.caixa);
      setCaixa(result.caixa);
      setStatus("success");
      setMessage(`${formatNumber(result.caixa.rowCount)} movimentações carregadas.`);
    } else {
      const errMsg = result.errors.join(" | ") ||
        `Leiaute não reconhecido como Caixa (kind=${result.kind ?? "null"}). Abra o DevTools (F12 → Console) para ver as colunas detectadas.`;
      console.error("[InlineImport] falha:", { kind: result.kind, errors: result.errors, warnings: result.warnings });
      setStatus("error");
      setMessage(errMsg);
    }
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDrag(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }

  function onInput(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
    e.target.value = "";
  }

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
      onDragLeave={() => setDrag(false)}
      onDrop={onDrop}
      onClick={() => status !== "parsing" && inputRef.current?.click()}
      className={cn(
        "flex cursor-pointer flex-col items-center justify-center gap-4 rounded-xl border-2 border-dashed p-20 text-center transition-colors",
        drag
          ? "border-foreground bg-muted/30"
          : "border-border hover:border-muted-foreground/50 hover:bg-muted/10"
      )}
    >
      <input
        ref={inputRef}
        type="file"
        accept=".csv,.xlsx,.xls"
        className="hidden"
        onChange={onInput}
      />

      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-muted">
        {status === "parsing" && <Loader2 className="h-6 w-6 animate-spin text-accent" />}
        {status === "success" && <CheckCircle2 className="h-6 w-6 text-positive" />}
        {status === "error"   && <XCircle className="h-6 w-6 text-negative" />}
        {status === "idle"    && <Upload className="h-6 w-6 text-muted-foreground" />}
      </div>

      <div className="space-y-1.5">
        <p className="text-sm font-medium text-foreground">
          {status === "idle"    && "Nenhuma movimentação importada"}
          {status === "parsing" && "Processando arquivo…"}
          {status === "success" && "Importado com sucesso!"}
          {status === "error"   && "Erro ao importar"}
        </p>
        <p className="text-xs text-muted-foreground max-w-sm">
          {status === "idle" &&
            "Arraste ou clique para selecionar o arquivo de caixa/banco (CSV, XLSX ou XLS). O leiaute deve conter a coluna caixa_valor_documento."}
          {status === "parsing" && "Aguarde…"}
          {(status === "success" || status === "error") && message}
        </p>
      </div>

      {status === "idle" && (
        <span className="inline-flex items-center gap-1.5 rounded-md bg-foreground px-3 py-1.5 text-xs font-medium text-background">
          <Upload className="h-3.5 w-3.5" />
          Selecionar arquivo
        </span>
      )}

      {status === "error" && (
        <button
          onClick={(e) => { e.stopPropagation(); setStatus("idle"); setMessage(""); }}
          className="text-xs text-muted-foreground hover:text-foreground underline"
        >
          Tentar novamente
        </button>
      )}
    </div>
  );
}

// ─── Expense pie chart ────────────────────────────────────────────────────────

function ExpensePieChart({
  data,
  fmt,
}: {
  data: { name: string; value: number; pct: number }[];
  fmt: (v: number) => string;
}) {
  const total = data.reduce((s, d) => s + d.value, 0);

  return (
    <div className="space-y-4">
      <div className="relative mx-auto" style={{ width: 220, height: 220 }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              dataKey="value"
              nameKey="name"
              innerRadius="62%"
              outerRadius="90%"
              paddingAngle={1.5}
              stroke="hsl(var(--surface))"
              strokeWidth={1.5}
              startAngle={90}
              endAngle={-270}
            >
              {data.map((_, i) => (
                <Cell
                  key={i}
                  fill={PIE_COLORS[i % PIE_COLORS.length]}
                />
              ))}
            </Pie>
            <Tooltip content={<ChartTooltip showCurrency />} />
          </PieChart>
        </ResponsiveContainer>
        <div className="absolute inset-0 grid place-items-center pointer-events-none text-center">
          <div>
            <div className="text-[9px] uppercase tracking-[0.18em] text-muted-foreground">
              Total
            </div>
            <div className="display-figure text-[22px] leading-tight">{fmt(total)}</div>
          </div>
        </div>
      </div>

      {/* Legend */}
      <div className="space-y-1">
        {data.map((d, i) => (
          <div key={d.name} className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <span
                className="h-2.5 w-2.5 rounded-sm shrink-0"
                style={{ background: PIE_COLORS[i % PIE_COLORS.length] }}
              />
              <span className="truncate text-[11.5px] text-foreground/80">{d.name}</span>
            </div>
            <div className="shrink-0 text-right">
              <span className="text-[11.5px] tabular font-medium">
                {(d.pct * 100).toFixed(1)}%
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
