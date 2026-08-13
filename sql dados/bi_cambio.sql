-- ============================================================================
-- VIEW: bi_cambio  →  dataset "cambio" da API de ingestão
-- 1 linha = 1 cotação de 1 par de moedas em 1 dia
--
-- Ver as três regras no topo de bi_movimento.sql (nada de NULL, data crua, sem
-- janela fixa). A data sai CRUA mesmo o câmbio indo sempre inteiro: manter o
-- padrão evita que alguém, ao adicionar um filtro no futuro, tropece num campo
-- em texto.
--
-- Notas sobre o comando abaixo:
--   `cambio_taxa` significa "1 unidade de moeda_origem equivale a cambio_taxa
--   unidades de moeda_destino". Se o ERP guardar ao contrário, NÃO é preciso
--   corrigir aqui: o servidor aceita o par em qualquer sentido e normaliza.
--   E se o sentido estiver invertido de fato, ele recusa a cotação e diz —
--   há uma checagem de ordem de grandeza por par (US$→G$ precisa cair entre
--   1.000 e 50.000), justamente porque taxa invertida não gera erro nenhum no
--   banco, só um relatório milhares de vezes maior ou menor.
--
--   A origem é `cambio_produto`, que no ERP é a cotação de venda. Se existir
--   também uma de compra, a escolha está feita: o plano decidiu UMA cotação
--   por par, e o sentido inverso sai de 1/taxa. Duas cotações independentes
--   fariam dois relatórios do sistema se contradizerem.
--
--   Linha sem data, sem taxa positiva ou com origem igual ao destino é
--   descartada aqui — viraria 422 no envio, derrubando o lote inteiro.
-- ============================================================================
CREATE OR REPLACE VIEW bi_cambio AS
SELECT
    c.cambio_data                              AS cambio_data,
    COALESCE(c.moeda_id::text, '')             AS moeda_origem,
    COALESCE(c.moeda_destino_id::text, '')     AS moeda_destino,
    c.cambio_produto                           AS cambio_taxa
FROM cambio c
WHERE c.cambio_data IS NOT NULL
  AND c.cambio_produto > 0
  AND COALESCE(c.moeda_id::text, '') <> ''
  AND COALESCE(c.moeda_destino_id::text, '') <> ''
  AND c.moeda_id::text <> c.moeda_destino_id::text;

-- ── CONFIRA ANTES DE ENVIAR ────────────────────────────────────────────────
--
-- 1. Mais de uma cotação para o mesmo par no mesmo dia?
--
--      SELECT cambio_data, moeda_origem, moeda_destino, COUNT(*) AS cotacoes
--        FROM bi_cambio
--       GROUP BY 1, 2, 3 HAVING COUNT(*) > 1
--       ORDER BY 4 DESC LIMIT 20;
--
--    Se voltar vazio, está tudo certo. Se voltar linhas, o servidor fica com a
--    PRIMEIRA e avisa quando as taxas divergem mais de 2% — mas nesse caso vale
--    decidir a regra (última do dia? média?) e agregar aqui, em vez de deixar
--    a escolha ao acaso.
--
-- 2. A ordem de grandeza está certa?
--
--      SELECT moeda_origem, moeda_destino,
--             MIN(cambio_taxa) AS menor, MAX(cambio_taxa) AS maior,
--             COUNT(*) AS dias
--        FROM bi_cambio GROUP BY 1, 2 ORDER BY 1, 2;
--
--    Com guarani (id 3) como moeda local, o esperado é:
--      2 → 3   entre  1.000 e 50.000   (hoje perto de 7.300)
--      1 → 3   entre    200 e 10.000   (hoje perto de 1.400)
--
--    Valores como 0,00014 significam par invertido. O servidor recusa e aponta
--    a linha, mas é melhor descobrir aqui.
--
-- 3. Desde quando há cotação?
--
--      SELECT MIN(cambio_data) AS primeira, MAX(cambio_data) AS ultima,
--             COUNT(*) AS cotacoes
--        FROM bi_cambio;
--
--    Venda anterior à primeira cotação fica sem taxa — é o único buraco que
--    sobra, e só o ERP pode fechá-lo. Do lado do Analytics, a tabela densa é
--    preenchida até HOJE por carry-forward, então o lado recente está coberto.
