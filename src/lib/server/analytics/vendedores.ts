import type { PrismaClient } from "@prisma/client";
import { Params, comPedidos, consultaAnalitica, whereBase, type AnalyticsFilters } from "./base";

/**
 * Agregações da tela de Vendedores — a mais complexa migrada até aqui, porque
 * junta três análises com bases diferentes:
 *
 *  1. Desempenho: agregado do período por vendedor.
 *  2. Prospecção: compara o período com o HISTÓRICO COMPLETO, para saber quem
 *     é cliente novo do vendedor e quem deixou de comprar.
 *  3. Consistência: como a receita foi construída ao longo dos dias.
 *
 * Nível de PEDIDO (`pe`) em tudo. Escopo COMPLETO de filtros no período; o
 * histórico da prospecção usa o escopo BASE, como o `ds.orders` do código antigo.
 */

export interface VendedorMetrica {
  id: string;
  name: string;
  orders: number;
  revenue: number;
  averageTicket: number;
  marginPct: number;
  discount: number;
  discountPct: number;
  achievement: number;
  /** Devoluções do vendedor no período (positivo; a tela exibe negativo). */
  returns: number;
}

export interface VendedorProspeccao {
  id: string;
  name: string;
  activeClients: number;
  newClients: number;
  churnedClients: number;
  ticketNew: number;
  ticketOld: number;
  revenueNew: number;
  revenueOld: number;
}

export interface VendedorConsistencia {
  id: string;
  name: string;
  revenue: number;
  activeDays: number;
  operatingDays: number;
  dayCoverage: number;
  top1Pct: number;
  top3Pct: number;
  topClientPct: number;
  last5Pct: number;
  cv: number;
}

export interface VendedoresData {
  metrics: VendedorMetrica[];
  prospection: VendedorProspeccao[];
  consistency: VendedorConsistencia[];
  teamRevenue: number;
  totalReturns: number;
  avgAchievement: number;
  totalSellers: number;
  hasData: boolean;
}

export async function getVendedoresData(
  db: PrismaClient,
  f: AnalyticsFilters
): Promise<VendedoresData> {
  const escopo = { escopoGraficos: true } as const;

  /** Todos os vendedores do histórico — a tabela lista até os sem venda no período. */
  const todosVendedores = async (): Promise<{ id: string; name: string }[]> => {
    const p = new Params();
    const where = whereBase(f, p);
    const sql = `SELECT seller_id AS id, MIN(seller_name) AS name
                 FROM sale_items s WHERE ${where} GROUP BY seller_id`;
    return consultaAnalitica<{ id: string; name: string }>(db, sql, p.values);
  };

  const agregadoPeriodo = async () => {
    const p = new Params();
    const sql = `${comPedidos(f, p, escopo)}
      SELECT seller_id AS id, COUNT(*)::int AS orders,
             SUM(total) AS revenue, SUM(cost) AS cost, SUM(discount) AS discount
      FROM pe GROUP BY seller_id`;
    return consultaAnalitica<
      { id: string; orders: number; revenue: unknown; cost: unknown; discount: unknown }
    >(db, sql, p.values);
  };

  /** Devoluções: mesma tabela, outro `order_type`. */
  const devolucoes = async () => {
    const p = new Params();
    const sql = `${comPedidos(f, p, { escopoGraficos: true, tipo: "DEVOLUCAO VENDA" })}
                 SELECT seller_id AS id, SUM(total) AS total FROM pe GROUP BY seller_id`;
    return consultaAnalitica<{ id: string; total: unknown }>(db, sql, p.values);
  };

  /**
   * Prospecção. `hist` é a primeira compra de cada par (vendedor, cliente) em
   * TODO o histórico — é ela que decide se o cliente é novo do vendedor ou já
   * era da carteira. `pre` são os clientes que compravam antes do período: os
   * que não aparecem nele viraram churn.
   */
  const prospeccao = async () => {
    const p = new Params();
    const prefixo = comPedidos(f, p, escopo);
    // Mesmo acumulador de parâmetros: `whereBase` já numera a partir do que
    // o prefixo consumiu. Escopo BASE aqui — o histórico da prospecção ignora
    // canal/vendedor/subgrupo, como o `ds.orders` do código antigo.
    const whereHist = whereBase(f, p);
    const inicio = p.add(f.from);

    const sql = `${prefixo},
      hist AS (
        SELECT s.seller_id, s.client_id, MIN(s.date) AS first_date
        FROM sale_items s WHERE ${whereHist}
        GROUP BY s.seller_id, s.client_id
      ),
      pre AS (
        SELECT s.seller_id, s.client_id
        FROM sale_items s WHERE ${whereHist} AND s.date < ${inicio}
        GROUP BY s.seller_id, s.client_id
      ),
      ativos AS (
        SELECT seller_id, client_id, COUNT(*)::int AS cnt, SUM(total) AS rev
        FROM pe GROUP BY seller_id, client_id
      ),
      marcado AS (
        SELECT a.*, (h.first_date >= ${inicio}) AS novo
        FROM ativos a
        LEFT JOIN hist h ON h.seller_id = a.seller_id AND h.client_id = a.client_id
      ),
      resumo AS (
        SELECT seller_id AS id,
               COUNT(*)::int                                        AS active_clients,
               COUNT(*) FILTER (WHERE novo)::int                    AS new_clients,
               COALESCE(SUM(rev) FILTER (WHERE novo), 0)            AS rev_new,
               COALESCE(SUM(cnt) FILTER (WHERE novo), 0)::int       AS cnt_new,
               COALESCE(SUM(rev) FILTER (WHERE NOT novo), 0)        AS rev_old,
               COALESCE(SUM(cnt) FILTER (WHERE NOT novo), 0)::int   AS cnt_old
        FROM marcado GROUP BY seller_id
      ),
      churn AS (
        SELECT pr.seller_id AS id, COUNT(*)::int AS churned
        FROM pre pr
        WHERE NOT EXISTS (
          SELECT 1 FROM ativos a
          WHERE a.seller_id = pr.seller_id AND a.client_id = pr.client_id
        )
        GROUP BY pr.seller_id
      )
      SELECT COALESCE(r.id, c.id) AS id,
             COALESCE(r.active_clients, 0) AS active_clients,
             COALESCE(r.new_clients, 0)    AS new_clients,
             COALESCE(c.churned, 0)        AS churned,
             COALESCE(r.rev_new, 0)        AS rev_new,
             COALESCE(r.cnt_new, 0)        AS cnt_new,
             COALESCE(r.rev_old, 0)        AS rev_old,
             COALESCE(r.cnt_old, 0)        AS cnt_old
      FROM resumo r FULL OUTER JOIN churn c ON c.id = r.id`;
    return consultaAnalitica<
      {
        id: string; active_clients: number; new_clients: number; churned: number;
        rev_new: unknown; cnt_new: number; rev_old: unknown; cnt_old: number;
      }
    >(db, sql, p.values);
  };

  /**
   * Consistência. O coeficiente de variação é sobre TODOS os dias operacionais,
   * contando como zero os dias em que o vendedor não vendeu. Materializar essa
   * grade de dias por vendedor seria caro — mas a soma dos quadrados dos desvios
   * se reduz a uma identidade que só precisa da soma dos quadrados diários:
   *
   *   Σ(v_d − média)²  =  Σv_d²  −  receita² / n
   *
   * (os dias zerados contribuem apenas com média², já embutido no termo final).
   */
  const consistencia = async () => {
    const p = new Params();
    const sql = `${comPedidos(f, p, escopo)},
      op_days AS (SELECT DISTINCT date FROM pe),
      n AS (SELECT COUNT(*)::int AS n FROM op_days),
      last5 AS (SELECT date FROM op_days ORDER BY date DESC LIMIT 5),
      por_dia AS (
        SELECT seller_id, date, SUM(total) AS v FROM pe GROUP BY seller_id, date
      ),
      por_pedido AS (
        SELECT seller_id, total,
               ROW_NUMBER() OVER (PARTITION BY seller_id ORDER BY total DESC) AS rn
        FROM pe
      ),
      por_cliente AS (
        SELECT seller_id, SUM(total) AS v FROM pe GROUP BY seller_id, client_id
      ),
      dia AS (
        SELECT seller_id,
               SUM(v) AS revenue,
               COUNT(*)::int AS active_days,
               SUM(v * v) AS soma_quadrados,
               COALESCE(SUM(v) FILTER (WHERE date IN (SELECT date FROM last5)), 0) AS last5_revenue
        FROM por_dia GROUP BY seller_id
      ),
      pedido AS (
        SELECT seller_id,
               MAX(total) FILTER (WHERE rn = 1) AS top1,
               SUM(total) FILTER (WHERE rn <= 3) AS top3
        FROM por_pedido GROUP BY seller_id
      ),
      cliente AS (SELECT seller_id, MAX(v) AS top_client FROM por_cliente GROUP BY seller_id)
      SELECT d.seller_id AS id, d.revenue, d.active_days, d.soma_quadrados, d.last5_revenue,
             pd.top1, pd.top3, cl.top_client, (SELECT n FROM n) AS operating_days
      FROM dia d
      JOIN pedido pd ON pd.seller_id = d.seller_id
      JOIN cliente cl ON cl.seller_id = d.seller_id
      WHERE d.revenue > 0`;
    return consultaAnalitica<
      {
        id: string; revenue: unknown; active_days: number; soma_quadrados: unknown;
        last5_revenue: unknown; top1: unknown; top3: unknown; top_client: unknown;
        operating_days: number;
      }
    >(db, sql, p.values);
  };

  const temAlgumDado = async (): Promise<boolean> => {
    const [row] = await db.$queryRawUnsafe<{ existe: boolean }[]>(
      "SELECT EXISTS (SELECT 1 FROM sale_items WHERE order_type = 'VENDA') AS existe"
    );
    return row?.existe ?? false;
  };

  const [sellers, periodo, devol, prosp, consist, hasData] = await Promise.all([
    todosVendedores(),
    agregadoPeriodo(),
    devolucoes(),
    prospeccao(),
    consistencia(),
    temAlgumDado(),
  ]);

  // ─── Desempenho ────────────────────────────────────────────────────────────
  const porId = new Map(periodo.map((r) => [r.id, r]));
  const retPorId = new Map(devol.map((r) => [r.id, Number(r.total)]));
  const maxRevenue = periodo.reduce((m, r) => Math.max(m, Number(r.revenue)), 0);

  const metrics: VendedorMetrica[] = sellers
    .map((s) => {
      const a = porId.get(s.id);
      const revenue = Number(a?.revenue ?? 0);
      const cost = Number(a?.cost ?? 0);
      const discount = Number(a?.discount ?? 0);
      const orders = a?.orders ?? 0;
      return {
        id: s.id,
        name: s.name,
        orders,
        revenue,
        averageTicket: orders > 0 ? revenue / orders : 0,
        marginPct: revenue > 0 ? (revenue - cost) / revenue : 0,
        discount,
        discountPct: revenue + discount > 0 ? discount / (revenue + discount) : 0,
        // Meta relativa ao melhor vendedor do período, como no código antigo.
        achievement: maxRevenue > 0 ? revenue / maxRevenue : 0,
        returns: retPorId.get(s.id) ?? 0,
      };
    })
    .sort((a, b) => b.revenue - a.revenue);

  // ─── Prospecção ────────────────────────────────────────────────────────────
  const nomePorId = new Map(sellers.map((s) => [s.id, s.name]));
  const prospection: VendedorProspeccao[] = prosp
    .map((r) => {
      const cntNew = r.cnt_new;
      const cntOld = r.cnt_old;
      const revNew = Number(r.rev_new);
      const revOld = Number(r.rev_old);
      return {
        id: r.id,
        name: nomePorId.get(r.id) ?? r.id,
        activeClients: r.active_clients,
        newClients: r.new_clients,
        churnedClients: r.churned,
        revenueNew: revNew,
        revenueOld: revOld,
        ticketNew: cntNew > 0 ? revNew / cntNew : 0,
        ticketOld: cntOld > 0 ? revOld / cntOld : 0,
      };
    })
    .filter((r) => r.activeClients > 0 || r.churnedClients > 0)
    .sort((a, b) => b.newClients - a.newClients || b.activeClients - a.activeClients);

  // ─── Consistência ──────────────────────────────────────────────────────────
  const consistency: VendedorConsistencia[] = consist
    .map((r) => {
      const revenue = Number(r.revenue);
      const n = r.operating_days;
      const mean = n > 0 ? revenue / n : 0;
      // Ver a identidade documentada em `consistencia()`.
      const varSum = Number(r.soma_quadrados) - (n > 0 ? (revenue * revenue) / n : 0);
      const stddev = Math.sqrt(Math.max(0, varSum) / (n || 1));
      return {
        id: r.id,
        name: nomePorId.get(r.id) ?? r.id,
        revenue,
        activeDays: r.active_days,
        operatingDays: n,
        dayCoverage: n > 0 ? r.active_days / n : 0,
        top1Pct: revenue > 0 ? Number(r.top1) / revenue : 0,
        top3Pct: revenue > 0 ? Number(r.top3) / revenue : 0,
        topClientPct: revenue > 0 ? Number(r.top_client) / revenue : 0,
        last5Pct: revenue > 0 ? Number(r.last5_revenue) / revenue : 0,
        cv: mean > 0 ? stddev / mean : 0,
      };
    })
    .sort((a, b) => b.revenue - a.revenue);

  const teamRevenue = metrics.reduce((s, m) => s + m.revenue, 0);
  const totalReturns = devol.reduce((s, r) => s + Number(r.total), 0);

  return {
    metrics,
    prospection,
    consistency,
    teamRevenue,
    totalReturns,
    avgAchievement:
      metrics.length > 0 ? metrics.reduce((s, m) => s + m.achievement, 0) / metrics.length : 0,
    totalSellers: sellers.length,
    hasData,
  };
}
