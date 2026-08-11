# Agente de ingestão — instalação no servidor do cliente

Lê as views `bi_*` do ERP e envia para o Analytics. Roda de 2 em 2 horas.

**Por que bash + psql + curl:** a máquina já é o servidor do PostgreSQL, então
`psql` está lá por definição, e `curl` está em qualquer distribuição. Nada a
instalar, nada que quebre numa atualização de runtime.

## Antes de começar

1. As seis views `bi_*` criadas no ERP — ver [`../sql dados/`](../sql%20dados/).
2. O usuário `analytics` com `SELECT` só nelas —
   [`analytics_usuario.sql`](../sql%20dados/analytics_usuario.sql).
3. Um **token de integração ativo**, gerado no Analytics em
   *Master → Empresas → (a empresa) → token de integração*.
   Ele aparece **uma única vez**; o servidor guarda apenas o hash.

## O que precisa ir para o servidor

Não é a pasta inteira. Só isto:

| Arquivo | Destino | Obrigatório? |
|---|---|---|
| `mgsis-ingest.sh` | `/usr/local/bin/` | **sim** — é o único que executa |
| `mgsis-ingest.conf.exemplo` | vira `/etc/mgsis-ingest.conf` | é só modelo; pode escrever o conf direto |
| `systemd/*.service` e `*.timer` | `/etc/systemd/system/` | só se usar systemd (com cron, não precisa) |

Os `.md` são documentação — não vão para o servidor.

### Como levar

**Com git no servidor** (mais simples de atualizar depois):

```bash
git clone --depth 1 <repo> /tmp/bi && cd /tmp/bi/agente
```

**Sem git**, copiando da sua máquina:

```bash
scp agente/mgsis-ingest.sh agente/mgsis-ingest.conf.exemplo usuario@servidor:/tmp/
scp agente/systemd/mgsis-ingest.* usuario@servidor:/tmp/
```

> ⚠ **Copiando de uma máquina Windows, confira o fim de linha.** Um CR no
> script dá `bad interpreter: /bin/bash^M`, e no `.conf` ele entra em silêncio
> *dentro* da variável — o curl recebe uma URL com um caractere invisível no
> fim e falha sem dizer por quê.
>
> ```bash
> file /tmp/mgsis-ingest.sh     # não pode dizer "CRLF line terminators"
> sed -i 's/\r$//' /tmp/mgsis-ingest.sh /tmp/mgsis-ingest.conf.exemplo
> ```
>
> Clonando pelo git no próprio servidor isso não acontece: o `.gitattributes`
> fixa LF nesses arquivos.

## Instalação

```bash
# 1. Usuário de serviço, sem shell e sem home
sudo useradd --system --no-create-home --shell /usr/sbin/nologin analytics

# 2. O agente
sudo install -m 755 mgsis-ingest.sh /usr/local/bin/mgsis-ingest.sh

# 3. O token, legível só por ele
printf '%s' 'COLE_O_TOKEN_AQUI' | sudo tee /etc/mgsis-token >/dev/null
sudo chown analytics:analytics /etc/mgsis-token
sudo chmod 600 /etc/mgsis-token

# 4. A configuração
sudo install -m 640 -o root -g analytics mgsis-ingest.conf.exemplo /etc/mgsis-ingest.conf
sudo nano /etc/mgsis-ingest.conf          # ajuste PGDATABASE e a senha

# 5. Confirme que o Postgres já aceita sem senha
sudo -u analytics psql -d erp_do_cliente -c 'SELECT current_user'
```

Este último passo decide a configuração do banco.

Como o usuário do sistema se chama `analytics` — **igual ao papel no
Postgres** — a autenticação `peer` reconhece um pelo outro e **não pede
senha**. É o padrão da linha `local` no `pg_hba.conf` da maioria das
distribuições. Não há senha para guardar, nem arquivo para proteger.

- **Respondeu `analytics`:** deixe `PGHOST=""` no conf. Acabou.
- **Deu `peer authentication failed`:** o `pg_hba.conf` não usa peer nesta
  máquina. Volte para TCP com senha:

```bash
sudo mkdir -p /var/lib/analytics
sudo chown analytics:analytics /var/lib/analytics
echo 'localhost:5432:erp_do_cliente:analytics:SENHA' | \
  sudo -u analytics tee /var/lib/analytics/.pgpass >/dev/null
sudo -u analytics chmod 600 /var/lib/analytics/.pgpass
```

E no `/etc/mgsis-ingest.conf`: `PGHOST="localhost"` mais
`export PGPASSFILE="/var/lib/analytics/.pgpass"` — o caminho precisa ser
explícito porque o usuário é de serviço e não tem home.

## Primeiro teste, sem enviar nada

`--simular` monta as consultas, mostra o volume e **não envia**:

```bash
sudo -u analytics mgsis-ingest.sh --periodo 2026-07 --simular
```

Saída esperada:

```
2026-08-11 14:03:01  período 2026-07
  vendas 2026-07: 21638 linhas · 9724 KB · SIMULADO (não enviado)
  orcamentos 2026-07: 18402 linhas · 7215 KB · SIMULADO (não enviado)
  ...
```

Se aqui já der erro, é permissão ou view faltando — nada saiu da máquina.

## Envio de um mês, de verdade

```bash
sudo -u analytics mgsis-ingest.sh --periodo 2026-07
```

Confira no Analytics se o mês aparece. Pode repetir à vontade: a operação é
**idempotente** — reenviar o mesmo período dá exatamente o mesmo resultado.

## Carga inicial

Mês a mês, do início do histórico até hoje, mais a foto de estoque:

```bash
sudo -u analytics mgsis-ingest.sh --inicial 2022-01 | tee /tmp/carga-inicial.log
```

São ~5 s por mês de vendas. Cinco anos ficam na casa de poucos minutos por
dataset. Se cair no meio, **rode de novo o mesmo comando**: os meses já
enviados são reescritos com o mesmo conteúdo.

## Ciclo automático

```bash
sudo install -m 644 systemd/mgsis-ingest.service /etc/systemd/system/
sudo install -m 644 systemd/mgsis-ingest.timer   /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now mgsis-ingest.timer

systemctl list-timers mgsis-ingest.timer     # confere o próximo disparo
journalctl -u mgsis-ingest.service -f        # acompanha
```

Sem systemd, no cron:

```cron
7 */2 * * * analytics /usr/local/bin/mgsis-ingest.sh --ciclo >> /var/log/mgsis-ingest.log 2>&1
```

### Por que o ciclo manda o mês anterior junto

> Dia 1º de agosto, alguém lança no ERP uma venda **datada de 31 de julho**.

Se o ciclo só reescrevesse agosto, essa venda cairia em julho — que não é mais
reenviado — e **nunca chegaria** ao Analytics. O mês ficaria permanentemente
errado, sem sinal de erro. Incluir o mês anterior fecha essa janela.

## O que isso não cobre

**Correção retroativa fora da janela não chega sozinha.** Se alguém corrigir
uma nota de março de 2024, o Analytics segue mostrando o valor antigo até que
alguém reenvie aquele período:

```bash
sudo -u analytics mgsis-ingest.sh --periodo 2024-03
```

Vale agendar uma recarga da janela completa uma vez por mês, de madrugada:

```cron
0 3 1 * * analytics /usr/local/bin/mgsis-ingest.sh --inicial 2022-01 >> /var/log/mgsis-ingest.log 2>&1
```

## A proteção que você não deve desligar

A operação da API é *"substitua o período por estas linhas"* — mandar zero
linhas **apaga** aquele período. Se a consulta ao ERP voltar vazia por defeito
(view recriada, permissão revogada, filtro errado), enviar destruiria dado bom
sem sinal nenhum.

Por isso o agente **pula períodos vazios** e registra no log:

```
  vendas 2026-07: 0 linhas — PULADO (envio vazio apagaria o período)
```

`PERMITIR_VAZIO="sim"` desliga essa proteção. Use só quando a intenção for
mesmo apagar um período.

## Quando algo dá errado

| Sintoma | Causa provável |
|---|---|
| `401 Token de integração inválido ou revogado` | Gerar um novo token invalida o anterior. Refaça o passo 3. |
| `403` | A empresa está suspensa no Analytics. |
| `413 Lote com N linhas excede o limite` | Mês grande demais (>150.000 linhas). Use `--periodo 2026-05-01..2026-05-15` direto na API, ou fale com o suporte. |
| `422 ... campo "x" — data fora de 1990–2035` | Digitação no ERP (2220 no lugar de 2022). As views já limpam data OPCIONAL fora de faixa; se for obrigatória, corrija no ERP. Liste com `sql dados/datas-impossiveis.sql`. |
| `422 Linha N inválida: campo "x"` | Uma view foi alterada e voltou a produzir `NULL`. A resposta traz a linha e o campo. |
| `permission denied for view bi_x` | Faltou o `GRANT SELECT` daquela view. |
| `outra execução em andamento — saindo` | Normal: o ciclo esbarrou numa carga inicial ainda rodando. |

O agente sai com **código 1** se qualquer envio falhar, então o systemd e o
cron marcam a falha — não é preciso ler o log para saber que houve problema.

## Primeira carga

O roteiro completo, da máquina zerada até o ciclo ligado, está em
[PRIMEIRA-CARGA.md](PRIMEIRA-CARGA.md) — inclusive os passos que confirmam as
views e a janela de histórico antes de mandar qualquer coisa.

## Referências

- Contrato da API, limites e exemplos: [`../INGESTAO-API.md`](../INGESTAO-API.md)
- Mapeamento campo a campo view → API: [`../sql dados/MAPEAMENTO-API.md`](../sql%20dados/MAPEAMENTO-API.md)
