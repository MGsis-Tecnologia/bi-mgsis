import { TrendingUp, TrendingDown } from "lucide-react";
import { cn } from "@/lib/utils";

interface KPICardProps {
  label: string;
  value: string | number;
  icon: React.ReactNode;
  trend?: "up" | "down" | "neutral";
  subtext?: string;
}

export function KPICard({
  label,
  value,
  icon,
  trend = "neutral",
  subtext,
}: KPICardProps) {
  const trendIcon =
    trend === "up" ? (
      <TrendingUp className="h-4 w-4 text-positive" />
    ) : trend === "down" ? (
      <TrendingDown className="h-4 w-4 text-negative" />
    ) : null;

  const trendColor =
    trend === "up"
      ? "text-positive"
      : trend === "down"
        ? "text-negative"
        : "text-muted-foreground";

  return (
    <div className="rounded-lg border border-border bg-muted/20 p-4">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            {label}
          </p>
          <div className="mt-2 flex items-baseline gap-2">
            <p className="text-2xl font-semibold text-foreground">{value}</p>
            {trendIcon && <div className={cn("mt-1", trendColor)}>{trendIcon}</div>}
          </div>
          {subtext && <p className="mt-1 text-xs text-muted-foreground">{subtext}</p>}
        </div>
        <div className={cn("flex h-10 w-10 items-center justify-center rounded-lg", "bg-muted text-muted-foreground")}>
          {icon}
        </div>
      </div>
    </div>
  );
}
