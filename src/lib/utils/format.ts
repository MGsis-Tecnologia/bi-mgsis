import type { CurrencyCode } from "@/lib/types";

const CURRENCY_LOCALE: Record<CurrencyCode, string> = {
  BRL: "pt-BR",
  USD: "en-US",
  EUR: "de-DE",
  GBP: "en-GB",
};

export function formatCurrency(
  value: number,
  currency: CurrencyCode = "BRL",
  opts: { compact?: boolean; signed?: boolean } = {}
) {
  const { compact, signed } = opts;
  const formatter = new Intl.NumberFormat(CURRENCY_LOCALE[currency], {
    style: "currency",
    currency,
    notation: compact ? "compact" : "standard",
    maximumFractionDigits: compact ? 1 : 2,
    minimumFractionDigits: compact ? 0 : 2,
    signDisplay: signed ? "exceptZero" : "auto",
  });
  return formatter.format(value);
}

export function formatNumber(
  value: number,
  opts: { compact?: boolean; decimals?: number; signed?: boolean } = {}
) {
  const { compact, decimals = 0, signed } = opts;
  return new Intl.NumberFormat("pt-BR", {
    notation: compact ? "compact" : "standard",
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
    signDisplay: signed ? "exceptZero" : "auto",
  }).format(value);
}

export function formatPercent(value: number, opts: { decimals?: number; signed?: boolean } = {}) {
  const { decimals = 1, signed } = opts;
  return new Intl.NumberFormat("pt-BR", {
    style: "percent",
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
    signDisplay: signed ? "exceptZero" : "auto",
  }).format(value);
}

export function formatDate(date: Date | string, fmt: "short" | "long" | "month" | "day" = "short") {
  const d = typeof date === "string" ? new Date(date) : date;
  switch (fmt) {
    case "long":
      return new Intl.DateTimeFormat("pt-BR", {
        day: "2-digit",
        month: "long",
        year: "numeric",
      }).format(d);
    case "month":
      return new Intl.DateTimeFormat("pt-BR", { month: "short", year: "2-digit" }).format(d);
    case "day":
      return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short" }).format(d);
    default:
      return new Intl.DateTimeFormat("pt-BR").format(d);
  }
}

export function deltaLabel(current: number, previous: number) {
  if (previous === 0) return { pct: 0, direction: "flat" as const };
  const pct = (current - previous) / Math.abs(previous);
  return {
    pct,
    direction: pct > 0.005 ? ("up" as const) : pct < -0.005 ? ("down" as const) : ("flat" as const),
  };
}
