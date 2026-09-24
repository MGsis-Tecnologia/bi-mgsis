# 🚀 Comece Aqui — Setup MGSIS Analytics

Bem-vindo! Você tem tudo pronto para instalar o agente de ingestão de dados ao MGSIS Analytics.

## 📦 O Que Você Tem

```
📁 agente/
├─ setup_analytics.sh          ← O script que faz tudo
├─ mgsis-ingest.sh             ← Agente de ingestão (usado pelo script)
├─ mgsis-ingest.conf.exemplo   ← Modelo de configuração
├─ systemd/
│  ├─ mgsis-ingest.service
│  └─ mgsis-ingest.timer       ← Automação moderna (opcional)
│
├─ COMECE-AQUI.md              ← Este arquivo
├─ SETUP-ANALYTICS.md          ← Guia passo-a-passo interativo
├─ RESUMO-SETUP.md             ← Visão geral do processo
├─ QUICK-REFERENCE.md          ← Comandos rápidos
├─ CHECKLIST-INSTALACAO.md     ← Checklist de validação
├─ README.md                   ← Documentação detalhada
└─ PRIMEIRA-CARGA.md           ← Carga histórica manual

📁 sql dados/
├─ instalar-views.sql          ← Views em um arquivo
├─ analytics_usuario.sql       ← Criação de usuário
├─ MAPEAMENTO-API.md           ← Campo a campo
└─ bi_*.sql                    ← Views individuais
```

## ⚡ Instalação Rápida (3 passos)

### 1️⃣ Copie para o servidor

```bash
# No servidor Linux do cliente, como qualquer usuário:
scp agente/setup_analytics.sh usuario@servidor-erp:/tmp/
# ou copie por SFTP/Git
```

### 2️⃣ Execute como root

```bash
# No servidor, entre como root:
sudo bash /tmp/setup_analytics.sh

# Responda 4 perguntas:
# - Banco de dados (host, porta, nome)
# - Token (cola ou deixa vazio para depois)
# - Automação (systemd ou cron)
# - Histórico (deixa vazio, geralmente)
```

### 3️⃣ Confirme

```bash
# Teste que funcionou:
sudo -u analytics mgsis-ingest.sh --periodo 2026-09 --simular

# Confira dados no Analytics
# https://analytics.mgsis.com
```

**Pronto!** Dados chegam automaticamente a cada hora.

## 📚 Como Usar Este Material

### 👤 Você é...

**🔧 DevOps / Sysadmin**
→ Leia `SETUP-ANALYTICS.md` e rode o script. Depois, `QUICK-REFERENCE.md` para manutenção.

**📋 QA / Implementador**
→ Leia `CHECKLIST-INSTALACAO.md` enquanto acompanha a instalação.

**🏢 Gerente / Stakeholder**
→ Leia `RESUMO-SETUP.md` para entender o processo (5 min).

**👨‍💻 Desenvolvedor (integração futura)**
→ Leia `INGESTAO-API.md` para especificação técnica.

**❓ "Preciso resolver um problema"**
→ Vá para `QUICK-REFERENCE.md` → Troubleshooting.

## 📖 Documentação por Tópico

| Tópico | Arquivo | Tempo |
|--------|---------|-------|
| Como instalar | `SETUP-ANALYTICS.md` | 10 min |
| Visão geral | `RESUMO-SETUP.md` | 5 min |
| Primeira vez | `PRIMEIRA-CARGA.md` | 15 min |
| Validar instalação | `CHECKLIST-INSTALACAO.md` | 20 min |
| Referência rápida | `QUICK-REFERENCE.md` | 2 min |
| Documentação completa | `README.md` | 30 min |
| API especificação | `INGESTAO-API.md` | 20 min |
| Campo-a-campo | `MAPEAMENTO-API.md` | 15 min |

## 🎯 Fluxo de Instalação Visual

```
┌──────────────────────────────────────────┐
│  Você tem os 3 elementos necessários:     │
├──────────────────────────────────────────┤
│  1. Script setup_analytics.sh             │
│  2. Token de integração (do Analytics)    │
│  3. Acesso root ao servidor Linux         │
└──────────────────────────────────────────┘
                      ↓
┌──────────────────────────────────────────┐
│  sudo bash setup_analytics.sh             │
├──────────────────────────────────────────┤
│  O script:                                │
│  ✓ Cria usuário analytics no Postgres    │
│  ✓ Cria 9 views bi_*                     │
│  ✓ Instala agente                        │
│  ✓ Configura tudo automaticamente        │
│  ✓ Testa conexões                        │
│  ✓ Ativa automação (systemd/cron)        │
└──────────────────────────────────────────┘
                      ↓
┌──────────────────────────────────────────┐
│  ✅ Pronto para usar                     │
├──────────────────────────────────────────┤
│  • Cada hora: ciclo automático            │
│  • 3 da manhã: recarga financeira         │
│  • Dados aparecem em minutes no Analytics │
└──────────────────────────────────────────┘
```

## 🔑 Conceitos-Chave

### Views
9 "janelas" de leitura no banco ERP. São SELECT puro, não alteram dados.

```
bi_movimento    ← vendas
bi_compras      ← compras
bi_orcamentos   ← orçamentos
bi_receber      ← contas a receber
bi_pagar        ← contas a pagar
bi_caixa        ← movimentações de caixa
bi_estoque      ← foto do estoque (snapshot)
bi_empresa      ← cadastro de empresas
bi_cambio       ← câmbio histórico
```

### Usuário `analytics`
Usuário do Postgres que roda o agente. **Só consegue ler as views**, não as tabelas. É segurança.

### Agente `mgsis-ingest.sh`
Script bash que:
1. Lê dados das views via `psql`
2. Converte para JSON
3. Envia para API do Analytics via `curl`
4. Registra em log

Roda automaticamente a cada hora (ou conforme cron).

### Token
Senha de integração (64 hex) gerada em Master → Empresas → (sua empresa) → token de integração.

Aparece **UMA ÚNICA VEZ**. Se perder, gera novo (invalida o anterior).

## ✅ Checklist Pré-Instalação

Antes de rodar o script, reúna:

- [ ] Acesso sudo ao servidor Linux
- [ ] Nome do banco de dados ERP
- [ ] Host/porta do Postgres (geralmente localhost:5432)
- [ ] Usuário admin do Postgres (geralmente `postgres`)
- [ ] Token de 64 hex (gerado no Analytics)
- [ ] Decisão: systemd (moderno) ou cron (tradicional)?

## 🚨 Pontos Importantes

### ⚠️ O Token Aparece UMA ÚNICA VEZ

Quando você gera em Master → Empresas → (empresa) → token de integração, o Analytics mostra **uma única vez**. Se não copiar, tem que gerar outro (invalida o anterior).

**Salve em local seguro antes de criar o setup.**

### ⚠️ Permissões Restritas

O usuário `analytics` **só consegue ler as 9 views**. Não tem acesso a:
- `pessoa` (clientes/fornecedores completo)
- `pedido` (notas completo)
- `produto` (catálogo completo)
- Nenhuma outra tabela

É segurança — o agente não consegue vazar dados além do que você decidiu expor nas views.

### ⚠️ Linha de Fim de Arquivo (Windows → Linux)

Se você copiar os arquivos de uma máquina Windows, confira fim de linha:

```bash
file agente/setup_analytics.sh
# Não pode dizer "CRLF line terminators"
# Se disser, rode:
sed -i 's/\r$//' agente/setup_analytics.sh
```

Git automático resolve isso se clonar pelo `git clone`.

## 🎬 Próximos Passos

### Opção A: Instalação Rápida (Recomendado)

```bash
# Leia:
cat SETUP-ANALYTICS.md

# Rode:
sudo bash setup_analytics.sh

# Teste:
sudo -u analytics mgsis-ingest.sh --periodo 2026-09 --simular
```

**Tempo:** 5 minutos

### Opção B: Entender Primeiro

```bash
# Leia nesta ordem:
1. RESUMO-SETUP.md (5 min) — visão geral
2. SETUP-ANALYTICS.md (10 min) — guia de instalação
3. QUICK-REFERENCE.md (2 min) — referência rápida

# Depois rode o setup
sudo bash setup_analytics.sh
```

**Tempo:** 20 minutos

### Opção C: Instalação Manual Passo-a-Passo

```bash
# Se preferir fazer tudo manualmente:
cat PRIMEIRA-CARGA.md  # 10 passos detalhados

# Use README.md como referência
cat README.md
```

**Tempo:** 45 minutos

## 💬 FAQ Rápido

**P: Qual é a diferença entre systemd e cron?**
R: Systemd é moderno (Ubuntu 18+), melhor logging. Cron é tradicional, funciona em qualquer distro. O script suporta ambos.

**P: Quanto tempo leva a instalação?**
R: O script leva ~2-5 minutos. Testes depois levam ~5 minutos.

**P: E se der erro?**
R: Leia `QUICK-REFERENCE.md` seção troubleshooting. A maioria dos erros é "token inválido" ou "permissão".

**P: Posso rodar em um banco de testes primeiro?**
R: Sim! O setup é seguro — só cria usuário, views e agente. Nenhum dado do ERP é alterado.

**P: Como atualizar o agente depois?**
R: Copie novo `mgsis-ingest.sh` para `/usr/local/bin/`. A configuração fica intacta.

**P: Posso desativar a automação depois?**
R: Sim. Systemd: `sudo systemctl disable mgsis-ingest.timer`. Cron: `sudo rm /etc/cron.d/mgsis-ingest`.

## 📞 Suporte

- **Instalação:** Leia `SETUP-ANALYTICS.md`
- **Problema:** Leia `QUICK-REFERENCE.md` → Troubleshooting
- **Entender tudo:** Leia `README.md`
- **API:** Leia `INGESTAO-API.md`

---

## 🏁 Comece Agora

```bash
# Copie para o servidor:
scp agente/setup_analytics.sh usuario@servidor:/tmp/

# Entre no servidor:
ssh usuario@servidor
sudo bash /tmp/setup_analytics.sh

# Pronto!
```

**Boa instalação!** 🎉

---

*Última atualização: 2026-09-24*
*Versão: 1.0*
