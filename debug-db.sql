-- 1. Verificar se tabela compra_items existe
SELECT EXISTS(SELECT 1 FROM information_schema.tables WHERE table_name = 'compra_items') AS tabela_existe;

-- 2. Listar colunas de compra_items
SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'compra_items' ORDER BY ordinal_position;

-- 3. Contar registros
SELECT COUNT(*) as total_registros FROM compra_items;

-- 4. Sample dos dados
SELECT 
  fornecedor_id, 
  fornecedor_nome, 
  COUNT(*) as qtd,
  SUM(produto_valor_total) as total
FROM compra_items 
WHERE fornecedor_nome <> '' AND fornecedor_id IS NOT NULL
GROUP BY fornecedor_id, fornecedor_nome
LIMIT 5;

-- 5. Verificar se view bi_compras existe
SELECT EXISTS(SELECT 1 FROM information_schema.tables WHERE table_name = 'bi_compras' AND table_type = 'VIEW') AS view_existe;

-- 6. Listar todas as views
SELECT table_name FROM information_schema.tables WHERE table_type = 'VIEW' ORDER BY table_name;
