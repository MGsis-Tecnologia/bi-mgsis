"use client";

import * as React from "react";
import { leJson } from "@/lib/utils/resposta-json";
import { useFilters } from "@/lib/store/filters";

/**
 * Dados da tela de Clientes, agregados no servidor.
 *
 * A segmentação RFM depende de "hoje" — antes vinha de `Date.now()` no
 * navegador. A data local é enviada ao servidor para o cálculo de recência
 * continuar sendo o mesmo, independente do fuso de quem hospeda o banco.
 */

export type Segmento = "vip" | "fiel" | "promissor" | "novo" | "em-risco" | "inativo";

export interface ClienteMetrica {
  id: string;
  name: string;
  orders: number;
  revenue: number;
  averageTicket: number;
  lastPurchaseDate: string | null;
  recencyDays: number;
  ltv: number;
  segment: Segmento;
  share: number;
  cumulativeShare: number;
  curve: "A" | "B" | "C";
}

export interface ClienteLucro {
  clientId: string;
  clientName: string;
  orders: number;
  revenue: number;
  cost: number;
  profit: number;
  marginPct: number;
  avgTicket: number;
}

export interface ClientesView {
  topClients: ClienteMetrica[];
  segments: Record<string, number>;
  activeCustomers: number;
  totalRevenue: number;
  avgLTV: number;
  churnRisk: number;
  totalClients: number;
  profitRanking: ClienteLucro[];
  profitTotals: { orders: number; revenue: number; cost: number; profit: number; count: number };
  hasData: boolean;
}

function iso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function useClientesAnalytics(): {
  data: ClientesView | null;
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

  const [data, setData] = React.useState<ClientesView | null>(null);
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
      hoje: iso(new Date()),
    }),
    [range, currency, empresaId, channel, sellerId, subgroupId]
  );

  React.useEffect(() => {
    const ctrl = new AbortController();
    setLoading(true);
    setError(null);

    fetch("/api/analytics/clientes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(corpo),
      signal: ctrl.signal,
    })
      .then(async (res) => {
        setData(await leJson<ClientesView>(res));
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
