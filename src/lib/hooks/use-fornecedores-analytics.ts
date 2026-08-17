"use client";

import * as React from "react";
import { useFilters } from "@/lib/store/filters";
import { leJson } from "@/lib/utils/resposta-json";

/**
 * Dados da tela de Fornecedores, agregados no servidor.
 *
 * O que o cliente ainda faz: agrupa a série mensal em trimestre e ano (é
 * aritmética sobre 12 pontos, não vale uma consulta a mais) e monta as fatias
 * do gráfico de participação, juntando a cauda em "Demais".
 */

export type Curva = "A" | "B" | "C";

export interface FornecedorMetrica {
  id: string;
  nome: string;
  pedidos: number;
  itens: number;
  valor: number;
  ticketMedio: number;
  ultimaCompra: string;
  share: number;
  shareAcumulado: number;
  curva: Curva;
  prazoDias: number | null;
  novo: boolean;
}

export interface CategoriaCompra {
  subgrupoId: string;
  subgrupo: string;
  valor: number;
  share: number;
  fornecedores: number;
}

export interface PontoPeriodo {
  key: string;
  valor: number;
  pedidos: number;
}

export interface CelulaAbc {
  produto: Curva;
  fornecedor: Curva;
  produtos: number;
  valor: number;
}

export interface VendaPorFornecedor {
  id: string;
  nome: string;
  comprado: number;
  vendido: number;
  produtos: number;
}

export interface FornecedoresKpis {
  totalComprado: number;
  pedidos: number;
  fornecedores: number;
  ticketMedio: number;
  shareTop1: number;
  shareTop2: number;
  shareTop5: number;
  hhi: number;
  novos: number;
  recorrentes: number;
  valorNovos: number;
  prazoMedioDias: number | null;
}

interface RespostaApi {
  kpis: FornecedoresKpis;
  mensal: PontoPeriodo[];
  mensalAnterior: PontoPeriodo[];
  fornecedores: FornecedorMetrica[];
  categorias: CategoriaCompra[];
  matrizAbc: CelulaAbc[];
  vendaPorFornecedor: VendaPorFornecedor[];
  hasData: boolean;
  ms: number;
}

export interface FatiaParticipacao {
  label: string;
  valor: number;
  share: number;
  /** true na fatia que junta a cauda. */
  demais: boolean;
}

export interface FornecedoresView extends RespostaApi {
  trimestral: PontoPeriodo[];
  anual: PontoPeriodo[];
  /** Mês a mês contra o mesmo mês do ano anterior. */
  anoAAno: { key: string; atual: number; anterior: number }[];
  participacao: FatiaParticipacao[];
}

/** Fatias nominais do gráfico de participação; o resto vira "Demais". */
const FATIAS = 8;

function agrupa(pontos: PontoPeriodo[], chave: (k: string) => string): PontoPeriodo[] {
  const mapa = new Map<string, PontoPeriodo>();
  for (const p of pontos) {
    const k = chave(p.key);
    const atual = mapa.get(k) ?? { key: k, valor: 0, pedidos: 0 };
    atual.valor += p.valor;
    // Pedidos são contagens distintas POR MÊS: somá-las conta duas vezes o
    // pedido que aparece em dois meses. Não acontece (um pedido tem uma data),
    // mas o rótulo do gráfico diz "pedidos no período" e é isso que ele é.
    atual.pedidos += p.pedidos;
    mapa.set(k, atual);
  }
  return [...mapa.values()].sort((a, b) => a.key.localeCompare(b.key));
}

export function useFornecedoresAnalytics(): {
  data: FornecedoresView | null;
  loading: boolean;
  error: string | null;
} {
  const preset = useFilters((s) => s.preset);
  const customRange = useFilters((s) => s.customRange);
  const currency = useFilters((s) => s.currency);
  const empresaId = useFilters((s) => s.empresaId);
  const subgroupId = useFilters((s) => s.subgroupId);
  const getRange = useFilters((s) => s.getRange);

  const [resposta, setResposta] = React.useState<RespostaApi | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const range = React.useMemo(() => getRange(), [preset, customRange, getRange]);

  const iso = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

  const corpo = React.useMemo(
    () => ({
      from: iso(range.from),
      to: iso(range.to),
      currency,
      empresaId,
      subgroupId,
    }),
    [range, currency, empresaId, subgroupId]
  );

  React.useEffect(() => {
    const ctrl = new AbortController();
    setLoading(true);
    setError(null);

    fetch("/api/analytics/fornecedores", {
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

  const data = React.useMemo<FornecedoresView | null>(() => {
    if (!resposta) return null;

    const trimestral = agrupa(resposta.mensal, (k) => {
      const [ano, mes] = k.split("-");
      return `${ano}-T${Math.ceil(Number(mes) / 3)}`;
    });
    const anual = agrupa(resposta.mensal, (k) => k.slice(0, 4));

    // O ano anterior vem com as chaves dele; o alinhamento é pelo MÊS.
    const anteriorPorMes = new Map(resposta.mensalAnterior.map((p) => [p.key.slice(5), p]));
    const anoAAno = resposta.mensal.map((p) => ({
      key: p.key,
      atual: p.valor,
      anterior: anteriorPorMes.get(p.key.slice(5))?.valor ?? 0,
    }));

    // Participação: as maiores em cheio, o resto somado. Sem isso a pizza fica
    // com centenas de fatias de 0,1% e não se lê nada.
    const total = resposta.kpis.totalComprado;
    const topo = resposta.fornecedores.slice(0, FATIAS);
    const somaTopo = topo.reduce((s, f) => s + f.valor, 0);
    const resto = total - somaTopo;
    const participacao: FatiaParticipacao[] = topo.map((f) => ({
      label: f.nome,
      valor: f.valor,
      share: f.share,
      demais: false,
    }));
    if (resto > 0.5) {
      participacao.push({
        label: `Demais (${Math.max(0, resposta.kpis.fornecedores - topo.length)})`,
        valor: resto,
        share: total > 0 ? resto / total : 0,
        demais: true,
      });
    }

    return { ...resposta, trimestral, anual, anoAAno, participacao };
  }, [resposta]);

  return { data, loading, error };
}
