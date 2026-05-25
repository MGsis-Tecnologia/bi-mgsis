import type { DatePreset, DateRange } from "@/lib/types";
import {
  endOfDay,
  endOfMonth,
  endOfYear,
  startOfDay,
  startOfMonth,
  startOfYear,
  subDays,
  subMonths,
  subYears,
} from "date-fns";

export function presetRange(preset: DatePreset): DateRange {
  const now = new Date();
  switch (preset) {
    case "hoje":
      return { from: startOfDay(now), to: endOfDay(now) };
    case "ontem": {
      const y = subDays(now, 1);
      return { from: startOfDay(y), to: endOfDay(y) };
    }
    case "7d":
      return { from: startOfDay(subDays(now, 6)), to: endOfDay(now) };
    case "30d":
      return { from: startOfDay(subDays(now, 29)), to: endOfDay(now) };
    case "mes-atual":
      return { from: startOfMonth(now), to: endOfDay(now) };
    case "mes-anterior": {
      const pm = subMonths(now, 1);
      return { from: startOfMonth(pm), to: endOfMonth(pm) };
    }
    case "ano-atual":
      return { from: startOfYear(now), to: endOfDay(now) };
    case "ano-anterior": {
      const py = subYears(now, 1);
      return { from: startOfYear(py), to: endOfYear(py) };
    }
    case "12m":
      return { from: startOfMonth(subMonths(now, 11)), to: endOfDay(now) };
    case "todos":
      return { from: new Date("2000-01-01T00:00:00"), to: new Date("2099-12-31T23:59:59") };
    default:
      return { from: startOfMonth(subMonths(now, 11)), to: endOfDay(now) };
  }
}

export function previousComparableRange(range: DateRange): DateRange {
  const ms = range.to.getTime() - range.from.getTime();
  return {
    from: new Date(range.from.getTime() - ms - 86400000),
    to: new Date(range.from.getTime() - 86400000),
  };
}

export function isInRange(iso: string, range: DateRange): boolean {
  const t = new Date(iso).getTime();
  return t >= range.from.getTime() && t <= range.to.getTime();
}

export function eachMonthKey(range: DateRange): string[] {
  const keys: string[] = [];
  const start = startOfMonth(range.from);
  const end = endOfMonth(range.to);
  const cur = new Date(start);
  while (cur <= end) {
    keys.push(`${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, "0")}`);
    cur.setMonth(cur.getMonth() + 1);
  }
  return keys;
}

export function eachDayKey(range: DateRange): string[] {
  const keys: string[] = [];
  const cur = startOfDay(range.from);
  const end = endOfDay(range.to);
  while (cur <= end) {
    keys.push(cur.toISOString().slice(0, 10));
    cur.setDate(cur.getDate() + 1);
  }
  return keys;
}
