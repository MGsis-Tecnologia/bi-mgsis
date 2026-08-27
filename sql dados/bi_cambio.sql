-- ============================================================================
-- VIEW: bi_cambio  ->  dataset "cambio" da ingestao
-- 1 linha = cambio MEDIO de 1 par de moedas em 1 mes
--
-- Substitui a versao diaria: para relatorio mensal, a media do mes e o numero
-- que o negocio usa, e a tabela cai de dezenas de milhares de linhas para
-- algumas centenas.
--
-- -- O QUE O NUMERO SIGNIFICA (leia antes de mexer) --------------------------
--
-- `cambio_medio` e uma MAGNITUDE, nao uma taxa direcional:
--
--     quantas unidades de `moeda_origem` valem 1 unidade de `moeda_destino`
--
-- Na pratica, com guarani como moeda local:
--
--     moeda_origem=3, moeda_destino=2, cambio_medio=7350
--     -> 1 dolar custa 7.350 guaranis
--     -> indo  US$ -> G$  MULTIPLICA por 7.350
--     -> indo  G$ -> US$  DIVIDE     por 7.350
--
-- O mesmo vale para o real: R$ -> G$ multiplica, G$ -> R$ divide.
--
-- **O Analytics nao decide isso a cada consulta.** Na entrada, cada linha
-- daqui vira DUAS na tabela `cambio_mensal` -- o sentido direto e o inverso,
-- ja calculado como 1/taxa. Da consulta em diante e sempre multiplicacao, o
-- que elimina a classe de erro "multipliquei onde devia dividir".
--
-- -- A ORIENTACAO E VALIDADA PELA MAGNITUDE REAL, NAO ASSUMIDA -------------
--
-- Duas versoes anteriores desta view tentaram uma REGRA FIXA pra decidir qual
-- coluna crua (`moeda_id` ou `moeda_destino_id`) e a moeda local:
--   1. "moeda_id e sempre o dolar" -- confirmado num cliente so; em outro,
--      invertido.
--   2. "a moeda mais fraca (G$ < R$ < US$) e sempre a origem, e o numero cru
--      (`cambio_produto`) e sempre 'quantas moeda_destino_id por 1
--      moeda_id'" -- essa SEGUNDA suposicao (qual das duas colunas o ERP usa
--      pra qual papel) tambem se mostrou dependente do cliente: em outro
--      banco, `cambio_produto` guarda o INVERSO disso.
--
-- As duas vezes o resultado foi o mesmo tipo de erro: silenciosamente correto
-- num cliente, silenciosamente invertido no proximo.
--
-- Esta versao nao assume qual coluna significa o que. Para cada cotacao
-- diaria, testa as DUAS leituras possiveis do numero cru -- ele mesmo, e o
-- seu reciproco (1/numero) -- contra a faixa de magnitude ESPERADA do par
-- (moeda fraca por 1 moeda forte, ex.: guaranis por 1 dolar entre 1.000 e
-- 50.000). Essa faixa e a unica coisa que e de fato fixa em qualquer
-- cliente: e a economia real das tres moedas do sistema (1=R$ 2=US$ 3=G$),
-- nao uma convencao de como o ERP grava a tabela. Qual das duas leituras cai
-- dentro da faixa e a correta; a outra e descartada.
--
-- Cotacao que nao bate em nenhuma das duas leituras (nem o numero, nem o
-- reciproco, caem na faixa esperada) e um problema de DADO, nao de
-- orientacao -- a linha some do resultado em vez de entrar errada. Cotacao
-- envolvendo moeda fora de {1, 2, 3} tambem nao entra: o sistema todo so
-- lida com essas tres.
--
-- A reorientacao acontece por COTACAO DIARIA, antes da media do mes -- assim,
-- mesmo que o ERP grave o mesmo par ora numa ordem ora na outra, as duas
-- formas caem no mesmo par final em vez de virarem duas linhas que nao se
-- encontram.
--
-- Por isso `moeda.moeda_multiplica` nao precisa ser enviado: a orientacao sai
-- da magnitude, e o inverso e derivado.
--
-- -- Colunas ------------------------------------------------------------------
--   moeda_origem / moeda_destino  o par (origem = a moeda mais fraca do par)
--   mes_referencia                dia 1o do mes, em DATE -- e o que o Analytics
--                                 usa; `YYYY-MM` sai daqui
--   mes_ano                       'MM-YYYY', so rotulo para leitura humana
--   cambio_medio                  media das medias diarias do mes, ja orientada
--   qtd_dias_com_cotacao          quantos dias do mes tinham cotacao; serve
--                                 para desconfiar de mes com 1 dia so
--   primeira_cotacao/ultima       extremos do mes, para auditoria
-- ============================================================================
-- DROP antes do CREATE: esta view SUBSTITUIU uma versao diaria mais antiga
-- (colunas cambio_data/moeda_origem/moeda_destino/cambio_taxa). O conjunto de
-- colunas mudou por completo, nao so acrescentou no fim -- e `CREATE OR
-- REPLACE VIEW` so aceita mudanca de shape assim, recusa renomear/reordenar
-- as que ja existem. Sem o DROP, quem ja tinha a view antiga instalada
-- recebe erro do Postgres ("cannot change name of view column") em vez de
-- atualizar.
DROP VIEW IF EXISTS bi_cambio;
CREATE VIEW bi_cambio AS
WITH cambio_diario AS (
    -- Mais de uma cotacao no mesmo dia vira a media do dia, para que um dia
    -- com 5 lancamentos nao pese 5 vezes na media do mes.
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
),
-- Forca relativa fixa das tres moedas do sistema -- quanto MENOR o rank, mais
-- fraca a moeda (mais unidades por 1 das outras). Nao e observada dos dados:
-- e a mesma identidade usada em todo o resto do Analytics (1=R$ 2=US$ 3=G$).
forca (moeda, rank) AS (
    VALUES (3, 1),   -- guarani: a mais fraca
           (1, 2),   -- real: intermediaria
           (2, 3)    -- dolar: a mais forte
),
-- Faixa de magnitude esperada, "quantas unidades da fraca por 1 da forte" --
-- fato de economia, nao observacao de um cliente especifico. Mesmos limites
-- de src/lib/server/ingest/cambio-mensal.ts.
faixas (fraca, forte, minimo, maximo) AS (
    VALUES (3, 2, 1000::numeric,  50000::numeric),  -- guaranis por 1 dolar
           (3, 1, 200::numeric,   10000::numeric),  -- guaranis por 1 real
           (1, 2, 0.5::numeric,   50::numeric)       -- reais por 1 dolar
),
candidatos AS (
    -- Para cada cotacao diaria, identifica quem e a moeda fraca/forte do par
    -- (por identidade, nao por posicao de coluna) e monta as DUAS leituras
    -- possiveis do numero cru: ele mesmo, e o seu reciproco.
    SELECT
        d.cambio_data,
        r1.moeda AS fraca,
        r2.moeda AS forte,
        d.cambio_medio_dia AS candidato_direto,
        CASE WHEN d.cambio_medio_dia > 0 THEN 1 / d.cambio_medio_dia END AS candidato_inverso
    FROM cambio_diario d
    JOIN forca rA ON rA.moeda = d.moeda_id
    JOIN forca rB ON rB.moeda = d.moeda_destino_id
    JOIN forca r1 ON r1.rank = LEAST(rA.rank, rB.rank)
    JOIN forca r2 ON r2.rank = GREATEST(rA.rank, rB.rank)
),
orientado_diario AS (
    -- Fica com a leitura (direta ou inversa) que cai na faixa esperada do
    -- par. Se nenhuma cair, a linha nao aparece aqui -- e um dado ruim, nao
    -- um problema de orientacao para "consertar" adivinhando.
    SELECT
        c.cambio_data,
        c.fraca AS moeda_origem,
        c.forte AS moeda_destino,
        CASE WHEN c.candidato_direto BETWEEN f.minimo AND f.maximo
             THEN c.candidato_direto
             ELSE c.candidato_inverso
        END AS cambio_medio_dia
    FROM candidatos c
    JOIN faixas f ON f.fraca = c.fraca AND f.forte = c.forte
    WHERE (c.candidato_direto BETWEEN f.minimo AND f.maximo)
       OR (c.candidato_inverso BETWEEN f.minimo AND f.maximo)
)
SELECT
    moeda_origem,
    moeda_destino,
    DATE_TRUNC('month', cambio_data)::date                AS mes_referencia,
    TO_CHAR(DATE_TRUNC('month', cambio_data), 'MM-YYYY')  AS mes_ano,
    ROUND(AVG(cambio_medio_dia), 4)                       AS cambio_medio,
    COUNT(*)                                              AS qtd_dias_com_cotacao,
    MIN(cambio_data)                                      AS primeira_cotacao,
    MAX(cambio_data)                                      AS ultima_cotacao
FROM orientado_diario
GROUP BY moeda_origem, moeda_destino, DATE_TRUNC('month', cambio_data)
ORDER BY mes_referencia, moeda_destino;

-- -- CONFIRA ANTES DE ENVIAR ---------------------------------------------------
--
-- 1. A ordem de grandeza esta certa?
--
--      SELECT moeda_origem, moeda_destino,
--             MIN(cambio_medio) AS menor, MAX(cambio_medio) AS maior,
--             COUNT(*) AS meses
--        FROM bi_cambio GROUP BY 1, 2 ORDER BY 1, 2;
--
--    Com guarani (3) como moeda local, o esperado e:
--      3 -> 2   entre 1.000 e 50.000   (hoje perto de 7.400)
--      3 -> 1   entre   200 e 10.000   (hoje perto de 1.400)
--
--    Se aparecer um numero fora dessa faixa, e a cotacao em si que esta
--    errada no ERP (a view ja recusa o que nao bate em nenhuma orientacao).
--
-- 2. Sumiu algum mes que devia ter cotacao?
--
--      SELECT to_char(cambio_data, 'YYYY-MM') AS mes, COUNT(*)
--        FROM cambio GROUP BY 1
--       EXCEPT
--      SELECT mes_ano, 0 FROM bi_cambio;  -- so pra achar os buracos; ajuste o formato se precisar
--
--    Um mes inteiro sumindo daqui (mas presente na tabela `cambio` crua)
--    significa que NENHUMA das duas leituras bateu na faixa esperada --
--    vale abrir os dados crus daquele mes e conferir a cotacao a olho.
--
-- 3. Algum mes com pouquissima cotacao?
--
--      SELECT * FROM bi_cambio WHERE qtd_dias_com_cotacao <= 2
--       ORDER BY mes_referencia DESC;
--
--    Um mes inteiro representado por um dia so e uma media fragil. Nao impede
--    o envio -- so vale saber antes de explicar um numero estranho.
--
-- 4. Falta algum mes?
--
--      SELECT moeda_destino, COUNT(DISTINCT mes_referencia) AS meses,
--             MIN(mes_referencia) AS de, MAX(mes_referencia) AS ate
--        FROM bi_cambio GROUP BY 1 ORDER BY 1;
--
--    Buraco no meio da serie nao impede nada: o Analytics preenche mes sem
--    cotacao com o mes MAIS PROXIMO daquele par, e marca a linha como
--    derivada.
