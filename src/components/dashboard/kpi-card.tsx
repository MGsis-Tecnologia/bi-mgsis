"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { DeltaPill } from "./delta-pill";

interface KpiCardProps {
  label: string;
  value: React.ReactNode;
  unit?: string;
  delta?: number;
  invertDelta?: boolean;
  caption?: string;
  spark?: React.ReactNode;
  accent?: "default" | "accent" | "positive" | "negative";
  className?: string;
  size?: "md" | "lg";
}

export function KpiCard({
  label,
  value,
  unit,
  delta,
  invertDelta,
  caption,
  spark,
  accent = "default",
  className,
  size = "md",
}: KpiCardProps) {
  return (
    <Card
      className={cn(
        "group relative overflow-hidden",
        "before:absolute before:left-0 before:top-0 before:h-px before:w-full before:bg-gradient-to-r",
        accent === "accent" && "before:from-accent/70 before:via-accent/20 before:to-transparent",
        accent === "positive" && "before:from-positive/70 before:via-positive/20 before:to-transparent",
        accent === "negative" && "before:from-negative/70 before:via-negative/20 before:to-transparent",
        accent === "default" && "before:from-foreground/30 before:via-border before:to-transparent",
        className
      )}
    >
      <div className="flex items-start justify-between p-5 pb-3">
        <div className="space-y-0.5">
          <div className="text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
            {label}
          </div>
          {caption && (
            <div className="text-[11px] text-muted-foreground/80">{caption}</div>
          )}
        </div>
        {delta !== undefined && <DeltaPill value={delta} invert={invertDelta} />}
      </div>

      <div className="px-5 pb-2 flex items-baseline gap-2">
        <span
          className={cn(
            "display-figure tabular leading-[0.95]",
            size === "lg" ? "text-[56px]" : "text-[44px]"
          )}
        >
          {value}
        </span>
        {unit && (
          <span className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground pb-1.5">
            {unit}
          </span>
        )}
      </div>

      {spark && <div className="h-12 w-full">{spark}</div>}
    </Card>
  );
}
