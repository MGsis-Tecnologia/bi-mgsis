import type { PrismaClient } from "@prisma/client";
import { Params, consultaAnalitica, exprTaxa, joinCambio, type AnalyticsFilters } from "./base";

/**
 * Agregações de Caixa & DRE (`caixa_items`).
 *
 * O que fica no servidor é o que soma linhas; o que fica no cliente é a
 * montagem da árvore da DRE (marcar pais pelo prefixo do código, propagar
 * totais) e o agrupamento das fatias pequenas do gráfico de gastos. Ambos são
 * manipulação de poucas dezenas de linhas já agregadas — o mesmo critério
 * usado no mapa de vendas.
 *
 * O período filtra por `date` com **os dois limites**, diferente de Contas a
 * Receber/Pagar.
 */

export interface DreData {
  kpis: {
    ingressos: number;
    gastos: number;
    saldo: number;
    margem: number;
    count: number;
  };
  /** Séries mensal e diária vêm juntas: a tela alterna sem nova consulta. */
  monthly: { key: string; ingressos: number; gastos: number }[];
  daily: { key: string; ingressos: number; gastos: number }[];
  /** Agregado por código de plano de contas — a árvore é montada no cliente. */
  planoContas: {
    planoContaId: string;
    planoContaCodigo: string;
    planoContaDescricao: string;
    ingressos: number;
    gastos: number;
  }[];
  /** Gastos por descrição de conta; o corte de fatias pequenas é no cliente. */
  gastosPorConta: { name: string; value: number }[];
  centrosCusto: {
    id: string;
    descricao: string;
    ingressos: number;
    gastos: number;
  }[];
  hasData: boolean;
}

export async function getDreData(
  db: PrismaClient,
  f: AnalyticsFilters
): Promise<DreData> {
  const cte = (p: Params) => {
    // Cotação do dia do lançamento — ver joinCambio em base.ts.
    const join = joinCambio(f, p, "c.date", "c.moeda_id");
    const valor = `c.valor_documento * ${exprTaxa(f)}`;

    const cond = [`c.date >= ${p.add(f.from)}`, `c.date <= ${p.add(f.to)}`];
    if (f.empresaId !== "all") cond.push(`c.empresa_id = ${p.add(f.empresaId)}`);
    if (f.currency !== "ALL") cond.push(`c.moeda_id = ${p.add(f.currency)}`);

    return `mov AS (
      SELECT c.date, c.centro_custo_id, c.centro_custo_descricao,
             c.plano_conta_id, c.plano_conta_codigo, c.plano_conta_descricao,
             ${valor} AS valor
      FROM caixa_items c ${join}
      WHERE ${cond.join(" AND ")}
    )`;
  };

  /**
   * Ingressos são os valores positivos; gastos, o módulo dos negativos. Zero
   * não entra em nenhum dos dois — o original usa `> 0` e `else`, então o zero
   * cai em gastos com valor 0, o que dá no mesmo.
   */
  const ING = `COALESCE(SUM(valor) FILTER (WHERE valor > 0), 0)`;
  const GAS = `COALESCE(SUM(-valor) FILTER (WHERE valor <= 0), 0)`;

  const tudo = async () => {
    const p = new Params();
    const sql = `WITH ${cte(p)},
      kpi AS (SELECT ${ING} AS ingressos, ${GAS} AS gastos, COUNT(*)::int AS count FROM mov),
      mensal AS (
        SELECT substring(date, 1, 7) AS key, ${ING} AS ingressos, ${GAS} AS gastos
        FROM mov GROUP BY 1 ORDER BY 1
      ),
      diario AS (
        SELECT substring(date, 1, 10) AS key, ${ING} AS ingressos, ${GAS} AS gastos
        FROM mov GROUP BY 1 ORDER BY 1
      ),
      plano AS (
        SELECT COALESCE(NULLIF(plano_conta_codigo, ''), NULLIF(plano_conta_id, ''), '?') AS chave,
               COALESCE(MIN(plano_conta_id), '') AS plano_conta_id,
               COALESCE(MIN(plano_conta_codigo), '') AS plano_conta_codigo,
               COALESCE(MIN(plano_conta_descricao), '') AS plano_conta_descricao,
               ${ING} AS ingressos, ${GAS} AS gastos
        FROM mov GROUP BY 1
      ),
      gastos_conta AS (
        SELECT COALESCE(NULLIF(plano_conta_descricao, ''), 'Sem categoria') AS name,
               COALESCE(SUM(-valor), 0) AS value
        FROM mov WHERE valor < 0 GROUP BY 1
      ),
      centros AS (
        SELECT COALESCE(NULLIF(centro_custo_id, ''), '?') AS chave,
               COALESCE(MIN(centro_custo_id), '') AS id,
               COALESCE(MIN(NULLIF(centro_custo_descricao, '')), MIN(centro_custo_id), '') AS descricao,
               ${ING} AS ingressos, ${GAS} AS gastos
        FROM mov GROUP BY 1
      )
      SELECT (SELECT row_to_json(k) FROM kpi k) AS kpi,
             (SELECT COALESCE(json_agg(m ORDER BY m.key), '[]'::json) FROM mensal m) AS monthly,
             (SELECT COALESCE(json_agg(d ORDER BY d.key), '[]'::json) FROM diario d) AS daily,
             (SELECT COALESCE(json_agg(x ORDER BY x.plano_conta_codigo), '[]'::json) FROM plano x) AS plano,
             (SELECT COALESCE(json_agg(g ORDER BY g.value DESC, g.name), '[]'::json) FROM gastos_conta g) AS gastos,
             (SELECT COALESCE(json_agg(c ORDER BY c.gastos DESC, c.id), '[]'::json) FROM centros c) AS centros`;
    const [row] = await consultaAnalitica<Record<string, unknown>>(db, sql, p.values);
    return row ?? {};
  };

  const temAlgumDado = async (): Promise<boolean> => {
    const [row] = await db.$queryRawUnsafe<{ existe: boolean }[]>(
      "SELECT EXISTS (SELECT 1 FROM caixa_items) AS existe"
    );
    return row?.existe ?? false;
  };

  const [r, hasData] = await Promise.all([tudo(), temAlgumDado()]);

  const k = (r.kpi ?? {}) as Record<string, number>;
  const ingressos = Number(k.ingressos ?? 0);
  const gastos = Number(k.gastos ?? 0);

  const serie = (rows: unknown) =>
    ((rows ?? []) as { key: string; ingressos: unknown; gastos: unknown }[]).map((s) => ({
      key: s.key,
      ingressos: Number(s.ingressos),
      gastos: Number(s.gastos),
    }));

  return {
    kpis: {
      ingressos,
      gastos,
      saldo: ingressos - gastos,
      margem: ingressos > 0 ? (ingressos - gastos) / ingressos : 0,
      count: Number(k.count ?? 0),
    },
    monthly: serie(r.monthly),
    daily: serie(r.daily),
    planoContas: ((r.plano ?? []) as {
      plano_conta_id: string; plano_conta_codigo: string; plano_conta_descricao: string;
      ingressos: unknown; gastos: unknown;
    }[]).map((x) => ({
      planoContaId: x.plano_conta_id,
      planoContaCodigo: x.plano_conta_codigo,
      planoContaDescricao: x.plano_conta_descricao,
      ingressos: Number(x.ingressos),
      gastos: Number(x.gastos),
    })),
    gastosPorConta: ((r.gastos ?? []) as { name: string; value: unknown }[]).map((g) => ({
      name: g.name,
      value: Number(g.value),
    })),
    centrosCusto: ((r.centros ?? []) as {
      id: string; descricao: string; ingressos: unknown; gastos: unknown;
    }[]).map((c) => ({
      id: c.id,
      descricao: c.descricao,
      ingressos: Number(c.ingressos),
      gastos: Number(c.gastos),
    })),
    hasData,
  };
}
