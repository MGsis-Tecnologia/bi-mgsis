# Setup MGSIS Analytics — Guia de Instalação Automatizado

Este script (`setup_analytics.sh`) automatiza toda a instalação do agente de ingestão de dados para o MGSIS Analytics.

## ⚡ Início Rápido

```bash
# No servidor Linux do cliente, como root:
sudo bash setup_analytics.sh
```

O script fará perguntas interativas e depois:
1. Criará o usuário `analytics` no Postgres
2. Criará as views `bi_*` no banco ERP
3. Instalará o agente em `/usr/local/bin/`
4. Configurará `/etc/mgsis-ingest.conf`
5. Instalará o token em `/etc/mgsis-token`
6. Configurará cron com ciclo + recarga noturna
7. Testará todas as conexões

## 📋 Pré-requisitos

- **Sistema:** Linux com sudo
- **Ferramentas:** bash, psql (PostgreSQL client), curl
- **Acesso:** Superusuário do PostgreSQL
- **Rede:** Acesso a https://analytics.mgsis.com
- **Token:** De `Master → Empresas → (empresa) → token de integração`

> O token aparece **uma única vez** — guarde em local seguro antes de criar o setup.

## 🎯 O Que o Script Faz (Passo a Passo)

### 1. Validação de Pré-requisitos

Confere se você tem `bash`, `psql` e `curl` instalados. Também valida que está rodando como root.

### 2. Perguntas Interativas

#### **Conexão ao Postgres**

```
Use socket local (peer auth, sem senha)? [Y/n]
```

- **Sim (recomendado):** Usa Unix socket local, sem senha. Funciona se o `pg_hba.conf` tiver `peer` na linha `local` (padrão em maioria das distribuições).
  
  ```bash
  # Confirme que funciona:
  sudo -u analytics psql -d seu_erp -c 'SELECT current_user'
  ```
  
  Se retornar `analytics`, está perfeito. ✓

- **Não:** Usa TCP com host + porta + senha. Use se o socket local não funcionar.

**Banco de dados:** Nome do banco ERP (ex: `erp_do_cliente`)

**Usuário admin:** Usuário com permissão de criar role (geralmente `postgres`)

#### **Token de Integração**

```
Cole o token de 64 caracteres hexadecimais:
```

- **Tem o token agora:** Cole aqui. O script valida que tem exatamente 64 hex.
- **Não tem:** O script deixa em branco e você configura depois manualmente.

#### **Histórico (Opcional)**

```
Mês inicial para histórico (YYYY-MM) [deixe vazio para auto-descobrir]:
```

- **Deixe vazio (recomendado):** O agente descobrirá automaticamente pela menor data nas views.
- **Especifique (ex: 2022-01):** Útil se houver datas absurdas no ERP (ex: 1990) que você quer ignorar.

### 3. Execução da Instalação

O script executa nesta ordem:

1. **Criar usuário Postgres `analytics`**
   ```sql
   CREATE ROLE analytics LOGIN PASSWORD '...';
   ```
   
   Com socket local: sem senha (peer auth).
   Com TCP: com senha temporária.

2. **Criar views `bi_*`**
   - `bi_movimento` (vendas)
   - `bi_orcamentos` (orçamentos)
   - `bi_receber` (contas a receber)
   - `bi_pagar` (contas a pagar)
   - `bi_caixa` (movimentações)
   - `bi_estoque` (foto do estoque)
   - `bi_compras` (compras)
   - `bi_empresa` (cadastro de empresas)
   - `bi_cambio` (câmbio)

3. **Criar usuário de sistema `analytics`**
   ```bash
   useradd --system --no-create-home --shell /usr/sbin/nologin analytics
   ```

4. **Instalar agente**
   ```
   /usr/local/bin/mgsis-ingest.sh  (755)
   ```

5. **Instalar token**
   ```
   /etc/mgsis-token  (600, owned by analytics:analytics)
   ```

6. **Gerar configuração**
   ```
   /etc/mgsis-ingest.conf  (640, group readable por analytics)
   ```

7. **Testar tudo**
   - Conexão ao Postgres ✓
   - Views criadas ✓
   - Permissões do usuário ✓
   - Simulação de ingestão ✓

8. **Instalar automação**
   - **systemd:** Ativa `mgsis-ingest.timer` que dispara a cada hora
   - **cron:** Cria `/etc/cron.d/mgsis-ingest` com dois agendamentos:
     - `7 * * * * analytics /usr/local/bin/mgsis-ingest.sh --ciclo` (cada hora)
     - `0 3 * * * analytics /usr/local/bin/mgsis-ingest.sh --recarga-financeira` (3 da manhã)

## 📝 Exemplo de Execução Interativa

```bash
$ sudo bash setup_analytics.sh

╔════════════════════════════════════════════════════════════╗
║  SETUP MGSIS Analytics — Instalação Completa             ║
╚════════════════════════════════════════════════════════════╝

ℹ  Validando pré-requisitos...
✓  Todos os pré-requisitos OK

──────────────────────────────────────────────────────────

ℹ  Configuração da conexão ao Postgres (banco ERP)

Use socket local (peer auth, sem senha)? [Y/n] y
ℹ  Socket local: psql se conectará via Unix socket sem senha

Nome do banco de dados [erp_do_cliente]: meu_erp
Usuário Postgres de administrador [postgres]: postgres

ℹ  Vou usar: host=unix socket, port=5432, db=meu_erp, admin_user=postgres

──────────────────────────────────────────────────────────

ℹ  Token de integração MGSIS Analytics

Cole o token de 64 caracteres hexadecimais:
✓  Token validado

──────────────────────────────────────────────────────────

ℹ  Automação — Cron
ℹ  Vou configurar dois agendamentos:
  • Cada hora (:07): mgsis-ingest.sh --ciclo
  • 3 da manhã: mgsis-ingest.sh --recarga-financeira

──────────────────────────────────────────────────────────

ℹ  Vou executar:
  ✓ Criar usuário 'analytics' no Postgres
  ✓ Criar views bi_* para analytics
  ✓ Criar usuário de sistema 'analytics'
  ✓ Instalar agente em /usr/local/bin/
  ✓ Instalar token em /etc/mgsis-token
  ✓ Gerar /etc/mgsis-ingest.conf
  ✓ Instalar cron (ciclo horário + recarga noturna)
  ✓ Testar conexões e views

Confirma? (s/n) s

ℹ  Criando usuário de sistema 'analytics'...
✓  Usuário de sistema criado

ℹ  Criando usuário analytics no Postgres...
✓  Usuário analytics criado com sucesso

ℹ  Criando views bi_* no banco...
✓  Views criadas com sucesso

ℹ  Instalando agente em /usr/local/bin/...
✓  Agente instalado em /usr/local/bin/mgsis-ingest.sh

ℹ  Instalando token...
✓  Token instalado em /etc/mgsis-token

ℹ  Gerando /etc/mgsis-ingest.conf...
✓  Configuração criada em /etc/mgsis-ingest.conf

ℹ  Testando conexão ao Postgres...
✓  Conexão ao Postgres OK (socket local, peer auth)

ℹ  Verificando se as views foram criadas...
✓  View bi_movimento existe
✓  View bi_orcamentos existe
✓  View bi_receber existe
✓  View bi_pagar existe
✓  View bi_caixa existe
✓  View bi_estoque existe

ℹ  Testando permissões do usuário analytics...
✓  Usuário analytics consegue ler as views

ℹ  Teste de simulação (sem enviar dados)...
✓  Simulação funcionou

ℹ  Instalando cron...
✓  Cron instalado em /etc/cron.d/mgsis-ingest
✓  Arquivo de log criado em /var/log/mgsis-ingest.log

╔════════════════════════════════════════════════════════════╗
║  INSTALAÇÃO CONCLUÍDA COM SUCESSO                         ║
╚════════════════════════════════════════════════════════════╝

✓ Arquivos instalados:
  • Agente:         /usr/local/bin/mgsis-ingest.sh
  • Configuração:   /etc/mgsis-ingest.conf
  • Token:          /etc/mgsis-token

✓ Próximos passos:
  1. Conferir a configuração:
       sudo cat /etc/mgsis-ingest.conf

  2. Testar uma simulação:
       sudo -u analytics mgsis-ingest.sh --periodo 2026-09 --simular

  3. Testar um envio real:
       sudo -u analytics mgsis-ingest.sh --periodo 2026-09

  4. Verificar no Analytics se os dados chegaram

  5. Acompanhar logs automáticos:
       sudo tail -f /var/log/mgsis-ingest.log

✓ Documentação:
  • Guia completo:  agente/README.md
  • API:            INGESTAO-API.md
  • Mapeamento:     sql dados/MAPEAMENTO-API.md
```

## 🧪 Testes Após Instalação

### Simular uma ingestão (SEM enviar)

```bash
sudo -u analytics mgsis-ingest.sh --periodo 2026-09 --simular
```

Resposta esperada: mostra quantas linhas de cada dataset, tamanho em KB, e **SIMULADO**.

### Enviar um período real

```bash
sudo -u analytics mgsis-ingest.sh --periodo 2026-09
```

### Acompanhar automação (Cron)

```bash
sudo tail -f /var/log/mgsis-ingest.log
```

### Verificar agendamento (Cron)

```bash
sudo cat /etc/cron.d/mgsis-ingest
```

## ⚙️ Configuração Manual Posterior

Se precisar ajustar depois, edite:

```bash
sudo nano /etc/mgsis-ingest.conf
```

Cron recarrega automaticamente — a próxima execução usa a nova configuração.

## 🔄 Atualizando o Agente

Se houver nova versão do `mgsis-ingest.sh`:

```bash
sudo install -m 755 /caminho/para/novo/mgsis-ingest.sh /usr/local/bin/mgsis-ingest.sh
```

Nenhuma outra configuração é necessária — o novo agente usa os mesmos arquivos de conf e token.

## 🆘 Troubleshooting

### "peer authentication failed"

O script detectou que o `pg_hba.conf` não usa `peer` na linha `local`. Rerun com TCP:

```bash
sudo bash setup_analytics.sh
# Responda "n" para socket local
```

### Token inválido

Formato errado (não é 64 hex) — refaça:

```bash
echo 'TOKEN_CORRETO_64_HEX' | sudo tee /etc/mgsis-token >/dev/null
sudo chmod 600 /etc/mgsis-token
```

### Views não encontradas

Verifique manualmente:

```bash
psql -U postgres -d seu_erp -c '\dv bi_*'
```

Se não aparecerem, o script pode não ter conseguido rodar o SQL. Tente manualmente:

```bash
psql -U postgres -d seu_erp -f sql\ dados/instalar-views.sql
```

### "401 Token inválido ou revogado"

Gerar um novo token no Analytics invalida o anterior. Gere um novo e atualize:

```bash
echo 'NOVO_TOKEN_64_HEX' | sudo tee /etc/mgsis-token >/dev/null
sudo chmod 600 /etc/mgsis-token
```

### "permission denied for view bi_x"

O usuário `analytics` não tem permissão. Rode como superusuário:

```bash
psql -U postgres -d seu_erp -c "GRANT SELECT ON bi_movimento TO analytics;"
```

## 📚 Documentação Relacionada

- [README.md](README.md) — Guia detalhado de instalação manual
- [INGESTAO-API.md](../INGESTAO-API.md) — Especificação da API
- [sql dados/MAPEAMENTO-API.md](../sql%20dados/MAPEAMENTO-API.md) — Campo a campo
- [PRIMEIRA-CARGA.md](PRIMEIRA-CARGA.md) — Roteiro passo-a-passo de implantação completa

## 💡 Dicas

1. **Faça backup do banco antes:** Este script cria usuários e views, mas não toca em dados de negócio. Ainda assim, sempre é bom estar preparado.

2. **Teste em staging primeiro:** Se possível, rode o setup em um servidor de teste antes de ir para produção.

3. **Guarde o token:** Não é possível recuperar um token já criado — apenas gerar um novo (o anterior vira inválido).

4. **Logs:** Confira `/var/log/mgsis-ingest.log` regularmente. O cron gera logs automáticos de cada execução.

5. **Primeira carga grande:** Se o histórico for grande (5+ anos), a primeira carga de vendas/receber pode levar alguns minutos. É normal — você pode acompanhar com `--simular` primeiro.

---

**Dúvidas?** Consulte a documentação em `.md` ou entre em contato com o suporte MGSIS.
