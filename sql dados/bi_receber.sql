-- ============================================================================
-- VIEW: bi_receber  →  dataset "receber" da API de ingestão
--
-- Corrigida em 11/08/2026. Ver as três regras no topo de bi_movimento.sql.
--
-- O período é pela DATA DE EMISSÃO, não pelo vencimento: a tela filtra por
-- vencimento, mas quem define a que mês o título PERTENCE é a emissão — é o que
-- torna o reenvio de um período idempotente. Por isso só `data_emissao` fica
-- crua — vencimento e recebimento já saem em ISO, porque são só carga.
--
-- `is_paid` é novo: a API precisa do booleano e a view não o tinha.
--
-- Notas sobre o comando abaixo:
--   Quitado = tem data de recebimento. O valor recebido sozinho não serve:
--   um recebimento parcial também é > 0 e o título segue em aberto.
--   Mantido como estava: com recebimento parcial, o valor que vale é o
--   recebido. Mudar isto mexeria em números que o usuário já conhece.
--
--   Data OPCIONAL fora de 1990–2035 sai como vazia, não como está no ERP.
--   A API recusa a linha inteira com 422 nesse caso, e um vencimento em 2220
--   (digitação de 2022) não carrega informação nenhuma — melhor perder o
--   campo que perder o título. Use datas-impossiveis.sql para listar quais
--   linhas caem nisso e corrigir no ERP.
-- ============================================================================
CREATE OR REPLACE VIEW bi_receber AS
SELECT
    COALESCE(r.receber_documento::text, '')     AS receber_documento,
    r.receber_data_emissao                      AS data_emissao,
    CASE WHEN r.receber_data_vencimento >= DATE '1990-01-01' AND r.receber_data_vencimento < DATE '2036-01-01'
             THEN TO_CHAR(r.receber_data_vencimento, 'YYYY-MM-DD') ELSE '' END
                                                AS data_vencimento,
    CASE WHEN r.receber_data_recebimento >= DATE '1990-01-01' AND r.receber_data_recebimento < DATE '2036-01-01'
             THEN TO_CHAR(r.receber_data_recebimento, 'YYYY-MM-DD') ELSE '' END
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

