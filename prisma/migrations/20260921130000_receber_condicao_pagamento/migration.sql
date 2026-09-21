-- AlterTable
ALTER TABLE "receivable_items" ADD COLUMN     "payment_term_id" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "payment_term_name" TEXT NOT NULL DEFAULT '';

-- Sem índice de propósito: por enquanto a condição só é gravada. Quando uma tela
-- passar a agrupar por ela, o custo do índice se decide com a consulta na mão.
--
-- Os títulos já gravados ficam com a condição vazia até o período ser reenviado
-- pelo agente (ou reimportado por arquivo).
