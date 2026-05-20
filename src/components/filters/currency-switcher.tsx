"use client";

import * as React from "react";
import { Check, ChevronDown, RefreshCw } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useFilters } from "@/lib/store/filters";
import { useExchangeRates } from "@/lib/store/exchange-rates";
import { CURRENCY_OPTIONS } from "@/lib/types/dataset";
import type { AppCurrencyId } from "@/lib/types/dataset";

export function CurrencySwitcher() {
  const currency = useFilters((s) => s.currency);
  const setCurrency = useFilters((s) => s.setCurrency);
  const { fetchRates, isLoading, fetchError } = useExchangeRates();

  // Fetch rates on mount (no-op if cached)
  React.useEffect(() => { fetchRates(); }, [fetchRates]);

  const current = CURRENCY_OPTIONS.find((o) => o.id === currency) ?? CURRENCY_OPTIONS[3]!;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-surface px-2.5 text-xs font-medium hover:bg-muted/40 transition-colors">
        <span className="font-mono">{current.code}</span>
        <ChevronDown className="h-3 w-3 opacity-60" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuLabel>Moeda de exibição</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {CURRENCY_OPTIONS.map((opt) => (
          <DropdownMenuItem
            key={opt.id}
            onClick={() => setCurrency(opt.id as AppCurrencyId)}
            className="flex items-center justify-between"
          >
            <span className="flex items-center gap-2">
              <span className="font-mono text-foreground w-8">{opt.code}</span>
              <span className="text-muted-foreground">{opt.namePt}</span>
            </span>
            {currency === opt.id && <Check className="h-3.5 w-3.5 text-foreground" />}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <div className="px-2 py-1.5 flex items-center gap-1.5 text-[10px] text-muted-foreground">
          {isLoading
            ? <><RefreshCw className="h-3 w-3 animate-spin" /> Atualizando câmbio…</>
            : fetchError
            ? <span className="text-warning">{fetchError}</span>
            : <span>Todas as moedas convertem para R$.</span>
          }
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
