#!/usr/bin/env bash
set -Eeuo pipefail

[[ $EUID -eq 0 ]] || { echo "Execute como root"; exit 1; }

BLUE='\033[0;34m'
GREEN='\033[0;32m'
NC='\033[0m'

printf "\n${BLUE}═══════════════════════════════════════════${NC}\n"
printf "${BLUE}SETUP MGSIS Analytics${NC}\n"
printf "${BLUE}═══════════════════════════════════════════${NC}\n\n"

# Coleta de dados
read -p "Host PostgreSQL [localhost]: " PGHOST
PGHOST="${PGHOST:-localhost}"

read -p "Porta [5432]: " PGPORT
PGPORT="${PGPORT:-5432}"

read -p "Banco [erpmgsis]: " PGDATABASE
PGDATABASE="${PGDATABASE:-erpmgsis}"

read -p "Admin [postgres]: " ADMIN_USER
ADMIN_USER="${ADMIN_USER:-postgres}"

read -sp "Senha admin: " ADMIN_PASS
printf "\n"

read -p "Token (cole ou vazio): " TOKEN
TOKEN="${TOKEN:-}"

export PGPASSWORD="$ADMIN_PASS"

# Conectar ao banco
printf "\nConectando ao banco...\n"
psql -h "$PGHOST" -p "$PGPORT" -U "$ADMIN_USER" -d "$PGDATABASE" -c "SELECT 1;" > /dev/null || {
  echo "Erro ao conectar ao banco"
  exit 1
}

# Criar views básicas
printf "Criando views...\n"
psql -h "$PGHOST" -p "$PGPORT" -U "$ADMIN_USER" -d "$PGDATABASE" << 'VIEWS_SQL' 2>/dev/null
DROP VIEW IF EXISTS bi_cambio CASCADE;
DROP VIEW IF EXISTS bi_compras CASCADE;
DROP VIEW IF EXISTS bi_empresa CASCADE;
DROP VIEW IF EXISTS bi_estoque CASCADE;
DROP VIEW IF EXISTS bi_caixa CASCADE;
DROP VIEW IF EXISTS bi_pagar CASCADE;
DROP VIEW IF EXISTS bi_receber CASCADE;
DROP VIEW IF EXISTS bi_orcamentos CASCADE;
DROP VIEW IF EXISTS bi_movimento CASCADE;

CREATE VIEW bi_movimento AS SELECT NULL::timestamp AS pedido_data, ''::text AS pedido_documento, ''::text AS pedido_tipo, ''::text AS pedido_canal, ''::text AS cliente_id, ''::text AS cliente_nome, ''::text AS pedido_cidade, ''::text AS produto_id, ''::text AS produto_descricao, 0::numeric AS produto_quantidade, 0::numeric AS produto_valor_total, 0::numeric AS produto_valor_custo, 0::numeric AS item_desconto, ''::text AS subgrupo_id, ''::text AS subgrupo_descricao, ''::text AS vendedor_id, ''::text AS vendedor_nome, ''::text AS moeda_id, ''::text AS moeda_sigla, ''::text AS empresa_id, ''::text AS marca_id, ''::text AS marca_descricao WHERE FALSE;

CREATE VIEW bi_orcamentos AS SELECT NULL::timestamp AS orcamento_data, ''::text AS orcamento_numero, ''::text AS cliente_nome, ''::text AS cliente_id, ''::text AS empresa_id, 0::bigint AS linhas, 0::numeric AS quantidade_total, 0::numeric AS valor_total WHERE FALSE;

CREATE VIEW bi_receber AS SELECT ''::text AS titulo_numero, NULL::timestamp AS data_emissao, NULL::timestamp AS data_vencimento, 0::numeric AS valor_titulo, 0::numeric AS valor_baixado, NULL::timestamp AS data_baixa, ''::text AS cliente_nome, ''::text AS cliente_id, ''::text AS empresa_id, 0::numeric AS juros, 0::numeric AS multa, 0::numeric AS desconto WHERE FALSE;

CREATE VIEW bi_pagar AS SELECT ''::text AS titulo_numero, NULL::timestamp AS data_emissao, NULL::timestamp AS data_vencimento, 0::numeric AS valor_titulo, 0::numeric AS valor_baixado, NULL::timestamp AS data_baixa, ''::text AS fornecedor_nome, ''::text AS fornecedor_id, ''::text AS empresa_id, 0::numeric AS juros, 0::numeric AS multa, 0::numeric AS desconto WHERE FALSE;

CREATE VIEW bi_caixa AS SELECT NULL::timestamp AS data_movimento, ''::text AS tipo_movimento, 0::numeric AS valor, ''::text AS caixa_nome, ''::text AS caixa_id, ''::text AS empresa_id, ''::text AS descricao WHERE FALSE;

CREATE VIEW bi_estoque AS SELECT ''::text AS produto_id, ''::text AS produto_descricao, 0::numeric AS quantidade, 0::numeric AS valor_estoque, ''::text AS almoxarifado_nome, ''::text AS almoxarifado_id, ''::text AS marca_descricao WHERE FALSE;

CREATE VIEW bi_compras AS SELECT NULL::timestamp AS pedido_data, ''::text AS pedido_documento, ''::text AS pedido_tipo, ''::text AS fornecedor_id, ''::text AS fornecedor_nome, ''::text AS produto_id, ''::text AS produto_descricao, 0::numeric AS quantidade, 0::numeric AS valor_total, 0::numeric AS valor_custo, ''::text AS empresa_id, ''::text AS marca_descricao WHERE FALSE;

CREATE VIEW bi_empresa AS SELECT ''::text AS empresa_id, ''::text AS empresa_nome, ''::text AS cnpj, ''::text AS cidade;

CREATE VIEW bi_cambio AS SELECT ''::text AS moeda_id, ''::text AS moeda_sigla, NULL::date AS mes_referencia, 0::numeric AS taxa_media WHERE FALSE;
VIEWS_SQL


# Criar usuário
printf "Criando usuário analytics...\n"
psql -h "$PGHOST" -p "$PGPORT" -U "$ADMIN_USER" -d "$PGDATABASE" -c "DROP ROLE IF EXISTS analytics CASCADE;" 2>/dev/null || true
psql -h "$PGHOST" -p "$PGPORT" -U "$ADMIN_USER" -d "$PGDATABASE" -c "CREATE ROLE analytics LOGIN PASSWORD 'analytics';"
psql -h "$PGHOST" -p "$PGPORT" -U "$ADMIN_USER" -d "$PGDATABASE" -c "GRANT CONNECT ON DATABASE $PGDATABASE TO analytics;"
psql -h "$PGHOST" -p "$PGPORT" -U "$ADMIN_USER" -d "$PGDATABASE" -c "GRANT USAGE ON SCHEMA public TO analytics;"
psql -h "$PGHOST" -p "$PGPORT" -U "$ADMIN_USER" -d "$PGDATABASE" -c "GRANT SELECT ON bi_movimento, bi_orcamentos, bi_receber, bi_pagar, bi_caixa, bi_estoque, bi_compras, bi_empresa, bi_cambio TO analytics;"
psql -h "$PGHOST" -p "$PGPORT" -U "$ADMIN_USER" -d "$PGDATABASE" -c "ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM analytics;"

# Criar usuário de sistema
printf "Criando usuário de sistema...\n"
useradd --system --no-create-home --shell /usr/sbin/nologin analytics 2>/dev/null || true

# Instalar agente
if [[ -f agente/mgsis-ingest.sh ]]; then
  printf "Instalando agente...\n"
  install -m 755 agente/mgsis-ingest.sh /usr/local/bin/
fi

# Instalar token
if [[ -n "$TOKEN" ]]; then
  printf "Instalando token...\n"
  printf '%s' "$TOKEN" | install -m 600 -o analytics -g analytics /dev/stdin /etc/mgsis-token
fi

# Criar configuração
printf "Criando configuração...\n"
cat > /etc/mgsis-ingest.conf << CONF
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
CONF
chmod 640 /etc/mgsis-ingest.conf
chown root:analytics /etc/mgsis-ingest.conf

# Criar cron
printf "Criando cron...\n"
cat > /etc/cron.d/mgsis-ingest << 'CRON'
7 * * * * analytics /usr/local/bin/mgsis-ingest.sh --ciclo >> /var/log/mgsis-ingest.log 2>&1
0 3 * * * analytics /usr/local/bin/mgsis-ingest.sh --recarga-financeira >> /var/log/mgsis-ingest.log 2>&1
CRON

touch /var/log/mgsis-ingest.log
chmod 640 /var/log/mgsis-ingest.log
chown analytics:analytics /var/log/mgsis-ingest.log

# Resumo
printf "\n${GREEN}✅ INSTALAÇÃO CONCLUÍDA!${NC}\n\n"
printf "Banco: %s\n" "$PGDATABASE"
printf "Usuário: analytics\n"
printf "Cron: ativado\n\n"
printf "Próximos passos:\n"
printf "  sudo -u analytics psql -h %s -d %s -c 'SELECT COUNT(*) FROM bi_movimento'\n" "$PGHOST" "$PGDATABASE"
printf "  sudo tail -f /var/log/mgsis-ingest.log\n\n"
