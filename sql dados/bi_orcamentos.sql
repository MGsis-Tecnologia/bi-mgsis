-- ============================================================================
-- VIEW: bi_orcamentos  →  dataset "orcamentos" da API de ingestão
-- 1 linha = 1 item de orçamento (os dados do orçamento repetem em cada item)
--
-- Corrigida em 11/08/2026. Ver as três regras no topo de bi_movimento.sql.
--
-- Duas correções específicas desta view:
--
--  1. `orcamento_confirmado` volta a ser BOOLEANO. A versão anterior devolvia
--     o texto 'Confirmado'/'Pendente', e a API usa coerção booleana — em que
--     QUALQUER texto não vazio vira `true`. 'Pendente' entraria como
--     confirmado e a taxa de conversão iria a 100% sem erro nenhum.
--     O rótulo em texto foi removido justamente para ninguém mapear por engano.
--  2. Saiu o ORDER BY. Numa view ele é peso morto: o agente sempre filtra por
--     período, e ordenar o resultado inteiro antes de descartar a ordem custa
--     uma sort de milhões de linhas por consulta.
-- ============================================================================
CREATE OR REPLACE VIEW bi_orcamentos AS
SELECT
    -- Dados do orçamento (repetidos em cada item)
    COALESCE(o.orcamento_id::text, '')              AS orcamento_id,
    o.orcamento_data                                AS orcamento_data,
    COALESCE(o.orcamento_confirmado, false)         AS orcamento_confirmado,
    -- Data só de carga, nunca usada para filtrar: já sai em ISO ou vazia.
    COALESCE(TO_CHAR(o.orcamento_data_confirmacao, 'YYYY-MM-DD'), '')
                                                    AS orcamento_data_confirmacao,
    COALESCE(o.cliente_id::text, '')                AS cliente_id,
    COALESCE(c.pessoa_nome, '')                     AS cliente_nome,
    COALESCE(o.vendedor_id::text, '')               AS vendedor_id,
    COALESCE(v.pessoa_nome, '')                     AS vendedor_nome,
    COALESCE(o.empresa_id::text, '')                AS empresa_id,
    COALESCE(o.moeda_id::text, '')                  AS moeda_id,
    COALESCE(m.moeda_sigla, '')                     AS moeda_sigla,

    -- Dados do item
    COALESCE(io.item_orcamento_id::text, '')        AS item_orcamento_id,
    COALESCE(io.produto_id::text, '')               AS produto_id,
    COALESCE(pr.produto_descricao, '')              AS produto_descricao,
    COALESCE(pr.produto_fabricante, '')             AS produto_fabricante,
    COALESCE(sg.subgrupo_id::text, '')              AS subgrupo_id,
    COALESCE(sg.subgrupo_descricao, '')             AS subgrupo_descricao,
    COALESCE(io.item_quantidade, 0)                 AS item_quantidade,
    COALESCE(io.item_quantidade_confirmada, 0)      AS item_quantidade_confirmada,
    COALESCE(io.item_total, 0)                      AS item_total

FROM orcamento o
    -- INNER: orçamento sem item não tem o que analisar, e viraria uma linha
    -- fantasma com produto vazio e quantidade zero.
    JOIN      item_orcamento io ON io.orcamento_id = o.orcamento_id
    LEFT JOIN pessoa   c        ON c.pessoa_id = o.cliente_id
    LEFT JOIN pessoa   v        ON v.pessoa_id = o.vendedor_id
    LEFT JOIN moeda    m        ON m.moeda_id = o.moeda_id
    LEFT JOIN produto  pr       ON pr.produto_id = io.produto_id
    LEFT JOIN subgrupo sg       ON sg.subgrupo_id = pr.subgrupo_id

WHERE o.orcamento_tipo = 'ORCAMENTO'
  AND o.orcamento_data IS NOT NULL;
