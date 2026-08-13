-- CreateTable
CREATE TABLE "cambio" (
    "data" TEXT NOT NULL DEFAULT '',
    "moeda_origem" TEXT NOT NULL DEFAULT '',
    "moeda_destino" TEXT NOT NULL DEFAULT '',
    "taxa" DOUBLE PRECISION NOT NULL DEFAULT 0,

    CONSTRAINT "cambio_pkey" PRIMARY KEY ("data","moeda_origem","moeda_destino")
);

-- CreateTable
CREATE TABLE "cambio_diario" (
    "data" TEXT NOT NULL DEFAULT '',
    "moeda_origem" TEXT NOT NULL DEFAULT '',
    "moeda_destino" TEXT NOT NULL DEFAULT '',
    "taxa" DOUBLE PRECISION NOT NULL DEFAULT 0,

    CONSTRAINT "cambio_diario_pkey" PRIMARY KEY ("data","moeda_origem","moeda_destino")
);

-- CreateIndex
CREATE INDEX "idx_cambio_data" ON "cambio"("data");

-- CreateIndex
CREATE INDEX "idx_cambio_diario_lookup" ON "cambio_diario"("data", "moeda_origem");
