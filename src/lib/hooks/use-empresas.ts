"use client";

import * as React from "react";
import { useDatasetStore } from "@/lib/store/dataset";

export interface EmpresaOption {
  id: string;      // empresa_id vindo dos dados importados
}

// Coleta os empresa_id distintos presentes em qualquer dataset importado
// (vendas, receber, pagar, estoque, caixa, orçamentos) e os devolve ordenados.
// O filtro de empresa é global, por isso a lista precisa cobrir todas as áreas.
export function useEmpresas(): EmpresaOption[] {
  const dataset     = useDatasetStore((s) => s.dataset);
  const receivables = useDatasetStore((s) => s.receivables);
  const payables    = useDatasetStore((s) => s.payables);
  const inventory   = useDatasetStore((s) => s.inventory);
  const caixa       = useDatasetStore((s) => s.caixa);
  const orcamento   = useDatasetStore((s) => s.orcamento);

  return React.useMemo(() => {
    const ids = new Set<string>();
    for (const it of dataset?.items ?? [])     if (it.empresaId) ids.add(it.empresaId);
    for (const it of receivables?.items ?? []) if (it.empresaId) ids.add(it.empresaId);
    for (const it of payables?.items ?? [])    if (it.empresaId) ids.add(it.empresaId);
    for (const it of inventory?.items ?? [])   if (it.empresaId) ids.add(it.empresaId);
    for (const it of caixa?.items ?? [])       if (it.empresaId) ids.add(it.empresaId);
    for (const it of orcamento?.items ?? [])   if (it.empresaId) ids.add(it.empresaId);

    return [...ids]
      // ordena numericamente quando possível, senão alfabético
      .sort((a, b) => {
        const na = Number(a), nb = Number(b);
        if (!isNaN(na) && !isNaN(nb)) return na - nb;
        return a.localeCompare(b);
      })
      // Só o id — o rótulo é montado no idioma ativo por quem consome
      // (ver EmpresaSwitcher / chave filters.empresa.item).
      .map((id) => ({ id }));
  }, [dataset, receivables, payables, inventory, caixa, orcamento]);
}
