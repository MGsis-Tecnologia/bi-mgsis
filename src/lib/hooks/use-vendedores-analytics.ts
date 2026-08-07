"use client";

import * as React from "react";
import { useFilters } from "@/lib/store/filters";
import { useExchangeRates } from "@/lib/store/exchange-rates";

/** Dados da tela de Vendedores, agregados no servidor. */

export interface VendedorMetrica {
  id: string;
  name: string;
  orders: number;
  revenue: number;
  averageTicket: number;
  marginPct: number;
  discount: number;
  discountPct: number;
  achievement: number;
  returns: number;
}

export interface VendedorProspeccao {
  id: string;
  name: string;
  activeClients: number;
  newClients: number;
  churnedClients: number;
  ticketNew: number;
  ticketOld: number;
  revenueNew: number;
  revenueOld: number;
}

export interface VendedorConsistencia {
  id: string;
  name: string;
  revenue: number;
  activeDays: number;
  operatingDays: number;
  dayCoverage: number;
  top1Pct: number;
  top3Pct: number;
  topClientPct: number;
  last5Pct: number;
  cv: number;
}

export interface VendedoresView {
  metrics: VendedorMetrica[];
  prospection: VendedorProspeccao[];
  consistency: VendedorConsistencia[];
  teamRevenue: number;
  totalReturns: number;
  avgAchievement: number;
  totalSellers: number;
  hasData: boolean;
}

function iso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function useVendedoresAnalytics(): {
  data: VendedoresView | null;
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
  const rates = useExchangeRates((s) => s.rates);

  const [data, setData] = React.useState<VendedoresView | null>(null);
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
      rates,
      empresaId,
      channel,
      sellerId,
      subgroupId,
    }),
    [range, currency, rates, empresaId, channel, sellerId, subgroupId]
  );

  React.useEffect(() => {
    const ctrl = new AbortController();
    setLoading(true);
    setError(null);

    fetch("/api/analytics/vendedores", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(corpo),
      signal: ctrl.signal,
    })
      .then(async (res) => {
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? `Erro ${res.status}`);
        setData(json as VendedoresView);
      })
      .catch((err: Error) => {
        if (err.name !== "AbortError") setError(err.message);
      })
      .finally(() => {
        if (!ctrl.signal.aborted) setLoading(false);
      });

    return () => ctrl.abort();
  }, [corpo]);

  return { data, loading, error };
}
