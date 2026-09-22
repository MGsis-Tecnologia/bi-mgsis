"use client";

import * as React from "react";
import { leJson } from "@/lib/utils/resposta-json";
import { useFilters } from "@/lib/store/filters";

/**
 * Dados da tela de Clientes, agregados no servidor.
 *
 * A segmentação RFM depende de "hoje" — antes vinha de `Date.now()` no
 * navegador. A data local é enviada ao servidor para o cálculo de recência
 * continuar sendo o mesmo, independente do fuso de quem hospeda o banco.
 *
 * Dois hooks:
 *  - `useClientesAnalytics` — a tela inteira: KPIs, gráficos e a PRIMEIRA
 *    página de cada uma das duas tabelas grandes (Base de Clientes e Clientes
 *    mais lucrativos).
 *  - `useClientesTabela`    — o resto de uma dessas tabelas, carregado
 *    conforme a rolagem, com busca por nome ou id.
 */

export type Segmento = "vip" | "fiel" | "promissor" | "novo" | "em-risco" | "inativo";

export interface ClienteMetrica {
  id: string;
  name: string;
  orders: number;
  revenue: number;
  averageTicket: number;
  lastPurchaseDate: string | null;
  recencyDays: number;
  ltv: number;
  segment: Segmento;
  share: number;
  cumulativeShare: number;
  curve: "A" | "B" | "C";
}

export interface ClienteLucro {
  clientId: string;
  clientName: string;
  orders: number;
  revenue: number;
  cost: number;
  profit: number;
  marginPct: number;
  avgTicket: number;
}

export interface ClientesView {
  /** Primeira página — a tabela completa vem de `useClientesTabela("base", ...)`. */
  topClients: ClienteMetrica[];
  segments: Record<string, number>;
  activeCustomers: number;
  totalRevenue: number;
  avgLTV: number;
  churnRisk: number;
  totalClients: number;
  /** Primeira página — a tabela completa vem de `useClientesTabela("lucro", ...)`. */
  profitRanking: ClienteLucro[];
  profitTotals: { orders: number; revenue: number; cost: number; profit: number; count: number };
  hasData: boolean;
}

/** Filtros que a tela mandou — as páginas seguintes das tabelas repetem os mesmos. */
export type FiltrosClientes = Record<string, unknown>;

function iso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

async function pede<T>(corpo: Record<string, unknown>, signal: AbortSignal): Promise<T> {
  const res = await fetch("/api/analytics/clientes", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(corpo),
    signal,
  });
  return leJson<T>(res);
}

export function useClientesAnalytics(): {
  data: ClientesView | null;
  loading: boolean;
  error: string | null;
  /** O corpo do pedido atual; `null` até a primeira resposta. */
  filtros: FiltrosClientes | null;
} {
  const preset = useFilters((s) => s.preset);
  const customRange = useFilters((s) => s.customRange);
  const currency = useFilters((s) => s.currency);
  const empresaId = useFilters((s) => s.empresaId);
  const channel = useFilters((s) => s.channel);
  const sellerId = useFilters((s) => s.sellerId);
  const subgroupId = useFilters((s) => s.subgroupId);
  const getRange = useFilters((s) => s.getRange);

  const [data, setData] = React.useState<ClientesView | null>(null);
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
      hoje: iso(new Date()),
    }),
    [range, currency, empresaId, channel, sellerId, subgroupId]
  );

  React.useEffect(() => {
    const ctrl = new AbortController();
    setLoading(true);
    setError(null);

    pede<ClientesView>(corpo, ctrl.signal)
      .then(setData)
      .catch((err: Error) => {
        if (err.name !== "AbortError") setError(err.message);
      })
      .finally(() => {
        if (!ctrl.signal.aborted) setLoading(false);
      });

    return () => ctrl.abort();
  }, [corpo]);

  return { data, loading, error, filtros: data ? corpo : null };
}

/** Linhas pedidas a cada página, depois da primeira (que já vem na tela). */
const LINHAS_POR_PAGINA = 30;

/**
 * Uma das tabelas grandes (Base de Clientes ou Clientes mais lucrativos), com
 * carga por páginas e busca por nome ou id.
 *
 * A primeira página já veio na resposta da tela (`primeira`): sem busca, é ela
 * que aparece, sem uma segunda ida ao servidor pedindo o que já chegou. Digitar
 * uma busca troca a população (é outro recorte), então refaz do zero contra o
 * servidor; apagar a busca volta a usar `primeira`.
 */
export function useClientesTabela<T>(
  tabela: "base" | "lucro",
  primeira: T[],
  totalPrimeira: number,
  filtros: FiltrosClientes | null,
  busca: string
): {
  rows: T[];
  total: number;
  loading: boolean;
  loadingMais: boolean;
  hasMore: boolean;
  loadMore: () => void;
  error: string | null;
} {
  const [rows, setRows] = React.useState<T[]>(primeira);
  const [total, setTotal] = React.useState(totalPrimeira);
  const [loading, setLoading] = React.useState(false);
  const [loadingMais, setLoadingMais] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const ctrlRef = React.useRef<AbortController | null>(null);

  // A busca corre no servidor: adiada em 300 ms para não disparar uma consulta
  // por tecla (mesmo padrão da busca de Estoque).
  const [buscaAdiada, setBuscaAdiada] = React.useState(busca);
  React.useEffect(() => {
    const t = setTimeout(() => setBuscaAdiada(busca), 300);
    return () => clearTimeout(t);
  }, [busca]);

  const buscaPagina = React.useCallback(
    async (offset: number) => {
      if (!filtros) return;
      const recarga = offset === 0;
      // Um pedido por vez: uma recarga (busca nova) descarta o que estava
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
        const r = await pede<{ rows: T[]; total: number }>(
          { ...filtros, tabela, busca: buscaAdiada, offset, limite: LINHAS_POR_PAGINA },
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
    [filtros, tabela, buscaAdiada]
  );

  // Sem busca: usa a página que já veio embutida na resposta principal — tanto
  // no primeiro carregamento quanto quando os filtros da tela mudam (nova
  // `primeira`) ou a busca é apagada. Com busca: refaz do zero, é outra população.
  React.useEffect(() => {
    ctrlRef.current?.abort();
    if (buscaAdiada === "") {
      setRows(primeira);
      setTotal(totalPrimeira);
      setLoading(false);
      setLoadingMais(false);
      setError(null);
    } else {
      void buscaPagina(0);
    }
    return () => ctrlRef.current?.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [buscaAdiada, primeira, totalPrimeira]);

  const hasMore = rows.length < total;
  const loadMore = React.useCallback(() => {
    if (loading || loadingMais || !hasMore) return;
    void buscaPagina(rows.length);
  }, [loading, loadingMais, hasMore, rows.length, buscaPagina]);

  return { rows, total, loading, loadingMais, hasMore, loadMore, error };
}
