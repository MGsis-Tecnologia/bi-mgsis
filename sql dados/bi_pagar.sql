-- ============================================================================
-- VIEW: bi_pagar  →  dataset "pagar" da API de ingestão
--
-- Corrigida em 11/08/2026. Ver as três regras no topo de bi_movimento.sql.
-- Espelha bi_receber: mesmo critério de período (emissão) e mesmo `is_paid`.
--
-- Notas sobre o comando abaixo:
--   Quitado = tem data de pagamento — pagamento parcial também é > 0.
--
--   Data OPCIONAL fora de 1990–2035 sai como vazia, não como está no ERP.
--   A API recusa a linha inteira com 422 nesse caso, e um vencimento em 2220
--   (digitação de 2022) não carrega informação nenhuma — melhor perder o
--   campo que perder o título. Use datas-impossiveis.sql para listar quais
--   linhas caem nisso e corrigir no ERP.
-- ============================================================================
CREATE OR REPLACE VIEW bi_pagar AS
SELECT
    COALESCE(r.pagar_documento::text, '')      AS pagar_documento,
    r.pagar_data_emissao                       AS data_emissao,
    CASE WHEN r.pagar_data_vencimento >= DATE '1990-01-01' AND r.pagar_data_vencimento < DATE '2036-01-01'
             THEN TO_CHAR(r.pagar_data_vencimento, 'YYYY-MM-DD') ELSE '' END
                                               AS data_vencimento,
    CASE WHEN r.pagar_data_pagamento >= DATE '1990-01-01' AND r.pagar_data_pagamento < DATE '2036-01-01'
             THEN TO_CHAR(r.pagar_data_pagamento, 'YYYY-MM-DD') ELSE '' END
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

