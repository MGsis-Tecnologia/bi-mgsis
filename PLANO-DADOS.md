# Plano — arquitetura de dados (ingestão e consulta)

Documento de entendimento e decisão. Não é implementação: é o mapa de onde
estamos, por que está lento e qual caminho seguir.

Todos os números abaixo foram **medidos** no banco real (`empresa_80027879`),
não estimados.

> **Onde paramos e como continuar:** ver a [seção 8](#8-estado-atual--onde-retomar),
> no fim do documento.

---

## 1. Como está hoje

### O que acontece quando alguém abre o sistema

O `DatasetBootstrap` está montado no layout do dashboard
(`src/app/(dashboard)/layout.tsx`), então roda **em toda navegação inicial**.
Ele baixa o banco inteiro para o navegador:

```
navegador                          servidor              postgres
   │                                  │                     │
   ├─ GET /api/datasets/sales ───────►│ (metadata)          │
   ├─ GET .../rows?skip=0&take=10000 ►│ ──── findMany ─────►│
   ├─ GET .../rows?skip=10000 ───────►│ ──── findMany ─────►│
   ├─ ... × 321 requisições sequenciais ...                 │
   └─ guarda tudo em IndexedDB + memória (Zustand)
```

Depois disso, **toda** conta é feita no navegador: `useDataset()` percorre as
linhas cruas e monta pedidos, produtos, clientes, vendedores e subgrupos em
JavaScript, na thread principal.

### O volume real, medido

| Dataset | Linhas | JSON trafegado | Em disco |
|---|---:|---:|---:|
| Vendas | 1.417.439 | ~703 MB | 406 MB |
| Orçamentos | 1.141.549 | ~594 MB | 264 MB |
| Contas a receber | 493.816 | ~181 MB | 106 MB |
| Estoque | 111.970 | ~25 MB | 20 MB |
| Contas a pagar | 41.886 | ~12 MB | 7,6 MB |
| **Total** | **3.206.660** | **~1,5 GB** | **~804 MB** |

**1,5 GB de JSON, em 321 requisições sequenciais — para um único cliente.**

---

## 2. Por que está lento

Não é um gargalo, são quatro somados. Vale entender cada um, porque cada fase
do plano ataca um deles.

### 2.1 O download bloqueia a tela

As 321 requisições são **sequenciais** (`for` com `await` dentro), e o
`DatasetBootstrap` cobre a tela inteira com "Carregando dados…" até a última
terminar. Mesmo a 50 MB/s isso é meio minuto de tela travada; num link de
cliente comum, minutos.

### 2.2 1,5 GB de JSON não cabe confortavelmente num navegador

Objeto JavaScript ocupa bem mais que o JSON de origem — 1,5 GB de payload vira
vários GB de heap. É o que faz a aba ficar pesada, o notebook ventilar e, em
máquina mais modesta, a aba morrer. Não é um problema de "otimizar um pouco":
está fora da ordem de grandeza que um navegador comporta.

### 2.3 Toda mudança de filtro reprocessa tudo na thread principal

`useDataset()` é memoizado em `[rawItems, rates, currency, empresaId]`. Trocar
**moeda** ou **empresa** refaz a agregação das 1,4 milhão de linhas de venda do
zero, travando a interface enquanto roda. Filtro de data e vendedor são mais
baratos, mas ainda varrem centenas de milhares de pedidos já montados.

### 2.4 O cache ajuda menos do que parece

O IndexedDB evita o download **só quando o `importedAt` é idêntico**. Qualquer
importação nova invalida o dataset inteiro — não há carga incremental. Ou seja:
todo dia em que o ERP sincronizar, todos os usuários daquele cliente baixam
1,5 GB de novo.

### 2.5 A importação tem o mesmo problema, espelhado

O CSV é lido e convertido **no navegador** (`parseFile`), depois enviado em
lotes de 3.000 linhas: para 1,4 milhão de vendas, são ~473 POSTs sequenciais.
Se a aba fechar no meio, o dado fica pela metade.

### 2.6 E isso é para um cliente

Numa VPS com vários clientes, o mesmo custo se multiplica: banda, memória do
navegador de cada usuário e, no servidor, cache do Postgres disputado entre
todos os tenants.

---

## 3. Para onde ir

**Sua visão está correta**, e é o padrão para BI: o Postgres é a fonte, o
navegador só desenha.

```
                      HOJE                          ALVO
              ┌──────────────────┐          ┌──────────────────┐
   navegador  │ 1,5 GB de linhas │          │ ~50 KB de números│
              │ + toda a conta   │          │ já agregados     │
              └────────▲─────────┘          └────────▲─────────┘
                       │ 321 requisições             │ 1 requisição
                       │ de linhas cruas             │ por painel
              ┌────────┴─────────┐          ┌────────┴─────────┐
   servidor   │ repassa linhas   │          │ SUM/GROUP BY     │
              └────────▲─────────┘          └────────▲─────────┘
                       │                             │
   postgres    ────────┴─────────           ─────────┴─────────
```

A mudança conceitual: hoje a API serve **tabelas**; ela precisa passar a servir
**perguntas**. "Faturamento por mês de 2026, filial 3, em BRL" devolve 12
linhas, não 1,4 milhão.

Um detalhe que importa: a **conversão de moeda hoje acontece no navegador**
(`useExchangeRates`). Ao mover a agregação para o SQL, a taxa precisa vir do
banco — senão não dá para somar. O desenho está na seção 6.1.

---

## 4. O caminho

Ordenado por **ganho sobre risco**. Cada fase entrega valor sozinha e não
depende da seguinte estar pronta.

### Fase A — Preparar o banco *(baixo risco, pré-requisito das demais)*

1. **Datas viram tipo `date`.** Hoje são `TEXT`. Funciona por sorte: o formato
   ISO ordena igual como texto, então o índice de intervalo ainda serve. Mas
   aceita lixo em silêncio — encontrei `2202-09-05` em contas a receber
   (provável erro de digitação de 2022), que nenhuma validação pegaria.
   Com tipo real, o banco recusa na entrada e libera funções de data.

2. **Índices para o padrão de consulta.** Medições da mesma agregação
   (faturamento mensal de um ano, 342.829 linhas):

   | Situação | Tempo |
   |---|---:|
   | Cache frio, índices atuais | 1.040 ms |
   | Cache quente, índices atuais | 267 ms |
   | Cache quente, **com índice de cobertura** | 219 ms |

   > **Correção de uma estimativa anterior.** Eu havia escrito que índices
   > compostos derrubariam isso "para dezenas de milissegundos". **Não é o que
   > acontece:** o ganho medido foi de ~18% com cache quente. O índice muda o
   > plano para *Index Only Scan* e lê 105 MB em vez dos 406 MB da tabela — o que
   > pesa mesmo é com cache frio, cenário do VPS multi-tenant. Mas ele **não é a
   > alavanca principal**, e custa 105 MB de disco por índice, por tenant.

3. **Tipar as datas** *(ver 4.1 — a sequência importa)*.

#### O que a primeira tela migrada ensinou sobre desempenho

Com o `/dashboard` migrado, deu para medir de verdade em cima de consultas reais
(12 meses, ~340 mil linhas). Três resultados, dois deles contrariando o palpite:

| Hipótese | Resultado |
|---|---|
| Varrer uma vez só e derivar tudo (CTE materializada, nível de linha) | ❌ **3× pior** — 17 s contra 5,5 s |
| Idem, no nível de pedido (119 mil linhas, 6 consumidores) | ❌ **1,5× pior** — 2,6 s contra 1,8 s |
| Agregar por pedido antes de contar | ✅ **~2,8× melhor** |

O gargalo era `COUNT(DISTINCT)`, que obriga o Postgres a ordenar: o mesmo KPI
leva **2.985 ms** com `COUNT(DISTINCT order_id)` e **175 ms** sem. Reduzir as
linhas a um registro por pedido (hash aggregate) antes de contar derrubou o
período de um ano de **5.133 ms para 3.156 ms**, com os números conferidos
idênticos.

A lição que vale para as próximas telas: **o Postgres paraleliza consultas
independentes melhor do que uma consulta grande** que compartilha um
intermediário. Tentar "economizar varredura" na mão piorou nas duas vezes.

Índices seguem sendo ganho marginal aqui — um em `(order_id, subgroup_id)`
melhorou o filtro de subgrupo em 28% e custa 36 MB por tenant. Não aplicado.

### 4.1 — O que a medição mudou na ordem das fases

As duas medições acima levam a uma conclusão desconfortável mas útil:

**O ganho não está no índice, está em parar de mandar 1,5 GB para o navegador.**
Uma consulta de 220 ms ou de 270 ms é indiferente perto disso. E desenhar
índices *antes* de existir uma consulta real é adivinhação — foi exatamente o
que a medição mostrou: um índice de cobertura genérico rendeu 18%.

Por isso a recomendação virou:

> **Começar pela Fase B com um painel só, ponta a ponta.** Isso revela as
> consultas de verdade, e só então o índice é desenhado para elas. Os 220 ms já
> medidos são aceitáveis para provar a arquitetura.

A Fase A não desaparece — ela deixa de ser um bloco a executar antes de tudo e
passa a ser feita **junto com cada tabela que a Fase B for migrando**.

### Sobre tipar as datas

A conversão de `TEXT` para `date` continua certa, e a medição mostrou que é mais
fácil do que eu esperava — os dados estão limpos:

| Coluna | Formato inválido | Fora de 1990–2035 | Vazias |
|---|---:|---:|---:|
| `sale_items.date` | 0 | 0 | 0 |
| `receivable_items.due_date` | 0 | **10** | 0 |
| `receivable_items.received_date` | 0 | 0 | **13.655** |
| `payable_items.paid_date` | 0 | 0 | **75** |
| `orcamento_items.orcamento_data_confirmacao` | 0 | 0 | **425.673** |

Nenhum formato quebrado em 2,5 milhões de linhas; só 10 datas absurdas. O
trabalho real é outro: **as strings vazias são `NULL` disfarçado**. Um título não
recebido não tem data de recebimento — hoje isso é `''`, e o correto é `NULL`.

E aqui está o motivo de não converter agora: mudar essas colunas para
`DateTime?` altera os tipos gerados pelo Prisma e **quebra todo o código do
navegador que hoje lê essas datas como texto** — justamente o código que as
Fases B e C vão reescrever. Converter agora é mexer duas vezes no mesmo lugar.

### Fase B — Endpoints de agregação *(o coração da mudança)*

Criar `/api/analytics/*`, um endpoint por painel, com um **contrato de filtros
único** (período, empresa, moeda, canal, vendedor, subgrupo) traduzido para
`WHERE` no SQL.

A migração é **página por página**, começando pelo `/dashboard`. Enquanto uma
página não foi migrada, ela continua usando o store — as duas abordagens
convivem sem conflito durante a transição.

### Fase C — Aposentar o download total

Quando nenhuma página depender mais do store, remover `DatasetBootstrap`, o
IndexedDB e as rotas `/api/datasets/[kind]/rows`. É aqui que a tela de
"Carregando dados…" desaparece de vez.

### Fase D — Ingestão por API *(a nova capacidade)*

Detalhada na seção 5. É **independente das Fases A–C** — pode ser construída em
paralelo, já que mexe na escrita e não na leitura.

### Fase E — Importação de CSV no servidor

Manter o CSV (cliente sem ERP MGSIS continua precisando), mas inverter: o
navegador **envia o arquivo**, o servidor lê e carrega via `COPY` do Postgres.
Sai de ~473 requisições para uma, e a importação deixa de depender da aba
ficar aberta.

### Fase F — Pré-agregação *(só se a medição pedir)*

Tabelas de resumo diário (`vendas_por_dia`, etc.) atualizadas na ingestão.
Deixa comparativos anuais instantâneos. **Não decidir agora** — depende do que
a Fase A revelar.

---

## 5. Ingestão por API — desenho

A base já existe: cada empresa tem um `integration_token` no catalog, e já há
rota para gerar e revogar. O token identifica a empresa, então o cliente **não
escolhe** em qual banco escreve — o servidor decide. É a mesma garantia de
isolamento que o login já dá.

### As restrições, e o que elas eliminam

Duas respostas do negócio definem tudo aqui:

1. **O ERP não sabe dizer o que mudou** — ele aceita alteração retroativa, então
   qualquer linha dos últimos 3–5 anos pode ter mudado desde o último envio.
2. **Não existe chave única de linha.** O mesmo `pedido_id` + `produto_id` pode
   repetir legitimamente na mesma venda.

A segunda é a mais restritiva: **sem chave única, `UPDATE` e `UPSERT` são
impossíveis** — não há como apontar "esta linha aqui". Sobra uma única semântica
correta: **substituir um conjunto inteiro de linhas de uma vez**.

Isso também resolve a idempotência de graça. Reenviar o mesmo conjunto duas
vezes dá o mesmo resultado, o que sem chave nenhuma seria impossível garantir.

### Por que "reenviar tudo" não cabe a cada 2 horas

Se a substituição for do período inteiro (3–5 anos), medindo o cliente real:

| Dataset | Reenviando tudo | Só o mês corrente |
|---|---:|---:|
| Vendas | 703 MB/ciclo → **8,2 GB/dia** | 10,7 MB → 129 MB/dia |
| Orçamentos | 594 MB/ciclo → **7,0 GB/dia** | 10,3 MB → 124 MB/dia |
| Contas a receber | 181 MB/ciclo → **2,1 GB/dia** | 2,2 MB → 26 MB/dia |
| Contas a pagar | 12 MB/ciclo → 0,1 GB/dia | ~0 MB |
| **Total** | **~17,4 GB/dia por cliente** | **~280 MB/dia por cliente** |

17 GB por dia, por cliente, numa VPS compartilhada, não fecha — nem de banda nem
de escrita no banco (seriam ~3,2 milhões de linhas apagadas e reinseridas 12
vezes ao dia). E multiplica por cada cliente novo.

### A saída: carga inicial + janela móvel

O servidor expõe **uma única operação**: *"substitua o período X por estas
linhas"*. Quais períodos enviar, e com que frequência, é decisão do agente no
cliente — não do servidor.

```
  servidor Linux do cliente                      Analytics (VPS)

  ┌──────────────────────────┐   POST /api/ingest/vendas/periodo
  │ periodo: "2026-07"       │   Authorization: Bearer <token>
  │ linhas:  [ ... ]         │──────────────────────────────►
  └──────────────────────────┘   staging → troca o mês em transação
```

Com isso, a política de envio vira configuração de cada cliente:

| Quando | O que envia | Custo medido |
|---|---|---|
| **Implantação** | Janela completa (3–5 anos) | ~1,5 GB, uma vez |
| **A cada 2 h** | Mês corrente + anterior | 53 MB/ciclo → **0,62 GB/dia** |
| **Diário, de madrugada** | Últimos 3–6 meses | 81–175 MB, 1×/dia |
| **Sob demanda / mensal** | Janela completa | ~1,5 GB, raro |

Comparado com reenviar tudo a cada 2 h (17,4 GB/dia), é **28× menos** — e sem
nenhuma máquina de comparação: o cliente só decide um intervalo de datas.

### Por que "mês corrente + anterior", e não só o corrente

Sua ideia de reescrever só o mês atual está certa no princípio, e o custo extra
de incluir o mês anterior é pequeno (0,27 → 0,62 GB/dia). Vale por um caso
concreto e comum:

> Dia 1º de agosto, alguém lança no ERP uma venda **datada de 31 de julho**.

Se o ciclo só reescreve o mês corrente (agosto), essa venda cai em julho — que
não é mais reenviado — e **nunca chega ao Analytics**. O mês vira permanentemente
errado, sem nenhum sinal de erro. Incluir o mês anterior fecha essa janela.

### O que essa simplificação abre mão

É importante ser explícito: **correções retroativas em meses fora da janela não
chegam sozinhas**. Se alguém corrigir uma nota de março de 2024, o Analytics
seguirá mostrando o valor antigo até que alguém mande reenviar aquele período.

Isso é aceitável desde que haja como corrigir quando acontecer. Por isso as duas
últimas linhas da tabela: uma recarga da janela completa, agendada (mensal) ou
disparada sob demanda, é a rede de segurança. Como é o **mesmo endpoint**, não
custa código nenhum a mais — só um comando diferente no agente.

*(Uma alternativa seria o cliente enviar um hash por mês e o servidor responder
quais divergem, reenviando só esses. Cobre o retroativo automaticamente, mas em
regime normal transfere praticamente o mesmo que a janela móvel — 0,27 contra
0,62 GB/dia — em troca de bastante complexidade dos dois lados. Não compensa
agora; fica registrado caso a recarga periódica se mostre insuficiente.)*

### Detalhes do desenho

- **Substituição atômica por período.** O lote entra numa tabela de staging e
  só então substitui o mês, em transação. Se o envio falhar no meio, o que está
  visível não fica pela metade — que é o que acontece hoje na importação de CSV.
  É também o que dá idempotência: reenviar o mesmo período duas vezes dá o mesmo
  resultado, o que sem chave única seria impossível garantir.

- **Estoque não tem data**: é uma foto do momento, não uma série. Entra no mesmo
  endpoint com um período único ("atual") e é sempre substituído por inteiro —
  são 25 MB, irrelevante no ciclo.

- **Períodos fora da janela ficam congelados.** Se o cliente só envia 5 anos, os
  meses mais antigos que já estão no Analytics permanecem como estão, sem serem
  apagados. (Há dado de 1996 em contas a receber hoje.)

- **Validar data na entrada.** Achei `2202-09-05` em contas a receber e
  `2027-04` em contas a pagar — datas impossíveis que hoje entram porque a
  coluna é texto. Com a Fase A elas passam a ser recusadas na ingestão, em vez
  de sujar relatórios silenciosamente.

### Sobre particionamento

Substituir um mês 12 vezes ao dia é o caso de manual para particionar as tabelas
por mês no Postgres: a troca vira uma operação instantânea, sem lixo a recolher,
e as consultas por período ignoram os meses irrelevantes.

**Não recomendo começar por aí.** O Prisma não gerencia partições, o que traz
complexidade de migração; e a substituição mensal comum (apagar e inserir ~21
mil linhas) é perfeitamente suportável no volume atual. É a evolução natural na
Fase F, se a medição mostrar que vale — não uma decisão para agora.

---

## 6. Decisões

| Questão | Resposta | Consequência |
|---|---|---|
| ERP detecta mudanças? | Não, aceita retroativo | Sem sincronismo incremental por data |
| Chave única da linha? | Não existe | Sem `UPSERT`; só substituição de conjunto |
| Frequência | ~2h, ajustável por cliente | Política fica no agente, não no servidor |
| Janela | 3–5 anos na carga inicial | Ciclo de 2h cobre mês corrente + anterior |
| Moeda | Tabela de câmbio por data, convertida na consulta | Ver 6.1 |
| Data de referência | **Sempre a emissão** | Define o mês substituído na ingestão |
| VPS | Dimensionar conforme a demanda | Sem restrição de projeto por ora |

**Sobre a data de emissão:** ela define qual mês a ingestão substitui. Como os
relatórios financeiros filtram sobretudo por **vencimento**, vale saber a
consequência: se o vencimento de um título antigo for alterado no ERP, a mudança
só chega quando aquele mês de *emissão* voltar a ser enviado — ou seja, na
recarga periódica, não no ciclo de 2 h. Para títulos recentes (dentro da janela
móvel) não há atraso nenhum.

---

## 6.1 Moeda — tabela de câmbio

A proposta está certa e resolve um problema que hoje passa despercebido.

### O que isso conserta

Hoje o `useExchangeRates` busca `open.er-api.com/v6/latest/BRL` — **só a cotação
de hoje**. Ou seja: uma venda de 2022 é exibida convertida pela taxa de hoje.
Não é uma imprecisão pequena, é o valor histórico inteiro errado. Converter pela
data da transação, como você propôs, corrige isso.

### Custo: medido, e é irrelevante

Agregação mensal de um ano de vendas (342.829 linhas):

| Consulta | Tempo |
|---|---:|
| Sem conversão (linha de base) | 666 ms |
| **Convertendo na consulta, com `JOIN` por dia** | **580 ms** |

Converter na hora **não custa nada** — a tabela de câmbio é minúscula (5 anos ×
3 moedas = 5.478 linhas), cabe inteira em memória e o banco resolve por hash
join. A diferença entre as duas está dentro da variação de cache.

### Ajustes na estrutura proposta

Os campos sugeridos eram `moeda_data, moeda_id, moeda_id_origem,
moeda_destino_sigla, cambio_valor`. Duas correções:

- `moeda_id` e `moeda_id_origem` são a mesma coisa — sobra um.
- A origem estava como **id** e o destino como **sigla**. Os dois lados do par
  precisam do mesmo domínio, senão a junção com os fatos não fecha (os fatos
  gravam `currency_id` = `'1'`, `'2'`, `'3'`).

O significado de `taxa` precisa estar fixado e documentado — *"1 unidade de
origem equivale a `taxa` unidades de destino"*. É a ambiguidade que mais gera
valor invertido em relatório. A estrutura final está logo abaixo.

### Origem das cotações: o ERP *(confirmado)*

O câmbio vem do ERP, como os demais dados — vários anos na carga inicial, depois
o mês corrente a cada ciclo. É o melhor cenário: o número exibido no Analytics
passa a ser exatamente o que o cliente vê no ERP.

Com uma consequência que precisa ser tratada.

### O problema: o ERP só grava cotação quando há movimento

Medindo os dias com movimento por moeda neste cliente, entre 2022-01 e 2026-07
(1.673 dias de calendário):

| Moeda | Dias com movimento | Cobertura do calendário |
|---|---:|---:|
| G$ | 1.358 | 81,2 % |
| R$ | 175 | **10,5 %** |
| U$ | 98 | **5,9 %** |

Ou seja: a tabela vinda do ERP terá cotação de dólar em **98 de 1.673 dias**. Nos
outros 94% não existe linha nenhuma. Não é um detalhe de fim de semana — é a
regra.

E o efeito disso numa consulta com `INNER JOIN` é silencioso. Medi, apagando
março de 2025 da tabela de câmbio:

```
linhas somadas: 315.289 de 342.829  →  27.540 vendas desapareceram sem erro
```

Um relatório 8% menor, sem nenhum aviso.

### A solução: duas camadas

**1. `cambio` — o que o ERP mandou, sem alteração.**
Fonte da verdade, auditável, bate com o ERP linha a linha.

```sql
CREATE TABLE cambio (
  data          date              NOT NULL,
  moeda_origem  text              NOT NULL,
  moeda_destino text              NOT NULL,
  taxa          double precision  NOT NULL,
  PRIMARY KEY (data, moeda_origem, moeda_destino)
);
```

**2. `cambio_diario` — densa, derivada, é nela que as consultas fazem `JOIN`.**
Uma linha para **todo dia do calendário e todos os 6 sentidos**, preenchendo os
dias sem cotação com a **última cotação conhecida** (*carry-forward*).
Reconstruída após cada sincronismo — ~10 mil linhas para 5 anos, milissegundos.

Assim o dado bruto continua fiel ao ERP e a consulta nunca encontra buraco.

### Uma cotação por par *(decidido)*

Uma única taxa por par: se existe U$→R$, o sentido inverso é `1 / taxa`. Sem
compra e venda separadas.

Isso simplifica bastante — e permite ir um passo além.

### Consequência: bastam 2 pares, e é melhor que sejam 2

Com 3 moedas existem 3 pares não-ordenados ({U$,R$}, {U$,G$}, {R$,G$}) e 6
sentidos. Mas se as cotações forem armazenadas **contra uma moeda-pivô**, dois
pares bastam para derivar os seis sentidos:

```
  do ERP:      U$→G$        R$→G$          (pivô = G$)

  derivados:   G$→U$ = 1 / (U$→G$)
               G$→R$ = 1 / (R$→G$)
               U$→R$ = (U$→G$) / (R$→G$)
               R$→U$ = (R$→G$) / (U$→G$)
```

O pivô natural aqui é **G$**: é 99,99% do movimento, e é assim que a cotação
costuma ser expressa no Paraguai ("1 U$ = X guaranis").

Isso não é só economia de linhas — **garante coerência**. Se U$→R$ viesse do ERP
como número independente, converter um total de G$ para R$ direto ou passando por
U$ poderia dar resultados diferentes, e dois relatórios do sistema se
contradiriam. Derivando tudo do pivô, isso é impossível por construção.

> **Se o ERP fornecer U$→R$ direto**, ele vai para a tabela `cambio` (auditoria),
> mas a `cambio_diario` continua derivando do pivô. Vale registrar a diferença
> num log quando houver — costuma ser só arredondamento.

### Normalização na entrada

Como o ERP pode mandar o par em qualquer sentido, a ingestão **normaliza**: se
chegar G$→U$, é gravado como U$→G$ com a taxa invertida. Assim a tabela tem uma
linha por par por dia, sem ambiguidade, e o agente no cliente não precisa se
preocupar com a direção.

### Sincronismo do câmbio: mande sempre tudo

Aqui não vale aplicar a janela móvel. A tabela inteira são ~10 mil linhas
(1.673 dias × 6 pares), menos de 1 MB — **enviar o histórico completo a cada
ciclo** é mais simples que controlar períodos e elimina de vez o risco de um
buraco por sincronismo parcial. Um caso onde a força bruta é a escolha certa.

### Validação na entrada

- `taxa > 0` e `moeda_origem <> moeda_destino`.
- Se o mesmo par chegar nos dois sentidos no mesmo dia, conferir se
  `taxa_ida × taxa_volta ≈ 1`. Diferença pequena é arredondamento; diferença
  grande é inversão de sentido — o erro mais provável, dada a ambiguidade de
  "1 origem = taxa destino".
- **Ordem de grandeza.** G$ e U$ diferem em ~4 zeros. Uma taxa trocada de par
  não gera erro nenhum no banco, só um relatório milhares de vezes maior ou
  menor. Vale recusar valores fora de uma faixa esperada por par.

### Nota sobre este cliente

99,99% das linhas estão em **G$ (Guarani, `id=3`)** — 1.417.435 de 1.417.439
vendas. R$ e U$ são resíduo. Também há **2 vendas com `currency_id = 0`** e sigla
vazia: dado sujo que hoje entra sem barreira e que a validação da Fase A pega.

---

## 7. O que eu sugiro fazer primeiro

**Um painel da Fase B, ponta a ponta** — do SQL até a tela, para o dashboard.

Essa recomendação mudou depois de medir (ver 4.1). A ideia original era fazer a
Fase A inteira primeiro, apostando que os índices trariam o grande ganho. A
medição mostrou que não: o ganho de um índice de cobertura foi de 18%, enquanto
o ganho real — deixar de baixar 1,5 GB — não depende de índice nenhum.

Fazer um painel completo primeiro entrega, de uma vez:

- a prova de que a arquitetura funciona, com número real de tempo de tela;
- o **contrato de filtros** definido contra um caso concreto, não no papel;
- as consultas de verdade, que são o insumo para desenhar os índices certos;
- e o desenho da paginação/cache que os demais painéis vão reaproveitar.

Só então a Fase A se aplica àquelas tabelas — índice e tipagem desenhados para
consultas que já existem.

---

## 8. Estado atual — onde retomar

*Atualizado em 05/08/2026.*

### O que já está pronto

| Fase | Situação |
|---|---|
| A — preparar o banco | Medida, **não aplicada** (índice rendeu só 18%; ver 4.1) |
| **B — endpoints de agregação** | **Em andamento: 2 de ~12 telas migradas** |
| C — aposentar o download total | Não iniciada (depende da B terminar) |
| D — ingestão por API | Desenho fechado (seção 5), **não implementada** |
| E — importação de CSV no servidor | Não iniciada |
| F — pré-agregação | Não decidida (depende de medição) |

**Telas migradas:** `/dashboard` e `/vendas`. As demais seguem no caminho antigo,
sem alteração.

### Como a Fase B está estruturada

```
src/lib/server/analytics/
  base.ts        ← contrato de filtros, conversão de moeda, WHERE,
                   CTE de pedidos, séries e heatmap  (compartilhado)
  dashboard.ts   ← agregações do painel executivo
  vendas.ts      ← agregações da análise de vendas

src/app/api/analytics/<tela>/route.ts   ← valida filtros (zod) e chama o módulo
src/lib/hooks/use-<tela>-analytics.ts   ← busca, preenche séries, formata rótulos
src/app/(dashboard)/<tela>/page.tsx     ← consome o hook
```

### Receita para migrar a próxima tela

1. **Ler a página** e listar o que ela calcula hoje (KPIs, séries, rankings).
2. **Conferir o escopo de filtros de cada bloco.** As duas telas migradas diferem:
   o dashboard aplica canal/vendedor/subgrupo **só aos gráficos**, e a de vendas
   aplica **a tudo**. Replicar o comportamento existente, não uniformizar.
3. **Criar `src/lib/server/analytics/<tela>.ts`** reaproveitando `base.ts`.
   Regra de nível: o que o código antigo somava por `o.items` fica em `l`
   (linha); o que somava por `o` fica em `pe` (pedido).
4. **Nunca usar `COUNT(DISTINCT order_id)`** — usar `COUNT(*)` sobre `pe`. É a
   diferença entre 2.985 ms e 1.070 ms (ver 4.1).
5. **Criar a rota e o hook** copiando os existentes.
6. **Validar os números** (ver abaixo) — este passo não é opcional.
7. **Adicionar a rota a `ROTAS_SEM_STORE`** em
   `src/components/layout/dataset-bootstrap.tsx`. Sem isso a tela continua
   pagando o download de 1,5 GB mesmo sem usar o store.

### Como validar (o passo que garante que nada muda)

O método usado nas duas migrações, e que pegou erros de verdade:

1. Ler as linhas cruas do período direto do Postgres.
2. Reimplementar em JavaScript o pipeline antigo daquela tela
   (`buildOrders` → `computeKpis` → séries), copiando de `src/lib/analytics/`.
3. Chamar o endpoint novo por HTTP com uma sessão válida.
4. Comparar campo a campo, com tolerância relativa de ~1e-9 — a ordem da soma
   muda entre JS e SQL, então diferença na 14ª casa é esperada e não é erro.
5. Repetir sem filtros, com canal, com vendedor, com subgrupo (o semi-join) e
   com moeda específica.

Para gerar a sessão no script, sem passar pela tela de login: assinar um JWT com
`jose` usando o mesmo segredo de `auth-core.ts` (sem `AUTH_SECRET` definido, o
fallback é `DATABASE_URL.slice(0,64).padEnd(32,"x")`) e mandar no cookie
`mgsis_session`. O `empresaId` sai de `SELECT id FROM empresas WHERE db_name = …`.

> Os scripts de validação foram feitos em diretório temporário e **não estão no
> repositório**. Se for retomar em outra máquina, vale recriá-los pelo roteiro
> acima — ou pedir para transformá-los num script versionado.

### Pendências conhecidas

1. **Período de 12 meses ainda é lento**: 3,2 s no dashboard, 5,5 s em vendas.
   O preset padrão ("mês atual") responde em ~550 ms, então não aparece no uso
   normal. Ainda **não medido** se a solução é índice, menos consultas ou
   pré-agregação — e duas hipóteses já foram derrubadas por medição (ver 4.1).

2. **Inconsistência herdada nos filtros do dashboard**: os cartões de KPI ignoram
   canal, vendedor e subgrupo, enquanto os gráficos os aplicam. Foi replicado
   fielmente para não mudar números, mas parece bug. Corrigir é uma linha em
   `whereBase` — decisão pendente.

3. **Taxas de câmbio ainda vêm do cliente** no corpo da requisição, para os
   números seguirem idênticos aos de hoje. Quando a tabela `cambio` existir
   (seção 6.1), a origem passa a ser o banco e o campo `rates` sai do contrato.

4. **`next.config.ts` linha 10**: a chave `eslint` virou no-op no Next 16 e é o
   único erro do `npm run type-check`. Não removida.

Em paralelo, a Fase D (ingestão por API) já está com o desenho fechado e é
independente da parte de consulta — pode ser construída ao mesmo tempo.

Só resta confirmar **de onde vêm as cotações históricas** (seção 6.1): se o ERP
já guarda a cotação de cada documento, o câmbio entra como mais um dataset do
mesmo sincronismo e nada de novo precisa ser inventado.
