"use client";

import { useFilters } from "@/lib/store/filters";
import { formatCurrency } from "@/lib/utils/format";

interface MoneyProps {
  value: number;
  compact?: boolean;
}

/** Renders a monetary value in the currently selected display currency. */
export function Money({ value, compact }: MoneyProps) {
  const currency = useFilters((s) => s.currency);
  return <>{formatCurrency(value, currency, { compact })}</>;
}
