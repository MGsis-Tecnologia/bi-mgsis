"use client";

import * as React from "react";
import { useDatasetStore } from "@/lib/store/dataset";
import { useExchangeRates } from "@/lib/store/exchange-rates";
import { useFilters } from "@/lib/store/filters";
import { buildProspeccao, EMPTY_RESUMO } from "@/lib/analytics/prospeccao";
import type { ProspeccaoResumo } from "@/lib/analytics/prospeccao";
import type { OrcamentoLineItem } from "@/lib/types/dataset";

const EMPTY_ITEMS: OrcamentoLineItem[] = [];

// Espelha useDataset/useFilteredOrders: lê o dataset já carregado no boot e
// recalcula por memo quando período, moeda, empresa ou câmbio mudam. Sem fetch,
// sem estado de loading — ao entrar na página os números já estão prontos.
export function useProspeccao(): ProspeccaoResumo {
  const items = useDatasetStore((s) => s.orcamento?.items ?? EMPTY_ITEMS);
  const inventory = useDatasetStore((s) => s.inventory);
  const currency = useFilters((s) => s.currency);
  const empresaId = useFilters((s) => s.empresaId);
  const preset = useFilters((s) => s.preset);
  const customRange = useFilters((s) => s.customRange);
  const getRange = useFilters((s) => s.getRange);
  const rates = useExchangeRates((s) => s.rates);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const range = React.useMemo(() => getRange(), [preset, customRange, getRange]);

  // Código do fabricante só existe no dataset de Estoque — mesmo lookup usado na
  // página de Produtos, aplicado aqui quando o arquivo de orçamentos não traz
  // a coluna produto_fabricante.
  const mfrByProduct = React.useMemo(() => {
    const m = new Map<string, string>();
    for (const it of inventory?.items ?? []) {
      if (it.manufacturerCode && !m.has(it.productId)) m.set(it.productId, it.manufacturerCode);
    }
    return m;
  }, [inventory?.items]);

  return React.useMemo(() => {
    if (items.length === 0) return EMPTY_RESUMO;
    return buildProspeccao(items, { range, currency, empresaId, rates, mfrByProduct });
  }, [items, range, currency, empresaId, rates, mfrByProduct]);
}
