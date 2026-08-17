import { NextResponse } from "next/server";
import { getSession } from "@/lib/server/auth";
import { getTenantContext } from "@/lib/server/tenant";

export async function POST() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  const { db } = await getTenantContext(session);

  try {
    await db.$executeRawUnsafe(`
      CREATE OR REPLACE VIEW bi_compras AS
      SELECT
          c.pedido_data,
          c.pedido_documento,
          c.pedido_tipo,
          c.fornecedor_id,
          c.fornecedor_nome,
          c.produto_id,
          c.produto_descricao,
          c.produto_quantidade,
          c.produto_valor_total,
          c.moeda_id,
          c.moeda_sigla,
          c.empresa_id
      FROM compra_items c
      WHERE c.pedido_tipo IN ('COMPRA', 'DEVOLUCAO COMPRA', 'TRANSFERENCIA COMPRA', 'EXPORTACAO COMPRA')
        AND c.pedido_data <> '';
    `);

    return NextResponse.json({
      ok: true,
      message: "✅ View bi_compras criada com sucesso!",
    });
  } catch (error) {
    console.error("Erro ao criar view:", error);
    return NextResponse.json(
      { error: `Erro ao criar view: ${error instanceof Error ? error.message : "desconhecido"}` },
      { status: 500 }
    );
  }
}
