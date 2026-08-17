import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  try {
    console.log("Criando view bi_compras...");
    await prisma.$executeRawUnsafe(`
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
    console.log("✅ View bi_compras criada com sucesso!");
  } catch (error) {
    console.error("❌ Erro:", error);
  } finally {
    await prisma.$disconnect();
  }
}

main();
