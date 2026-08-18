"use client";

import * as React from "react";
import { AlertTriangle, Loader2, Sparkles, Timer, Truck } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { EmptyState } from "@/components/dashboard/empty-state";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { RevenueAreaChart } from "@/components/charts/revenue-area-chart";
import { YearComparisonChart } from "@/components/charts/year-comparison-chart";
import { LabeledDonut } from "@/components/charts/labeled-donut";
import { BarChartH } from "@/components/charts/bar-chart-h";
import {
  useFornecedoresAnalytics,
  type Curva,
  type FornecedorMetrica,
  type PontoPeriodo,
} from "@/lib/hooks/use-fornecedores-analytics";
import { formatCurrency, formatNumber, formatPercent } from "@/lib/utils/format";
import { useMoedaExibicao } from "@/lib/hooks/use-moeda-exibicao";
import { cn } from "@/lib/utils";

/**
 * Fornecedores — quem abastece, quanto pesa e o risco disso.
 *
 * Sai da mesma base de Compras (`compra_items`). Duas leituras precisam estar
 * ditas na tela, senão o número engana:
 *
 *  - o período é pela data de CHEGADA (`pedido_data`); a emissão só entra no
 *    prazo de entrega;
 *  - o cruzamento com vendas atribui cada produto ao fornecedor de quem MAIS
 *    se comprou dele no período.
 */

const CORES = [
  "hsl(var(--accent))", "#3b82f6", "#22c55e", "#f59e0b", "#a855f7",
  "#ec4899", "#14b8a6", "#ef4444", "hsl(var(--muted-foreground))",
];

const TOM_CURVA: Record<Curva, string> = {
  A: "bg-accent/15 text-accent border-accent/30",
  B: "bg-warning/15 text-warning border-warning/30",
  C: "bg-muted text-muted-foreground border-border",
};

/** Faixas do HHI usadas por órgãos de concorrência, e o que significam aqui. */
function riscoDe(hhi: number): { rotulo: string; tom: string; texto: string } {
  if (hhi >= 0.25)
    return {
      rotulo: "Alta",
      tom: "text-negative",
      texto: "As compras estão concentradas em poucos fornecedores — parar um deles para a operação.",
    };
  if (hhi >= 0.15)
    return {
      rotulo: "Moderada",
      tom: "text-warning",
      texto: "Há dependência relevante de alguns fornecedores. Vale ter alternativa mapeada.",
    };
  return {
    rotulo: "Baixa",
    tom: "text-positive",
    texto: "As compras estão distribuídas — nenhum fornecedor sozinho trava o abastecimento.",
  };
}

const paraSerie = (pontos: PontoPeriodo[], rotulo: (k: string) => string) =>
  pontos.map((p) => ({
    key: p.key,
    label: rotulo(p.key),
    revenue: p.valor,
    orders: p.pedidos,
    profit: 0,
    cost: 0,
    discount: 0,
    discountPct: 0,
  }));

const mesCurto = (k: string) => {
  const [ano, mes] = k.split("-");
  const nome = new Intl.DateTimeFormat("pt-BR", { month: "short" }).format(
    new Date(Number(ano), Number(mes) - 1, 1)
  );
  return `${nome}/${ano!.slice(2)}`;
};

export default function FornecedoresPage() {
  const currency = useMoedaExibicao();
  const { data, loading, error } = useFornecedoresAnalytics();

  const cabecalho = (
    <PageHeader
      eyebrow="Catálogo · fornecedores"
      title="De quem compramos."
      description="Gasto, concentração e risco de fornecimento — por fornecedor, por categoria e cruzado com o que se vendeu."
    />
  );

  if (error) {
    return (
      <div className="space-y-8">
        {cabecalho}
        <div className="rounded-lg border border-negative/30 bg-negative/10 px-4 py-3 text-sm text-negative">
          Não foi possível carregar os fornecedores: {error}
        </div>
      </div>
    );
  }

  if (loading || !data) {
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
          title="Nenhuma compra no período"
          description="Importe o arquivo de compras (bi_compras) ou amplie o período para ver os fornecedores."
        />
      </div>
    );
  }

  const { kpis, fornecedores, categorias, participacao, matrizAbc, vendaPorFornecedor } = data;
  const risco = riscoDe(kpis.hhi);
  const dinheiro = (v: number, compacto = true) => formatCurrency(v, currency, { compact: compacto });

  // Rótulos do comparativo. O período pode cruzar o ano; vale o do primeiro
  // mês, que é como o gráfico de comparação anual já nomeia as séries.
  const anos = (() => {
    const atual = data.mensal[0]?.key.slice(0, 4) || String(new Date().getFullYear());
    return { atual, anterior: String(Number(atual) - 1) };
  })();

  return (
    <div className="space-y-8">
      {cabecalho}

      {/* ── Volume ─────────────────────────────────────────────────────── */}
      <section className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <KpiCard
          label="Total comprado"
          caption={`${formatNumber(kpis.pedidos)} pedidos`}
          value={dinheiro(kpis.totalComprado)}
          accent="accent"
        />
        <KpiCard label="Fornecedores" caption="com compra no período" value={formatNumber(kpis.fornecedores)} />
        <KpiCard label="Ticket médio" caption="por pedido" value={dinheiro(kpis.ticketMedio, false)} />
        <KpiCard
          label="Novos no período"
          caption={`${formatNumber(kpis.recorrentes)} recorrentes`}
          value={formatNumber(kpis.novos)}
        />
        <KpiCard
          label="Prazo médio"
          caption="da emissão à chegada"
          value={kpis.prazoMedioDias === null ? "—" : `${kpis.prazoMedioDias} dias`}
        />
      </section>

      {/* ── Evolução ───────────────────────────────────────────────────── */}
      <Card>
        <Tabs defaultValue="mes">
          <CardHeader>
            <div className="flex items-start justify-between gap-4">
              <div>
                <CardTitle>Evolução do gasto</CardTitle>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Pela data de <strong>chegada</strong> da mercadoria — é ela que define a que mês o gasto pertence.
                </p>
              </div>
              <TabsList>
                <TabsTrigger value="mes">Mês</TabsTrigger>
                <TabsTrigger value="tri">Trimestre</TabsTrigger>
                <TabsTrigger value="ano">Ano</TabsTrigger>
                <TabsTrigger value="aa">Ano a ano</TabsTrigger>
              </TabsList>
            </div>
          </CardHeader>
          <CardContent>
            <TabsContent value="mes">
              <div className="h-80">
                <RevenueAreaChart data={paraSerie(data.mensal, mesCurto)} height={320} />
              </div>
            </TabsContent>
            <TabsContent value="tri">
              <div className="h-80">
                <RevenueAreaChart data={paraSerie(data.trimestral, (k) => k)} height={320} />
              </div>
            </TabsContent>
            <TabsContent value="ano">
              <div className="h-80">
                <RevenueAreaChart data={paraSerie(data.anual, (k) => k)} height={320} />
              </div>
            </TabsContent>
            <TabsContent value="aa">
              <div className="h-80">
                <YearComparisonChart
                  data={{
                    years: [anos.anterior, anos.atual],
                    rows: data.anoAAno.map((r) => ({
                      key: r.key,
                      label: mesCurto(r.key),
                      byYear: { [anos.anterior]: r.anterior, [anos.atual]: r.atual },
                      total: r.atual + r.anterior,
                      growth: r.anterior > 0 ? (r.atual - r.anterior) / r.anterior : null,
                    })),
                  }}
                />
              </div>
            </TabsContent>
          </CardContent>
        </Tabs>
      </Card>

      {/* ── Participação e risco ───────────────────────────────────────── */}
      <section className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Participação no total comprado</CardTitle>
            <p className="mt-1 text-[11px] text-muted-foreground">
              Os maiores em cheio; o restante somado em &ldquo;Demais&rdquo;, senão a leitura se perde em fatias de 0,1%.
            </p>
          </CardHeader>
          <CardContent>
            <LabeledDonut
              data={participacao.map((f, i) => ({
                key: f.label,
                label: f.label,
                value: f.valor,
                color: f.demais ? "hsl(var(--muted-foreground))" : CORES[i % CORES.length]!,
              }))}
              currencyId={currency}
              height={300}
              centerLabel="Total"
              centerValue={dinheiro(kpis.totalComprado)}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className={cn("h-4 w-4", risco.tom)} />
              Risco de dependência
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <div className={cn("text-2xl font-semibold tabular", risco.tom)}>{risco.rotulo}</div>
              <p className="mt-1 text-[11px] text-muted-foreground">{risco.texto}</p>
            </div>
            <div className="space-y-2">
              {[
                ["Maior fornecedor", kpis.shareTop1],
                ["2 maiores", kpis.shareTop2],
                ["5 maiores", kpis.shareTop5],
              ].map(([rotulo, valor]) => (
                <div key={rotulo as string}>
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-muted-foreground">{rotulo}</span>
                    <span className="tabular font-medium text-foreground">
                      {formatPercent(valor as number, { decimals: 1 })}
                    </span>
                  </div>
                  <div className="mt-1 h-1.5 rounded-full bg-muted overflow-hidden">
                    <div
                      className="h-full rounded-full bg-accent"
                      style={{ width: `${Math.min(100, (valor as number) * 100)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
            <div className="border-t border-border pt-3 text-[11px] text-muted-foreground">
              HHI <span className="tabular font-medium text-foreground">{kpis.hhi.toFixed(3)}</span>
              {" "}· soma dos quadrados das participações. Acima de 0,25 é concentração alta.
            </div>
          </CardContent>
        </Card>
      </section>

      {/* ── Categorias e novos ─────────────────────────────────────────── */}
      <section className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Gasto por categoria</CardTitle>
            <p className="mt-1 text-[11px] text-muted-foreground">
              Subgrupo do produto comprado — os mesmos códigos usados em Vendas.
            </p>
          </CardHeader>
          <CardContent>
            <BarChartH
              rows={categorias.slice(0, 12).map((c) => ({
                key: c.subgrupoId,
                label: c.subgrupo,
                value: c.valor,
                secondary: `${formatNumber(c.fornecedores)} fornec.`,
              }))}
              format="currency"
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-accent" />
              Novos e recorrentes
            </CardTitle>
            <p className="mt-1 text-[11px] text-muted-foreground">
              Novo = sem nenhuma compra antes do início do período.
            </p>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-lg border border-border p-3">
                <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Novos</div>
                <div className="mt-1 text-xl font-semibold tabular text-foreground">
                  {formatNumber(kpis.novos)}
                </div>
                <div className="mt-0.5 text-[11px] text-muted-foreground">{dinheiro(kpis.valorNovos)}</div>
              </div>
              <div className="rounded-lg border border-border p-3">
                <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Recorrentes</div>
                <div className="mt-1 text-xl font-semibold tabular text-foreground">
                  {formatNumber(kpis.recorrentes)}
                </div>
                <div className="mt-0.5 text-[11px] text-muted-foreground">
                  {dinheiro(kpis.totalComprado - kpis.valorNovos)}
                </div>
              </div>
            </div>
            <div className="h-2 rounded-full bg-muted overflow-hidden flex">
              <div
                className="h-full bg-accent"
                style={{
                  width: `${kpis.totalComprado > 0 ? (kpis.valorNovos / kpis.totalComprado) * 100 : 0}%`,
                }}
              />
            </div>
            <p className="text-[11px] text-muted-foreground">
              {formatPercent(kpis.totalComprado > 0 ? kpis.valorNovos / kpis.totalComprado : 0, { decimals: 1 })}
              {" "}do gasto foi com fornecedores novos.
            </p>
          </CardContent>
        </Card>
      </section>

      {/* ── Matriz ABC ─────────────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle>Curva ABC cruzada — produto × fornecedor</CardTitle>
          <p className="mt-1 text-[11px] text-muted-foreground">
            A = até 80% do valor acumulado, B = até 95%, C = o resto. O canto que interessa é
            <strong> produto A com fornecedor C</strong>: item que pesa, vindo de quem não pesa.
          </p>
        </CardHeader>
        <CardContent>
          <MatrizAbc celulas={matrizAbc} dinheiro={dinheiro} />
        </CardContent>
      </Card>

      {/* ── Comprado × vendido ─────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Truck className="h-4 w-4 text-accent" />
            Comprado × vendido, por fornecedor
          </CardTitle>
          <p className="mt-1 text-[11px] text-muted-foreground">
            A venda não sabe de quem a peça veio — o elo é o produto. Cada produto entra para o
            fornecedor de quem <strong>mais se comprou dele</strong> no período.
          </p>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="border-b border-border text-[10px] uppercase tracking-wide text-muted-foreground">
                  <th className="px-5 py-2 text-left font-medium">Fornecedor</th>
                  <th className="px-3 py-2 text-right font-medium">Produtos</th>
                  <th className="px-3 py-2 text-right font-medium">Comprado</th>
                  <th className="px-3 py-2 text-right font-medium">Vendido</th>
                  <th className="px-5 py-2 text-right font-medium">Vendido / comprado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {vendaPorFornecedor.map((f) => {
                  const razao = f.comprado > 0 ? f.vendido / f.comprado : 0;
                  return (
                    <tr key={f.id} className="hover:bg-muted/30">
                      <td className="px-5 py-2 text-foreground">{f.nome}</td>
                      <td className="px-3 py-2 text-right tabular text-muted-foreground">
                        {formatNumber(f.produtos)}
                      </td>
                      <td className="px-3 py-2 text-right tabular">{dinheiro(f.comprado)}</td>
                      <td className="px-3 py-2 text-right tabular">{dinheiro(f.vendido)}</td>
                      <td
                        className={cn(
                          "px-5 py-2 text-right tabular font-medium",
                          razao >= 1 ? "text-positive" : "text-muted-foreground"
                        )}
                      >
                        {formatPercent(razao, { decimals: 0 })}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* ── Ranking ────────────────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Ranking de fornecedores</CardTitle>
              <p className="mt-1 text-[11px] text-muted-foreground">
                Ordenado por gasto, com a curva ABC e o acumulado.
              </p>
            </div>
            <Badge variant="ghost">{formatNumber(fornecedores.length)} de {formatNumber(kpis.fornecedores)}</Badge>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="border-b border-border text-[10px] uppercase tracking-wide text-muted-foreground">
                  <th className="px-5 py-2 text-left font-medium">#</th>
                  <th className="px-3 py-2 text-left font-medium">Fornecedor</th>
                  <th className="px-3 py-2 text-center font-medium">Curva</th>
                  <th className="px-3 py-2 text-right font-medium">Gasto</th>
                  <th className="px-3 py-2 text-right font-medium">Share</th>
                  <th className="px-3 py-2 text-right font-medium">Acum.</th>
                  <th className="px-3 py-2 text-right font-medium">Pedidos</th>
                  <th className="px-3 py-2 text-right font-medium">Ticket</th>
                  <th className="px-3 py-2 text-right font-medium">Prazo</th>
                  <th className="px-5 py-2 text-right font-medium">Última</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {fornecedores.map((f, i) => (
                  <LinhaFornecedor key={f.id} pos={i + 1} f={f} dinheiro={dinheiro} />
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function LinhaFornecedor({
  pos,
  f,
  dinheiro,
}: {
  pos: number;
  f: FornecedorMetrica;
  dinheiro: (v: number, compacto?: boolean) => string;
}) {
  return (
    <tr className="hover:bg-muted/30">
      <td className="px-5 py-2 font-mono text-[10px] text-muted-foreground tabular">
        {String(pos).padStart(2, "0")}
      </td>
      <td className="px-3 py-2">
        <span className="text-foreground">{f.nome}</span>
        {f.novo && (
          <Badge variant="ghost" className="ml-2 text-[9px] text-accent">
            novo
          </Badge>
        )}
      </td>
      <td className="px-3 py-2 text-center">
        <span className={cn("inline-block rounded border px-1.5 text-[10px] font-medium", TOM_CURVA[f.curva])}>
          {f.curva}
        </span>
      </td>
      <td className="px-3 py-2 text-right tabular">{dinheiro(f.valor)}</td>
      <td className="px-3 py-2 text-right tabular text-muted-foreground">
        {formatPercent(f.share, { decimals: 1 })}
      </td>
      <td className="px-3 py-2 text-right tabular text-muted-foreground">
        {formatPercent(f.shareAcumulado, { decimals: 1 })}
      </td>
      <td className="px-3 py-2 text-right tabular text-muted-foreground">{formatNumber(f.pedidos)}</td>
      <td className="px-3 py-2 text-right tabular">{dinheiro(f.ticketMedio)}</td>
      <td className="px-3 py-2 text-right tabular text-muted-foreground">
        {f.prazoDias === null ? "—" : (
          <span className="inline-flex items-center gap-1">
            <Timer className="h-3 w-3 opacity-50" />
            {f.prazoDias}d
          </span>
        )}
      </td>
      <td className="px-5 py-2 text-right text-[11px] text-muted-foreground tabular">
        {f.ultimaCompra || "—"}
      </td>
    </tr>
  );
}

/** 3×3: linha = curva do produto, coluna = curva do fornecedor. */
function MatrizAbc({
  celulas,
  dinheiro,
}: {
  celulas: { produto: Curva; fornecedor: Curva; produtos: number; valor: number }[];
  dinheiro: (v: number, compacto?: boolean) => string;
}) {
  const curvas: Curva[] = ["A", "B", "C"];
  const busca = (p: Curva, f: Curva) => celulas.find((c) => c.produto === p && c.fornecedor === f);
  const maior = Math.max(1, ...celulas.map((c) => c.valor));

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[12px]">
        <thead>
          <tr className="text-[10px] uppercase tracking-wide text-muted-foreground">
            <th className="px-3 py-2 text-left font-medium">Produto \ Fornecedor</th>
            {curvas.map((c) => (
              <th key={c} className="px-3 py-2 text-center font-medium">
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {curvas.map((p) => (
            <tr key={p}>
              <td className="px-3 py-2 text-[10px] font-medium uppercase text-muted-foreground">{p}</td>
              {curvas.map((f) => {
                const c = busca(p, f);
                const intensidade = c ? c.valor / maior : 0;
                const destaque = p === "A" && f === "C";
                return (
                  <td key={f} className="px-1 py-1">
                    <div
                      className={cn(
                        "rounded-md border px-3 py-3 text-center",
                        destaque ? "border-warning/40" : "border-border"
                      )}
                      style={{ backgroundColor: `hsl(var(--accent) / ${0.04 + intensidade * 0.22})` }}
                    >
                      <div className="text-[13px] font-semibold tabular text-foreground">
                        {c ? dinheiro(c.valor) : "—"}
                      </div>
                      <div className="mt-0.5 text-[10px] text-muted-foreground tabular">
                        {c ? `${formatNumber(c.produtos)} produtos` : "sem itens"}
                      </div>
                    </div>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
