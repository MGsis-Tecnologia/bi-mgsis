"use client";

import { useFilters } from "@/lib/store/filters";
import { convertFromBRL } from "@/lib/utils/currency";
import { EXCHANGE_RATES } from "@/lib/mock/seed";
import { formatCurrency } from "@/lib/utils/format";

interface MoneyProps {
  brl: number;
  compact?: boolean;
}

/** Reactively renders an amount in the user's chosen currency. */
export function Money({ brl, compact }: MoneyProps) {
  const currency = useFilters((s) => s.currency);
  const value = convertFromBRL(brl, currency, EXCHANGE_RATES);
  return <>{formatCurrency(value, currency, { compact })}</>;
}
