"use client";

import Link from "next/link";
import { Upload } from "lucide-react";

interface EmptyStateProps {
  title?: string;
  description?: string;
}

export function EmptyState({
  title = "Nenhum dado importado",
  description = "Importe um arquivo CSV ou Excel para visualizar os indicadores.",
}: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 rounded-xl border border-dashed border-border py-28 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
        <Upload className="h-5 w-5 text-muted-foreground" />
      </div>
      <div className="space-y-1">
        <p className="text-sm font-medium text-foreground">{title}</p>
        <p className="text-xs text-muted-foreground max-w-xs">{description}</p>
      </div>
      <Link
        href="/importacao"
        className="inline-flex items-center gap-1.5 rounded-md bg-foreground px-3 py-1.5 text-xs font-medium text-background hover:opacity-80 transition-opacity"
      >
        <Upload className="h-3.5 w-3.5" />
        Importar dados
      </Link>
    </div>
  );
}
