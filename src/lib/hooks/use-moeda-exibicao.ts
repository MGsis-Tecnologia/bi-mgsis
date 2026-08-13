"use client";

import { useFilters } from "@/lib/store/filters";
import { useUsuario } from "@/components/providers/usuario-provider";
import type { AppCurrencyId } from "@/lib/types/dataset";

/**
 * Em que moeda os números da tela estão — para escrever o símbolo certo.
 *
 * Com uma moeda no filtro, é ela mesma: a consulta filtra por aquela moeda e
 * não converte nada. Com "todas as moedas", o servidor converteu tudo para a
 * moeda padrão da empresa (cotação do dia de cada linha, de `cambio_diario`),
 * então é o símbolo dela que vale.
 *
 * Antes disso, "todas" era escrito sempre como R$ — a conversão era feita no
 * navegador e sempre para real. Uma empresa paraguaia via os próprios totais
 * em reais.
 *
 * Isto é só rótulo. Quem converte é o servidor, e mudar o valor daqui não
 * muda número nenhum.
 */
export function useMoedaExibicao(): AppCurrencyId {
  const currency = useFilters((s) => s.currency);
  const usuario = useUsuario();
  if (currency !== "ALL") return currency;
  return (usuario?.moedaPadrao ?? "1") as AppCurrencyId;
}
