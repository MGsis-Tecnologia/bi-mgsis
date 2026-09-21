"use client";

import * as React from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
  AlertOctagon,
  AlertTriangle,
  Boxes,
  Download,
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Layers,
  Maximize2,
  Minimize2,
  PackageX,
  Search,
  TrendingUp,
  Loader2,
} from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { EmptyState } from "@/components/dashboard/empty-state";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { BarChartH } from "@/components/charts/bar-chart-h";
import { LabeledDonut } from "@/components/charts/labeled-donut";
import { Money } from "@/components/dashboard/money";
import type { AppCurrencyId } from "@/lib/types/dataset";
import {
  DAYS_PER_MONTH,
  STATUS_ORDER,
  statusLabel,
  useEstoqueAnalytics,
  type EstoqueRow as InventoryRow,
  type EstoqueView,
  type StockStatus,
} from "@/lib/hooks/use-estoque-analytics";
import { formatCurrency, formatNumber, formatPercent } from "@/lib/utils/format";
import { useMoedaExibicao } from "@/lib/hooks/use-moeda-exibicao";
import { exportarExcel } from "@/lib/utils/export-excel";
import { cn } from "@/lib/utils";

export default function EstoquePage() {
  const currency = useMoedaExibicao();

  const [statusFilter, setStatusFilter] = React.useState<StockStatus | "all">("all");
  const [coverageFilter, setCoverageFilter] = React.useState<string>("all");
  const [query, setQuery] = React.useState("");

  // Busca, situação e faixa de cobertura vão para o servidor: são 76 mil SKUs,
  // o navegador não tem a lista pra filtrar — só pra rolar (virtualizado).
  const { data, loading, error } = useEstoqueAnalytics({
    status: statusFilter,
    coverageBucket: coverageFilter,
    busca: query,
  });

  const displayCode = currency === "2" ? "US$" : currency === "3" ? "G$" : "R$";

  // Tela cheia do "Detalhamento por SKU". É a MESMA tabela que cresce (o card
  // vira `fixed inset-0`), não uma cópia: filtros, busca, linhas e posição da
  // rolagem se mantêm ao abrir e fechar. Só vale enquanto o card está na tela —
  // se um erro no recarregamento o tirasse, a página ficaria com a rolagem
  // travada e sem botão para sair.
  const [maximizado, setMaximizado] = React.useState(false);
  const telaCheia = maximizado && !error && !!data?.hasData;
  const botaoTelaCheiaRef = React.useRef<HTMLButtonElement>(null);

  // Ordenação do Detalhamento por SKU. `null` = a ordem que o servidor manda
  // (cobertura decrescente). Roda no navegador — ver `ordenaLinhas`.
  const [ordemSku, setOrdemSku] = React.useState<OrdemSku | null>(null);
  const ordenaPor = (id: ColunaSkuId) =>
    setOrdemSku((atual) =>
      atual?.col === id
        ? { col: id, dir: atual.dir === "asc" ? "desc" : "asc" }
        : { col: id, dir: COLUNAS_SKU.find((c) => c.id === id)?.primeira ?? "asc" }
    );
  const linhasDoServidor = data?.rows;
  const linhasOrdenadas = React.useMemo(
    () =>
      linhasDoServidor && ordemSku
        ? ordenaLinhas(linhasDoServidor, ordemSku, COLUNAS_SKU)
        : linhasDoServidor,
    [linhasDoServidor, ordemSku]
  );

  // Busca e ordenação da tabela de estoque mínimo. Ao contrário do Detalhamento,
  // aqui tudo roda no NAVEGADOR: `belowMinimum` já vem inteiro do servidor (é
  // uma projeção enxuta de poucas centenas de linhas), então filtrar ou ordenar
  // não custa uma consulta nova — e assim esta tabela não recarrega a tela toda.
  const [buscaMinimo, setBuscaMinimo] = React.useState("");
  const [ordemMinimo, setOrdemMinimo] = React.useState<OrdemMinimo | null>(null);
  const ordenaMinimoPor = (id: ColunaMinimoId) =>
    setOrdemMinimo((atual) =>
      atual?.col === id
        ? { col: id, dir: atual.dir === "asc" ? "desc" : "asc" }
        : { col: id, dir: COLUNAS_MINIMO.find((c) => c.id === id)?.primeira ?? "asc" }
    );
  const minimoDoServidor = data?.belowMinimum;
  const minimoVisivel = React.useMemo(() => {
    if (!minimoDoServidor) return undefined;
    const alvo = textoOrdenavel(buscaMinimo);
    const filtradas = alvo
      ? minimoDoServidor.filter((r) =>
          [r.productId, r.description, r.manufacturerCode].some((campo) =>
            (textoOrdenavel(campo) ?? "").includes(alvo)
          )
        )
      : minimoDoServidor;
    return ordemMinimo ? ordenaLinhas(filtradas, ordemMinimo, COLUNAS_MINIMO) : filtradas;
  }, [minimoDoServidor, buscaMinimo, ordemMinimo]);
  // Com o card em `fixed` ele sai do fluxo e a página atrás encolheria; ao fechar,
  // o navegador teria "prendido" a rolagem no fim menor e o usuário perderia o
  // lugar. Reservar a altura de antes evita o salto.
  const secaoSkuRef = React.useRef<HTMLDivElement>(null);
  const alturaSecaoRef = React.useRef(0);
  const alternaTelaCheia = () => {
    if (!maximizado) alturaSecaoRef.current = secaoSkuRef.current?.offsetHeight ?? 0;
    setMaximizado((v) => !v);
  };

  React.useEffect(() => {
    if (!telaCheia) return;

    // `defaultPrevented`: um Select aberto trata o próprio Esc e o marca como
    // tratado — o primeiro Esc fecha a lista, o segundo é que fecha a tela cheia.
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !e.defaultPrevented) setMaximizado(false);
    };
    window.addEventListener("keydown", aoTeclar);

    // A página de fundo não rola enquanto a tabela ocupa a janela.
    const overflowAnterior = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const botao = botaoTelaCheiaRef.current;
    return () => {
      window.removeEventListener("keydown", aoTeclar);
      document.body.style.overflow = overflowAnterior;
      // O foco volta ao botão que abriu, para quem navega pelo teclado.
      botao?.focus();
    };
  }, [telaCheia]);

  const cabecalho = (
    <PageHeader
      eyebrow="Catálogo · estoque"
      title="O que está em estoque."
      description="Cobertura, ruptura, dormência e capital alocado por SKU — cruzando snapshot atual com o movimento de vendas do período."
    />
  );

  if (error) {
    return (
      <div className="space-y-8">
        {cabecalho}
        <Card>
          <CardContent className="py-16 text-center text-sm text-destructive">
            Erro ao carregar: {error}
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="space-y-8">
        {cabecalho}
        <div className="flex justify-center py-24">
          <Loader2 className="h-6 w-6 animate-spin text-accent" />
        </div>
      </div>
    );
  }

  if (!data.hasData) {
    return (
      <div className="space-y-8">
        {cabecalho}
        <EmptyState
          title="Nenhum dado de estoque importado"
          description="Importe um arquivo de estoque (produto_id; produto_descricao; produto_fabricante; estoque_item; valor_estoque) para liberar a análise."
        />
      </div>
    );
  }

  const { totals, periodDays } = data;
  const byCategory = data.byCategory;
  const statuses = data.statuses;
  const movers = data.movers;
  const dormant = data.dormant;
  const rupture = data.ruptureRisk;
  const minStockRows = data.belowMinimum;
  // O que a tabela de estoque mínimo mostra agora: o total acima, já passado
  // pela busca e pela ordenação do próprio card.
  const minStockVisiveis = minimoVisivel ?? minStockRows;
  const rotuloOrdemMinimo = ordemMinimo
    ? COLUNAS_MINIMO.find((c) => c.id === ordemMinimo.col)?.rotulo
    : null;
  // A exportação para Excel sai na ordem em que a tabela está.
  const filteredRows = linhasOrdenadas ?? data.rows;
  const rotuloOrdem = ordemSku ? COLUNAS_SKU.find((c) => c.id === ordemSku.col)?.rotulo(displayCode) : null;

  const coverage = data.coverage.map((s) => ({
    key: s.key,
    label: s.label,
    value: s.valueUSD,
    count: s.count,
    color: COVERAGE_COLORS[s.key] ?? "hsl(var(--muted-foreground))",
  }));
  const coverageTotal = coverage.reduce((s, b) => s + b.value, 0);

  const rupturePct = totals.skus > 0 ? totals.rupture / totals.skus : 0;
  // O valor por situação já vem somado do servidor.
  const porStatus = (k: StockStatus) => statuses.find((s) => s.key === k)?.valueUSD ?? 0;
  const valueAtRisk = porStatus("risk");
  const valueDormant = porStatus("no_movement") + porStatus("excess");

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Catálogo · estoque"
        title="O que está em estoque."
        description="Cobertura, ruptura, dormência e capital alocado por SKU — cruzando snapshot atual com o movimento de vendas do período."
      >
        <Badge variant="ghost" className="gap-1">
          <Boxes className="h-3 w-3" />
          {formatNumber(totals.skus)} SKU(s) · {formatCurrency(totals.totalValueUSD, currency, { compact: true })}
        </Badge>
      </PageHeader>

      {/* KPIs */}
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard
          label="Capital em estoque"
          caption={`${formatNumber(totals.totalUnits)} unidades`}
          value={formatCurrency(totals.totalValueUSD, currency, { compact: true })}
          accent="accent"
        />
        <KpiCard
          label="Ruptura"
          caption={`${formatPercent(rupturePct, { decimals: 1 })} do catálogo`}
          value={formatNumber(totals.rupture)}
          accent="negative"
        />
        <KpiCard
          label="Em risco"
          caption={`${formatCurrency(valueAtRisk, currency, { compact: true })} sob risco`}
          value={formatNumber(totals.risk)}
        />
        <KpiCard
          label="Sem giro + excesso"
          caption={`${formatCurrency(valueDormant, currency, { compact: true })} parados`}
          value={formatNumber(totals.noMovement + totals.excess)}
        />
      </section>

      {/* Cobertura de estoque — pizza por faixa de meses */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Cobertura de estoque</CardTitle>
              <p className="mt-1 text-[11px] text-muted-foreground">
                Capital em estoque por faixa de meses que o saldo atual cobre a demanda do período — valor e % de cada faixa.
              </p>
            </div>
            <Badge variant="ghost">{formatNumber(totals.skus)} SKUs</Badge>
          </div>
        </CardHeader>
        <CardContent>
          <LabeledDonut
            data={coverage}
            currencyId={currency}
            height={280}
            centerLabel="Capital"
            centerValue={formatCurrency(coverageTotal, currency, { compact: true })}
          />
        </CardContent>
      </Card>

      {/* Quick navigation */}
      <nav className="flex items-center gap-3 flex-wrap text-[12px] text-muted-foreground">
        <span className="font-medium uppercase tracking-[0.12em] text-[10px]">Ir para:</span>
        <a href="#sec-status" className="text-accent hover:underline underline-offset-2">Distribuição</a>
        <span>·</span>
        <a href="#sec-rupture" className="text-accent hover:underline underline-offset-2">Ruptura &amp; risco</a>
        <span>·</span>
        <a href="#sec-dormant" className="text-accent hover:underline underline-offset-2">Sem giro</a>
        {minStockRows.length > 0 && (
          <>
            <span>·</span>
            <a href="#sec-minstock" className="text-warning hover:underline underline-offset-2">
              Estoque mínimo ({formatNumber(minStockRows.length)})
            </a>
          </>
        )}
        <span>·</span>
        <a href="#sec-detail" className="text-accent hover:underline underline-offset-2">Detalhamento</a>
      </nav>

      {/* Status mix + categories */}
      <section id="sec-status" className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle>Distribuição por status</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2.5">
              {statuses.map((s) => (
                <StatusBar
                  key={s.key}
                  status={s.key}
                  count={s.count}
                  valueUSD={s.valueUSD}
                  displayCurrencyId={currency}
                  total={totals.skus}
                  active={statusFilter === s.key}
                  onClick={() =>
                    setStatusFilter((prev) => (prev === s.key ? "all" : s.key))
                  }
                />
              ))}
            </div>
            <p className="mt-4 text-[11px] text-muted-foreground">
              Período de movimento: {formatNumber(periodDays)} dias ·
              {" "}
              <button
                type="button"
                onClick={() => setStatusFilter("all")}
                className="underline-offset-2 hover:underline"
              >
                limpar filtro
              </button>
            </p>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Capital em estoque por categoria</CardTitle>
              <Badge variant="ghost" className="gap-1">
                <Layers className="h-3 w-3" />
                top 10
              </Badge>
            </div>
          </CardHeader>
          <CardContent>
            <BarChartH
              rows={byCategory.slice(0, 10).map((c) => ({
                key: c.id,
                label: c.name,
                value: c.valueUSD,
                secondary: `${formatNumber(c.skus)} SKUs · ${formatNumber(c.units)} un`,
                tone: "accent",
              }))}
              format="currency"
              maxRows={10}
            />
          </CardContent>
        </Card>
      </section>

      {/* Rupture / risk + movers */}
      <section id="sec-rupture" className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <AlertOctagon className="h-4 w-4 text-negative" />
                Ruptura & risco
              </CardTitle>
              <Badge variant="negative" className="gap-1">
                {formatNumber(totals.rupture + totals.risk)} item(ns)
              </Badge>
            </div>
            <p className="mt-1 text-[11px] text-muted-foreground">
              Sem estoque mas com saída no período, ou cobertura ≤ 15 dias.
            </p>
          </CardHeader>
          <CardContent className="px-0">
            <CompactList rows={rupture} mode="rupture" emptyMessage="Sem rupturas ou riscos no período." displayCurrencyId={currency} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-positive" />
                Top movimentação
              </CardTitle>
              <Badge variant="positive" className="gap-1">
                top 10
              </Badge>
            </div>
            <p className="mt-1 text-[11px] text-muted-foreground">
              Itens com maior saída no período — base para repor.
            </p>
          </CardHeader>
          <CardContent className="px-0">
            <CompactList rows={movers} mode="movers" emptyMessage="Sem movimentação no período." displayCurrencyId={currency} />
          </CardContent>
        </Card>
      </section>

      {/* Dormant capital */}
      <Card id="sec-dormant">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <PackageX className="h-4 w-4 text-warning" />
              Capital parado · sem giro
            </CardTitle>
            <Badge variant="warning" className="gap-1">
              {formatCurrency(valueDormant, currency, { compact: true })} parados
            </Badge>
          </div>
          <p className="mt-1 text-[11px] text-muted-foreground">
            SKUs com estoque positivo e zero saída no período — ordenados pelo maior valor imobilizado.
          </p>
        </CardHeader>
        <CardContent className="px-0">
          <CompactList rows={dormant} mode="dormant" emptyMessage="Sem itens parados no período." displayCurrencyId={currency} />
        </CardContent>
      </Card>

      {/* Minimum stock alerts — only rendered when at least one product has minStock > 0 */}
      {minStockRows.length > 0 && (
        <Card id="sec-minstock">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-warning" />
                  Abaixo do estoque mínimo
                </CardTitle>
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  Produtos com estoque mínimo definido e quantidade atual igual ou abaixo do ponto de reposição.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                  <input
                    type="text"
                    value={buscaMinimo}
                    onChange={(e) => setBuscaMinimo(e.target.value)}
                    placeholder="Buscar SKU, descrição, fabricante…"
                    className="h-8 w-56 rounded-md border border-border bg-background pl-8 pr-3 text-xs text-foreground placeholder:text-muted-foreground focus:border-foreground/50 focus:outline-none"
                  />
                </div>
                <Badge variant="warning" className="gap-1">
                  {buscaMinimo.trim()
                    ? `${formatNumber(minStockVisiveis.length)} de ${formatNumber(minStockRows.length)}`
                    : `${formatNumber(minStockRows.length)} item(ns)`}
                </Badge>
              </div>
            </div>
            {ordemMinimo && rotuloOrdemMinimo && (
              <p className="mt-1 text-[11px] text-muted-foreground">
                Ordem: <span className="text-foreground">{rotuloOrdemMinimo}</span>{" "}
                {ordemMinimo.dir === "asc" ? "↑ crescente" : "↓ decrescente"}{" "}
                <button
                  type="button"
                  onClick={() => setOrdemMinimo(null)}
                  className="text-accent underline-offset-2 hover:underline"
                >
                  voltar à ordem padrão
                </button>
              </p>
            )}
          </CardHeader>
          <CardContent className="px-0">
            <VirtualizedMinStockTable
              rows={minStockVisiveis}
              ordem={ordemMinimo}
              onOrdena={ordenaMinimoPor}
            />
          </CardContent>
        </Card>
      )}

      {/* Detailed table */}
      <div ref={secaoSkuRef} style={telaCheia ? { height: alturaSecaoRef.current } : undefined}>
        <Card
          id="sec-detail"
          role={telaCheia ? "dialog" : undefined}
          aria-modal={telaCheia || undefined}
          aria-label={telaCheia ? "Detalhamento por SKU" : undefined}
          className={cn(telaCheia && "fixed inset-0 z-[70] flex flex-col rounded-none border-0 bg-background")}
        >
          <CardHeader className={cn(telaCheia && "shrink-0 px-4 py-3")}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <CardTitle>Detalhamento por SKU</CardTitle>
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  {formatNumber(data.rowsTotal)} de {formatNumber(totals.skus)} itens
                  {(statusFilter !== "all" || coverageFilter !== "all") && (
                    <>
                      {" · filtro: "}
                      {[
                        statusFilter !== "all" ? statusLabel(statusFilter) : null,
                        coverageFilter !== "all"
                          ? (data.coverage.find((c) => c.key === coverageFilter)?.label ?? coverageFilter)
                          : null,
                      ]
                        .filter(Boolean)
                        .join(" + ")}
                    </>
                  )}
                  {ordemSku && rotuloOrdem && (
                  <>
                    {" · ordem: "}
                    <span className="text-foreground">
                      {rotuloOrdem} {ordemSku.dir === "asc" ? "↑ crescente" : "↓ decrescente"}
                    </span>{" "}
                    <button
                      type="button"
                      onClick={() => setOrdemSku(null)}
                      className="text-accent underline-offset-2 hover:underline"
                    >
                      voltar à ordem padrão
                    </button>
                  </>
                )}
                {totals.skusMissingFromInventory > 0 && (
                    <>
                      {" "}· <span className="text-warning">
                        {totals.skusMissingFromInventory} SKU(s) vendidos sem registro no estoque
                      </span>
                    </>
                  )}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as StockStatus | "all")}>
                  <SelectTrigger className="h-8 w-[150px] text-xs">
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos os status</SelectItem>
                    {data.statuses.map((s) => (
                      <SelectItem key={s.key} value={s.key}>{s.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={coverageFilter} onValueChange={setCoverageFilter}>
                  <SelectTrigger className="h-8 w-[170px] text-xs">
                    <SelectValue placeholder="Cobertura" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas as faixas</SelectItem>
                    {data.coverage.map((c) => (
                      <SelectItem key={c.key} value={c.key}>{c.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                  <input
                    type="text"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Buscar SKU, descrição, fabricante…"
                    className="h-8 w-56 rounded-md border border-border bg-background pl-8 pr-8 text-xs text-foreground placeholder:text-muted-foreground focus:border-foreground/50 focus:outline-none"
                  />
                  {/* A busca corre no servidor: vale sinalizar que ainda está indo. */}
                  {loading && (
                    <Loader2 className="absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 animate-spin text-muted-foreground" />
                  )}
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 gap-1.5"
                  disabled={filteredRows.length === 0}
                  onClick={() => exportarEstoqueExcel(filteredRows, displayCode)}
                >
                  <Download className="h-3.5 w-3.5" />
                  Excel
                </Button>
                <Button
                  ref={botaoTelaCheiaRef}
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 gap-1.5"
                  onClick={alternaTelaCheia}
                  aria-expanded={telaCheia}
                  title={telaCheia ? "Fechar tela cheia (Esc)" : "Maximizar a tabela"}
                >
                  {telaCheia ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
                  {telaCheia ? "Fechar" : "Maximizar"}
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className={cn("px-0", telaCheia && "flex min-h-0 flex-1 flex-col")}>
            {filteredRows.length === 0 ? (
              <div className="py-10 text-center text-xs text-muted-foreground">
                Nenhum item para o filtro atual.
              </div>
            ) : (
              <VirtualizedSkuTable
                rows={filteredRows}
                currency={currency}
                displayCode={displayCode}
                telaCheia={telaCheia}
                ordem={ordemSku}
                onOrdena={ordenaPor}
              />
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

// Cores fixas por faixa de cobertura (crítico → excesso).
const COVERAGE_COLORS: Record<string, string> = {
  sem_cobertura: "hsl(330 81% 60%)",        // pink
  fora_analise:  "hsl(45 93% 47%)",         // amarelo
  ate_1:         "hsl(var(--chart-1))",
  "1_2":         "hsl(var(--chart-2))",
  "2_4":         "hsl(var(--chart-3))",
  "4_6":         "hsl(var(--chart-4))",
  "6_12":        "hsl(var(--chart-5))",
  mais_12:       "hsl(var(--negative))",    // vermelho
};

const STATUS_TONES: Record<StockStatus, { dot: string; text: string; border: string; bg: string }> = {
  rupture:     { dot: "bg-negative",        text: "text-negative",         border: "border-negative/30", bg: "bg-negative/10" },
  risk:        { dot: "bg-warning",         text: "text-warning",          border: "border-warning/30",  bg: "bg-warning/10" },
  normal:      { dot: "bg-positive",        text: "text-positive",         border: "border-positive/30", bg: "bg-positive/10" },
  excess:      { dot: "bg-accent",          text: "text-accent",           border: "border-accent/30",   bg: "bg-accent/10" },
  no_movement: { dot: "bg-muted-foreground",text: "text-muted-foreground", border: "border-border",      bg: "bg-muted/40" },
};

function StatusBadge({ status }: { status: StockStatus }) {
  const tone = STATUS_TONES[status];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-medium",
        tone.border,
        tone.bg,
        tone.text
      )}
    >
      <span className={cn("h-1.5 w-1.5 rounded-full", tone.dot)} />
      {statusLabel(status)}
    </span>
  );
}

function StatusBar({
  status,
  count,
  valueUSD,
  displayCurrencyId,
  total,
  active,
  onClick,
}: {
  status: StockStatus;
  count: number;
  valueUSD: number;
  displayCurrencyId: AppCurrencyId | string;
  total: number;
  active: boolean;
  onClick: () => void;
}) {
  const tone = STATUS_TONES[status];
  const pct = total > 0 ? count / total : 0;
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "w-full text-left rounded-md border px-3 py-2 transition-colors",
        active ? "border-foreground/40 bg-muted/40" : "border-transparent hover:bg-muted/30"
      )}
    >
      <div className="flex items-center justify-between gap-2 text-[12px]">
        <span className="inline-flex items-center gap-1.5 text-foreground">
          <span className={cn("h-2 w-2 rounded-full", tone.dot)} />
          {statusLabel(status)}
        </span>
        <span className="tabular font-medium">{formatNumber(count)}</span>
      </div>
      <div className="mt-1.5 relative h-1 w-full rounded-full bg-muted/60 overflow-hidden">
        <div
          className={cn("absolute inset-y-0 left-0 rounded-full", tone.dot)}
          style={{ width: `${Math.min(100, pct * 100)}%` }}
        />
      </div>
      <div className="mt-1.5 flex items-center justify-between text-[10px] text-muted-foreground tabular">
        <span>{formatPercent(pct, { decimals: 1 })} dos SKUs</span>
        <span>{formatCurrency(valueUSD, displayCurrencyId, { compact: true })}</span>
      </div>
    </button>
  );
}

/**
 * Mesmas colunas e mesmos valores da tabela na tela — só sem compactação
 * (`formatCurrency`/`formatNumber` com `compact` arredondam pra exibição; o
 * Excel recebe o número cheio) e sem os "—" de célula vazia, que viram string
 * vazia de verdade pra não virar texto numa coluna que devia ser numérica.
 */
function exportarEstoqueExcel(rows: InventoryRow[], displayCode: string) {
  const linhas = rows.map((r) => {
    const semCobertura = r.stock <= 0;
    const coberturaCalculavel = Number.isFinite(r.coverageDays);
    const meses = semCobertura ? 0 : coberturaCalculavel ? Math.round(r.coverageDays / DAYS_PER_MONTH) : "";
    const anos = semCobertura ? 0 : coberturaCalculavel ? Number((r.coverageDays / DAYS_PER_MONTH / 12).toFixed(1)) : "";
    return {
      SKU: r.productId,
      Descrição: r.description,
      Fabricante: r.manufacturerCode,
      Categoria: r.subgroupName,
      Estoque: r.stock,
      Mínimo: r.minStock > 0 ? r.minStock : "",
      [`Custo ${displayCode}`]: r.costTotalUSD,
      Saídas: r.unitsSold > 0 ? r.unitsSold : "",
      Receita: r.revenueSold > 0 ? r.revenueSold : "",
      "Cobertura (meses)": meses,
      "Cobertura (anos)": anos,
      "Última saída": r.lastSaleDate || "",
      "Há dias": Number.isFinite(r.daysSinceLastSale) ? r.daysSinceLastSale : "",
      Status: statusLabel(r.status),
    };
  });

  const agora = new Date();
  const carimbo = [
    agora.getFullYear(),
    String(agora.getMonth() + 1).padStart(2, "0"),
    String(agora.getDate()).padStart(2, "0"),
  ].join("-");
  exportarExcel(`estoque-detalhamento-${carimbo}.xlsx`, "Estoque", linhas);
}

// Tom continua decidido pelos mesmos limiares em DIAS (RISK/EXCESS do
// servidor) — só o texto exibido vira meses, pra bater com a faixa que o
// usuário já vê no donut e no filtro de cobertura.
function CoverageCell({ row }: { row: InventoryRow }) {
  if (row.stock <= 0) return <span className="text-negative font-medium">0m</span>;
  if (!Number.isFinite(row.coverageDays)) return <span className="text-muted-foreground">—</span>;
  const days = row.coverageDays;
  const months = days / DAYS_PER_MONTH;
  const tone =
    days <= 15 ? "text-warning" : days >= 180 ? "text-accent" : "text-foreground";
  const monthsInt = Math.round(months);
  const monthsTexto = monthsInt >= 999 ? "999+" : formatNumber(monthsInt);
  const anosTexto = formatNumber(months / 12, { decimals: 1 });
  return (
    <span className={cn("font-medium", tone)}>
      {monthsTexto}m
      <span className="ml-1 text-[10px] font-normal text-muted-foreground">({anosTexto}a)</span>
    </span>
  );
}

type ColunaSkuId =
  | "sku" | "fabricante" | "descricao" | "categoria" | "estoque" | "minimo"
  | "custo" | "saidas" | "receita" | "cobertura" | "ultSaida" | "status";
type DirecaoOrdem = "asc" | "desc";
interface OrdemSku { col: ColunaSkuId; dir: DirecaoOrdem }

interface ColunaSku {
  id: ColunaSkuId;
  rotulo: (moeda: string) => string;
  align: "left" | "right";
  /** Largura mínima em px. A Descrição é a única elástica (`2fr`). */
  largura: number;
  /** Direção do primeiro clique: texto de A a Z; número e data do maior para o menor. */
  primeira: DirecaoOrdem;
  /**
   * Valor pelo qual a coluna ordena. `null` = vazio, que vai SEMPRE para o fim,
   * nas duas direções: um "—" no topo de uma ordem decrescente não diz nada.
   * Segue o que a tela MOSTRA, não o campo cru — ex.: Mínimo 0 aparece como "—".
   */
  chave: (r: InventoryRow) => number | string | null;
}

/**
 * Texto para ordenar: sem acento, minúsculo. Calculado UMA vez por linha em cada
 * ordenação, e comparado com `<`/`>`. O caminho óbvio, `localeCompare`, levou 8 s
 * para 60 mil linhas numa medição; `Intl.Collator` levou ~210 ms e isto ~40 ms.
 */
function textoOrdenavel(s: string): string | null {
  const n = s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
  return n === "" ? null : n;
}

/**
 * As colunas, na ordem em que aparecem (a mesma nos dois modos). Daqui saem o
 * template do grid, o `minWidth` (a soma) e a ordenação — assim nenhum dos três
 * diverge dos outros. Antes o `minWidth` era um número solto (1350) e as colunas
 * somavam 1420: a tabela transbordava e o Status ficava cortado.
 *
 * Cada largura comporta o valor mais largo ("US$ 8.448,16" em Custo) e o
 * cabeçalho em maiúsculas MAIS a seta de ordenação (16px reservados sempre, para
 * o cabeçalho não "pular" ao ordenar). Soma: 1352px.
 */
const COLUNAS_SKU: ColunaSku[] = [
  // SKU numérico ordena como número (9 vem antes de 10); alfanumérico, como texto.
  { id: "sku", rotulo: () => "SKU", align: "left", largura: 90, primeira: "asc",
    chave: (r) => (/^\d{1,15}$/.test(r.productId) ? Number(r.productId) : textoOrdenavel(r.productId)) },
  { id: "fabricante", rotulo: () => "Fabricante", align: "left", largura: 110, primeira: "asc",
    chave: (r) => textoOrdenavel(r.manufacturerCode) },
  { id: "descricao", rotulo: () => "Descrição", align: "left", largura: 200, primeira: "asc",
    chave: (r) => textoOrdenavel(r.description) },
  { id: "categoria", rotulo: () => "Categoria", align: "left", largura: 120, primeira: "asc",
    chave: (r) => textoOrdenavel(r.subgroupName) },
  { id: "estoque", rotulo: () => "Estoque", align: "right", largura: 86, primeira: "desc",
    chave: (r) => r.stock },
  { id: "minimo", rotulo: () => "Mínimo", align: "right", largura: 78, primeira: "desc",
    chave: (r) => (r.minStock > 0 ? r.minStock : null) },
  { id: "custo", rotulo: (m) => `Custo ${m}`, align: "right", largura: 120, primeira: "desc",
    chave: (r) => r.costTotalUSD },
  { id: "saidas", rotulo: () => "Saídas", align: "right", largura: 80, primeira: "desc",
    chave: (r) => (r.unitsSold > 0 ? r.unitsSold : null) },
  { id: "receita", rotulo: () => "Receita", align: "right", largura: 104, primeira: "desc",
    chave: (r) => (r.revenueSold > 0 ? r.revenueSold : null) },
  // Igual ao que CoverageCell mostra: estoque zerado é "0m"; sem cobertura é "—".
  { id: "cobertura", rotulo: () => "Cobertura", align: "right", largura: 104, primeira: "desc",
    chave: (r) => (r.stock <= 0 ? 0 : Number.isFinite(r.coverageDays) ? r.coverageDays : null) },
  // Data ISO: a comparação de texto já é a cronológica.
  { id: "ultSaida", rotulo: () => "Últ. saída", align: "right", largura: 150, primeira: "desc",
    chave: (r) => r.lastSaleDate || null },
  // Por gravidade (Ruptura primeiro), não em ordem alfabética do rótulo.
  { id: "status", rotulo: () => "Status", align: "left", largura: 110, primeira: "asc",
    chave: (r) => STATUS_ORDER.indexOf(r.status) },
];

/** A projeção enxuta que o servidor manda para a tabela de estoque mínimo. */
type MinStockRow = EstoqueView["belowMinimum"][number];

type ColunaMinimoId = "sku" | "descricao" | "fabricante" | "estoque" | "minimo" | "gap" | "status";
interface OrdemMinimo { col: ColunaMinimoId; dir: DirecaoOrdem }

/**
 * Colunas da tabela "Abaixo do estoque mínimo" — mesma mecânica das do
 * Detalhamento (largura em px, primeira direção do clique, `chave` que segue o
 * que a tela MOSTRA). Soma: 810px, que cabe na largura do card sem rolagem
 * lateral na maioria das telas. Só a Descrição é elástica.
 */
const COLUNAS_MINIMO: ColunaMinimo[] = [
  { id: "sku", rotulo: "SKU", align: "left", largura: 90, primeira: "asc",
    chave: (r) => (/^\d{1,15}$/.test(r.productId) ? Number(r.productId) : textoOrdenavel(r.productId)) },
  { id: "descricao", rotulo: "Descrição", align: "left", largura: 200, primeira: "asc",
    chave: (r) => textoOrdenavel(r.description) },
  { id: "fabricante", rotulo: "Fabricante", align: "left", largura: 110, primeira: "asc",
    chave: (r) => textoOrdenavel(r.manufacturerCode) },
  { id: "estoque", rotulo: "Estoque atual", align: "right", largura: 110, primeira: "asc",
    chave: (r) => r.stock },
  { id: "minimo", rotulo: "Estoque mínimo", align: "right", largura: 120, primeira: "desc",
    chave: (r) => r.minStock },
  // O gap é o que ordena por padrão no servidor (maior primeiro): é a coluna
  // que responde "o que repor antes".
  { id: "gap", rotulo: "Gap", align: "right", largura: 90, primeira: "desc",
    chave: (r) => r.minStock - r.stock },
  { id: "status", rotulo: "Status", align: "left", largura: 110, primeira: "asc",
    chave: (r) => STATUS_ORDER.indexOf(r.status) },
];

interface ColunaMinimo {
  id: ColunaMinimoId;
  rotulo: string;
  align: "left" | "right";
  largura: number;
  primeira: DirecaoOrdem;
  chave: (r: MinStockRow) => number | string | null;
}

const MINIMO_TEMPLATE = COLUNAS_MINIMO.map((c) =>
  c.id === "descricao" ? `minmax(${c.largura}px,2fr)` : `${c.largura}px`
).join(" ");
const MINIMO_MIN_WIDTH = COLUNAS_MINIMO.reduce((s, c) => s + c.largura, 0);

/**
 * Ordena no NAVEGADOR: o servidor já mandou o conjunto inteiro filtrado (60 mil
 * SKUs), então ordenar lá custaria refazer a consulta e baixar tudo de novo a cada
 * clique. Aqui são ~20 a 50 ms.
 *
 * Empate mantém a ordem que o servidor mandou (índice original), nas duas
 * direções — o desempate é explícito e a ordem não inverte junto com a direção.
 *
 * Genérica de propósito: o Detalhamento por SKU e a tabela de estoque mínimo
 * ordenam com esta mesma função (listas e colunas diferentes, regra idêntica),
 * para "vazio sempre por último" e o desempate estável não divergirem entre as
 * duas com o tempo.
 */
function ordenaLinhas<T, Id extends string>(
  rows: T[],
  ordem: { col: Id; dir: DirecaoOrdem },
  colunas: readonly { id: Id; chave: (r: T) => number | string | null }[]
): T[] {
  const coluna = colunas.find((c) => c.id === ordem.col);
  if (!coluna) return rows;
  const f = ordem.dir === "asc" ? 1 : -1;
  const dec = rows.map((r, i) => ({ r, i, k: coluna.chave(r) as number | string | null }));
  dec.sort((a, b) => {
    if (a.k === null || b.k === null) {
      if (a.k === b.k) return a.i - b.i;
      return a.k === null ? 1 : -1; // vazio sempre depois, seja qual for a direção
    }
    // SKU pode misturar número e texto: número antes de texto, numa ordem total.
    if (typeof a.k !== typeof b.k) return (typeof a.k === "number" ? -1 : 1) * f;
    if (a.k < b.k) return -f;
    if (a.k > b.k) return f;
    return a.i - b.i;
  });
  return dec.map((d) => d.r);
}

/**
 * Em tela cheia só o Fabricante muda: ganha largura para uns 25 caracteres
 * (código em fonte mono de 12px ≈ 7px por caractere, mais o padding). Fora dela
 * a coluna continua estreita, porque a largura da página não comporta mais.
 */
const FABRICANTE_TELA_CHEIA_PX = 230;

function colunasSku(telaCheia: boolean): { template: string; minWidth: number } {
  const px = COLUNAS_SKU.map((c) => (c.id === "fabricante" && telaCheia ? FABRICANTE_TELA_CHEIA_PX : c.largura));
  return {
    template: px.map((w, i) => (COLUNAS_SKU[i].id === "descricao" ? `minmax(${w}px,2fr)` : `${w}px`)).join(" "),
    minWidth: px.reduce((s, w) => s + w, 0),
  };
}

/**
 * Cabeçalho clicável: seta para cima = crescente, para baixo = decrescente.
 * Serve as duas tabelas ordenáveis da tela (Detalhamento por SKU e estoque
 * mínimo) — recebe o rótulo já resolvido em vez da coluna inteira.
 */
function CabecalhoOrdenavel<Id extends string>({
  id, rotulo, align, ordem, onOrdena,
}: {
  id: Id;
  rotulo: string;
  align: "left" | "right";
  ordem: { col: Id; dir: DirecaoOrdem } | null;
  onOrdena: (id: Id) => void;
}) {
  const ativo = ordem?.col === id;
  const direita = align === "right";
  const Icone = ativo ? (ordem.dir === "asc" ? ArrowUp : ArrowDown) : ArrowUpDown;
  const dica = ativo
    ? `Ordenado ${ordem.dir === "asc" ? "crescente" : "decrescente"} por ${rotulo} — clique para inverter`
    : `Ordenar por ${rotulo}`;
  // A seta ocupa espaço SEMPRE (só a opacidade muda), para o cabeçalho não pular.
  const seta = (
    <Icone
      className={cn(
        "h-3 w-3 shrink-0 transition-opacity",
        ativo ? "opacity-100" : "opacity-0 group-hover:opacity-50 group-focus-visible:opacity-50"
      )}
    />
  );
  return (
    <button
      type="button"
      onClick={() => onOrdena(id)}
      title={dica}
      aria-label={dica}
      className={cn(
        "group flex h-full w-full items-center gap-1 py-2 font-medium uppercase tracking-[0.14em]",
        "transition-colors hover:text-foreground focus-visible:bg-muted/40 focus-visible:outline-none",
        direita ? "justify-end pl-1 pr-3" : "justify-start pl-3 pr-1",
        ativo && "text-foreground"
      )}
    >
      {direita && seta}
      <span className="whitespace-nowrap">{rotulo}</span>
      {!direita && seta}
    </button>
  );
}

const SKU_ROW_HEIGHT = 40;

/**
 * Tabela virtualizada: o servidor já manda o conjunto INTEIRO filtrado (pode
 * ser dezenas de milhares de SKUs), então só as linhas dentro da janela de
 * rolagem viram DOM de verdade — o resto existe apenas como espaço reservado
 * (`getTotalSize()`). Layout em grid (não `<table>`) porque `position:
 * absolute` nas linhas não funciona dentro de `<tbody>`; cabeçalho e linhas
 * compartilham o mesmo template (`colunasSku`) pra colunas ficarem alinhadas.
 */
function VirtualizedSkuTable({
  rows,
  currency,
  displayCode,
  telaCheia,
  ordem,
  onOrdena,
}: {
  rows: InventoryRow[];
  currency: AppCurrencyId | string;
  displayCode: string;
  /** Ocupa toda a altura que sobra do card, em vez do teto de 70% da janela. */
  telaCheia: boolean;
  ordem: OrdemSku | null;
  onOrdena: (id: ColunaSkuId) => void;
}) {
  const parentRef = React.useRef<HTMLDivElement>(null);
  const { template: gridCols, minWidth } = colunasSku(telaCheia);

  // Outra ordem = outra lista: volta ao topo em vez de ficar no meio dela.
  React.useEffect(() => {
    parentRef.current?.scrollTo({ top: 0 });
  }, [ordem]);

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => SKU_ROW_HEIGHT,
    overscan: 12,
  });

  return (
    <div
      ref={parentRef}
      className={cn(
        "overflow-auto border-t border-border",
        // `overscroll-contain`: ao chegar no fim da tabela a roda do mouse não
        // "vaza" para rolar a página que está por trás.
        telaCheia ? "min-h-0 flex-1 overscroll-contain" : "max-h-[70vh]"
      )}
    >
      <div style={{ minWidth }}>
        <div
          className="grid items-stretch sticky top-0 z-10 border-b border-border bg-surface text-[10px] uppercase tracking-[0.14em] text-muted-foreground"
          style={{ gridTemplateColumns: gridCols }}
        >
          {COLUNAS_SKU.map((c) => (
            <CabecalhoOrdenavel
              key={c.id}
              id={c.id}
              rotulo={c.rotulo(displayCode)}
              align={c.align}
              ordem={ordem}
              onOrdena={onOrdena}
            />
          ))}
        </div>

        <div style={{ height: virtualizer.getTotalSize(), position: "relative" }}>
          {virtualizer.getVirtualItems().map((vRow) => {
            const r = rows[vRow.index];
            return (
              <div
                key={r.productId}
                className="absolute left-0 top-0 grid w-full items-center border-b border-border text-sm hover:bg-muted/30"
                style={{
                  gridTemplateColumns: gridCols,
                  height: vRow.size,
                  transform: `translateY(${vRow.start}px)`,
                }}
              >
                <div className="py-2 px-3 truncate font-mono text-xs text-muted-foreground tabular">
                  {r.productId}
                </div>
                <div
                  className="py-2 px-3 truncate font-mono text-xs text-muted-foreground"
                  title={r.manufacturerCode || undefined}
                >
                  {r.manufacturerCode || "—"}
                </div>
                <div
                  className={cn("py-2 px-3 truncate", !r.hasInventory && "text-warning")}
                  title={!r.hasInventory ? "fora do snapshot de estoque" : r.description}
                >
                  {r.description || "—"}
                  {!r.hasInventory && (
                    <AlertTriangle className="ml-1 inline h-3 w-3 -translate-y-px" />
                  )}
                </div>
                <div className="py-2 px-3 truncate text-muted-foreground">
                  {r.subgroupName || "—"}
                </div>
                <div className="py-2 px-3 text-right tabular">{formatNumber(r.stock)}</div>
                <div className="py-2 px-3 text-right tabular text-muted-foreground">
                  {r.minStock > 0 ? (
                    <span className={cn(r.stock <= r.minStock && "text-warning font-medium")}>
                      {formatNumber(r.minStock)}
                    </span>
                  ) : (
                    "—"
                  )}
                </div>
                <div className="py-2 px-3 text-right tabular font-medium">
                  {formatCurrency(r.costTotalUSD, currency, { compact: r.costTotalUSD >= 10000 })}
                </div>
                <div className="py-2 px-3 text-right tabular">
                  {r.unitsSold > 0 ? formatNumber(r.unitsSold) : "—"}
                </div>
                <div className="py-2 px-3 text-right tabular text-muted-foreground">
                  {r.revenueSold > 0 ? <Money value={r.revenueSold} compact /> : "—"}
                </div>
                <div className="py-2 px-3 text-right tabular">
                  <CoverageCell row={r} />
                </div>
                <div className="py-2 px-3 truncate text-right tabular text-xs text-muted-foreground">
                  {r.lastSaleDate
                    ? `${r.lastSaleDate}${Number.isFinite(r.daysSinceLastSale) ? ` · há ${r.daysSinceLastSale}d` : ""}`
                    : "—"}
                </div>
                <div className="py-2 px-3">
                  <StatusBadge status={r.status} />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/**
 * "Abaixo do estoque mínimo", virtualizada como o Detalhamento e com altura
 * limitada: a lista pode passar de mil itens e antes crescia sem teto, empurrando
 * o Detalhamento para fora da tela. Aqui ela para em ~15 linhas e rola por dentro.
 *
 * Mesma razão do Detalhamento para usar grid em vez de `<table>`: linha
 * posicionada com `position: absolute` não funciona dentro de `<tbody>`.
 */
const MINIMO_MAX_H = 15 * SKU_ROW_HEIGHT;

function VirtualizedMinStockTable({
  rows, ordem, onOrdena,
}: {
  rows: MinStockRow[];
  ordem: OrdemMinimo | null;
  onOrdena: (id: ColunaMinimoId) => void;
}) {
  const parentRef = React.useRef<HTMLDivElement>(null);

  // Outra ordem ou outra busca = outra lista: volta ao topo.
  React.useEffect(() => {
    parentRef.current?.scrollTo({ top: 0 });
  }, [ordem, rows]);

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => SKU_ROW_HEIGHT,
    overscan: 8,
  });

  if (rows.length === 0) {
    return (
      <p className="border-t border-border px-5 py-8 text-center text-sm text-muted-foreground">
        Nenhum item abaixo do mínimo corresponde à busca.
      </p>
    );
  }

  return (
    <div
      ref={parentRef}
      className="overflow-auto overscroll-contain border-t border-border"
      style={{ maxHeight: MINIMO_MAX_H }}
    >
      <div style={{ minWidth: MINIMO_MIN_WIDTH }}>
        <div
          className="grid items-stretch sticky top-0 z-10 border-b border-border bg-surface text-[10px] uppercase tracking-[0.14em] text-muted-foreground"
          style={{ gridTemplateColumns: MINIMO_TEMPLATE }}
        >
          {COLUNAS_MINIMO.map((c) => (
            <CabecalhoOrdenavel
              key={c.id}
              id={c.id}
              rotulo={c.rotulo}
              align={c.align}
              ordem={ordem}
              onOrdena={onOrdena}
            />
          ))}
        </div>

        <div style={{ height: virtualizer.getTotalSize(), position: "relative" }}>
          {virtualizer.getVirtualItems().map((vRow) => {
            const r = rows[vRow.index];
            const gap = r.minStock - r.stock;
            return (
              <div
                key={r.productId}
                className="absolute left-0 top-0 grid w-full items-center border-b border-border text-sm hover:bg-muted/30"
                style={{
                  gridTemplateColumns: MINIMO_TEMPLATE,
                  height: vRow.size,
                  transform: `translateY(${vRow.start}px)`,
                }}
              >
                <div className="py-2 px-3 truncate font-mono text-xs text-muted-foreground tabular">
                  {r.productId}
                </div>
                <div className="py-2 px-3 truncate font-medium" title={r.description || undefined}>
                  {r.description || "—"}
                </div>
                <div
                  className="py-2 px-3 truncate font-mono text-xs text-muted-foreground"
                  title={r.manufacturerCode || undefined}
                >
                  {r.manufacturerCode || "—"}
                </div>
                <div
                  className={cn(
                    "py-2 px-3 text-right tabular font-medium",
                    r.stock === 0 ? "text-negative" : "text-warning"
                  )}
                >
                  {formatNumber(r.stock)}
                </div>
                <div className="py-2 px-3 text-right tabular text-muted-foreground">
                  {formatNumber(r.minStock)}
                </div>
                <div className="py-2 px-3 text-right tabular">
                  <span className="inline-flex items-center gap-1 font-medium text-warning">
                    <AlertTriangle className="h-3 w-3 shrink-0" />
                    {formatNumber(gap)}
                  </span>
                </div>
                <div className="py-2 px-3">
                  <StatusBadge status={r.status} />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// Compact list used by the rupture/movers/dormant cards
function CompactList({
  rows,
  mode,
  emptyMessage,
  displayCurrencyId,
}: {
  rows: InventoryRow[];
  mode: "rupture" | "movers" | "dormant";
  emptyMessage: string;
  displayCurrencyId: AppCurrencyId | string;
}) {
  if (rows.length === 0) {
    return <div className="px-5 py-8 text-center text-xs text-muted-foreground">{emptyMessage}</div>;
  }
  return (
    <ul className="divide-y divide-border">
      {rows.map((r, i) => (
        <li
          key={r.productId}
          className="grid grid-cols-[24px_1fr_auto] items-center gap-3 px-5 py-2.5"
        >
          <span className="text-[10px] font-mono text-muted-foreground tabular">
            {(i + 1).toString().padStart(2, "0")}
          </span>
          <div className="min-w-0">
            <div className="truncate text-[13px] font-medium text-foreground">
              {r.description || r.productId}
            </div>
            <div className="mt-0.5 flex items-center gap-2 text-[10px] text-muted-foreground font-mono">
              <span>{r.productId}</span>
              {r.manufacturerCode && <span>· {r.manufacturerCode}</span>}
              {r.subgroupName && <span className="truncate">· {r.subgroupName}</span>}
            </div>
          </div>
          <div className="text-right shrink-0">
            {mode === "rupture" && <RuptureMeta row={r} />}
            {mode === "movers" && <MoversMeta row={r} />}
            {mode === "dormant" && <DormantMeta row={r} displayCurrencyId={displayCurrencyId} />}
          </div>
        </li>
      ))}
    </ul>
  );
}

function RuptureMeta({ row }: { row: InventoryRow }) {
  if (row.status === "rupture") {
    return (
      <div className="space-y-0.5">
        <StatusBadge status="rupture" />
        <div className="text-[10px] text-muted-foreground tabular">
          {formatNumber(row.unitsSold)} un / período · {formatNumber(row.ordersCount)} pedidos
        </div>
      </div>
    );
  }
  return (
    <div className="space-y-0.5">
      <div className="flex items-center justify-end gap-1.5 text-[12px] font-medium text-warning tabular">
        <AlertTriangle className="h-3 w-3" />
        {Math.round(row.coverageDays)} d
      </div>
      <div className="text-[10px] text-muted-foreground tabular">
        estoque {formatNumber(row.stock)} · sai {row.avgDailyDemand.toFixed(2)}/dia
      </div>
    </div>
  );
}

function MoversMeta({ row }: { row: InventoryRow }) {
  return (
    <div className="space-y-0.5">
      <div className="text-[12px] font-medium tabular text-foreground">
        {formatNumber(row.unitsSold)} un
      </div>
      <div className="text-[10px] text-muted-foreground tabular">
        estoque {formatNumber(row.stock)} · cobertura{" "}
        {Number.isFinite(row.coverageDays) ? `${Math.round(row.coverageDays)} d` : "—"}
      </div>
    </div>
  );
}

function DormantMeta({ row, displayCurrencyId }: { row: InventoryRow; displayCurrencyId: AppCurrencyId | string }) {
  return (
    <div className="space-y-0.5">
      <div className="text-[12px] font-medium tabular text-foreground">
        {formatCurrency(row.costTotalUSD, displayCurrencyId, { compact: true })}
      </div>
      <div className="text-[10px] text-muted-foreground tabular">
        {formatNumber(row.stock)} un parados
        {row.lastSaleDate ? ` · última saída ${row.lastSaleDate}` : " · sem histórico"}
      </div>
    </div>
  );
}
