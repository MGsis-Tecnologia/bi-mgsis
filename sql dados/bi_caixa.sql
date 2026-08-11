-- ============================================================================
-- VIEW: bi_caixa  →  dataset "caixa" da API de ingestão
--
-- Corrigida em 11/08/2026. Ver as três regras no topo de bi_movimento.sql.
-- Era a única view cujo mapeamento já estava completo; o que mudou foi o
-- COALESCE nos campos vindos de LEFT JOIN e o descarte de linha sem data.
--
-- O JOIN com `pessoa` saiu: nenhuma coluna dele era usada, e ele custava uma
-- busca por linha à toa.
-- ============================================================================
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

