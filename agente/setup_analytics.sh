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

# Criar views usando arquivo
printf "Criando views...\n"
if [[ -f "sql dados/instalar-views.sql" ]]; then
  psql -h "$PGHOST" -p "$PGPORT" -U "$ADMIN_USER" -d "$PGDATABASE" -f "sql dados/instalar-views.sql" > /dev/null 2>&1 || {
    echo "Aviso: algumas views podem não ter sido criadas (tabelas podem não existir)"
  }
else
  echo "Aviso: arquivo instalar-views.sql não encontrado"
fi

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
