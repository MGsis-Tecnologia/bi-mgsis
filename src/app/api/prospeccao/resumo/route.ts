import { NextRequest, NextResponse } from "next/server";
import { getPrisma } from "@/lib/server/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    const db = await getPrisma();
    const sp = req.nextUrl.searchParams;

    const dataInicio = sp.get("dataInicio") || "2022-01-01";
    const dataFim = sp.get("dataFim") || "2099-12-31";

    // KPIs: Contagem e valores
    const kpisResult = await db.$queryRawUnsafe(`
      SELECT
        COUNT(DISTINCT o.orcamento_id) as total,
        COUNT(DISTINCT CASE WHEN o.orcamento_confirmado = true THEN o.orcamento_id END) as confirmados,
        COALESCE(SUM(io.item_total), 0) as valor_total,
        COALESCE(SUM(CASE WHEN io.item_quantidade_confirmada > 0 THEN io.item_total ELSE 0 END), 0) as valor_confirmado
      FROM orcamento o
      LEFT JOIN item_orcamento io ON io.orcamento_id = o.orcamento_id
      WHERE o.orcamento_tipo = 'ORCAMENTO'
        AND o.orcamento_data >= '${dataInicio}'::date
        AND o.orcamento_data <= '${dataFim}'::date
    `) as any[];

    const kpiRow = kpisResult[0] || {};
    const total = Number(kpiRow.total || 0);
    const confirmados = Number(kpiRow.confirmados || 0);
    const valorTotal = parseFloat(kpiRow.valor_total || "0");
    const valorConfirmado = parseFloat(kpiRow.valor_confirmado || "0");
    const taxaConversao = total > 0 ? (confirmados / total) * 100 : 0;

    // Evolução mensal
    const evolucaoResult = await db.$queryRawUnsafe(`
      SELECT
        TO_CHAR(o.orcamento_data, 'Mon') as mes,
        COUNT(DISTINCT o.orcamento_id) as criados,
        COUNT(DISTINCT CASE WHEN o.orcamento_confirmado = true THEN o.orcamento_id END) as confirmados,
        ROUND(COUNT(DISTINCT CASE WHEN o.orcamento_confirmado = true THEN o.orcamento_id END)::numeric
          / NULLIF(COUNT(DISTINCT o.orcamento_id)::numeric, 0) * 100, 1) as taxa
      FROM orcamento o
      WHERE o.orcamento_tipo = 'ORCAMENTO'
        AND o.orcamento_data >= '${dataInicio}'::date
        AND o.orcamento_data <= '${dataFim}'::date
      GROUP BY DATE_TRUNC('month', o.orcamento_data)
      ORDER BY DATE_TRUNC('month', o.orcamento_data)
    `) as any[];

    // Vendedores
    const vendedoresResult = await db.$queryRawUnsafe(`
      SELECT
        COALESCE(v.pessoa_nome, 'Sem vendedor') as vendedor,
        COUNT(DISTINCT o.orcamento_id) as total,
        COUNT(DISTINCT CASE WHEN o.orcamento_confirmado = true THEN o.orcamento_id END) as confirmados,
        ROUND(COUNT(DISTINCT CASE WHEN o.orcamento_confirmado = true THEN o.orcamento_id END)::numeric
          / NULLIF(COUNT(DISTINCT o.orcamento_id)::numeric, 0) * 100, 1) as taxa,
        COALESCE(SUM(CASE WHEN o.orcamento_confirmado = true THEN io.item_total ELSE 0 END), 0) as valor
      FROM orcamento o
      LEFT JOIN pessoa v ON v.pessoa_id = o.vendedor_id
      LEFT JOIN item_orcamento io ON io.orcamento_id = o.orcamento_id
      WHERE o.orcamento_tipo = 'ORCAMENTO'
        AND o.orcamento_data >= '${dataInicio}'::date
        AND o.orcamento_data <= '${dataFim}'::date
      GROUP BY v.pessoa_nome
      ORDER BY confirmados DESC
    `) as any[];

    // Produtos
    const produtosResult = await db.$queryRawUnsafe(`
      SELECT
        COALESCE(p.produto_descricao, 'Sem descricao') as produto,
        COUNT(DISTINCT io.item_orcamento_id) as vezesProposto,
        COUNT(DISTINCT CASE WHEN io.item_quantidade_confirmada > 0 THEN io.item_orcamento_id END) as vezesConfirmado,
        ROUND(COUNT(DISTINCT CASE WHEN io.item_quantidade_confirmada > 0 THEN io.item_orcamento_id END)::numeric
          / NULLIF(COUNT(DISTINCT io.item_orcamento_id)::numeric, 0) * 100, 1) as taxa
      FROM item_orcamento io
      LEFT JOIN produto p ON p.produto_id = io.produto_id
      LEFT JOIN orcamento o ON o.orcamento_id = io.orcamento_id
      WHERE o.orcamento_tipo = 'ORCAMENTO'
        AND o.orcamento_data >= '${dataInicio}'::date
        AND o.orcamento_data <= '${dataFim}'::date
      GROUP BY p.produto_descricao
      ORDER BY vezesProposto DESC
      LIMIT 10
    `) as any[];

    // Orçamentos pendentes há mais de 30 dias
    const pendentesResult = await db.$queryRawUnsafe(`
      SELECT
        o.orcamento_id,
        c.pessoa_nome as cliente_nome,
        COALESCE(SUM(io.item_total), 0) as valor,
        EXTRACT(DAY FROM (NOW() - o.orcamento_data))::int as dias
      FROM orcamento o
      LEFT JOIN pessoa c ON c.pessoa_id = o.cliente_id
      LEFT JOIN item_orcamento io ON io.orcamento_id = o.orcamento_id
      WHERE o.orcamento_tipo = 'ORCAMENTO'
        AND o.orcamento_confirmado = false
        AND o.orcamento_data < (NOW() - INTERVAL '30 days')
      GROUP BY o.orcamento_id, c.pessoa_nome
      ORDER BY o.orcamento_data ASC
      LIMIT 10
    `) as any[];

    return NextResponse.json({
      kpis: {
        totalOrcamentos: total,
        orcamentosConfirmados: confirmados,
        taxaConversao: Math.round(taxaConversao * 100) / 100,
        valorTotal,
        valorConfirmado,
        valorEmRisco: Math.max(0, valorTotal - valorConfirmado),
      },
      evolucao: evolucaoResult.map((r: any) => ({
        mes: r.mes || "N/A",
        criados: Number(r.criados || 0),
        confirmados: Number(r.confirmados || 0),
        taxa: parseFloat(r.taxa || "0"),
      })),
      vendedores: vendedoresResult.map((r: any) => ({
        vendedor: r.vendedor || "N/A",
        total: Number(r.total || 0),
        confirmados: Number(r.confirmados || 0),
        taxa: parseFloat(r.taxa || "0"),
        valor: parseFloat(r.valor || "0"),
      })),
      produtos: produtosResult.map((r: any) => ({
        produto: r.produto || "N/A",
        vezesProposto: Number(r.vezesProposto || 0),
        vezesConfirmado: Number(r.vezesConfirmado || 0),
        taxa: parseFloat(r.taxa || "0"),
      })),
      pendentes: pendentesResult.map((r: any) => ({
        orcamento_id: r.orcamento_id || "N/A",
        cliente_nome: r.cliente_nome || "N/A",
        valor: parseFloat(r.valor || "0"),
        dias: Number(r.dias || 0),
      })),
    });
  } catch (err) {
    console.error("Erro ao buscar prospeccao:", err);
    return NextResponse.json({
      kpis: {
        totalOrcamentos: 0,
        orcamentosConfirmados: 0,
        taxaConversao: 0,
        valorTotal: 0,
        valorConfirmado: 0,
        valorEmRisco: 0,
      },
      evolucao: [],
      vendedores: [],
      produtos: [],
      pendentes: [],
    });
  }
}
