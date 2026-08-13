"use client";

import * as React from "react";
import { useFilters } from "@/lib/store/filters";
import type { DreData } from "@/lib/server/analytics/dre";
import type {
  CashflowKpis,
  CentroCustoRow,
  DreRow,
  ExpenseSlice,
  TimeSeriesRow,
} from "@/lib/analytics/cashflow";

/**
 * Dados de Caixa & DRE, agregados no servidor.
 *
 * A soma das linhas é do Postgres; a árvore da DRE e o corte das fatias
 * pequenas continuam aqui, porque operam sobre o agregado (dezenas de linhas)
 * e não sobre as movimentações.
 */

export interface DreView {
  kpis: CashflowKpis;
  series: (mode: "monthly" | "daily") => TimeSeriesRow[];
  dre: DreRow[];
  expenses: ExpenseSlice[];
  centrosCusto: CentroCustoRow[];
  hasData: boolean;
}

const MESES = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

function monthLabel(key: string): string {
  const [y, m] = key.split("-");
  return `${MESES[parseInt(m!, 10) - 1]}/${String(y!).slice(2)}`;
}

function dayLabel(key: string): string {
  const [, m, d] = key.split("-");
  return `${d}/${m}`;
}

function iso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function montaSerie(
  rows: { key: string; ingressos: number; gastos: number }[],
  mode: "monthly" | "daily"
): TimeSeriesRow[] {
  return rows.map((r) => ({
    key: r.key,
    label: mode === "monthly" ? monthLabel(r.key) : dayLabel(r.key),
    ingressos: r.ingressos,
    gastos: r.gastos,
    saldo: r.ingressos - r.gastos,
  }));
}

/** Mesma hierarquia de `buildDre`, agora sobre o agregado vindo do servidor. */
function montaDre(linhas: DreData["planoContas"]): DreRow[] {
  const flat: DreRow[] = linhas.map((agg) => ({
    planoContaId: agg.planoContaId,
    planoContaCodigo: agg.planoContaCodigo,
    planoContaDescricao: agg.planoContaDescricao,
    level: (agg.planoContaCodigo ? agg.planoContaCodigo.split(".") : ["?"]).length,
    ingressos: agg.ingressos,
    gastos: agg.gastos,
    saldo: agg.ingressos - agg.gastos,
    isParent: false,
  }));

  flat.sort((a, b) => a.planoContaCodigo.localeCompare(b.planoContaCodigo));

  for (const row of flat) {
    row.isParent = flat.some(
      (o) =>
        o.planoContaCodigo !== row.planoContaCodigo &&
        o.planoContaCodigo.startsWith(row.planoContaCodigo + ".")
    );
  }

  // Pai sem movimento próprio recebe a soma dos filhos.
  for (const row of flat) {
    if (!row.isParent || row.ingressos !== 0 || row.gastos !== 0) continue;
    for (const filho of flat) {
      if (
        filho.planoContaCodigo !== row.planoContaCodigo &&
        filho.planoContaCodigo.startsWith(row.planoContaCodigo + ".")
      ) {
        row.ingressos += filho.ingressos;
        row.gastos += filho.gastos;
      }
    }
    row.saldo = row.ingressos - row.gastos;
  }

  return flat.filter((r) => r.ingressos > 0 || r.gastos > 0 || r.isParent);
}

/** Contas abaixo de 4% do total viram uma fatia única, como em `expenseBreakdown`. */
const LIMIAR_FATIA = 0.04;

function montaGastos(linhas: DreData["gastosPorConta"]): ExpenseSlice[] {
  const total = linhas.reduce((s, l) => s + l.value, 0);
  if (total === 0) return [];

  const principais: ExpenseSlice[] = [];
  let outros = 0;
  for (const { name, value } of linhas) {
    if (value / total < LIMIAR_FATIA) outros += value;
    else principais.push({ name, value, pct: value / total });
  }
  if (outros > 0) {
    principais.push({ name: "GASTOS VÁRIOS", value: outros, pct: outros / total });
  }
  return principais.sort((a, b) => b.value - a.value);
}

export function useDreAnalytics(): {
  data: DreView | null;
  loading: boolean;
  error: string | null;
  recarregar: () => void;
} {
  const preset = useFilters((s) => s.preset);
  const customRange = useFilters((s) => s.customRange);
  const currency = useFilters((s) => s.currency);
  const empresaId = useFilters((s) => s.empresaId);
  const getRange = useFilters((s) => s.getRange);

  const [resposta, setResposta] = React.useState<DreData | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  // Permite à importação embutida na página buscar os dados recém-gravados.
  const [versao, setVersao] = React.useState(0);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const range = React.useMemo(() => getRange(), [preset, customRange, getRange]);

  const corpo = React.useMemo(
    () => ({ from: iso(range.from), to: iso(range.to), currency, empresaId }),
    [range, currency, empresaId]
  );

  React.useEffect(() => {
    const ctrl = new AbortController();
    setLoading(true);
    setError(null);

    fetch("/api/analytics/dre", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(corpo),
      signal: ctrl.signal,
    })
      .then(async (res) => {
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? `Erro ${res.status}`);
        setResposta(json);
      })
      .catch((err: Error) => {
        if (err.name !== "AbortError") setError(err.message);
      })
      .finally(() => {
        if (!ctrl.signal.aborted) setLoading(false);
      });

    return () => ctrl.abort();
  }, [corpo, versao]);

  const data = React.useMemo<DreView | null>(() => {
    if (!resposta) return null;
    const monthly = montaSerie(resposta.monthly, "monthly");
    const daily = montaSerie(resposta.daily, "daily");
    return {
      kpis: {
        ...resposta.kpis,
        // `count` do servidor conta as movimentações do período, como o original.
      },
      series: (mode) => (mode === "monthly" ? monthly : daily),
      dre: montaDre(resposta.planoContas),
      expenses: montaGastos(resposta.gastosPorConta),
      centrosCusto: resposta.centrosCusto.map((c) => ({ ...c, saldo: c.ingressos - c.gastos })),
      hasData: resposta.hasData,
    };
  }, [resposta]);

  const recarregar = React.useCallback(() => setVersao((v) => v + 1), []);

  return { data, loading, error, recarregar };
}
