CREATE OR REPLACE VIEW bi.cliente_bi AS  SELECT segmento.segmento_descricao AS categoria, '' AS classificacion,
    pessoa.pessoa_id,
    pessoa.pessoa_nome,
        CASE
            WHEN pessoa.pessoa_juridica THEN 1
            ELSE 2
        END AS tipo_pessoa,
    ( SELECT endereco.endereco_logradouro
           FROM endereco
          WHERE endereco.endereco_padrao = true AND endereco.pessoa_id = pessoa.pessoa_id
         OFFSET 0
         LIMIT 1) AS direccion,
    ( SELECT cidade.cidade_nome
           FROM endereco
             LEFT JOIN cidade ON endereco.cidade_id = cidade.cidade_id
          WHERE endereco.endereco_padrao = true AND endereco.pessoa_id = pessoa.pessoa_id
         OFFSET 0
         LIMIT 1) AS cidade,
    'PARAGUAY'::text AS pais,
    concat_ws('-'::text, pessoa.pessoa_ruc, pessoa.pessoa_ruc_dv) AS ruc
   FROM pessoa
     LEFT JOIN segmento ON segmento.segmento_id = pessoa.segmento_id
  WHERE pessoa.pessoa_cliente = true AND pessoa.pessoa_inativo = false;
  
CREATE OR REPLACE VIEW bi.compra_bi AS  SELECT c.empresa_id,
    c.moeda_id, '' AS sucursal,
    c.deposito_id,
    i.produto_id,
    c.fornecedor_id,
    c.compra_nota_fiscal,
    i.item_compra_unitario,
    i.item_compra_quantidade,
    i.item_compra_total,
    c.compra_data_emissao
   FROM item_compra i
     LEFT JOIN compra c ON c.compra_id = i.compra_id
  WHERE c.compra_status_estoque = true;
  
CREATE OR REPLACE VIEW bi.cotizacion_bi AS  SELECT c.moeda_id AS moedaorigem,
    c.moeda_destino_id AS moedadestino,
    c.cambio_data AS data,
    c.cambio_oficial_compra AS cambiocompra,
    c.cambio_produto AS cambiovenda
   FROM cambio c;
   
CREATE OR REPLACE VIEW bi.deposito_bi AS  SELECT deposito.deposito_id,
    deposito.deposito_descricao
   FROM deposito;
   
  CREATE OR REPLACE VIEW bi.empresa_bi AS  SELECT empresa.empresa_id,
    empresa.empresa_razao
   FROM empresa;
   
CREATE OR REPLACE VIEW bi.marca_bi AS  SELECT marca.marca_id,
    marca.marca_descricao
   FROM marca;
   
CREATE OR REPLACE VIEW bi.moneda_bi AS  SELECT moeda.moeda_id,
    moeda.moeda_sigla
   FROM moeda;
   
CREATE OR REPLACE VIEW bi.pagar_bi AS  SELECT p.empresa_id,
    p.moeda_id,
    ''::text AS sucursal,
    p.pessoa_fornecedor_id,
    p.pagar_data_emissao,
    p.pagar_data_vencimento,
    p.pagar_documento,
    ''::text AS numerotitulo,
    'PAGAR'::text AS tipolanzamiento,
    p.pagar_valor_documento,
    p.pagar_valor_pago,
    p.pagar_valor_documento AS valor_total
   FROM pagar p
  WHERE p.pagar_data_pagamento IS NULL;
  
CREATE OR REPLACE VIEW bi.produto_bi AS  SELECT p.marca_id,
    p.subgrupo_id,
    p.produto_id,
    p.produto_fabricante,
    p.produto_descricao,
    p.produto_original,
    u.unidade_sigla,
    p.moeda_id,
    p.produto_custo_reposicao,
    uc.compra_data_emissao AS ultima_compra_data,
    pc.compra_data_emissao AS primeira_compra_data
   FROM produto p
     LEFT JOIN unidade u ON u.unidade_id = p.unidade_id
     LEFT JOIN LATERAL ( SELECT c.compra_data_emissao
           FROM item_compra ic
             JOIN compra c ON c.compra_id = ic.compra_id
          WHERE ic.produto_id = p.produto_id
          ORDER BY c.compra_data_emissao
         LIMIT 1) pc ON true
     LEFT JOIN LATERAL ( SELECT c.compra_data_emissao
           FROM item_compra ic
             JOIN compra c ON c.compra_id = ic.compra_id
          WHERE ic.produto_id = p.produto_id
          ORDER BY c.compra_data_emissao DESC
         LIMIT 1) uc ON true;
		 
CREATE OR REPLACE VIEW bi.proveedor_bi AS  SELECT pessoa.pessoa_id,
    pessoa.pessoa_nome,
    concat_ws('-'::text, pessoa.pessoa_ruc, pessoa.pessoa_ruc_dv) AS ruc,
    ''::text AS classificaion,
    ''::text AS tipo_proveedor
   FROM pessoa
  WHERE pessoa.pessoa_fornecedor = true AND pessoa.pessoa_inativo = false;
  
CREATE OR REPLACE VIEW bi.receber_bi AS  SELECT r.empresa_id,
    r.moeda_id,
    ''::text AS sucursal,
    r.pessoa_cliente_id,
    r.receber_data_emissao,
    r.receber_data_vencimento,
    r.receber_documento,
    ''::text AS numerotitulo,
    'RECEBER'::text AS tipolanzamiento,
    r.receber_valor_documento,
    r.receber_valor_recebido,
    r.receber_valor_documento - r.receber_valor_recebido As saldo_documento
   FROM receber r;
   
CREATE OR REPLACE VIEW bi.stock_bi AS  SELECT e.empresa_id,
    p.moeda_id,
    ''::text AS sucursal,
    e.deposito_id,
    e.produto_id,
    e.estoque_quantidade,
    e.estoque_quantidade * p.produto_custo_reposicao AS valorstock
   FROM estoque e
     LEFT JOIN produto p ON p.produto_id = e.produto_id
  WHERE p.produto_inativo = false;
  
CREATE OR REPLACE VIEW bi.subgrupo_bi AS  SELECT subgrupo.subgrupo_id,
    subgrupo.subgrupo_descricao
   FROM subgrupo;
CREATE OR REPLACE VIEW bi.vendedor_bi AS  SELECT pessoa.pessoa_id,
    pessoa.pessoa_nome,
    pessoa.pessoa_ruc
   FROM pessoa
  WHERE pessoa.pessoa_vendedor = true AND pessoa.pessoa_inativo = false;
  
CREATE OR REPLACE VIEW bi.ventas_bi AS  SELECT i.item_quantidade,
    p.empresa_id,
    p.moeda_id,
    ''::text AS sucursal,
    p.cliente_id,
    i.produto_id,
    p.vendedor_id,
        CASE
            WHEN i.item_custos = 0::numeric THEN 0::numeric
            WHEN (i.item_custos / i.item_quantidade) = 0::numeric THEN 0::numeric
            ELSE round(i.item_custos / i.item_quantidade, 2)
        END AS costo_unitario,
    p.pedido_data_fatura,
    ''::text AS lineafactura,
    p.pedido_nota_fiscal,
    ''::text AS numeroventa,
    i.item_unitario,
    p.pedido_tipo,
    ''::text AS tipooperacion,
    i.item_desconto,
    i.item_valor_iva,
    i.item_total
   FROM item_pedido i
     LEFT JOIN pedido p ON p.pedido_id = i.pedido_id
  WHERE (p.pedido_tipo::text = ANY (ARRAY['VENDA'::character varying, 'DEVOLUCAO VENDA'::character varying]::text[])) AND p.pedido_data_fatura IS NOT NULL;
  
