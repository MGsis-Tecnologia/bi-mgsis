-- ============================================================================
-- VIEW: bi_cambio  →  dataset "cambio" da ingestão
-- 1 linha = câmbio MÉDIO de 1 par de moedas em 1 mês
--
-- Substitui a versão diária: para relatório mensal, a média do mês é o número
-- que o negócio usa, e a tabela cai de dezenas de milhares de linhas para
-- algumas centenas.
--
-- ── O QUE O NÚMERO SIGNIFICA (leia antes de mexer) ──────────────────────────
--
-- `cambio_medio` é uma MAGNITUDE, não uma taxa direcional:
--
--     quantas unidades de `moeda_origem` valem 1 unidade de `moeda_destino`
--
-- Na prática, com guarani como moeda local:
--
--     moeda_origem=3, moeda_destino=2, cambio_medio=7350
--     → 1 dólar custa 7.350 guaranis
--     → indo  US$ → G$  MULTIPLICA por 7.350
--     → indo  G$ → US$  DIVIDE     por 7.350
--
-- O mesmo vale para o real: R$ → G$ multiplica, G$ → R$ divide.
--
-- **O Analytics não decide isso a cada consulta.** Na entrada, cada linha
-- daqui vira DUAS na tabela `cambio_mensal` — o sentido direto e o inverso, já
-- calculado como 1/taxa. Da consulta em diante é sempre multiplicação, o que
-- elimina a classe de erro "multipliquei onde devia dividir".
--
-- Por isso `moeda.moeda_multiplica` não precisa ser enviado: a regra está na
-- ordem do par, e o inverso é derivado. Se algum dia aparecer linha em que
-- `moeda_id` NÃO seja a moeda local, a checagem de ordem de grandeza da
-- ingestão recusa e aponta — é o sinal de que o flag passou a ser necessário.
--
-- ── Colunas ────────────────────────────────────────────────────────────────
--   moeda_origem / moeda_destino  o par (ver acima o sentido)
--   mes_referencia                dia 1º do mês, em DATE — é o que o Analytics
--                                 usa; `YYYY-MM` sai daqui
--   mes_ano                       'MM-YYYY', só rótulo para leitura humana
--   cambio_medio                  média das médias diárias do mês
--   qtd_dias_com_cotacao          quantos dias do mês tinham cotação; serve
--                                 para desconfiar de mês com 1 dia só
--   primeira_cotacao/ultima       extremos do mês, para auditoria
-- ============================================================================
-- DROP antes do CREATE: esta view SUBSTITUIU uma versão diária mais antiga
-- (colunas cambio_data/moeda_origem/moeda_destino/cambio_taxa). O conjunto de
-- colunas mudou por completo, não só acrescentou no fim — e `CREATE OR REPLACE
-- VIEW` só aceita mudança de shape assim, recusa renomear/reordenar as que já
-- existem. Sem o DROP, quem já tinha a view antiga instalada recebe erro do
-- Postgres ("cannot change name of view column") em vez de atualizar.
DROP VIEW IF EXISTS bi_cambio;
CREATE VIEW bi_cambio AS
WITH cambio_diario AS (
    -- Mais de uma cotação no mesmo dia vira a média do dia, para que um dia com
    -- 5 lançamentos não pese 5 vezes na média do mês.
    SELECT
        moeda_id,
        moeda_destino_id,
        cambio_data,
        AVG(cambio_produto) AS cambio_medio_dia
    FROM cambio
    WHERE cambio_data IS NOT NULL
      AND cambio_produto > 0
      AND moeda_id IS NOT NULL
      AND moeda_destino_id IS NOT NULL
      AND moeda_id <> moeda_destino_id
    GROUP BY moeda_id, moeda_destino_id, cambio_data
)
SELECT
    moeda_id                                              AS moeda_origem,
    moeda_destino_id                                      AS moeda_destino,
    DATE_TRUNC('month', cambio_data)::date                AS mes_referencia,
    TO_CHAR(DATE_TRUNC('month', cambio_data), 'MM-YYYY')  AS mes_ano,
    ROUND(AVG(cambio_medio_dia), 4)                       AS cambio_medio,
    COUNT(*)                                              AS qtd_dias_com_cotacao,
    MIN(cambio_data)                                      AS primeira_cotacao,
    MAX(cambio_data)                                      AS ultima_cotacao
FROM cambio_diario
GROUP BY moeda_id, moeda_destino_id, DATE_TRUNC('month', cambio_data)
ORDER BY mes_referencia, moeda_id, moeda_destino_id;

-- ── CONFIRA ANTES DE ENVIAR ────────────────────────────────────────────────
--
-- 1. A ordem de grandeza está certa?
--
--      SELECT moeda_origem, moeda_destino,
--             MIN(cambio_medio) AS menor, MAX(cambio_medio) AS maior,
--             COUNT(*) AS meses
--        FROM bi_cambio GROUP BY 1, 2 ORDER BY 1, 2;
--
--    Com guarani (3) como moeda local, o esperado é:
--      3 → 2   entre 1.000 e 50.000   (hoje perto de 7.400)
--      3 → 1   entre   200 e 10.000   (hoje perto de 1.400)
--
--    Valor como 0,00014 significa par ao contrário do que este cabeçalho diz.
--
-- 2. Algum mês com pouquíssima cotação?
--
--      SELECT * FROM bi_cambio WHERE qtd_dias_com_cotacao <= 2
--       ORDER BY mes_referencia DESC;
--
--    Um mês inteiro representado por um dia só é uma média frágil. Não impede
--    o envio — só vale saber antes de explicar um número estranho.
--
-- 3. Falta algum mês?
--
--      SELECT moeda_destino, COUNT(DISTINCT mes_referencia) AS meses,
--             MIN(mes_referencia) AS de, MAX(mes_referencia) AS ate
--        FROM bi_cambio GROUP BY 1 ORDER BY 1;
--
--    Buraco não impede nada: o Analytics preenche mês sem cotação com o mês
--    MAIS PRÓXIMO daquele par, e marca a linha como derivada.
