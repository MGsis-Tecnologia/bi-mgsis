"use client";

import * as React from "react";
import {
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
} from "recharts";
import { ChartTooltip } from "./chart-tooltip";
import { useTranslation } from "@/lib/hooks/use-translation";

interface Slice {
  key: string;
  label: string;
  value: number;
}

interface Props {
  data: Slice[];
  centerLabel?: string;
  centerValue?: string;
  height?: number;
  showLegend?: boolean;
  isCurrency?: boolean;
  /** Máximo de fatias exibidas (incluindo "Outros"). Padrão: 6 */
  maxSlices?: number;
  /** Fatias abaixo deste percentual são agrupadas em "Outros". Padrão: 3% */
  minSharePct?: number;
}

const OTHERS_KEY = "__others__";
// Top N sempre exibido, mesmo abaixo do limite percentual
const ALWAYS_KEEP = 3;

const SLICE_COLORS = [
  "hsl(var(--chart-1))",
  "hsl(var(--chart-2))",
  "hsl(var(--chart-3))",
  "hsl(var(--chart-4))",
  "hsl(var(--chart-5))",
  "hsl(var(--chart-6))",
];
const OTHERS_COLOR = "hsl(var(--muted-foreground))";

interface ProcessedSlice extends Slice {
  groupedCount: number; // nº de categorias agrupadas (apenas na fatia "Outros")
}

export function DonutChart({
  data,
  centerLabel,
  centerValue,
  height = 240,
  showLegend = true,
  isCurrency = true,
  maxSlices = 6,
  minSharePct = 3,
}: Props) {
  const { t } = useTranslation();

  // Agrupa fatias pequenas/excedentes em "Outros" para o gráfico não ficar poluído
  const slices = React.useMemo<ProcessedSlice[]>(() => {
    const sorted = [...data]
      .filter((d) => d.value > 0)
      .sort((a, b) => b.value - a.value);
    const total = sorted.reduce((s, d) => s + d.value, 0);

    if (total <= 0 || sorted.length <= maxSlices) {
      return sorted.map((d) => ({ ...d, groupedCount: 0 }));
    }

    const main: ProcessedSlice[] = [];
    const rest: Slice[] = [];
    sorted.forEach((d, idx) => {
      const share = d.value / total;
      const hasRoom = main.length < maxSlices - 1;
      const forcedKeep = idx < ALWAYS_KEEP;
      if (hasRoom && (forcedKeep || share >= minSharePct / 100)) {
        main.push({ ...d, groupedCount: 0 });
      } else {
        rest.push(d);
      }
    });

    if (rest.length === 0) return main;
    // Não vale a pena criar "Outros" para uma única categoria
    if (rest.length === 1) return [...main, { ...rest[0]!, groupedCount: 0 }];

    return [
      ...main,
      {
        key: OTHERS_KEY,
        label: t("chart.donut.others"),
        value: rest.reduce((s, d) => s + d.value, 0),
        groupedCount: rest.length,
      },
    ];
  }, [data, maxSlices, minSharePct, t]);

  const total = slices.reduce((s, d) => s + d.value, 0);
  const colorFor = (slice: ProcessedSlice, i: number) =>
    slice.key === OTHERS_KEY ? OTHERS_COLOR : SLICE_COLORS[i % SLICE_COLORS.length];

  return (
    <div className="flex flex-col md:flex-row gap-4 md:items-center">
      <div className="relative" style={{ height, width: height }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={slices}
              dataKey="value"
              nameKey="label"
              innerRadius="68%"
              outerRadius="92%"
              paddingAngle={1.5}
              stroke="hsl(var(--surface))"
              strokeWidth={1.5}
              startAngle={90}
              endAngle={-270}
            >
              {slices.map((slice, i) => (
                <Cell key={slice.key} fill={colorFor(slice, i)} />
              ))}
            </Pie>
            <Tooltip content={<ChartTooltip showCurrency={isCurrency} />} />
          </PieChart>
        </ResponsiveContainer>
        {(centerLabel || centerValue) && (
          <div className="absolute inset-0 grid place-items-center pointer-events-none text-center">
            <div>
              {centerLabel && (
                <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                  {centerLabel}
                </div>
              )}
              {centerValue && (
                <div className="display-figure text-[28px] leading-tight">{centerValue}</div>
              )}
            </div>
          </div>
        )}
      </div>
      {showLegend && (
        <div className="flex-1 grid grid-cols-1 gap-1.5">
          {slices.map((d, i) => (
            <div key={d.key} className="flex items-center justify-between gap-3 py-1 group">
              <div className="flex items-center gap-2 min-w-0">
                <span
                  className="h-2.5 w-2.5 rounded-sm shrink-0"
                  style={{ background: colorFor(d, i) }}
                />
                <span className="truncate text-[12.5px]">{d.label}</span>
                {d.groupedCount > 0 && (
                  <span className="shrink-0 text-[10.5px] text-muted-foreground">
                    {t("chart.donut.othersDetail", { count: d.groupedCount })}
                  </span>
                )}
              </div>
              <div className="text-right shrink-0 tabular">
                <span className="text-[12.5px] font-medium">
                  {total > 0 ? ((d.value / total) * 100).toFixed(1) : "0"}%
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
