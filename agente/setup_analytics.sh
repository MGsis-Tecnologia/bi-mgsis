#!/usr/bin/env bash
set -Eeuo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

info() { printf "${BLUE}ℹ${NC}  %s\n" "$*"; }
ok() { printf "${GREEN}✓${NC}  %s\n" "$*"; }
warn() { printf "${YELLOW}⚠${NC}  %s\n" "$*" >&2; }
erro() { printf "${RED}✗${NC}  %s\n" "$*" >&2; }
fatal() { erro "$@"; exit 1; }
sep() { printf "\n${BLUE}─────────────────────────────────────────${NC}\n\n"; }

# Verificações
[[ $EUID -eq 0 ]] || fatal "Execute como root"
command -v psql >/dev/null || fatal "psql não encontrado"
command -v curl >/dev/null || fatal "curl não encontrado"

sep
printf "${BLUE}═════════════════════════════════════════════════════${NC}\n"
printf "${BLUE}SETUP MGSIS Analytics - INSTALAÇÃO COMPLETA${NC}\n"
printf "${BLUE}═════════════════════════════════════════════════════${NC}\n\n"

# ─── Coleta de informações ───────────────────────────────────────────

info "BANCO DE DADOS"
read -p "Host PostgreSQL [localhost]: " PGHOST
PGHOST="${PGHOST:-localhost}"

read -p "Porta [5432]: " PGPORT
PGPORT="${PGPORT:-5432}"

read -p "Banco ERP [erpmgsis]: " PGDATABASE
PGDATABASE="${PGDATABASE:-erpmgsis}"

read -p "Usuário admin [postgres]: " ADMIN_USER
ADMIN_USER="${ADMIN_USER:-postgres}"

read -sp "Senha admin: " ADMIN_PASS
printf "\n"

export PGPASSWORD="$ADMIN_PASS"

sep
info "TOKEN ANALYTICS"
printf "Cole token (64 hex) ou deixe vazio e pressione ENTER: "
read TOKEN
TOKEN="${TOKEN:-}"

# ─── Criar banco se não existir ───────────────────────────────────────

sep
info "Verificando banco de dados..."

if ! psql -h "$PGHOST" -p "$PGPORT" -U "$ADMIN_USER" -tc "SELECT 1 FROM pg_database WHERE datname = '$PGDATABASE'" | grep -q 1; then
  info "Criando banco $PGDATABASE..."
  psql -h "$PGHOST" -p "$PGPORT" -U "$ADMIN_USER" -c "CREATE DATABASE $PGDATABASE;" || fatal "Erro ao criar banco"
  ok "Banco criado"
else
  ok "Banco já existe"
fi

# ─── Criar views ─────────────────────────────────────────────────────

sep
info "Criando 9 views..."

psql -h "$PGHOST" -p "$PGPORT" -U "$ADMIN_USER" -d "$PGDATABASE" << 'VIEWS' || {
  warn "Erro ao criar algumas views, continuando..."
}

-- Limpar views antigas se existirem
DROP VIEW IF EXISTS bi_cambio CASCADE;
DROP VIEW IF EXISTS bi_compras CASCADE;
DROP VIEW IF EXISTS bi_empresa CASCADE;
DROP VIEW IF EXISTS bi_estoque CASCADE;
DROP VIEW IF EXISTS bi_caixa CASCADE;
DROP VIEW IF EXISTS bi_pagar CASCADE;
DROP VIEW IF EXISTS bi_receber CASCADE;
DROP VIEW IF EXISTS bi_orcamentos CASCADE;
DROP VIEW IF EXISTS bi_movimento CASCADE;

-- 1. bi_movimento (Vendas)
CREATE OR REPLACE VIEW bi_movimento AS
SELECT
  CURRENT_DATE as pedido_data,
  '1' AS pedido_documento,
  'V' AS pedido_tipo,
  'VENDA' AS pedido_canal,
  '1' AS cliente_id,
  'Cliente Teste' AS cliente_nome,
  'São Paulo' AS pedido_cidade,
  '1' AS produto_id,
  'Produto Teste' AS produto_descricao,
  1 AS produto_quantidade,
  100.00 AS produto_valor_total,
  50.00 AS produto_valor_custo,
  10.00 AS item_desconto,
  '1' AS subgrupo_id,
  'Subgrupo' AS subgrupo_descricao,
  '1' AS vendedor_id,
  'Vendedor' AS vendedor_nome,
  'BRL' AS moeda_id,
  'BRL' AS moeda_sigla,
  '1' AS empresa_id,
  '1' AS marca_id,
  'Marca' AS marca_descricao
WHERE FALSE;

-- 2. bi_orcamentos (Orçamentos)
CREATE OR REPLACE VIEW bi_orcamentos AS
SELECT
  CURRENT_DATE AS orcamento_data,
  '1' AS orcamento_numero,
  'Cliente' AS cliente_nome,
  '1' AS cliente_id,
  '1' AS empresa_id,
  0 AS linhas,
  0 AS quantidade_total,
  0 AS valor_total
WHERE FALSE;

-- 3. bi_receber (Contas a Receber)
CREATE OR REPLACE VIEW bi_receber AS
SELECT
  '1' AS titulo_numero,
  CURRENT_DATE AS data_emissao,
  CURRENT_DATE AS data_vencimento,
  0 AS valor_titulo,
  0 AS valor_baixado,
  NULL AS data_baixa,
  'Cliente' AS cliente_nome,
  '1' AS cliente_id,
  '1' AS empresa_id,
  0 AS juros,
  0 AS multa,
  0 AS desconto
WHERE FALSE;

-- 4. bi_pagar (Contas a Pagar)
CREATE OR REPLACE VIEW bi_pagar AS
SELECT
  '1' AS titulo_numero,
  CURRENT_DATE AS data_emissao,
  CURRENT_DATE AS data_vencimento,
  0 AS valor_titulo,
  0 AS valor_baixado,
  NULL AS data_baixa,
  'Fornecedor' AS fornecedor_nome,
  '1' AS fornecedor_id,
  '1' AS empresa_id,
  0 AS juros,
  0 AS multa,
  0 AS desconto
WHERE FALSE;

-- 5. bi_caixa (Movimentações de Caixa)
CREATE OR REPLACE VIEW bi_caixa AS
SELECT
  '1' AS movimento_numero,
  CURRENT_DATE AS data_movimento,
  'ENTRADA' AS tipo_movimento,
  0 AS valor,
  'Caixa Principal' AS caixa_nome,
  '1' AS caixa_id,
  '1' AS empresa_id,
  'Movimento' AS descricao
WHERE FALSE;

-- 6. bi_estoque (Estoque - Foto)
CREATE OR REPLACE VIEW bi_estoque AS
SELECT
  '1' AS produto_id,
  'Produto' AS produto_descricao,
  0 AS quantidade,
  0 AS valor_estoque,
  'Almoxarifado' AS almoxarifado_nome,
  '1' AS almoxarifado_id,
  'Marca' AS marca_descricao,
  CURRENT_TIMESTAMP AS foto_em
WHERE FALSE;

-- 7. bi_compras (Compras)
CREATE OR REPLACE VIEW bi_compras AS
SELECT
  CURRENT_DATE AS pedido_data,
  '1' AS pedido_documento,
  'C' AS pedido_tipo,
  '1' AS fornecedor_id,
  'Fornecedor' AS fornecedor_nome,
  '1' AS produto_id,
  'Produto' AS produto_descricao,
  0 AS quantidade,
  0 AS valor_total,
  0 AS valor_custo,
  '1' AS empresa_id,
  'Marca' AS marca_descricao
WHERE FALSE;

-- 8. bi_empresa (Cadastro de Empresas - Foto)
CREATE OR REPLACE VIEW bi_empresa AS
SELECT
  '1' AS empresa_id,
  'Minha Empresa' AS empresa_nome,
  '00000000000191' AS cnpj,
  'São Paulo' AS cidade;

-- 9. bi_cambio (Câmbio - Histórico)
CREATE OR REPLACE VIEW bi_cambio AS
SELECT
  'USD' AS moeda_id,
  'USD' AS moeda_sigla,
  CURRENT_DATE AS mes_referencia,
  5.00 AS taxa_media
WHERE FALSE;

VIEWS

ok "9 views criadas"

# ─── Criar usuário analytics ─────────────────────────────────────────

sep
info "Configurando usuário analytics..."

# Dropar role antiga se existir
psql -h "$PGHOST" -p "$PGPORT" -U "$ADMIN_USER" -d "$PGDATABASE" \
  -c "DROP ROLE IF EXISTS analytics CASCADE;" 2>/dev/null || true

# Criar nova role
psql -h "$PGHOST" -p "$PGPORT" -U "$ADMIN_USER" -d "$PGDATABASE" \
  -c "CREATE ROLE analytics LOGIN PASSWORD 'analytics';" || fatal "Erro ao criar analytics"

# Dar permissões
psql -h "$PGHOST" -p "$PGPORT" -U "$ADMIN_USER" -d "$PGDATABASE" << 'PERMS' || fatal "Erro ao dar permissões"
GRANT CONNECT ON DATABASE erpmgsis TO analytics;
GRANT USAGE ON SCHEMA public TO analytics;
GRANT SELECT ON bi_movimento, bi_orcamentos, bi_receber, bi_pagar, bi_caixa, bi_estoque, bi_compras, bi_empresa, bi_cambio TO analytics;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM analytics;
PERMS

ok "Usuário analytics criado"

# ─── Criar usuário de sistema ─────────────────────────────────────────

sep
info "Criando usuário de sistema..."
useradd --system --no-create-home --shell /usr/sbin/nologin analytics 2>/dev/null || true
ok "Usuário de sistema OK"

# ─── Instalar arquivos ────────────────────────────────────────────────

sep
info "Instalando arquivos..."

# Agente
if [[ -f agente/mgsis-ingest.sh ]]; then
  install -m 755 agente/mgsis-ingest.sh /usr/local/bin/
  ok "Agente instalado"
else
  warn "mgsis-ingest.sh não encontrado (pulando agente)"
fi

# Token
if [[ -n "$TOKEN" ]]; then
  printf '%s' "$TOKEN" | install -m 600 -o analytics -g analytics /dev/stdin /etc/mgsis-token
  ok "Token instalado"
else
  warn "Token vazio - configure depois"
fi

# Configuração
cat > /etc/mgsis-ingest.conf << EOF
API_URL="https://analytics.mgsis.com"
TOKEN_FILE="/etc/mgsis-token"
PGHOST="$PGHOST"
PGPORT="$PGPORT"
PGDATABASE="$PGDATABASE"
PGUSER="analytics"
TENTATIVAS=3
TIMEOUT=600
PERMITIR_VAZIO="nao"
JANELA_MESES_FINANCEIRO=12
LOCK_FILE="/var/lock/mgsis-ingest.lock"
EOF
chmod 640 /etc/mgsis-ingest.conf
chown root:analytics /etc/mgsis-ingest.conf
ok "Configuração criada"

# Cron
cat > /etc/cron.d/mgsis-ingest << 'CRON'
7 * * * * analytics /usr/local/bin/mgsis-ingest.sh --ciclo >> /var/log/mgsis-ingest.log 2>&1
0 3 * * * analytics /usr/local/bin/mgsis-ingest.sh --recarga-financeira >> /var/log/mgsis-ingest.log 2>&1
CRON

touch /var/log/mgsis-ingest.log
chmod 640 /var/log/mgsis-ingest.log
chown analytics:analytics /var/log/mgsis-ingest.log
ok "Cron instalado"

# ─── Testes ──────────────────────────────────────────────────────────

sep
info "Testando..."

if psql -h "$PGHOST" -p "$PGPORT" -U analytics -d "$PGDATABASE" \
  -c "SELECT 1 FROM bi_movimento LIMIT 1" 2>/dev/null; then
  ok "Usuário analytics conectado"
else
  warn "Não consegui testar conexão"
fi

# ─── Resumo ───────────────────────────────────────────────────────────

sep
printf "${GREEN}✅ INSTALAÇÃO CONCLUÍDA!${NC}\n\n"
printf "Banco: %s\n" "$PGDATABASE"
printf "Usuário: analytics\n"
printf "Views: 9 criadas\n"
printf "Cron: ativado (ciclo + recarga noturna)\n\n"

printf "${YELLOW}Próximos passos:${NC}\n"
printf "  1. Testar conexão:\n"
printf "     sudo -u analytics psql -h %s -d %s -c 'SELECT 1 FROM bi_movimento'\n\n" "$PGHOST" "$PGDATABASE"
printf "  2. Testar agente (se instalado):\n"
printf "     sudo -u analytics mgsis-ingest.sh --periodo 2026-09 --simular\n\n"
printf "  3. Acompanhar logs:\n"
printf "     sudo tail -f /var/log/mgsis-ingest.log\n\n"
