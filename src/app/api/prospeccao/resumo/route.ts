import { NextRequest, NextResponse } from "next/server";
import { getPrisma } from "@/lib/server/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* eslint-disable @typescript-eslint/no-explicit-any */

const EMPTY = {
  kpis: {
    total: 0, ganhos: 0, perdidos: 0, abertos: 0, taxaConversao: 0,
    valorTotal: 0, valorGanho: 0, valorEmRisco: 0, ticketMedio: 0,
    itensPorOrcamento: 0, tempoMedioDias: 0,
  },
  status: [] as any[],
  evolucao: [] as any[],
  vendedores: [] as any[],
  produtos: [] as any[],
  clientes: [] as any[],
  pendentes: [] as any[],
};

const n = (v: any) => Number(v ?? 0) || 0;
const f = (v: any) => parseFloat(v ?? "0") || 0;
const taxa = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 1000) / 10 : 0);

export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    const db = await getPrisma();
    const sp = req.nextUrl.searchParams;

    const dataInicio = sp.get("dataInicio") || "2000-01-01";
    const dataFim = sp.get("dataFim") || "2999-12-31";
    const currency = sp.get("currency") || "ALL";
    const empresaId = sp.get("empresaId") || "all";

    // Taxas de câmbio (moeda_id → R$) enviadas pelo cliente; fallback razoável.
    let rates: Record<string, number> = { "1": 1, "2": 5, "3": 0.012 };
    try {
      const r = JSON.parse(sp.get("rates") || "{}");
      if (r && typeof r === "object") rates = { ...rates, ...r };
    } catch { /* usa fallback */ }

    // ── WHERE dinâmico (datas/moeda/empresa parametrizadas) ────────────────────
    const params: any[] = [dataInicio, dataFim];
    let where = `orcamento_data <> '' AND orcamento_data::date BETWEEN $1::date AND $2::date`;
    if (currency !== "ALL") { params.push(currency); where += ` AND moeda_id = $${params.length}`; }
    if (empresaId !== "all") { params.push(empresaId); where += ` AND empresa_id = $${params.length}`; }

    // ── Conversão de moeda ─────────────────────────────────────────────────────
    // Moeda específica: valor fica na própria moeda (sem conversão). "Todas":
    // converte cada item para R$ pela taxa da sua moeda.
    let convItem = "item_total";
    if (currency === "ALL") {
      const cases = Object.entries(rates)
        .filter(([id, r]) => /^\d+$/.test(id) && Number.isFinite(Number(r)))
        .map(([id, r]) => `WHEN '${id}' THEN ${Number(r)}`)
        .join(" ");
      convItem = `(item_total * (CASE moeda_id ${cases} ELSE 1 END))`;
    }

    // Agrega ao nível de ORÇAMENTO (uma linha por orcamento_id).
    const orcCTE = `
      WITH orc AS (
        SELECT orcamento_id,
          BOOL_OR(orcamento_confirmado) AS confirmado,
          MIN(orcamento_data) AS data,
          MAX(NULLIF(orcamento_data_confirmacao, '')) AS data_conf,
          MIN(NULLIF(vendedor_nome, '')) AS vendedor,
          MIN(NULLIF(cliente_nome, '')) AS cliente,
          SUM(${convItem}) AS valor,
          COUNT(*) AS itens
        FROM orcamento_items
        WHERE ${where}
        GROUP BY orcamento_id
      )`;

    const q = (sql: string) => db.$queryRawUnsafe(sql, ...params) as Promise<any[]>;

    const [kpiRows, statusRows, evoRows, vendRows, prodRows, cliRows, pendRows] = await Promise.all([
      // KPIs
      q(`${orcCTE}
        SELECT
          COUNT(*) AS total,
          COUNT(*) FILTER (WHERE confirmado) AS ganhos,
          COUNT(*) FILTER (WHERE NOT confirmado AND data::date <  (NOW() - INTERVAL '30 days')) AS perdidos,
          COUNT(*) FILTER (WHERE NOT confirmado AND data::date >= (NOW() - INTERVAL '30 days')) AS abertos,
          COALESCE(SUM(valor), 0) AS valor_total,
          COALESCE(SUM(valor) FILTER (WHERE confirmado), 0) AS valor_ganho,
          COALESCE(SUM(itens), 0) AS itens_total,
          AVG((data_conf::date - data::date)) FILTER (WHERE confirmado AND data_conf IS NOT NULL) AS tempo_medio
        FROM orc`),
      // Distribuição de status (ganho / em aberto / perdido) com valor
      q(`${orcCTE}
        SELECT
          COUNT(*) FILTER (WHERE confirmado) AS ganho_n,
          COALESCE(SUM(valor) FILTER (WHERE confirmado), 0) AS ganho_v,
          COUNT(*) FILTER (WHERE NOT confirmado AND data::date >= (NOW() - INTERVAL '30 days')) AS aberto_n,
          COALESCE(SUM(valor) FILTER (WHERE NOT confirmado AND data::date >= (NOW() - INTERVAL '30 days')), 0) AS aberto_v,
          COUNT(*) FILTER (WHERE NOT confirmado AND data::date <  (NOW() - INTERVAL '30 days')) AS perdido_n,
          COALESCE(SUM(valor) FILTER (WHERE NOT confirmado AND data::date <  (NOW() - INTERVAL '30 days')), 0) AS perdido_v
        FROM orc`),
      // Evolução mensal (rótulo YYYY-MM, formatado no cliente conforme idioma)
      q(`${orcCTE}
        SELECT TO_CHAR(DATE_TRUNC('month', data::date), 'YYYY-MM') AS mes,
          COUNT(*) AS criados,
          COUNT(*) FILTER (WHERE confirmado) AS confirmados,
          COALESCE(SUM(valor), 0) AS valor
        FROM orc
        GROUP BY DATE_TRUNC('month', data::date)
        ORDER BY DATE_TRUNC('month', data::date)`),
      // Vendedores
      q(`${orcCTE}
        SELECT COALESCE(vendedor, '—') AS vendedor,
          COUNT(*) AS total,
          COUNT(*) FILTER (WHERE confirmado) AS confirmados,
          COALESCE(SUM(valor) FILTER (WHERE confirmado), 0) AS valor
        FROM orc
        GROUP BY COALESCE(vendedor, '—')
        ORDER BY confirmados DESC, total DESC
        LIMIT 50`),
      // Produtos (nível de item)
      q(`SELECT COALESCE(NULLIF(produto_descricao, ''), '—') AS produto,
          COUNT(DISTINCT item_orcamento_id) AS proposto,
          COUNT(DISTINCT item_orcamento_id) FILTER (WHERE item_quantidade_confirmada > 0) AS confirmado,
          COALESCE(SUM(${convItem}), 0) AS valor
        FROM orcamento_items
        WHERE ${where}
        GROUP BY COALESCE(NULLIF(produto_descricao, ''), '—')
        ORDER BY proposto DESC
        LIMIT 15`),
      // Top clientes por valor
      q(`${orcCTE}
        SELECT COALESCE(cliente, '—') AS cliente,
          COUNT(*) AS orcamentos,
          COUNT(*) FILTER (WHERE confirmado) AS confirmados,
          COALESCE(SUM(valor), 0) AS valor
        FROM orc
        GROUP BY COALESCE(cliente, '—')
        ORDER BY valor DESC
        LIMIT 15`),
      // Pendentes há mais de 30 dias
      q(`${orcCTE}
        SELECT orcamento_id, COALESCE(cliente, '—') AS cliente_nome, valor,
          (NOW()::date - data::date) AS dias
        FROM orc
        WHERE NOT confirmado AND data::date < (NOW() - INTERVAL '30 days')
        ORDER BY data ASC
        LIMIT 15`),
    ]);

    const k = kpiRows[0] || {};
    const total = n(k.total);
    const ganhos = n(k.ganhos);
    const valorTotal = f(k.valor_total);
    const valorGanho = f(k.valor_ganho);
    const itensTotal = n(k.itens_total);

    const s = statusRows[0] || {};

    return NextResponse.json({
      kpis: {
        total,
        ganhos,
        perdidos: n(k.perdidos),
        abertos: n(k.abertos),
        taxaConversao: taxa(ganhos, total),
        valorTotal,
        valorGanho,
        valorEmRisco: Math.max(0, valorTotal - valorGanho),
        ticketMedio: total > 0 ? valorTotal / total : 0,
        itensPorOrcamento: total > 0 ? itensTotal / total : 0,
        tempoMedioDias: Math.round(f(k.tempo_medio) * 10) / 10,
      },
      status: [
        { key: "ganho", count: n(s.ganho_n), valor: f(s.ganho_v) },
        { key: "aberto", count: n(s.aberto_n), valor: f(s.aberto_v) },
        { key: "perdido", count: n(s.perdido_n), valor: f(s.perdido_v) },
      ],
      evolucao: evoRows.map((r) => ({
        mes: r.mes || "",
        criados: n(r.criados),
        confirmados: n(r.confirmados),
        taxa: taxa(n(r.confirmados), n(r.criados)),
        valor: f(r.valor),
      })),
      vendedores: vendRows.map((r) => ({
        vendedor: r.vendedor || "—",
        total: n(r.total),
        confirmados: n(r.confirmados),
        taxa: taxa(n(r.confirmados), n(r.total)),
        valor: f(r.valor),
      })),
      produtos: prodRows.map((r) => ({
        produto: r.produto || "—",
        vezesProposto: n(r.proposto),
        vezesConfirmado: n(r.confirmado),
        taxa: taxa(n(r.confirmado), n(r.proposto)),
        valor: f(r.valor),
      })),
      clientes: cliRows.map((r) => ({
        cliente: r.cliente || "—",
        orcamentos: n(r.orcamentos),
        confirmados: n(r.confirmados),
        valor: f(r.valor),
      })),
      pendentes: pendRows.map((r) => ({
        orcamento_id: r.orcamento_id || "—",
        cliente_nome: r.cliente_nome || "—",
        valor: f(r.valor),
        dias: n(r.dias),
      })),
    });
  } catch (err) {
    console.error("Erro ao buscar prospeccao:", err);
    return NextResponse.json(EMPTY);
  }
}
