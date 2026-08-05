"use client";

import * as React from "react";
import { useFilters } from "@/lib/store/filters";
import { useExchangeRates } from "@/lib/store/exchange-rates";
import { comparisonRange, eachDayKey, eachMonthKey } from "@/lib/utils/dates";
import { insightsFromAggregates } from "@/lib/analytics/insights-agg";
import type { Insight } from "@/lib/analytics/insights";
import type { TimePoint } from "@/lib/analytics/timeseries";
import type { ABCEntry } from "@/lib/analytics/abc";
import type { ImportedProduct } from "@/lib/types/dataset";

/**
 * Dados do painel executivo, agregados no servidor.
 *
 * Substitui o caminho antigo (store global com todas as linhas + cálculo em
 * JavaScript). Aqui trafegam algumas dezenas de KB de números já somados, em
 * vez de centenas de MB de linhas cruas.
 *
 * O servidor devolve as séries ESPARSAS: preencher os períodos vazios e montar
 * os rótulos continua sendo feito aqui, reaproveitando eachMonthKey/eachDayKey,
 * que é onde a formatação por locale já existe.
 */

interface SeriePonto {
  key: string;
  revenue: number;
  cost: number;
  profit: number;
  discount: number;
  orders: number;
}

interface Kpis {
  revenue: number;
  cost: number;
  profit: number;
  marginPct: number;
  ordersCount: number;
  averageTicket: number;
  uniqueCustomers: number;
  itemsSold: number;
  discount: number;
  discountPct: number;
}

interface RespostaApi {
  kpi: Kpis;
  previous: Kpis;
  monthly: SeriePonto[];
  daily: SeriePonto[];
  yearly: SeriePonto[];
  subgroups: { key: string; label: string; value: number }[];
  channels: { key: string; label: string; value: number }[];
  heatmap: { weekday: number; week: number; value: number }[];
  topProducts: {
    id: string; name: string; revenue: number; units: number;
    share: number; cumulativeShare: number; curve: "A" | "B" | "C";
  }[];
  topSellers: {
    id: string; name: string; revenue: number; orders: number;
    averageTicket: number; marginPct: number; achievement: number;
  }[];
  hasData: boolean;
  ms: number;
}

export interface KpiComDelta extends Kpis {
  previous: Kpis;
  delta: {
    revenue: number; profit: number; marginPct: number;
    ordersCount: number; averageTicket: number; uniqueCustomers: number;
  };
}

export interface DashboardView {
  kpi: KpiComDelta;
  monthly: TimePoint[];
  daily: TimePoint[];
  yearly: TimePoint[];
  insights: Insight[];
  heatmap: { matrix: number[][]; max: number };
  donutData: { key: string; label: string; value: number }[];
  channelRevenue: { key: string; label: string; value: number }[];
  topProducts: ABCEntry<ImportedProduct>[];
  topSellers: {
    seller: { id: string; name: string };
    revenue: number; orders: number; averageTicket: number;
    marginPct: number; achievement: number;
  }[];
  hasData: boolean;
}

const KPI_VAZIO: Kpis = {
  revenue: 0, cost: 0, profit: 0, marginPct: 0, ordersCount: 0,
  averageTicket: 0, uniqueCustomers: 0, itemsSold: 0, discount: 0, discountPct: 0,
};

function iso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function monthLabel(key: string): string {
  const [y, m] = key.split("-");
  return new Intl.DateTimeFormat("pt-BR", { month: "short" }).format(
    new Date(Number(y), Number(m) - 1, 1)
  );
}

function dayLabel(key: string): string {
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short" }).format(
    new Date(key + "T00:00:00")
  );
}

/** Completa os períodos sem movimento e aplica os rótulos. */
function densifica(
  pontos: SeriePonto[],
  chaves: string[],
  label: (k: string) => string
): TimePoint[] {
  const porChave = new Map(pontos.map((p) => [p.key, p]));
  return chaves.map((k) => {
    const p = porChave.get(k);
    const revenue = p?.revenue ?? 0;
    const discount = p?.discount ?? 0;
    return {
      key: k,
      label: label(k),
      revenue,
      orders: p?.orders ?? 0,
      profit: p?.profit ?? 0,
      cost: p?.cost ?? 0,
      discount,
      discountPct: revenue + discount > 0 ? discount / (revenue + discount) : 0,
    };
  });
}

const safeDelta = (a: number, b: number) => (b === 0 ? 0 : (a - b) / Math.abs(b));

export function useDashboardAnalytics(): {
  data: DashboardView | null;
  loading: boolean;
  error: string | null;
  ms: number | null;
} {
  const preset = useFilters((s) => s.preset);
  const customRange = useFilters((s) => s.customRange);
  const currency = useFilters((s) => s.currency);
  const empresaId = useFilters((s) => s.empresaId);
  const channel = useFilters((s) => s.channel);
  const sellerId = useFilters((s) => s.sellerId);
  const subgroupId = useFilters((s) => s.subgroupId);
  const getRange = useFilters((s) => s.getRange);
  const rates = useExchangeRates((s) => s.rates);

  const [resposta, setResposta] = React.useState<RespostaApi | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const range = React.useMemo(() => getRange(), [preset, customRange, getRange]);
  const cmp = React.useMemo(() => comparisonRange(preset, range), [preset, range]);

  const corpo = React.useMemo(
    () => ({
      from: iso(range.from),
      to: iso(range.to),
      cmpFrom: cmp ? iso(cmp.from) : null,
      cmpTo: cmp ? iso(cmp.to) : null,
      currency,
      rates,
      empresaId,
      channel,
      sellerId,
      subgroupId,
    }),
    [range, cmp, currency, rates, empresaId, channel, sellerId, subgroupId]
  );

  React.useEffect(() => {
    // Cancela a requisição anterior: trocar filtro rápido não pode deixar uma
    // resposta antiga chegar depois e sobrescrever a nova.
    const ctrl = new AbortController();
    setLoading(true);
    setError(null);

    fetch("/api/analytics/dashboard", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(corpo),
      signal: ctrl.signal,
    })
      .then(async (res) => {
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? `Erro ${res.status}`);
        setResposta(json as RespostaApi);
      })
      .catch((err: Error) => {
        if (err.name !== "AbortError") setError(err.message);
      })
      .finally(() => {
        if (!ctrl.signal.aborted) setLoading(false);
      });

    return () => ctrl.abort();
  }, [corpo]);

  const data = React.useMemo<DashboardView | null>(() => {
    if (!resposta) return null;
    const r = resposta;

    const monthly = densifica(r.monthly, eachMonthKey(range), monthLabel);
    const daily = densifica(r.daily, eachDayKey(range), dayLabel);
    // Anual não é preenchido por range de propósito — evita dezenas de anos
    // vazios no modo "Todos", igual ao comportamento atual.
    const yearly = densifica(
      r.yearly,
      r.yearly.map((y) => y.key),
      (k) => k
    );

    const matrix: number[][] = Array.from({ length: 7 }, () => Array(6).fill(0));
    let max = 0;
    for (const c of r.heatmap) {
      matrix[c.weekday]![c.week] = c.value;
      if (c.value > max) max = c.value;
    }

    const kpi: KpiComDelta = {
      ...r.kpi,
      previous: r.previous ?? KPI_VAZIO,
      delta: {
        revenue: safeDelta(r.kpi.revenue, r.previous.revenue),
        profit: safeDelta(r.kpi.profit, r.previous.profit),
        marginPct: r.kpi.marginPct - r.previous.marginPct,
        ordersCount: safeDelta(r.kpi.ordersCount, r.previous.ordersCount),
        averageTicket: safeDelta(r.kpi.averageTicket, r.previous.averageTicket),
        uniqueCustomers: safeDelta(r.kpi.uniqueCustomers, r.previous.uniqueCustomers),
      },
    };

    return {
      kpi,
      monthly,
      daily,
      yearly,
      insights: insightsFromAggregates({
        revenue: r.kpi.revenue,
        averageTicket: r.kpi.averageTicket,
        marginPct: r.kpi.marginPct,
        previousRevenue: r.previous.revenue,
        previousAverageTicket: r.previous.averageTicket,
        subgroups: r.subgroups,
        monthly,
      }),
      heatmap: { matrix, max },
      donutData: r.subgroups,
      channelRevenue: r.channels,
      topProducts: r.topProducts.map((p) => ({
        item: { id: p.id, name: p.name, subgroupId: "", subgroupName: "" },
        revenue: p.revenue,
        units: p.units,
        share: p.share,
        cumulativeShare: p.cumulativeShare,
        curve: p.curve,
      })),
      topSellers: r.topSellers.map((s) => ({
        seller: { id: s.id, name: s.name },
        revenue: s.revenue,
        orders: s.orders,
        averageTicket: s.averageTicket,
        marginPct: s.marginPct,
        achievement: s.achievement,
      })),
      hasData: r.hasData,
    };
  }, [resposta, range]);

  return { data, loading, error, ms: resposta?.ms ?? null };
}
