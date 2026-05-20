import type { AppCurrencyId } from "@/lib/types/dataset";

// R$ and US$: 2 decimal places, Brazilian locale
// G$: integer, no decimals, thousands with dot
export function formatCurrency(
  value: number,
  currencyId: AppCurrencyId | string = "ALL",
  opts: { compact?: boolean; signed?: boolean } = {}
): string {
  const { compact, signed } = opts;
  const sign = signed && value > 0 ? "+" : "";

  if (currencyId === "3") {
    // Guarani: integer only, no decimals
    const intVal = Math.round(value);
    const formatted = new Intl.NumberFormat("pt-BR", {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
      notation: compact ? "compact" : "standard",
    }).format(intVal);
    return `${sign}G$ ${formatted}`;
  }

  // R$ (1), US$ (2), ALL (base = R$)
  const symbol = currencyId === "2" ? "US$ " : "R$ ";
  const formatted = new Intl.NumberFormat("pt-BR", {
    minimumFractionDigits: compact ? 0 : 2,
    maximumFractionDigits: compact ? 1 : 2,
    notation: compact ? "compact" : "standard",
  }).format(value);
  return `${sign}${symbol}${formatted}`;
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
      return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "long", year: "numeric" }).format(d);
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
