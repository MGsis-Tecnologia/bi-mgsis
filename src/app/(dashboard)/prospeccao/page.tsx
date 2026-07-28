"use client";

import * as React from "react";
import { RefreshCw, AlertCircle, Package } from "lucide-react";
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from "recharts";
import { PageHeader } from "@/components/layout/page-header";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { LabeledDonut } from "@/components/charts/labeled-donut";
import { useFilters } from "@/lib/store/filters";
import { useExchangeRates } from "@/lib/store/exchange-rates";
import { useTranslation } from "@/lib/hooks/use-translation";
import { formatCurrency, formatNumber, formatPercent } from "@/lib/utils/format";
import type { AppCurrencyId } from "@/lib/types/dataset";
import { cn } from "@/lib/utils";

interface Resumo {
  kpis: {
    total: number; ganhos: number; perdidos: number; abertos: number; taxaConversao: number;
    valorTotal: number; valorGanho: number; valorEmRisco: number; ticketMedio: number;
    itensPorOrcamento: number; tempoMedioDias: number;
  };
  status: Array<{ key: "ganho" | "aberto" | "perdido"; count: number; valor: number }>;
  evolucao: Array<{ mes: string; criados: number; confirmados: number; taxa: number; valor: number }>;
  vendedores: Array<{ vendedor: string; total: number; confirmados: number; taxa: number; valor: number }>;
  produtos: Array<{ produto: string; vezesProposto: number; vezesConfirmado: number; taxa: number; valor: number }>;
  clientes: Array<{ cliente: string; orcamentos: number; confirmados: number; valor: number }>;
  pendentes: Array<{ orcamento_id: string; cliente_nome: string; valor: number; dias: number }>;
}

const EMPTY: Resumo = {
  kpis: { total: 0, ganhos: 0, perdidos: 0, abertos: 0, taxaConversao: 0, valorTotal: 0, valorGanho: 0, valorEmRisco: 0, ticketMedio: 0, itensPorOrcamento: 0, tempoMedioDias: 0 },
  status: [], evolucao: [], vendedores: [], produtos: [], clientes: [], pendentes: [],
};

function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default function ProspeccaoPage() {
  const { t, language } = useTranslation();
  const currency = useFilters((s) => s.currency);
  const empresaId = useFilters((s) => s.empresaId);
  const preset = useFilters((s) => s.preset);
  const customRange = useFilters((s) => s.customRange);
  const getRange = useFilters((s) => s.getRange);
  const rates = useExchangeRates((s) => s.rates);
  const fetchRates = useExchangeRates((s) => s.fetchRates);

  React.useEffect(() => { fetchRates(); }, [fetchRates]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const range = React.useMemo(() => getRange(), [preset, customRange, getRange]);
  const dataInicio = ymd(range.from);
  const dataFim = ymd(range.to);
  const ratesKey = JSON.stringify(rates);

  const displayCurrencyId: AppCurrencyId = currency === "ALL" ? "1" : currency;
  const money = (v: number, compact = false) => formatCurrency(v, displayCurrencyId, { compact });
  const monthLabel = (ym: string) => {
    const [y, m] = ym.split("-").map(Number);
    if (!y || !m) return ym;
    return new Intl.DateTimeFormat(language, { month: "short", year: "2-digit" }).format(new Date(y, m - 1, 1));
  };

  const [data, setData] = React.useState<Resumo>(EMPTY);
  const [loading, setLoading] = React.useState(true);

  const fetchData = React.useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ dataInicio, dataFim, currency, empresaId, rates: ratesKey });
      const res = await fetch(`/api/prospeccao/resumo?${params}`, { cache: "no-store" });
      if (!res.ok) throw new Error("Erro ao carregar");
      setData(await res.json());
    } catch (err) {
      console.error("Erro:", err);
    } finally {
      setLoading(false);
    }
  }, [dataInicio, dataFim, currency, empresaId, ratesKey]);

  React.useEffect(() => { fetchData(); }, [fetchData]);

  const { kpis, status, evolucao, vendedores, produtos, clientes, pendentes } = data;

  const statusColors: Record<string, string> = {
    ganho: "hsl(var(--positive))",
    aberto: "hsl(var(--accent))",
    perdido: "hsl(var(--negative))",
  };
  const statusLabels: Record<string, string> = {
    ganho: t("prospeccao.status.ganho"),
    aberto: t("prospeccao.status.aberto"),
    perdido: t("prospeccao.status.perdido"),
  };
  const donutData = status.map((s) => ({
    key: s.key, label: statusLabels[s.key], value: s.valor, count: s.count, color: statusColors[s.key],
  }));
  const evoLocalized = evolucao.map((e) => ({ ...e, mesLabel: monthLabel(e.mes) }));

  const hasData = kpis.total > 0;

  return (
    <div className="space-y-8">
      <PageHeader eyebrow={t("prospeccao.header.eyebrow")} title={t("prospeccao.header.title")} description={t("prospeccao.header.desc")}>
        <button
          onClick={fetchData}
          className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-surface px-2.5 text-xs font-medium hover:bg-muted/40 transition-colors"
        >
          <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
          {t("prospeccao.refresh")}
        </button>
      </PageHeader>

      {!hasData ? (
        <Card>
          <CardContent className="py-16 text-center">
            <Package className="mx-auto h-12 w-12 text-muted-foreground/30 mb-4" />
            <p className="text-sm text-muted-foreground">{t("prospeccao.empty")}</p>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* KPIs — 2 linhas de 4 */}
          <section className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <KpiCard label={t("prospeccao.kpi.total")} value={formatNumber(kpis.total)} accent="accent" />
            <KpiCard label={t("prospeccao.kpi.ganhos")} caption={`${formatPercent(kpis.taxaConversao / 100, { decimals: 1 })} ${t("prospeccao.kpi.taxa").toLowerCase()}`} value={formatNumber(kpis.ganhos)} accent="positive" />
            <KpiCard label={t("prospeccao.kpi.perdidos")} value={<span className="text-negative">{formatNumber(kpis.perdidos)}</span> as never} accent="negative" />
            <KpiCard label={t("prospeccao.kpi.abertos")} value={formatNumber(kpis.abertos)} />
            <KpiCard label={t("prospeccao.kpi.valorTotal")} value={money(kpis.valorTotal, true)} accent="accent" />
            <KpiCard label={t("prospeccao.kpi.valorGanho")} value={<span className="text-positive">{money(kpis.valorGanho, true)}</span> as never} accent="positive" />
            <KpiCard label={t("prospeccao.kpi.valorRisco")} value={<span className="text-negative">{money(kpis.valorEmRisco, true)}</span> as never} accent="negative" />
            <KpiCard label={t("prospeccao.kpi.ticket")} caption={`${formatNumber(kpis.itensPorOrcamento, { decimals: 1 })} ${t("prospeccao.kpi.itens").toLowerCase()}`} value={money(kpis.ticketMedio, true)} />
          </section>

          {/* Status donut + Tempo de confirmação */}
          <section className="grid grid-cols-1 lg:grid-cols-3 gap-3">
            <Card className="lg:col-span-2">
              <CardHeader><CardTitle>{t("prospeccao.status.title")}</CardTitle></CardHeader>
              <CardContent>
                <LabeledDonut data={donutData} currencyId={displayCurrencyId} height={220} />
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle>{t("prospeccao.kpi.tempo")}</CardTitle></CardHeader>
              <CardContent className="flex flex-col items-center justify-center py-6">
                <span className="display-figure text-[52px] leading-none tabular">{formatNumber(kpis.tempoMedioDias, { decimals: 1 })}</span>
                <span className="mt-2 text-xs text-muted-foreground">{t("prospeccao.kpi.tempo.caption")}</span>
              </CardContent>
            </Card>
          </section>

          {/* Evolução */}
          {evoLocalized.length > 0 && (
            <Card>
              <CardHeader><CardTitle>{t("prospeccao.evolucao.title")}</CardTitle></CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={evoLocalized} margin={{ right: 16, top: 8 }}>
                    <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="2 4" vertical={false} />
                    <XAxis dataKey="mesLabel" tickLine={false} axisLine={false} tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} />
                    <YAxis yAxisId="l" tickLine={false} axisLine={false} tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }} allowDecimals={false} width={40} />
                    <YAxis yAxisId="r" orientation="right" tickLine={false} axisLine={false} tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }} tickFormatter={(v) => `${v}%`} width={40} />
                    <Tooltip contentStyle={{ background: "hsl(var(--surface-elevated))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Line yAxisId="l" type="monotone" dataKey="criados" stroke="hsl(var(--accent))" name={t("prospeccao.chart.criados")} strokeWidth={2} dot={false} />
                    <Line yAxisId="l" type="monotone" dataKey="confirmados" stroke="hsl(var(--positive))" name={t("prospeccao.chart.confirmados")} strokeWidth={2} dot={false} />
                    <Line yAxisId="r" type="monotone" dataKey="taxa" stroke="hsl(var(--warning))" name={t("prospeccao.chart.taxa")} strokeDasharray="5 5" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}

          {/* Vendedores: gráfico + tabela */}
          {vendedores.length > 0 && (
            <section className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              <Card>
                <CardHeader><CardTitle>{t("prospeccao.vendedores.title")}</CardTitle></CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={vendedores.slice(0, 10)} margin={{ right: 12, top: 8 }}>
                      <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="2 4" vertical={false} />
                      <XAxis dataKey="vendedor" tickLine={false} axisLine={false} tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }} angle={-30} textAnchor="end" height={70} interval={0} />
                      <YAxis tickLine={false} axisLine={false} tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }} allowDecimals={false} width={36} />
                      <Tooltip contentStyle={{ background: "hsl(var(--surface-elevated))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }} />
                      <Legend wrapperStyle={{ fontSize: 12 }} />
                      <Bar dataKey="total" fill="hsl(var(--accent))" name={t("prospeccao.col.total")} radius={[3, 3, 0, 0]} />
                      <Bar dataKey="confirmados" fill="hsl(var(--positive))" name={t("prospeccao.col.confirmed")} radius={[3, 3, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
              <Card>
                <CardHeader><CardTitle>{t("prospeccao.vendedores.title")}</CardTitle></CardHeader>
                <CardContent className="px-0">
                  <ScrollTable
                    head={[t("prospeccao.col.seller"), t("prospeccao.col.total"), t("prospeccao.col.confirmed"), t("prospeccao.col.rate"), t("prospeccao.col.value")]}
                    rows={vendedores.map((v) => [
                      <span className="font-medium" key="n">{v.vendedor}</span>,
                      formatNumber(v.total),
                      <span className="text-positive font-medium" key="c">{formatNumber(v.confirmados)}</span>,
                      formatPercent(v.taxa / 100, { decimals: 1 }),
                      money(v.valor),
                    ])}
                    align={["left", "right", "right", "right", "right"]}
                  />
                </CardContent>
              </Card>
            </section>
          )}

          {/* Produtos + Top clientes */}
          <section className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            {produtos.length > 0 && (
              <Card>
                <CardHeader><CardTitle>{t("prospeccao.produtos.title")}</CardTitle></CardHeader>
                <CardContent className="px-0">
                  <ScrollTable
                    head={[t("prospeccao.col.product"), t("prospeccao.col.proposed"), t("prospeccao.col.confirmed"), t("prospeccao.col.rate")]}
                    rows={produtos.map((p) => [
                      <span className="truncate block max-w-[220px]" key="p">{p.produto}</span>,
                      formatNumber(p.vezesProposto),
                      <span className="text-positive font-medium" key="c">{formatNumber(p.vezesConfirmado)}</span>,
                      <span className={cn("font-medium", p.taxa < 20 ? "text-negative" : p.taxa < 40 ? "text-warning" : "text-foreground")} key="t">{formatPercent(p.taxa / 100, { decimals: 1 })}</span>,
                    ])}
                    align={["left", "right", "right", "right"]}
                  />
                </CardContent>
              </Card>
            )}
            {clientes.length > 0 && (
              <Card>
                <CardHeader><CardTitle>{t("prospeccao.clientes.title")}</CardTitle></CardHeader>
                <CardContent className="px-0">
                  <ScrollTable
                    head={[t("prospeccao.col.client"), t("prospeccao.col.quotes"), t("prospeccao.col.confirmed"), t("prospeccao.col.value")]}
                    rows={clientes.map((c) => [
                      <span className="truncate block max-w-[220px] font-medium" key="c">{c.cliente}</span>,
                      formatNumber(c.orcamentos),
                      <span className="text-positive" key="cf">{formatNumber(c.confirmados)}</span>,
                      <span className="font-medium" key="v">{money(c.valor)}</span>,
                    ])}
                    align={["left", "right", "right", "right"]}
                  />
                </CardContent>
              </Card>
            )}
          </section>

          {/* Pendentes */}
          {pendentes.length > 0 && (
            <Card className="border-l-4 border-l-warning">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center gap-2">
                    <AlertCircle className="h-4 w-4 text-warning" />
                    {t("prospeccao.pendentes.title")}
                  </CardTitle>
                  <Badge variant="warning">{formatNumber(pendentes.length)}</Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-2">
                {pendentes.map((p) => (
                  <div key={p.orcamento_id} className="flex items-center justify-between rounded-md border border-border/60 bg-muted/20 p-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{p.cliente_nome}</p>
                      <p className="text-xs text-muted-foreground font-mono">{p.orcamento_id}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-sm font-medium tabular">{money(p.valor)}</p>
                      <p className="text-xs text-warning tabular">{formatNumber(p.dias)} {t("prospeccao.col.days")}</p>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}

function ScrollTable({
  head, rows, align,
}: {
  head: string[];
  rows: React.ReactNode[][];
  align: ("left" | "right")[];
}) {
  return (
    <div className="overflow-x-auto overflow-y-auto max-h-[420px]">
      <table className="w-full text-sm">
        <thead className="[&_th]:sticky [&_th]:top-0 [&_th]:z-10 [&_th]:bg-surface [&_th]:border-b [&_th]:border-border">
          <tr className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
            {head.map((h, i) => (
              <th key={i} className={cn("font-medium py-2 px-4", align[i] === "right" ? "text-right" : "text-left")}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.map((r, ri) => (
            <tr key={ri} className="hover:bg-muted/30 transition-colors">
              {r.map((cell, ci) => (
                <td key={ci} className={cn("py-2.5 px-4 tabular", align[ci] === "right" ? "text-right" : "text-left")}>{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
