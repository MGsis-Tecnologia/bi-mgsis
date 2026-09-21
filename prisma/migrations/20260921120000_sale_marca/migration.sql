-- AlterTable
ALTER TABLE "sale_items" ADD COLUMN     "brand_id" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "brand_name" TEXT NOT NULL DEFAULT '';

-- Sem índice de propósito: a marca só entra em GROUP BY sobre o período inteiro
-- (Comparativo e Curva ABC), onde o Postgres varre a tabela de qualquer jeito.
--
-- As linhas já gravadas ficam com marca vazia até o período ser reenviado pelo
-- agente (ou reimportado por arquivo). As telas mostram "Sem marca" nesse caso.
