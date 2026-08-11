-- CreateTable
CREATE TABLE "import_jobs" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT '',
    "filename" TEXT NOT NULL DEFAULT '',
    "bytes" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'recebido',
    "lidas" INTEGER NOT NULL DEFAULT 0,
    "gravadas" INTEGER NOT NULL DEFAULT 0,
    "ignoradas" INTEGER NOT NULL DEFAULT 0,
    "erro" TEXT NOT NULL DEFAULT '',
    "avisos" TEXT NOT NULL DEFAULT '[]',
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMP(3) NOT NULL,
    "concluido_em" TIMESTAMP(3),

    CONSTRAINT "import_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "idx_import_jobs_criado" ON "import_jobs"("criado_em");
