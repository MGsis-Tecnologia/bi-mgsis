-- ============================================================================
-- Datas fora de 1990–2035 no ERP
--
-- A API do Analytics recusa a linha inteira quando encontra uma (HTTP 422).
-- Quase sempre é erro de digitação: 2220 ou 2202 no lugar de 2022, 2050 no
-- lugar de 2025.
--
-- Consulta as TABELAS DE ORIGEM, não as views: as views já substituem por
-- vazio as datas opcionais fora de faixa, então nelas o defeito é invisível.
-- Por isso precisa de um usuário com acesso às tabelas — o `analytics` não
-- serve aqui, de propósito:
--
--   psql -U postgres -d erp_do_cliente -f datas-impossiveis.sql
--
-- Como ler o resultado:
--   OBRIGATORIA = a linha NÃO carrega no Analytics enquanto não for corrigida.
--   opcional    = a view manda vazio no lugar e a linha carrega; corrigir é
--                 recomendado, mas não bloqueia.
-- ============================================================================
WITH fora AS (
  SELECT 'vendas' AS dataset, 'pedido_data_fatura' AS campo, 'OBRIGATORIA' AS peso,
         pedido_id::text AS documento, pedido_data_fatura::text AS valor
    FROM pedido
   WHERE pedido_data_fatura IS NOT NULL
     AND (pedido_data_fatura < DATE '1990-01-01' OR pedido_data_fatura >= DATE '2036-01-01')
  UNION ALL
  SELECT 'orcamentos', 'orcamento_data', 'OBRIGATORIA', orcamento_id::text, orcamento_data::text
    FROM orcamento
   WHERE orcamento_data IS NOT NULL
     AND (orcamento_data < DATE '1990-01-01' OR orcamento_data >= DATE '2036-01-01')
  UNION ALL
  SELECT 'orcamentos', 'orcamento_data_confirmacao', 'opcional', orcamento_id::text,
         orcamento_data_confirmacao::text
    FROM orcamento
   WHERE orcamento_data_confirmacao IS NOT NULL
     AND (orcamento_data_confirmacao < DATE '1990-01-01' OR orcamento_data_confirmacao >= DATE '2036-01-01')
  UNION ALL
  SELECT 'receber', 'receber_data_emissao', 'OBRIGATORIA', receber_documento::text,
         receber_data_emissao::text
    FROM receber
   WHERE receber_data_emissao IS NOT NULL
     AND (receber_data_emissao < DATE '1990-01-01' OR receber_data_emissao >= DATE '2036-01-01')
  UNION ALL
  SELECT 'receber', 'receber_data_vencimento', 'opcional', receber_documento::text,
         receber_data_vencimento::text
    FROM receber
   WHERE receber_data_vencimento IS NOT NULL
     AND (receber_data_vencimento < DATE '1990-01-01' OR receber_data_vencimento >= DATE '2036-01-01')
  UNION ALL
  SELECT 'receber', 'receber_data_recebimento', 'opcional', receber_documento::text,
         receber_data_recebimento::text
    FROM receber
   WHERE receber_data_recebimento IS NOT NULL
     AND (receber_data_recebimento < DATE '1990-01-01' OR receber_data_recebimento >= DATE '2036-01-01')
  UNION ALL
  SELECT 'pagar', 'pagar_data_emissao', 'OBRIGATORIA', pagar_documento::text,
         pagar_data_emissao::text
    FROM pagar
   WHERE pagar_data_emissao IS NOT NULL
     AND (pagar_data_emissao < DATE '1990-01-01' OR pagar_data_emissao >= DATE '2036-01-01')
  UNION ALL
  SELECT 'pagar', 'pagar_data_vencimento', 'opcional', pagar_documento::text,
         pagar_data_vencimento::text
    FROM pagar
   WHERE pagar_data_vencimento IS NOT NULL
     AND (pagar_data_vencimento < DATE '1990-01-01' OR pagar_data_vencimento >= DATE '2036-01-01')
  UNION ALL
  SELECT 'pagar', 'pagar_data_pagamento', 'opcional', pagar_documento::text,
         pagar_data_pagamento::text
    FROM pagar
   WHERE pagar_data_pagamento IS NOT NULL
     AND (pagar_data_pagamento < DATE '1990-01-01' OR pagar_data_pagamento >= DATE '2036-01-01')
  UNION ALL
  SELECT 'caixa', 'caixa_data_emissao', 'OBRIGATORIA', caixa_id::text, caixa_data_emissao::text
    FROM caixa_movimento
   WHERE caixa_data_emissao IS NOT NULL
     AND (caixa_data_emissao < DATE '1990-01-01' OR caixa_data_emissao >= DATE '2036-01-01')
)
SELECT peso, dataset, campo, count(*) AS linhas,
       min(valor) AS menor, max(valor) AS maior,
       (array_agg(documento ORDER BY documento))[1:5] AS exemplos
  FROM fora
 GROUP BY peso, dataset, campo
 ORDER BY peso, dataset, campo;
