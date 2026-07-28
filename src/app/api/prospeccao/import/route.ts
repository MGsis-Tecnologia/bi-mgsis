import { NextRequest, NextResponse } from "next/server";
import { getPrisma } from "@/lib/server/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Uma linha por item de orçamento (igual ao leiaute de importação).
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

const CHUNK = 2000;

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    // `replace` (só no 1º lote) limpa a tabela antes de inserir; os demais lotes
    // apenas anexam. O cliente envia em chunks para não estourar o JSON.stringify.
    const body = (await req.json()) as { rows?: OrcamentoRow[]; replace?: boolean };
    const rows = Array.isArray(body.rows) ? body.rows : [];

    if (!rows.length) {
      return NextResponse.json({ error: "Nenhuma linha para importar" }, { status: 400 });
    }

    const db = await getPrisma();
    if (body.replace) {
      await db.orcamentoItem.deleteMany();
    }

    const data = rows.map((r) => ({
      orcamentoId: String(r.orcamento_id ?? ""),
      orcamentoData: String(r.orcamento_data ?? ""),
      orcamentoConfirmado: Boolean(r.orcamento_confirmado),
      orcamentoDataConfirmacao: String(r.orcamento_data_confirmacao ?? ""),
      clienteId: String(r.cliente_id ?? ""),
      clienteNome: String(r.cliente_nome ?? ""),
      vendedorId: String(r.vendedor_id ?? ""),
      vendedorNome: String(r.vendedor_nome ?? ""),
      empresaId: String(r.empresa_id ?? ""),
      moedaId: String(r.moeda_id ?? "1"),
      moedaSigla: String(r.moeda_sigla ?? "R$"),
      itemOrcamentoId: String(r.item_orcamento_id ?? ""),
      produtoId: String(r.produto_id ?? ""),
      produtoDescricao: String(r.produto_descricao ?? ""),
      itemQuantidade: Number(r.item_quantidade) || 0,
      itemQuantidadeConfirmada: Number(r.item_quantidade_confirmada) || 0,
      itemTotal: Number(r.item_total) || 0,
    }));

    let inserted = 0;
    for (let i = 0; i < data.length; i += CHUNK) {
      const res = await db.orcamentoItem.createMany({ data: data.slice(i, i + CHUNK) });
      inserted += res.count;
    }

    return NextResponse.json({ ok: true, inserted });
  } catch (err) {
    console.error("Erro ao importar orçamentos:", err);
    return NextResponse.json(
      { error: `Erro ao importar: ${(err as Error).message}` },
      { status: 500 }
    );
  }
}
