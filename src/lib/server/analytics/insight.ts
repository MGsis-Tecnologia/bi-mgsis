import type { PrismaClient } from "@prisma/client";
import type { InsightInput } from "@/lib/analytics/insights-agg";
import { KPI_SELECT, type KpiRow } from "./dashboard";
import { Params, SERIE_SELECT, comPedidos, consultaAnalitica, type AnalyticsFilters } from "./base";

/**
 * Insumos do "Insight do dia" da sidebar.
 *
 * A sidebar aparece em TODA tela e antes rodava `generateInsights()` sobre a
 * lista inteira de pedidos no navegador. Com o store fora do caminho, ela
 * simplesmente parou de mostrar o insight nas telas migradas — que são quase
 * todas.
 *
 * Só os quatro números de que `insightsFromAggregates` precisa são buscados
 * aqui; a montagem do texto continua em `insights-agg.ts`, o mesmo módulo que o
 * dashboard usa. Não há regra duplicada: os limiares e os textos vivem em um
 * lugar só.
 *
 * Não reaproveita `/api/analytics/dashboard` porque aquilo traz heatmap, curva
 * ABC e rankings — caro demais para um cartão decorativo que carrega em toda
 * navegação.
 */

const cache = new Map<string, { versao: string; chaveFiltros: string; dados: InsightInput }>();

async function versaoDatasets(db: PrismaClient): Promise<string> {
  const [row] = await db.$queryRawUnsafe<{ v: string | null }[]>(
    `SELECT string_agg(kind || ':' || imported_at, '|' ORDER BY kind) AS v FROM dataset_meta`
  );
  return row?.v ?? "vazio";
}

export async function getInsightInput(
  db: PrismaClient,
  f: AnalyticsFilters,
  chave: string
): Promise<InsightInput> {
  // O período e os filtros entram na chave; a versão do dataset invalida tudo
  // quando alguém importa. Mesmo padrão de `opcoes.ts`, e pela mesma razão: a
  // sidebar recarrega a cada navegação e isto não pode virar consulta nova.
  const chaveFiltros = JSON.stringify([
    f.from, f.to, f.cmpFrom, f.cmpTo, f.currency, f.rates,
    f.empresaId, f.channel, f.sellerId, f.subgroupId,
  ]);
  const versao = await versaoDatasets(db);
  const guardado = cache.get(chave);
  if (guardado?.versao === versao && guardado.chaveFiltros === chaveFiltros) return guardado.dados;

  const ESCOPO = { escopoGraficos: true } as const;

  const kpi = async (from: string, to: string) => {
    const p = new Params();
    const sql = `${comPedidos(f, p, { ...ESCOPO, from, to })} SELECT ${KPI_SELECT} FROM pe`;
    const [row] = await consultaAnalitica<KpiRow>(db, sql, p.values);
    const revenue = Number(row?.revenue ?? 0);
    const cost = Number(row?.cost ?? 0);
    const pedidos = row?.orders_count ?? 0;
    return {
      revenue,
      averageTicket: pedidos > 0 ? revenue / pedidos : 0,
      marginPct: revenue > 0 ? (revenue - cost) / revenue : 0,
    };
  };

  const subgrupos = async () => {
    const p = new Params();
    // Nível de ITEM, como no dashboard: um pedido pode ter itens de subgrupos
    // diferentes.
    const sql = `${comPedidos(f, p, ESCOPO)}
                 SELECT MIN(subgroup_name) AS label, COALESCE(SUM(total), 0) AS value
                 FROM l GROUP BY subgroup_id ORDER BY 2 DESC LIMIT 50`;
    const rows = await consultaAnalitica<{ label: string; value: unknown }>(db, sql, p.values);
    return rows.map((r) => ({ label: r.label ?? "", value: Number(r.value) }));
  };

  const mensal = async () => {
    const p = new Params();
    const sql = `${comPedidos(f, p, ESCOPO)}
                 SELECT substring(date, 1, 7) AS key, ${SERIE_SELECT}
                 FROM pe GROUP BY 1 ORDER BY 1`;
    const rows = await consultaAnalitica<{ revenue: unknown }>(db, sql, p.values);
    return rows.map((r) => ({ revenue: Number(r.revenue) }));
  };

  const [atual, anterior, subs, meses] = await Promise.all([
    kpi(f.from, f.to),
    f.cmpFrom && f.cmpTo
      ? kpi(f.cmpFrom, f.cmpTo)
      : Promise.resolve({ revenue: 0, averageTicket: 0, marginPct: 0 }),
    subgrupos(),
    mensal(),
  ]);

  const dados: InsightInput = {
    revenue: atual.revenue,
    averageTicket: atual.averageTicket,
    marginPct: atual.marginPct,
    previousRevenue: anterior.revenue,
    previousAverageTicket: anterior.averageTicket,
    subgroups: subs,
    monthly: meses,
  };

  cache.set(chave, { versao, chaveFiltros, dados });
  return dados;
}
