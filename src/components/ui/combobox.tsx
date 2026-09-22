"use client";

import * as React from "react";
import { Check, ChevronDown, Search } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export interface ComboboxOption {
  value: string;
  label: string;
}

/**
 * Select com busca, para listas longas demais para um `<Select>` comum ser
 * usável — o `<Select>` do Radix não tem busca embutida (só type-ahead pela
 * primeira letra digitada) e não sobrou no projeto nenhum componente de
 * combobox pronto: o antigo picker do Comparativo foi removido no redesenho
 * que trocou por busca inline na própria tabela.
 */
export function Combobox({
  value,
  onChange,
  options,
  placeholder = "Selecionar…",
  searchPlaceholder = "Buscar…",
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  options: ComboboxOption[];
  placeholder?: string;
  searchPlaceholder?: string;
  className?: string;
}) {
  const [open, setOpen] = React.useState(false);
  const [busca, setBusca] = React.useState("");
  const [destaque, setDestaque] = React.useState(0);
  const inputRef = React.useRef<HTMLInputElement>(null);

  const filtradas = React.useMemo(() => {
    const q = busca.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => o.label.toLowerCase().includes(q));
  }, [busca, options]);

  const selecionada = options.find((o) => o.value === value);

  React.useEffect(() => {
    if (open) {
      setBusca("");
      setDestaque(0);
      // O Popover só monta o conteúdo depois do estado abrir; sem o próximo
      // frame o input ainda não existe no DOM na hora do focus().
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  React.useEffect(() => setDestaque(0), [busca]);

  function selecionar(v: string) {
    onChange(v);
    setOpen(false);
  }

  function aoTeclar(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setDestaque((d) => Math.min(d + 1, filtradas.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setDestaque((d) => Math.max(d - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (filtradas[destaque]) selecionar(filtradas[destaque].value);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "flex h-8 items-center justify-between gap-2 rounded-md border border-border bg-surface px-3 text-xs",
            "focus:outline-none focus:ring-2 focus:ring-ring/30",
            className
          )}
        >
          <span className={cn("truncate", !selecionada && "text-muted-foreground")}>
            {selecionada ? selecionada.label : placeholder}
          </span>
          <ChevronDown className="h-3.5 w-3.5 shrink-0 opacity-60" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 p-0">
        <div className="flex items-center gap-1.5 border-b border-border px-2.5 py-2">
          <Search className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <input
            ref={inputRef}
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            onKeyDown={aoTeclar}
            placeholder={searchPlaceholder}
            className="w-full bg-transparent text-xs outline-none placeholder:text-muted-foreground"
          />
        </div>
        <div className="max-h-64 overflow-y-auto p-1">
          {filtradas.length === 0 && (
            <div className="px-2.5 py-3 text-center text-xs text-muted-foreground">Nada encontrado</div>
          )}
          {filtradas.map((o, i) => (
            <button
              key={o.value}
              type="button"
              onClick={() => selecionar(o.value)}
              onMouseEnter={() => setDestaque(i)}
              className={cn(
                "flex w-full items-center gap-2 rounded-sm px-2.5 py-1.5 text-left text-xs",
                i === destaque ? "bg-muted/60" : "hover:bg-muted/40",
                o.value === value && "font-medium"
              )}
            >
              <Check className={cn("h-3.5 w-3.5 shrink-0", o.value === value ? "opacity-100" : "opacity-0")} />
              <span className="truncate">{o.label}</span>
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
