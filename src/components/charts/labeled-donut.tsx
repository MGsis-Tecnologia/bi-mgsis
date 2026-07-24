"use client";

import * as React from "react";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import type { AppCurrencyId } from "@/lib/types/dataset";
import { formatCurrency, formatNumber, formatPercent } from "@/lib/utils/format";

export interface DonutBucket {
  key: string;
  label: string;
  value: number;      // valor monetário da fatia
  count?: number;     // nº de itens (opcional — exibido entre parênteses)
  color: string;      // cor CSS, ex: "hsl(var(--chart-1))"
}

// Donut de categorias FIXAS (ordem e cores preservadas, sem agrupar em "Outros").
// Legenda mostra valor + % de cada fatia. Fatias com valor 0 aparecem na legenda
// (0%) mas não desenham arco.
export function LabeledDonut({
  data,
  currencyId,
  height = 240,
  centerLabel,
  centerValue,
}: {
  data: DonutBucket[];
  currencyId: AppCurrencyId | string;
  height?: number;
  centerLabel?: string;
  centerValue?: string;
}) {
  const total = data.reduce((s, d) => s + d.value, 0);
  // Arco dimensionado pelo valor ABSOLUTO — assim fatias com valor negativo
  // (ex.: estoque negativo/oversold) também aparecem no gráfico. A legenda e o
  // tooltip mantêm o valor real (com sinal) e o % sobre o total.
  const pieData = data
    .filter((d) => d.value !== 0)
    .map((d) => ({ ...d, arc: Math.abs(d.value) }));

  return (
    <div className="flex flex-col md:flex-row gap-5 md:items-center">
      <div className="relative shrink-0 mx-auto md:mx-0" style={{ height, width: height }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={pieData}
              dataKey="arc"
              nameKey="label"
              innerRadius="66%"
              outerRadius="92%"
              paddingAngle={1.5}
              stroke="hsl(var(--surface))"
              strokeWidth={1.5}
              startAngle={90}
              endAngle={-270}
            >
              {pieData.map((d) => (
                <Cell key={d.key} fill={d.color} />
              ))}
            </Pie>
            <Tooltip content={<DonutTip total={total} currencyId={currencyId} />} />
          </PieChart>
        </ResponsiveContainer>
        {(centerLabel || centerValue) && (
          <div className="absolute inset-0 grid place-items-center pointer-events-none text-center">
            <div>
              {centerLabel && (
                <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">{centerLabel}</div>
              )}
              {centerValue && (
                <div className="display-figure text-[22px] leading-tight">{centerValue}</div>
              )}
            </div>
          </div>
        )}
      </div>

      <div className="flex-1 md:pl-4 grid grid-cols-[max-content_max-content_max-content] gap-x-5 gap-y-1.5 items-center content-center">
        {data.map((d) => {
          const pct = total > 0 ? d.value / total : 0;
          return (
            <React.Fragment key={d.key}>
              <div className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-sm shrink-0" style={{ background: d.color }} />
                <span className="text-[14px]">{d.label}</span>
                {typeof d.count === "number" && (
                  <span className="text-[11.5px] text-muted-foreground">({formatNumber(d.count)})</span>
                )}
              </div>
              <span className="tabular text-[14px] text-muted-foreground text-right">
                {formatCurrency(d.value, currencyId, { compact: true })}
              </span>
              <span className="tabular text-[14px] font-medium text-right">
                {formatPercent(pct, { decimals: 1 })}
              </span>
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
}

interface TipPayloadItem {
  payload: DonutBucket;
}

function DonutTip({
  active,
  payload,
  total,
  currencyId,
}: {
  active?: boolean;
  payload?: TipPayloadItem[];
  total: number;
  currencyId: AppCurrencyId | string;
}) {
  if (!active || !payload || payload.length === 0) return null;
  const d = payload[0]!.payload;
  const pct = total > 0 ? d.value / total : 0;
  return (
    <div className="rounded-md border border-border bg-surface-elevated/95 px-3 py-2 text-xs shadow-xl shadow-foreground/10 backdrop-blur">
      <div className="flex items-center gap-2">
        <span className="h-2 w-2 rounded-full" style={{ background: d.color }} />
        <span className="font-medium text-foreground">{d.label}</span>
      </div>
      <div className="mt-1 text-muted-foreground tabular">
        {formatCurrency(d.value, currencyId, { compact: false })} · {formatPercent(pct, { decimals: 1 })}
        {typeof d.count === "number" ? ` · ${formatNumber(d.count)} SKU(s)` : ""}
      </div>
    </div>
  );
}
