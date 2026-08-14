-- CreateTable
CREATE TABLE "compra_items" (
    "id" SERIAL NOT NULL,
    "pedido_data" TEXT NOT NULL DEFAULT '',
    "pedido_documento" TEXT NOT NULL DEFAULT '',
    "pedido_tipo" TEXT NOT NULL DEFAULT 'COMPRA',
    "fornecedor_id" TEXT NOT NULL DEFAULT '',
    "fornecedor_nome" TEXT NOT NULL DEFAULT '',
    "produto_id" TEXT NOT NULL DEFAULT '',
    "produto_descricao" TEXT NOT NULL DEFAULT '',
    "produto_quantidade" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "produto_valor_total" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "moeda_id" TEXT NOT NULL DEFAULT '1',
    "moeda_sigla" TEXT NOT NULL DEFAULT 'R$',
    "empresa_id" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "compra_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "idx_compra_data" ON "compra_items"("pedido_data");

-- CreateIndex
CREATE INDEX "idx_compra_fornecedor" ON "compra_items"("fornecedor_id");

-- CreateIndex
CREATE INDEX "idx_compra_produto" ON "compra_items"("produto_id");

-- CreateIndex
CREATE INDEX "idx_compra_empresa" ON "compra_items"("empresa_id");
