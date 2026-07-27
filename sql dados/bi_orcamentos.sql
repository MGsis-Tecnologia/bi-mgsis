-- ============================================================================
-- VIEW: bi_orcamentos
-- Orçamentos com itens expandidos (1 linha = 1 item)
-- Cada linha repete os dados do orçamento + dados do item
-- Importação: CSV único para orcamento + item_orcamento
-- ============================================================================
CREATE OR REPLACE VIEW bi_orcamentos AS
SELECT
    -- Dados do Orçamento (repetidos em cada linha do item)
    o.orcamento_id,
    TO_CHAR(o.orcamento_data, 'DD/MM/YYYY'::text) AS orcamento_data,
    CASE
        WHEN o.orcamento_confirmado = true THEN 'Confirmado'
        ELSE 'Pendente'
    END AS status_orcamento,
    CASE
        WHEN o.orcamento_confirmado = true THEN TO_CHAR(o.orcamento_data_confirmacao, 'DD/MM/YYYY'::text)
        ELSE ''
    END AS orcamento_data_confirmacao,
    o.cliente_id,
    c.pessoa_nome AS cliente_nome,
    o.vendedor_id,
    v.pessoa_nome AS vendedor_nome,
    o.empresa_id,
    o.moeda_id,
    m.moeda_sigla,

    -- Dados do Item de Orçamento
    io.item_orcamento_id,
    io.produto_id,
    pr.produto_descricao,
    sg.subgrupo_id,
    sg.subgrupo_descricao,
    io.item_quantidade,
    io.item_quantidade_confirmada,
    io.item_total,

    -- Taxa de conversão do item
    CASE
        WHEN io.item_quantidade > 0 THEN ROUND((io.item_quantidade_confirmada::NUMERIC / io.item_quantidade::NUMERIC) * 100, 2)
        ELSE 0
    END AS taxa_conversao_percentual

FROM orcamento o
LEFT JOIN item_orcamento io ON io.orcamento_id = o.orcamento_id
LEFT JOIN pessoa c ON c.pessoa_id = o.cliente_id
LEFT JOIN pessoa v ON v.pessoa_id = o.vendedor_id
LEFT JOIN moeda m ON m.moeda_id = o.moeda_id
LEFT JOIN produto pr ON pr.produto_id = io.produto_id
LEFT JOIN subgrupo sg ON sg.subgrupo_id = pr.subgrupo_id

WHERE o.orcamento_tipo = 'ORCAMENTO'

ORDER BY o.orcamento_data DESC, io.item_orcamento_id;