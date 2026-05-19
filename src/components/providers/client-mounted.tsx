"use client";

import * as React from "react";

export function ClientMounted({ children, fallback = null }: { children: React.ReactNode, fallback?: React.ReactNode }) {
  const [mounted, setMounted] = React.useState(false);
  
  React.useEffect(() => {
    setMounted(true);
  }, []);
  
  if (!mounted) {
    return <>{fallback}</>;
  }
  
  return <>{children}</>;
}
