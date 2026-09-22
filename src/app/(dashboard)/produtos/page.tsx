"use client";

import * as React from "react";
import { ArrowRight, ChevronRight, Download, Layers, Package, Tag, TrendingUp } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { EmptyState } from "@/components/dashboard/empty-state";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { BarChartH } from "@/components/charts/bar-chart-h";
import { DonutChart } from "@/components/charts/donut-chart";
import { Money } from "@/components/dashboard/money";
import {
  useProdutosAnalytics,
  useProdutosDaMarca,
  useProdutosPagina,
  type MarcaABC,
  type ProdutoABC,
  type ProdutoDaMarca,
  type ProdutoLucro,
  type ProdutosDaMarcaView,
} from "@/lib/hooks/use-produtos-analytics";
import { formatNumber, formatPercent } from "@/lib/utils/format";
import { exportarExcel } from "@/lib/utils/export-excel";
import { cn } from "@/lib/utils";
import { useTranslation } from "@/lib/hooks/use-translation";

/** Acima disto o drill-down de uma marca sugere o Excel em vez da lista inteira — espelha o servidor. */
const MAX_PRODUTOS_POR_MARCA = 500;

/** Estável de propósito: um `[]` novo a cada render reiniciaria a paginação. */
const SEM_LINHAS: never[] = [];

/** Chegou perto do fim do container de rolagem? Hora de pedir a próxima página. */
const pertoDoFim = (e: React.UIEvent<HTMLDivElement>) =>
  e.currentTarget.scrollHeight - e.currentTarget.scrollTop - e.currentTarget.clientHeight < 240;

/** "50 de 3.412 — role para carregar o restante." + estado da carga. */
function RodapePaginacao({
  shown, total, hasMore, loading, error,
}: { shown: number; total: number; hasMore: boolean; loading: boolean; error: string | null }) {
  const { t } = useTranslation();
  return (
    <p className="border-t border-border px-5 pt-3 text-[11px] text-muted-foreground">
      {error
        ? <span className="text-negative">{error}</span>
        : loading
          ? t("produtos.table.loading")
          : t(hasMore ? "produtos.table.loaded.more" : "produtos.table.loaded.all", {
              shown: formatNumber(shown),
              total: formatNumber(total),
            })}
    </p>
  );
}

export default function ProdutosPage() {
  const { t } = useTranslation();

  // Tudo agregado no servidor: curvas ABC, ranking por lucro e categorias já
  // chegam classificados, com os totais calculados sobre a lista inteira.
  const { data, loading, error, filtros } = useProdutosAnalytics();

  const abc = data?.topProducts ?? [];
  const catABC = data?.subgroups ?? [];
  const marcaABC = data?.brands ?? [];
  const donut = data?.donut ?? [];

  const aCount = data?.curveCounts.A ?? 0;
  const bCount = data?.curveCounts.B ?? 0;
  const cCount = data?.curveCounts.C ?? 0;
  const totalUnits = data?.totals.units ?? 0;
  const totalRevenue = data?.totals.revenue ?? 0;
  const produtosComVenda = data?.productsWithSales ?? 0;
  const totalProdutos = data?.totalProducts ?? 0;

  // As duas tabelas grandes listam TODOS os produtos com venda no período: a
  // primeira página vem na resposta da tela, o resto é pedido ao rolar. O
  // gráfico do topo continua usando só `abc` (as 12 primeiras linhas).
  const abcPag = useProdutosPagina<ProdutoABC>(
    "abc", data?.topProducts ?? SEM_LINHAS, data?.productsWithSales ?? 0, filtros
  );
  const lucroPag = useProdutosPagina<ProdutoLucro>(
    "lucro", data?.profitRanking ?? SEM_LINHAS, data?.profitTotals.count ?? 0, filtros
  );

  // Curva ABC por marca: clicar na linha expande os produtos daquela marca,
  // com curva LOCAL (participação sobre o total DA MARCA, não do catálogo).
  // Uma marca aberta por vez — abrir outra fecha a anterior.
  const [marcaAberta, setMarcaAberta] = React.useState<string | null>(null);
  const toggleMarca = (id: string) => setMarcaAberta((atual) => (atual === id ? null : id));
  const marcaDrill = useProdutosDaMarca(marcaAberta, filtros);

  if (error) {
    return (
      <div className="space-y-8">
        <PageHeader eyebrow={t("produtos.header.eyebrow")} title={t("produtos.header.title")} description={t("produtos.header.desc")} />
        <div className="rounded-lg border border-negative/30 bg-negative/10 px-4 py-3 text-sm text-negative">
          Não foi possível carregar os produtos: {error}
        </div>
      </div>
    );
  }

  if (!data?.hasData) {
    return (
      <div className="space-y-8">
        <PageHeader eyebrow={t("produtos.header.eyebrow")} title={t("produtos.header.title")} description={t("produtos.header.desc")} />
        {loading ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-[104px] animate-pulse rounded-lg bg-muted/40" />
            ))}
          </div>
        ) : (
          <EmptyState />
        )}
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow={t("produtos.header.eyebrow")}
        title={t("produtos.header.title")}
        description={t("produtos.header.desc")}
      >
        <Badge variant="ghost" className="gap-1">
          <Package className="h-3 w-3" />
          {t("produtos.header.badge", { count: totalProdutos })}
        </Badge>
      </PageHeader>

      <section className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard label={t("produtos.kpi.units")} value={formatNumber(totalUnits)} />
        <KpiCard label={t("produtos.kpi.revenue")} value={<><Money value={totalRevenue} compact /></> as never} accent="accent" />
        <KpiCard label={t("produtos.kpi.curveA")} caption={t("produtos.kpi.curveA.caption", { count: aCount })} value={formatPercent(aCount / Math.max(1, produtosComVenda))} />
        <KpiCard label={t("produtos.kpi.stuck")} caption={t("produtos.kpi.stuck.caption")} value={formatNumber(totalProdutos - produtosComVenda)} />
      </section>

      <section className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>{t("produtos.chart.ranking.title")}</CardTitle>
              <Badge variant="ghost" className="gap-1">
                <TrendingUp className="h-3 w-3" /> {t("produtos.chart.ranking.badge")}
              </Badge>
            </div>
          </CardHeader>
          <CardContent>
            <BarChartH
              rows={abc.slice(0, 12).map((e) => ({
                key: e.id,
                label: e.name,
                // Código do fabricante logo abaixo da descrição. Vem do ESTOQUE:
                // produto ausente do snapshot fica sem a linha.
                sublabel: e.manufacturerCode ? `Fab. ${e.manufacturerCode}` : undefined,
                value: e.revenue,
                secondary: `${formatNumber(e.units)} un · ${e.curve}`,
                tone: e.curve === "A" ? "accent" : "muted",
              }))}
              maxRows={12}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t("produtos.chart.mix.title")}</CardTitle>
          </CardHeader>
          <CardContent>
            <DonutChart data={donut} centerLabel={t("produtos.chart.mix.center")} centerValue={String(donut.length)} isCurrency height={200} />
            <a
              href="#categorias-abc"
              className="mt-3 flex items-center justify-center gap-1.5 rounded-md border border-border py-2 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground"
            >
              {t("produtos.chart.mix.link")}
              <ArrowRight className="h-3 w-3" />
            </a>
          </CardContent>
        </Card>
      </section>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>{t("produtos.table.title")}</CardTitle>
            <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <CurvaLegend curve="A" count={aCount} />
              <CurvaLegend curve="B" count={bCount} />
              <CurvaLegend curve="C" count={cCount} />
            </div>
          </div>
        </CardHeader>
        <CardContent className="px-0">
          <div onScroll={(e) => pertoDoFim(e) && abcPag.loadMore()} className="overflow-x-auto overflow-y-auto max-h-[720px]">
            <table className="w-full text-sm">
              <thead className="[&_th]:sticky [&_th]:top-0 [&_th]:z-10 [&_th]:bg-surface [&_th]:border-b [&_th]:border-border">
                <tr className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                  <th className="text-left font-medium py-2 px-5">#</th>
                  <th className="text-left font-medium py-2 px-5">{t("produtos.table.col.product")}</th>
                  <th className="text-left font-medium py-2 px-5">{t("produtos.table.col.category")}</th>
                  <th className="text-right font-medium py-2 px-5">{t("produtos.table.col.units")}</th>
                  <th className="text-right font-medium py-2 px-5">{t("produtos.table.col.revenue")}</th>
                  <th className="text-right font-medium py-2 px-5">{t("produtos.table.col.share")}</th>
                  <th className="text-right font-medium py-2 px-5">{t("produtos.table.col.acc")}</th>
                  <th className="text-left font-medium py-2 px-5">{t("produtos.table.col.curve")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {abcPag.rows.map((e, i) => (
                  <tr key={e.id} className="hover:bg-muted/30 transition-colors">
                    <td className="py-2 px-5 font-mono text-xs text-muted-foreground tabular">
                      {(i + 1).toString().padStart(2, "0")}
                    </td>
                    <td className="py-2 px-5 max-w-[260px] truncate">
                      <div className="font-medium">{e.name}</div>
                      <div className="text-xs text-muted-foreground font-mono">
                        {e.id}
                        {e.manufacturerCode && <span> · {e.manufacturerCode}</span>}
                      </div>
                    </td>
                    <td className="py-2 px-5 text-muted-foreground">{e.subgroupName}</td>
                    <td className="py-2 px-5 text-right tabular">{formatNumber(e.units)}</td>
                    <td className="py-2 px-5 text-right tabular font-medium">
                      <Money value={e.revenue} />
                    </td>
                    <td className="py-2 px-5 text-right tabular text-muted-foreground">
                      {formatPercent(e.share, { decimals: 2 })}
                    </td>
                    <td className="py-2 px-5 text-right tabular text-muted-foreground">
                      {formatPercent(e.cumulativeShare, { decimals: 1 })}
                    </td>
                    <td className="py-2 px-5">
                      <CurvaBadge curve={e.curve} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <RodapePaginacao shown={abcPag.rows.length} total={abcPag.total} hasMore={abcPag.hasMore} loading={abcPag.loadingMais} error={abcPag.error} />
        </CardContent>
      </Card>

      {/* ── Ranking por Lucro ──────────────────────────────────────────────── */}
      <Card id="ranking-lucro" className="scroll-mt-24">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Ranking por Lucro</CardTitle>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                Produtos ordenados do maior ao menor lucro (receita − custo) no período.
              </p>
            </div>
            <Badge variant="ghost">{data.profitTotals.count} produtos</Badge>
          </div>
        </CardHeader>
        <CardContent className="px-0">
          <div onScroll={(e) => pertoDoFim(e) && lucroPag.loadMore()} className="overflow-x-auto overflow-y-auto max-h-[720px]">
            <table className="w-full text-sm">
              <thead className="[&_th]:sticky [&_th]:top-0 [&_th]:z-10 [&_th]:bg-surface [&_th]:border-b [&_th]:border-border">
                <tr className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                  <th className="text-left font-medium py-2 px-5">#</th>
                  <th className="text-left font-medium py-2 px-5">Produto</th>
                  <th className="text-left font-medium py-2 px-5">Categoria</th>
                  <th className="text-right font-medium py-2 px-5">Unidades</th>
                  <th className="text-right font-medium py-2 px-5">Receita</th>
                  <th className="text-right font-medium py-2 px-5">Custo</th>
                  <th className="text-right font-medium py-2 px-5">Lucro</th>
                  <th className="text-right font-medium py-2 px-5">Margem</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {lucroPag.rows.map((e, i) => (
                  <tr key={e.productId} className="hover:bg-muted/30 transition-colors">
                    <td className="py-2 px-5 font-mono text-xs text-muted-foreground tabular">
                      {(i + 1).toString().padStart(2, "0")}
                    </td>
                    <td className="py-2 px-5 max-w-[260px] truncate">
                      <div className="font-medium">{e.productName}</div>
                      <div className="text-xs text-muted-foreground font-mono">
                        {e.productId}
                        {e.manufacturerCode && <span> · {e.manufacturerCode}</span>}
                      </div>
                    </td>
                    <td className="py-2 px-5 text-muted-foreground">{e.subgroupName}</td>
                    <td className="py-2 px-5 text-right tabular">{formatNumber(e.units)}</td>
                    <td className="py-2 px-5 text-right tabular">
                      <Money value={e.revenue} />
                    </td>
                    <td className="py-2 px-5 text-right tabular text-muted-foreground">
                      <Money value={e.cost} />
                    </td>
                    <td className={cn("py-2 px-5 text-right tabular font-medium", e.profit >= 0 ? "text-positive" : "text-negative")}>
                      <Money value={e.profit} />
                    </td>
                    <td className="py-2 px-5 text-right tabular">
                      <MarginBadge pct={e.marginPct} />
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="[&_td]:sticky [&_td]:bottom-0 [&_td]:z-10 [&_td]:bg-surface [&_td]:border-t [&_td]:border-border">
                <tr className="text-[11px] font-medium">
                  <td className="py-2.5 px-5" />
                  {/* Totais sobre TODOS os produtos do período, não só os 30 exibidos. */}
                  <td className="py-2.5 px-5 uppercase tracking-[0.1em] text-muted-foreground">
                    Total · {data.profitTotals.count} produtos
                  </td>
                  <td className="py-2.5 px-5" />
                  <td className="py-2.5 px-5 text-right tabular">
                    {formatNumber(data.profitTotals.units)}
                  </td>
                  <td className="py-2.5 px-5 text-right tabular">
                    <Money value={data.profitTotals.revenue} />
                  </td>
                  <td className="py-2.5 px-5 text-right tabular text-muted-foreground">
                    <Money value={data.profitTotals.cost} />
                  </td>
                  <td className="py-2.5 px-5 text-right tabular text-positive font-medium">
                    <Money value={data.profitTotals.profit} />
                  </td>
                  <td className="py-2.5 px-5 text-right tabular">
                    <MarginBadge
                      pct={data.profitTotals.revenue > 0 ? data.profitTotals.profit / data.profitTotals.revenue : 0}
                    />
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
          <RodapePaginacao shown={lucroPag.rows.length} total={lucroPag.total} hasMore={lucroPag.hasMore} loading={lucroPag.loadingMais} error={lucroPag.error} />
        </CardContent>
      </Card>

      <Card id="categorias-abc" className="scroll-mt-24">
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Layers className="h-4 w-4 text-muted-foreground" />
              <div>
                <CardTitle>{t("produtos.cat.title")}</CardTitle>
                <p className="mt-0.5 text-[11px] text-muted-foreground">{t("produtos.cat.desc")}</p>
              </div>
            </div>
            <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <CurvaLegend curve="A" count={catABC.filter((c) => c.curve === "A").length} />
              <CurvaLegend curve="B" count={catABC.filter((c) => c.curve === "B").length} />
              <CurvaLegend curve="C" count={catABC.filter((c) => c.curve === "C").length} />
            </div>
          </div>
        </CardHeader>
        <CardContent className="px-0">
          <div className="overflow-x-auto overflow-y-auto max-h-[720px]">
            <table className="w-full text-sm">
              <thead className="[&_th]:sticky [&_th]:top-0 [&_th]:z-10 [&_th]:bg-surface [&_th]:border-b [&_th]:border-border">
                <tr className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                  <th className="text-left font-medium py-2 px-5">#</th>
                  <th className="text-left font-medium py-2 px-5">{t("produtos.table.col.category")}</th>
                  <th className="text-right font-medium py-2 px-5">{t("produtos.cat.col.skus")}</th>
                  <th className="text-right font-medium py-2 px-5">{t("produtos.table.col.units")}</th>
                  <th className="text-right font-medium py-2 px-5">{t("produtos.table.col.revenue")}</th>
                  <th className="text-right font-medium py-2 px-5">{t("produtos.table.col.share")}</th>
                  <th className="text-right font-medium py-2 px-5">{t("produtos.table.col.acc")}</th>
                  <th className="text-left font-medium py-2 px-5">{t("produtos.table.col.curve")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {catABC.map((c, i) => (
                  <tr key={c.id} className="hover:bg-muted/30 transition-colors">
                    <td className="py-2 px-5 font-mono text-xs text-muted-foreground tabular">
                      {(i + 1).toString().padStart(2, "0")}
                    </td>
                    <td className="py-2 px-5 max-w-[280px] truncate font-medium">{c.name || "—"}</td>
                    <td className="py-2 px-5 text-right tabular text-muted-foreground">{formatNumber(c.productCount)}</td>
                    <td className="py-2 px-5 text-right tabular">{formatNumber(c.units)}</td>
                    <td className="py-2 px-5 text-right tabular font-medium">
                      <Money value={c.revenue} />
                    </td>
                    <td className="py-2 px-5 text-right tabular text-muted-foreground">
                      {formatPercent(c.share, { decimals: 2 })}
                    </td>
                    <td className="py-2 px-5 text-right tabular text-muted-foreground">
                      {formatPercent(c.cumulativeShare, { decimals: 1 })}
                    </td>
                    <td className="py-2 px-5">
                      <CurvaBadge curve={c.curve} />
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="[&_td]:sticky [&_td]:bottom-0 [&_td]:z-10 [&_td]:bg-surface [&_td]:border-t [&_td]:border-border">
                <tr className="text-[11px] font-medium">
                  <td className="py-2.5 px-5" />
                  <td className="py-2.5 px-5 uppercase tracking-[0.1em] text-muted-foreground">
                    {t("produtos.cat.total", { count: catABC.length })}
                  </td>
                  <td className="py-2.5 px-5 text-right tabular text-muted-foreground">
                    {formatNumber(catABC.reduce((s, c) => s + c.productCount, 0))}
                  </td>
                  <td className="py-2.5 px-5 text-right tabular">
                    {formatNumber(catABC.reduce((s, c) => s + c.units, 0))}
                  </td>
                  <td className="py-2.5 px-5 text-right tabular">
                    <Money value={catABC.reduce((s, c) => s + c.revenue, 0)} />
                  </td>
                  <td className="py-2.5 px-5" colSpan={3} />
                </tr>
              </tfoot>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* ── Curva ABC por Marca ────────────────────────────────────────────── */}
      <Card id="marcas-abc" className="scroll-mt-24">
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Tag className="h-4 w-4 text-muted-foreground" />
              <div>
                <CardTitle>{t("produtos.marca.title")}</CardTitle>
                <p className="mt-0.5 text-[11px] text-muted-foreground">{t("produtos.marca.desc")}</p>
              </div>
            </div>
            <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <CurvaLegend curve="A" count={marcaABC.filter((m) => m.curve === "A").length} />
              <CurvaLegend curve="B" count={marcaABC.filter((m) => m.curve === "B").length} />
              <CurvaLegend curve="C" count={marcaABC.filter((m) => m.curve === "C").length} />
            </div>
          </div>
        </CardHeader>
        <CardContent className="px-0">
          <div className="overflow-x-auto overflow-y-auto max-h-[720px]">
            <table className="w-full text-sm">
              <thead className="[&_th]:sticky [&_th]:top-0 [&_th]:z-10 [&_th]:bg-surface [&_th]:border-b [&_th]:border-border">
                <tr className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                  <th className="text-left font-medium py-2 px-5">#</th>
                  <th className="text-left font-medium py-2 px-5">{t("produtos.marca.col.brand")}</th>
                  <th className="text-right font-medium py-2 px-5">{t("produtos.cat.col.skus")}</th>
                  <th className="text-right font-medium py-2 px-5">{t("produtos.table.col.units")}</th>
                  <th className="text-right font-medium py-2 px-5">{t("produtos.table.col.revenue")}</th>
                  <th className="text-right font-medium py-2 px-5">{t("produtos.table.col.share")}</th>
                  <th className="text-right font-medium py-2 px-5">{t("produtos.table.col.acc")}</th>
                  <th className="text-left font-medium py-2 px-5">{t("produtos.table.col.curve")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {marcaABC.map((m, i) => {
                  const aberta = marcaAberta === m.id;
                  return (
                    <React.Fragment key={m.id}>
                      <tr
                        role="button"
                        tabIndex={0}
                        aria-expanded={aberta}
                        onClick={() => toggleMarca(m.id)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            toggleMarca(m.id);
                          }
                        }}
                        className={cn(
                          "cursor-pointer transition-colors hover:bg-muted/30 focus-visible:bg-muted/30 focus-visible:outline-none",
                          aberta && "bg-accent/5 hover:bg-accent/10"
                        )}
                      >
                        <td className="py-2 px-5">
                          <span className="inline-flex items-center gap-1.5 font-mono text-xs text-muted-foreground tabular">
                            <ChevronRight
                              className={cn(
                                "h-3.5 w-3.5 shrink-0 text-muted-foreground/60 transition-transform",
                                aberta && "rotate-90 text-foreground"
                              )}
                            />
                            {(i + 1).toString().padStart(2, "0")}
                          </span>
                        </td>
                        <td className="py-2 px-5 max-w-[280px] truncate font-medium">
                          {m.name || <span className="text-muted-foreground">{t("produtos.marca.none")}</span>}
                        </td>
                        <td className="py-2 px-5 text-right tabular text-muted-foreground">{formatNumber(m.productCount)}</td>
                        <td className="py-2 px-5 text-right tabular">{formatNumber(m.units)}</td>
                        <td className="py-2 px-5 text-right tabular font-medium">
                          <Money value={m.revenue} />
                        </td>
                        <td className="py-2 px-5 text-right tabular text-muted-foreground">
                          {formatPercent(m.share, { decimals: 2 })}
                        </td>
                        <td className="py-2 px-5 text-right tabular text-muted-foreground">
                          {formatPercent(m.cumulativeShare, { decimals: 1 })}
                        </td>
                        <td className="py-2 px-5">
                          <CurvaBadge curve={m.curve} />
                        </td>
                      </tr>
                      {aberta && (
                        <tr className="bg-muted/10">
                          <td colSpan={8} className="p-0">
                            <ProdutosDaMarcaPainel marca={m} drill={marcaDrill} />
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
              <tfoot className="[&_td]:sticky [&_td]:bottom-0 [&_td]:z-10 [&_td]:bg-surface [&_td]:border-t [&_td]:border-border">
                <tr className="text-[11px] font-medium">
                  <td className="py-2.5 px-5" />
                  <td className="py-2.5 px-5 uppercase tracking-[0.1em] text-muted-foreground">
                    {t("produtos.marca.total", { count: marcaABC.length })}
                  </td>
                  <td className="py-2.5 px-5 text-right tabular text-muted-foreground">
                    {formatNumber(marcaABC.reduce((s, m) => s + m.productCount, 0))}
                  </td>
                  <td className="py-2.5 px-5 text-right tabular">
                    {formatNumber(marcaABC.reduce((s, m) => s + m.units, 0))}
                  </td>
                  <td className="py-2.5 px-5 text-right tabular">
                    <Money value={marcaABC.reduce((s, m) => s + m.revenue, 0)} />
                  </td>
                  <td className="py-2.5 px-5" colSpan={3} />
                </tr>
              </tfoot>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

/** Linhas do Excel de uma marca — números crus, o Excel formata sozinho. */
function exportarProdutosDaMarcaExcel(nomeMarca: string, itens: ProdutoDaMarca[]) {
  const linhas = itens.map((p) => ({
    SKU: p.id,
    Descrição: p.name,
    Fabricante: p.manufacturerCode ?? "",
    Categoria: p.subgroupName,
    Unidades: p.units,
    Receita: p.revenue,
    "% da marca": Number((p.share * 100).toFixed(2)),
    "Acumulado (%)": Number((p.cumulativeShare * 100).toFixed(1)),
    Curva: p.curve,
  }));

  const agora = new Date();
  const carimbo = [
    agora.getFullYear(),
    String(agora.getMonth() + 1).padStart(2, "0"),
    String(agora.getDate()).padStart(2, "0"),
  ].join("-");
  // Nome de arquivo sem caractere problemático em disco (barra, dois-pontos etc.).
  const slug = (nomeMarca || "sem-marca").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  exportarExcel(`produtos-marca-${slug || "sem-marca"}-${carimbo}.xlsx`, "Produtos", linhas);
}

/**
 * Produtos de uma marca, mostrados ao expandir a linha na Curva ABC por marca.
 * Curva/participação são LOCAIS à marca — ver o comentário no servidor
 * (getProdutosDaMarca). Sem paginação por rolagem: uma marca real tem no
 * máximo algumas centenas de SKUs, cabe inteira num scroll simples.
 */
function ProdutosDaMarcaPainel({
  marca,
  drill,
}: {
  marca: MarcaABC;
  drill: { data: ProdutosDaMarcaView | null; loading: boolean; error: string | null };
}) {
  const { t } = useTranslation();
  const nomeMarca = marca.name || t("produtos.marca.none");
  const { data, loading, error } = drill;

  return (
    <div className="border-l-2 border-accent/40 bg-muted/20 px-5 py-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-xs font-semibold text-foreground">{nomeMarca}</p>
          <p className="text-[11px] text-muted-foreground">
            {data ? `${formatNumber(data.total)} produto${data.total === 1 ? "" : "s"}` : "Carregando…"}
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-7 gap-1.5 text-xs"
          disabled={!data || data.items.length === 0}
          onClick={(e) => {
            e.stopPropagation();
            if (data) exportarProdutosDaMarcaExcel(nomeMarca, data.items);
          }}
        >
          <Download className="h-3 w-3" />
          Excel
        </Button>
      </div>

      {error && <p className="text-xs text-negative">Não foi possível carregar: {error}</p>}

      {loading && (
        <div className="space-y-1.5">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-7 animate-pulse rounded bg-muted/40" />
          ))}
        </div>
      )}

      {!loading && data && data.items.length === 0 && (
        <p className="text-xs text-muted-foreground">Nenhum produto encontrado para esta marca.</p>
      )}

      {!loading && data && data.items.length > 0 && (
        <>
          {data.truncado && (
            <p className="mb-2 text-[11px] text-warning">
              Mostrando os {formatNumber(MAX_PRODUTOS_POR_MARCA)} maiores de {formatNumber(data.total)} produtos —
              baixe o Excel para a lista completa.
            </p>
          )}
          <div className="max-h-[360px] overflow-auto rounded-md border border-border bg-surface">
            <table className="w-full text-xs">
              <thead className="sticky top-0 z-10 border-b border-border bg-surface">
                <tr className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                  <th className="py-1.5 px-3 text-left font-medium">Produto</th>
                  <th className="py-1.5 px-3 text-left font-medium">Categoria</th>
                  <th className="py-1.5 px-3 text-right font-medium">Unid.</th>
                  <th className="py-1.5 px-3 text-right font-medium">Receita</th>
                  <th className="py-1.5 px-3 text-right font-medium">% marca</th>
                  <th className="py-1.5 px-3 text-right font-medium">Acum.</th>
                  <th className="py-1.5 px-3 text-left font-medium">Curva</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {data.items.map((p) => (
                  <tr key={p.id} className="hover:bg-muted/30">
                    <td className="max-w-[220px] truncate py-1.5 px-3">
                      <div className="font-medium text-foreground">{p.name}</div>
                      <div className="font-mono text-[10px] text-muted-foreground">
                        {p.id}
                        {p.manufacturerCode && <span> · {p.manufacturerCode}</span>}
                      </div>
                    </td>
                    <td className="py-1.5 px-3 text-muted-foreground">{p.subgroupName || "—"}</td>
                    <td className="py-1.5 px-3 text-right tabular">{formatNumber(p.units)}</td>
                    <td className="py-1.5 px-3 text-right tabular font-medium">
                      <Money value={p.revenue} />
                    </td>
                    <td className="py-1.5 px-3 text-right tabular text-muted-foreground">
                      {formatPercent(p.share, { decimals: 2 })}
                    </td>
                    <td className="py-1.5 px-3 text-right tabular text-muted-foreground">
                      {formatPercent(p.cumulativeShare, { decimals: 1 })}
                    </td>
                    <td className="py-1.5 px-3">
                      <CurvaBadge curve={p.curve} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

function MarginBadge({ pct }: { pct: number }) {
  return (
    <span className={cn(
      "inline-block rounded-full px-2 py-0.5 text-[10px] font-medium",
      pct >= 0.3 ? "bg-positive/15 text-positive"
        : pct >= 0.1 ? "bg-amber-500/15 text-amber-600"
        : "bg-negative/15 text-negative"
    )}>
      {formatPercent(pct, { decimals: 1 })}
    </span>
  );
}

function CurvaBadge({ curve }: { curve: "A" | "B" | "C" }) {
  return (
    <span
      className={cn(
        "inline-flex h-5 w-5 items-center justify-center rounded font-mono text-[11px] font-medium",
        curve === "A" && "bg-positive/15 text-positive border border-positive/30",
        curve === "B" && "bg-warning/15 text-warning border border-warning/30",
        curve === "C" && "bg-muted text-muted-foreground border border-border"
      )}
    >
      {curve}
    </span>
  );
}

function CurvaLegend({ curve, count }: { curve: "A" | "B" | "C"; count: number }) {
  return (
    <span className="inline-flex items-center gap-1">
      <CurvaBadge curve={curve} />
      <span className="tabular">{count}</span>
    </span>
  );
}
