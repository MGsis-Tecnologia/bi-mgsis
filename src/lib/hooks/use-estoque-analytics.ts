"use client";

import * as React from "react";
import { useFilters } from "@/lib/store/filters";
import type {
  EstoqueData,
  EstoqueRow as EstoqueRowServidor,
  StockStatus,
} from "@/lib/server/analytics/estoque";

/**
 * Dados da tela de Estoque, agregados no servidor.
 *
 * Diferente das outras telas, a busca por texto e o filtro de situação vão
 * junto no corpo da requisição: são 76.708 SKUs, não dá para filtrar no
 * navegador aquilo que o navegador não tem. A busca é adiada em 300 ms para
 * não disparar uma consulta por tecla.
 */

export type { StockStatus };

/**
 * Linha como a tela consome: `coverageDays` volta a ser `Infinity` (JSON não
 * transporta infinito, então o servidor manda `null`) e `daysSinceLastSale` é
 * calculado aqui, para o "há N dias" continuar saindo do relógio do navegador.
 */
export interface EstoqueRow extends Omit<EstoqueRowServidor, "coverageDays"> {
  coverageDays: number;
  daysSinceLastSale: number;
}

function paraTela(r: EstoqueRowServidor, agora: number): EstoqueRow {
  const ts = r.lastSaleDate ? new Date(r.lastSaleDate + "T00:00:00").getTime() : 0;
  return {
    ...r,
    coverageDays: r.coverageDays === null ? Number.POSITIVE_INFINITY : r.coverageDays,
    daysSinceLastSale:
      ts > 0
        ? Math.max(0, Math.floor((agora - ts) / 86400000))
        : Number.POSITIVE_INFINITY,
  };
}

const STATUS_LABEL: Record<StockStatus, string> = {
  rupture: "Ruptura",
  risk: "Em risco",
  normal: "Normal",
  excess: "Excesso",
  no_movement: "Sem giro",
};

const STATUS_ORDER: StockStatus[] = ["rupture", "risk", "normal", "excess", "no_movement"];

const COVERAGE_ORDER: { key: string; label: string }[] = [
  { key: "sem_cobertura", label: "Sem cobertura" },
  { key: "fora_analise", label: "Fora de análise" },
  { key: "ate_1", label: "Até 1 mês" },
  { key: "1_2", label: "1 a 2 meses" },
  { key: "2_4", label: "2 a 4 meses" },
  { key: "4_6", label: "4 a 6 meses" },
  { key: "6_12", label: "6 a 12 meses" },
  { key: "mais_12", label: "Mais de 12 meses" },
];

export function statusLabel(s: StockStatus): string {
  return STATUS_LABEL[s];
}

export interface EstoqueView
  extends Omit<
    EstoqueData,
    "statuses" | "coverage" | "movers" | "dormant" | "ruptureRisk" | "rows"
  > {
  statuses: { key: StockStatus; label: string; count: number; valueUSD: number }[];
  coverage: { key: string; label: string; count: number; valueUSD: number }[];
  movers: EstoqueRow[];
  dormant: EstoqueRow[];
  ruptureRisk: EstoqueRow[];
  rows: EstoqueRow[];
}

function iso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function useEstoqueAnalytics(opcoes: {
  status: StockStatus | "all";
  busca: string;
}): { data: EstoqueView | null; loading: boolean; error: string | null } {
  const preset = useFilters((s) => s.preset);
  const customRange = useFilters((s) => s.customRange);
  const currency = useFilters((s) => s.currency);
  const empresaId = useFilters((s) => s.empresaId);
  const channel = useFilters((s) => s.channel);
  const sellerId = useFilters((s) => s.sellerId);
  const subgroupId = useFilters((s) => s.subgroupId);
  const getRange = useFilters((s) => s.getRange);

  const [resposta, setResposta] = React.useState<EstoqueData | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  // Busca adiada: o usuário digita, a consulta só sai quando ele para.
  const [buscaAdiada, setBuscaAdiada] = React.useState(opcoes.busca);
  React.useEffect(() => {
    const t = setTimeout(() => setBuscaAdiada(opcoes.busca), 300);
    return () => clearTimeout(t);
  }, [opcoes.busca]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const range = React.useMemo(() => getRange(), [preset, customRange, getRange]);

  const corpo = React.useMemo(
    () => ({
      from: iso(range.from),
      to: iso(range.to),
      currency,
      empresaId,
      channel,
      sellerId,
      subgroupId,
      hoje: iso(new Date()),
      status: opcoes.status,
      busca: buscaAdiada,
      limite: 200,
    }),
    [range, currency, empresaId, channel, sellerId, subgroupId, opcoes.status, buscaAdiada]
  );

  React.useEffect(() => {
    const ctrl = new AbortController();
    setLoading(true);
    setError(null);

    fetch("/api/analytics/estoque", {
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

  const data = React.useMemo<EstoqueView | null>(() => {
    if (!resposta) return null;
    // O servidor devolve só as faixas com ocorrência; a tela desenha todas.
    const porStatus = new Map(resposta.statuses.map((s) => [s.key, s]));
    const porFaixa = new Map(resposta.coverage.map((c) => [c.key, c]));
    const agora = Date.now();
    const conv = (l: EstoqueRowServidor[]) => l.map((r) => paraTela(r, agora));
    return {
      ...resposta,
      movers: conv(resposta.movers),
      dormant: conv(resposta.dormant),
      ruptureRisk: conv(resposta.ruptureRisk),
      rows: conv(resposta.rows),
      statuses: STATUS_ORDER.map((k) => ({
        key: k,
        label: STATUS_LABEL[k],
        count: porStatus.get(k)?.count ?? 0,
        valueUSD: porStatus.get(k)?.valueUSD ?? 0,
      })),
      coverage: COVERAGE_ORDER.map((o) => ({
        key: o.key,
        label: o.label,
        count: porFaixa.get(o.key)?.count ?? 0,
        valueUSD: porFaixa.get(o.key)?.valueUSD ?? 0,
      })),
    };
  }, [resposta]);

  return { data, loading, error };
}
