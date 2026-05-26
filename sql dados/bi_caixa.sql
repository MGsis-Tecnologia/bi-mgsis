create or replace view bi_caixa as
SELECT 
caixa_movimento.caixa_data_emissao AS caixa_data_emissao,	
caixa_movimento.centro_custo_id AS centro_custo_id,	
centro_custo.centro_custo_descricao AS centro_custo_descricao,
caixa_movimento.plano_conta_id AS plano_conta_id,	
plano_conta.plano_conta_codigo as plano_conta_codigo,
plano_conta.plano_conta_descricao AS plano_conta_descricao,	
caixa_movimento.caixa_id AS caixa_id,	
caixa.caixa_descricao AS caixa_descricao,		
caixa_movimento.caixa_valor_documento AS caixa_valor_documento,	
moeda.moeda_id as moeda_id,
moeda.moeda_sigla AS moeda_sigla

FROM 	
caixa_movimento	

LEFT JOIN 	condicao_pagamento ON condicao_pagamento.condicao_pagamento_id = caixa_movimento.condicao_pagamento_id
LEFT JOIN	caixa ON caixa.caixa_id = caixa_movimento.caixa_id
LEFT JOIN	moeda ON moeda.moeda_id = caixa.moeda_id
LEFT JOIN	plano_conta ON plano_conta.plano_conta_id = caixa_movimento.plano_conta_id
LEFT JOIN	centro_custo ON centro_custo.centro_custo_id = caixa_movimento.centro_custo_id
LEFT JOIN	pessoa ON pessoa.pessoa_id = caixa_movimento.pessoa_id

