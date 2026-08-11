# Views `bi_*` → API de ingestão

De onde cada campo do contrato sai. O contrato completo (tipos, limites,
exemplos) está em [../INGESTAO-API.md](../INGESTAO-API.md).

**A regra que economiza depuração:** a API valida com schema estrito e devolve
**422 em campo nulo** — `null` não é o mesmo que "ausente". As views já saem com
`COALESCE` em tudo que vem de `LEFT JOIN`, então o agente não precisa tratar
nulo. Se um dia alguém editar uma view e tirar um `COALESCE`, o sintoma vai ser
`422 Linha N inválida: campo "clientName" — Expected string, received null`.

## Como o agente consulta

O período é filtrado na **coluna de data crua** da view, com intervalo
semiaberto — assim o índice do ERP é usado:

```sql
SELECT to_char(pedido_data, 'YYYY-MM-DD') AS "date", ...
  FROM bi_movimento
 WHERE pedido_data >= '2026-05-01'
   AND pedido_data <  '2026-06-01';
```

`< primeiro dia do mês seguinte`, e não `<= último dia`: as colunas são
`timestamp`, e `<= '2026-05-31'` perderia tudo que aconteceu depois da
meia-noite do dia 31.

`bi_estoque` não tem data — vai inteira, com `periodo: "tudo"`.

## vendas ← `bi_movimento`

| Campo da API | Coluna da view |
|---|---|
| `date` * | `pedido_data` → `to_char(…,'YYYY-MM-DD')` |
| `orderId` | `pedido_documento` |
| `orderType` | `pedido_tipo` |
| `channel` | `pedido_canal` |
| `clientId` / `clientName` / `clientCity` | `cliente_id` / `cliente_nome` / `pedido_cidade` |
| `productId` / `productName` | `produto_id` / `produto_descricao` |
| `quantity` | `produto_quantidade` |
| `totalOrig` / `costOrig` / `discountOrig` | `produto_valor_total` / `produto_valor_custo` / `item_desconto` |
| `subgroupId` / `subgroupName` | `subgrupo_id` / `subgrupo_descricao` |
| `sellerId` / `sellerName` | `vendedor_id` / `vendedor_nome` |
| `currencyId` / `currencyCode` | `moeda_id` / `moeda_sigla` |
| `empresaId` | `empresa_id` |

## orcamentos ← `bi_orcamentos`

| Campo da API | Coluna da view |
|---|---|
| `orcamentoData` * | `orcamento_data` → `to_char(…,'YYYY-MM-DD')` |
| `orcamentoConfirmado` | `orcamento_confirmado` — **booleano de verdade** |
| `orcamentoDataConfirmacao` | `orcamento_data_confirmacao` (já ISO ou `''`) |
| `orcamentoId` / `itemOrcamentoId` | `orcamento_id` / `item_orcamento_id` |
| `clienteId` / `clienteNome` | `cliente_id` / `cliente_nome` |
| `vendedorId` / `vendedorNome` | `vendedor_id` / `vendedor_nome` |
| `produtoId` / `produtoDescricao` / `produtoFabricante` | idem, snake_case |
| `itemQuantidade` / `itemQuantidadeConfirmada` / `itemTotal` | idem |
| `moedaId` / `moedaSigla` / `empresaId` | idem |

> ⚠ **Nunca** mande texto em `orcamentoConfirmado`. A API usa coerção booleana,
> em que qualquer texto não vazio vira `true` — inclusive `"Pendente"` e
> `"false"`. Era por isso que a view não podia mais devolver o rótulo.

## receber ← `bi_receber`

| Campo da API | Coluna da view |
|---|---|
| `issueDate` * | `data_emissao` → `to_char(…,'YYYY-MM-DD')` |
| `dueDate` / `receivedDate` | `data_vencimento` / `data_recebimento` (já ISO ou `''`) |
| `isPaid` | `is_paid` |
| `documentId` | `receber_documento` |
| `clientId` / `clientName` / `clientCity` | `pessoa_cliente_id` / `pessoa_nome` / `pessoa_cidade` |
| `sellerId` / `sellerName` | `vendedor_id` / `vendedor_nome` |
| `entryType` | `tipolanzamiento` |
| `amountOrig` | `valor_documento` |
| `currencyId` / `currencyCode` / `empresaId` | `moeda_id` / `moeda_sigla` / `empresa_id` |

## pagar ← `bi_pagar`

Igual a receber, trocando cliente por fornecedor:

| Campo da API | Coluna da view |
|---|---|
| `issueDate` * | `data_emissao` |
| `dueDate` / `paidDate` | `data_vencimento` / `data_pagamento` |
| `isPaid` | `is_paid` |
| `documentId` | `pagar_documento` |
| `supplierId` / `supplierName` | `pessoa_fornecedor_id` / `pessoa_nome` |
| `entryType` / `amountOrig` | `tipolanzamiento` / `valor_documento` |
| `currencyId` / `currencyCode` / `empresaId` | `moeda_id` / `moeda_sigla` / `empresa_id` |

## caixa ← `bi_caixa`

| Campo da API | Coluna da view |
|---|---|
| `date` * | `caixa_data_emissao` → `to_char(…,'YYYY-MM-DD')` |
| `centroCustoId` / `centroCustoDescricao` | idem |
| `planoContaId` / `planoContaCodigo` / `planoContaDescricao` | idem |
| `caixaId` / `caixaDescricao` | idem |
| `valorDocumento` | `caixa_valor_documento` |
| `moedaId` / `moedaSigla` / `empresaId` | idem |

## estoque ← `bi_estoque`

Sem data. Envio inteiro, `periodo: "tudo"`.

| Campo da API | Coluna da view |
|---|---|
| `productId` | `produto_id` |
| `description` / `manufacturerCode` | `produto_descricao` / `produto_fabricante` |
| `stock` | `estoque_item` |
| `costTotalUSD` | `valor_estoque` |
| `minStock` | `estoque_minimo` |
| `currencyId` / `currencyCode` / `empresaId` | `moeda_id` / `moeda_sigla` / `empresa_id` |

\* campo obrigatório: sem ele a linha é recusada.

## Duas armadilhas operacionais

**Lote vazio APAGA o período.** A operação é *"substitua o período por estas
linhas"* — mandar zero linhas apaga o mês. Se a consulta ao ERP falhar de um
jeito que devolva vazio em vez de erro (view recriada, permissão revogada,
filtro errado), o agente apagaria dado bom sem sinal nenhum. **O agente deve se
recusar a enviar período vazio**, salvo quando alguém pedir explicitamente.

**Mande sempre o mês anterior junto.** Uma venda lançada dia 1º de agosto com
data de 31 de julho cai num mês que o ciclo não reescreve mais, e nunca
chegaria. Reenviar o mês anterior fecha essa janela e custa pouco.
