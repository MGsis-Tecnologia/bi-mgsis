-- ============================================================================
-- VIEW: bi_movimento  →  dataset "vendas" da API de ingestão
-- 1 linha = 1 item de pedido (venda ou devolução)
--
-- Corrigida em 11/08/2026 para alimentar a API em vez do CSV. Ver INGESTAO-API.md.
--
-- Três regras que valem para TODAS as views bi_*:
--
--  1. NADA DE NULL. A API valida com schema estrito e devolve 422 em campo
--     nulo — `null` não é o mesmo que "ausente". Como toda view aqui usa
--     LEFT JOIN, cada coluna que vem de join levou COALESCE.
--  2. A DATA DO PERÍODO FICA CRUA. É por ela que o agente filtra
--     (`WHERE pedido_data >= $1 AND pedido_data < $2`), e comparar timestamp
--     com data usa índice. Se viesse TO_CHAR ou ::date, cada mês viraria
--     varredura completa — na consulta que roda a cada 2 horas.
--     O agente formata para YYYY-MM-DD no SELECT dele.
--  3. SEM JANELA DE DATAS FIXA. Quem recorta o período é o agente. A versão
--     anterior tinha `>= '2022-01-01' AND <= '2026-12-31'` embutido: o piso já
--     escondia as vendas anteriores a 2022, e o teto faria a view parar de
--     devolver venda nova em 31/12/2026, em silêncio.
-- ============================================================================
CREATE OR REPLACE VIEW bi_movimento AS
SELECT
    p.pedido_data_fatura                          AS pedido_data,
    COALESCE(p.pedido_id::text, '')               AS pedido_documento,
    COALESCE(p.pedido_tipo::text, '')             AS pedido_tipo,
    COALESCE(tipo_preco.tipo_preco_descricao, '') AS pedido_canal,
    COALESCE(p.cliente_id::text, '')              AS cliente_id,
    COALESCE(c.pessoa_nome, '')                   AS cliente_nome,
    COALESCE((
        SELECT cidade.cidade_nome
          FROM endereco
          LEFT JOIN cidade ON cidade.cidade_id = endereco.cidade_id
         WHERE endereco.endereco_padrao = true
           AND endereco.pessoa_id = p.cliente_id
         LIMIT 1
    ), '')                                        AS pedido_cidade,
    COALESCE(i.produto_id::text, '')              AS produto_id,
    COALESCE(pr.produto_descricao, '')            AS produto_descricao,
    COALESCE(i.item_quantidade, 0)                AS produto_quantidade,
    COALESCE(i.item_total, 0)                     AS produto_valor_total,
    COALESCE(i.item_custos, 0)                    AS produto_valor_custo,
    COALESCE(i.item_desconto, 0)                  AS item_desconto,
    COALESCE(subgrupo.subgrupo_id::text, '')      AS subgrupo_id,
    COALESCE(subgrupo.subgrupo_descricao, '')     AS subgrupo_descricao,
    COALESCE(p.vendedor_id::text, '')             AS vendedor_id,
    COALESCE(v.pessoa_nome, '')                   AS vendedor_nome,
    COALESCE(p.moeda_id::text, '')                AS moeda_id,
    COALESCE(moeda.moeda_sigla, '')               AS moeda_sigla,
    COALESCE(p.empresa_id::text, '')              AS empresa_id
FROM item_pedido i
    JOIN      pedido     p          ON p.pedido_id = i.pedido_id
    LEFT JOIN pessoa     c          ON c.pessoa_id = p.cliente_id
    LEFT JOIN pessoa     v          ON v.pessoa_id = p.vendedor_id
    LEFT JOIN produto    pr         ON pr.produto_id = i.produto_id
    LEFT JOIN tipo_preco            ON tipo_preco.tipo_preco_id = p.tipo_preco_id
    LEFT JOIN moeda                 ON moeda.moeda_id = p.moeda_id
    LEFT JOIN subgrupo              ON subgrupo.subgrupo_id = pr.subgrupo_id
WHERE p.pedido_tipo::text IN ('VENDA', 'DEVOLUCAO VENDA')
  -- A API exige data; item sem faturamento não tem a que mês pertencer.
  AND p.pedido_data_fatura IS NOT NULL;

