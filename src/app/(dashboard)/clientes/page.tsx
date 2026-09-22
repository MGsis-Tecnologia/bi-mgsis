"use client";

import * as React from "react";
import { Search, Users, X } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { EmptyState } from "@/components/dashboard/empty-state";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { BarChartH } from "@/components/charts/bar-chart-h";
import { DonutChart } from "@/components/charts/donut-chart";
import { Money } from "@/components/dashboard/money";
import {
  useClientesAnalytics,
  useClientesTabela,
  type ClienteLucro,
  type ClienteMetrica,
} from "@/lib/hooks/use-clientes-analytics";
import { formatNumber, formatPercent } from "@/lib/utils/format";
import { cn } from "@/lib/utils";
import { useTranslation } from "@/lib/hooks/use-translation";

const SEGMENT_LABELS: Record<string, string> = {
  vip: "VIP",
  fiel: "Fiel",
  promissor: "Promissor",
  novo: "Novo",
  "em-risco": "Em risco",
  inativo: "Inativo",
};

const SEGMENT_TONE: Record<string, "positive" | "accent" | "warning" | "negative" | "default"> = {
  vip: "positive",
  fiel: "positive",
  promissor: "accent",
  novo: "accent",
  "em-risco": "warning",
  inativo: "negative",
} as const;

/** Estável de propósito: um `[]` novo a cada render reiniciaria a paginação. */
const SEM_LINHAS: never[] = [];

/** Chegou perto do fim do container de rolagem? Hora de pedir a próxima página. */
function aoRolar(loadMore: () => void) {
  return (e: React.UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    if (el.scrollHeight - el.scrollTop - el.clientHeight < 240) loadMore();
  };
}

/** Busca de uma tabela: campo com ícone e botão de limpar. */
function BuscaTabela({
  value, onChange, placeholder,
}: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <div className="relative w-full sm:w-72">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        className="h-9 pl-9 pr-9"
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange("")}
          className="absolute right-2 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded text-muted-foreground hover:text-foreground"
          title="Limpar busca"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}

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
          ? t("clientes.table.loading")
          : t(hasMore ? "clientes.table.loaded.more" : "clientes.table.loaded.all", {
              shown: formatNumber(shown),
              total: formatNumber(total),
            })}
    </p>
  );
}

export default function ClientesPage() {
  const { t } = useTranslation();

  // Tudo agregado no servidor: segmentação RFM, curvas ABC e ranking por lucro
  // chegam prontos, com as contagens calculadas sobre a base inteira.
  const { data, loading, error, filtros } = useClientesAnalytics();

  const [buscaBase, setBuscaBase] = React.useState("");
  const [buscaLucro, setBuscaLucro] = React.useState("");

  // As duas tabelas grandes listam TODOS os clientes ativos no período: a
  // primeira página vem na resposta da tela, o resto é pedido ao rolar (ou ao
  // buscar). O gráfico de LTV continua usando só `topClients` (as 10 primeiras).
  const baseTabela = useClientesTabela<ClienteMetrica>(
    "base", data?.topClients ?? SEM_LINHAS, data?.activeCustomers ?? 0, filtros, buscaBase
  );
  const lucroTabela = useClientesTabela<ClienteLucro>(
    "lucro", data?.profitRanking ?? SEM_LINHAS, data?.profitTotals.count ?? 0, filtros, buscaLucro
  );

  // Outra busca é outra lista: volta ao topo em vez de ficar no meio dela.
  const scrollBaseRef = React.useRef<HTMLDivElement>(null);
  const scrollLucroRef = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => { scrollBaseRef.current?.scrollTo({ top: 0 }); }, [buscaBase]);
  React.useEffect(() => { scrollLucroRef.current?.scrollTo({ top: 0 }); }, [buscaLucro]);

  const segments = data?.segments ?? {};
  const segmentsArr = Object.entries(segments).map(([k, v]) => ({
    key: k,
    label: SEGMENT_LABELS[k] ?? k,
    value: v,
  }));

  const activeCustomers = data?.activeCustomers ?? 0;
  const avgLTV = data?.avgLTV ?? 0;
  const churnRisk = data?.churnRisk ?? 0;
  // O gráfico de LTV usa os 10 primeiros da PRIMEIRA página (por receita) — não
  // recorta pela busca da tabela, que é independente dele.
  const topByLTV = (data?.topClients ?? []).slice(0, 10);

  if (error) {
    return (
      <div className="space-y-8">
        <PageHeader eyebrow={t("clientes.header.eyebrow")} title={t("clientes.header.title")} description={t("clientes.header.desc")} />
        <div className="rounded-lg border border-negative/30 bg-negative/10 px-4 py-3 text-sm text-negative">
          Não foi possível carregar os clientes: {error}
        </div>
      </div>
    );
  }

  if (!data?.hasData) {
    return (
      <div className="space-y-8">
        <PageHeader eyebrow={t("clientes.header.eyebrow")} title={t("clientes.header.title")} description={t("clientes.header.desc")} />
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
        eyebrow={t("clientes.header.eyebrow")}
        title={t("clientes.header.title")}
        description={t("clientes.header.desc")}
      >
        <Badge variant="ghost" className="gap-1">
          <Users className="h-3 w-3" />
          {t("clientes.header.badge", { count: formatNumber(data.totalClients) })}
        </Badge>
      </PageHeader>

      <section className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard label={t("clientes.kpi.active")} value={formatNumber(activeCustomers)} caption={t("clientes.kpi.active.caption")} accent="accent" />
        <KpiCard label={t("clientes.kpi.ltv")} value={<><Money value={avgLTV} compact /></> as never} />
        <KpiCard label={t("clientes.kpi.vip")} caption={t("clientes.kpi.vip.caption")} value={formatNumber(segments.vip ?? 0)} accent="positive" />
        <KpiCard label={t("clientes.kpi.risk")} caption={t("clientes.kpi.risk.caption")} value={formatNumber(churnRisk)} accent="negative" />
      </section>

      <section className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>{t("clientes.chart.ltv.title")}</CardTitle>
          </CardHeader>
          <CardContent>
            <BarChartH
              rows={topByLTV.map((m) => ({
                key: m.id,
                label: m.name,
                value: m.ltv,
                secondary: `${m.orders} pedidos · ${SEGMENT_LABELS[m.segment] ?? m.segment}`,
              }))}
              maxRows={10}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t("clientes.chart.rfm.title")}</CardTitle>
          </CardHeader>
          <CardContent>
            <DonutChart
              data={segmentsArr}
              centerLabel={t("clientes.chart.rfm.center")}
              centerValue={String(segmentsArr.length)}
              isCurrency={false}
              height={200}
            />
          </CardContent>
        </Card>
      </section>

      {/* ── Base de Clientes ──────────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle>{t("clientes.table.title")}</CardTitle>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                {t("clientes.table.count", { count: formatNumber(baseTabela.total) })}
              </p>
            </div>
            <BuscaTabela value={buscaBase} onChange={setBuscaBase} placeholder={t("clientes.table.search")} />
          </div>
        </CardHeader>
        <CardContent className="px-0">
          <div ref={scrollBaseRef} onScroll={aoRolar(baseTabela.loadMore)} className="max-h-[560px] overflow-auto">
            <table className="w-full text-sm">
              <thead className="[&_th]:sticky [&_th]:top-0 [&_th]:z-10 [&_th]:bg-surface [&_th]:border-b [&_th]:border-border">
                <tr className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                  <th className="text-left font-medium py-2 px-5">{t("clientes.table.col.customer")}</th>
                  <th className="text-right font-medium py-2 px-5">{t("clientes.table.col.orders")}</th>
                  <th className="text-right font-medium py-2 px-5">{t("clientes.table.col.ltv")}</th>
                  <th className="text-right font-medium py-2 px-5">{t("clientes.table.col.ticket")}</th>
                  <th className="text-right font-medium py-2 px-5">{t("clientes.table.col.recency")}</th>
                  <th className="text-left font-medium py-2 px-5">{t("clientes.table.col.segment")}</th>
                  <th className="text-left font-medium py-2 px-5">{t("clientes.table.col.curve")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {baseTabela.loading && Array.from({ length: 6 }).map((_, i) => (
                  <tr key={`sk-${i}`}>
                    <td colSpan={7} className="px-5 py-2.5">
                      <div className="h-8 animate-pulse rounded bg-muted/40" />
                    </td>
                  </tr>
                ))}

                {!baseTabela.loading && baseTabela.rows.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-5 py-8 text-center text-sm text-muted-foreground">
                      {buscaBase ? t("clientes.table.empty.search") : "Sem dados para o período selecionado."}
                    </td>
                  </tr>
                )}

                {baseTabela.rows.map((e) => (
                  <tr key={e.id} className="hover:bg-muted/30 transition-colors">
                    <td className="py-2.5 px-5">
                      <div className="font-medium truncate max-w-[220px]">{e.name}</div>
                      <div className="text-xs text-muted-foreground font-mono">{e.id}</div>
                    </td>
                    <td className="py-2.5 px-5 text-right tabular">{e.orders}</td>
                    <td className="py-2.5 px-5 text-right tabular font-medium">
                      <Money value={e.ltv} />
                    </td>
                    <td className="py-2.5 px-5 text-right tabular text-muted-foreground">
                      <Money value={e.averageTicket} />
                    </td>
                    <td className="py-2.5 px-5 text-right tabular text-muted-foreground">
                      {e.lastPurchaseDate === null ? "—" : `${e.recencyDays}d`}
                    </td>
                    <td className="py-2.5 px-5">
                      <Badge variant={SEGMENT_TONE[e.segment]} className="capitalize">
                        {SEGMENT_LABELS[e.segment] ?? e.segment}
                      </Badge>
                    </td>
                    <td className="py-2.5 px-5">
                      <span
                        className={cn(
                          "inline-flex h-5 w-5 items-center justify-center rounded font-mono text-[11px] font-medium",
                          e.curve === "A" && "bg-positive/15 text-positive border border-positive/30",
                          e.curve === "B" && "bg-warning/15 text-warning border border-warning/30",
                          e.curve === "C" && "bg-muted text-muted-foreground border border-border"
                        )}
                      >
                        {e.curve}
                      </span>
                    </td>
                  </tr>
                ))}

                {baseTabela.loadingMais && (
                  <tr>
                    <td colSpan={7} className="px-5 py-3 text-center text-xs text-muted-foreground">
                      {t("clientes.table.loading")}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          {!baseTabela.loading && baseTabela.rows.length > 0 && (
            <RodapePaginacao
              shown={baseTabela.rows.length}
              total={baseTabela.total}
              hasMore={baseTabela.hasMore}
              loading={baseTabela.loadingMais}
              error={baseTabela.error}
            />
          )}
        </CardContent>
      </Card>

      {/* ── Clientes mais lucrativos ──────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle>{t("clientes.lucro.title")}</CardTitle>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                {t("clientes.lucro.desc")} · {t("clientes.table.count", { count: formatNumber(lucroTabela.total) })}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <BuscaTabela value={buscaLucro} onChange={setBuscaLucro} placeholder={t("clientes.table.search")} />
              <Badge variant="ghost">{data.profitTotals.count} clientes</Badge>
            </div>
          </div>
        </CardHeader>
        <CardContent className="px-0">
          <div ref={scrollLucroRef} onScroll={aoRolar(lucroTabela.loadMore)} className="max-h-[560px] overflow-auto">
            <table className="w-full text-sm">
              <thead className="[&_th]:sticky [&_th]:top-0 [&_th]:z-10 [&_th]:bg-surface [&_th]:border-b [&_th]:border-border">
                <tr className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                  <th className="text-left font-medium py-2 px-5">#</th>
                  <th className="text-left font-medium py-2 px-5">Cliente</th>
                  <th className="text-right font-medium py-2 px-5">Pedidos</th>
                  <th className="text-right font-medium py-2 px-5">Receita</th>
                  <th className="text-right font-medium py-2 px-5">Custo</th>
                  <th className="text-right font-medium py-2 px-5">Lucro</th>
                  <th className="text-right font-medium py-2 px-5">Margem</th>
                  <th className="text-right font-medium py-2 px-5">Ticket médio</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {lucroTabela.loading && Array.from({ length: 6 }).map((_, i) => (
                  <tr key={`sk-${i}`}>
                    <td colSpan={8} className="px-5 py-2.5">
                      <div className="h-8 animate-pulse rounded bg-muted/40" />
                    </td>
                  </tr>
                ))}

                {!lucroTabela.loading && lucroTabela.rows.length === 0 && (
                  <tr>
                    <td colSpan={8} className="px-5 py-8 text-center text-sm text-muted-foreground">
                      {buscaLucro ? t("clientes.table.empty.search") : "Sem dados para o período selecionado."}
                    </td>
                  </tr>
                )}

                {lucroTabela.rows.map((e, i) => (
                  <tr key={e.clientId} className="hover:bg-muted/30 transition-colors">
                    <td className="py-2.5 px-5 font-mono text-xs text-muted-foreground tabular">
                      {(i + 1).toString().padStart(2, "0")}
                    </td>
                    <td className="py-2.5 px-5">
                      <div className="font-medium truncate max-w-[220px]">{e.clientName}</div>
                      <div className="text-xs text-muted-foreground font-mono">{e.clientId}</div>
                    </td>
                    <td className="py-2.5 px-5 text-right tabular text-muted-foreground">{e.orders}</td>
                    <td className="py-2.5 px-5 text-right tabular"><Money value={e.revenue} /></td>
                    <td className="py-2.5 px-5 text-right tabular text-muted-foreground"><Money value={e.cost} /></td>
                    <td className={cn("py-2.5 px-5 text-right tabular font-medium", e.profit >= 0 ? "text-positive" : "text-negative")}>
                      <Money value={e.profit} />
                    </td>
                    <td className="py-2.5 px-5 text-right tabular">
                      <span className={cn(
                        "inline-block rounded-full px-2 py-0.5 text-[10px] font-medium",
                        e.marginPct >= 0.3 ? "bg-positive/15 text-positive"
                          : e.marginPct >= 0.1 ? "bg-amber-500/15 text-amber-600"
                          : "bg-negative/15 text-negative"
                      )}>
                        {formatPercent(e.marginPct, { decimals: 1 })}
                      </span>
                    </td>
                    <td className="py-2.5 px-5 text-right tabular text-muted-foreground">
                      <Money value={e.avgTicket} />
                    </td>
                  </tr>
                ))}

                {lucroTabela.loadingMais && (
                  <tr>
                    <td colSpan={8} className="px-5 py-3 text-center text-xs text-muted-foreground">
                      {t("clientes.table.loading")}
                    </td>
                  </tr>
                )}
              </tbody>
              <tfoot className="[&_td]:sticky [&_td]:bottom-0 [&_td]:z-10 [&_td]:bg-surface [&_td]:border-t [&_td]:border-border">
                <tr className="text-[11px] font-medium">
                  <td className="py-2.5 px-5" />
                  {/* Totais sobre TODOS os clientes do período, não só os carregados na tela. */}
                  <td className="py-2.5 px-5 uppercase tracking-[0.1em] text-muted-foreground">
                    Total · {data.profitTotals.count} clientes
                  </td>
                  <td className="py-2.5 px-5 text-right tabular text-muted-foreground">
                    {formatNumber(data.profitTotals.orders)}
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
                    {(() => {
                      const rev = data.profitTotals.revenue;
                      const pft = data.profitTotals.profit;
                      const pct = rev > 0 ? pft / rev : 0;
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
                    })()}
                  </td>
                  <td className="py-2.5 px-5" />
                </tr>
              </tfoot>
            </table>
          </div>
          {!lucroTabela.loading && lucroTabela.rows.length > 0 && (
            <RodapePaginacao
              shown={lucroTabela.rows.length}
              total={lucroTabela.total}
              hasMore={lucroTabela.hasMore}
              loading={lucroTabela.loadingMais}
              error={lucroTabela.error}
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
