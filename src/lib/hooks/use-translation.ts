"use client";

import { useI18n } from "../store/i18n";
import { dictionaries, DictionaryKey } from "../i18n/dictionaries";

export function useTranslation() {
  const language = useI18n((s) => s.language);
  const dict = dictionaries[language];

  const t = (key: DictionaryKey, params?: Record<string, string | number>) => {
    let str = dict[key] || dictionaries["pt-BR"][key] || key;
    
    if (params) {
      Object.entries(params).forEach(([k, v]) => {
        str = str.replace(new RegExp(`{{${k}}}`, "g"), String(v));
      });
    }
    
    return str;
  };

  return { t, language };
}
