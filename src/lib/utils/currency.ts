import type { CurrencyCode, ExchangeRate } from "@/lib/types";

export function convertFromBRL(
  amountBRL: number,
  target: CurrencyCode,
  rates: ExchangeRate[]
): number {
  if (target === "BRL") return amountBRL;
  const rate = rates.find((r) => r.code === target);
  if (!rate) return amountBRL;
  return amountBRL / rate.rateToBRL;
}

export function getCurrencySymbol(code: CurrencyCode, rates: ExchangeRate[]): string {
  return rates.find((r) => r.code === code)?.symbol ?? code;
}
