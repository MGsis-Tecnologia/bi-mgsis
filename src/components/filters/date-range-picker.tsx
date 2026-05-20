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

const PRESETS: { value: DatePreset; labelKey: DictionaryKey }[] = [
  { value: "hoje", labelKey: "filters.date.preset.today" },
  { value: "ontem", labelKey: "filters.date.preset.yesterday" },
  { value: "7d", labelKey: "filters.date.preset.7d" },
  { value: "30d", labelKey: "filters.date.preset.30d" },
  { value: "mes-atual", labelKey: "filters.date.preset.month" },
  { value: "ano-atual", labelKey: "filters.date.preset.year" },
  { value: "12m", labelKey: "filters.date.preset.12m" },
];

export function DateRangePicker() {
  const { t } = useTranslation();
  const preset = useFilters((s) => s.preset);
  const customRange = useFilters((s) => s.customRange);
  const setPreset = useFilters((s) => s.setPreset);
  const [open, setOpen] = React.useState(false);

  const range = React.useMemo(() => {
    if (preset === "custom" && customRange) {
      return { from: new Date(customRange.from), to: new Date(customRange.to) };
    }
    return presetRange(preset);
  }, [preset, customRange]);

  const presetLabelKey = PRESETS.find((p) => p.value === preset)?.labelKey;
  const presetLabel = presetLabelKey ? t(presetLabelKey) : t("filters.date.custom");

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button className="inline-flex h-8 items-center gap-2 rounded-md border border-border bg-surface px-2.5 text-xs font-medium hover:bg-muted/40 transition-colors">
          <CalendarIcon className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-foreground">{presetLabel}</span>
          <span className="text-muted-foreground tabular">
            · {formatDate(range.from, "day")} → {formatDate(range.to, "day")}
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-2" align="start">
        <div className="px-1 pb-1 text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
          {t("filters.date.quick")}
        </div>
        <div className="grid grid-cols-1 gap-0.5">
          {PRESETS.map((p) => (
            <button
              key={p.value}
              onClick={() => {
                setPreset(p.value);
                setOpen(false);
              }}
              className={cn(
                "flex items-center justify-between rounded-sm px-2 py-1.5 text-sm transition-colors",
                preset === p.value
                  ? "bg-muted/70 text-foreground font-medium"
                  : "text-foreground hover:bg-muted/40"
              )}
            >
              <span>{t(p.labelKey)}</span>
              <span className="text-[10px] text-muted-foreground tabular">
                {formatDate(presetRange(p.value).from, "day")}
              </span>
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
