"use client";

import * as React from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import type { CustomerRFM, RFMSegment } from "@/lib/analytics/rfm";
import { getSegmentColor, getSegmentDescription } from "@/lib/analytics/rfm";
import { Badge } from "@/components/ui/badge";
import { useTranslation } from "@/lib/hooks/use-translation";

const SEGMENT_TRANSLATIONS: Record<RFMSegment, string> = {
  Champions: "Campeões",
  "Loyal Customers": "Clientes Leais",
  "Potential Loyalists": "Potenciais Leais",
  "New Customers": "Novos Clientes",
  "Need Attention": "Precisam Atenção",
  "At Risk": "Em Risco",
  "Cant Lose Them": "Não Perder",
  Lost: "Perdidos",
};

interface RFMSegmentsProps {
  rfmData: CustomerRFM[];
}

const SEGMENT_ORDER: RFMSegment[] = [
  "Champions",
  "Loyal Customers",
  "Potential Loyalists",
  "New Customers",
  "Need Attention",
  "At Risk",
  "Cant Lose Them",
  "Lost",
];

export function RFMSegments({ rfmData }: RFMSegmentsProps) {
  const { t } = useTranslation();
  const segmentCounts = React.useMemo(() => {
    const counts: Record<RFMSegment, number> = {
      Champions: 0,
      "Loyal Customers": 0,
      "Potential Loyalists": 0,
      "New Customers": 0,
      "Need Attention": 0,
      "At Risk": 0,
      "Cant Lose Them": 0,
      Lost: 0,
    };

    for (const customer of rfmData) {
      counts[customer.segment]++;
    }

    return SEGMENT_ORDER.map((segment) => ({
      segment,
      count: counts[segment],
      percentage: ((counts[segment] / rfmData.length) * 100).toFixed(1),
    })).filter((d) => d.count > 0);
  }, [rfmData]);

  const topSegmentByRevenue = React.useMemo(() => {
    const segmentRevenue: Record<RFMSegment, number> = {
      Champions: 0,
      "Loyal Customers": 0,
      "Potential Loyalists": 0,
      "New Customers": 0,
      "Need Attention": 0,
      "At Risk": 0,
      "Cant Lose Them": 0,
      Lost: 0,
    };

    for (const customer of rfmData) {
      segmentRevenue[customer.segment] += customer.monetary;
    }

    return Object.entries(segmentRevenue)
      .map(([segment, revenue]) => ({
        segment: segment as RFMSegment,
        revenue,
      }))
      .filter((d) => d.revenue > 0)
      .sort((a, b) => b.revenue - a.revenue)[0];
  }, [rfmData]);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-muted/30 rounded-lg p-4 space-y-1">
          <p className="text-xs text-muted-foreground">{t("vendas.rfm.total")}</p>
          <p className="text-2xl font-bold">{rfmData.length.toLocaleString()}</p>
        </div>
        <div className="bg-muted/30 rounded-lg p-4 space-y-1">
          <p className="text-xs text-muted-foreground">{t("vendas.rfm.champions")}</p>
          <p className="text-2xl font-bold">
            {rfmData.filter((c) => c.segment === "Champions").length}
          </p>
        </div>
        <div className="bg-muted/30 rounded-lg p-4 space-y-1">
          <p className="text-xs text-muted-foreground">{t("vendas.rfm.risk")}</p>
          <p className="text-2xl font-bold">
            {rfmData.filter((c) => c.segment === "At Risk").length}
          </p>
        </div>
        <div className="bg-muted/30 rounded-lg p-4 space-y-1">
          <p className="text-xs text-muted-foreground">{t("vendas.rfm.lost")}</p>
          <p className="text-2xl font-bold">
            {rfmData.filter((c) => c.segment === "Lost").length}
          </p>
        </div>
      </div>

      <div className="bg-white dark:bg-slate-950 rounded-lg p-4 border border-border">
        <h3 className="text-sm font-semibold mb-4">Clientes por Segmento</h3>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={segmentCounts.map((s) => ({ ...s, segment: SEGMENT_TRANSLATIONS[s.segment as RFMSegment] }))}>
            <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="2 4" vertical={false} />
            <XAxis
              dataKey="segment"
              tickLine={false}
              axisLine={false}
              tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }}
              angle={-45}
              textAnchor="end"
              height={80}
            />
            <YAxis tickLine={false} axisLine={false} tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }} />
            <Tooltip
              contentStyle={{
                backgroundColor: "hsl(var(--background))",
                border: "1px solid hsl(var(--border))",
                borderRadius: "6px",
              }}
            />
            <Bar dataKey="count" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {segmentCounts.map((item) => (
          <div key={item.segment} className="bg-muted/30 rounded-lg p-4 space-y-2">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-semibold">{SEGMENT_TRANSLATIONS[item.segment as RFMSegment]}</h4>
              <Badge style={{ backgroundColor: getSegmentColor(item.segment as RFMSegment) }}>
                {item.count}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground">{getSegmentDescription(item.segment as RFMSegment)}</p>
            <p className="text-xs text-muted-foreground">{item.percentage}% dos clientes</p>
          </div>
        ))}
      </div>
    </div>
  );
}
