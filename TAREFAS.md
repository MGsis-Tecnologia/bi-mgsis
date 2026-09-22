# Tarefas pendentes

Backlog do que **já foi identificado mas ainda não foi pedido**. Não é um plano
de produto: é a lista das dívidas e pontas soltas que apareceram enquanto outra
coisa era feita, com o porquê de cada uma, pra ninguém ter que redescobrir o
raciocínio depois.

**Combinado:** ler este arquivo antes de começar qualquer tarefa, pra saber onde
estamos. Quando um item for feito, sair daqui e virar commit — e quando for
descartado, descer pra "Decididos a não fazer" com o motivo, em vez de sumir.

Última revisão: 2026-09-21.

> **Antes de tudo:** há uma implantação pendente das mudanças de 21/09/2026
> (marca, condição de pagamento, ingestão financeira, migrations e reenvio do
> histórico), que só foram aplicadas no banco de desenvolvimento. O checklist
> completo, com os comandos, está em [IMPLANTACAO-2026-09.md](IMPLANTACAO-2026-09.md).

---

## Segurança e autenticação

### 1. O master não tem limite de tentativas de login

A conta com mais poder no sistema é a única sem trava de força bruta. Em
[`src/app/api/auth/login/route.ts`](src/app/api/auth/login/route.ts), o caminho
do master compara a senha e segue; as 3 tentativas erradas e o `isActive` que
bloqueiam todo mundo vivem só na tabela `users` do tenant. A tabela
`master_users` ([`prisma/catalog/schema.prisma`](prisma/catalog/schema.prisma))
não tem nem `is_active` nem `failed_login_attempts` — e ela fica no catalog, que
é o banco de onde saem todas as empresas.

Pede duas colunas novas e migration no catalog. A parte a pensar é o desbloqueio:
o admin de empresa libera o usuário comum, mas quem libera o master? Provavelmente
só expiração por tempo, senão a trava vira um jeito de derrubar o sistema inteiro.

**Peso:** médio. É o item mais sério da lista.

### 2. Trocar a senha não derruba as outras sessões

O JWT é auto-contido, vale 30 dias e não existe lista de revogação: depois de
`PUT /api/settings/password`, quem estiver logado em outro dispositivo com o
cookie antigo continua dentro. Está comentado na rota
([`src/app/api/settings/password/route.ts`](src/app/api/settings/password/route.ts))
e avisado na tela, mas é exatamente o que alguém espera que a troca resolva.

O caminho seria versionar o token: um contador na conta, incrementado na troca e
conferido a cada request. O complicador é que a checagem natural fica no
[`src/proxy.ts`](src/proxy.ts), que roda no Edge e de propósito não acessa banco
— foi por isso que `allowedMenus` acabou embutido no próprio JWT. Ou a conferência
desce pras rotas, ou o proxy ganha uma consulta.

**Peso:** médio.

### 3. "Esqueci minha senha" não atende o master — adiado de propósito

`POST /api/auth/forgot-password` só consulta a tabela `users` do tenant, então
um pedido com o e-mail do master cai no `if (!user)`, responde `{ ok: true }` e
não manda nada. Silêncio, que é pior do que recusar.

Foi adiado com motivo, não esquecido: a conta SMTP é única do sistema e só o
master configura (`requireMaster()` em
[`src/app/api/settings/smtp/route.ts`](src/app/api/settings/smtp/route.ts)), então
recuperar master por e-mail é circular — a pessoa trancada pra fora é a mesma que
conserta o envio. O `UPDATE master_users` pelo psql continua sendo o fundo do poço
de qualquer jeito, e a tela de trocar a senha logado já cobre o caso do dia a dia.

Se um dia for feito: token com `kind` próprio (o `self_reset` de hoje aplica no
tenant), aplicado no catalog pelo `/ativar`.

**Peso:** baixo. Só vale se aparecer um segundo master, ou se o de hoje perder a
senha com o SMTP no ar.

---

## Infraestrutura

### 4. O rate limiter vive na memória do processo

[`src/lib/server/rate-limit.ts`](src/lib/server/rate-limit.ts) conta em um `Map`
local. Com mais de uma instância atrás do balanceador, cada uma conta o seu
quinhão e o limite efetivo vira N × o configurado. Já está comentado no arquivo.

Para a instalação atual — um container — está **correto**, e trocar agora seria
complicar de graça. Vira dívida de verdade no dia da primeira réplica; aí o
contador muda de casa (Redis, ou uma tabela no catalog).

Hoje dependem dele: `forgot-password` (3/h por conta, 10/h por IP) e
`settings/password` (5/15min por conta).

**Peso:** nenhum hoje; bloqueante no dia em que escalar.

---

## Limpeza

### 5. `eslint` inválido no next.config.ts

[`next.config.ts`](next.config.ts) tem `eslint: { ignoreDuringBuilds: true }`,
chave que o Next 16 não aceita mais. O `npm run type-check` acusa como erro e o
`next dev` avisa em toda subida. O `typescript: { ignoreBuildErrors: true }` ao
lado continua válido e tem motivo (poupa RAM no build do container, que dava OOM
em VPS enxuto) — é só a linha do eslint.

Antes de remover, confirmar como o Next 16 quer que o lint seja pulado no build,
pra não reintroduzir o passo pesado que a linha existia pra evitar.

**Peso:** pequeno, mas suja toda execução de type-check.

### 6. `SmtpConfig` órfão no schema do tenant

[`prisma/schema.prisma`](prisma/schema.prisma) ainda declara `model SmtpConfig`,
com o comentário de que é preenchido pelo master nas Configurações. Só que o
[`src/lib/server/mailer.ts`](src/lib/server/mailer.ts) usa `SystemSmtpConfig`, do
catalog — e o próprio arquivo explica por quê: a conta de envio é única do
sistema, e quando era por tenant o convite de uma empresa tentava usar um SMTP
que só o master havia preenchido. Nada em `src/` referencia `smtpConfig`.

Confirmar que a tabela está de fato vazia/sem uso e derrubar modelo e tabela numa
migration. Enquanto ficar, é uma armadilha pra quem for mexer em e-mail e achar
primeiro o modelo errado.

**Peso:** pequeno.

---

## Dados e ingestão

### 7. `receber` e `pagar` deveriam ir inteiros, não por período

A linha de um título **muda depois de emitida** — `is_paid`, `data_recebimento`
e `data_pagamento` só ganham valor quando alguém baixa o título —, mas o recorte
de envio é pela **emissão** ([INGESTAO-API.md](INGESTAO-API.md)) e o ciclo de
2 h reenvia só o mês corrente e o anterior. Um título emitido em março de 2024 e
pago hoje continua aparecendo em aberto no B.I.: a data que mudou não é a data
que decide o período, então nada manda aquele mês de volta. A recarga completa
mensal conserta, mas até ela rodar o relatório está errado sem nenhum sinal — é
diferente de vendas, onde a linha, depois de emitida, não muda sozinha.

A mudança é os dois virarem **foto**, como `estoque`: `periodo: "tudo"`, tabela
reescrita inteira a cada ciclo. Mexe em três lugares:

- [`src/lib/server/ingest/contrato.ts`](src/lib/server/ingest/contrato.ts): a
  `colunaData` de `receber` e `pagar` passa a `null`. A rota já cobra a coerência
  nos dois sentidos (`src/app/api/ingest/[dataset]/route.ts`, linhas 93–97):
  com `colunaData` preenchida, `"tudo"` é recusado.
- [`agente/mgsis-ingest.sh`](agente/mgsis-ingest.sh): tirar o
  `WHERE data_emissao ...` de `sql_receber`/`sql_pagar`, tirar os dois de
  `DATASETS_PERIODO` e enviá-los junto com estoque e câmbio.
- A documentação: o aviso de "período é pela emissão" e a tabela de quando
  enviar o quê, em [INGESTAO-API.md](INGESTAO-API.md).

O que precisa ser decidido antes é o **volume**. `pagar` são ~700 linhas/mês
(~42 mil em cinco anos, cabe folgado). `receber` são ~8.000/mês — cerca de 480
mil linhas, mais de três vezes o `MAX_LINHAS` de 150.000
([`src/lib/server/ingest/substituir.ts:20`](src/lib/server/ingest/substituir.ts#L20))
— e a foto não pode ser partida em pedaços sem perder a atomicidade, que é
justamente a razão de ser do `"tudo"`. Ou o limite sobe (medido: o estoque, 112
mil linhas e 21,7 MB, leva 8,4 s; 480 mil ficam longe dos 300 s, mas o corpo
passa dos 80 MB), ou se combina uma janela de retenção — só títulos emitidos nos
últimos N anos — e essa janela passa a ser a foto.

**Peso:** médio. Corrige dado errado em tela; depende de resolver o limite.

---

## Telas

### 9. Baixar em Excel os itens de uma marca vendida — confirmar com o cliente

Pedido: na tabela de vendas por marca, poder baixar os itens daquela marca.

O que travava este item — **o que é "marca"** — foi respondido: a migration
`20260921120000_sale_marca` trouxe `brand_id`/`brand_name` para `sale_items`, e o
eixo já está nas telas (aba Marcas no Comparativo, "Curva ABC por marca" em
Produtos). Marca é marca, não é o `subgrupo` nem o `manufacturer_code`.

Melhor ainda, os itens por marca já são calculados: a CTE `por_produto` em
[`produtos.ts:308`](src/lib/server/analytics/produtos.ts#L308) agrupa por
`brand_id, product_id` antes de somar por marca. O drill tem de onde sair sem
consulta nova.

Lembrar que os registros gravados antes do reenvio do histórico ficam com marca
vazia e aparecem como "Sem marca" (item 4 do
[IMPLANTACAO-2026-09.md](IMPLANTACAO-2026-09.md)).

A parte mecânica é a menor: `exportarExcel` já é genérico
([`src/lib/utils/export-excel.ts`](src/lib/utils/export-excel.ts)) e o
detalhamento de estoque já faz exatamente isso. O que falta resolver é se o
download sai do que está na tela ou de uma consulta nova — a tabela entrega só o agregado por
marca, mesmo com as linhas já existindo um passo antes, na CTE acima.

**Combinado: confirmar a ideia com o cliente antes de construir.**

**Peso:** pequeno — falta só decidir se o download é do que está na tela ou uma
consulta nova, e confirmar a ideia com o cliente.

### 10. Estoque → "Excesso" infla para item recém-comprado

Com o preset **Ano flutuante** (o mais usado), item que entrou no estoque há
pouco aparece como Excesso sem estar: estoque alto e poucas saídas, porque a
demanda é dividida por um tempo que o SKU não viveu.

A causa está em [`estoque.ts:349`](src/lib/server/analytics/estoque.ts#L349):

```sql
b.units_sold / ${diasFin}::double precision AS avg_daily_demand
```

`periodDays` é **um número só para a tela inteira**
([`calculaPeriodDays`](src/lib/server/analytics/estoque.ts#L164)) — os dias em
que *a loja* vendeu na janela, não os dias em que *aquele item* esteve
disponível. SKU que entrou há 30 dias e vendeu 1 unidade é dividido por ~356: a
demanda sai 12× menor, a cobertura 12× maior.

Detalhe que muda qual alavanca resolve: **saída 0 não cai em Excesso**. A regra 4
da cascata ([`estoque.ts:365`](src/lib/server/analytics/estoque.ts#L365)) manda
todo item sem venda para *Sem giro* e a cobertura fica `NULL`. O que polui o
filtro de Excesso é o caso de 1 a 3 saídas.

**Média ponderada pela última compra não resolve sozinha.** Ela ataca outro
problema — item cujo padrão de venda mudou. O item novo continua com meses
zerados no começo da janela, e esses zeros continuam puxando a demanda para
baixo. O que resolve é cortar a janela, não pesá-la.

**Caminho proposto — as duas juntas, porque uma corrige o exagero da outra:**

- **Janela de exposição por SKU.** Trocar o `periodDays` global por
  `dias_expostos = do max(início do período, primeira entrada do SKU) até o fim`.
  A primeira entrada sai de `MIN(pedido_data)` em `compra_items` (já tem índice
  em `produto_id` e `pedido_data`), com cascata de fallback: sem compra
  registrada → `MIN(s.date)` das vendas do próprio SKU; sem nenhum dos dois → o
  início do período, que é o comportamento de hoje. Encaixa como mais uma tabela
  temporária no pipeline que já existe.
- **Piso de confiança.** Sozinha, a exposição inverte o erro: com 1 venda em 30
  dias o item projeta 12/ano e pode virar **Em risco**, errado na direção oposta.
  Então menos de ~3 vendas ou ~60 dias de exposição não recebe Excesso nem
  Risco — recebe um status novo, *Recente* / *Sem histórico*. É a mesma ideia do
  "Fora de análise" que já existe para venda zero, estendida para "amostra
  pequena demais para julgar".

**Dependências antes de qualquer coisa que use compras:** o `instalar-views.sql`
mudou o `bi_compras` para `compra_data_lancamento` + `compra_status_estoque =
true` — que é exatamente o "entrou no estoque" de que essa conta precisa, mas
significa que `compra_items` só serve **depois do reenvio das compras** (item 4
do [IMPLANTACAO-2026-09.md](IMPLANTACAO-2026-09.md)). E o histórico de compras só
vai até onde a ingestão foi: SKU comprado antes disso e nunca recomprado não tem
linha, por isso a cascata de fallback não é opcional.

Descartadas no caminho: mediana mensal por SKU (resistente a pico e a zero, mas
agregação mensal sobre 76 mil SKUs por um ganho que exposição + piso já
entregam) e guarda de idade crua — "item com menos de 180 dias nunca é Excesso"
— que funciona em uma linha, mas é grosseira e não melhora a cobertura exibida.

**Peso:** médio. Muda número já exibido (cobertura, status, donut), então pede
conferência contra o ERP depois — e um status novo mexe na legenda e no filtro.

---

## Decididos a não fazer

Nada aqui ainda. Item descartado desce pra cá com o motivo — serve pra não
reabrirmos a mesma discussão daqui a três meses.
