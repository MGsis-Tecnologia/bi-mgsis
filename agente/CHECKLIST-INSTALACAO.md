# Checklist de Instalação MGSIS Analytics

Use este checklist para acompanhar cada etapa da instalação automatizada.

## ✅ Pré-Instalação

- [ ] Linux servidor (Ubuntu 18+, Debian 10+, etc.)
- [ ] Acesso root (sudo) no servidor
- [ ] PostgreSQL instalado e rodando
- [ ] Banco ERP já criado
- [ ] `psql` e `curl` disponíveis no PATH
- [ ] Arquivo `setup_analytics.sh` copiado para o servidor
- [ ] Token de integração gerado em Master → Empresas → (empresa) → token
- [ ] Token guardado em local seguro (aparece UMA ÚNICA VEZ)

## 📋 Coleta de Informações

Antes de rodar o script, reúna:

```
Banco de dados:
  Nome: ___________________________
  Host Postgres: ___________________________
  Porta: ___________________________
  Usuário admin: ___________________________

Token (64 hex):
  _______________________________________________________________
  _______________________________________________________________

Histórico:
  Mês inicial (ex: 2022-01) ou deixar vazio: ___________________________

Automação:
  [ ] systemd (recomendado)
  [ ] cron (tradicional)
```

## 🚀 Execução do Setup

```bash
# Acesse o diretório com o script
cd /tmp  # (ou onde copiou)

# Execute como root
sudo bash setup_analytics.sh
```

- [ ] Script validou pré-requisitos (bash, psql, curl)
- [ ] Respondeu perguntas sobre Postgres
- [ ] Respondeu sobre token
- [ ] Respondeu sobre automação
- [ ] Respondeu sobre histórico
- [ ] Confirmou resumo da instalação
- [ ] Script começou execução

## ⚡ Etapas do Script

Acompanhe cada seção:

### Usuário de Sistema
- [ ] Usuário `analytics` criado com sucesso

### Usuário Postgres
- [ ] Usuário `analytics` criado com sucesso no banco

### Views
- [ ] Views criadas com sucesso

### Agente
- [ ] `/usr/local/bin/mgsis-ingest.sh` instalado (755)

### Token
- [ ] `/etc/mgsis-token` instalado (600)
- [ ] Propriedade: `analytics:analytics`

### Configuração
- [ ] `/etc/mgsis-ingest.conf` gerado (640)
- [ ] Se TCP com senha: `/var/lib/analytics/.pgpass` criado (600)

### Testes
- [ ] ✓ Conexão ao Postgres OK
- [ ] ✓ Views encontradas
- [ ] ✓ Permissões do usuário OK
- [ ] ✓ Simulação funcionou

### Automação
- [ ] systemd timer instalado E ativado (se escolheu systemd)
- [ ] cron criado em `/etc/cron.d/mgsis-ingest` (se escolheu cron)

## 🧪 Testes Pós-Instalação

Após o script terminar, rode estes testes manualmente:

### 1. Verificar arquivos

```bash
sudo ls -la /etc/mgsis-*
sudo ls -la /usr/local/bin/mgsis-ingest.sh
```

- [ ] Todos os arquivos existem com permissões corretas

### 2. Conferir configuração

```bash
sudo cat /etc/mgsis-ingest.conf
```

- [ ] API_URL correto
- [ ] PGDATABASE correto
- [ ] TOKEN_FILE = /etc/mgsis-token
- [ ] LOCK_FILE = /var/lock/mgsis-ingest.lock

### 3. Testar simulação

```bash
sudo -u analytics /usr/local/bin/mgsis-ingest.sh --periodo $(date +%Y-%m) --simular
```

Esperado:
```
2026-09-24 14:30:15  período 2026-09
  vendas 2026-09: 1234 linhas · 512 KB · SIMULADO (não enviado)
  orcamentos 2026-09: 567 linhas · 234 KB · SIMULADO (não enviado)
  ...
```

- [ ] Simulação retorna dados (não zero)
- [ ] Diz "SIMULADO" (não foi enviado)
- [ ] Sem erros de permissão

### 4. Testar envio real (um período)

```bash
sudo -u analytics /usr/local/bin/mgsis-ingest.sh --periodo $(date +%Y-%m)
```

Esperado:
```
2026-09-24 14:32:15  período 2026-09
  vendas 2026-09: 1234 linhas · 512 KB
  orcamentos 2026-09: 567 linhas · 234 KB
  ...
  ✓ OK
```

- [ ] Envia dados sem erros
- [ ] Mostra "✓ OK" no final

### 5. Verificar no Analytics

Vá para https://analytics.mgsis.com:

- [ ] Empresa está visível
- [ ] Mês enviado mostra dados (vendas, orçamentos, etc.)
- [ ] Nenhum erro de token ou autenticação

### 6. Verificar automação

**Se systemd:**
```bash
sudo systemctl list-timers mgsis-ingest.timer
sudo systemctl status mgsis-ingest.timer
sudo journalctl -u mgsis-ingest.service -n 20
```

- [ ] Timer está ativo/enabled
- [ ] Próxima execução está agendada
- [ ] Log mostra execuções bem-sucedidas

**Se cron:**
```bash
sudo cat /etc/cron.d/mgsis-ingest
sudo tail -50 /var/log/mgsis-ingest.log
```

- [ ] Arquivo cron existe
- [ ] Log mostra execuções programadas

## 📊 Carga Inicial (Opcional)

Se quer carregar histórico completo:

```bash
# Simule primeiro
sudo -u analytics /usr/local/bin/mgsis-ingest.sh --inicial 2022-01 --simular | head -20

# Depois rode de verdade (pode levar minutos/horas)
sudo -u analytics /usr/local/bin/mgsis-ingest.sh --inicial 2022-01 | tee /tmp/carga-inicial.log
```

- [ ] Carga inicial começou
- [ ] Progride mês a mês sem erros
- [ ] Todos os períodos chegam ao Analytics

## 🔧 Troubleshooting Rápido

Se algo deu errado:

### "permission denied for view"
```bash
sudo -u postgres psql -d seu_erp -c "GRANT SELECT ON bi_movimento TO analytics;"
```
- [ ] Permissão ajustada

### "peer authentication failed"
Rode novamente e escolha TCP em vez de socket:
```bash
sudo bash setup_analytics.sh
```
- [ ] Setup refeito com TCP

### Token recusado
Gere novo token no Analytics e atualize:
```bash
echo 'NOVO_TOKEN_64_HEX' | sudo tee /etc/mgsis-token >/dev/null
sudo chmod 600 /etc/mgsis-token
```
- [ ] Token atualizado

### Logs vazios/erros
Confira logs:
```bash
# systemd:
sudo journalctl -u mgsis-ingest.service -n 100

# cron:
sudo tail -100 /var/log/mgsis-ingest.log
```
- [ ] Identificado o problema

## 📝 Próximas Execuções

Depois que tudo estiver funcionando:

### Ciclo horário automático
- Roda de hora em hora (minuto :07)
- Envia: mês corrente + anterior + últimos 12 meses de receber + histórico inteiro de pagar + fotos
- Acompanhe com logs

### Recarga noturna automática (3 da manhã)
- Recarrega receber e pagar completos
- Garante que títulos antigos com baixa recente cheguem ao Analytics

### Manual, quando necessário

Corrigir período específico:
```bash
sudo -u analytics /usr/local/bin/mgsis-ingest.sh --periodo 2026-05
```

Recarga completa (todos os datasets, todos os períodos):
```bash
sudo -u analytics /usr/local/bin/mgsis-ingest.sh --inicial 2022-01
```

## ✨ Sinais de Sucesso

Você saberá que deu certo quando:

- ✅ Dados aparecem no Analytics
- ✅ Cada mês é atualizado sozinho (automação rodando)
- ✅ Logs não mostram erros
- ✅ Títulos com baixa aparecem corretamente
- ✅ Estoque mostra foto atual
- ✅ Câmbio está atualizado

## 📞 Suporte

Se tudo deu certo mas ainda tem dúvidas:

- Confira [README.md](README.md) para instru detalhadas
- Confira [INGESTAO-API.md](../INGESTAO-API.md) para especificação da API
- Confira os logs: `journalctl` ou `/var/log/mgsis-ingest.log`

---

**Data de instalação:** ________________
**Versão do script:** ________________
**Responsável:** ________________

