"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { Search, ArrowUpRight } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { HELP_SECTIONS, HELP_GROUPS } from "@/lib/help/topics";
import type { HelpMetric, HelpSection } from "@/lib/help/types";

// Sem acento/caixa, pra busca não depender de digitar "cobertura" == "Cobertura".
function normalize(s: string) {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

export default function AjudaPage() {
  return (
    <React.Suspense fallback={null}>
      <AjudaContent />
    </React.Suspense>
  );
}

function AjudaContent() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const sectionParam = searchParams.get("t");
  const activeSection =
    HELP_SECTIONS.find((s) => s.id === sectionParam) ?? HELP_SECTIONS[0];

  const [query, setQuery] = React.useState("");
  const [pendingScroll, setPendingScroll] = React.useState<string | null>(null);

  const selectSection = (id: string, scrollToMetric?: string) => {
    router.push(`${pathname}?t=${id}`, { scroll: false });
    if (scrollToMetric) setPendingScroll(scrollToMetric);
  };

  // Rola até o card da métrica só depois que a seção certa já está no DOM.
  React.useEffect(() => {
    if (!pendingScroll) return;
    const el = document.getElementById(pendingScroll);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "start" });
    el.classList.add("ring-2", "ring-accent");
    const timer = setTimeout(() => el.classList.remove("ring-2", "ring-accent"), 1600);
    setPendingScroll(null);
    return () => clearTimeout(timer);
  }, [pendingScroll, activeSection]);

  const results = React.useMemo(() => {
    const q = normalize(query.trim());
    if (!q) return null;
    const out: { section: HelpSection; metric: HelpMetric }[] = [];
    for (const section of HELP_SECTIONS) {
      for (const metric of section.metrics) {
        const haystack = normalize(
          `${section.label} ${metric.title} ${metric.description} ${metric.logic ?? ""}`
        );
        if (haystack.includes(q)) out.push({ section, metric });
      }
    }
    return out;
  }, [query]);

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Ajuda"
        title="Central de ajuda."
        description="O que cada gráfico e tabela do Analytics mostra, como é calculado e quais filtros afetam o resultado."
      />

      <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-6 items-start">
        {/* Coluna esquerda — busca + navegação por tópico */}
        <div className="lg:sticky lg:top-6 space-y-4">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar (ex: cobertura de estoque)…"
              className="h-9 w-full rounded-md border border-border bg-background pl-8 pr-3 text-xs text-foreground placeholder:text-muted-foreground focus:border-foreground/50 focus:outline-none"
            />
          </div>

          {results ? (
            <div className="space-y-1">
              <div className="px-1 pb-1 text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
                {results.length} resultado(s)
              </div>
              {results.length === 0 && (
                <p className="px-1 text-xs text-muted-foreground">
                  Nada encontrado. Tente outro termo.
                </p>
              )}
              {results.map(({ section, metric }) => (
                <button
                  key={`${section.id}-${metric.id}`}
                  type="button"
                  onClick={() => selectSection(section.id, metric.id)}
                  className="w-full text-left rounded-md px-2.5 py-2 text-xs hover:bg-muted/40 transition-colors"
                >
                  <div className="font-medium text-foreground">{metric.title}</div>
                  <div className="text-[10px] text-muted-foreground">{section.label}</div>
                </button>
              ))}
            </div>
          ) : (
            <nav className="space-y-4">
              {HELP_GROUPS.map((group) => (
                <div key={group}>
                  <div className="px-1 pb-1 text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
                    {group}
                  </div>
                  <ul className="space-y-0.5">
                    {HELP_SECTIONS.filter((s) => s.group === group).map((section) => {
                      const Icon = section.icon;
                      const active = section.id === activeSection.id;
                      return (
                        <li key={section.id}>
                          <button
                            type="button"
                            onClick={() => selectSection(section.id)}
                            className={cn(
                              "w-full flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm transition-colors",
                              active
                                ? "bg-muted/70 text-foreground font-medium"
                                : "text-muted-foreground hover:text-foreground hover:bg-muted/40"
                            )}
                          >
                            <Icon className="h-[15px] w-[15px] shrink-0" />
                            <span className="truncate">{section.label}</span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
            </nav>
          )}
        </div>

        {/* Coluna direita — conteúdo do tópico selecionado */}
        <div className="space-y-4 min-w-0">
          <Card>
            <CardHeader>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <CardTitle className="text-base font-serif normal-case tracking-normal text-foreground">
                    {activeSection.label}
                  </CardTitle>
                  <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
                    {activeSection.summary}
                  </p>
                </div>
                <Link
                  href={activeSection.route}
                  className="inline-flex shrink-0 items-center gap-1 text-xs text-accent hover:underline underline-offset-2"
                >
                  Abrir tela <ArrowUpRight className="h-3 w-3" />
                </Link>
              </div>
            </CardHeader>
            <CardContent className="space-y-2 text-xs text-muted-foreground">
              <div>
                <span className="font-medium text-foreground">Filtros globais: </span>
                {activeSection.globalFilters}
              </div>
              {activeSection.localFilters && (
                <div>
                  <span className="font-medium text-foreground">Filtros da tela: </span>
                  {activeSection.localFilters}
                </div>
              )}
            </CardContent>
          </Card>

          {activeSection.metrics.map((metric) => (
            <Card key={metric.id} id={metric.id} className="scroll-mt-6 transition-shadow">
              <CardHeader>
                <CardTitle className="text-sm font-medium normal-case tracking-normal text-foreground">
                  {metric.title}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2.5 text-sm">
                <p className="text-foreground/90">{metric.description}</p>
                {metric.logic && (
                  <p className="text-muted-foreground">
                    <span className="font-medium text-foreground/80">Como é calculado: </span>
                    {metric.logic}
                  </p>
                )}
                {metric.filters && (
                  <p className="text-muted-foreground">
                    <span className="font-medium text-foreground/80">Filtros que afetam: </span>
                    {metric.filters}
                  </p>
                )}
                {metric.columns && metric.columns.length > 0 && (
                  <div>
                    <p className="font-medium text-foreground/80">O que é cada coluna:</p>
                    <dl className="mt-1.5 divide-y divide-border rounded-md border border-border">
                      {metric.columns.map((col) => (
                        <div key={col.name} className="grid grid-cols-[120px_1fr] gap-3 px-3 py-1.5">
                          <dt className="font-mono text-xs font-medium text-foreground">{col.name}</dt>
                          <dd className="text-xs text-muted-foreground">{col.desc}</dd>
                        </div>
                      ))}
                    </dl>
                  </div>
                )}
                {metric.howToRead && (
                  <p className="text-muted-foreground">
                    <span className="font-medium text-foreground/80">Como ler: </span>
                    {metric.howToRead}
                  </p>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
