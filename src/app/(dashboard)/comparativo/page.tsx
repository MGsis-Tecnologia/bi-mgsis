"use client";

import * as React from "react";
import {
  ArrowDown,
  ArrowUp,
  Minus,
  Search,
  Sparkles,
  TrendingDown,
  TrendingUp,
  X,
} from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/dashboard/empty-state";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Money } from "@/components/dashboard/money";
import { YearComparisonChart } from "@/components/charts/year-comparison-chart";
import { YearDrilldownChart } from "@/components/charts/year-drilldown-chart";
import {
  crescimento,
  useComparativoAnalytics,
  useComparativoItem,
  useComparativoLista,
  type ComparativoView,
  type Dimensao,
  type ItemComparativo,
  type LinhaAnual,
  type OrdemLista,
} from "@/lib/hooks/use-comparativo-analytics";
import { computeProjection, type YearProjection } from "@/lib/analytics/yearly";
import { formatNumber } from "@/lib/utils/format";
import { cn } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────────────────────

type DimTab = Dimensao;

const TABS: { id: DimTab; label: string }[] = [
  { id: "vendedores", label: "Vendedores" },
  { id: "subgrupos",  label: "Subgrupos" },
  { id: "marcas",     label: "Marcas" },
  { id: "canais",     label: "Canais" },
  { id: "clientes",   label: "Clientes" },
  { id: "produtos",   label: "Produtos" },
  { id: "fornecedores", label: "Fornecedores" },
];

const SINGULAR: Record<DimTab, string> = {
  vendedores: "Vendedor",
  subgrupos:  "Subgrupo",
  marcas:     "Marca",
  canais:     "Canal",
  clientes:   "Cliente",
  produtos:   "Produto",
  fornecedores: "Fornecedor",
};

const BUSCA_PLACEHOLDER: Record<DimTab, string> = {
  vendedores: "Buscar vendedor…",
  subgrupos:  "Buscar subgrupo…",
  marcas:     "Buscar marca…",
  canais:     "Buscar canal…",
  clientes:   "Buscar cliente…",
  produtos:   "Buscar produto, código ou código do fabricante…",
  fornecedores: "Buscar fornecedor…",
};

// A venda não sabe de quem a peça veio: o elo é o produto. Mesma regra da tela
// de Fornecedores, e o aviso existe para o número não parecer "vendas do
// fornecedor" no sentido literal.
const NOTA_DIMENSAO: Partial<Record<DimTab, string>> = {
  fornecedores:
    "A venda não sabe de quem a peça veio — o elo é o produto. Cada produto entra para o fornecedor de quem mais se comprou dele naquele ano, e a venda do produto inteira, naquele ano, vai para esse fornecedor. Produto vendido num ano sem compra registrada não aparece.",
};

const ORDEM_PADRAO: OrdemLista = { ordem: "total", direcao: "desc" };

// ─── Growth badge ─────────────────────────────────────────────────────────────

function GrowthBadge({ growth }: { growth: number | null }) {
  if (growth === null) return <span className="text-muted-foreground text-xs">—</span>;
  const pct = growth * 100;
  const Icon = pct === 0 ? Minus : pct > 0 ? TrendingUp : TrendingDown;
  return (
    <span className={cn(
      "inline-flex items-center gap-0.5 text-xs font-medium tabular",
      pct > 0 ? "text-emerald-500" : pct < 0 ? "text-rose-500" : "text-muted-foreground"
    )}>
      <Icon className="h-3 w-3" />
      {pct > 0 ? "+" : ""}{pct.toFixed(1)}%
    </span>
  );
}

// ─── Projection banner ────────────────────────────────────────────────────────

function ProjectionBanner({ proj }: { proj: YearProjection }) {
  const pct = ((1 - proj.elapsedPct) * 100).toFixed(0);
  const method = proj.method === "seasonal"
    ? `Sazonalidade de ${proj.priorYearsUsed} ano${proj.priorYearsUsed > 1 ? "s" : ""} anterior${proj.priorYearsUsed > 1 ? "es" : ""}`
    : "Projeção linear (sem histórico anterior)";

  return (
    <div className="flex items-start gap-3 rounded-md border border-border bg-muted/20 px-4 py-3">
      <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
      <div className="min-w-0">
        <p className="text-sm font-medium text-foreground">
          Projeção {proj.currentYear}: <Money value={proj.projected} />
        </p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Realizado até agora: <span className="tabular font-medium text-foreground"><Money value={proj.ytd} compact /></span>
          {" · "}
          Faltam ~{pct}% do ano
          {" · "}
          {method}
        </p>
      </div>
    </div>
  );
}

// ─── Drill-down view (single entity) ─────────────────────────────────────────

function DrilldownView({
  row,
  years,
  projection,
}: {
  row: ItemComparativo;
  years: string[];
  projection: YearProjection | null;
}) {
  return (
    <div className="space-y-6">
      {/* Projection banner */}
      {projection && <ProjectionBanner proj={projection} />}

      {/* KPI cards — one per year */}
      <div className={cn(
        "grid gap-3",
        years.length <= 2 ? "grid-cols-2"
          : years.length === 3 ? "grid-cols-3"
          : years.length === 4 ? "grid-cols-4"
          : "grid-cols-5"
      )}>
        {years.map((yr, idx) => {
          const isCurrentYear = projection && yr === projection.currentYear;
          const revenue = isCurrentYear ? projection.ytd : (row.byYear[yr] ?? 0);
          const prev = idx > 0 ? (row.byYear[years[idx - 1]!] ?? 0) : null;
          const growth = prev !== null && prev > 0 ? (revenue - prev) / prev : null;

          return (
            <Card key={yr} className={cn("relative overflow-hidden", isCurrentYear && "border-accent/50")}>
              <CardContent className="pt-4 pb-4">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {yr}{isCurrentYear ? " · YTD" : ""}
                </p>
                <p className="mt-1 text-lg font-semibold tabular text-foreground">
                  <Money value={revenue} compact />
                </p>
                {isCurrentYear && (() => {
                  const projGrowth = prev !== null && prev > 0
                    ? (projection.projected - prev) / prev
                    : null;
                  return (
                    <>
                      {projGrowth !== null && (
                        <p className="mt-0.5 text-xs">
                          <GrowthBadge growth={projGrowth} />
                          <span className="ml-1 text-muted-foreground">proj. vs {years[idx - 1]}</span>
                        </p>
                      )}
                      <p className="mt-0.5 text-xs text-accent font-medium">
                        Proj.: <Money value={projection.projected} compact />
                      </p>
                    </>
                  );
                })()}
                {!isCurrentYear && growth !== null && (
                  <p className="mt-0.5 text-xs">
                    <GrowthBadge growth={growth} />
                    <span className="ml-1 text-muted-foreground">vs {years[idx - 1]}</span>
                  </p>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Large single-entity chart */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">
            {row.label} · evolução anual
            {projection && (
              <span className="ml-2 text-[11px] font-normal text-muted-foreground">
                (barra com ★ = realizado + projeção estimada)
              </span>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="pb-4">
          <YearDrilldownChart years={years} byYear={row.byYear} projection={projection} />
        </CardContent>
      </Card>

      {/* Year-by-year table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">Detalhamento por ano</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="px-4 py-2.5 text-left text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Ano</th>
                <th className="px-4 py-2.5 text-right text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Realizado</th>
                {projection && (
                  <th className="px-4 py-2.5 text-right text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Projeção</th>
                )}
                <th className="px-4 py-2.5 text-right text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Var. anual</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {years.map((yr, idx) => {
                const isCurrentYear = projection && yr === projection.currentYear;
                const revenue = isCurrentYear ? projection.ytd : (row.byYear[yr] ?? 0);
                const prev = idx > 0 ? (row.byYear[years[idx - 1]!] ?? 0) : null;
                const growth = prev !== null && prev > 0 ? (revenue - prev) / prev : null;

                return (
                  <tr key={yr} className={cn("hover:bg-muted/20 transition-colors", isCurrentYear && "bg-accent/5")}>
                    <td className="px-4 py-3 font-medium text-foreground">
                      {yr}{isCurrentYear ? <span className="ml-1 text-[10px] text-accent">YTD</span> : ""}
                    </td>
                    <td className="px-4 py-3 text-right tabular text-foreground">
                      <Money value={revenue} />
                    </td>
                    {projection && (
                      <td className="px-4 py-3 text-right tabular text-muted-foreground">
                        {isCurrentYear
                          ? <span className="text-accent font-medium"><Money value={projection.projected} /></span>
                          : "—"
                        }
                      </td>
                    )}
                    <td className="px-4 py-3 text-right">
                      <GrowthBadge growth={growth} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Overview chart (top itens) ──────────────────────────────────────────────

function OverviewChart({ result }: { result: ComparativoView }) {
  const { years, rows } = result;
  if (rows.length === 0) return null;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-medium">
          Receita por ano · {rows.length === 1 ? "maior item" : `${rows.length} maiores itens`}
        </CardTitle>
      </CardHeader>
      <CardContent className="pb-2">
        <YearComparisonChart data={{ years, rows: rows.map((r) => ({ ...r, growth: null })) }} />
      </CardContent>
    </Card>
  );
}

// ─── Tabela completa, com rolagem e carga por páginas ────────────────────────

function ThOrdenavel({
  id,
  align,
  ordem,
  onOrdena,
  children,
}: {
  id: string;
  align: "left" | "right";
  ordem: OrdemLista;
  onOrdena: (id: string) => void;
  children: React.ReactNode;
}) {
  const ativo = ordem.ordem === id;
  return (
    <th
      className={cn(
        "px-4 py-2.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground",
        align === "right" ? "text-right" : "text-left"
      )}
      aria-sort={ativo ? (ordem.direcao === "asc" ? "ascending" : "descending") : "none"}
    >
      <button
        type="button"
        onClick={() => onOrdena(id)}
        className={cn(
          "inline-flex items-center gap-1 uppercase tracking-wider transition-colors hover:text-foreground",
          ativo && "text-foreground"
        )}
      >
        {children}
        {ativo && (ordem.direcao === "asc"
          ? <ArrowUp className="h-3 w-3" />
          : <ArrowDown className="h-3 w-3" />)}
      </button>
    </th>
  );
}

interface TabelaProps {
  dim: DimTab;
  years: string[];
  rows: LinhaAnual[];
  total: number;
  loading: boolean;
  loadingMais: boolean;
  hasMore: boolean;
  loadMore: () => void;
  error: string | null;
  busca: string;
  onBusca: (v: string) => void;
  ordem: OrdemLista;
  onOrdena: (id: string) => void;
  selectedKey: string | null;
  onSelect: (key: string) => void;
}

function TabelaComparativa({
  dim, years, rows, total, loading, loadingMais, hasMore, loadMore, error,
  busca, onBusca, ordem, onOrdena, selectedKey, onSelect,
}: TabelaProps) {
  const scrollRef = React.useRef<HTMLDivElement>(null);

  // Busca, ordem ou dimensão nova recomeçam a lista: volta ao topo.
  React.useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 });
  }, [dim, busca, ordem.ordem, ordem.direcao]);

  const onScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    if (el.scrollHeight - el.scrollTop - el.clientHeight < 240) loadMore();
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <CardTitle className="text-sm font-medium">
              Detalhamento por ano · {formatNumber(total)} {total === 1 ? "item" : "itens"}
            </CardTitle>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              Todos os itens, do maior ao menor faturamento. Clique numa linha para ver o gráfico só daquele item.
            </p>
          </div>
          <div className="relative w-full sm:w-80">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={busca}
              onChange={(e) => onBusca(e.target.value)}
              placeholder={BUSCA_PLACEHOLDER[dim]}
              className="pl-9 pr-9"
              aria-label="Buscar na tabela"
            />
            {busca && (
              <button
                type="button"
                onClick={() => onBusca("")}
                className="absolute right-2 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded text-muted-foreground hover:text-foreground"
                title="Limpar busca"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="px-0">
        {error && (
          <p className="px-5 pb-3 text-sm text-negative">Não foi possível carregar a tabela: {error}</p>
        )}
        <div ref={scrollRef} onScroll={onScroll} className="max-h-[560px] overflow-auto">
          <table className="w-full text-sm">
            <thead className="[&_th]:sticky [&_th]:top-0 [&_th]:z-10 [&_th]:bg-surface [&_th]:border-b [&_th]:border-border">
              <tr>
                <ThOrdenavel id="nome" align="left" ordem={ordem} onOrdena={onOrdena}>Item</ThOrdenavel>
                {years.map((yr) => (
                  <ThOrdenavel key={yr} id={yr} align="right" ordem={ordem} onOrdena={onOrdena}>{yr}</ThOrdenavel>
                ))}
                <ThOrdenavel id="total" align="right" ordem={ordem} onOrdena={onOrdena}>Total</ThOrdenavel>
                <th className="px-4 py-2.5 text-right text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Var. anual</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {loading && Array.from({ length: 8 }).map((_, i) => (
                <tr key={`sk-${i}`}>
                  <td colSpan={years.length + 3} className="px-4 py-2.5">
                    <div className="h-8 animate-pulse rounded bg-muted/40" />
                  </td>
                </tr>
              ))}

              {!loading && rows.length === 0 && (
                <tr>
                  <td colSpan={years.length + 3} className="px-4 py-8 text-center text-sm text-muted-foreground">
                    {busca ? "Nenhum item encontrado para essa busca." : "Sem dados para a dimensão selecionada."}
                  </td>
                </tr>
              )}

              {rows.map((row) => {
                const selecionada = row.key === selectedKey;
                return (
                  <tr
                    key={row.key}
                    role="button"
                    tabIndex={0}
                    aria-pressed={selecionada}
                    onClick={() => onSelect(row.key)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        onSelect(row.key);
                      }
                    }}
                    className={cn(
                      "cursor-pointer transition-colors hover:bg-muted/30 focus-visible:bg-muted/30 focus-visible:outline-none",
                      selecionada && "bg-accent/10 hover:bg-accent/15"
                    )}
                  >
                    <td className="max-w-[300px] px-4 py-2.5">
                      <div className="truncate font-medium text-foreground" title={row.label}>
                        {row.label || "—"}
                      </div>
                      {row.mfr && (
                        <div className="truncate font-mono text-xs text-muted-foreground" title={`Código do fabricante: ${row.mfr}`}>
                          Fab. {row.mfr}
                        </div>
                      )}
                    </td>
                    {years.map((yr) => (
                      <td key={yr} className="px-4 py-2.5 text-right tabular text-muted-foreground">
                        <Money value={row.byYear[yr] ?? 0} compact />
                      </td>
                    ))}
                    <td className="px-4 py-2.5 text-right tabular font-medium text-foreground">
                      <Money value={row.total} compact />
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <GrowthBadge growth={crescimento(row.byYear, years)} />
                    </td>
                  </tr>
                );
              })}

              {loadingMais && (
                <tr>
                  <td colSpan={years.length + 3} className="px-4 py-3 text-center text-xs text-muted-foreground">
                    Carregando mais…
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {!loading && rows.length > 0 && (
          <p className="border-t border-border px-5 pt-3 text-[11px] text-muted-foreground">
            {hasMore
              ? `${formatNumber(rows.length)} de ${formatNumber(total)} — role para carregar o restante.`
              : `${formatNumber(rows.length)} de ${formatNumber(total)}.`}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ComparativoPage() {
  const [tab, setTab] = React.useState<DimTab>("vendedores");
  const [selectedKey, setSelectedKey] = React.useState<string | null>(null);
  const [busca, setBusca] = React.useState("");
  // A busca só vai ao servidor depois de uma pausa na digitação.
  const [buscaAplicada, setBuscaAplicada] = React.useState("");
  const [ordem, setOrdem] = React.useState<OrdemLista>(ORDEM_PADRAO);
  const topoRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const t = setTimeout(() => setBuscaAplicada(busca.trim()), 300);
    return () => clearTimeout(t);
  }, [busca]);

  // Zera tudo NA HORA de trocar de aba, e não num efeito depois: com o efeito, a
  // primeira consulta da dimensão nova sairia com a busca e a ordem da anterior.
  const trocaAba = (id: DimTab) => {
    setTab(id);
    setSelectedKey(null);
    setBusca("");
    setBuscaAplicada("");
    setOrdem(ORDEM_PADRAO);
  };

  // Primeira vez numa coluna: maior primeiro (nomes: A→Z). De novo: inverte.
  const ordena = (id: string) =>
    setOrdem((atual) =>
      atual.ordem === id
        ? { ordem: id, direcao: atual.direcao === "asc" ? "desc" : "asc" }
        : { ordem: id, direcao: id === "nome" ? "asc" : "desc" }
    );

  // Gráfico da visão geral (maiores itens) — independe da busca e da ordem.
  const { data: result, loading, error } = useComparativoAnalytics(tab);
  // Tabela com todos os itens, por páginas.
  const lista = useComparativoLista(tab, buscaAplicada, ordem);
  // Série mensal do item clicado — a projeção depende dela.
  const itemQ = useComparativoItem(tab, selectedKey);

  const projection = React.useMemo(
    (): YearProjection | null => (itemQ.item ? computeProjection(itemQ.item.byMonth) : null),
    [itemQ.item]
  );

  // Clicar de novo no item já selecionado desfaz a seleção.
  const selecionaItem = (key: string) => {
    if (key === selectedKey) {
      setSelectedKey(null);
      return;
    }
    setSelectedKey(key);
    // O gráfico do item fica acima da tabela, possivelmente fora da tela.
    topoRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  // Cabeçalho e abas ficam SEMPRE na tela. Se saíssem junto com o estado de
  // erro ou de "sem dados", uma aba vazia — empresa sem compras, por exemplo —
  // deixaria o usuário sem como voltar para as outras.
  const cabecalho = (
    <PageHeader
      eyebrow="Análise comparativa"
      title="Comparativo anual."
      description="Evolução por ano · identifique crescimento ou retração por dimensão."
    />
  );

  const abas = (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex flex-wrap gap-1 rounded-md border border-border bg-muted/30 p-1">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => trocaAba(t.id)}
              className={cn(
                "rounded px-3 py-1.5 text-sm font-medium transition-colors",
                tab === t.id
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>
      {NOTA_DIMENSAO[tab] && (
        <p className="text-xs text-muted-foreground">{NOTA_DIMENSAO[tab]}</p>
      )}
    </div>
  );

  if (error || !result?.hasData) {
    return (
      <div className="space-y-8">
        {cabecalho}
        {abas}
        {error ? (
          <div className="rounded-lg border border-negative/30 bg-negative/10 px-4 py-3 text-sm text-negative">
            Não foi possível carregar o comparativo: {error}
          </div>
        ) : loading ? (
          <div className="h-64 animate-pulse rounded-lg bg-muted/40" />
        ) : (
          <EmptyState />
        )}
      </div>
    );
  }

  const linhaSelecionada = selectedKey !== null
    ? lista.rows.find((r) => r.key === selectedKey) ?? null
    : null;
  const tituloItem = itemQ.item?.label ?? linhaSelecionada?.label ?? "";
  const fabricante = itemQ.item?.mfr ?? linhaSelecionada?.mfr ?? null;

  return (
    <div className="space-y-8">
      {cabecalho}

      {abas}

      {/* Âncora: para onde a tela rola quando um item é escolhido lá embaixo. */}
      <div ref={topoRef} className="scroll-mt-24 space-y-6">
        {selectedKey !== null ? (
          <>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {SINGULAR[tab]} selecionado
                </p>
                <h2 className="truncate text-lg font-semibold text-foreground" title={tituloItem}>
                  {tituloItem || "…"}
                </h2>
                {fabricante && (
                  <p className="font-mono text-xs text-muted-foreground">Fab. {fabricante}</p>
                )}
              </div>
              <button
                type="button"
                onClick={() => setSelectedKey(null)}
                className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-md border border-border px-3 text-sm text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground"
              >
                <X className="h-4 w-4" />
                Limpar seleção
              </button>
            </div>

            {itemQ.loading ? (
              <div className="h-64 animate-pulse rounded-lg bg-muted/40" />
            ) : itemQ.error ? (
              <div className="rounded-lg border border-negative/30 bg-negative/10 px-4 py-3 text-sm text-negative">
                Não foi possível carregar o item: {itemQ.error}
              </div>
            ) : itemQ.item ? (
              <DrilldownView row={itemQ.item} years={result.years} projection={projection} />
            ) : (
              <p className="text-sm text-muted-foreground">Esse item não tem vendas registradas.</p>
            )}
          </>
        ) : (
          <OverviewChart result={result} />
        )}
      </div>

      <TabelaComparativa
        dim={tab}
        years={result.years}
        rows={lista.rows}
        total={lista.total}
        loading={lista.loading}
        loadingMais={lista.loadingMais}
        hasMore={lista.hasMore}
        loadMore={lista.loadMore}
        error={lista.error}
        busca={busca}
        onBusca={setBusca}
        ordem={ordem}
        onOrdena={ordena}
        selectedKey={selectedKey}
        onSelect={selecionaItem}
      />
    </div>
  );
}
