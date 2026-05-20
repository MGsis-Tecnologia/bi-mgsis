"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

export type LanguageCode = "pt-BR" | "es-PY";

interface I18nState {
  language: LanguageCode;
  setLanguage: (lang: LanguageCode) => void;
}

export const useI18n = create<I18nState>()(
  persist(
    (set) => ({
      language: "pt-BR",
      setLanguage: (language) => set({ language }),
    }),
    {
      name: "dash-bi-i18n",
    }
  )
);
