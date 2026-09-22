-- ============================================================================
-- VIEW: bi_empresa  →  dataset "empresa" da API de ingestão
-- 1 linha = 1 empresa (matriz ou filial) cadastrada no ERP. É uma FOTO, não uma
-- série: vai inteira numa requisição só, com periodo = "tudo".
--
-- Só existe para dar NOME ao `empresa_id` que já aparece em toda venda, compra,
-- título e movimento de caixa. Sem esta view, o filtro de empresa do Analytics
-- mostra só o código cru ("Empresa 1", "Empresa 2"), porque nenhuma das outras
-- views carrega o nome fantasia — só o id.
-- ============================================================================
CREATE OR REPLACE VIEW bi_empresa AS
SELECT
    COALESCE(empresa.empresa_id::text, '') AS empresa_id,
    COALESCE(empresa.empresa_fantasia, '') AS empresa_fantasia
FROM empresa;
