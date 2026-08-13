"use client";

import * as React from "react";
import { useFilters } from "@/lib/store/filters";
import { eachDayKey, eachMonthKey } from "@/lib/utils/dates";
import { aggregateSalesByCityFrom, getMaxSales, type CityMetrics } from "@/lib/analytics/geo-sales";
import type { TimePoint } from "@/lib/analytics/timeseries";

/**
 * Dados da tela de Análise de Vendas, agregados no servidor.
 *
 * Mesmo desenho do painel executivo: o servidor devolve números somados e as
 * séries esparsas; o cliente preenche os períodos vazios e formata os rótulos
 * com as funções que já existiam.
 */

interface SeriePonto {
  key: string;
  revenue: number;
  cost: number;
  profit: number;
  discount: number;
  orders: number;
}

export interface VendasKpis {
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
  ordersWithDiscount: number;
  pctOrdersWithDiscount: number;
}

export interface PedidoRecente {
  id: string;
  clientName: string;
  sellerName: string;
  channel: string;
  items: number;
  total: number;
  marginPct: number;
  date: string;
}

interface RespostaApi {
  kpi: VendasKpis;
  totalReturns: number;
  monthly: SeriePonto[];
  daily: SeriePonto[];
  yearly: SeriePonto[];
  heatmap: { weekday: number; week: number; value: number }[];
  channels: { key: string; label: string; value: number }[];
  cities: { city: string; currencyId: string; totalSales: number; orderCount: number }[];
  recentOrders: PedidoRecente[];
  hasData: boolean;
  ms: number;
}

export interface VendasView {
  kpi: VendasKpis;
  totalReturns: number;
  returnsPctOfSales: number;
  monthly: TimePoint[];
  daily: TimePoint[];
  yearly: TimePoint[];
  heatmap: { matrix: number[][]; max: number };
  channels: { key: string; label: string; value: number }[];
  cities: Record<string, CityMetrics>;
  maxSales: number;
  recentOrders: PedidoRecente[];
  hasData: boolean;
}

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

export function useVendasAnalytics(): {
  data: VendasView | null;
  loading: boolean;
  error: string | null;
} {
  const preset = useFilters((s) => s.preset);
  const customRange = useFilters((s) => s.customRange);
  const currency = useFilters((s) => s.currency);
  const empresaId = useFilters((s) => s.empresaId);
  const channel = useFilters((s) => s.channel);
  const sellerId = useFilters((s) => s.sellerId);
  const subgroupId = useFilters((s) => s.subgroupId);
  const getRange = useFilters((s) => s.getRange);

  const [resposta, setResposta] = React.useState<RespostaApi | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const range = React.useMemo(() => getRange(), [preset, customRange, getRange]);

  const corpo = React.useMemo(
    () => ({
      from: iso(range.from),
      to: iso(range.to),
      cmpFrom: null,
      cmpTo: null,
      currency,
      empresaId,
      channel,
      sellerId,
      subgroupId,
    }),
    [range, currency, empresaId, channel, sellerId, subgroupId]
  );

  React.useEffect(() => {
    const ctrl = new AbortController();
    setLoading(true);
    setError(null);

    fetch("/api/analytics/vendas", {
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

  const data = React.useMemo<VendasView | null>(() => {
    if (!resposta) return null;
    const r = resposta;

    const matrix: number[][] = Array.from({ length: 7 }, () => Array(6).fill(0));
    let max = 0;
    for (const c of r.heatmap) {
      matrix[c.weekday]![c.week] = c.value;
      if (c.value > max) max = c.value;
    }

    // Normalização de nome e geocodificação continuam aqui — agora sobre
    // algumas centenas de cidades, não sobre a lista inteira de pedidos.
    const cities = aggregateSalesByCityFrom(
      r.cities.map((c) => ({
        clientCity: c.city,
        currencyId: c.currencyId,
        totalBRL: c.totalSales,
        orderCount: c.orderCount,
      }))
    );

    return {
      kpi: r.kpi,
      totalReturns: r.totalReturns,
      returnsPctOfSales: r.kpi.revenue > 0 ? r.totalReturns / r.kpi.revenue : 0,
      monthly: densifica(r.monthly, eachMonthKey(range), monthLabel),
      daily: densifica(r.daily, eachDayKey(range), dayLabel),
      yearly: densifica(r.yearly, r.yearly.map((y) => y.key), (k) => k),
      heatmap: { matrix, max },
      channels: r.channels,
      cities,
      maxSales: getMaxSales(cities),
      recentOrders: r.recentOrders,
      hasData: r.hasData,
    };
  }, [resposta, range]);

  return { data, loading, error };
}
