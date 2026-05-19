"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Activity,
  ArrowUpRight,
  Banknote,
  BarChart3,
  Package,
  Receipt,
  Sparkles,
  Upload,
  Users,
  UserSquare2,
} from "lucide-react";
import { BrandMark } from "./brand-mark";
import { cn } from "@/lib/utils";

const NAV = [
  {
    section: "Visão",
    items: [
      { href: "/dashboard", label: "Executivo", icon: Activity },
      { href: "/vendas", label: "Análise de Vendas", icon: BarChart3 },
    ],
  },
  {
    section: "Catálogo",
    items: [
      { href: "/produtos", label: "Produtos", icon: Package },
      { href: "/clientes", label: "Clientes", icon: Users },
      { href: "/vendedores", label: "Vendedores", icon: UserSquare2 },
    ],
  },
  {
    section: "Financeiro",
    items: [
      { href: "/financeiro", label: "Receita & DRE", icon: Banknote },
    ],
  },
  {
    section: "Operação",
    items: [
      { href: "/importacao", label: "Importação", icon: Upload },
    ],
  },
] as const;

export function Sidebar() {
  const pathname = usePathname();
  return (
    <aside className="hidden lg:flex h-screen sticky top-0 w-[244px] shrink-0 flex-col border-r border-border bg-surface/40">
      <div className="flex h-14 items-center px-5 border-b border-border">
        <Link href="/dashboard" aria-label="Dash BI" className="group inline-flex items-center gap-2">
          <BrandMark />
        </Link>
      </div>

      <nav className="flex-1 overflow-y-auto py-4">
        {NAV.map((group) => (
          <div key={group.section} className="px-3 pb-4">
            <div className="px-2 pb-1.5 text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
              {group.section}
            </div>
            <ul className="flex flex-col gap-0.5">
              {group.items.map((item) => {
                const active =
                  item.href === "/dashboard"
                    ? pathname === item.href
                    : pathname?.startsWith(item.href);
                const Icon = item.icon;
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      className={cn(
                        "group relative flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm transition-colors",
                        active
                          ? "bg-muted/70 text-foreground font-medium"
                          : "text-muted-foreground hover:text-foreground hover:bg-muted/40"
                      )}
                    >
                      {active && (
                        <span className="absolute left-0 top-1/2 h-4 -translate-y-1/2 w-px bg-foreground" />
                      )}
                      <Icon className="h-[15px] w-[15px] shrink-0" />
                      <span className="truncate">{item.label}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      <div className="m-3 rounded-md border border-border bg-surface-sunken p-3">
        <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
          <Sparkles className="h-3 w-3" />
          Insight do dia
        </div>
        <p className="mt-2 text-xs leading-relaxed text-foreground/80">
          Margem nas categorias <span className="font-medium">Moda</span> e{" "}
          <span className="font-medium">Beleza</span> está acima da média.
        </p>
        <Link
          href="/vendas"
          className="mt-2 inline-flex items-center gap-1 text-[11px] text-accent hover:underline"
        >
          Investigar <ArrowUpRight className="h-3 w-3" />
        </Link>
      </div>

      <div className="border-t border-border px-4 py-3 text-[10px] text-muted-foreground flex items-center gap-2">
        <Receipt className="h-3 w-3" />
        <span>Dash BI · v0.1 · build {new Date().getFullYear()}</span>
      </div>
    </aside>
  );
}
