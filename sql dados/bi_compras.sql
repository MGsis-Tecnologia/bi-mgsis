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
    p.compra_data_fatura                          AS pedido_data,
    COALESCE(p.compra_id::text, '')               AS pedido_documento,
    COALESCE(p.compra_tipo::text, '')             AS pedido_tipo,
    COALESCE(p.fornecedor_id::text, '')           AS fornecedor_id,
    COALESCE(c.pessoa_nome, '')                   AS fornecedor_nome,
    COALESCE(i.produto_id::text, '')              AS produto_id,
    COALESCE(pr.produto_descricao, '')            AS produto_descricao,
    COALESCE(i.item_compra_quantidade, 0)         AS produto_quantidade,
    COALESCE(i.item_compra_total, 0)              AS produto_valor_total,
    COALESCE(p.moeda_id::text, '')                AS moeda_id,
    COALESCE(moeda.moeda_sigla, '')               AS moeda_sigla,
    COALESCE(p.empresa_id::text, '')              AS empresa_id

FROM item_compra i
    JOIN      compra     p          ON p.compra_id = i.compra_id
    LEFT JOIN pessoa     c          ON c.pessoa_id = p.fornecedor_id
    LEFT JOIN produto    pr         ON pr.produto_id = i.produto_id
    LEFT JOIN moeda                 ON moeda.moeda_id = p.moeda_id
WHERE p.compra_tipo::text IN ('COMPRA', 'DEVOLUCAO COMPRA', 'TRANSFERENCIA COMPRA', 'EXPORTACAO COMPRA')
  AND p.compra_data_fatura IS NOT NULL;
