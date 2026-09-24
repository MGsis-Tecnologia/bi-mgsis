-- ============================================================================
-- DIAGNÓSTICO COMPLETO - Por que registros não passam no ingest?
-- ============================================================================
-- Rodar este script NOS CLIENTES para identificar registros problemáticos
-- antes de enviar ao mgsis-ingest

-- 1. VERIFICAR REGISTROS COM PROBLEMAS NO PAGAR
SELECT
  'PROBLEMA_PAGAR' as tipo,
  COUNT(*) as qtd,
  STRING_AGG(DISTINCT
    CASE
      WHEN pagar_data_emissao IS NULL THEN 'data_emissao=NULL'
      WHEN pagar_data_emissao < DATE '1990-01-01' THEN 'data_emissao < 1990'
      WHEN pagar_data_emissao > DATE '2035-12-31' THEN 'data_emissao > 2035'
      WHEN pagar_valor_documento <= 0 AND COALESCE(pagar_valor_pago, 0) <= 0 THEN 'valor_zero'
      WHEN pessoa_fornecedor_id IS NULL THEN 'fornecedor=NULL'
      WHEN moeda_id IS NULL THEN 'moeda=NULL'
      ELSE 'outro'
    END, ', '
  ) as motivos
FROM pagar
WHERE pagar_data_emissao IS NULL
   OR pagar_data_emissao < DATE '1990-01-01'
   OR pagar_data_emissao > DATE '2035-12-31'
   OR (COALESCE(pagar_valor_documento, 0) + COALESCE(pagar_valor_pago, 0)) <= 0
   OR pessoa_fornecedor_id IS NULL
   OR moeda_id IS NULL;

-- 2. REGISTROS COM VALORES ZERADOS OU NEGATIVOS
SELECT 'Valor Zero/Negativo' as problema, COUNT(*) as qtd
FROM pagar
WHERE (COALESCE(pagar_valor_pago, 0) + COALESCE(pagar_valor_documento, 0)) <= 0
  AND pagar_data_emissao IS NOT NULL;

-- 3. REGISTROS SEM FORNECEDOR VINCULADO
SELECT 'Fornecedor Não Existe' as problema, COUNT(*) as qtd
FROM pagar p
WHERE pessoa_fornecedor_id IS NULL
  AND pagar_data_emissao IS NOT NULL;

-- 4. REGISTROS SEM MOEDA VINCULADA
SELECT 'Moeda Não Existe' as problema, COUNT(*) as qtd
FROM pagar p
WHERE moeda_id IS NULL
  AND pagar_data_emissao IS NOT NULL;

-- 5. REGISTROS SEM EMPRESA
SELECT 'Empresa Não Existe' as problema, COUNT(*) as qtd
FROM pagar p
WHERE empresa_id IS NULL
  AND pagar_data_emissao IS NOT NULL;

-- 6. LISTAR EXEMPLOS DE REGISTROS PROBLEMÁTICOS - PAGAR
SELECT
  pagar_documento,
  pagar_data_emissao,
  pagar_valor_documento,
  COALESCE(pagar_valor_pago, 0) as valor_pago,
  pessoa_fornecedor_id,
  moeda_id,
  empresa_id,
  CASE
    WHEN pagar_data_emissao IS NULL THEN 'data_emissao=NULL'
    WHEN pagar_data_emissao < DATE '1990-01-01' THEN 'data_emissao < 1990'
    WHEN (COALESCE(pagar_valor_documento, 0) + COALESCE(pagar_valor_pago, 0)) <= 0 THEN 'valor_zero'
    WHEN pessoa_fornecedor_id IS NULL THEN 'fornecedor=NULL'
    WHEN moeda_id IS NULL THEN 'moeda=NULL'
    WHEN empresa_id IS NULL THEN 'empresa=NULL'
    ELSE 'outro'
  END as motivo_falha
FROM pagar
WHERE pagar_data_emissao IS NULL
   OR pagar_data_emissao < DATE '1990-01-01'
   OR pagar_data_emissao > DATE '2035-12-31'
   OR (COALESCE(pagar_valor_documento, 0) + COALESCE(pagar_valor_pago, 0)) <= 0
   OR pessoa_fornecedor_id IS NULL
   OR moeda_id IS NULL
   OR empresa_id IS NULL
LIMIT 100;

-- 7. MESMA ANÁLISE PARA RECEBER
SELECT
  'PROBLEMA_RECEBER' as tipo,
  COUNT(*) as qtd,
  STRING_AGG(DISTINCT
    CASE
      WHEN receber_data_emissao IS NULL THEN 'data_emissao=NULL'
      WHEN receber_data_emissao < DATE '1990-01-01' THEN 'data_emissao < 1990'
      WHEN receber_data_emissao > DATE '2035-12-31' THEN 'data_emissao > 2035'
      WHEN receber_valor_documento <= 0 AND COALESCE(receber_valor_recebido, 0) <= 0 THEN 'valor_zero'
      WHEN pessoa_cliente_id IS NULL THEN 'cliente=NULL'
      WHEN moeda_id IS NULL THEN 'moeda=NULL'
      ELSE 'outro'
    END, ', '
  ) as motivos
FROM receber
WHERE receber_data_emissao IS NULL
   OR receber_data_emissao < DATE '1990-01-01'
   OR receber_data_emissao > DATE '2035-12-31'
   OR (COALESCE(receber_valor_documento, 0) + COALESCE(receber_valor_recebido, 0)) <= 0
   OR pessoa_cliente_id IS NULL
   OR moeda_id IS NULL;

-- 8. LISTAR EXEMPLOS DE REGISTROS PROBLEMÁTICOS - RECEBER
SELECT
  receber_documento,
  receber_data_emissao,
  receber_valor_documento,
  COALESCE(receber_valor_recebido, 0) as valor_recebido,
  pessoa_cliente_id,
  moeda_id,
  empresa_id,
  CASE
    WHEN receber_data_emissao IS NULL THEN 'data_emissao=NULL'
    WHEN receber_data_emissao < DATE '1990-01-01' THEN 'data_emissao < 1990'
    WHEN (COALESCE(receber_valor_documento, 0) + COALESCE(receber_valor_recebido, 0)) <= 0 THEN 'valor_zero'
    WHEN pessoa_cliente_id IS NULL THEN 'cliente=NULL'
    WHEN moeda_id IS NULL THEN 'moeda=NULL'
    WHEN empresa_id IS NULL THEN 'empresa=NULL'
    ELSE 'outro'
  END as motivo_falha
FROM receber
WHERE receber_data_emissao IS NULL
   OR receber_data_emissao < DATE '1990-01-01'
   OR receber_data_emissao > DATE '2035-12-31'
   OR (COALESCE(receber_valor_documento, 0) + COALESCE(receber_valor_recebido, 0)) <= 0
   OR pessoa_cliente_id IS NULL
   OR moeda_id IS NULL
   OR empresa_id IS NULL
LIMIT 100;
