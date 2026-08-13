"use client";

import * as React from "react";
import { useFilters } from "@/lib/store/filters";
import { comparisonRange } from "@/lib/utils/dates";
import { insightsFromAggregates, type InsightInput } from "@/lib/analytics/insights-agg";
import type { Insight } from "@/lib/analytics/insights";

/**
 * O primeiro insight do período, para a sidebar.
 *
 * Antes rodava `generateInsights()` sobre a lista inteira de pedidos no
 * navegador; como a sidebar aparece em toda tela e o store saiu do caminho, o
 * cartão ficou vazio em quase todo lugar. Agora os números vêm agregados do
 * servidor e o texto é montado pelo MESMO módulo que o dashboard usa.
 *
 * Carrega depois da montagem, sem bloquear nada: é um cartão informativo, não
 * pode atrasar a navegação.
 */
function iso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function useInsightDoDia(): { insight: Insight | null; carregando: boolean } {
  const preset = useFilters((s) => s.preset);
  const customRange = useFilters((s) => s.customRange);
  const getRange = useFilters((s) => s.getRange);
  const currency = useFilters((s) => s.currency);
  const empresaId = useFilters((s) => s.empresaId);
  const channel = useFilters((s) => s.channel);
  const sellerId = useFilters((s) => s.sellerId);
  const subgroupId = useFilters((s) => s.subgroupId);

  const [dados, setDados] = React.useState<InsightInput | null>(null);
  const [carregando, setCarregando] = React.useState(true);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const range = React.useMemo(() => getRange(), [preset, customRange, getRange]);
  const cmp = React.useMemo(() => comparisonRange(preset, range), [preset, range]);

  const corpo = React.useMemo(
    () => ({
      from: iso(range.from),
      to: iso(range.to),
      cmpFrom: cmp ? iso(cmp.from) : null,
      cmpTo: cmp ? iso(cmp.to) : null,
      currency,
      empresaId,
      channel,
      sellerId,
      subgroupId,
    }),
    [range, cmp, currency, empresaId, channel, sellerId, subgroupId]
  );

  React.useEffect(() => {
    const ctrl = new AbortController();
    setCarregando(true);

    fetch("/api/analytics/insight", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(corpo),
      signal: ctrl.signal,
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => setDados(j as InsightInput | null))
      .catch(() => {
        /* cartão decorativo: falhar em silêncio é melhor que poluir a tela */
      })
      .finally(() => {
        if (!ctrl.signal.aborted) setCarregando(false);
      });

    return () => ctrl.abort();
  }, [corpo]);

  const insight = React.useMemo(() => {
    if (!dados) return null;
    return insightsFromAggregates(dados)[0] ?? null;
  }, [dados]);

  return { insight, carregando };
}
