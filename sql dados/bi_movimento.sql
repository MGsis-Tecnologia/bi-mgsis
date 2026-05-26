create or replace view bi_mgsis as 

SELECT to_char(p.pedido_data_fatura, 'DD/MM/YYYY'::text) AS pedido_data,
    p.pedido_id AS pedido_documento,
    tipo_preco.tipo_preco_descricao AS pedido_canal,
    p.cliente_id,
    c.pessoa_nome AS cliente_nome,
    i.produto_id,
    pr.produto_descricao,
    i.item_quantidade AS produto_quantidade,
    i.item_total AS produto_valor_total,
    i.item_custos AS produto_valor_custo,
    subgrupo.subgrupo_id,
    subgrupo.subgrupo_descricao,
    p.vendedor_id,
    v.pessoa_nome AS vendedor_nome,
    p.moeda_id,
    moeda.moeda_sigla,
    p.pedido_tipo,
    ( SELECT cidade.cidade_nome
           FROM endereco
             LEFT JOIN cidade ON endereco.cidade_id = cidade.cidade_id
          WHERE endereco.endereco_padrao = true AND endereco.pessoa_id = p.cliente_id
         OFFSET 0
         LIMIT 1) AS pedido_cidade
   FROM item_pedido i
     LEFT JOIN pedido p ON p.pedido_id = i.pedido_id
     LEFT JOIN pessoa c ON c.pessoa_id = p.cliente_id
     LEFT JOIN pessoa v ON v.pessoa_id = p.vendedor_id
     LEFT JOIN produto pr ON pr.produto_id = i.produto_id
     LEFT JOIN tipo_preco ON tipo_preco.tipo_preco_id = p.tipo_preco_id
     LEFT JOIN moeda ON moeda.moeda_id = p.moeda_id
     LEFT JOIN subgrupo ON subgrupo.subgrupo_id = pr.subgrupo_id
  WHERE p.pedido_tipo::text = 'VENDA'::text 
AND p.pedido_data_fatura >= '2022-01-01 00:00:00'::timestamp without time zone 
AND p.pedido_data_fatura <= '2026-12-31 00:00:00'::timestamp without time zone;