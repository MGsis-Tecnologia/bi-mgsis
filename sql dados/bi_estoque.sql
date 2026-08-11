-- ============================================================================
-- VIEW: bi_estoque  →  dataset "estoque" da API de ingestão
-- 1 linha = 1 (produto, empresa). É uma FOTO, não uma série: vai inteira numa
-- requisição só, com periodo = "tudo".
--
-- Corrigida em 11/08/2026. Ver as três regras no topo de bi_movimento.sql.
--
-- A correção principal: `estoque_minimo` usava SUM. Como a tabela `estoque`
-- pode ter várias linhas do mesmo produto na mesma empresa (por depósito), e
-- `produto_estoque_minimo` vem do CADASTRO do produto, o SUM multiplicava o
-- mínimo pelo número de linhas de estoque. Virou MIN — o valor é um só.
--
-- ⚠ DECISÃO PENDENTE, ver o comentário no fim do arquivo: com duas empresas, o
-- mínimo do cadastro (que é por produto, não por empresa) é repetido nas duas
-- linhas, e o BI soma as empresas ao consolidar por SKU.
--
-- Notas sobre o comando abaixo:
--   MIN, não SUM: é atributo do cadastro do produto, não da linha de estoque.
-- ============================================================================
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

-- ⚠ Sobre o estoque mínimo com mais de uma empresa
--
-- `produto_estoque_minimo` está na tabela `produto`: é UM valor por produto, não
-- por empresa. Com duas empresas, o mesmo produto gera duas linhas aqui e as
-- duas carregam o mínimo cheio.
--
-- Isso importa porque o BI, ao mostrar "todas as empresas", consolida por SKU
-- somando as linhas — então o mínimo aparece DOBRADO, e o alerta "abaixo do
-- mínimo" dispara cedo demais.
--
-- Não corrigi porque a resposta é de negócio, não de SQL:
--   a) o mínimo é da REDE  → emitir só numa linha por produto (a menor
--      empresa_id) e 0 nas demais, para a soma dar o valor certo —
--   b) o mínimo é POR LOJA → está certo como está, e quem precisa mudar é o BI,
--      que não deveria somar —
--   c) o mínimo deveria ser cadastrado por (produto, empresa) no ERP.

