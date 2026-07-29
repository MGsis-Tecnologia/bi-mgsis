"use client";

import { Building2, Check, ChevronDown } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useFilters } from "@/lib/store/filters";
import { useEmpresas } from "@/lib/hooks/use-empresas";
import { useTranslation } from "@/lib/hooks/use-translation";

export function EmpresaSwitcher() {
  const { t } = useTranslation();
  const empresaId = useFilters((s) => s.empresaId);
  const setEmpresa = useFilters((s) => s.setEmpresa);
  const empresas = useEmpresas();

  // Só faz sentido oferecer o filtro quando há mais de uma empresa nos dados.
  if (empresas.length <= 1) return null;

  // Os dados só trazem o id numérico — o rótulo é montado no idioma ativo.
  const label = (id: string) =>
    id ? t("filters.empresa.item", { id }) : t("filters.empresa.none");

  const triggerLabel =
    empresaId === "all" ? t("filters.empresa.all_short") : label(empresaId);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-surface px-2.5 text-xs font-medium hover:bg-muted/40 transition-colors">
        <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="max-w-[120px] truncate">{triggerLabel}</span>
        <ChevronDown className="h-3 w-3 opacity-60" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>{t("filters.empresa.title")}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={() => setEmpresa("all")}
          className="flex items-center justify-between"
        >
          <span className="text-foreground">{t("filters.empresa.all")}</span>
          {empresaId === "all" && <Check className="h-3.5 w-3.5 text-foreground" />}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        {empresas.map((e) => (
          <DropdownMenuItem
            key={e.id}
            onClick={() => setEmpresa(e.id)}
            className="flex items-center justify-between"
          >
            <span className="text-foreground">{label(e.id)}</span>
            {empresaId === e.id && <Check className="h-3.5 w-3.5 text-foreground" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
