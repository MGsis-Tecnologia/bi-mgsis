# Primeira carga — roteiro no servidor do cliente

Da máquina zerada até o ciclo de 2 h rodando. Cada passo confirma o anterior,
e os três primeiros **não escrevem nada** no Analytics.

Pré-requisitos: empresa criada e **ativa** no Analytics, token de integração em
mãos, views `bi_*` e usuário `analytics` já instalados no ERP.

---

## 1. Pré-voo na máquina

```bash
psql --version                                    # já existe: é o servidor do ERP
curl --version
curl -sS -o /dev/null -w '%{http_code}\n' https://analytics.mgsis.com/health
```

O `/health` precisa responder `200`. Se der `000`, é firewall de saída ou DNS —
resolva antes de continuar, senão os erros mais adiante vão parecer outra coisa.

## 2. Confirmar que as views são a versão corrigida

**Não pule.** Uma view antiga carrega dois defeitos que passam despercebidos: a
janela de datas fixa (que esconde tudo antes de 2022 e para de devolver venda
nova em 31/12/2026) e a data em texto `DD/MM/YYYY`.

```bash
psql -U analytics -d erp_do_cliente -c "
  SELECT pg_typeof(pedido_data) AS tipo_da_data FROM bi_movimento LIMIT 1;
  SELECT pg_get_viewdef('bi_movimento'::regclass) LIKE '%2026-12-31%' AS tem_janela_fixa;
  SELECT pg_typeof(orcamento_confirmado) AS tipo_confirmado FROM bi_orcamentos LIMIT 1;
"
```

O esperado:

| Coluna | Valor certo |
|---|---|
| `tipo_da_data` | `timestamp without time zone` — se vier `text`, a view é antiga |
| `tem_janela_fixa` | `f` — se vier `t`, reinstale as views |
| `tipo_confirmado` | `boolean` — se vier `text`, todo orçamento entraria como confirmado |

Para reinstalar: `psql -U postgres -d erp_do_cliente -f instalar-views.sql`

## 3. Decidir a janela — dataset por dataset

O histórico não começa no mesmo ano em cada dataset. Meça antes de escolher:

```bash
psql -U analytics -d erp_do_cliente -c "
SELECT 'vendas'     AS dataset, to_char(min(pedido_data),'YYYY-MM') AS primeiro,
       to_char(max(pedido_data),'YYYY-MM') AS ultimo, count(*) AS linhas FROM bi_movimento
UNION ALL SELECT 'orcamentos', to_char(min(orcamento_data),'YYYY-MM'),
       to_char(max(orcamento_data),'YYYY-MM'), count(*) FROM bi_orcamentos
UNION ALL SELECT 'receber', to_char(min(data_emissao),'YYYY-MM'),
       to_char(max(data_emissao),'YYYY-MM'), count(*) FROM bi_receber
UNION ALL SELECT 'pagar', to_char(min(data_emissao),'YYYY-MM'),
       to_char(max(data_emissao),'YYYY-MM'), count(*) FROM bi_pagar
UNION ALL SELECT 'caixa', to_char(min(caixa_data_emissao),'YYYY-MM'),
       to_char(max(caixa_data_emissao),'YYYY-MM'), count(*) FROM bi_caixa;
"
```

Contas a receber costuma ir muito mais para trás que vendas — décadas, às
vezes. Carregar tudo custa uma requisição por mês, então 30 anos são 360
requisições **daquele** dataset. Se o histórico antigo não interessa ao
relatório, use janelas diferentes (passo 7).

### E confira se algum mês estoura o limite

A API recusa lote acima de **150.000 linhas** com `413`:

```bash
psql -U analytics -d erp_do_cliente -c "
SELECT to_char(pedido_data,'YYYY-MM') AS mes, count(*) AS linhas
  FROM bi_movimento GROUP BY 1 HAVING count(*) > 150000 ORDER BY 1;
"
```

Nenhuma linha = nenhum mês estoura. Se aparecer algum, aquele mês precisa ir
partido em quinzenas, direto na API.

## 4. Instalar o agente

Siga o [README](README.md). Resumo:

```bash
sudo useradd --system --no-create-home --shell /usr/sbin/nologin analytics
sudo install -m 755 mgsis-ingest.sh /usr/local/bin/mgsis-ingest.sh
printf '%s' 'O_TOKEN' | sudo tee /etc/mgsis-token >/dev/null
sudo chown analytics:analytics /etc/mgsis-token && sudo chmod 600 /etc/mgsis-token
sudo install -m 640 -o root -g analytics mgsis-ingest.conf.exemplo /etc/mgsis-ingest.conf
sudo nano /etc/mgsis-ingest.conf

# confirme que o Postgres aceita sem senha (peer) — se responder
# 'analytics', deixe PGHOST="" no conf e não há senha para guardar
sudo -u analytics psql -d erp_do_cliente -c 'SELECT current_user'
```

## 5. Testar o token sem escrever nada

`GET` não grava — só confirma token, status da empresa e o que já está lá:

```bash
curl -sS -H "Authorization: Bearer $(sudo cat /etc/mgsis-token)" \
  https://analytics.mgsis.com/api/ingest/vendas
```

Empresa nova e vazia responde:

```json
{"ok":true,"dataset":"vendas","empresa":"NOME DA EMPRESA",
 "totalDeLinhas":0,"ultimosMeses":[]}
```

Confira o **nome da empresa** — é a prova de que o token aponta para o tenant
certo. Se vier outro nome, o token é de outra empresa.

| Resposta | O que é |
|---|---|
| `401 Token ... inválido ou revogado` | Token errado, ou alguém gerou outro (o anterior é revogado) |
| `403 A empresa X está pendente` | Falta abrir o link de ativação e definir a senha do admin |
| `000` / timeout | Rede: volte ao passo 1 |

## 6. Simular — monta tudo, não envia

```bash
sudo -u analytics mgsis-ingest.sh --periodo 2026-07 --simular
```

Aqui se descobre permissão faltando ou view ausente, sem nada sair da máquina.
A saída mostra linhas e KB por dataset.

## 7. Um mês de verdade — o teste que importa

```bash
sudo -u analytics mgsis-ingest.sh --periodo 2026-07
```

**Faça isto antes da carga cheia.** Um mês de vendas são ~12 MB de JSON numa
requisição, e é aqui que se descobre se algum proxy no caminho corta o corpo.
Falhar num mês custa segundos; descobrir no meio de cinco anos custa a tarde.

Confirme no Analytics que o mês aparece, e repita o passo 5: `totalDeLinhas`
deve ter subido.

## 8. A carga cheia

Com a janela escolhida no passo 3:

```bash
sudo -u analytics mgsis-ingest.sh --inicial 2022-01 | tee /tmp/carga-inicial.log
```

Janelas diferentes por dataset, quando o histórico não começa junto:

```bash
sudo -u analytics mgsis-ingest.sh --inicial 2022-01 --dataset vendas
sudo -u analytics mgsis-ingest.sh --inicial 2022-01 --dataset orcamentos
sudo -u analytics mgsis-ingest.sh --inicial 2015-01 --dataset receber
sudo -u analytics mgsis-ingest.sh --inicial 2015-01 --dataset pagar
sudo -u analytics mgsis-ingest.sh --inicial 2022-01 --dataset caixa
sudo -u analytics mgsis-ingest.sh --periodo  2026-07 --dataset estoque
```

Ordem de grandeza: ~5 s por mês de vendas. Rode numa `tmux`/`screen` se a
conexão for instável — embora **cair no meio não seja problema**: rode o mesmo
comando de novo, porque cada período é reescrito com o mesmo conteúdo.

O agente sai com código `1` se qualquer envio falhar. Para achar o que faltou:

```bash
grep ERRO /tmp/carga-inicial.log
```

## 9. Conferir antes de automatizar

```bash
for ds in vendas compras orcamentos receber pagar caixa estoque cambio; do
  echo "── $ds"
  curl -sS -H "Authorization: Bearer $(sudo cat /etc/mgsis-token)" \
    "https://analytics.mgsis.com/api/ingest/$ds"
  echo
done
```

`ultimosMeses` traz a contagem por mês — compare com o passo 3. Divergência
grande em algum mês é sinal de envio que falhou sem você notar.

Depois abra o Analytics e olhe o **faturamento de um mês conhecido**. Bater com
o ERP é a validação que vale.

## 10. Ligar o ciclo

Só depois que os números conferirem:

```bash
sudo install -m 644 systemd/mgsis-ingest.service /etc/systemd/system/
sudo install -m 644 systemd/mgsis-ingest.timer   /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now mgsis-ingest.timer
systemctl list-timers mgsis-ingest.timer
```

A partir daí, de 2 em 2 horas: mês corrente, mês anterior e a foto de estoque.

## Depois

**Recarga mensal da janela completa.** Correção retroativa fora da janela dos
2 h não chega sozinha — se alguém corrigir uma nota de 2024, o Analytics segue
com o valor antigo até aquele período ser reenviado:

```cron
0 3 1 * * analytics /usr/local/bin/mgsis-ingest.sh --inicial 2022-01 >> /var/log/mgsis-ingest.log 2>&1
```
