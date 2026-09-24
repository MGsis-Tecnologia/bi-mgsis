# MGSIS Analytics — Resumo Executivo do Setup

## 🎯 O Que Foi Criado

Você agora tem um **script de instalação automatizado** (`setup_analytics.sh`) que prepara um servidor Linux para ingerir dados ao MGSIS Analytics.

### Arquivos Criados

| Arquivo | Propósito | Público |
|---------|-----------|---------|
| `setup_analytics.sh` | Script interativo de instalação completa | ✅ Usar para instalar |
| `SETUP-ANALYTICS.md` | Guia detalhado do setup | ✅ Ler antes de rodar |
| `CHECKLIST-INSTALACAO.md` | Checklist passo-a-passo | ✅ Acompanhar durante |
| `RESUMO-SETUP.md` | Este arquivo | ✅ Entender o processo |

## 📦 O Que o Script Instala

Quando você roda `sudo bash setup_analytics.sh`, ele cria:

### 1. Banco de Dados (Postgres)

**Usuário:** `analytics`
- Só tem SELECT nas views `bi_*`
- Sem acesso às tabelas do ERP
- Autenticação via socket local (sem senha) ou TCP com senha

**Views:** 9 views de leitura
- `bi_movimento` — vendas
- `bi_orcamentos` — orçamentos  
- `bi_receber` — contas a receber
- `bi_pagar` — contas a pagar
- `bi_caixa` — movimentações de caixa
- `bi_estoque` — foto do estoque
- `bi_compras` — compras
- `bi_empresa` — cadastro de empresas
- `bi_cambio` — câmbio médio mensal

### 2. Sistema Linux

**Usuário de serviço:** `analytics`
- Sem shell, sem home
- Roda o agente 24/7

**Agente:** `/usr/local/bin/mgsis-ingest.sh`
- Script bash que lê as views e envia para a API
- Pré-compilado, pronto para usar

**Configuração:** `/etc/mgsis-ingest.conf`
- Connection strings
- Endpoints da API
- Comportamento (retry, timeout, etc.)
- Tudo gerado automaticamente

**Token:** `/etc/mgsis-token`
- 64 caracteres hexadecimais
- Autenticação na API do Analytics
- Só você fornece (colado no setup)

**Logs:** `/var/log/mgsis-ingest.log`
- Rastreabilidade de cada envio

### 3. Automação (Cron)

**Cron** — Dois agendamentos:
- `7 * * * *` — Ciclo horário (minuto 07, cada hora)
- `0 3 * * *` — Recarga noturna (3 da manhã)
- Logs em `/var/log/mgsis-ingest.log`

## 🔄 Como Funciona

### Ciclo Normal (Cada Hora)

```
Minuto :07 de cada hora:
├─ Lê: mês corrente + mês anterior
├─ Envia: vendas, compras, orçamentos, receber (últimos 12 meses), pagar (tudo)
├─ Fotos: estoque, empresa, câmbio (sempre completo)
└─ Respeita bloqueios: pula períodos vazios, valida datas, retry automático
```

**Por que enviar o mês anterior:**
- Alguém lança venda de 31 de julho no dia 1º de agosto
- Sem o mês anterior, essa venda cairia em julho (não reenviado) e nunca chegaria

**Por que receber reenvia 12 meses:**
- Título é emitido em março, mas baixado em setembro
- Sem a janela de 12 meses, seguiria "aberto" no Analytics para sempre
- Títulos >12 meses chegan na recarga da madrugada

### Recarga Noturna (3 da Manhã)

```
Todos os dias às 3 da manhã:
├─ Receber: histórico inteiro (descoberto automaticamente)
├─ Pagar: histórico inteiro (sem limite)
└─ Garante que títulos antigos com baixa recente sejam sincronizados
```

### Carga Inicial (Opcional)

```bash
sudo -u analytics mgsis-ingest.sh --inicial 2022-01
```

- Envia mês a mês do início do histórico até hoje
- ~5 segundos por mês de vendas
- 5 anos = poucos minutos por dataset
- Idempotente: pode rerun se cair no meio

## 🛡️ Segurança

- ✅ Usuário `analytics` **sem acesso** às tabelas do ERP (só às views)
- ✅ Token armazenado em arquivo com permissão 600 (`-rw-------`)
- ✅ Senhas do Postgres em `.pgpass` com permissão 600 (se TCP)
- ✅ Comunicação com Analytics via HTTPS
- ✅ Cada envio é idempotente (reenviar = mesmo resultado)

## 💾 Dados Enviados

Cada dataset é um "período" (mês, ou "tudo" para fotos):

**Vendas (bi_movimento)**
- Cliente, produto, quantidade, valor, desconto
- Custo (para análise de margem)
- Vendedor, marca, subgrupo
- Data e número da nota

**Compras (bi_compras)**
- Fornecedor, produto, quantidade, valor
- Data e número da nota

**Orçamentos (bi_orcamentos)**
- Cliente, linhas, quantidade total, valor
- Data do orçamento

**Receber (bi_receber)**
- Cliente, valor, data de emissão, vencimento
- Data e valor da baixa
- Juros, multa, desconto

**Pagar (bi_pagar)**
- Fornecedor, valor, data de emissão, vencimento
- Data e valor da baixa
- Juros, multa, desconto

**Caixa (bi_caixa)**
- Movimentação, tipo, valor
- Caixa de origem
- Data

**Estoque (bi_estoque)** — Foto
- Produto, quantidade, valor
- Almoxarifado

**Empresa (bi_empresa)** — Foto
- Identificação, CNPJ, cidade

**Câmbio (bi_cambio)** — Foto
- Moeda, taxa média mensal

Tudo filtrado para **datas válidas (1990–2035)** — digitos errados no ERP são capturados e rejeitados.

## 🚀 Como Usar

### Instalação

```bash
# No servidor Linux do cliente:
sudo bash setup_analytics.sh

# Responda perguntas interativas:
# - Banco de dados (nome, host, porta)
# - Token (cole ou deixe vazio para depois)
# - Histórico (mês inicial ou auto-descobrir)

# O script faz tudo:
# - Cria usuário analytics
# - Instala views
# - Cria agente
# - Configura automação
# - Testa tudo
```

### Teste Pós-Instalação

```bash
# Simular (sem enviar)
sudo -u analytics mgsis-ingest.sh --periodo 2026-09 --simular

# Enviar um período real
sudo -u analytics mgsis-ingest.sh --periodo 2026-09

# Verificar no Analytics se os dados chegaram
```

### Acompanhar Automação (Cron)

```bash
sudo tail -f /var/log/mgsis-ingest.log
```

### Se Algo Deu Errado

1. **Confira a configuração:**
   ```bash
   sudo cat /etc/mgsis-ingest.conf
   ```

2. **Teste conectividade ao Postgres:**
   ```bash
   sudo -u analytics psql -d seu_erp -c "SELECT COUNT(*) FROM bi_movimento"
   ```

3. **Valide o token:**
   ```bash
   sudo cat /etc/mgsis-token | wc -c
   # Deve ser 64 + newline
   ```

4. **Rode um teste manual:**
   ```bash
   sudo -u analytics mgsis-ingest.sh --periodo 2026-09 -vvv  # verbose
   ```

5. **Confira logs:**
   ```bash
   sudo grep "ERRO\|error" /var/log/mgsis-ingest.log | tail -20
   ```

## 📊 Monitoramento

### Sinais de Saúde

✅ **Tudo OK se:**
- Dados aparecem no Analytics dentro de minutos
- Cada período é atualizado automaticamente
- Logs não mostram erros
- Títulos com baixa aparecem corretamente

⚠️ **Atenção se:**
- Período fica 24h sem atualizar → confira automação
- Erro "Token inválido" → gere novo token
- Erro "permission denied" → refaça GRANT SELECT
- Período vazio → confira se há dados nas views

### Métricas

Esperado por período:

| Dataset | Linhas/mês | Tamanho |
|---------|-----------|---------|
| Vendas | 5–20 mil | 5–20 MB |
| Compras | 1–5 mil | 1–5 MB |
| Orçamentos | 2–10 mil | 2–8 MB |
| Receber | 5–50 mil | 5–50 MB |
| Pagar | 200–2 mil | 1–5 MB |
| Caixa | 100–1 mil | 0.5–2 MB |
| Estoque | — | 1–10 MB |
| Empresa | — | <1 MB |
| Câmbio | — | <1 MB |

Se significativamente maior, confira se não há dados duplicados na view.

## 🔧 Manutenção

### Atualizar o Agente

Nova versão lançada? Copie o novo arquivo:

```bash
sudo install -m 755 /caminho/novo/mgsis-ingest.sh /usr/local/bin/
```

Nenhuma reconfiguração necessária — usa o mesmo `/etc/mgsis-ingest.conf`.

### Regenerar Token

Novo token no Analytics invalida o anterior:

```bash
echo 'NOVO_TOKEN_64_HEX' | sudo tee /etc/mgsis-token >/dev/null
sudo chmod 600 /etc/mgsis-token
```

Próxima execução usa o novo.

### Limpar Logs

Cron rotaciona automaticamente os logs. Se necessário:
```bash
sudo truncate -s 0 /var/log/mgsis-ingest.log
```

## 📚 Documentação Completa

| Documento | Para Quem | Leia Se... |
|-----------|-----------|-----------|
| `SETUP-ANALYTICS.md` | Instalador | Vai rodar o setup |
| `README.md` | DBA | Quer entender a arquitetura |
| `PRIMEIRA-CARGA.md` | Implementador | Quer guia passo-a-passo manual |
| `INGESTAO-API.md` | Desenvolvedor | Vai integrar a API diretamente |
| `CHECKLIST-INSTALACAO.md` | QA | Vai validar instalação |
| `MAPEAMENTO-API.md` | Analista | Quer saber campo a campo |

## ✨ Resumo

```
┌─────────────────────────────────────────┐
│ Setup MGSIS Analytics                   │
├─────────────────────────────────────────┤
│                                         │
│  setup_analytics.sh                     │
│       ↓                                 │
│  1. Cria usuário Postgres analytics     │
│  2. Cria 9 views bi_*                   │
│  3. Instala agente mgsis-ingest.sh      │
│  4. Configura /etc/mgsis-ingest.conf    │
│  5. Instala token /etc/mgsis-token      │
│  6. Configura cron (ciclo + recarga)    │
│  7. Testa tudo                          │
│       ↓                                 │
│  ✓ Pronto para usar                     │
│                                         │
│  Execução automática (cron):            │
│  • Cada hora :07: ciclo horário         │
│  • 3 da manhã: recarga financeira       │
│                                         │
│  Dados no Analytics em minutos          │
│                                         │
└─────────────────────────────────────────┘
```

---

**Próximo passo:** Leia `SETUP-ANALYTICS.md` e rode o script!

**Dúvidas?** Confira `README.md` ou os logs.
