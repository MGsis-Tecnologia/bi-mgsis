"use client";

import * as React from "react";
import { useFilters } from "@/lib/store/filters";
import { useExchangeRates } from "@/lib/store/exchange-rates";
import type { AgingBucketId, GroupRow } from "@/lib/server/analytics/receber";

/**
 * Dados de Contas a Receber, agregados no servidor.
 *
 * Dois valores dependem do cliente e vão no pedido:
 *  - `hoje`, referência do atraso e do aging;
 *  - `aplicarLimiteSuperior`, verdadeiro só no período personalizado (os demais
 *    presets terminam hoje e esconderiam os títulos a vencer).
 */

export type { AgingBucketId, GroupRow };

export interface ReceberView {
  kpi: {
    total: number; overdue: number; overdueCount: number; upcoming: number;
    upcomingCount: number; overduePct: number; titlesCount: number;
    clientsCount: number; avgDaysOverdue: number; avgTicket: number;
    dueNext7: number; dueNext30: number;
  };
  aging: { id: AgingBucketId; total: number; count: number }[];
  clients: GroupRow[];
  sellers: GroupRow[];
  cities: GroupRow[];
  /** `label` do mês é formatado aqui, com o locale da tela. */
  timeline: { key: string; label: string; overdue: number; upcoming: number; total: number }[];
  detail: {
    documentId: string; clientId: string; clientName: string; sellerName: string;
    dueDate: string; amountBRL: number; status: "overdue" | "upcoming"; daysOverdue: number;
  }[];
  payStats: {
    totalReceived: number; totalPending: number; totalAll: number; collectionRate: number;
    paidCount: number; pendingCount: number; avgDelayDays: number; pctOnTime: number;
  };
  monthlyCollection: {
    key: string; label: string; received: number; pending: number; totalDue: number;
    collectionRate: number; avgDelayDays: number | null; paidCount: number;
  }[];
  clientPayment: {
    clientId: string; clientName: string; received: number; pending: number;
    totalDue: number; collectionRate: number; avgDelayDays: number | null;
    paidCount: number; pendingCount: number;
  }[];
  allRowsCount: number;
  pendingRowsCount: number;
  hasPaidData: boolean;
  hasData: boolean;
}

function iso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function monthLabel(key: string): string {
  const [y, m] = key.split("-");
  return new Intl.DateTimeFormat("pt-BR", { month: "short", year: "2-digit" }).format(
    new Date(Number(y), Number(m) - 1, 1)
  );
}

export function useReceberAnalytics(): {
  data: ReceberView | null;
  loading: boolean;
  error: string | null;
} {
  const preset = useFilters((s) => s.preset);
  const customRange = useFilters((s) => s.customRange);
  const currency = useFilters((s) => s.currency);
  const empresaId = useFilters((s) => s.empresaId);
  const sellerId = useFilters((s) => s.sellerId);
  const getRange = useFilters((s) => s.getRange);
  const rates = useExchangeRates((s) => s.rates);

  const [resposta, setResposta] = React.useState<Omit<ReceberView, "timeline" | "monthlyCollection"> & {
    timeline: { key: string; overdue: number; upcoming: number; total: number }[];
    monthlyCollection: Omit<ReceberView["monthlyCollection"][number], "label">[];
  } | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const range = React.useMemo(() => getRange(), [preset, customRange, getRange]);

  const corpo = React.useMemo(
    () => ({
      from: iso(range.from),
      to: iso(range.to),
      currency,
      rates,
      empresaId,
      sellerId,
      hoje: iso(new Date()),
      aplicarLimiteSuperior: preset === "custom",
    }),
    [range, currency, rates, empresaId, sellerId, preset]
  );

  React.useEffect(() => {
    const ctrl = new AbortController();
    setLoading(true);
    setError(null);

    fetch("/api/analytics/receber", {
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
  }, [corpo]);

  const data = React.useMemo<ReceberView | null>(() => {
    if (!resposta) return null;
    return {
      ...resposta,
      timeline: resposta.timeline.map((t) => ({ ...t, label: monthLabel(t.key) })),
      monthlyCollection: resposta.monthlyCollection.map((m) => ({ ...m, label: monthLabel(m.key) })),
    };
  }, [resposta]);

  return { data, loading, error };
}
