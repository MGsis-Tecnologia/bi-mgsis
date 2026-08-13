"use client";

import * as React from "react";
import { ThemeProvider as NextThemesProvider } from "next-themes";

export function ThemeProvider({
  children,
  ...props
}: React.ComponentProps<typeof NextThemesProvider>) {
  return (
    <NextThemesProvider
      suppressHydrationWarning
      storageKey="theme"
      enableColorScheme={false}
      {...props}
    >
      {children}
    </NextThemesProvider>
  );
}
