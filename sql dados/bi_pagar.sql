create or replace view as 
 SELECT r.moeda_id,
    moeda.moeda_sigla,
    r.pessoa_fornecedor_id,
    c.pessoa_nome,
    r.pagar_data_emissao AS data_emissao,
    r.pagar_data_vencimento AS data_vencimento,
    r.pagar_documento,
    'PAGAR'::text AS tipolanzamiento,
        CASE
            WHEN r.pagar_valor_pago > 0::numeric THEN r.pagar_valor_pago
            ELSE r.pagar_valor_documento
        END AS valor_documento,
    r.pagar_data_pagamento AS data_pagamento
   FROM pagar r
     LEFT JOIN pessoa c ON c.pessoa_id = r.pessoa_fornecedor_id
     LEFT JOIN moeda ON moeda.moeda_id = r.moeda_id;