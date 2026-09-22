# Implantação pendente — setembro/2026

Checklist do que **precisa ser feito fora do código** para que as mudanças de
21 e 22/09/2026 (commits `35a2bb7` até `7a97ffa`, branch `main`) funcionem em
produção e nos clientes. O código já está no GitHub; **nada abaixo foi aplicado
em produção nem em servidor de cliente** — só no banco de desenvolvimento.

Marque cada item aqui mesmo quando fizer (`- [x]`) e faça commit, para o estado
ficar visível em qualquer computador. **Este arquivo segue em aberto até os 2
clientes em produção serem atualizados** — some quando isso acontecer.

O que mudou, em uma linha por assunto:

- **Marca** nas vendas (`marca_id`, `marca_descricao`) → aba Marcas no
  Comparativo e Curva ABC por marca em Produtos.
- **Condição de pagamento** no Receber (`condicao_pagamento_id`,
  `condicao_pagamento_descricao`) → filtro na tela de Contas a Receber.
- **Ingestão financeira:** ciclo de 1 h; receber reenvia 12 meses, pagar o
  histórico inteiro; nova recarga completa para a madrugada.
- **Comparativo:** tabela com todos os itens, busca, clique no item; aba
  Fornecedores.
- **Produtos:** Curva ABC e Ranking por lucro completos, com rolagem.
- **Estoque:** botão Maximizar no Detalhamento por SKU.
- **Empresa** — dataset novo (`empresa_id`, `empresa_fantasia`) → o filtro de
  empresa das telas passa a mostrar o nome fantasia em vez do código cru.
- **Clientes:** busca e paginação com rolagem na Base de Clientes e em
  Clientes mais lucrativos. Só código de tela — nenhum passo de infraestrutura
  próprio, vai junto no deploy do item 1.

---

## 1. Servidor do Analytics (o app)

- [ ] **Deploy** do `main` (commit `7a97ffa` ou posterior).
- [ ] **Migrations.** Três novas, todas aditivas (só `ADD COLUMN`/`CREATE TABLE`
  com padrão vazio, sem risco para os dados existentes):
  - `20260921120000_sale_marca`
  - `20260921130000_receber_condicao_pagamento`
  - `20260922120000_empresa_items` (tabela nova, `empresa_items`)

  Rodam sozinhas no start do container (`scripts/migrate-all.mjs`). Para
  conferir ou rodar à mão:

  ```bash
  node scripts/migrate-all.mjs --check   # só audita
  node scripts/migrate-all.mjs           # aplica em catalog + todos os tenants
  ```

  > O script **não lê `.env`**: em desenvolvimento, passe o arquivo —
  > `node --env-file=.env.local scripts/migrate-all.mjs`. Sem isso ele responde
  > "DATABASE_URL não definida".
- [ ] Confirmar no log que **todos os bancos** (catalog e cada empresa) ficaram
  "em dia".

> Em máquina de desenvolvimento Windows: pare o `npm run dev` **antes** de
> `npx prisma generate`, senão o Windows não deixa trocar o engine (EPERM).

## 2. ERP de cada cliente (Postgres)

**Ordem importa: as views ANTES do agente novo.** O agente novo seleciona
`marca_id`, `marca_descricao`, `condicao_pagamento_id`,
`condicao_pagamento_descricao` e consulta `bi_empresa`; com a view antiga o
envio de vendas e de receber **quebra**, e o envio de empresa falha sozinho
(ver a armadilha no item 6 — não corrompe dado, mas suja o log a cada ciclo).

- [ ] Rodar [`sql dados/instalar-views.sql`](sql%20dados/instalar-views.sql) no
  banco do ERP (recria `bi_movimento` e `bi_receber` com as colunas novas, e
  cria `bi_empresa`).
- [ ] `SELECT marca_id, marca_descricao FROM bi_movimento LIMIT 5` e
  `SELECT condicao_pagamento_id, condicao_pagamento_descricao FROM bi_receber LIMIT 5`
  para confirmar que as colunas existem.
- [ ] `SELECT * FROM bi_empresa;` — deve devolver uma linha por matriz/filial,
  com `empresa_fantasia` preenchido. Se a tabela `empresa` do ERP não tiver
  essa coluna (nome diferente), ajustar
  [`sql dados/bi_empresa.sql`](sql%20dados/bi_empresa.sql) antes de reinstalar.
- [ ] **Atenção — `bi_compras` também mudou** no `instalar-views.sql`: a data
  passou a ser `compra_data_lancamento` e o filtro `compra_status_estoque = true`.
  Isso muda **quais compras entram e em que mês**. Depois de instalar, reenviar
  as compras (item 4) e conferir a tela de Fornecedores contra o ERP.

## 3. Servidor do cliente (agente de ingestão)

- [ ] Copiar o `agente/mgsis-ingest.sh` novo para `/usr/local/bin/`.
  **Fim de linha LF**: copiado de Windows sem cuidado, vira `bad interpreter:
  /bin/bash^M`. Confira com `file /usr/local/bin/mgsis-ingest.sh` — não pode
  dizer "CRLF". Ver [`agente/README.md`](agente/README.md).
- [ ] Atualizar `/etc/mgsis-ingest.conf` com as duas linhas novas (o modelo está
  em `agente/mgsis-ingest.conf.exemplo`):

  ```bash
  JANELA_MESES_FINANCEIRO=12   # meses de receber reenviados a cada ciclo
  INICIO_HISTORICO=""          # vazio = descobre pelo menor data_emissao
  ```
- [ ] **Testar sem enviar nada:**

  ```bash
  sudo -u analytics mgsis-ingest.sh --ciclo --simular
  ```

  Deve listar receber dos últimos 12 meses, pagar do primeiro mês até hoje, e
  `empresa (envio completo)` junto com estoque e câmbio — terminando com
  "concluído sem falhas". Se falhar com erro de coluna ou tabela inexistente
  (`marca_id`, `condicao_pagamento_id` ou `bi_empresa`), a view do item 2 não
  foi instalada nesse banco.
- [ ] **Ciclo de 1 hora.** Trocar o timer do systemd
  (`agente/systemd/mgsis-ingest.timer`, agora `OnCalendar=*:07`):

  ```bash
  sudo install -m 644 agente/systemd/mgsis-ingest.timer /etc/systemd/system/
  sudo systemctl daemon-reload && sudo systemctl restart mgsis-ingest.timer
  systemctl list-timers mgsis-ingest.timer     # confere o próximo disparo
  ```

  Com cron no lugar do systemd: `7 * * * * analytics /usr/local/bin/mgsis-ingest.sh --ciclo >> /var/log/mgsis-ingest.log 2>&1`
- [ ] **Recarga da madrugada** (pega baixa de título muito antigo e correção
  retroativa, que a janela de 12 meses do ciclo não alcança):

  ```cron
  0 3 * * * analytics /usr/local/bin/mgsis-ingest.sh --recarga-financeira >> /var/log/mgsis-ingest.log 2>&1
  ```

## 4. Reenvio do histórico

Os registros já gravados ficam com os campos novos **vazios** até o período ser
reenviado. Até lá: as telas mostram **"Sem marca"** e **"Sem condição
informada"**.

- [ ] **Vendas** (traz a marca) — do primeiro mês do cliente até hoje:

  ```bash
  sudo -u analytics mgsis-ingest.sh --inicial 2022-01 --dataset vendas | tee /tmp/vendas.log
  ```
- [ ] **Receber** (traz a condição de pagamento):

  ```bash
  sudo -u analytics mgsis-ingest.sh --recarga-financeira --dataset receber
  ```
- [ ] **Compras**, se as views de compra foram reinstaladas (item 2):

  ```bash
  sudo -u analytics mgsis-ingest.sh --inicial 2022-01 --dataset compras
  ```
- Pagar não precisa: já vai inteiro a cada ciclo.
- **Empresa** não precisa de reenvio de histórico — é uma foto, como estoque e
  câmbio: o primeiro `--ciclo` bem-sucedido depois da view instalada (item 2)
  já manda tudo. Só usar o comando abaixo se quiser o nome na tela **antes**
  do próximo disparo do cron:

  ```bash
  sudo -u analytics mgsis-ingest.sh --periodo "$(date +%Y-%m)" --dataset empresa
  ```

  Alternativa sem acesso ao servidor: subir um CSV com `empresa_id` e
  `empresa_fantasia` direto pela tela de Importação.

Se cair no meio, rode o mesmo comando de novo: o envio é idempotente.

## 5. Como conferir depois

- **Comparativo → Marcas:** deve mostrar marcas reais, não só uma linha "Sem
  marca".
- **Comparativo → Fornecedores**, com o filtro de data em *Ano atual*: o valor de
  cada fornecedor em 2026 tem que bater com a coluna **vendido** da tabela
  "Comprado × vendido" da tela de Fornecedores no mesmo ano (foi validado assim:
  125 de 125 iguais).
- **Produtos:** tabela "Curva ABC por marca" com nomes; as tabelas de Curva ABC e
  Ranking por lucro rolam e carregam mais linhas.
- **Receber:** o seletor "Condição de pagamento" lista as condições reais, e ao
  escolher uma, KPIs, aging e tabelas mudam juntos.
- **Estoque:** Maximizar/Fechar funciona, e o Status aparece sem rolagem lateral.
- **Qualquer tela, seletor de empresa (topo):** mostra o nome fantasia
  ("Matriz", "Filial Ciudad del Este"...), não mais "Empresa 1"/"Empresa 2".
  Empresa sem cadastro em `bi_empresa` continua no rótulo antigo — não é erro,
  é só o cadastro daquela empresa que falta.
- **Clientes:** Base de Clientes e Clientes mais lucrativos rolam, carregam
  mais linhas e a busca por nome/id funciona nas duas.

## 6. Armadilhas conhecidas

- **Agente novo + view antiga = envio de vendas/receber quebra.** Sempre view
  primeiro.
- O agente trata `condicao_pagamento_id` e a descrição como texto (`COALESCE`),
  porque a view os entrega **crus** (id inteiro, descrição `NULL` quando o título
  não tem condição). Se um dia alguém "corrigir" a view com `COALESCE`, nada
  quebra.
- Fornecedores no Comparativo: a regra do fornecedor principal vale **ano a
  ano**, como na tela de Fornecedores. O mesmo produto pode pertencer a
  fornecedores diferentes em anos diferentes.
- A soma da aba Fornecedores fica **abaixo** da receita total (~3,3% no cliente
  testado): produto vendido num ano em que não teve compra registrada não tem
  fornecedor e não aparece, como na tela de Fornecedores.
- **Agente novo + `bi_empresa` ausente:** o envio de empresa falha, mas os
  demais datasets do ciclo continuam indo — não é como marca/condição, que
  quebram vendas/receber inteiros. O sintoma é o ciclo terminando "com 1
  falha(s)" e o cron/systemd marcando erro a cada disparo, mesmo com o resto
  do envio correto. Resolve instalando a view (item 2).
- Empresa cadastrada no ERP depois de já mostrada como "Empresa N" numa tela:
  o rótulo só troca depois do próximo `--ciclo` (ou reenvio manual do item 4) —
  o nome não é lido em tempo real, vem do que já foi importado.

## 7. Pontas soltas (não são obrigatórias)

- `sql dados/bi_compras.sql` (avulso) **não foi sincronizado** com o
  `instalar-views.sql`; o comentário de `src/lib/server/ingest/contrato.ts` ainda
  diz que `pedido_data` de compras é a data da fatura. Ajustar quando a mudança
  de `bi_compras` for confirmada.
- Estoque: a coluna Fabricante tem 110 px no modo normal (230 px maximizado);
  códigos longos ainda são cortados no normal. O modo maximizado soma 1.450 px —
  em notebook de 1.366 px ainda pode pedir rolagem lateral.
- Receber: a condição de pagamento só é filtro por enquanto. Sem índice em
  `payment_term_id` (decidir quando houver uma consulta que agrupe por ela).
- Fornecedores no Comparativo: se quiserem ver a parcela sem fornecedor, dá para
  acrescentar uma linha "Sem fornecedor" (hoje ela é omitida, como na tela de
  Fornecedores).
- `bi_empresa.sql` assume que a tabela `empresa` do ERP tem uma coluna chamada
  **`empresa_fantasia`** — não confirmado contra o banco de nenhum cliente
  ainda (só o nome que foi passado). Conferir no `SELECT` do item 2; se o nome
  real for outro (`empresa_nome`, `empresa_razao`...), é só trocar essa coluna
  na view, nada mais no pipeline depende do nome dela.
