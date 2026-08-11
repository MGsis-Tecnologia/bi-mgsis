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

*Atualizado em 11/08/2026.*

### O que já está pronto

| Fase | Situação |
|---|---|
| A — preparar o banco | Medida, **não aplicada** (índice rendeu só 18%; ver 4.1) |
| **B — endpoints de agregação** | **Concluída: todas as telas de leitura migradas** |
| C — aposentar o download total | Não iniciada (depende da B terminar) |
| **D — ingestão por API** | **Implementada e testada** — ver [INGESTAO-API.md](INGESTAO-API.md) |
| E — importação de CSV no servidor | Não iniciada |
| F — pré-agregação | Não decidida (depende de medição) |

**Telas migradas:** `/dashboard`, `/vendas`, `/produtos`, `/clientes`,
`/vendedores`, `/comparativo`, `/prospeccao`, `/financeiro/receber`,
`/financeiro/pagar`, `/financeiro/dre` e `/estoque`.

**Falta:** `/importacao`, que usa o store para gravar, não para ler — cai na
fase E, não na B. Enquanto ela não for migrada, `DatasetBootstrap` continua
existindo só para essa rota.

Payload no preset padrão:

| Tela | Payload | Servidor |
|---|---:|---:|
| `/dashboard` | 22,2 KB | ~0,3 s |
| `/vendas` | 18,1 KB | ~0,3 s |
| `/produtos` | 51,5 KB | 0,6–2,4 s |
| `/clientes` | 10,0 KB | ~0,8 s |
| `/vendedores` | 26,6 KB | 2,4–9,7 s |
| `/comparativo` | 24,6 KB | 2,2–9,1 s |
| `/prospeccao` | 148 KB | ~0,07 s |
| `/financeiro/receber` | 20,0 KB | ~0,2 s |
| `/financeiro/pagar` | 7,5 KB | ~0,02 s |
| `/financeiro/dre` | 0,2 KB* | ~0,1 s |

\* com `caixa_items` vazia — não dá para medir de verdade enquanto o cliente não
importar o arquivo de caixa. O payload não cresce com o número de movimentações:
o que ele carrega é uma linha por conta do plano, uma por centro de custo e uma
por dia do período (a série diária vem junto com a mensal para o botão
mensal/diário não disparar nova consulta — num período de 12 meses são ~365
pontos, na casa de 20 KB).

`/estoque` ficou em **274 KB e ~4,7 s** (12 meses) — é a mais cara da fase B, e
o motivo está na seção "O que o /estoque ensinou" abaixo.

Os tempos variam bastante com o cache do Postgres — as duas que varrem o
histórico completo chegam a 9 s a frio e caem para ~2,4 s a quente.

As mais lentas são as que **varrem o histórico completo**, não só o período:
`/vendedores` precisa da primeira compra de cada par (vendedor, cliente), e
`/comparativo` compara ano a ano por definição.

Os números acima são de antes da otimização de 11/08/2026 — ver "O que
/prospeccao ensinou (11/08/2026)". Medido de novo depois dela, no período de 12
meses (o pior caso, não o preset padrão):

| Tela | Antes | Depois |
|---|---:|---:|
| `/dashboard` | 5.285 ms | **2.385 ms** |
| `/vendas` | 3.952 ms | **3.042 ms** |
| `/produtos` | 4.679 ms | **1.625 ms** |
| `/clientes` | 4.056 ms | **2.404 ms** |
| `/vendedores` | 6.110 ms | **4.565 ms** |
| `/comparativo` | 3.079 ms | **1.487 ms** |
| `/prospeccao` | 3.951 ms | **920 ms** |
| `/financeiro/receber` | 1.813 ms | **1.590 ms** |
| `/financeiro/pagar` | 113 ms | 109 ms |
| `/financeiro/dre` | 8 ms | 12 ms |
| `/estoque` | 7.843 ms | **5.264–6.689 ms** |

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

### ▶ Retomar por aqui

**Fases B e D concluídas; desempenho das telas resolvido em 11/08/2026.** As
próximas frentes, em ordem de retorno:

1. **Fase E → C** — migrar `/importacao` para gravar no servidor e então apagar
   `DatasetBootstrap`, o store e o IndexedDB. É a **única** frente grande que
   sobrou, e ficou mais urgente depois da fase D: ver "A ingestão pressiona a
   fase E", logo abaixo. Também é o que libera a fase C.
2. **`/estoque` a ~5,3 s** (era 7,8 s antes do `work_mem`) — é a tela mais cara
   que restou. Ver "O que o /estoque ensinou" antes de mexer: duas otimizações
   já foram medidas e descartadas ali.
3. **Decisões de produto pendentes** — as pendências 2 (filtros do dashboard)
   e 6 (demanda em dobro no /estoque) são divergências herdadas do código
   antigo, replicadas de propósito. Nenhuma é de desempenho; as duas esperam
   você dizer o que a tela **deve** mostrar.

Não há mais pendência de desempenho conhecida sem causa identificada.

### A ingestão pressiona a fase E

Cada envio da API atualiza `dataset_meta.importedAt`, que é justamente o campo
que o `DatasetBootstrap` usa para decidir se precisa rebaixar o dataset inteiro.

Com o ciclo de 2 horas rodando, **quem estiver na tela `/importacao` volta a
baixar 1,5 GB depois de cada envio** — é a única rota que ainda depende do
store. As telas de leitura não sofrem: todas já estão em `ROTAS_SEM_STORE`.

Não é regressão (o comportamento é o mesmo de antes da fase B), mas a fase D
transforma um download eventual em um download a cada 2 horas. Isso torna a
fase E mais urgente do que parecia quando foi ordenada.

### O `work_mem` padrão está derrubando todas as telas

**Este é o achado mais importante desde o começo da fase B, e não custa uma
linha de código: é configuração do Postgres.**

O `work_mem` do banco está no padrão de fábrica, **4 MB**. Agregar 119 mil
pedidos não cabe nisso, então o hash aggregate **derrama para disco**. Medido no
dashboard de 12 meses, com `EXPLAIN ANALYZE` somando todos os nós:

| `work_mem` | Derrame em disco | Plano | Tempo |
|---|---:|---|---:|
| **4 MB** *(atual)* | 229 MB | 15 hash | 2.223 ms |
| 8 MB | 144 MB | 15 hash | 2.094 ms |
| 16 MB | 58 MB | 15 hash | 2.012 ms |
| **32 MB** | 144 MB | 8 hash / **7 sort** | **4.865 ms** ⚠ |
| **64 MB** | **0 MB** | 15 hash | **1.616 ms** |
| 128 MB | 0 MB | 15 hash | 1.614 ms |

Duas leituras:

1. **64 MB elimina o derrame e é 27% mais rápido.** Acima disso não muda nada.
2. **32 MB é uma armadilha.** O planejador troca hash aggregate por
   `GroupAggregate` + ordenação externa e o tempo *dobra* — pior que o padrão de
   4 MB. É a estimativa errada (155× no dashboard) distorcendo o modelo de custo
   justamente na faixa em que ordenar "parece" barato. Ou seja: **não dá para
   afinar esse número por tentativa; sem medir, um palpite intermediário piora.**

**O que isso custa em memória, e por que a decisão é sua:** `work_mem` é por
operação, por conexão. O dashboard dispara ~10 consultas em paralelo, então
64 MB podem virar ~640 MB de pico **por usuário carregando o painel**. Com vários
usuários simultâneos na mesma VPS, isso escala rápido. As opções:

- **64 MB global** — o melhor tempo, e o maior risco de memória. Pede VPS com
  folga e um teto de conexões.
- **16 MB global** — ganho pequeno (~9%), pico de ~160 MB por painel, sem risco.
- **64 MB só nas rotas de análise**, via `SET LOCAL` numa transação — melhor
  relação, mas exige envolver cada endpoint numa transação (é o que o `/estoque`
  já faz).

**Nada disso foi aplicado.** É decisão de dimensionamento da VPS, não de código.

De passagem: `shared_buffers` também está no padrão (128 MB) para ~800 MB de
dados por tenant. Não foi medido, mas é candidato óbvio à mesma revisão.

#### Duas hipóteses testadas e descartadas aqui

Ambas partiam de "o hash derrama porque a linha é larga demais":

- **Pedir do CTE de pedidos só as colunas usadas** (de 13 para 5): a largura caiu
  de 294 para 70 bytes e o derrame ficou **exatamente igual** — 229 MB. Porque o
  que vai para disco é a *entrada* do agregado, não a saída.
- **Estreitar o CTE de linhas** (de 17 para 6 colunas): idem, zero diferença. O
  Postgres já poda colunas não usadas sozinho; escrever a poda na mão não
  acrescenta nada.

Foram revertidas. A lição: **antes de reescrever SQL para "carregar menos
dados", confirme no `EXPLAIN` que o dado largo é mesmo o que está indo para
disco.**

### O que o /prospeccao ensinou (11/08/2026)

A tela levava ~2,9 s no servidor e devolvia 4,9 MB em 12 meses. Três causas
distintas, todas medidas em `empresa_80027879` (1,14 mi de linhas em
`orcamento_items`, 287 mil no período).

**1. Uma CTE que a consulta não usa custa caro.** A consulta de produtos
montava as três CTEs (`filtrado`, `quotes`, `com_status`) mas só lia a primeira.
Isso basta para o estrago: o Postgres embute (*inline*) uma CTE referenciada
**uma** vez e materializa a que é referenciada **duas ou mais** — e `quotes`,
mesmo nunca executada, conta como referência a `filtrado`. Materializada, ela
virou 287 mil linhas gravadas em `temp` e o plano perdeu a paralelização.
Só separar as CTEs por consumidor: **2.263 ms → 1.240 ms**, mesmo resultado.

> Regra prática: cada consulta deve declarar **só** as CTEs que lê. Num arquivo
> com um construtor de CTE compartilhado, isso significa parametrizar o
> construtor, não reaproveitar o bloco inteiro.

**2. Contagem global na varredura de toda requisição.** `totalGeral` agrupava a
tabela inteira (1,4 s) para um número que **só aparece na tela vazia**. Passou a
rodar apenas quando o período não devolve nada. No preset padrão isso sozinho
levou a tela de 1.285 ms para 253 ms.

**3. O gargalo maior não estava no servidor.** Depois dos dois ajustes, o que
sobrava eram 30.715 produtos e 4,9 MB atravessando a rede para uma tabela de
420 px de altura — parse do JSON, ordenação em JS e ~184 mil células no DOM.
Recortar (pendência 5) resolveu: **4,9 MB → 172 KB** com 1.000 linhas.

> Antes de otimizar SQL, veja o tamanho do payload. Uma consulta de 1,2 s que
> devolve 4,9 MB é um problema de recorte, não de plano.

**Efeito colateral a conhecer:** com `work_mem` maior o Postgres escolhe planos
paralelos, e a soma de `double precision` muda de ordem. Os totais divergem no
último bit — desvio relativo máximo medido de **2,1e-14** (menos de um milésimo
de centavo em valores na casa dos bilhões). As 11 telas foram comparadas campo a
campo antes e depois: fora esse ruído, só mudou o que se quis mudar.

Isso também expôs três consultas que agregavam **sem `ORDER BY`** (heatmap do
dashboard e de vendas, cidades em vendas, situações em estoque). O conjunto de
linhas nunca mudou, mas a ordem dependia do plano — e o plano mudou. Nenhuma
das telas usa essa ordem (todas remontam matriz ou mapa por chave), mas a
ordenação foi fixada mesmo assim, pela mesma razão da seção "Ordenação com
empate".

### O que o /estoque ensinou

É a tela mais cara da fase B, e o que a segura **não é uma coisa só**. Depois de
otimizada ela ficou em ~4,7 s (12 meses), assim distribuída:

| Passo | Tempo |
|---|---:|
| `e_l` — linhas do período (340 mil) | ~550 ms |
| `e_mov` — movimento por produto | ~1.200 ms |
| `e_cat` — catálogo (primeira ocorrência de cada produto) | ~1.050 ms |
| `e_fin` — junção snapshot × movimento (112 mil linhas) | ~760 ms |
| SELECT final — as 9 agregações | ~800 ms |
| os 5 `ANALYZE` | ~270 ms |

Não há um gargalo dominante para atacar; o próximo ganho real é pré-agregação
(fase F), não mais ajuste de SQL.

**A lição que vale para todas as telas: o Postgres não tem estatística de CTE.**
Num `WITH` de sete etapas ele estimava **8,3 milhões** de linhas onde havia 112
mil e escolhia merge joins que ordenavam tudo. E o erro não é só de grau: ao
melhorar uma sub-consulta, a estimativa de `mov` caiu para *3 linhas*, o
anti-join virou nested loop e a consulta foi de 6,9 s para **578 segundos**.

A saída foi materializar cada etapa em `CREATE TEMP TABLE … ON COMMIT DROP` e
rodar `ANALYZE`, tudo dentro de uma transação. Com números reais o planejador
acerta. Detalhe que importa: `SET LOCAL default_statistics_target = 10` antes dos
`ANALYZE` — o que falta ao planejador é a cardinalidade, não histograma fino, e
isso derrubou o custo dos cinco `ANALYZE` de 2.475 ms para 271 ms sem mudar
nenhum plano.

Se outra tela apresentar lentidão desproporcional ao volume, **suspeite da
estimativa antes de suspeitar do SQL**: rode `EXPLAIN ANALYZE` e compare
`rows=` estimado com o real.

Duas hipóteses foram testadas e descartadas aqui, para não repetir:

- **Índice `(order_type, product_id, id)`** para o catálogo: rendeu 260 ms de
  4,8 s e custa 43 MB por tenant numa tabela de 318 MB. Não compensa.
- **Agregar por (produto, pedido) antes de somar** no `e_mov`, para trocar três
  passadas por duas: ficou *pior* (mediana 5.309 ms contra 5.044 ms), porque
  carregar nome e subgrupo em `e_l` engorda a temporária mais do que a passada
  extra custa.

Como a DRE foi validada com a tabela vazia: `caixa_items` tinha 0 linhas, então
comparar JS × SQL ali não provaria nada (tudo bate em zero). O script semeou
3.390 linhas com um plano de contas hierárquico de propósito — pai sem movimento
próprio (`1`), pai com movimento próprio (`2`), netos (`2.1.01`), folha sem
filhos (`3`), código vazio e valores zerados — comparou 6 cenários e **apagou
tudo no fim**, devolvendo a tabela às 0 linhas originais. O script aborta se
encontrar a tabela não-vazia, para nunca destruir dado real. Vale repetir a
validação com o arquivo do cliente quando ele existir.

Para tabelas fora de `sale_items`, o caminho já testado (em `/prospeccao` e
`/financeiro/receber`) é escrever a CTE dentro do próprio módulo e reaproveitar
de `base.ts` só o contrato de filtros (`AnalyticsFilters`) e o acumulador
`Params`. O `cteLinhas`/`CTE_PEDIDOS` é específico de vendas.

Antes de começar, o de sempre:

```bash
git pull
npm install          # se package.json tiver mudado
npm run migrate:all  # aplica migrations pendentes no catalog e nos tenants
npm run dev
```

**Estado do git em 08/08/2026:** a fase B está commitada em três commits
(`936d5b0` produtos, `ee3b085` as sete telas seguintes, `ea3ad5f` estoque), mas
**não foi feito push** — `main` está à frente do `origin`. Subir dispara o deploy
de produção no Coolify, então ficou aguardando decisão. Se o `git pull` acima não
trouxer essas telas, elas estão na outra máquina, ainda locais.

Para a validação, os scripts ficam em diretório temporário e podem não existir
mais — o roteiro para recriá-los está logo abaixo. O de `/produtos` é o modelo
mais completo (compara curvas ABC, ordem dos ids e totais de rodapé).

Ao abrir o app: o filtro padrão é "mês atual" e os dados terminam em 22/07/2026,
então o painel aparece zerado. Troque para "Mês anterior" ou "12 meses".

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

### `COUNT(DISTINCT)` — a armadilha que já reapareceu

A regra 4 da receita não é teórica: **eu mesmo a violei ao migrar `/produtos`**,
e a tela abriu em 20 segundos. Duas ocorrências, ambas corrigidas:

| Consulta | Com `COUNT(DISTINCT)` | Com `GROUP BY` |
|---|---:|---:|
| Total de produtos no histórico | 13.294 ms | **545 ms** |
| SKUs por subgrupo | 2.355 ms | **~250 ms** |

O padrão de correção é sempre o mesmo: **agrupar pela coluna e contar linhas**,
em vez de pedir distintos.

```sql
-- ❌ lento
SELECT COUNT(DISTINCT product_id) FROM sale_items WHERE …

-- ✅ rápido
SELECT COUNT(*) FROM (SELECT product_id FROM sale_items WHERE … GROUP BY product_id) t
```

Ao migrar uma tela, vale procurar `COUNT(DISTINCT` no SQL antes de medir — é o
primeiro suspeito.

### Cálculo que depende de "agora"

`/clientes` trouxe um caso novo: a segmentação RFM usa a **recência**, que no
código antigo vinha de `Date.now()` do navegador. Passar a usar `CURRENT_DATE`
no banco mudaria o resultado conforme o fuso do servidor e a hora de acesso — um
cliente poderia alternar entre "em risco" e "fiel" sem nada ter mudado.

A solução foi **enviar a data local do navegador como parâmetro** (`hoje`), e o
SQL calcula `hoje::date - ultima_compra::date`. Isso reproduz exatamente o
`Math.floor((now - ts) / 86400000)` do original.

Vale o mesmo princípio para qualquer coisa dependente de relógio nas próximas
telas: **quem decide "agora" é o cliente, não o servidor**.

### Estatística sem materializar a grade

`/vendedores` calcula um coeficiente de variação do faturamento diário em que os
**dias sem venda contam como zero**. Materializar uma grade de (vendedor × dia
operacional) para isso seria caro e desnecessário — a soma dos desvios se reduz
a uma identidade que só precisa da soma dos quadrados dos dias COM venda:

```
Σ(v_d − média)²  =  Σv_d²  −  receita² / n        (n = dias operacionais)
```

Os dias zerados contribuem apenas com `média²` cada, e esse termo já está
embutido no resultado. Conferido nos 32 vendedores, não só no primeiro.

Vale procurar simplificações assim antes de gerar linhas artificiais no SQL.

### Quando o pedido não precisa ser reconstruído

Vendedor, canal e cliente são atributos do PEDIDO, e o código antigo somava o
total dele. Mas como cada pedido tem exatamente um de cada, somar as LINHAS
agrupadas por vendedor dá o mesmo número — sem precisar do `GROUP BY order_id`.

Em `/comparativo`, que varre o histórico inteiro, essa troca sozinha levou a
série mensal de **7.283 ms para 1.401 ms** (5,2×), com resultado idêntico.

Regra prática: só use a CTE `pe` quando precisar **contar pedidos** ou de algo
que dependa do valor do pedido inteiro (maior pedido, pedido com desconto). Para
somar receita por um atributo do pedido, `l` basta.

### Uma quarta hipótese derrubada

Achei que a CTE `cteLinhas`, que seleciona 17 colunas, fosse cara numa varredura
completa. Medido: **1.144 ms** com as 17 colunas contra 1.334 ms com 4. Não faz
diferença — os 5.837 ms que eu tinha visto antes eram cache frio, não largura.

### Pendências conhecidas

1. ~~**Período de 12 meses ainda é lento.**~~ **RESOLVIDA em 11/08/2026.**
   Era o `work_mem` de 4 MB fazendo o banco derramar centenas de MB em disco a
   cada painel. Decisão tomada: **64 MB só nas rotas de análise**, via
   `consultaAnalitica()` em `base.ts` — `SET LOCAL work_mem` dentro de uma
   transação por consulta, o que preserva o `Promise.all` das telas e não vaza o
   ajuste para a conexão do pool (a próxima requisição pode ser uma importação).
   O valor sai de `ANALYTICS_WORK_MEM` (padrão `64MB`, só aceita `<n>MB`).
   As 34 consultas de agregação passaram a usar o helper; as sondas
   `SELECT EXISTS (...)` não, porque não ordenam nem agregam nada. `/estoque` já
   tinha transação própria e recebeu o `SET LOCAL` direto.
   Ver a tabela antes/depois acima. A armadilha dos 32 MB continua registrada em
   "O `work_mem` padrão está derrubando todas as telas" — 64 MB foi o valor
   medido como melhor, não um chute.

   Para referência, cinco hipóteses já foram derrubadas por medição:
   compartilhar a varredura no nível de linha e no nível de pedido (ver 4.1),
   `CTE MATERIALIZED` no ABC de produtos (18%, não compensa), e enxugar a
   projeção dos CTEs de pedido e de linha (zero efeito).

   **▶ Medido em 08/08/2026 — a causa é configuração, não SQL.** Ver
   "O `work_mem` padrão está derrubando todas as telas", logo abaixo. A pista da
   estimativa de CTE foi verificada e é real (desvios de até 155× no dashboard),
   mas o efeito prático dela é indireto: ela desestabiliza a escolha de plano
   quando o `work_mem` muda.

2. **Inconsistência herdada nos filtros do dashboard**: os cartões de KPI ignoram
   canal, vendedor e subgrupo, enquanto os gráficos os aplicam. Foi replicado
   fielmente para não mudar números, mas parece bug. Corrigir é uma linha em
   `whereBase` — decisão pendente.

3. **Taxas de câmbio ainda vêm do cliente** no corpo da requisição, para os
   números seguirem idênticos aos de hoje. Quando a tabela `cambio` existir
   (seção 6.1), a origem passa a ser o banco e o campo `rates` sai do contrato.

4. **`next.config.ts` linha 10**: a chave `eslint` virou no-op no Next 16 e é o
   único erro do `npm run type-check`. Não removida.

5. ~~**`/prospeccao` devolve 1,4 MB.**~~ **RESOLVIDA em 11/08/2026.** Decisão
   tomada: a tabela de conversão por produto mostra os **1.000 mais orçados**
   no período, com mínimo de **5 propostas** (`TOP_PRODUTOS` e `MIN_PROPOSTAS`
   em `src/lib/analytics/prospeccao.ts`). Ordem: volume orçado decrescente e,
   no empate, pior conversão primeiro. Payload de 12 meses: 4,9 MB → 172 KB
   (1.000 linhas, corte por volume — a menor da lista tem 51 propostas, então
   o mínimo nem chega a valer ali). Num mês típico saem 879 linhas: aí é o
   mínimo de 5 que limita, não o teto de 1.000. A tela diz que é um recorte,
   e qual (`prospeccao.produtos.recorte`).

6. **`/estoque` conta a demanda em dobro** quando o filtro é "todas as
   empresas": o snapshot tem uma linha por (produto, empresa), e cada uma recebe
   o movimento **inteiro** do produto. Some duas vezes nas agregações por
   categoria (`unitsSold`, `revenueSold`); estoque e capital estão certos, porque
   esses são por linha mesmo. Vem do código antigo e foi **replicado fielmente**
   para não mudar números conhecidos. Corrigir significa decidir o que a tela
   deve mostrar: demanda por SKU (uma vez) ou por SKU-empresa (rateada).
   **Decisão de produto, pendente.**

7. **`/estoque` responde em ~4,7 s** no período de 12 meses. Já otimizada de
   6,9 s; o que sobra está distribuído, sem gargalo dominante — ver "O que o
   /estoque ensinou". Duas otimizações foram medidas e descartadas ali, não vale
   refazê-las.

### Filtro de período nem sempre é `BETWEEN`

`/financeiro/receber` filtra por **vencimento** e aplica **só o limite
inferior** — os presets de data terminam "hoje", e usar o limite superior
esconderia todo título a vencer. O limite superior só vale no período
personalizado.

Isso não está no SQL: quem decide é o cliente, que envia
`aplicarLimiteSuperior`. Vale conferir a lógica de filtro de cada tela antes de
assumir `BETWEEN from AND to` — `/comparativo` ignora o período inteiro, e as
telas financeiras têm essa assimetria.

### Ordenação com empate

`/prospeccao` expôs algo que vale para todas as telas: a ordem entre itens
empatados, no código antigo, dependia da ordem das linhas no dataset —
arbitrária e não reproduzível. Em SQL ela muda de novo, e a validação acusa
divergência mesmo com todos os valores corretos.

O caso extremo estava nos produtos, ordenados por taxa de conversão: **7.486
produtos empatados em 100%** e 2.282 em 0%. E nos "15 orçamentos mais antigos",
com 372 candidatos na mesma data.

A saída foi **acrescentar um desempate explícito** (id ou nome) no SQL e na
referência de validação. Isso é melhor que o comportamento antigo, que podia
mudar entre execuções. Ao migrar uma tela, procure `sort` ou `ORDER BY` sem
critério único e defina um.

### Migrar a leitura revela quem nunca gravou no servidor

A DRE tinha um importador embutido (aparece quando não há dados de caixa) que
gravava **só no IndexedDB do navegador** — nunca no Postgres, diferente da tela
`/importacao`, que chama `serverImport`. Por isso `caixa_items` estava vazia
apesar de a funcionalidade existir há tempo: quem importasse por ali perdia o
arquivo ao trocar de máquina ou limpar o navegador.

Passar a leitura para o servidor tornaria esse importador inútil (gravaria num
lugar que a tela não lê mais), então ele foi corrigido junto, para `serverImport`.

Ao migrar uma tela, procure caminhos de **escrita** escondidos nela, não só os de
leitura. Se houver um que só toca o store, ou ele vira `serverImport` ou a tela
quebra em silêncio.

### Quando a lista não cabe no payload

`/estoque` tem 76.708 SKUs (111.970 linhas de snapshot, porque há uma linha por
produto **e por empresa**). Diferente das outras telas, não dava para mandar as
linhas e deixar o navegador filtrar: a **busca por texto e o filtro de situação
passaram para o servidor**, com a tabela voltando paginada em 200 linhas mais a
contagem total. O hook adia a busca em 300 ms para não disparar uma consulta por
tecla.

Vale como regra: se a tela filtra em cima de uma lista que não cabe no payload, o
filtro vai junto para o servidor — não adianta migrar só a agregação.

Nesse caminho apareceu um comportamento antigo que foi **mantido de propósito**:
com "todas as empresas", um SKU presente na matriz e na filial vira duas linhas,
e **cada uma recebe o movimento inteiro do produto** — a demanda aparece em dobro
nas somas por categoria. Mudar isso mudaria números que o usuário já conhece,
então ficou como estava e está registrado aqui para decisão futura.

### Comparar float com `===` dá falso alarme

Ao validar uma mudança no dashboard, a comparação por `JSON.stringify` acusou
divergência: `2109.8962500000002` contra `2109.89625`. Parecia erro.

Não era. **O código antigo já diferia de si mesmo entre duas execuções**, no
mesmo grau (desvio relativo de 1,6e-15, o limite do `double`). A soma paralela do
Postgres não tem ordem garantida, e adição de ponto flutuante não é associativa.

Ao validar, compare com **tolerância relativa** (1e-9 é folgado e ainda pega
qualquer erro real) e, quando aparecer diferença minúscula, **rode a versão
antiga duas vezes antes de culpar a nova**.

### Ordem das operações em ponto flutuante

Na cobertura de estoque, `stock * periodDays / units_sold` e
`stock / (units_sold / periodDays)` são a mesma conta na álgebra e contas
diferentes em `double precision`. Um item caía exatamente nos 15 dias e mudava de
"em risco" para "normal" — uma divergência real na validação.

Ao traduzir um cálculo para SQL, **copie a ordem das operações do original**, não
só a fórmula.

Em paralelo, a Fase D (ingestão por API) já está com o desenho fechado e é
independente da parte de consulta — pode ser construída ao mesmo tempo.

Só resta confirmar **de onde vêm as cotações históricas** (seção 6.1): se o ERP
já guarda a cotação de cada documento, o câmbio entra como mais um dataset do
mesmo sincronismo e nada de novo precisa ser inventado.
