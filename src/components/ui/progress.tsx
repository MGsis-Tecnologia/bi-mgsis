import * as React from "react";
import { cn } from "@/lib/utils";

interface ProgressProps extends React.HTMLAttributes<HTMLDivElement> {
  value: number; // 0..1+
  tone?: "default" | "positive" | "negative" | "warning";
}

export function Progress({ value, tone = "default", className, ...props }: ProgressProps) {
  const clamped = Math.max(0, Math.min(1.2, value));
  const display = Math.min(1, clamped);
  const overshoot = clamped > 1;
  const toneClass = {
    default: "bg-foreground",
    positive: "bg-positive",
    negative: "bg-negative",
    warning: "bg-warning",
  }[tone];
  return (
    <div
      className={cn("relative h-1.5 w-full overflow-hidden rounded-full bg-muted", className)}
      {...props}
    >
      <div
        className={cn("h-full rounded-full transition-all duration-700", toneClass, overshoot && "bg-positive")}
        style={{ width: `${display * 100}%` }}
      />
    </div>
  );
}
