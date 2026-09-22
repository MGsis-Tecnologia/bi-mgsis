-- CreateTable
CREATE TABLE "empresa_items" (
    "empresa_id" TEXT NOT NULL DEFAULT '',
    "empresa_fantasia" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "empresa_items_pkey" PRIMARY KEY ("empresa_id")
);

-- Sem índice além da chave primária: são poucas linhas (uma por matriz/filial),
-- a tabela inteira é reescrita a cada envio, e a única consulta que a lê hoje
-- (o filtro de empresa das telas) já faz LEFT JOIN pela própria chave primária.
