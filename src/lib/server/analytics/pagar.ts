import type { PrismaClient } from "@prisma/client";
import { Params, type AnalyticsFilters } from "./base";

/**
 * Agregações de Contas a Pagar (`payable_items`).
 *
 * Espelha `receber.ts`: mesma estrutura de aging, mesma divisão entre a metade
 * "a pagar" (só pendentes) e a "análise de pagamentos" (pendentes + pagos), e o
 * mesmo filtro por vencimento com limite superior apenas em período
 * personalizado.
 *
 * Diferenças em relação a Contas a Receber:
 *  - fornecedor no lugar de cliente, e é o único agrupamento (não há cidade
 *    nem vendedor nesta tabela);
 *  - `paid_date` no lugar de `received_date`;
 *  - **não há filtro de vendedor** — `useFilteredPayables` não aplica nenhum.
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

export interface PagarData {
  kpi: {
    total: number;
    overdue: number;
    overdueCount: number;
    upcoming: number;
    upcomingCount: number;
    overduePct: number;
    titlesCount: number;
    suppliersCount: number;
    avgDaysOverdue: number;
    avgTicket: number;
    dueNext7: number;
    dueNext30: number;
  };
  aging: { id: AgingBucketId; total: number; count: number }[];
  suppliers: GroupRow[];
  timeline: { key: string; overdue: number; upcoming: number; total: number }[];
  detail: {
    documentId: string;
    supplierId: string;
    supplierName: string;
    dueDate: string;
    amountBRL: number;
    status: "overdue" | "upcoming";
    daysOverdue: number;
  }[];
  payStats: {
    totalPaid: number;
    totalPending: number;
    totalAll: number;
    paymentRate: number;
    paidCount: number;
    pendingCount: number;
    avgDelayDays: number;
    pctOnTime: number;
  };
  monthlyPayment: {
    key: string;
    paid: number;
    pending: number;
    totalDue: number;
    paymentRate: number;
    avgDelayDays: number | null;
    paidCount: number;
  }[];
  supplierPayment: {
    supplierId: string;
    supplierName: string;
    paid: number;
    pending: number;
    totalDue: number;
    paymentRate: number;
    avgDelayDays: number | null;
    paidCount: number;
    pendingCount: number;
  }[];
  allRowsCount: number;
  pendingRowsCount: number;
  hasPaidData: boolean;
  hasData: boolean;
}

/** As tabelas mostram no máximo 15 linhas; 20 cobre com folga. */
const TOP_GRUPO = 20;

export interface PagarOpcoes {
  hoje: string;
  aplicarLimiteSuperior: boolean;
}

export async function getPagarData(
  db: PrismaClient,
  f: AnalyticsFilters,
  o: PagarOpcoes
): Promise<PagarData> {
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

    return `
      titulos AS (
        SELECT r.document_id, r.supplier_id, r.supplier_name,
               r.due_date, r.paid_date, r.is_paid,
               ${valor} AS valor,
               (${p.add(o.hoje)}::date - r.due_date::date) AS diff_dias
        FROM payable_items r ${join}
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
               COALESCE(SUM(dias_atraso * valor) FILTER (WHERE atrasado), 0) AS dias_ponderados,
               COALESCE(SUM(valor) FILTER (WHERE NOT atrasado AND dias_ate_vencer <= 7), 0) AS due7,
               COALESCE(SUM(valor) FILTER (WHERE NOT atrasado AND dias_ate_vencer <= 30), 0) AS due30
        FROM pend
      ),
      fornecedores_distintos AS (SELECT supplier_id FROM pend GROUP BY supplier_id),
      aging AS (
        SELECT CASE WHEN dias_atraso <= 0 THEN 'current'
                    WHEN dias_atraso <= 30 THEN 'd1_30'
                    WHEN dias_atraso <= 60 THEN 'd31_60'
                    WHEN dias_atraso <= 90 THEN 'd61_90'
                    ELSE 'd90plus' END AS id,
               COALESCE(SUM(valor), 0) AS total, COUNT(*)::int AS count
        FROM pend GROUP BY 1
      ),
      por_fornecedor AS (
        SELECT supplier_id AS id,
               COALESCE(MIN(NULLIF(supplier_name, '')), MIN(supplier_id)) AS label,
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
        SELECT document_id, supplier_id, supplier_name, due_date, valor,
               atrasado, dias_atraso, dias_ate_vencer
        FROM pend
        ORDER BY atrasado DESC,
                 CASE WHEN atrasado THEN -dias_atraso ELSE dias_ate_vencer END ASC,
                 document_id ASC
        LIMIT ${p.add(18)}
      )
      SELECT (SELECT row_to_json(k) FROM kpi k) AS kpi,
             (SELECT COUNT(*)::int FROM fornecedores_distintos) AS fornecedores,
             (SELECT COALESCE(json_agg(a), '[]'::json) FROM aging a) AS aging,
             (SELECT COALESCE(json_agg(s ORDER BY s.total DESC, s.id), '[]'::json)
              FROM por_fornecedor s) AS suppliers,
             (SELECT COALESCE(json_agg(l ORDER BY l.key), '[]'::json) FROM linha_tempo l) AS timeline,
             (SELECT COALESCE(json_agg(d), '[]'::json) FROM detalhe d) AS detail`;
    const [row] = await db.$queryRawUnsafe<Record<string, unknown>[]>(sql, ...p.values);
    return row ?? {};
  };

  /** Guarda contra data de pagamento vazia — ver a nota equivalente em receber.ts. */
  const pagamentos = async () => {
    const p = new Params();
    const PAGO_COM_DATA = `is_paid AND paid_date <> ''`;
    const ATRASO = `(paid_date::date - due_date::date)`;
    const sql = `WITH ${ctes(p)},
      stats AS (
        SELECT COALESCE(SUM(valor) FILTER (WHERE is_paid), 0) AS total_paid,
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
               COALESCE(SUM(valor) FILTER (WHERE is_paid), 0) AS paid,
               COALESCE(SUM(valor) FILTER (WHERE NOT is_paid), 0) AS pending,
               COALESCE(SUM(${ATRASO}) FILTER (WHERE ${PAGO_COM_DATA}), 0) AS soma_atraso,
               COUNT(*) FILTER (WHERE is_paid)::int AS paid_count,
               COUNT(*) FILTER (WHERE ${PAGO_COM_DATA})::int AS com_data
        FROM titulos GROUP BY 1 ORDER BY 1
      ),
      por_fornecedor AS (
        SELECT supplier_id, COALESCE(MIN(NULLIF(supplier_name, '')), '') AS supplier_name,
               COALESCE(SUM(valor) FILTER (WHERE is_paid), 0) AS paid,
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
             (SELECT COALESCE(json_agg(c ORDER BY c.total_due DESC, c.supplier_id), '[]'::json)
              FROM por_fornecedor c) AS fornecedores`;
    const [row] = await db.$queryRawUnsafe<Record<string, unknown>[]>(sql, ...p.values);
    return row ?? {};
  };

  const temAlgumDado = async (): Promise<boolean> => {
    const [row] = await db.$queryRawUnsafe<{ existe: boolean }[]>(
      "SELECT EXISTS (SELECT 1 FROM payable_items) AS existe"
    );
    return row?.existe ?? false;
  };

  const [a, b, hasData] = await Promise.all([pendentes(), pagamentos(), temAlgumDado()]);

  const k = (a.kpi ?? {}) as Record<string, number>;
  const total = Number(k.total ?? 0);
  const overdue = Number(k.overdue ?? 0);
  const titlesCount = Number(k.titles_count ?? 0);

  const s = (b.stats ?? {}) as Record<string, number>;
  const totalPaid = Number(s.total_paid ?? 0);
  const totalPending = Number(s.total_pending ?? 0);
  const totalAll = totalPaid + totalPending;
  const paidCount = Number(s.paid_count ?? 0);
  const pendingCount = Number(s.pending_count ?? 0);
  const comData = Number(s.com_data ?? 0);

  const agingRows = (a.aging ?? []) as { id: string; total: unknown; count: number }[];
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
      suppliersCount: Number(a.fornecedores ?? 0),
      avgDaysOverdue: overdue > 0 ? Number(k.dias_ponderados ?? 0) / overdue : 0,
      avgTicket: titlesCount > 0 ? total / titlesCount : 0,
      dueNext7: Number(k.due7 ?? 0),
      dueNext30: Number(k.due30 ?? 0),
    },
    aging: AGING_ORDER.map((id) => ({
      id,
      total: Number(porBucket.get(id)?.total ?? 0),
      count: porBucket.get(id)?.count ?? 0,
    })),
    suppliers: ((a.suppliers ?? []) as {
      id: string; label: string; total: unknown; overdue: unknown; upcoming: unknown; count: number;
    }[]).map((g) => ({
      id: g.id,
      label: g.label,
      total: Number(g.total),
      overdue: Number(g.overdue),
      upcoming: Number(g.upcoming),
      count: g.count,
    })),
    timeline: ((a.timeline ?? []) as { key: string; overdue: unknown; upcoming: unknown; total: unknown }[])
      .map((t) => ({
        key: t.key,
        overdue: Number(t.overdue),
        upcoming: Number(t.upcoming),
        total: Number(t.total),
      })),
    detail: ((a.detail ?? []) as {
      document_id: string; supplier_id: string; supplier_name: string;
      due_date: string; valor: unknown; atrasado: boolean; dias_atraso: number;
    }[]).map((d) => ({
      documentId: d.document_id,
      supplierId: d.supplier_id,
      supplierName: d.supplier_name,
      dueDate: d.due_date,
      amountBRL: Number(d.valor),
      status: d.atrasado ? "overdue" : "upcoming",
      daysOverdue: d.dias_atraso,
    })),
    payStats: {
      totalPaid,
      totalPending,
      totalAll,
      paymentRate: totalAll > 0 ? totalPaid / totalAll : 0,
      paidCount,
      pendingCount,
      avgDelayDays: comData > 0 ? Number(s.soma_atraso ?? 0) / comData : 0,
      pctOnTime: comData > 0 ? Number(s.no_prazo ?? 0) / comData : 0,
    },
    monthlyPayment: ((b.meses ?? []) as {
      key: string; paid: unknown; pending: unknown; soma_atraso: unknown;
      paid_count: number; com_data: number;
    }[]).map((m) => {
      const paid = Number(m.paid);
      const pending = Number(m.pending);
      const totalDue = paid + pending;
      return {
        key: m.key,
        paid,
        pending,
        totalDue,
        paymentRate: totalDue > 0 ? paid / totalDue : 0,
        avgDelayDays: m.com_data > 0 ? Number(m.soma_atraso) / m.com_data : null,
        paidCount: m.paid_count,
      };
    }),
    supplierPayment: ((b.fornecedores ?? []) as {
      supplier_id: string; supplier_name: string; paid: unknown; pending: unknown;
      soma_atraso: unknown; paid_count: number; pending_count: number; com_data: number;
    }[]).map((c) => {
      const paid = Number(c.paid);
      const pending = Number(c.pending);
      const totalDue = paid + pending;
      return {
        supplierId: c.supplier_id,
        supplierName: c.supplier_name,
        paid,
        pending,
        totalDue,
        paymentRate: totalDue > 0 ? paid / totalDue : 0,
        avgDelayDays: c.com_data > 0 ? Number(c.soma_atraso) / c.com_data : null,
        paidCount: c.paid_count,
        pendingCount: c.pending_count,
      };
    }),
    allRowsCount: paidCount + pendingCount,
    pendingRowsCount: titlesCount,
    hasPaidData: paidCount > 0,
    hasData,
  };
}
