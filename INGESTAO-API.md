# API de ingestão — guia do agente

Como o servidor do cliente envia dados do ERP para o Analytics.

Este documento é a referência para quem vai escrever o agente no servidor Linux
do cliente. O desenho e o porquê de cada decisão estão na seção 5 do
[PLANO-DADOS.md](PLANO-DADOS.md).

---

## Em uma frase

Existe **uma única operação**: *"substitua o período X deste dataset por estas
linhas"*. Não há inserção incremental, nem atualização de linha, nem exclusão
avulsa.

Isso não é limitação de implementação: **o ERP não tem chave única de linha** —
o mesmo pedido com o mesmo produto pode repetir legitimamente na mesma venda.
Sem chave, não existe "atualize esta linha aqui". Substituir o conjunto inteiro
é a única semântica correta, e traz duas garantias de graça:

- **Idempotência.** Reenviar o mesmo período quantas vezes quiser dá sempre o
  mesmo resultado. Se o agente não tiver certeza se um envio chegou, reenvie.
- **Atomicidade.** A troca acontece em transação. Enquanto ela não termina,
  quem está olhando o relatório continua vendo o período antigo **inteiro** —
  nunca meio período. Se o envio falhar no meio, nada muda.

---

## Autenticação

Todas as chamadas levam o token de integração da empresa:

```
Authorization: Bearer 3f2a...9c1  (64 caracteres hexadecimais)
```

O token é gerado pelo Master no painel, em **Empresas → (a empresa) → token de
integração**. Pontos importantes:

- **Ele aparece uma única vez, na hora em que é gerado.** O servidor guarda só
  o hash. Se perder, gere outro (o anterior é revogado automaticamente).
- **Só existe um token ativo por empresa.** Gerar um novo invalida o antigo.
- **O token diz quem você é, e o servidor decide onde gravar.** O agente nunca
  informa banco, empresa ou destino — não há como um cliente alcançar o dado de
  outro, nem por engano.

Guarde o token com a mesma proteção de uma senha de banco: arquivo com
permissão `600`, fora do controle de versão.

---

## Endpoints

```
POST /api/ingest/<dataset>     envia um período
GET  /api/ingest/<dataset>     mostra o que já está lá
```

`<dataset>` é um de:

| Dataset | Conteúdo | Período definido por |
|---|---|---|
| `vendas` | itens de venda | data de emissão |
| `orcamentos` | itens de orçamento | data do orçamento |
| `receber` | contas a receber | data de **emissão** |
| `pagar` | contas a pagar | data de **emissão** |
| `caixa` | movimentações de caixa | data do movimento |
| `estoque` | foto do estoque | *(não tem data)* |

> **Atenção em `receber` e `pagar`:** o período é pela **emissão**, não pelo
> vencimento. As telas filtram por vencimento, mas quem decide a que mês a linha
> *pertence* é a emissão — senão um título de janeiro com vencimento em março
> seria apagado ao reenviar março.

### Corpo do POST

```json
{
  "periodo": "2026-07",
  "linhas": [ { ... }, { ... } ]
}
```

### Formatos de período

| Formato | Significado |
|---|---|
| `"2026-07"` | o mês inteiro |
| `"2026-07-01..2026-07-15"` | intervalo, inclusivo dos dois lados |
| `"2026-07-09"` | um dia |
| `"tudo"` | **apenas** `estoque` |

O intervalo existe para quem tiver um mês grande demais para uma requisição só:
dá para partir em quinzenas sem perder atomicidade, porque cada pedaço é um
período fechado e independente.

### Resposta

```json
{
  "ok": true,
  "dataset": "vendas",
  "empresa": "CARLAO AUTORREPUESTOS S.A.",
  "periodo": "2026-07",
  "removidas": 28256,
  "inseridas": 28301,
  "ms": 5298
}
```

`removidas` é quanto havia no período antes; `inseridas`, quanto entrou.

---

## Regras que o servidor cobra

O envio é recusado **por inteiro** se qualquer linha estiver errada — nunca
entra pela metade. Os erros são específicos de propósito: num lote de 28 mil
linhas, "algo está errado" não ajuda ninguém.

| Situação | Código | O que fazer |
|---|---|---|
| Token ausente, inválido ou revogado | 401 | Gerar um novo no painel |
| Empresa suspensa | 403 | Falar com o administrador |
| Dataset não existe | 404 | Conferir a URL |
| Período mal formado | 400 | Ver os formatos acima |
| Linha com campo inválido | 422 | A resposta traz o **índice da linha** e o campo |
| Linha fora do período declarado | 422 | Ajustar o recorte no agente |
| Lote grande demais | 413 | Enviar um período menor |

**Datas são validadas de verdade.** `2026-02-30` e `2202-09-05` (digitação de
2022) são recusadas. Antes disso a coluna era texto e esse tipo de erro entrava
calado, sujando relatório sem nenhum sinal.

**Linha fora do período é erro, não aviso.** Se o agente declara `2026-07` e
manda uma linha de agosto, ela seria apagada no envio seguinte e nunca
apareceria — sem nenhuma mensagem. Recusar na entrada transforma um erro de
configuração (fuso horário, mês errado) em falha visível na hora.

---

## Quando enviar o quê

O servidor **não** decide a política de envio — ele só substitui o período que
você mandar. A recomendação, com os volumes medidos no cliente real:

| Momento | O que enviar | Custo |
|---|---|---|
| **Implantação** | mês a mês, os últimos 3–5 anos | ~1,5 GB, uma vez |
| **A cada 2 h** | mês corrente **e o anterior** | ~53 MB por ciclo |
| **Diário, de madrugada** | últimos 3–6 meses | 81–175 MB |
| **Mensal ou sob demanda** | a janela completa | ~1,5 GB, raro |

### Por que o mês anterior também

> Dia 1º de agosto, alguém lança no ERP uma venda **datada de 31 de julho**.

Se o ciclo só reescreve agosto, essa venda cai em julho — que não é mais
reenviado — e **nunca chega ao Analytics**. O mês fica permanentemente errado,
sem sinal de erro. Incluir o mês anterior fecha essa janela, e custa pouco
(0,27 → 0,62 GB/dia).

### O que isso não cobre

**Correção retroativa fora da janela não chega sozinha.** Se alguém corrigir uma
nota de março de 2024, o Analytics segue mostrando o valor antigo até que
alguém mande reenviar aquele período.

É aceitável **porque existe conserto**: a recarga da janela completa, agendada
para uma vez por mês ou disparada sob demanda. É o mesmo endpoint — só um
comando diferente no agente.

---

## Limites

| Limite | Valor | Observação |
|---|---|---|
| Linhas por requisição | 150.000 | acima disso, 413 |
| Tempo por requisição | 300 s | um mês de vendas leva ~5 s |

Medido no cliente real:

| Envio | Volume | Tempo |
|---|---|---|
| Um mês de vendas (28.256 linhas) | 12,4 MB | ~5,3 s |
| Foto de estoque (111.970 linhas) | 21,7 MB | ~8,4 s |

O estoque precisa vir inteiro numa requisição — é uma foto, não uma série, e não
há como parti-lo em períodos.

---

## Exemplos

### Conferir o que já existe

```bash
curl -s -H "Authorization: Bearer $TOKEN" \
  https://analytics.exemplo.com/api/ingest/vendas | jq
```

```json
{
  "ok": true,
  "dataset": "vendas",
  "empresa": "CARLAO AUTORREPUESTOS S.A.",
  "totalDeLinhas": 1417439,
  "ultimosMeses": [
    { "periodo": "2026-07", "linhas": 21034 },
    { "periodo": "2026-06", "linhas": 28256 }
  ]
}
```

Útil no agente para decidir o que falta — e para conferir, depois de um ciclo,
se o mês chegou com o número de linhas esperado.

### Enviar um mês

```bash
curl -s -X POST \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  --data @julho.json \
  https://analytics.exemplo.com/api/ingest/vendas
```

Onde `julho.json` é `{"periodo":"2026-07","linhas":[...]}`.

### Esqueleto do ciclo de 2 horas

```bash
#!/usr/bin/env bash
set -euo pipefail

TOKEN=$(cat /etc/mgsis/analytics.token)
BASE=https://analytics.exemplo.com/api/ingest
MES_ATUAL=$(date +%Y-%m)
MES_ANTERIOR=$(date -d "$(date +%Y-%m-01) -1 day" +%Y-%m)

enviar() {              # $1 = dataset, $2 = período
  local arquivo
  arquivo=$(mktemp)
  # exporta_do_erp gera {"periodo":"...","linhas":[...]}
  exporta_do_erp "$1" "$2" > "$arquivo"

  local resposta http
  resposta=$(curl -sS -w '\n%{http_code}' -X POST \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    --data @"$arquivo" "$BASE/$1")
  rm -f "$arquivo"

  http=$(tail -n1 <<<"$resposta")
  if [[ "$http" != "200" ]]; then
    echo "FALHA $1 $2 (HTTP $http): $(head -n-1 <<<"$resposta")" >&2
    return 1        # o período ficou como estava; o próximo ciclo tenta de novo
  fi
  echo "ok $1 $2: $(head -n-1 <<<"$resposta")"
}

for ds in vendas orcamentos receber pagar caixa; do
  enviar "$ds" "$MES_ANTERIOR"
  enviar "$ds" "$MES_ATUAL"
done
enviar estoque tudo
```

Como cada envio é atômico e idempotente, **falhar é seguro**: o período fica
como estava e o ciclo seguinte corrige. Não é preciso controlar estado entre
execuções nem manter fila de reenvio.

---

## Campos de cada dataset

Nomes em `camelCase`. Campos de texto omitidos viram `""`, numéricos viram `0`,
booleanos viram `false` — só os marcados como **obrigatório** precisam vir.

### `vendas`

| Campo | Tipo | |
|---|---|---|
| `date` | data ISO | **obrigatório** — emissão |
| `orderId` | texto | **obrigatório** |
| `orderType` | texto | `VENDA` ou `DEVOLUCAO VENDA` |
| `channel` | texto | canal |
| `clientId`, `clientName`, `clientCity` | texto | |
| `productId`, `productName` | texto | |
| `quantity` | número | |
| `totalOrig`, `costOrig`, `discountOrig` | número | na moeda do documento |
| `subgroupId`, `subgroupName` | texto | |
| `sellerId`, `sellerName` | texto | |
| `currencyId`, `currencyCode` | texto | `1`=R$, `2`=U$, `3`=G$ |
| `empresaId` | texto | matriz/filial |

### `orcamentos`

`orcamentoId` (**obrigatório**), `orcamentoData` (**obrigatório**),
`orcamentoConfirmado`, `orcamentoDataConfirmacao`, `clienteId`, `clienteNome`,
`vendedorId`, `vendedorNome`, `empresaId`, `moedaId`, `moedaSigla`,
`itemOrcamentoId`, `produtoId`, `produtoDescricao`, `produtoFabricante`,
`itemQuantidade`, `itemQuantidadeConfirmada`, `itemTotal`.

### `receber`

`documentId` (**obrigatório**), `issueDate` (**obrigatório**), `dueDate`,
`receivedDate`, `isPaid`, `entryType`, `amountOrig`, `clientId`, `clientName`,
`clientCity`, `sellerId`, `sellerName`, `currencyId`, `currencyCode`,
`empresaId`.

### `pagar`

`documentId` (**obrigatório**), `issueDate` (**obrigatório**), `dueDate`,
`paidDate`, `isPaid`, `entryType`, `amountOrig`, `supplierId`, `supplierName`,
`currencyId`, `currencyCode`, `empresaId`.

### `caixa`

`date` (**obrigatório**), `centroCustoId`, `centroCustoDescricao`,
`planoContaId`, `planoContaCodigo`, `planoContaDescricao`, `caixaId`,
`caixaDescricao`, `valorDocumento`, `moedaId`, `moedaSigla`, `empresaId`.

`valorDocumento` **positivo é entrada, negativo é saída** — é o sinal que separa
ingresso de gasto na DRE.

`planoContaCodigo` monta a hierarquia da DRE pelo ponto: `1`, `1.1`, `1.1.01`.
Uma conta-pai sem movimento próprio recebe a soma dos filhos.

### `estoque`

`productId` (**obrigatório**), `description`, `manufacturerCode`, `stock`,
`costTotalUSD`, `minStock`, `currencyId`, `currencyCode`, `empresaId`.

Sempre com `"periodo": "tudo"`. O mesmo produto pode aparecer mais de uma vez,
uma por empresa (matriz e filial).

---

## Ainda não coberto

- **Câmbio.** A tabela de cotações desenhada na seção 6.1 do PLANO-DADOS ainda
  não existe, e a conversão de moeda continua sendo feita com as taxas que o
  navegador manda. Quando entrar, o câmbio será mais um dataset deste mesmo
  endpoint.
- **Importação por CSV continua funcionando** e não conflita: os dois caminhos
  escrevem nas mesmas tabelas. Um cliente sem o ERP MGSIS segue importando
  arquivo.
