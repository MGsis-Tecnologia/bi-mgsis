import type { PrismaClient } from "@prisma/client";

/**
 * Views do lado do ANALYTICS, criadas no boot de cada tenant.
 *
 * Não confundir com a `bi_compras` do ERP (em `sql dados/instalar-views.sql`),
 * que tem o mesmo nome e sai das tabelas do ERP — é ela que o agente lê. Esta
 * aqui fica sobre a `compra_items` já importada.
 *
 * Coluna nova entra no FIM da lista: `CREATE OR REPLACE VIEW` acrescenta no
 * fim, mas recusa mudar nome ou ordem das que já existem — e aqui a view
 * sempre é recriada sobre uma que já está no banco.
 *
 * O arquivo `sql dados/bi_compras.sql` é a cópia legível deste comando.
 * **Mudou um, mude o outro.**
 */
export async function initializeViews(db: PrismaClient): Promise<void> {
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
          c.empresa_id,
          c.pedido_emissao,
          c.subgrupo_id,
          c.subgrupo_descricao
      FROM compra_items c
      WHERE c.pedido_tipo IN ('COMPRA', 'DEVOLUCAO COMPRA', 'TRANSFERENCIA COMPRA', 'EXPORTACAO COMPRA')
        AND c.pedido_data <> '';
    `);
    console.log("✅ View bi_compras inicializada");
  } catch (error) {
    console.error("⚠️  Erro ao inicializar bi_compras:", error);
  }
}
