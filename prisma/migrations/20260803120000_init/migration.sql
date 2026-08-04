-- CreateTable
CREATE TABLE "users" (
    "id" SERIAL NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL DEFAULT '',
    "name" TEXT NOT NULL DEFAULT '',
    "role" TEXT NOT NULL DEFAULT 'admin',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "menu_permissions" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "menu_key" TEXT NOT NULL,

    CONSTRAINT "menu_permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "smtp_config" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "host" TEXT NOT NULL DEFAULT '',
    "port" INTEGER NOT NULL DEFAULT 587,
    "secure" BOOLEAN NOT NULL DEFAULT false,
    "user" TEXT NOT NULL DEFAULT '',
    "password_enc" TEXT NOT NULL DEFAULT '',
    "from_name" TEXT NOT NULL DEFAULT 'MGSIS Analytics',
    "from_email" TEXT NOT NULL DEFAULT '',
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "smtp_config_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dataset_meta" (
    "kind" TEXT NOT NULL,
    "filename" TEXT NOT NULL DEFAULT '',
    "row_count" INTEGER NOT NULL DEFAULT 0,
    "imported_at" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "dataset_meta_pkey" PRIMARY KEY ("kind")
);

-- CreateTable
CREATE TABLE "sale_items" (
    "id" SERIAL NOT NULL,
    "date" TEXT NOT NULL DEFAULT '',
    "order_id" TEXT NOT NULL DEFAULT '',
    "order_type" TEXT NOT NULL DEFAULT 'VENDA',
    "channel" TEXT NOT NULL DEFAULT '',
    "client_id" TEXT NOT NULL DEFAULT '',
    "client_name" TEXT NOT NULL DEFAULT '',
    "client_city" TEXT NOT NULL DEFAULT '',
    "product_id" TEXT NOT NULL DEFAULT '',
    "product_name" TEXT NOT NULL DEFAULT '',
    "quantity" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "total_orig" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "cost_orig" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "discount_orig" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "subgroup_id" TEXT NOT NULL DEFAULT '',
    "subgroup_name" TEXT NOT NULL DEFAULT '',
    "seller_id" TEXT NOT NULL DEFAULT '',
    "seller_name" TEXT NOT NULL DEFAULT '',
    "currency_id" TEXT NOT NULL DEFAULT '1',
    "currency_code" TEXT NOT NULL DEFAULT 'R$',
    "empresa_id" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "sale_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "receivable_items" (
    "id" SERIAL NOT NULL,
    "document_id" TEXT NOT NULL DEFAULT '',
    "client_id" TEXT NOT NULL DEFAULT '',
    "client_name" TEXT NOT NULL DEFAULT '',
    "client_city" TEXT NOT NULL DEFAULT '',
    "issue_date" TEXT NOT NULL DEFAULT '',
    "due_date" TEXT NOT NULL DEFAULT '',
    "received_date" TEXT NOT NULL DEFAULT '',
    "is_paid" BOOLEAN NOT NULL DEFAULT false,
    "entry_type" TEXT NOT NULL DEFAULT '',
    "amount_orig" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "seller_id" TEXT NOT NULL DEFAULT '',
    "seller_name" TEXT NOT NULL DEFAULT '',
    "currency_id" TEXT NOT NULL DEFAULT '1',
    "currency_code" TEXT NOT NULL DEFAULT 'R$',
    "empresa_id" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "receivable_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payable_items" (
    "id" SERIAL NOT NULL,
    "document_id" TEXT NOT NULL DEFAULT '',
    "supplier_id" TEXT NOT NULL DEFAULT '',
    "supplier_name" TEXT NOT NULL DEFAULT '',
    "issue_date" TEXT NOT NULL DEFAULT '',
    "due_date" TEXT NOT NULL DEFAULT '',
    "paid_date" TEXT NOT NULL DEFAULT '',
    "is_paid" BOOLEAN NOT NULL DEFAULT false,
    "entry_type" TEXT NOT NULL DEFAULT '',
    "amount_orig" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "currency_id" TEXT NOT NULL DEFAULT '1',
    "currency_code" TEXT NOT NULL DEFAULT 'R$',
    "empresa_id" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "payable_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_items" (
    "id" SERIAL NOT NULL,
    "product_id" TEXT NOT NULL DEFAULT '',
    "description" TEXT NOT NULL DEFAULT '',
    "manufacturer_code" TEXT NOT NULL DEFAULT '',
    "stock" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "cost_total_usd" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "min_stock" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "currency_id" TEXT NOT NULL DEFAULT '1',
    "currency_code" TEXT NOT NULL DEFAULT 'R$',
    "empresa_id" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "inventory_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "caixa_items" (
    "id" SERIAL NOT NULL,
    "date" TEXT NOT NULL DEFAULT '',
    "centro_custo_id" TEXT NOT NULL DEFAULT '',
    "centro_custo_descricao" TEXT NOT NULL DEFAULT '',
    "plano_conta_id" TEXT NOT NULL DEFAULT '',
    "plano_conta_codigo" TEXT NOT NULL DEFAULT '',
    "plano_conta_descricao" TEXT NOT NULL DEFAULT '',
    "caixa_id" TEXT NOT NULL DEFAULT '',
    "caixa_descricao" TEXT NOT NULL DEFAULT '',
    "valor_documento" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "moeda_id" TEXT NOT NULL DEFAULT '1',
    "moeda_sigla" TEXT NOT NULL DEFAULT 'R$',
    "empresa_id" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "caixa_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "orcamento_items" (
    "id" SERIAL NOT NULL,
    "orcamento_id" TEXT NOT NULL DEFAULT '',
    "orcamento_data" TEXT NOT NULL DEFAULT '',
    "orcamento_confirmado" BOOLEAN NOT NULL DEFAULT false,
    "orcamento_data_confirmacao" TEXT NOT NULL DEFAULT '',
    "cliente_id" TEXT NOT NULL DEFAULT '',
    "cliente_nome" TEXT NOT NULL DEFAULT '',
    "vendedor_id" TEXT NOT NULL DEFAULT '',
    "vendedor_nome" TEXT NOT NULL DEFAULT '',
    "empresa_id" TEXT NOT NULL DEFAULT '',
    "moeda_id" TEXT NOT NULL DEFAULT '1',
    "moeda_sigla" TEXT NOT NULL DEFAULT 'R$',
    "item_orcamento_id" TEXT NOT NULL DEFAULT '',
    "produto_id" TEXT NOT NULL DEFAULT '',
    "produto_descricao" TEXT NOT NULL DEFAULT '',
    "produto_fabricante" TEXT NOT NULL DEFAULT '',
    "item_quantidade" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "item_quantidade_confirmada" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "item_total" DOUBLE PRECISION NOT NULL DEFAULT 0,

    CONSTRAINT "orcamento_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "idx_menu_permissions_user" ON "menu_permissions"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "menu_permissions_user_id_menu_key_key" ON "menu_permissions"("user_id", "menu_key");

-- CreateIndex
CREATE INDEX "idx_sale_items_date" ON "sale_items"("date");

-- CreateIndex
CREATE INDEX "idx_sale_items_client_id" ON "sale_items"("client_id");

-- CreateIndex
CREATE INDEX "idx_sale_items_product_id" ON "sale_items"("product_id");

-- CreateIndex
CREATE INDEX "idx_sale_items_seller_id" ON "sale_items"("seller_id");

-- CreateIndex
CREATE INDEX "idx_sale_items_empresa_id" ON "sale_items"("empresa_id");

-- CreateIndex
CREATE INDEX "idx_receivable_due_date" ON "receivable_items"("due_date");

-- CreateIndex
CREATE INDEX "idx_receivable_client_id" ON "receivable_items"("client_id");

-- CreateIndex
CREATE INDEX "idx_receivable_is_paid" ON "receivable_items"("is_paid");

-- CreateIndex
CREATE INDEX "idx_receivable_empresa" ON "receivable_items"("empresa_id");

-- CreateIndex
CREATE INDEX "idx_payable_due_date" ON "payable_items"("due_date");

-- CreateIndex
CREATE INDEX "idx_payable_supplier" ON "payable_items"("supplier_id");

-- CreateIndex
CREATE INDEX "idx_payable_is_paid" ON "payable_items"("is_paid");

-- CreateIndex
CREATE INDEX "idx_payable_empresa" ON "payable_items"("empresa_id");

-- CreateIndex
CREATE INDEX "idx_inventory_product_id" ON "inventory_items"("product_id");

-- CreateIndex
CREATE INDEX "idx_inventory_empresa" ON "inventory_items"("empresa_id");

-- CreateIndex
CREATE INDEX "idx_caixa_date" ON "caixa_items"("date");

-- CreateIndex
CREATE INDEX "idx_caixa_plano" ON "caixa_items"("plano_conta_codigo");

-- CreateIndex
CREATE INDEX "idx_caixa_empresa" ON "caixa_items"("empresa_id");

-- CreateIndex
CREATE INDEX "idx_orcamento_data" ON "orcamento_items"("orcamento_data");

-- CreateIndex
CREATE INDEX "idx_orcamento_empresa" ON "orcamento_items"("empresa_id");

-- CreateIndex
CREATE INDEX "idx_orcamento_vendedor" ON "orcamento_items"("vendedor_id");

-- AddForeignKey
ALTER TABLE "menu_permissions" ADD CONSTRAINT "menu_permissions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
