-- ============================================================================
-- VIEW: bi_compras
--
-- Movimento de compras agregado por item. Uma linha por item de compra.
--
-- Campos essenciais:
--   - pedido_data: data da fatura da compra
--   - pedido_documento: ID da compra
--   - pedido_tipo: tipo de compra (COMPRA, DEVOLUCAO COMPRA, etc)
--   - fornecedor_id / fornecedor_nome: quem forneceu
--   - produto_id / produto_descricao: o que foi comprado
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
    c.empresa_id
FROM compra_items c
WHERE c.pedido_tipo IN ('COMPRA', 'DEVOLUCAO COMPRA', 'TRANSFERENCIA COMPRA', 'EXPORTACAO COMPRA')
  AND c.pedido_data <> '';
