"use client";

import * as React from "react";
import { useFilters } from "@/lib/store/filters";

/**
 * Dados da tela de Produtos, agregados no servidor.
 *
 * Curvas ABC, ranking por lucro e o quadro de categorias vêm prontos: o
 * navegador não recebe nenhuma linha de venda, só os recortes que a tela
 * desenha mais os totais calculados sobre a lista inteira.
 */

export interface ProdutoABC {
  id: string;
  name: string;
  subgroupName: string;
  manufacturerCode: string | null;
  units: number;
  revenue: number;
  share: number;
  cumulativeShare: number;
  curve: "A" | "B" | "C";
}

export interface SubgrupoABC {
  id: string;
  name: string;
  revenue: number;
  units: number;
  productCount: number;
  share: number;
  cumulativeShare: number;
  curve: "A" | "B" | "C";
}

export interface ProdutoLucro {
  productId: string;
  productName: string;
  subgroupName: string;
  manufacturerCode: string | null;
  units: number;
  revenue: number;
  cost: number;
  profit: number;
  marginPct: number;
}

export interface ProdutosView {
  topProducts: ProdutoABC[];
  curveCounts: { A: number; B: number; C: number };
  totals: { units: number; revenue: number };
  productsWithSales: number;
  totalProducts: number;
  subgroups: SubgrupoABC[];
  profitRanking: ProdutoLucro[];
  profitTotals: { units: number; revenue: number; cost: number; profit: number; count: number };
  /** Derivado dos subgrupos — mesma agregação que o donut usava. */
  donut: { key: string; label: string; value: number }[];
  hasData: boolean;
}

function iso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function useProdutosAnalytics(): {
  data: ProdutosView | null;
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

  const [resposta, setResposta] = React.useState<Omit<ProdutosView, "donut"> | null>(null);
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

    fetch("/api/analytics/produtos", {
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

  const data = React.useMemo<ProdutosView | null>(() => {
    if (!resposta) return null;
    return {
      ...resposta,
      // O donut usava `revenueBySubgroup`, que é a mesma soma por subgrupo já
      // presente em `subgroups` — não vale uma consulta a mais.
      donut: resposta.subgroups.map((s) => ({ key: s.id, label: s.name, value: s.revenue })),
    };
  }, [resposta]);

  return { data, loading, error };
}
