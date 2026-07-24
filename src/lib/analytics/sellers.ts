import type { ImportedOrder, ImportedSeller } from "@/lib/types/dataset";

export interface SellerMetric {
  seller: ImportedSeller;
  revenue: number;
  orders: number;
  averageTicket: number;
  marginPct: number;
  discount: number;      // desconto concedido total (display)
  discountPct: number;   // discount / (revenue + discount) — % sobre a venda bruta
  achievement: number; // 0..1 — proportional to top seller (best = 1.0)
}

export function sellerMetrics(orders: ImportedOrder[], sellers: ImportedSeller[]): SellerMetric[] {
  const map = new Map<string, { rev: number; cnt: number; profit: number; disc: number }>();
  for (const o of orders) {
    const cur = map.get(o.sellerId) ?? { rev: 0, cnt: 0, profit: 0, disc: 0 };
    cur.rev += o.totalBRL;
    cur.profit += o.profitBRL;
    cur.disc += o.discountBRL;
    cur.cnt += 1;
    map.set(o.sellerId, cur);
  }

  const results = sellers.map((s) => {
    const stat = map.get(s.id) ?? { rev: 0, cnt: 0, profit: 0, disc: 0 };
    return {
      seller: s,
      revenue: stat.rev,
      orders: stat.cnt,
      averageTicket: stat.cnt > 0 ? stat.rev / stat.cnt : 0,
      marginPct: stat.rev > 0 ? stat.profit / stat.rev : 0,
      discount: stat.disc,
      discountPct: stat.rev + stat.disc > 0 ? stat.disc / (stat.rev + stat.disc) : 0,
      achievement: 0, // filled below
    };
  }).sort((a, b) => b.revenue - a.revenue);

  const maxRevenue = results[0]?.revenue ?? 1;
  for (const r of results) {
    r.achievement = maxRevenue > 0 ? r.revenue / maxRevenue : 0;
  }
  return results;
}

// ─── Prospecção & carteira ────────────────────────────────────────────────────
// Período analisado = intervalo filtrado; a base de comparação é TODO o
// histórico disponível:
//   novo   → 1ª compra do cliente COM AQUELE VENDEDOR ocorreu dentro do período
//   churn  → cliente comprava com o vendedor ANTES do período e não comprou nele
//   ticket → valor médio por pedido, separado entre clientes novos e antigos
export interface SellerProspection {
  seller: ImportedSeller;
  activeClients: number;    // clientes que compraram no período
  newClients: number;
  churnedClients: number;
  ticketNew: number;
  ticketOld: number;
  revenueNew: number;
  revenueOld: number;
}

export function sellerProspection(
  periodOrders: ImportedOrder[],
  allOrders: ImportedOrder[],
  rangeFrom: Date,
  sellers: ImportedSeller[]
): SellerProspection[] {
  const fromTs = rangeFrom.getTime();
  const ts = (d: string) => new Date(d + "T00:00:00").getTime();

  // Histórico completo: 1ª compra por (vendedor, cliente) + quem já comprava antes
  const firstBuy = new Map<string, number>();
  const preClients = new Map<string, Set<string>>();
  for (const o of allOrders) {
    const t = ts(o.date);
    const k = `${o.sellerId}|${o.clientId}`;
    const prev = firstBuy.get(k);
    if (prev === undefined || t < prev) firstBuy.set(k, t);
    if (t < fromTs) {
      let s = preClients.get(o.sellerId);
      if (!s) { s = new Set(); preClients.set(o.sellerId, s); }
      s.add(o.clientId);
    }
  }

  // Período filtrado
  interface Acc {
    active: Set<string>; newC: Set<string>;
    revNew: number; cntNew: number; revOld: number; cntOld: number;
  }
  const acc = new Map<string, Acc>();
  for (const o of periodOrders) {
    let a = acc.get(o.sellerId);
    if (!a) {
      a = { active: new Set(), newC: new Set(), revNew: 0, cntNew: 0, revOld: 0, cntOld: 0 };
      acc.set(o.sellerId, a);
    }
    a.active.add(o.clientId);
    const first = firstBuy.get(`${o.sellerId}|${o.clientId}`) ?? Infinity;
    if (first >= fromTs) {
      a.newC.add(o.clientId);
      a.revNew += o.totalBRL;
      a.cntNew++;
    } else {
      a.revOld += o.totalBRL;
      a.cntOld++;
    }
  }

  return sellers
    .map((s) => {
      const a = acc.get(s.id);
      const pre = preClients.get(s.id) ?? new Set<string>();
      const active = a?.active ?? new Set<string>();
      let churned = 0;
      for (const c of pre) if (!active.has(c)) churned++;
      return {
        seller: s,
        activeClients: active.size,
        newClients: a?.newC.size ?? 0,
        churnedClients: churned,
        revenueNew: a?.revNew ?? 0,
        revenueOld: a?.revOld ?? 0,
        ticketNew: a && a.cntNew > 0 ? a.revNew / a.cntNew : 0,
        ticketOld: a && a.cntOld > 0 ? a.revOld / a.cntOld : 0,
      };
    })
    .filter((r) => r.activeClients > 0 || r.churnedClients > 0)
    .sort((a, b) => b.newClients - a.newClients || b.activeClients - a.activeClients);
}

// ─── Consistência & concentração ──────────────────────────────────────────────
// O total vendido esconde COMO foi construído. Duas receitas iguais podem ter
// perfis de risco opostos: diluída no mês (resiliente) vs. concentrada em poucos
// pedidos/dias (frágil, e sintoma de "empurrar" pedido no fechamento).
//
// Base de calendário = DIAS OPERACIONAIS: dias em que a EMPRESA faturou (qualquer
// vendedor) dentro do período. Isso descarta fim de semana/feriado sozinho, sem
// precisar de tabela de calendário.
export interface SellerConsistency {
  seller: ImportedSeller;
  revenue: number;
  activeDays: number;      // dias distintos com pedido do vendedor
  operatingDays: number;   // dias em que a empresa faturou no período
  dayCoverage: number;     // activeDays / operatingDays
  top1Pct: number;         // maior pedido / receita
  top3Pct: number;         // 3 maiores pedidos / receita
  topClientPct: number;    // maior cliente / receita
  last5Pct: number;        // receita nos últimos 5 dias operacionais / receita
  cv: number;              // desvio padrão ÷ média do faturamento diário (zeros incluídos)
}

export function sellerConsistency(
  periodOrders: ImportedOrder[],
  sellers: ImportedSeller[]
): SellerConsistency[] {
  // Dias operacionais da empresa no período (ordenados)
  const opDays = [...new Set(periodOrders.map((o) => o.date))].sort();
  const n = opDays.length;
  const last5 = new Set(opDays.slice(-5));

  interface Acc {
    revenue: number;
    orderValues: number[];
    daily: Map<string, number>;
    byClient: Map<string, number>;
    last5Revenue: number;
  }
  const acc = new Map<string, Acc>();
  for (const o of periodOrders) {
    let a = acc.get(o.sellerId);
    if (!a) {
      a = { revenue: 0, orderValues: [], daily: new Map(), byClient: new Map(), last5Revenue: 0 };
      acc.set(o.sellerId, a);
    }
    a.revenue += o.totalBRL;
    a.orderValues.push(o.totalBRL);
    a.daily.set(o.date, (a.daily.get(o.date) ?? 0) + o.totalBRL);
    a.byClient.set(o.clientId, (a.byClient.get(o.clientId) ?? 0) + o.totalBRL);
    if (last5.has(o.date)) a.last5Revenue += o.totalBRL;
  }

  return sellers
    .map((s) => {
      const a = acc.get(s.id);
      if (!a || a.revenue <= 0 || n === 0) {
        return {
          seller: s, revenue: a?.revenue ?? 0, activeDays: a?.daily.size ?? 0,
          operatingDays: n, dayCoverage: 0, top1Pct: 0, top3Pct: 0,
          topClientPct: 0, last5Pct: 0, cv: 0,
        };
      }
      const sortedOrders = [...a.orderValues].sort((x, y) => y - x);
      const top1 = sortedOrders[0] ?? 0;
      const top3 = sortedOrders.slice(0, 3).reduce((sum, v) => sum + v, 0);
      const topClient = Math.max(...a.byClient.values());

      // Coeficiente de variação sobre TODOS os dias operacionais (dias sem venda
      // entram como 0 — é o que revela os "vales").
      const mean = a.revenue / n;
      let varSum = 0;
      for (const day of opDays) {
        const v = a.daily.get(day) ?? 0;
        varSum += (v - mean) ** 2;
      }
      const stddev = Math.sqrt(varSum / n);

      return {
        seller: s,
        revenue: a.revenue,
        activeDays: a.daily.size,
        operatingDays: n,
        dayCoverage: a.daily.size / n,
        top1Pct: top1 / a.revenue,
        top3Pct: top3 / a.revenue,
        topClientPct: topClient / a.revenue,
        last5Pct: a.last5Revenue / a.revenue,
        cv: mean > 0 ? stddev / mean : 0,
      };
    })
    .filter((r) => r.revenue > 0)
    .sort((a, b) => b.revenue - a.revenue);
}
