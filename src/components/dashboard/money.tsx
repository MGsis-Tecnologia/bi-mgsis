"use client";

import { useMoedaExibicao } from "@/lib/hooks/use-moeda-exibicao";
import { formatCurrency } from "@/lib/utils/format";

interface MoneyProps {
  value: number;
  compact?: boolean;
}

/** Renders a monetary value in the currently selected display currency. */
export function Money({ value, compact }: MoneyProps) {
  const currency = useMoedaExibicao();
  return <>{formatCurrency(value, currency, { compact })}</>;
}
