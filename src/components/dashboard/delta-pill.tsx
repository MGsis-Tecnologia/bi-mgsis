import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatPercent } from "@/lib/utils/format";

interface DeltaPillProps {
  value: number; // ratio (0.18 = +18%)
  invert?: boolean; // for "cost" where down is good
  size?: "sm" | "md";
  className?: string;
}

export function DeltaPill({ value, invert, size = "md", className }: DeltaPillProps) {
  const tone =
    Math.abs(value) < 0.005
      ? "flat"
      : (value > 0) !== !!invert
      ? "positive"
      : "negative";
  const Icon = tone === "flat" ? Minus : value > 0 ? ArrowUpRight : ArrowDownRight;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 rounded-md border font-medium tabular",
        size === "sm" ? "px-1.5 py-0.5 text-[10px]" : "px-2 py-0.5 text-[11px]",
        tone === "positive" && "border-positive/30 bg-positive-subtle text-positive",
        tone === "negative" && "border-negative/30 bg-negative-subtle text-negative",
        tone === "flat" && "border-border bg-muted/60 text-muted-foreground",
        className
      )}
    >
      <Icon className={cn(size === "sm" ? "h-2.5 w-2.5" : "h-3 w-3", "shrink-0")} />
      {formatPercent(Math.abs(value), { decimals: Math.abs(value) < 0.1 ? 1 : 1 })}
    </span>
  );
}
