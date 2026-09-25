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

check() {
  info "Validando..."
  [[ $EUID -eq 0 ]] || fatal "Execute como root"
  for cmd in bash psql curl; do command -v "$cmd" >/dev/null 2>&1 || fatal "Falta: $cmd"; done
  ok "Pré-requisitos OK"
}

ask_db() {
  sep
  info "BANCO DE DADOS ERP"
  read -p "Host [localhost]: " PGHOST
  PGHOST="${PGHOST:-localhost}"
  read -p "Porta [5432]: " PGPORT
  PGPORT="${PGPORT:-5432}"
  read -p "Banco [erpmgsis]: " PGDATABASE
  PGDATABASE="${PGDATABASE:-erpmgsis}"
  read -p "Admin [postgres]: " ADMIN_USER
  ADMIN_USER="${ADMIN_USER:-postgres}"
  read -sp "Senha admin: " ADMIN_PASS
  printf "\n"
  export PGPASSWORD="$ADMIN_PASS"
}

ask_token() {
  sep
  info "TOKEN DE INTEGRAÇÃO"
  read -sp "Cole token (64 hex) ou deixe vazio: " TOKEN
  printf "\n"
  TOKEN="${TOKEN:-}"
}

create_user() {
  sep
  info "Criando usuário analytics..."
  psql -h "$PGHOST" -p "$PGPORT" -U "$ADMIN_USER" -d "$PGDATABASE" -c "DROP ROLE IF EXISTS analytics CASCADE;" 2>/dev/null || true
  psql -h "$PGHOST" -p "$PGPORT" -U "$ADMIN_USER" -d "$PGDATABASE" -c "CREATE ROLE analytics LOGIN PASSWORD 'analytics';" || fatal "Erro ao criar usuário"
  psql -h "$PGHOST" -p "$PGPORT" -U "$ADMIN_USER" -d "$PGDATABASE" << 'SQL' || fatal "Erro ao dar permissões"
GRANT CONNECT ON DATABASE erpmgsis TO analytics;
GRANT USAGE ON SCHEMA public TO analytics;
GRANT SELECT ON bi_movimento, bi_orcamentos, bi_receber, bi_pagar, bi_caixa, bi_estoque, bi_compras, bi_empresa, bi_cambio TO analytics;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM analytics;
SQL
  ok "Usuário criado"
}

create_views() {
  sep
  info "Criando 9 views..."
  psql -h "$PGHOST" -p "$PGPORT" -U "$ADMIN_USER" -d "$PGDATABASE" << 'SQL' || fatal "Erro ao criar views"
CREATE OR REPLACE VIEW bi_movimento AS SELECT p.pedido_data_fatura, COALESCE(p.pedido_id::text, '') AS pedido_documento, COALESCE(p.cliente_id::text, '') AS cliente_id, COALESCE(i.produto_id::text, '') AS produto_id, COALESCE(i.item_quantidade, 0) AS quantidade FROM item_pedido i JOIN pedido p ON p.pedido_id = i.pedido_id WHERE p.pedido_tipo = 'V' AND p.pedido_data_fatura >= '1990-01-01';
CREATE OR REPLACE VIEW bi_orcamentos AS SELECT o.orcamento_data, COALESCE(o.orcamento_numero::text, '') AS orcamento_numero, COALESCE(o.empresa_id::text, '') AS empresa_id FROM orcamento o WHERE o.orcamento_data >= '1990-01-01';
CREATE OR REPLACE VIEW bi_receber AS SELECT COALESCE(t.titulo_numero::text, '') AS titulo_numero, t.titulo_emissao, COALESCE(t.titulo_valor, 0) AS valor_titulo, COALESCE(t.empresa_id::text, '') AS empresa_id FROM titulo_receber t WHERE t.titulo_emissao >= '1990-01-01';
CREATE OR REPLACE VIEW bi_pagar AS SELECT COALESCE(t.titulo_numero::text, '') AS titulo_numero, t.titulo_emissao, COALESCE(t.titulo_valor, 0) AS valor_titulo, COALESCE(t.empresa_id::text, '') AS empresa_id FROM titulo_pagar t WHERE t.titulo_emissao >= '1990-01-01';
CREATE OR REPLACE VIEW bi_caixa AS SELECT COALESCE(m.movimento_numero::text, '') AS movimento_numero, m.movimento_data, COALESCE(m.movimento_valor, 0) AS valor, COALESCE(m.empresa_id::text, '') AS empresa_id FROM movimento_caixa m WHERE m.movimento_data >= '1990-01-01';
CREATE OR REPLACE VIEW bi_estoque AS SELECT COALESCE(p.produto_id::text, '') AS produto_id, COALESCE(p.produto_descricao, '') AS descricao, COALESCE(e.estoque_quantidade, 0) AS quantidade FROM estoque e LEFT JOIN produto p ON p.produto_id = e.produto_id;
CREATE OR REPLACE VIEW bi_compras AS SELECT p.pedido_data_fatura, COALESCE(p.pedido_id::text, '') AS pedido_documento, COALESCE(i.produto_id::text, '') AS produto_id, COALESCE(i.item_quantidade, 0) AS quantidade FROM item_pedido i JOIN pedido p ON p.pedido_id = i.pedido_id WHERE p.pedido_tipo = 'C' AND p.pedido_data_fatura >= '1990-01-01';
CREATE OR REPLACE VIEW bi_empresa AS SELECT COALESCE(e.empresa_id::text, '') AS empresa_id, COALESCE(e.empresa_nome, '') AS empresa_nome FROM empresa e;
CREATE OR REPLACE VIEW bi_cambio AS SELECT COALESCE(m.moeda_id::text, '') AS moeda_id, DATE_TRUNC('month', c.cambio_data)::date AS mes FROM cambio c LEFT JOIN moeda m ON m.moeda_id = c.moeda_id WHERE c.cambio_data >= '1990-01-01' GROUP BY m.moeda_id, DATE_TRUNC('month', c.cambio_data);
SQL
  ok "9 views criadas"
}

setup() {
  sep
  info "Instalando..."

  useradd --system --no-create-home --shell /usr/sbin/nologin analytics 2>/dev/null || true

  [[ -f agente/mgsis-ingest.sh ]] || fatal "mgsis-ingest.sh não encontrado"
  install -m 755 agente/mgsis-ingest.sh /usr/local/bin/
  ok "Agente instalado"

  if [[ -n "$TOKEN" ]]; then
    printf '%s' "$TOKEN" | install -m 600 -o analytics -g analytics /dev/stdin /etc/mgsis-token
    ok "Token instalado"
  fi

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

  cat > /etc/cron.d/mgsis-ingest << 'CRON'
7 * * * * analytics /usr/local/bin/mgsis-ingest.sh --ciclo >> /var/log/mgsis-ingest.log 2>&1
0 3 * * * analytics /usr/local/bin/mgsis-ingest.sh --recarga-financeira >> /var/log/mgsis-ingest.log 2>&1
CRON

  touch /var/log/mgsis-ingest.log
  chmod 640 /var/log/mgsis-ingest.log
  chown analytics:analytics /var/log/mgsis-ingest.log
  ok "Cron instalado"

  sep
  printf "${GREEN}✅ INSTALAÇÃO CONCLUÍDA!${NC}\n\n"
  printf "Próximos passos:\n"
  printf "  1. sudo -u analytics psql -h $PGHOST -d $PGDATABASE -c 'SELECT COUNT(*) FROM bi_movimento'\n"
  printf "  2. sudo -u analytics mgsis-ingest.sh --periodo 2026-09 --simular\n"
  printf "  3. sudo tail -f /var/log/mgsis-ingest.log\n\n"
}

clear
printf "${BLUE}═════════════════════════════════════════════════════${NC}\n"
printf "${BLUE}SETUP MGSIS Analytics${NC}\n"
printf "${BLUE}═════════════════════════════════════════════════════${NC}\n\n"

check
ask_db
ask_token
create_user
create_views
setup
