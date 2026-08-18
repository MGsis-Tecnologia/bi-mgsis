-- CreateTable
CREATE TABLE "cambio_mensal" (
    "competencia" TEXT NOT NULL DEFAULT '',
    "moeda_origem" TEXT NOT NULL DEFAULT '',
    "moeda_destino" TEXT NOT NULL DEFAULT '',
    "taxa" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "derivada" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "cambio_mensal_pkey" PRIMARY KEY ("competencia","moeda_origem","moeda_destino")
);

-- CreateIndex
CREATE INDEX "idx_cambio_mensal_lookup" ON "cambio_mensal"("competencia", "moeda_origem");

-- As tabelas `cambio` e `cambio_diario` continuam de pé nesta migration.
-- Derrubá-las agora deixaria a conversão sem fonte nenhuma no intervalo entre
-- aplicar isto e a primeira carga do câmbio mensal — e elas são pequenas.
-- Saem quando a nova fonte estiver provada em produção.
