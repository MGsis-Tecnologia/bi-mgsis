"use client";

import {
  AlertTriangle,
  Sparkles,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { Insight } from "@/lib/analytics/insights";

const TONE_STYLES: Record<
  Insight["tone"],
  { icon: React.ElementType; accent: string; badge: "positive" | "negative" | "warning" | "default" }
> = {
  positive: { icon: TrendingUp, accent: "text-positive", badge: "positive" },
  negative: { icon: TrendingDown, accent: "text-negative", badge: "negative" },
  warning: { icon: AlertTriangle, accent: "text-warning", badge: "warning" },
  neutral: { icon: Sparkles, accent: "text-accent", badge: "default" },
};

export function InsightCard({ insight, index = 0 }: { insight: Insight; index?: number }) {
  const { icon: Icon, accent, badge } = TONE_STYLES[insight.tone];
  return (
    <Card className={cn("p-4 reveal", `reveal-${Math.min(index + 1, 6)}`)}>
      <div className="flex items-start gap-3">
        <div
          className={cn(
            "mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-md border border-border bg-surface-sunken",
            accent
          )}
        >
          <Icon className="h-3.5 w-3.5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <h4 className="text-sm font-medium leading-snug text-foreground">
              {insight.title}
            </h4>
            {insight.metric && (
              <Badge variant={badge} className="shrink-0">
                {insight.metric}
              </Badge>
            )}
          </div>
          <p className="mt-1.5 text-[12.5px] leading-relaxed text-muted-foreground">
            {insight.body}
          </p>
        </div>
      </div>
    </Card>
  );
}
