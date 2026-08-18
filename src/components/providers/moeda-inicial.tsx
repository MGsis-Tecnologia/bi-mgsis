"use client";

import * as React from "react";
import { useFilters } from "@/lib/store/filters";
import { useUsuario } from "./usuario-provider";

/**
 * Ao entrar, o filtro de moeda começa na moeda padrão da empresa.
 *
 * Antes começava sempre em "Todas as moedas", que é o pior estado inicial para
 * este cliente: em Compras e em Contas a Pagar há mais linhas em dólar do que
 * em guarani, e enquanto a conversão estiver como está, "Todas" soma dólar
 * como se fosse guarani. Começar na moeda da casa mostra um número que o ERP
 * confirma.
 *
 * Roda uma vez por login: `iniciaMoeda` compara com a marca guardada e não
 * mexe se o usuário já escolheu outra coisa — inclusive se escolheu "Todas".
 * O login limpa a marca, então a próxima entrada volta ao padrão da empresa.
 *
 * Não renderiza nada; é só o gancho, montado pelo layout do painel.
 */
export function MoedaInicial() {
  const moedaPadrao = useUsuario()?.moedaPadrao;
  const iniciaMoeda = useFilters((s) => s.iniciaMoeda);

  React.useEffect(() => {
    if (moedaPadrao) iniciaMoeda(moedaPadrao);
  }, [moedaPadrao, iniciaMoeda]);

  return null;
}
