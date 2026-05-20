"use client";

import * as React from "react";
import { Check, ChevronDown } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useI18n, LanguageCode } from "@/lib/store/i18n";
import { useTranslation } from "@/lib/hooks/use-translation";

const LANGUAGES = [
  { code: "pt-BR", name: "Português", flag: "🇧🇷" },
  { code: "es-PY", name: "Español", flag: "🇵🇾" },
];

export function LanguageSwitcher() {
  const language = useI18n((s) => s.language);
  const setLanguage = useI18n((s) => s.setLanguage);
  const { t } = useTranslation();

  const currentLang = LANGUAGES.find((l) => l.code === language) || LANGUAGES[0];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-surface px-2.5 text-xs font-medium hover:bg-muted/40 transition-colors">
        <span className="text-sm">{currentLang.flag}</span>
        <span className="font-mono hidden md:inline-block">{currentLang.code.split('-')[0].toUpperCase()}</span>
        <ChevronDown className="h-3 w-3 opacity-60" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuLabel>{t("topbar.language.title")}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {LANGUAGES.map((l) => (
          <DropdownMenuItem
            key={l.code}
            onClick={() => setLanguage(l.code as LanguageCode)}
            className="flex items-center justify-between"
          >
            <span className="flex items-center gap-2">
              <span className="text-base">{l.flag}</span>
              <span className="text-muted-foreground">{l.name}</span>
            </span>
            {language === l.code && <Check className="h-3.5 w-3.5 text-foreground" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
