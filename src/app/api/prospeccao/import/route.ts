import { NextRequest, NextResponse } from "next/server";
import { getPrisma } from "@/lib/server/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface OrcamentoRow {
  orcamento_id: string;
  orcamento_data: string;
  orcamento_confirmado: boolean;
  orcamento_data_confirmacao?: string;
  cliente_id: string;
  cliente_nome: string;
  vendedor_id: string;
  vendedor_nome: string;
  empresa_id: string;
  moeda_id: string;
  moeda_sigla: string;
  item_orcamento_id: string;
  produto_id: string;
  produto_descricao: string;
  item_quantidade: number;
  item_quantidade_confirmada: number;
  item_total: number;
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const body = await req.json() as { rows: OrcamentoRow[] };
    const rows = body.rows || [];

    if (!rows.length) {
      return NextResponse.json({ error: "Nenhuma linha para importar" }, { status: 400 });
    }

    const db = await getPrisma();
    let insertedCount = 0;

    // Agrupar por orcamento_id para não duplicar
    const orcamentosMap = new Map<string, OrcamentoRow>();
    const itensMap = new Map<string, OrcamentoRow[]>();

    for (const row of rows) {
      if (!orcamentosMap.has(row.orcamento_id)) {
        orcamentosMap.set(row.orcamento_id, row);
      }
      if (!itensMap.has(row.orcamento_id)) {
        itensMap.set(row.orcamento_id, []);
      }
      itensMap.get(row.orcamento_id)!.push(row);
    }

    // Inserir orçamentos
    for (const [orcId, row] of orcamentosMap) {
      await db.$executeRawUnsafe(`
        INSERT INTO orcamento (orcamento_id, orcamento_tipo, orcamento_data, orcamento_confirmado,
          orcamento_data_confirmacao, cliente_id, vendedor_id, empresa_id, moeda_id)
        VALUES ($1, 'ORCAMENTO', $2, $3, $4, $5, $6, $7, $8)
        ON CONFLICT (orcamento_id) DO UPDATE SET
          orcamento_confirmado = EXCLUDED.orcamento_confirmado,
          orcamento_data_confirmacao = EXCLUDED.orcamento_data_confirmacao
      `, orcId, row.orcamento_data, row.orcamento_confirmado, row.orcamento_data_confirmacao || null,
         row.cliente_id, row.vendedor_id, row.empresa_id, row.moeda_id);
      insertedCount++;
    }

    // Inserir itens de orçamento
    for (const [orcId, items] of itensMap) {
      for (const item of items) {
        await db.$executeRawUnsafe(`
          INSERT INTO item_orcamento (orcamento_id, produto_id, item_quantidade,
            item_quantidade_confirmada, item_total)
          VALUES ($1, $2, $3, $4, $5)
          ON CONFLICT (item_orcamento_id) DO UPDATE SET
            item_quantidade_confirmada = EXCLUDED.item_quantidade_confirmada
        `, orcId, item.produto_id, item.item_quantidade, item.item_quantidade_confirmada, item.item_total);
      }
    }

    return NextResponse.json({
      ok: true,
      orcamentosInserted: insertedCount,
      itensInserted: rows.length,
    });
  } catch (err) {
    console.error("Erro ao importar orçamentos:", err);
    return NextResponse.json(
      { error: `Erro ao importar: ${(err as Error).message}` },
      { status: 500 }
    );
  }
}
