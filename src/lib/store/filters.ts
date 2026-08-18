"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { AppCurrencyId } from "@/lib/types/dataset";
import type { DatePreset, DateRange } from "@/lib/types";
import { presetRange } from "@/lib/utils/dates";

interface FiltersState {
  preset: DatePreset;
  /**
   * Período personalizado, em data de CALENDÁRIO (`YYYY-MM-DD`) — nunca em
   * instante ISO.
   *
   * Guardar `Date.toISOString()` aqui trocava o dia: `31/12/2024 23:59:59` em
   * Assunção vira `2025-01-01T02:59:59Z`, e o campo do formulário, que relê o
   * texto guardado, passava a mostrar 01/01/2025. Pior que o cosmético: ao
   * confirmar de novo, o filtro andava mesmo um dia.
   *
   * "De 1º a 31 de dezembro" não tem fuso horário — é calendário. O fuso entra
   * só na hora de virar `Date`, em `getRange()`.
   */
  customRange: { from: string; to: string } | null;
  currency: AppCurrencyId;      // "1"|"2"|"3" = filter by that currency; "ALL" = all + convert to R$
  empresaId: string | "all";    // "all" = Todas as empresas; caso contrário o empresa_id exato
  channel: string | "all";      // "Atacado" | "Varejo" | "all"
  sellerId: string | "all";
  subgroupId: string | "all";   // replaces categoryId
  /**
   * Moeda padrão da empresa sob a qual o filtro atual foi inicializado.
   *
   * Existe para o `iniciaMoeda` saber a diferença entre "ainda não escolheram
   * nada nesta sessão" e "escolheram e eu não devo mexer". Sem essa marca, ou o
   * filtro nunca começaria na moeda da empresa, ou desfaria a escolha do
   * usuário a cada navegação.
   */
  moedaSessao: string | null;
  setPreset: (p: DatePreset) => void;
  /** Datas de calendário, `YYYY-MM-DD` — é o que o `<input type="date">` já dá. */
  setCustomRange: (r: { from: string; to: string }) => void;
  setCurrency: (c: AppCurrencyId) => void;
  setEmpresa: (id: string | "all") => void;
  setChannel: (c: string | "all") => void;
  setSeller: (id: string | "all") => void;
  setSubgroup: (id: string | "all") => void;
  /** Ao entrar: começa na moeda da empresa. Ver `MoedaInicial`. */
  iniciaMoeda: (padraoDaEmpresa: string) => void;
  /** Chamado no login para que a próxima carga volte à moeda da empresa. */
  esqueceMoedaDaSessao: () => void;
  resetFilters: () => void;
  getRange: () => DateRange;
}

export const useFilters = create<FiltersState>()(
  persist(
    (set, get) => ({
      preset: "mes-atual",
      customRange: null,
      currency: "ALL",
      empresaId: "all",
      channel: "all",
      sellerId: "all",
      subgroupId: "all",
      moedaSessao: null,
      setPreset: (preset) => set({ preset, customRange: null }),
      setCustomRange: ({ from, to }) => set({ preset: "custom", customRange: { from, to } }),
      setCurrency: (currency) => set({ currency }),
      setEmpresa: (empresaId) => set({ empresaId }),
      setChannel: (channel) => set({ channel }),
      setSeller: (sellerId) => set({ sellerId }),
      setSubgroup: (subgroupId) => set({ subgroupId }),
      iniciaMoeda: (padrao) => {
        // Só na primeira carga depois de entrar: com a marca já igual, quem
        // mandou é a escolha do usuário, inclusive se ele preferiu "Todas".
        if (get().moedaSessao === padrao) return;
        const valida = padrao === "1" || padrao === "2" || padrao === "3";
        set({
          moedaSessao: padrao,
          ...(valida ? { currency: padrao as AppCurrencyId } : {}),
        });
      },
      esqueceMoedaDaSessao: () => set({ moedaSessao: null }),
      resetFilters: () =>
        set({ preset: "mes-atual", customRange: null, channel: "all", sellerId: "all", subgroupId: "all" }),
      getRange: () => {
        const { preset, customRange } = get();
        if (preset === "custom" && customRange) {
          // `T00:00:00` e `T23:59:59` explícitos: sem a hora, o JS lê
          // "2024-12-31" como meia-noite UTC, que em fuso negativo é o dia 30
          // à noite — o mesmo erro de um dia, só que na direção oposta.
          return {
            from: new Date(`${customRange.from}T00:00:00`),
            to: new Date(`${customRange.to}T23:59:59`),
          };
        }
        return presetRange(preset);
      },
    }),
    {
      name: "mgsis-filters-v2",
      // preset e customRange NÃO são persistidos — a data sempre reinicia
      // com "mes-atual" ao abrir o app, evitando carregar 12 meses de dados.
      partialize: (s) => ({
        currency: s.currency,
        empresaId: s.empresaId,
        channel: s.channel,
        sellerId: s.sellerId,
        subgroupId: s.subgroupId,
        // Persistida junto: o login limpa a marca e recarrega a página, e é na
        // carga seguinte que a moeda da empresa é aplicada.
        moedaSessao: s.moedaSessao,
      }),
    }
  )
);
