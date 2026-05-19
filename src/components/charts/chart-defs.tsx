"use client";

import * as React from "react";

/** Reusable SVG <defs> with editorial gradients & patterns for chart fills. */
export function ChartDefs() {
  return (
    <defs>
      <linearGradient id="gradAccent" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="hsl(var(--accent))" stopOpacity="0.32" />
        <stop offset="100%" stopColor="hsl(var(--accent))" stopOpacity="0" />
      </linearGradient>
      <linearGradient id="gradPositive" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="hsl(var(--positive))" stopOpacity="0.32" />
        <stop offset="100%" stopColor="hsl(var(--positive))" stopOpacity="0" />
      </linearGradient>
      <linearGradient id="gradMuted" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="hsl(var(--foreground))" stopOpacity="0.08" />
        <stop offset="100%" stopColor="hsl(var(--foreground))" stopOpacity="0" />
      </linearGradient>
      <pattern
        id="patternHairline"
        x="0"
        y="0"
        width="6"
        height="6"
        patternUnits="userSpaceOnUse"
      >
        <line
          x1="0"
          y1="6"
          x2="6"
          y2="0"
          stroke="hsl(var(--border))"
          strokeWidth="0.5"
        />
      </pattern>
    </defs>
  );
}
