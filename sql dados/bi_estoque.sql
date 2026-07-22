create or replace view bi_estoque as

select e.produto_id as produto_id,
p.produto_descricao as produto_descricao,
p.produto_fabricante as produto_fabricante,
e.empresa_id as empresa_id,
p.moeda_id as moeda_id,
sum(e.estoque_quantidade) as estoque_item, 
sum(e.estoque_quantidade*p.produto_custo_unitario) as valor_estoque,
sum(p.produto_estoque_minimo) as estoque_minimo

from estoque e

left join produto p on p.produto_id = e.produto_id

where p.produto_inativo = false 
and p.produto_revenda = true

group by 1,2,3,4,5
