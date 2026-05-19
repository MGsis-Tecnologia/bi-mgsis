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
import { useFilters } from "@/lib/store/filters";
import type { CurrencyCode } from "@/lib/types";
import { EXCHANGE_RATES } from "@/lib/mock/seed";

export function CurrencySwitcher() {
  const currency = useFilters((s) => s.currency);
  const setCurrency = useFilters((s) => s.setCurrency);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-surface px-2.5 text-xs font-medium hover:bg-muted/40 transition-colors">
        <span className="font-mono">{currency}</span>
        <ChevronDown className="h-3 w-3 opacity-60" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>Moeda de exibição</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {EXCHANGE_RATES.map((r) => (
          <DropdownMenuItem
            key={r.code}
            onClick={() => setCurrency(r.code as CurrencyCode)}
            className="flex items-center justify-between"
          >
            <span className="flex items-center gap-2">
              <span className="font-mono text-foreground">{r.code}</span>
              <span className="text-muted-foreground">{r.name}</span>
            </span>
            <span className="flex items-center gap-2 text-[11px] tabular text-muted-foreground">
              {r.rateToBRL.toFixed(2)} R$
              {currency === r.code && <Check className="h-3.5 w-3.5 text-foreground" />}
            </span>
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <div className="px-2 py-1 text-[10px] text-muted-foreground">
          Taxas mock · arquitetura pronta para integração cambial.
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
