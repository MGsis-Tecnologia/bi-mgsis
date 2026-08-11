-- ============================================================================
-- Instala as seis views bi_* de uma vez.
--
-- Use este arquivo se o seu cliente SQL (DBeaver, pgAdmin) reclamar ao rodar
-- os arquivos separados: ele contém SÓ os comandos, sem comentário nenhum
-- dentro deles, que é o que costuma confundir o parser desses programas.
--
-- Pelo terminal, que é o caminho mais seguro:
--   psql -U postgres -d erp_do_cliente -f instalar-views.sql
--
-- A explicação de cada view está no arquivo individual correspondente.
-- ============================================================================

-- ── bi_movimento ──
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
  AND p.pedido_data_fatura IS NOT NULL;

-- ── bi_orcamentos ──
CREATE OR REPLACE VIEW bi_orcamentos AS
SELECT
    COALESCE(o.orcamento_id::text, '')              AS orcamento_id,
    o.orcamento_data                                AS orcamento_data,
    COALESCE(o.orcamento_confirmado, false)         AS orcamento_confirmado,
    COALESCE(TO_CHAR(o.orcamento_data_confirmacao, 'YYYY-MM-DD'), '')
                                                    AS orcamento_data_confirmacao,
    COALESCE(o.cliente_id::text, '')                AS cliente_id,
    COALESCE(c.pessoa_nome, '')                     AS cliente_nome,
    COALESCE(o.vendedor_id::text, '')               AS vendedor_id,
    COALESCE(v.pessoa_nome, '')                     AS vendedor_nome,
    COALESCE(o.empresa_id::text, '')                AS empresa_id,
    COALESCE(o.moeda_id::text, '')                  AS moeda_id,
    COALESCE(m.moeda_sigla, '')                     AS moeda_sigla,
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
    JOIN      item_orcamento io ON io.orcamento_id = o.orcamento_id
    LEFT JOIN pessoa   c        ON c.pessoa_id = o.cliente_id
    LEFT JOIN pessoa   v        ON v.pessoa_id = o.vendedor_id
    LEFT JOIN moeda    m        ON m.moeda_id = o.moeda_id
    LEFT JOIN produto  pr       ON pr.produto_id = io.produto_id
    LEFT JOIN subgrupo sg       ON sg.subgrupo_id = pr.subgrupo_id
WHERE o.orcamento_tipo = 'ORCAMENTO'
  AND o.orcamento_data IS NOT NULL;

-- ── bi_receber ──
CREATE OR REPLACE VIEW bi_receber AS
SELECT
    COALESCE(r.receber_documento::text, '')     AS receber_documento,
    r.receber_data_emissao                      AS data_emissao,
    COALESCE(TO_CHAR(r.receber_data_vencimento, 'YYYY-MM-DD'), '')
                                                AS data_vencimento,
    COALESCE(TO_CHAR(r.receber_data_recebimento, 'YYYY-MM-DD'), '')
                                                AS data_recebimento,
    (r.receber_data_recebimento IS NOT NULL)     AS is_paid,
    'RECEBER'::text                              AS tipolanzamiento,
    COALESCE(
        CASE WHEN r.receber_valor_recebido > 0::numeric
             THEN r.receber_valor_recebido
             ELSE r.receber_valor_documento
        END, 0)                                  AS valor_documento,
    COALESCE(r.pessoa_cliente_id::text, '')      AS pessoa_cliente_id,
    COALESCE(c.pessoa_nome, '')                  AS pessoa_nome,
    COALESCE((
        SELECT cidade.cidade_nome
          FROM endereco
          LEFT JOIN cidade ON cidade.cidade_id = endereco.cidade_id
         WHERE endereco.endereco_padrao = true
           AND endereco.pessoa_id = r.pessoa_cliente_id
         LIMIT 1
    ), '')                                       AS pessoa_cidade,
    COALESCE(r.pessoa_vendedor_id::text, '')     AS vendedor_id,
    COALESCE(v.pessoa_nome, '')                  AS vendedor_nome,
    COALESCE(r.moeda_id::text, '')               AS moeda_id,
    COALESCE(moeda.moeda_sigla, '')              AS moeda_sigla,
    COALESCE(r.empresa_id::text, '')             AS empresa_id
FROM receber r
    LEFT JOIN pessoa c    ON c.pessoa_id = r.pessoa_cliente_id
    LEFT JOIN pessoa v    ON v.pessoa_id = r.pessoa_vendedor_id
    LEFT JOIN moeda       ON moeda.moeda_id = r.moeda_id
WHERE r.receber_data_emissao IS NOT NULL;

-- ── bi_pagar ──
CREATE OR REPLACE VIEW bi_pagar AS
SELECT
    COALESCE(r.pagar_documento::text, '')      AS pagar_documento,
    r.pagar_data_emissao                       AS data_emissao,
    COALESCE(TO_CHAR(r.pagar_data_vencimento, 'YYYY-MM-DD'), '')
                                               AS data_vencimento,
    COALESCE(TO_CHAR(r.pagar_data_pagamento, 'YYYY-MM-DD'), '')
                                               AS data_pagamento,
    (r.pagar_data_pagamento IS NOT NULL)        AS is_paid,
    'PAGAR'::text                               AS tipolanzamiento,
    COALESCE(
        CASE WHEN r.pagar_valor_pago > 0::numeric
             THEN r.pagar_valor_pago
             ELSE r.pagar_valor_documento
        END, 0)                                 AS valor_documento,
    COALESCE(r.pessoa_fornecedor_id::text, '')  AS pessoa_fornecedor_id,
    COALESCE(c.pessoa_nome, '')                 AS pessoa_nome,
    COALESCE(r.moeda_id::text, '')              AS moeda_id,
    COALESCE(moeda.moeda_sigla, '')             AS moeda_sigla,
    COALESCE(r.empresa_id::text, '')            AS empresa_id
FROM pagar r
    LEFT JOIN pessoa c ON c.pessoa_id = r.pessoa_fornecedor_id
    LEFT JOIN moeda    ON moeda.moeda_id = r.moeda_id
WHERE (COALESCE(r.pagar_valor_pago, 0) + COALESCE(r.pagar_valor_documento, 0)) > 0
  AND r.pagar_data_emissao IS NOT NULL;

-- ── bi_caixa ──
CREATE OR REPLACE VIEW bi_caixa AS
SELECT
    cm.caixa_data_emissao                              AS caixa_data_emissao,
    COALESCE(cm.centro_custo_id::text, '')             AS centro_custo_id,
    COALESCE(cc.centro_custo_descricao, '')            AS centro_custo_descricao,
    COALESCE(cm.plano_conta_id::text, '')              AS plano_conta_id,
    COALESCE(pc.plano_conta_codigo::text, '')          AS plano_conta_codigo,
    COALESCE(pc.plano_conta_descricao, '')             AS plano_conta_descricao,
    COALESCE(cm.caixa_id::text, '')                    AS caixa_id,
    COALESCE(cx.caixa_descricao, '')                   AS caixa_descricao,
    COALESCE(cm.caixa_valor_documento, 0)              AS caixa_valor_documento,
    COALESCE(m.moeda_id::text, '')                     AS moeda_id,
    COALESCE(m.moeda_sigla, '')                        AS moeda_sigla,
    COALESCE(cm.empresa_id::text, '')                  AS empresa_id
FROM caixa_movimento cm
    LEFT JOIN caixa        cx ON cx.caixa_id = cm.caixa_id
    LEFT JOIN moeda        m  ON m.moeda_id = cx.moeda_id
    LEFT JOIN plano_conta  pc ON pc.plano_conta_id = cm.plano_conta_id
    LEFT JOIN centro_custo cc ON cc.centro_custo_id = cm.centro_custo_id
WHERE cm.caixa_data_emissao IS NOT NULL;

-- ── bi_estoque ──
CREATE OR REPLACE VIEW bi_estoque AS
SELECT
    COALESCE(e.produto_id::text, '')                AS produto_id,
    COALESCE(p.produto_descricao, '')               AS produto_descricao,
    COALESCE(p.produto_fabricante, '')              AS produto_fabricante,
    COALESCE(e.empresa_id::text, '')                AS empresa_id,
    COALESCE(p.moeda_id::text, '')                  AS moeda_id,
    COALESCE(m.moeda_sigla, '')                     AS moeda_sigla,
    COALESCE(SUM(e.estoque_quantidade), 0)          AS estoque_item,
    COALESCE(SUM(e.estoque_quantidade * p.produto_custo_unitario), 0)
                                                    AS valor_estoque,
    COALESCE(MIN(p.produto_estoque_minimo), 0)      AS estoque_minimo
FROM estoque e
    JOIN      produto p ON p.produto_id = e.produto_id
    LEFT JOIN moeda   m ON m.moeda_id = p.moeda_id
WHERE p.produto_inativo = false
  AND p.produto_revenda = true
GROUP BY e.produto_id, p.produto_descricao, p.produto_fabricante,
         e.empresa_id, p.moeda_id, m.moeda_sigla;

