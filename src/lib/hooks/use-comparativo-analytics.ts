"use client";

import * as React from "react";
import { useFilters } from "@/lib/store/filters";

/**
 * Dados do Comparativo Anual, agregados no servidor.
 *
 * A dimensão é parte do pedido: trocar a aba refaz a consulta. Só empresa e
 * moeda entram como filtro — a tela ignora período, canal, vendedor e subgrupo.
 */

export type Dimensao = "vendedores" | "subgrupos" | "canais" | "clientes" | "produtos";

export interface LinhaAnual {
  key: string;
  label: string;
  byYear: Record<string, number>;
  /** "YYYY-MM" → receita. Entra na projeção, calculada no cliente. */
  byMonth: Record<string, number>;
  total: number;
  growth: number | null;
}

export interface ComparativoView {
  years: string[];
  rows: LinhaAnual[];
  hasData: boolean;
}

export function useComparativoAnalytics(dimensao: Dimensao): {
  data: ComparativoView | null;
  loading: boolean;
  error: string | null;
} {
  const currency = useFilters((s) => s.currency);
  const empresaId = useFilters((s) => s.empresaId);

  const [data, setData] = React.useState<ComparativoView | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const corpo = React.useMemo(
    () => ({ dimensao, currency, empresaId }),
    [dimensao, currency, empresaId]
  );

  React.useEffect(() => {
    const ctrl = new AbortController();
    setLoading(true);
    setError(null);

    fetch("/api/analytics/comparativo", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(corpo),
      signal: ctrl.signal,
    })
      .then(async (res) => {
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? `Erro ${res.status}`);
        setData(json as ComparativoView);
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
