"use client";

import * as React from "react";
import { useFilters } from "@/lib/store/filters";
import { leJson } from "@/lib/utils/resposta-json";

export interface FornecedorMetrica {
  id: string;
  name: string;
  orders: number;
  revenue: number;
  averageTicket: number;
  lastPurchaseDate: string | null;
  recencyDays: number;
  share: number;
  cumulativeShare: number;
  curve: "A" | "B" | "C";
}

export interface FornecedorOficial {
  supplierId: string;
  supplierName: string;
  productsCount: number;
}

interface RespostaApi {
  data: {
    topSuppliers: FornecedorMetrica[];
    totalSuppliers: number;
    totalRevenue: number;
    avgTicket: number;
    suppliersCount: number;
    officialSuppliers: FornecedorOficial[];
    hasData: boolean;
  };
  ms: number;
}

export interface FornecedoresView {
  topSuppliers: FornecedorMetrica[];
  totalSuppliers: number;
  totalRevenue: number;
  avgTicket: number;
  suppliersCount: number;
  officialSuppliers: FornecedorOficial[];
  hasData: boolean;
}

function iso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function useFornecedoresAnalytics(): {
  data: FornecedoresView | null;
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

    fetch("/api/analytics/fornecedores", {
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

  const data = React.useMemo<FornecedoresView | null>(() => {
    if (!resposta) return null;
    return resposta.data;
  }, [resposta]);

  return { data, loading, error };
}
