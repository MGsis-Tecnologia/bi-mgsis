"use client";

import { cn } from "@/lib/utils";

export function SparkBars({
  values,
  height = 36,
  tone = "default",
  className,
}: {
  values: number[];
  height?: number;
  tone?: "default" | "accent" | "positive";
  className?: string;
}) {
  const max = Math.max(...values, 1);
  return (
    <div
      className={cn("flex items-end gap-[2px]", className)}
      style={{ height }}
    >
      {values.map((v, i) => (
        <div
          key={i}
          className={cn(
            "flex-1 rounded-[1px] transition-all",
            tone === "default" && "bg-foreground/15",
            tone === "accent" && "bg-accent/70",
            tone === "positive" && "bg-positive/70"
          )}
          style={{ height: `${Math.max(2, (v / max) * 100)}%` }}
        />
      ))}
    </div>
  );
}
