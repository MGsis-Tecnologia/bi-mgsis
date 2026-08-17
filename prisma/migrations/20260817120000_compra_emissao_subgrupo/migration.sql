-- AlterTable
ALTER TABLE "compra_items" ADD COLUMN     "pedido_emissao" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "subgrupo_id" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "subgrupo_descricao" TEXT NOT NULL DEFAULT '';

-- CreateIndex
CREATE INDEX "idx_compra_subgrupo" ON "compra_items"("subgrupo_id");

-- A view `bi_compras` do lado do Analytics NÃO é mexida aqui de propósito: ela
-- é recriada no boot (src/lib/server/init-views.ts), e `CREATE OR REPLACE`
-- acrescenta coluna no fim sem reclamar — conferido. Derrubá-la aqui deixaria
-- a análise de compras sem view nenhuma se o boot seguinte falhasse.
