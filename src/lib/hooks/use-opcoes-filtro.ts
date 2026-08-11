"use client";

import * as React from "react";
import { OPCOES_VAZIAS, type OpcoesFiltro } from "@/lib/types/filtros";

/**
 * Opções dos filtros globais, vindas do servidor.
 *
 * Substitui a derivação no navegador (`useDataset().channels/sellers/subgroups`
 * e `useEmpresas()`), que dependia do dataset inteiro carregado no store — e
 * por isso devolvia listas vazias em toda tela já migrada.
 *
 * O `GlobalFilters` e o `EmpresaSwitcher` ficam os dois no topbar, que é do
 * layout: sem a promessa compartilhada abaixo, os dois disparariam a mesma
 * requisição a cada montagem. Uma promessa por carga de página basta, porque a
 * lista só muda quando alguém importa — e aí a página recarrega de qualquer
 * forma.
 */
let pedido: Promise<OpcoesFiltro> | null = null;

function buscar(): Promise<OpcoesFiltro> {
  pedido ??= fetch("/api/filtros/opcoes", { cache: "no-store" })
    .then((r) => (r.ok ? r.json() : OPCOES_VAZIAS))
    .catch(() => OPCOES_VAZIAS);
  return pedido;
}

/** Esquece o que foi buscado — chamado depois de uma importação. */
export function invalidaOpcoesFiltro(): void {
  pedido = null;
}

export function useOpcoesFiltro(): OpcoesFiltro {
  const [opcoes, setOpcoes] = React.useState<OpcoesFiltro>(OPCOES_VAZIAS);

  React.useEffect(() => {
    let vivo = true;
    buscar().then((o) => {
      if (vivo) setOpcoes(o);
    });
    return () => {
      vivo = false;
    };
  }, []);

  return opcoes;
}
