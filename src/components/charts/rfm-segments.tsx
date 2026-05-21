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
          <p className="text-xs text-muted-foreground">Total Customers</p>
          <p className="text-2xl font-bold">{rfmData.length.toLocaleString()}</p>
        </div>
        <div className="bg-muted/30 rounded-lg p-4 space-y-1">
          <p className="text-xs text-muted-foreground">Champions</p>
          <p className="text-2xl font-bold">
            {rfmData.filter((c) => c.segment === "Champions").length}
          </p>
        </div>
        <div className="bg-muted/30 rounded-lg p-4 space-y-1">
          <p className="text-xs text-muted-foreground">At Risk</p>
          <p className="text-2xl font-bold">
            {rfmData.filter((c) => c.segment === "At Risk").length}
          </p>
        </div>
        <div className="bg-muted/30 rounded-lg p-4 space-y-1">
          <p className="text-xs text-muted-foreground">Lost</p>
          <p className="text-2xl font-bold">
            {rfmData.filter((c) => c.segment === "Lost").length}
          </p>
        </div>
      </div>

      <div className="bg-white dark:bg-slate-950 rounded-lg p-4 border border-border">
        <h3 className="text-sm font-semibold mb-4">Customers by Segment</h3>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={segmentCounts}>
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
              <h4 className="text-sm font-semibold">{item.segment}</h4>
              <Badge style={{ backgroundColor: getSegmentColor(item.segment) }}>
                {item.count}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground">{getSegmentDescription(item.segment)}</p>
            <p className="text-xs text-muted-foreground">{item.percentage}% of customers</p>
          </div>
        ))}
      </div>
    </div>
  );
}
