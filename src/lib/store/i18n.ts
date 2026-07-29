"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { setFormatLocale } from "@/lib/utils/format";

export type LanguageCode = "pt-BR" | "es-PY";

interface I18nState {
  language: LanguageCode;
  setLanguage: (lang: LanguageCode) => void;
}

export const useI18n = create<I18nState>()(
  persist(
    (set) => ({
      language: "pt-BR",
      setLanguage: (language) => {
        // Datas, moedas e números seguem o idioma escolhido (ver utils/format.ts)
        setFormatLocale(language);
        set({ language });
      },
    }),
    {
      name: "dash-bi-i18n",
      // Ao reidratar do localStorage o idioma pode não ser o padrão — o locale
      // dos formatadores precisa acompanhar antes da primeira renderização.
      onRehydrateStorage: () => (state) => {
        if (state?.language) setFormatLocale(state.language);
      },
    }
  )
);
