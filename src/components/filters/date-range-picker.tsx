"use client";

import * as React from "react";
import { Calendar as CalendarIcon } from "lucide-react";
import { useFilters } from "@/lib/store/filters";
import type { DatePreset } from "@/lib/types";
import { presetRange } from "@/lib/utils/dates";
import { formatDate } from "@/lib/utils/format";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { useTranslation } from "@/lib/hooks/use-translation";
import { DictionaryKey } from "@/lib/i18n/dictionaries";

const PRESETS: { value: DatePreset; labelKey: DictionaryKey; hideDate?: boolean }[] = [
  { value: "hoje",          labelKey: "filters.date.preset.today" },
  { value: "ontem",         labelKey: "filters.date.preset.yesterday" },
  { value: "7d",            labelKey: "filters.date.preset.7d" },
  { value: "30d",           labelKey: "filters.date.preset.30d" },
  { value: "mes-atual",     labelKey: "filters.date.preset.month" },
  { value: "mes-anterior",  labelKey: "filters.date.preset.prev_month" },
  { value: "ano-atual",     labelKey: "filters.date.preset.year" },
  { value: "ano-anterior",  labelKey: "filters.date.preset.prev_year" },
  { value: "12m",           labelKey: "filters.date.preset.12m" },
  { value: "todos",         labelKey: "filters.date.preset.all", hideDate: true },
];

export function DateRangePicker() {
  const { t } = useTranslation();
  const preset       = useFilters((s) => s.preset);
  const customRange  = useFilters((s) => s.customRange);
  const setPreset    = useFilters((s) => s.setPreset);
  const setCustomRange = useFilters((s) => s.setCustomRange);
  const [open, setOpen] = React.useState(false);

  // Local state for the custom inputs — initialised from store when preset=custom
  const [fromInput, setFromInput] = React.useState<string>(
    preset === "custom" && customRange ? customRange.from.slice(0, 10) : ""
  );
  const [toInput, setToInput] = React.useState<string>(
    preset === "custom" && customRange ? customRange.to.slice(0, 10) : ""
  );

  // Keep local inputs in sync with the active filter. When the preset isn't
  // "custom" the inputs must be cleared — otherwise stale typed values would
  // re-apply on blur and silently overwrite the chosen preset.
  React.useEffect(() => {
    if (preset === "custom" && customRange) {
      setFromInput(customRange.from.slice(0, 10));
      setToInput(customRange.to.slice(0, 10));
    } else {
      setFromInput("");
      setToInput("");
    }
  }, [preset, customRange]);

  // Apply custom range whenever both inputs are valid and complete.
  // Called only on Enter / blur — never on every keystroke — so a manually
  // typed date doesn't re-filter on each digit (e.g. years 0002, 0020, 2026…).
  function handleCustomChange(from: string, to: string) {
    if (!from || !to) return;
    const fromDate = new Date(from + "T00:00:00");
    const toDate   = new Date(to   + "T23:59:59");
    if (isNaN(fromDate.getTime()) || isNaN(toDate.getTime())) return;
    if (fromDate > toDate) return;
    setCustomRange({ from: fromDate, to: toDate });
  }

  function handleCustomKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      handleCustomChange(fromInput, toInput);
    }
  }

  const range = React.useMemo(() => {
    if (preset === "custom" && customRange) {
      return { from: new Date(customRange.from), to: new Date(customRange.to) };
    }
    return presetRange(preset);
  }, [preset, customRange]);

  const presetLabelKey = PRESETS.find((p) => p.value === preset)?.labelKey;
  const presetLabel    = presetLabelKey ? t(presetLabelKey) : t("filters.date.custom");

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button className="inline-flex h-8 items-center gap-2 rounded-md border border-border bg-surface px-2.5 text-xs font-medium hover:bg-muted/40 transition-colors">
          <CalendarIcon className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-foreground">{presetLabel}</span>
          {preset !== "todos" && (
            <span className="text-muted-foreground tabular">
              · {formatDate(range.from, "day")} → {formatDate(range.to, "day")}
            </span>
          )}
        </button>
      </PopoverTrigger>

      <PopoverContent className="w-64 p-2" align="start">
        {/* Presets */}
        <div className="px-1 pb-1 text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
          {t("filters.date.quick")}
        </div>
        <div className="grid grid-cols-1 gap-0.5">
          {PRESETS.map((p) => (
            <button
              key={p.value}
              onClick={() => { setPreset(p.value); setOpen(false); }}
              className={cn(
                "flex items-center justify-between rounded-sm px-2 py-1.5 text-sm transition-colors",
                preset === p.value
                  ? "bg-muted/70 text-foreground font-medium"
                  : "text-foreground hover:bg-muted/40"
              )}
            >
              <span>{t(p.labelKey)}</span>
              {!p.hideDate && (
                <span className="text-[10px] text-muted-foreground tabular">
                  {formatDate(presetRange(p.value).from, "day")}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Custom range */}
        <div className="mt-2 border-t border-border pt-2">
          <div className={cn(
            "rounded-sm px-2 py-1.5",
            preset === "custom" ? "bg-muted/70" : ""
          )}>
            <div className="pb-1.5 text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
              {t("filters.date.custom")}
            </div>
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center gap-2">
                <span className="w-10 shrink-0 text-[11px] text-muted-foreground">Início</span>
                <input
                  type="date"
                  value={fromInput}
                  onChange={(e) => setFromInput(e.target.value)}
                  onKeyDown={handleCustomKeyDown}
                  onBlur={() => handleCustomChange(fromInput, toInput)}
                  className="h-7 flex-1 rounded border border-border bg-surface px-2 text-xs text-foreground [color-scheme:dark] focus:outline-none focus:ring-1 focus:ring-accent"
                />
              </div>
              <div className="flex items-center gap-2">
                <span className="w-10 shrink-0 text-[11px] text-muted-foreground">Fim</span>
                <input
                  type="date"
                  value={toInput}
                  min={fromInput || undefined}
                  onChange={(e) => setToInput(e.target.value)}
                  onKeyDown={handleCustomKeyDown}
                  onBlur={() => handleCustomChange(fromInput, toInput)}
                  className="h-7 flex-1 rounded border border-border bg-surface px-2 text-xs text-foreground [color-scheme:dark] focus:outline-none focus:ring-1 focus:ring-accent"
                />
              </div>
              {preset === "custom" && customRange && (
                <p className="text-[10px] text-positive">
                  ✓ {formatDate(new Date(customRange.from), "day")} → {formatDate(new Date(customRange.to), "day")}
                </p>
              )}
            </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
