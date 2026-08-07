import type { PrismaClient } from "@prisma/client";
import { Params, type AnalyticsFilters } from "./base";

/**
 * Agregações de Contas a Receber (`receivable_items`).
 *
 * Duas particularidades desta tela, herdadas do comportamento atual:
 *
 *  - **O período filtra por VENCIMENTO, e só pelo limite inferior.** Os presets
 *    de data terminam "hoje", e aplicar o limite superior esconderia todo
 *    título a vencer. O limite superior só vale em período personalizado —
 *    quem decide isso é o cliente (`aplicarLimiteSuperior`).
 *  - **A tela tem duas metades com bases diferentes:** os indicadores de
 *    "a receber" olham só os títulos PENDENTES; a análise de recebimentos olha
 *    pendentes e pagos juntos.
 *
 * A referência de "hoje" vem do navegador, como em /clientes e /prospeccao: o
 * atraso em dias não pode depender do fuso do servidor.
 */

export type AgingBucketId = "current" | "d1_30" | "d31_60" | "d61_90" | "d90plus";

export const AGING_ORDER: AgingBucketId[] = ["current", "d1_30", "d31_60", "d61_90", "d90plus"];

export interface GroupRow {
  id: string;
  label: string;
  total: number;
  overdue: number;
  upcoming: number;
  count: number;
}

export interface ReceberData {
  kpi: {
    total: number;
    overdue: number;
    overdueCount: number;
    upcoming: number;
    upcomingCount: number;
    overduePct: number;
    titlesCount: number;
    clientsCount: number;
    avgDaysOverdue: number;
    avgTicket: number;
    dueNext7: number;
    dueNext30: number;
  };
  aging: { id: AgingBucketId; total: number; count: number }[];
  clients: GroupRow[];
  sellers: GroupRow[];
  cities: GroupRow[];
  timeline: { key: string; overdue: number; upcoming: number; total: number }[];
  detail: {
    documentId: string;
    clientId: string;
    clientName: string;
    sellerName: string;
    dueDate: string;
    amountBRL: number;
    status: "overdue" | "upcoming";
    daysOverdue: number;
  }[];
  payStats: {
    totalReceived: number;
    totalPending: number;
    totalAll: number;
    collectionRate: number;
    paidCount: number;
    pendingCount: number;
    avgDelayDays: number;
    pctOnTime: number;
  };
  monthlyCollection: {
    key: string;
    received: number;
    pending: number;
    totalDue: number;
    collectionRate: number;
    avgDelayDays: number | null;
    paidCount: number;
  }[];
  clientPayment: {
    clientId: string;
    clientName: string;
    received: number;
    pending: number;
    totalDue: number;
    collectionRate: number;
    avgDelayDays: number | null;
    paidCount: number;
    pendingCount: number;
  }[];
  /** Total de títulos no escopo (pendentes + pagos) — badge do cabeçalho. */
  allRowsCount: number;
  pendingRowsCount: number;
  hasPaidData: boolean;
  hasData: boolean;
}

/**
 * As tabelas da tela mostram no máximo 15 linhas por grupo; devolver 20 cobre
 * todas com folga e evita trafegar os 3.305 clientes da base.
 */
const TOP_GRUPO = 20;

export interface ReceberOpcoes {
  /** "Hoje" do navegador — referência de todo o cálculo de atraso. */
  hoje: string;
  /** Só o período personalizado aplica o limite superior de data. */
  aplicarLimiteSuperior: boolean;
}

export async function getReceberData(
  db: PrismaClient,
  f: AnalyticsFilters,
  o: ReceberOpcoes
): Promise<ReceberData> {
  /**
   * CTEs base. `titulos` é o escopo completo (pagos + pendentes); `pend` já
   * traz o aging calculado. `diff_dias` reproduz o
   * `Math.round((hoje - vencimento) / DIA)` do original — como ambos são
   * meia-noite local, a subtração de datas dá o mesmo inteiro.
   */
  const ctes = (p: Params) => {
    const linhas = Object.entries(f.rates);
    const converte = f.currency === "ALL" && linhas.length > 0;
    const join = converte
      ? `LEFT JOIN (VALUES ${linhas
          .map(([cid, t]) => `(${p.add(cid)}::text, ${p.add(t)}::double precision)`)
          .join(", ")}) AS x(cid, taxa) ON x.cid = r.currency_id`
      : "";
    const valor = converte ? "r.amount_orig * COALESCE(x.taxa, 1)" : "r.amount_orig";

    const cond = [`r.due_date >= ${p.add(f.from)}`];
    if (o.aplicarLimiteSuperior) cond.push(`r.due_date <= ${p.add(f.to)}`);
    if (f.empresaId !== "all") cond.push(`r.empresa_id = ${p.add(f.empresaId)}`);
    if (f.currency !== "ALL") cond.push(`r.currency_id = ${p.add(f.currency)}`);
    if (f.sellerId !== "all") cond.push(`r.seller_id = ${p.add(f.sellerId)}`);

    return `
      titulos AS (
        SELECT r.document_id, r.client_id, r.client_name, r.client_city,
               r.seller_id, r.seller_name, r.due_date, r.received_date, r.is_paid,
               ${valor} AS valor,
               (${p.add(o.hoje)}::date - r.due_date::date) AS diff_dias
        FROM receivable_items r ${join}
        WHERE ${cond.join(" AND ")}
      ),
      pend AS (
        SELECT t.*,
               GREATEST(t.diff_dias, 0) AS dias_atraso,
               CASE WHEN t.diff_dias > 0 THEN 0 ELSE -t.diff_dias END AS dias_ate_vencer,
               (t.diff_dias > 0) AS atrasado
        FROM titulos t WHERE NOT t.is_paid
      )`;
  };

  /** Metade "a receber": tudo sobre os títulos pendentes. */
  const pendentes = async () => {
    const p = new Params();
    const sql = `WITH ${ctes(p)},
      kpi AS (
        SELECT COALESCE(SUM(valor), 0) AS total,
               COALESCE(SUM(valor) FILTER (WHERE atrasado), 0) AS overdue,
               COUNT(*) FILTER (WHERE atrasado)::int AS overdue_count,
               COALESCE(SUM(valor) FILTER (WHERE NOT atrasado), 0) AS upcoming,
               COUNT(*) FILTER (WHERE NOT atrasado)::int AS upcoming_count,
               COUNT(*)::int AS titles_count,
               -- Média de atraso PONDERADA PELO VALOR, como no original.
               COALESCE(SUM(dias_atraso * valor) FILTER (WHERE atrasado), 0) AS dias_ponderados,
               COALESCE(SUM(valor) FILTER (WHERE NOT atrasado AND dias_ate_vencer <= 7), 0) AS due7,
               COALESCE(SUM(valor) FILTER (WHERE NOT atrasado AND dias_ate_vencer <= 30), 0) AS due30
        FROM pend
      ),
      clientes_distintos AS (SELECT client_id FROM pend GROUP BY client_id),
      aging AS (
        SELECT CASE WHEN dias_atraso <= 0 THEN 'current'
                    WHEN dias_atraso <= 30 THEN 'd1_30'
                    WHEN dias_atraso <= 60 THEN 'd31_60'
                    WHEN dias_atraso <= 90 THEN 'd61_90'
                    ELSE 'd90plus' END AS id,
               COALESCE(SUM(valor), 0) AS total, COUNT(*)::int AS count
        FROM pend GROUP BY 1
      ),
      por_cliente AS (
        SELECT client_id AS id, COALESCE(MIN(NULLIF(client_name, '')), MIN(client_id)) AS label,
               COALESCE(SUM(valor), 0) AS total,
               COALESCE(SUM(valor) FILTER (WHERE atrasado), 0) AS overdue,
               COALESCE(SUM(valor) FILTER (WHERE NOT atrasado), 0) AS upcoming,
               COUNT(*)::int AS count
        FROM pend GROUP BY 1 ORDER BY 3 DESC, 1 LIMIT ${p.add(TOP_GRUPO)}
      ),
      por_vendedor AS (
        SELECT COALESCE(NULLIF(seller_id, ''), '__none__') AS id,
               COALESCE(MIN(NULLIF(seller_name, '')), '') AS label,
               COALESCE(SUM(valor), 0) AS total,
               COALESCE(SUM(valor) FILTER (WHERE atrasado), 0) AS overdue,
               COALESCE(SUM(valor) FILTER (WHERE NOT atrasado), 0) AS upcoming,
               COUNT(*)::int AS count
        FROM pend GROUP BY 1 ORDER BY 3 DESC, 1 LIMIT ${p.add(TOP_GRUPO)}
      ),
      por_cidade AS (
        SELECT COALESCE(NULLIF(btrim(client_city), ''), '__none__') AS id,
               COALESCE(NULLIF(btrim(MIN(client_city)), ''), '') AS label,
               COALESCE(SUM(valor), 0) AS total,
               COALESCE(SUM(valor) FILTER (WHERE atrasado), 0) AS overdue,
               COALESCE(SUM(valor) FILTER (WHERE NOT atrasado), 0) AS upcoming,
               COUNT(*)::int AS count
        FROM pend GROUP BY 1 ORDER BY 3 DESC, 1 LIMIT ${p.add(TOP_GRUPO)}
      ),
      linha_tempo AS (
        SELECT substring(due_date, 1, 7) AS key,
               COALESCE(SUM(valor) FILTER (WHERE atrasado), 0) AS overdue,
               COALESCE(SUM(valor) FILTER (WHERE NOT atrasado), 0) AS upcoming,
               COALESCE(SUM(valor), 0) AS total
        FROM pend GROUP BY 1 ORDER BY 1
      ),
      detalhe AS (
        SELECT document_id, client_id, client_name, seller_name, due_date, valor,
               atrasado, dias_atraso, dias_ate_vencer
        FROM pend
        -- Atrasados primeiro (maior atraso no topo), depois os a vencer mais
        -- próximos. Desempate por documento para a ordem não variar.
        ORDER BY atrasado DESC,
                 CASE WHEN atrasado THEN -dias_atraso ELSE dias_ate_vencer END ASC,
                 document_id ASC
        LIMIT ${p.add(18)}
      )
      SELECT (SELECT row_to_json(k) FROM kpi k) AS kpi,
             (SELECT COUNT(*)::int FROM clientes_distintos) AS clientes,
             (SELECT COALESCE(json_agg(a), '[]'::json) FROM aging a) AS aging,
             (SELECT COALESCE(json_agg(c ORDER BY c.total DESC, c.id), '[]'::json) FROM por_cliente c) AS clients,
             (SELECT COALESCE(json_agg(v ORDER BY v.total DESC, v.id), '[]'::json) FROM por_vendedor v) AS sellers,
             (SELECT COALESCE(json_agg(x ORDER BY x.total DESC, x.id), '[]'::json) FROM por_cidade x) AS cities,
             (SELECT COALESCE(json_agg(l ORDER BY l.key), '[]'::json) FROM linha_tempo l) AS timeline,
             (SELECT COALESCE(json_agg(d), '[]'::json) FROM detalhe d) AS detail`;
    const [row] = await db.$queryRawUnsafe<Record<string, unknown>[]>(sql, ...p.values);
    return row ?? {};
  };

  /**
   * Metade "análise de recebimentos": pendentes e pagos juntos.
   *
   * O atraso só é somado para pagos COM data de recebimento. O código antigo não
   * fazia essa guarda — uma data vazia viraria `NaN` e contaminaria a média da
   * tela inteira. Hoje não acontece (os 13.655 sem data são exatamente os
   * pendentes), mas a guarda evita que um dado ruim derrube a página.
   */
  const recebimentos = async () => {
    const p = new Params();
    const PAGO_COM_DATA = `is_paid AND received_date <> ''`;
    const ATRASO = `(received_date::date - due_date::date)`;
    const sql = `WITH ${ctes(p)},
      stats AS (
        SELECT COALESCE(SUM(valor) FILTER (WHERE is_paid), 0) AS total_received,
               COALESCE(SUM(valor) FILTER (WHERE NOT is_paid), 0) AS total_pending,
               COUNT(*) FILTER (WHERE is_paid)::int AS paid_count,
               COUNT(*) FILTER (WHERE NOT is_paid)::int AS pending_count,
               COALESCE(SUM(${ATRASO}) FILTER (WHERE ${PAGO_COM_DATA}), 0) AS soma_atraso,
               COUNT(*) FILTER (WHERE ${PAGO_COM_DATA})::int AS com_data,
               COUNT(*) FILTER (WHERE ${PAGO_COM_DATA} AND ${ATRASO} <= 0)::int AS no_prazo
        FROM titulos
      ),
      por_mes AS (
        SELECT substring(due_date, 1, 7) AS key,
               COALESCE(SUM(valor) FILTER (WHERE is_paid), 0) AS received,
               COALESCE(SUM(valor) FILTER (WHERE NOT is_paid), 0) AS pending,
               COALESCE(SUM(${ATRASO}) FILTER (WHERE ${PAGO_COM_DATA}), 0) AS soma_atraso,
               COUNT(*) FILTER (WHERE is_paid)::int AS paid_count,
               COUNT(*) FILTER (WHERE ${PAGO_COM_DATA})::int AS com_data
        FROM titulos GROUP BY 1 ORDER BY 1
      ),
      por_cliente AS (
        SELECT client_id, COALESCE(MIN(NULLIF(client_name, '')), '') AS client_name,
               COALESCE(SUM(valor) FILTER (WHERE is_paid), 0) AS received,
               COALESCE(SUM(valor) FILTER (WHERE NOT is_paid), 0) AS pending,
               COALESCE(SUM(valor), 0) AS total_due,
               COALESCE(SUM(${ATRASO}) FILTER (WHERE ${PAGO_COM_DATA}), 0) AS soma_atraso,
               COUNT(*) FILTER (WHERE is_paid)::int AS paid_count,
               COUNT(*) FILTER (WHERE NOT is_paid)::int AS pending_count,
               COUNT(*) FILTER (WHERE ${PAGO_COM_DATA})::int AS com_data
        FROM titulos GROUP BY 1 ORDER BY 5 DESC, 1 LIMIT ${p.add(TOP_GRUPO)}
      )
      SELECT (SELECT row_to_json(s) FROM stats s) AS stats,
             (SELECT COALESCE(json_agg(m ORDER BY m.key), '[]'::json) FROM por_mes m) AS meses,
             (SELECT COALESCE(json_agg(c ORDER BY c.total_due DESC, c.client_id), '[]'::json)
              FROM por_cliente c) AS clientes`;
    const [row] = await db.$queryRawUnsafe<Record<string, unknown>[]>(sql, ...p.values);
    return row ?? {};
  };

  const temAlgumDado = async (): Promise<boolean> => {
    const [row] = await db.$queryRawUnsafe<{ existe: boolean }[]>(
      "SELECT EXISTS (SELECT 1 FROM receivable_items) AS existe"
    );
    return row?.existe ?? false;
  };

  const [a, b, hasData] = await Promise.all([pendentes(), recebimentos(), temAlgumDado()]);

  const k = (a.kpi ?? {}) as Record<string, number>;
  const total = Number(k.total ?? 0);
  const overdue = Number(k.overdue ?? 0);
  const titlesCount = Number(k.titles_count ?? 0);

  const s = (b.stats ?? {}) as Record<string, number>;
  const totalReceived = Number(s.total_received ?? 0);
  const totalPending = Number(s.total_pending ?? 0);
  const totalAll = totalReceived + totalPending;
  const paidCount = Number(s.paid_count ?? 0);
  const comData = Number(s.com_data ?? 0);

  const grupo = (rows: unknown): GroupRow[] =>
    ((rows ?? []) as { id: string; label: string; total: unknown; overdue: unknown; upcoming: unknown; count: number }[])
      .map((g) => ({
        id: g.id,
        label: g.label,
        total: Number(g.total),
        overdue: Number(g.overdue),
        upcoming: Number(g.upcoming),
        count: g.count,
      }));

  const agingRows = ((a.aging ?? []) as { id: string; total: unknown; count: number }[]);
  const porBucket = new Map(agingRows.map((x) => [x.id, x]));

  return {
    kpi: {
      total,
      overdue,
      overdueCount: Number(k.overdue_count ?? 0),
      upcoming: Number(k.upcoming ?? 0),
      upcomingCount: Number(k.upcoming_count ?? 0),
      overduePct: total > 0 ? overdue / total : 0,
      titlesCount,
      clientsCount: Number(a.clientes ?? 0),
      avgDaysOverdue: overdue > 0 ? Number(k.dias_ponderados ?? 0) / overdue : 0,
      avgTicket: titlesCount > 0 ? total / titlesCount : 0,
      dueNext7: Number(k.due7 ?? 0),
      dueNext30: Number(k.due30 ?? 0),
    },
    // Ordem fixa dos baldes, com zero para os ausentes — como no original.
    aging: AGING_ORDER.map((id) => ({
      id,
      total: Number(porBucket.get(id)?.total ?? 0),
      count: porBucket.get(id)?.count ?? 0,
    })),
    clients: grupo(a.clients),
    sellers: grupo(a.sellers),
    cities: grupo(a.cities),
    timeline: ((a.timeline ?? []) as { key: string; overdue: unknown; upcoming: unknown; total: unknown }[])
      .map((t) => ({
        key: t.key,
        overdue: Number(t.overdue),
        upcoming: Number(t.upcoming),
        total: Number(t.total),
      })),
    detail: ((a.detail ?? []) as {
      document_id: string; client_id: string; client_name: string; seller_name: string;
      due_date: string; valor: unknown; atrasado: boolean; dias_atraso: number;
    }[]).map((d) => ({
      documentId: d.document_id,
      clientId: d.client_id,
      clientName: d.client_name,
      sellerName: d.seller_name,
      dueDate: d.due_date,
      amountBRL: Number(d.valor),
      status: d.atrasado ? "overdue" : "upcoming",
      daysOverdue: d.dias_atraso,
    })),
    payStats: {
      totalReceived,
      totalPending,
      totalAll,
      collectionRate: totalAll > 0 ? totalReceived / totalAll : 0,
      paidCount,
      pendingCount: Number(s.pending_count ?? 0),
      avgDelayDays: comData > 0 ? Number(s.soma_atraso ?? 0) / comData : 0,
      pctOnTime: comData > 0 ? Number(s.no_prazo ?? 0) / comData : 0,
    },
    monthlyCollection: ((b.meses ?? []) as {
      key: string; received: unknown; pending: unknown; soma_atraso: unknown;
      paid_count: number; com_data: number;
    }[]).map((m) => {
      const received = Number(m.received);
      const pending = Number(m.pending);
      const totalDue = received + pending;
      return {
        key: m.key,
        received,
        pending,
        totalDue,
        collectionRate: totalDue > 0 ? received / totalDue : 0,
        avgDelayDays: m.com_data > 0 ? Number(m.soma_atraso) / m.com_data : null,
        paidCount: m.paid_count,
      };
    }),
    clientPayment: ((b.clientes ?? []) as {
      client_id: string; client_name: string; received: unknown; pending: unknown;
      soma_atraso: unknown; paid_count: number; pending_count: number; com_data: number;
    }[]).map((c) => {
      const received = Number(c.received);
      const pending = Number(c.pending);
      const totalDue = received + pending;
      return {
        clientId: c.client_id,
        clientName: c.client_name,
        received,
        pending,
        totalDue,
        collectionRate: totalDue > 0 ? received / totalDue : 0,
        avgDelayDays: c.com_data > 0 ? Number(c.soma_atraso) / c.com_data : null,
        paidCount: c.paid_count,
        pendingCount: c.pending_count,
      };
    }),
    allRowsCount: paidCount + Number(s.pending_count ?? 0),
    pendingRowsCount: titlesCount,
    hasPaidData: paidCount > 0,
    hasData,
  };
}
