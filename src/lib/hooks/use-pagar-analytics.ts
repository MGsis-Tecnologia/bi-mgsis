"use client";

import * as React from "react";
import { useFilters } from "@/lib/store/filters";
import { useExchangeRates } from "@/lib/store/exchange-rates";
import type { AgingBucketId, GroupRow } from "@/lib/server/analytics/pagar";

/**
 * Dados de Contas a Pagar, agregados no servidor.
 *
 * Mesmo contrato de `use-receber-analytics`, menos o filtro de vendedor — que
 * `payable_items` não tem.
 */

export type { AgingBucketId, GroupRow };

export interface PagarView {
  kpi: {
    total: number; overdue: number; overdueCount: number; upcoming: number;
    upcomingCount: number; overduePct: number; titlesCount: number;
    suppliersCount: number; avgDaysOverdue: number; avgTicket: number;
    dueNext7: number; dueNext30: number;
  };
  aging: { id: AgingBucketId; total: number; count: number }[];
  suppliers: GroupRow[];
  timeline: { key: string; label: string; overdue: number; upcoming: number; total: number }[];
  detail: {
    documentId: string; supplierId: string; supplierName: string;
    dueDate: string; amountBRL: number; status: "overdue" | "upcoming"; daysOverdue: number;
  }[];
  payStats: {
    totalPaid: number; totalPending: number; totalAll: number; paymentRate: number;
    paidCount: number; pendingCount: number; avgDelayDays: number; pctOnTime: number;
  };
  monthlyPayment: {
    key: string; label: string; paid: number; pending: number; totalDue: number;
    paymentRate: number; avgDelayDays: number | null; paidCount: number;
  }[];
  supplierPayment: {
    supplierId: string; supplierName: string; paid: number; pending: number;
    totalDue: number; paymentRate: number; avgDelayDays: number | null;
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

export function usePagarAnalytics(): {
  data: PagarView | null;
  loading: boolean;
  error: string | null;
} {
  const preset = useFilters((s) => s.preset);
  const customRange = useFilters((s) => s.customRange);
  const currency = useFilters((s) => s.currency);
  const empresaId = useFilters((s) => s.empresaId);
  const getRange = useFilters((s) => s.getRange);
  const rates = useExchangeRates((s) => s.rates);

  const [resposta, setResposta] = React.useState<
    | (Omit<PagarView, "timeline" | "monthlyPayment"> & {
        timeline: { key: string; overdue: number; upcoming: number; total: number }[];
        monthlyPayment: Omit<PagarView["monthlyPayment"][number], "label">[];
      })
    | null
  >(null);
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
      hoje: iso(new Date()),
      aplicarLimiteSuperior: preset === "custom",
    }),
    [range, currency, rates, empresaId, preset]
  );

  React.useEffect(() => {
    const ctrl = new AbortController();
    setLoading(true);
    setError(null);

    fetch("/api/analytics/pagar", {
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

  const data = React.useMemo<PagarView | null>(() => {
    if (!resposta) return null;
    return {
      ...resposta,
      timeline: resposta.timeline.map((t) => ({ ...t, label: monthLabel(t.key) })),
      monthlyPayment: resposta.monthlyPayment.map((m) => ({ ...m, label: monthLabel(m.key) })),
    };
  }, [resposta]);

  return { data, loading, error };
}
