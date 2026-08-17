"use client";

import * as React from "react";
import { useFilters } from "@/lib/store/filters";
import { eachDayKey, eachMonthKey } from "@/lib/utils/dates";
import { leJson } from "@/lib/utils/resposta-json";
import type { TimePoint } from "@/lib/analytics/timeseries";

interface SeriePonto {
  key: string;
  revenue: number;
  cost: number;
  profit: number;
  discount: number;
  orders: number;
}

export interface ComprasKpis {
  totalValue: number;
  itemsCount: number;
  averageValue: number;
  averageTicket: number;
  uniqueSuppliers: number;
  ordersCount: number;
}

export interface FornecedorCompra {
  supplier: string;
  currencyId: string;
  totalPurchases: number;
  orderCount: number;
}

export interface CompraRecente {
  id: string;
  supplierName: string;
  items: number;
  total: number;
  date: string;
}

interface RespostaApi {
  kpi: ComprasKpis;
  monthly: SeriePonto[];
  daily: SeriePonto[];
  yearly: SeriePonto[];
  heatmap: { weekday: number; week: number; value: number }[];
  suppliers: FornecedorCompra[];
  recentOrders: CompraRecente[];
  hasData: boolean;
  ms: number;
}

export interface ComprasView {
  kpi: ComprasKpis;
  monthly: TimePoint[];
  daily: TimePoint[];
  yearly: TimePoint[];
  heatmap: { matrix: number[][]; max: number };
  suppliers: FornecedorCompra[];
  maxValue: number;
  recentOrders: CompraRecente[];
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
    return {
      key: k,
      label: label(k),
      revenue,
      orders: p?.orders ?? 0,
      profit: p?.profit ?? 0,
      cost: p?.cost ?? 0,
      discount: 0,
      discountPct: 0,
    };
  });
}

export function useComprasAnalytics(): {
  data: ComprasView | null;
  loading: boolean;
  error: string | null;
} {
  const preset = useFilters((s) => s.preset);
  const customRange = useFilters((s) => s.customRange);
  const currency = useFilters((s) => s.currency);
  const empresaId = useFilters((s) => s.empresaId);
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
      channel: "all",
      sellerId: "all",
      subgroupId: "all",
    }),
    [range, currency, empresaId]
  );

  React.useEffect(() => {
    const ctrl = new AbortController();
    setLoading(true);
    setError(null);

    fetch("/api/analytics/compras", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(corpo),
      signal: ctrl.signal,
    })
      .then(async (res) => {
        setResposta(await leJson<RespostaApi>(res));
      })
      .catch((err: Error) => {
        if (err.name !== "AbortError") setError(err.message);
      })
      .finally(() => {
        if (!ctrl.signal.aborted) setLoading(false);
      });

    return () => ctrl.abort();
  }, [corpo]);

  const data = React.useMemo<ComprasView | null>(() => {
    if (!resposta) return null;
    const r = resposta;

    const matrix: number[][] = Array.from({ length: 7 }, () => Array(6).fill(0));
    let max = 0;
    for (const c of r.heatmap) {
      matrix[c.weekday]![c.week] = c.value;
      if (c.value > max) max = c.value;
    }

    const maxValue = Math.max(...r.suppliers.map((s) => s.totalPurchases), 0);

    return {
      kpi: r.kpi,
      monthly: densifica(r.monthly, eachMonthKey(range), monthLabel),
      daily: densifica(r.daily, eachDayKey(range), dayLabel),
      yearly: densifica(r.yearly, r.yearly.map((y) => y.key), (k) => k),
      heatmap: { matrix, max },
      suppliers: r.suppliers,
      maxValue,
      recentOrders: r.recentOrders,
      hasData: r.hasData,
    };
  }, [resposta, range]);

  return { data, loading, error };
}
