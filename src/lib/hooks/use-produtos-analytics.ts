"use client";

import * as React from "react";
import { leJson } from "@/lib/utils/resposta-json";
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

export interface MarcaABC {
  id: string;
  /** "" = venda sem marca (marca_id vazio). */
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
  brands: MarcaABC[];
  profitRanking: ProdutoLucro[];
  profitTotals: { units: number; revenue: number; cost: number; profit: number; count: number };
  /** Derivado dos subgrupos — mesma agregação que o donut usava. */
  donut: { key: string; label: string; value: number }[];
  hasData: boolean;
}

function iso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Filtros que a tela mandou — as páginas seguintes das tabelas repetem os mesmos. */
export type FiltrosProdutos = Record<string, unknown>;

export function useProdutosAnalytics(): {
  data: ProdutosView | null;
  loading: boolean;
  error: string | null;
  /** O corpo do pedido atual; `null` até a primeira resposta. */
  filtros: FiltrosProdutos | null;
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
        setResposta(await leJson(res));
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

  return { data, loading, error, filtros: resposta ? corpo : null };
}

/** Linhas pedidas a cada página, depois da primeira (que já vem na tela). */
const LINHAS_POR_PAGINA = 50;

/**
 * Uma das tabelas grandes (ABC ou lucro), com carga por páginas.
 *
 * A primeira página já veio na resposta da tela (`primeira`); as seguintes são
 * pedidas ao servidor conforme o usuário rola, sempre com os MESMOS filtros da
 * tela. Trocar de filtro gera uma resposta nova — e portanto uma `primeira`
 * nova —, e isso descarta o que tinha sido acumulado.
 */
export function useProdutosPagina<T>(
  tabela: "abc" | "lucro",
  primeira: T[],
  total: number,
  filtros: FiltrosProdutos | null
): {
  rows: T[];
  total: number;
  hasMore: boolean;
  loadingMais: boolean;
  loadMore: () => void;
  error: string | null;
} {
  const [extra, setExtra] = React.useState<T[]>([]);
  const [loadingMais, setLoadingMais] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const ctrlRef = React.useRef<AbortController | null>(null);

  React.useEffect(() => {
    ctrlRef.current?.abort();
    // Funcional e só quando há o que limpar: um `[]` novo a cada render faria
    // este efeito reagendar a si mesmo.
    setExtra((atual) => (atual.length ? [] : atual));
    setLoadingMais(false);
    setError(null);
  }, [primeira]);

  const rows = React.useMemo(() => [...primeira, ...extra], [primeira, extra]);
  const hasMore = rows.length < total;

  const loadMore = React.useCallback(() => {
    if (loadingMais || !hasMore || !filtros) return;

    ctrlRef.current?.abort();
    const ctrl = new AbortController();
    ctrlRef.current = ctrl;
    setLoadingMais(true);
    setError(null);

    fetch("/api/analytics/produtos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...filtros, tabela, offset: rows.length, limite: LINHAS_POR_PAGINA }),
      signal: ctrl.signal,
    })
      .then((res) => leJson<{ rows: T[] }>(res))
      .then((r) => {
        if (!ctrl.signal.aborted) setExtra((atual) => [...atual, ...r.rows]);
      })
      .catch((err: Error) => {
        if (err.name !== "AbortError") setError(err.message);
      })
      .finally(() => {
        if (!ctrl.signal.aborted) setLoadingMais(false);
      });
  }, [loadingMais, hasMore, filtros, tabela, rows.length]);

  return { rows, total, hasMore, loadingMais, loadMore, error };
}

/** Um produto no drill-down de uma marca — curva LOCAL àquela marca, ver o servidor. */
export interface ProdutoDaMarca {
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

export interface ProdutosDaMarcaView {
  items: ProdutoDaMarca[];
  total: number;
  truncado: boolean;
}

/**
 * Produtos de UMA marca (Curva ABC por marca → clicar na linha para expandir).
 *
 * `marcaId === null` é "acordeão fechado": não busca nada. Guarda um cache em
 * memória por (filtros, marcaId) — fechar e reabrir a mesma marca, ou trocar
 * entre marcas já vistas, não refaz a consulta.
 */
export function useProdutosDaMarca(
  marcaId: string | null,
  filtros: FiltrosProdutos | null
): { data: ProdutosDaMarcaView | null; loading: boolean; error: string | null } {
  const [data, setData] = React.useState<ProdutosDaMarcaView | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const cacheRef = React.useRef(new Map<string, ProdutosDaMarcaView>());

  // Filtro novo invalida o cache inteiro: os números de cada marca mudam junto.
  const chaveFiltros = filtros ? JSON.stringify(filtros) : null;
  React.useEffect(() => {
    cacheRef.current.clear();
  }, [chaveFiltros]);

  React.useEffect(() => {
    setError(null);
    if (marcaId === null || !filtros) {
      setData(null);
      setLoading(false);
      return;
    }

    const chave = `${chaveFiltros}::${marcaId}`;
    const guardado = cacheRef.current.get(chave);
    if (guardado) {
      setData(guardado);
      setLoading(false);
      return;
    }

    const ctrl = new AbortController();
    setData(null);
    setLoading(true);

    fetch("/api/analytics/produtos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...filtros, tabela: "marca", marcaId }),
      signal: ctrl.signal,
    })
      .then((res) => leJson<ProdutosDaMarcaView>(res))
      .then((r) => {
        if (ctrl.signal.aborted) return;
        cacheRef.current.set(chave, r);
        setData(r);
      })
      .catch((err: Error) => {
        if (err.name !== "AbortError") setError(err.message);
      })
      .finally(() => {
        if (!ctrl.signal.aborted) setLoading(false);
      });

    return () => ctrl.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [marcaId, chaveFiltros]);

  return { data, loading, error };
}
