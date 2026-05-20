"use client";

import * as React from "react";
import { Filter, X } from "lucide-react";
import { useFilters } from "@/lib/store/filters";
import { useDataset } from "@/lib/hooks/use-dataset";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { useTranslation } from "@/lib/hooks/use-translation";

const REGION_LABELS: Record<string, string> = {
  sudeste: "Sudeste",
  sul: "Sul",
  "centro-oeste": "Centro-Oeste",
  nordeste: "Nordeste",
  norte: "Norte",
};

const CHANNEL_LABELS: Record<string, string> = {
  ecommerce: "E-commerce",
  marketplace: "Marketplace",
  "loja-fisica": "Loja física",
  b2b: "B2B",
  telemarketing: "Telemarketing",
};

const CATEGORY_LABELS: Record<string, string> = {
  eletronicos: "Eletrônicos",
  moda: "Moda",
  "casa-decoracao": "Casa & Decoração",
  "esporte-lazer": "Esporte & Lazer",
  "beleza-saude": "Beleza & Saúde",
  "alimentos-bebidas": "Alimentos & Bebidas",
  "livros-midia": "Livros & Mídia",
};

export function GlobalFilters() {
  const { t } = useTranslation();
  const region = useFilters((s) => s.region);
  const channel = useFilters((s) => s.channel);
  const sellerId = useFilters((s) => s.sellerId);
  const categoryId = useFilters((s) => s.categoryId);
  const setRegion = useFilters((s) => s.setRegion);
  const setChannel = useFilters((s) => s.setChannel);
  const setSeller = useFilters((s) => s.setSeller);
  const setCategory = useFilters((s) => s.setCategory);
  const reset = useFilters((s) => s.resetFilters);
  const ds = useDataset();

  const activeCount =
    (region !== "all" ? 1 : 0) +
    (channel !== "all" ? 1 : 0) +
    (sellerId !== "all" ? 1 : 0) +
    (categoryId !== "all" ? 1 : 0);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-surface px-2.5 text-xs font-medium hover:bg-muted/40 transition-colors">
          <Filter className="h-3.5 w-3.5 text-muted-foreground" />
          <span>{t("filters.global.button")}</span>
          {activeCount > 0 && (
            <span className="ml-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-foreground px-1 text-[10px] font-medium text-background">
              {activeCount}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between border-b border-border px-3 py-2">
          <span className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
            {t("filters.global.title")}
          </span>
          {activeCount > 0 && (
            <button
              onClick={reset}
              className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
            >
              <X className="h-3 w-3" /> {t("filters.global.clear")}
            </button>
          )}
        </div>
        <div className="max-h-[460px] overflow-y-auto p-3 space-y-4">
          <FilterGroup
            label={t("filters.global.region")}
            value={region}
            onChange={(v) => setRegion(v as never)}
            options={[
              { value: "all", label: t("filters.global.all_fem") },
              ...Object.entries(REGION_LABELS).map(([v, l]) => ({ value: v, label: l })),
            ]}
          />
          <FilterGroup
            label={t("filters.global.channel")}
            value={channel}
            onChange={(v) => setChannel(v as never)}
            options={[
              { value: "all", label: t("filters.global.all_masc") },
              ...Object.entries(CHANNEL_LABELS).map(([v, l]) => ({ value: v, label: l })),
            ]}
          />
          <FilterGroup
            label={t("filters.global.category")}
            value={categoryId}
            onChange={(v) => setCategory(v)}
            options={[
              { value: "all", label: t("filters.global.all_fem") },
              ...Object.entries(CATEGORY_LABELS).map(([v, l]) => ({ value: v, label: l })),
            ]}
          />
          <div>
            <div className="pb-1.5 text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
              {t("filters.global.seller")}
            </div>
            <select
              value={sellerId}
              onChange={(e) => setSeller(e.target.value)}
              className="h-9 w-full rounded-md border border-border bg-surface px-3 text-sm"
            >
              <option value="all">{t("filters.global.all_sellers")}</option>
              {ds.sellers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.code} · {s.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function FilterGroup({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div>
      <div className="pb-1.5 text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
        {label}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {options.map((o) => (
          <button
            key={o.value}
            onClick={() => onChange(o.value)}
            className={cn(
              "rounded-full border px-2.5 py-1 text-[11px] transition-colors",
              value === o.value
                ? "border-foreground bg-foreground text-background"
                : "border-border bg-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}
