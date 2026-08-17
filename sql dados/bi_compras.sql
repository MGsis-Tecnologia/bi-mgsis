-- ============================================================================
-- VIEW: bi_compras  →  do lado do ANALYTICS, sobre `compra_items` já importada
--
-- **Existem duas views com este nome, e elas são diferentes.** A do ERP, que o
-- agente lê para montar o envio, está em `instalar-views.sql` e sai das tabelas
-- do ERP (compra, item_compra, produto…). Esta aqui é do lado de cá e serve às
-- consultas de análise. Instalar uma no lugar da outra não dá erro na hora —
-- só relatório vazio.
--
-- Esta é criada sozinha no boot (`src/lib/server/init-views.ts`); o arquivo
-- existe para leitura e para rodar à mão. **Mudou uma, mude a outra.**
--
-- Movimento de compras agregado por item. Uma linha por item de compra.
--
-- Campos essenciais:
--   - pedido_data: data da fatura da compra
--   - pedido_emissao: emissão do documento no fornecedor ("" quando não veio)
--   - pedido_documento: ID da compra
--   - pedido_tipo: tipo de compra (COMPRA, DEVOLUCAO COMPRA, etc)
--   - fornecedor_id / fornecedor_nome: quem forneceu
--   - produto_id / produto_descricao: o que foi comprado
--   - subgrupo_id / subgrupo_descricao: categoria do produto comprado
--   - produto_quantidade / produto_valor_total: quanto e por quanto
--   - moeda_id / moeda_sigla: em qual moeda
--   - empresa_id: qual empresa comprou
--
-- Uso: importação BI de movimentos de compra para análise de custos.
--
-- ============================================================================

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
    c.empresa_id,
    c.pedido_emissao,
    c.subgrupo_id,
    c.subgrupo_descricao
FROM compra_items c
WHERE c.pedido_tipo IN ('COMPRA', 'DEVOLUCAO COMPRA', 'TRANSFERENCIA COMPRA', 'EXPORTACAO COMPRA')
  AND c.pedido_data <> '';
