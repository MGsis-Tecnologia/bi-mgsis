"use client";

import * as React from "react";
import { leJson } from "@/lib/utils/resposta-json";
import { useFilters } from "@/lib/store/filters";

/**
 * Dados do Comparativo Anual, agregados no servidor.
 *
 * A dimensão é parte do pedido: trocar a aba refaz a consulta. Só empresa e
 * moeda entram como filtro — a tela ignora período, canal, vendedor e subgrupo.
 *
 * Três hooks, um por parte da tela:
 *  - `useComparativoAnalytics` — os maiores itens, para o gráfico da visão geral;
 *  - `useComparativoLista`     — a tabela com TODOS os itens, carregada por
 *                                páginas conforme a rolagem;
 *  - `useComparativoItem`      — a série mensal do item clicado.
 */

export type Dimensao =
  | "vendedores" | "subgrupos" | "marcas" | "canais" | "clientes" | "produtos" | "fornecedores";

export interface LinhaAnual {
  key: string;
  label: string;
  /** Código do fabricante — só em produtos, e só quando o produto está no estoque. */
  mfr: string | null;
  byYear: Record<string, number>;
  total: number;
}

export interface ItemComparativo {
  key: string;
  label: string;
  mfr: string | null;
  byYear: Record<string, number>;
  /** "YYYY-MM" → receita. Entra na projeção, calculada no cliente. */
  byMonth: Record<string, number>;
  total: number;
}

export interface ComparativoView {
  years: string[];
  /** Só os maiores itens, para o gráfico — a tabela vem de `useComparativoLista`. */
  rows: LinhaAnual[];
  hasData: boolean;
}

/** Linhas por página da tabela. */
export const LINHAS_POR_PAGINA = 50;

/** Variação entre os dois últimos anos da BASE (não do item). */
export function crescimento(byYear: Record<string, number>, years: string[]): number | null {
  if (years.length < 2) return null;
  const ultimo = byYear[years[years.length - 1]!] ?? 0;
  const anterior = byYear[years[years.length - 2]!] ?? 0;
  return anterior > 0 ? (ultimo - anterior) / anterior : null;
}

async function pede<T>(corpo: Record<string, unknown>, signal: AbortSignal): Promise<T> {
  const res = await fetch("/api/analytics/comparativo", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(corpo),
    signal,
  });
  return leJson<T>(res);
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

  React.useEffect(() => {
    const ctrl = new AbortController();
    // Sem dado antigo na tela: trocar de aba mostraria, por um instante, o
    // gráfico da dimensão anterior sob o título da nova.
    setData(null);
    setLoading(true);
    setError(null);

    pede<ComparativoView>({ modo: "resumo", dimensao, currency, empresaId }, ctrl.signal)
      .then(setData)
      .catch((err: Error) => {
        if (err.name !== "AbortError") setError(err.message);
      })
      .finally(() => {
        if (!ctrl.signal.aborted) setLoading(false);
      });

    return () => ctrl.abort();
  }, [dimensao, currency, empresaId]);

  return { data, loading, error };
}

export interface OrdemLista {
  /** "total" · "nome" · um ano "YYYY". */
  ordem: string;
  direcao: "asc" | "desc";
}

export function useComparativoLista(
  dimensao: Dimensao,
  busca: string,
  { ordem, direcao }: OrdemLista
): {
  rows: LinhaAnual[];
  total: number;
  /** Primeira página (ou recarga por busca/ordem/dimensão) em andamento. */
  loading: boolean;
  loadingMais: boolean;
  hasMore: boolean;
  loadMore: () => void;
  error: string | null;
} {
  const currency = useFilters((s) => s.currency);
  const empresaId = useFilters((s) => s.empresaId);

  const [rows, setRows] = React.useState<LinhaAnual[]>([]);
  const [total, setTotal] = React.useState(0);
  const [loading, setLoading] = React.useState(true);
  const [loadingMais, setLoadingMais] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const ctrlRef = React.useRef<AbortController | null>(null);

  const buscaPagina = React.useCallback(
    async (offset: number) => {
      const recarga = offset === 0;
      // Um pedido por vez: uma recarga (busca/ordem nova) descarta o que estava
      // voando, senão a resposta velha chegaria depois e sobrescreveria a nova.
      ctrlRef.current?.abort();
      const ctrl = new AbortController();
      ctrlRef.current = ctrl;

      setError(null);
      if (recarga) {
        setRows([]);
        setLoading(true);
        setLoadingMais(false);
      } else {
        setLoadingMais(true);
      }

      try {
        const r = await pede<{ rows: LinhaAnual[]; total: number }>(
          {
            modo: "lista",
            dimensao,
            currency,
            empresaId,
            busca,
            ordem,
            direcao,
            offset,
            limite: LINHAS_POR_PAGINA,
          },
          ctrl.signal
        );
        if (ctrl.signal.aborted) return;
        setRows((atual) => (recarga ? r.rows : [...atual, ...r.rows]));
        setTotal(r.total);
      } catch (err) {
        if ((err as Error).name !== "AbortError") setError((err as Error).message);
      } finally {
        if (!ctrl.signal.aborted) {
          setLoading(false);
          setLoadingMais(false);
        }
      }
    },
    [dimensao, currency, empresaId, busca, ordem, direcao]
  );

  React.useEffect(() => {
    void buscaPagina(0);
    return () => ctrlRef.current?.abort();
  }, [buscaPagina]);

  const hasMore = rows.length < total;
  const loadMore = React.useCallback(() => {
    if (loading || loadingMais || !hasMore) return;
    void buscaPagina(rows.length);
  }, [loading, loadingMais, hasMore, rows.length, buscaPagina]);

  return { rows, total, loading, loadingMais, hasMore, loadMore, error };
}

export function useComparativoItem(
  dimensao: Dimensao,
  chave: string | null
): { item: ItemComparativo | null; loading: boolean; error: string | null } {
  const currency = useFilters((s) => s.currency);
  const empresaId = useFilters((s) => s.empresaId);

  const [item, setItem] = React.useState<ItemComparativo | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    setItem(null);
    setError(null);
    if (chave === null) {
      setLoading(false);
      return;
    }

    const ctrl = new AbortController();
    setLoading(true);

    pede<{ item: ItemComparativo | null }>(
      { modo: "item", dimensao, currency, empresaId, chave },
      ctrl.signal
    )
      .then((r) => setItem(r.item))
      .catch((err: Error) => {
        if (err.name !== "AbortError") setError(err.message);
      })
      .finally(() => {
        if (!ctrl.signal.aborted) setLoading(false);
      });

    return () => ctrl.abort();
  }, [dimensao, currency, empresaId, chave]);

  return { item, loading, error };
}
