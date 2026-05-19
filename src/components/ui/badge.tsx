import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium leading-none tracking-[0.02em] transition-colors",
  {
    variants: {
      variant: {
        default: "border-border bg-muted/60 text-foreground",
        outline: "border-border bg-transparent text-foreground",
        positive:
          "border-positive/30 bg-positive-subtle text-positive dark:text-positive",
        negative:
          "border-negative/30 bg-negative-subtle text-negative dark:text-negative",
        warning:
          "border-warning/30 bg-warning-subtle text-warning dark:text-warning",
        accent: "border-accent/30 bg-accent/10 text-accent",
        ghost: "border-transparent bg-transparent text-muted-foreground",
      },
    },
    defaultVariants: { variant: "default" },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
