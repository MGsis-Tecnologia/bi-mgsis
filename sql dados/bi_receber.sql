 create or replace view bi_receber as
 SELECT r.moeda_id,
    moeda.moeda_sigla,
    r.pessoa_cliente_id,
    c.pessoa_nome,
    r.receber_data_emissao AS data_emissao,
    r.receber_data_vencimento AS data_vencimento,
    r.receber_documento,
    'RECEBER'::text AS tipolanzamiento,
        CASE
            WHEN r.receber_valor_recebido > 0::numeric THEN r.receber_valor_recebido
            ELSE r.receber_valor_documento
        END AS valor_documento,
    r.pessoa_vendedor_id AS vendedor_id,
    v.pessoa_nome AS vendedor_nome,
    ( SELECT cidade.cidade_nome
           FROM endereco
             LEFT JOIN cidade ON endereco.cidade_id = cidade.cidade_id
          WHERE endereco.endereco_padrao = true AND endereco.pessoa_id = r.pessoa_cliente_id
         OFFSET 0
         LIMIT 1) AS pedido_cidade,
    r.receber_data_recebimento AS data_recebimento
   FROM receber r
     LEFT JOIN pessoa c ON c.pessoa_id = r.pessoa_cliente_id
     LEFT JOIN pessoa v ON v.pessoa_id = r.pessoa_vendedor_id
     LEFT JOIN moeda ON moeda.moeda_id = r.moeda_id;