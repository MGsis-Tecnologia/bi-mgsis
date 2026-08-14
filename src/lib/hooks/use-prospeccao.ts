"use client";

import * as React from "react";
import { useFilters } from "@/lib/store/filters";
import { EMPTY_RESUMO } from "@/lib/analytics/prospeccao";
import { leJson } from "@/lib/utils/resposta-json";
import type { ProspeccaoResumo } from "@/lib/analytics/prospeccao";

/**
 * Resumo de Prospecção, agregado no servidor a partir de `orcamento_items`.
 *
 * Antes o cálculo era feito no navegador sobre o dataset inteiro carregado no
 * boot. Agora chega pronto — só duas coisas ficam aqui, porque dependem do
 * relógio do navegador (mesma decisão da segmentação RFM em /clientes):
 *
 *  - `limitePerdido`: a data a partir da qual um orçamento em aberto conta como
 *    perdido (30 dias). Vai no pedido para o SQL classificar.
 *  - `dias` de cada pendente: calculado aqui a partir da data do orçamento.
 */

const DIAS_PARA_PERDIDO = 30;
const MS_DIA = 86_400_000;

interface RespostaApi extends Omit<ProspeccaoResumo, "pendentes"> {
  pendentes: { orcamento_id: string; cliente_nome: string; valor: number; data: string }[];
  ms: number;
}

function iso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function useProspeccao(): ProspeccaoResumo & { loading: boolean; error: string | null } {
  const currency = useFilters((s) => s.currency);
  const empresaId = useFilters((s) => s.empresaId);
  const preset = useFilters((s) => s.preset);
  const customRange = useFilters((s) => s.customRange);
  const getRange = useFilters((s) => s.getRange);

  const [resposta, setResposta] = React.useState<RespostaApi | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const range = React.useMemo(() => getRange(), [preset, customRange, getRange]);

  const corpo = React.useMemo(() => {
    // O original comparava `new Date(orcamentoData)` (meia-noite UTC) com
    // `Date.now() - 30 dias`. A data-limite equivalente é a data UTC desse
    // instante, e a comparação vira `data <= limite`.
    const limitePerdido = new Date(Date.now() - DIAS_PARA_PERDIDO * MS_DIA)
      .toISOString()
      .slice(0, 10);
    return {
      from: iso(range.from),
      to: iso(range.to),
      currency,
      empresaId,
      limitePerdido,
    };
  }, [range, currency, empresaId]);

  React.useEffect(() => {
    const ctrl = new AbortController();
    setLoading(true);
    setError(null);

    fetch("/api/analytics/prospeccao", {
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

  return React.useMemo(() => {
    if (!resposta) return { ...EMPTY_RESUMO, loading, error };
    const agora = Date.now();
    return {
      ...resposta,
      pendentes: resposta.pendentes.map((q) => ({
        orcamento_id: q.orcamento_id,
        cliente_nome: q.cliente_nome,
        valor: q.valor,
        // Mesma fórmula do original: `new Date("YYYY-MM-DD")` é meia-noite UTC.
        dias: Math.floor((agora - new Date(q.data).getTime()) / MS_DIA),
      })),
      loading,
      error,
    };
  }, [resposta, loading, error]);
}
