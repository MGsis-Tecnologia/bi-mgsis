# MGSIS Analytics — Quick Reference

## ⚡ Instalação (5 minutos)

```bash
sudo bash setup_analytics.sh
# Responda 4 perguntas, confirme, pronto!
```

## 🧪 Testes

```bash
# Simular
sudo -u analytics mgsis-ingest.sh --periodo 2026-09 --simular

# Enviar um mês
sudo -u analytics mgsis-ingest.sh --periodo 2026-09

# Carregar histórico completo (lento)
sudo -u analytics mgsis-ingest.sh --inicial 2022-01
```

## 📋 Acompanhar Automação

```bash
# systemd
sudo journalctl -u mgsis-ingest.service -f
sudo systemctl list-timers mgsis-ingest.timer

# cron
sudo tail -f /var/log/mgsis-ingest.log
sudo cat /etc/cron.d/mgsis-ingest
```

## 🔧 Troubleshooting Rápido

### "permission denied"
```bash
sudo -u postgres psql -d seu_erp -c "GRANT SELECT ON bi_movimento, bi_orcamentos, bi_receber, bi_pagar, bi_caixa, bi_estoque TO analytics;"
```

### "peer authentication failed"
Rode setup novamente e escolha TCP.

### "Token inválido"
```bash
# Gere novo no Analytics, depois:
echo 'NOVO_TOKEN' | sudo tee /etc/mgsis-token >/dev/null
sudo chmod 600 /etc/mgsis-token
```

### "connection refused"
Confira host/porta em `/etc/mgsis-ingest.conf` e conectividade ao Postgres.

## 📁 Arquivos Principais

| Arquivo | O quê | Editar? |
|---------|-------|---------|
| `/etc/mgsis-ingest.conf` | Configuração | Sim, se necessário |
| `/etc/mgsis-token` | Token 64 hex | Sim, ao regenerar |
| `/usr/local/bin/mgsis-ingest.sh` | Agente | Não (atualizar do repo) |
| `/var/log/mgsis-ingest.log` | Logs cron | Não |

## 📊 Espaço em Disco

Estimado mensalmente:

```
Vendas:      5–20 MB
Compras:     1–5 MB
Orçamentos:  2–8 MB
Receber:     5–50 MB
Pagar:       1–5 MB
Caixa:       0.5–2 MB
Estoque:     1–10 MB (foto)
Empresa:     <1 MB (foto)
Câmbio:      <1 MB (foto)
─────────────────────
Total:       ~20–100 MB/mês
```

## 🌐 Conectividade

```bash
# Testar conexão ao Analytics
curl -i https://analytics.mgsis.com/api/ingest/vendas

# Testar Postgres
sudo -u analytics psql -d seu_erp -c "SELECT COUNT(*) FROM bi_movimento"

# Testar token (formato)
cat /etc/mgsis-token | wc -c  # deve ser 65 (64 + newline)
```

## 📅 Agendamentos

```
Cada hora (:07)
├─ Mês corrente
├─ Mês anterior
├─ Últimos 12 meses receber
├─ Histórico inteiro pagar
└─ Fotos: estoque, empresa, câmbio

3 da manhã (0 3 * * *)
├─ Receber completo (histórico)
└─ Pagar completo (histórico)
```

## 💰 Limites da API

| Limite | Valor |
|--------|-------|
| Linhas por requisição | 150.000 |
| Tamanho por requisição | ~150 MB |
| Timeout | 300 segundos (default 600) |
| Retry | 3 (default) |
| Backoff | Exponencial |

## 🔐 Segurança

```bash
# Permissões corretas
/etc/mgsis-token              600 analytics:analytics
/etc/mgsis-ingest.conf        640 root:analytics
/var/lib/analytics/.pgpass    600 analytics:analytics
/usr/local/bin/mgsis-ingest.sh 755 root:root
```

## 📞 Contato & Docs

| Recurso | Link |
|---------|------|
| Instalação | `SETUP-ANALYTICS.md` |
| Manual Completo | `README.md` |
| Primeira Carga | `PRIMEIRA-CARGA.md` |
| API Spec | `INGESTAO-API.md` |
| Mapeamento | `MAPEAMENTO-API.md` |
| Checklist | `CHECKLIST-INSTALACAO.md` |
| Resumo | `RESUMO-SETUP.md` |

---

**Tudo funcionando?** Setup completo — nada mais a fazer.

**Algo errado?** Confira `RESUMO-SETUP.md` seção troubleshooting.
