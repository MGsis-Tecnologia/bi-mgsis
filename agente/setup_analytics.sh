#!/usr/bin/env bash
#
# Setup MGSIS Analytics — instalação completa do agente de ingestão
#
# Este script automatiza toda a instalação:
#   1. Cria o usuário `analytics` no Postgres
#   2. Cria as views bi_* no banco do cliente
#   3. Configura /etc/mgsis-ingest.conf
#   4. Instala o agente em /usr/local/bin/
#   5. Configura automação (systemd ou cron)
#
# Uso:
#   sudo bash setup_analytics.sh
#
# Pré-requisitos:
#   - Bash 4+
#   - psql (PostgreSQL client)
#   - curl
#   - sudo (para instalar em /etc e /usr/local/bin)
#   - Acesso como superusuário ao Postgres do cliente
#

set -Eeuo pipefail

# ─── Cores para output ──────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# ─── Funções ────────────────────────────────────────────────────────────────

info() {
  printf "${BLUE}ℹ${NC}  %s\n" "$*"
}

ok() {
  printf "${GREEN}✓${NC}  %s\n" "$*"
}

warn() {
  printf "${YELLOW}⚠${NC}  %s\n" "$*" >&2
}

erro() {
  printf "${RED}✗${NC}  %s\n" "$*" >&2
}

fatal() {
  erro "$@"
  exit 1
}

separator() {
  printf "\n${BLUE}─────────────────────────────────────────────────────────────${NC}\n\n"
}

# ─── Validações pré-requisito ───────────────────────────────────────────────

check_prerequisites() {
  info "Validando pré-requisitos..."

  [[ $EUID -eq 0 ]] || fatal "Este script deve rodar como root (use: sudo bash setup_analytics.sh)"

  for cmd in bash psql curl; do
    command -v "$cmd" >/dev/null 2>&1 || fatal "Comando obrigatório '$cmd' não encontrado"
  done

  ok "Todos os pré-requisitos OK"
}

# ─── Funções interativas ────────────────────────────────────────────────────

ask_db_connection() {
  separator
  info "Configuração da conexão ao Postgres (banco ERP)"

  printf "\nUse socket local (peer auth, sem senha)? [Y/n] "
  read -r use_socket
  use_socket="${use_socket:-y}"

  if [[ "$use_socket" =~ ^[Yy]$ ]]; then
    PGHOST=""
    PGPORT="5432"
    info "Socket local: psql se conectará via Unix socket sem senha"
  else
    printf "Host do Postgres [localhost]: "
    read -r PGHOST
    PGHOST="${PGHOST:-localhost}"

    printf "Porta [5432]: "
    read -r PGPORT
    PGPORT="${PGPORT:-5432}"

    printf "Senha do usuário analytics (será guardada em ~/.pgpass): "
    read -rs PGPASSWORD
    printf "\n"
  fi

  printf "Nome do banco de dados [erp_do_cliente]: "
  read -r PGDATABASE
  PGDATABASE="${PGDATABASE:-erp_do_cliente}"

  printf "Usuário Postgres de administrador [postgres]: "
  read -r ADMIN_USER
  ADMIN_USER="${ADMIN_USER:-postgres}"

  info "Vou usar: host=${PGHOST:-unix socket}, port=$PGPORT, db=$PGDATABASE, admin_user=$ADMIN_USER"
}

ask_token() {
  separator
  info "Token de integração MGSIS Analytics"
  info "Gere em: Master → Empresas → (sua empresa) → token de integração"
  info "Aparece UMA ÚNICA VEZ; o servidor guarda apenas o hash"

  printf "\nTem o token agora? [Y/n] "
  read -r have_token
  have_token="${have_token:-y}"

  if [[ ! "$have_token" =~ ^[Yy]$ ]]; then
    warn "Sem token, a ingestão não funcionará"
    warn "Configure depois manualmente em /etc/mgsis-token"
    TOKEN=""
    return
  fi

  printf "\nCole o token de 64 caracteres hexadecimais (e pressione ENTER): "
  read -rs TOKEN
  printf "\n"

  if ! [[ "$TOKEN" =~ ^[0-9a-fA-F]{64}$ ]]; then
    fatal "Token inválido. Deve ter exatamente 64 caracteres hexadecimais."
  fi

  ok "Token validado"
}

ask_automation() {
  separator
  info "Automação — como executar o agente periodicamente?"

  printf "\nUsar systemd (recomendado em sistemas modernos)? [Y/n] "
  read -r use_systemd
  use_systemd="${use_systemd:-y}"

  if [[ "$use_systemd" =~ ^[Yy]$ ]]; then
    USE_SYSTEMD=true
    info "Vou instalar mgsis-ingest.timer (executa a cada hora)"
  else
    USE_SYSTEMD=false
    info "Vou instalar cron (executa a cada hora no minuto 07)"
    warn "Você precisará ter cron ativo no sistema"
  fi
}

ask_ingest_path() {
  separator
  info "Histórico de ingestão"

  printf "\nMês inicial para histórico (YYYY-MM) [deixe vazio para auto-descobrir]: "
  read -r INICIO_HISTORICO
  INICIO_HISTORICO="${INICIO_HISTORICO:-}"

  if [[ -n "$INICIO_HISTORICO" ]]; then
    if ! [[ "$INICIO_HISTORICO" =~ ^[0-9]{4}-[0-9]{2}$ ]]; then
      fatal "Formato inválido. Use YYYY-MM"
    fi
    ok "Histórico começará em $INICIO_HISTORICO"
  else
    info "O agente descobrirá automaticamente pela menor data nas views"
  fi
}

# ─── Instalação do usuário Postgres ─────────────────────────────────────────

create_analytics_user() {
  separator
  info "Criando usuário analytics no Postgres..."

  local SQL_USER SQL_PERMS

  # Gera uma senha temporária se não for usar socket
  if [[ -z "$PGHOST" ]]; then
    # Socket local: sem senha
    SQL_USER="CREATE ROLE IF NOT EXISTS analytics LOGIN;"
    info "Usuário será criado SEM SENHA (autenticação peer via socket)"
  else
    # TCP: com senha
    local temp_pass
    temp_pass=$(openssl rand -base64 12)
    SQL_USER="CREATE ROLE IF NOT EXISTS analytics LOGIN PASSWORD '$temp_pass';"
    info "Usuário será criado com senha temporária: $temp_pass"
  fi

  SQL_PERMS='
    GRANT CONNECT ON DATABASE '"$PGDATABASE"' TO analytics;
    GRANT USAGE ON SCHEMA public TO analytics;
    GRANT SELECT ON bi_movimento, bi_orcamentos, bi_receber, bi_pagar, bi_caixa, bi_estoque TO analytics;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM analytics;
  '

  # Tenta criar via psql
  if [[ -z "$PGHOST" ]]; then
    psql -U "$ADMIN_USER" -d "$PGDATABASE" -c "$SQL_USER" >/dev/null 2>&1 || true
    psql -U "$ADMIN_USER" -d "$PGDATABASE" <<< "$SQL_PERMS" >/dev/null 2>&1 || {
      fatal "Falha ao configurar permissões do usuário analytics"
    }
  else
    PGPASSWORD="" psql -h "$PGHOST" -p "$PGPORT" -U "$ADMIN_USER" -d "$PGDATABASE" -c "$SQL_USER" >/dev/null 2>&1 || true
    PGPASSWORD="" psql -h "$PGHOST" -p "$PGPORT" -U "$ADMIN_USER" -d "$PGDATABASE" <<< "$SQL_PERMS" >/dev/null 2>&1 || {
      fatal "Falha ao configurar permissões do usuário analytics"
    }
  fi

  ok "Usuário analytics criado com sucesso"
}

# ─── Instalação das views ───────────────────────────────────────────────────

create_views() {
  separator
  info "Criando views bi_* no banco..."

  # Monta SQL com todas as views. Para este script, vou ler do arquivo externo
  # ou você pode manter as definições inline aqui.

  local VIEWS_SQL
  VIEWS_SQL=$(cat << 'ENDVIEWS'
-- bi_movimento
CREATE OR REPLACE VIEW bi_movimento AS
SELECT
    p.pedido_data_fatura AS pedido_data,
    COALESCE(p.pedido_id::text, '') AS pedido_documento,
    COALESCE(p.pedido_tipo::text, '') AS pedido_tipo,
    COALESCE(tp.tipo_preco_descricao, '') AS pedido_canal,
    COALESCE(p.cliente_id::text, '') AS cliente_id,
    COALESCE(c.pessoa_nome, '') AS cliente_nome,
    COALESCE((SELECT cidade.cidade_nome FROM endereco
              LEFT JOIN cidade ON cidade.cidade_id = endereco.cidade_id
              WHERE endereco.endereco_padrao = true AND endereco.pessoa_id = p.cliente_id
              LIMIT 1), '') AS pedido_cidade,
    COALESCE(i.produto_id::text, '') AS produto_id,
    COALESCE(pr.produto_descricao, '') AS produto_descricao,
    COALESCE(i.item_quantidade, 0) AS produto_quantidade,
    COALESCE(i.item_total, 0) AS produto_valor_total,
    COALESCE(i.item_custos, 0) AS produto_valor_custo,
    COALESCE(i.item_desconto, 0) AS item_desconto,
    COALESCE(sg.subgrupo_id::text, '') AS subgrupo_id,
    COALESCE(sg.subgrupo_descricao, '') AS subgrupo_descricao,
    COALESCE(p.vendedor_id::text, '') AS vendedor_id,
    COALESCE(v.pessoa_nome, '') AS vendedor_nome,
    COALESCE(p.moeda_id::text, '') AS moeda_id,
    COALESCE(m.moeda_sigla, '') AS moeda_sigla,
    COALESCE(p.empresa_id::text, '') AS empresa_id,
    COALESCE(ma.marca_id::text, '') AS marca_id,
    COALESCE(ma.marca_descricao, '') AS marca_descricao
FROM item_pedido i
JOIN pedido p ON p.pedido_id = i.pedido_id
LEFT JOIN pessoa c ON c.pessoa_id = p.cliente_id
LEFT JOIN pessoa v ON v.pessoa_id = p.vendedor_id
LEFT JOIN produto pr ON pr.produto_id = i.produto_id
LEFT JOIN tipo_preco tp ON tp.tipo_preco_id = p.tipo_preco_id
LEFT JOIN subgrupo sg ON sg.subgrupo_id = pr.subgrupo_id
LEFT JOIN moeda m ON m.moeda_id = p.moeda_id
LEFT JOIN marca ma ON ma.marca_id = pr.marca_id
WHERE p.pedido_tipo = 'V' AND p.pedido_data_fatura >= '1990-01-01';

-- bi_orcamentos
CREATE OR REPLACE VIEW bi_orcamentos AS
SELECT
    o.orcamento_data AS orcamento_data,
    COALESCE(o.orcamento_numero::text, '') AS orcamento_numero,
    COALESCE(c.pessoa_nome, '') AS cliente_nome,
    COALESCE(c.pessoa_id::text, '') AS cliente_id,
    COALESCE(o.empresa_id::text, '') AS empresa_id,
    COUNT(io.item_orcamento_id) AS linhas,
    COALESCE(SUM(io.item_quantidade), 0) AS quantidade_total,
    COALESCE(SUM(io.item_total), 0) AS valor_total
FROM orcamento o
LEFT JOIN pessoa c ON c.pessoa_id = o.cliente_id
LEFT JOIN item_orcamento io ON io.orcamento_id = o.orcamento_id
WHERE o.orcamento_data >= '1990-01-01'
GROUP BY o.orcamento_id, o.orcamento_data, o.orcamento_numero, c.pessoa_nome, c.pessoa_id, o.empresa_id;

-- bi_receber
CREATE OR REPLACE VIEW bi_receber AS
SELECT
    COALESCE(t.titulo_numero::text, '') AS titulo_numero,
    t.titulo_emissao AS data_emissao,
    t.titulo_vencimento AS data_vencimento,
    COALESCE(t.titulo_valor, 0) AS valor_titulo,
    COALESCE(t.titulo_valor_baixa, 0) AS valor_baixado,
    COALESCE(CASE WHEN t.titulo_valor_baixa > 0 THEN t.titulo_data_baixa END) AS data_baixa,
    COALESCE(c.pessoa_nome, '') AS cliente_nome,
    COALESCE(c.pessoa_id::text, '') AS cliente_id,
    COALESCE(t.empresa_id::text, '') AS empresa_id,
    COALESCE(t.juros, 0) AS juros,
    COALESCE(t.multa, 0) AS multa,
    COALESCE(t.desconto, 0) AS desconto
FROM titulo_receber t
LEFT JOIN pessoa c ON c.pessoa_id = t.cliente_id
WHERE t.titulo_emissao >= '1990-01-01';

-- bi_pagar
CREATE OR REPLACE VIEW bi_pagar AS
SELECT
    COALESCE(t.titulo_numero::text, '') AS titulo_numero,
    t.titulo_emissao AS data_emissao,
    t.titulo_vencimento AS data_vencimento,
    COALESCE(t.titulo_valor, 0) AS valor_titulo,
    COALESCE(t.titulo_valor_baixa, 0) AS valor_baixado,
    COALESCE(CASE WHEN t.titulo_valor_baixa > 0 THEN t.titulo_data_baixa END) AS data_baixa,
    COALESCE(f.pessoa_nome, '') AS fornecedor_nome,
    COALESCE(f.pessoa_id::text, '') AS fornecedor_id,
    COALESCE(t.empresa_id::text, '') AS empresa_id,
    COALESCE(t.juros, 0) AS juros,
    COALESCE(t.multa, 0) AS multa,
    COALESCE(t.desconto, 0) AS desconto
FROM titulo_pagar t
LEFT JOIN pessoa f ON f.pessoa_id = t.fornecedor_id
WHERE t.titulo_emissao >= '1990-01-01';

-- bi_caixa
CREATE OR REPLACE VIEW bi_caixa AS
SELECT
    COALESCE(m.movimento_numero::text, '') AS movimento_numero,
    m.movimento_data AS data_movimento,
    COALESCE(m.movimento_tipo, '') AS tipo_movimento,
    COALESCE(m.movimento_valor, 0) AS valor,
    COALESCE(c.caixa_nome, '') AS caixa_nome,
    COALESCE(c.caixa_id::text, '') AS caixa_id,
    COALESCE(m.empresa_id::text, '') AS empresa_id,
    COALESCE(m.descricao, '') AS descricao
FROM movimento_caixa m
LEFT JOIN caixa c ON c.caixa_id = m.caixa_id
WHERE m.movimento_data >= '1990-01-01';

-- bi_estoque
CREATE OR REPLACE VIEW bi_estoque AS
SELECT
    COALESCE(p.produto_id::text, '') AS produto_id,
    COALESCE(p.produto_descricao, '') AS produto_descricao,
    COALESCE(e.estoque_quantidade, 0) AS quantidade,
    COALESCE(e.estoque_valor, 0) AS valor_estoque,
    COALESCE(a.almoxarifado_nome, '') AS almoxarifado_nome,
    COALESCE(a.almoxarifado_id::text, '') AS almoxarifado_id,
    COALESCE(m.marca_descricao, '') AS marca_descricao,
    NOW() AS foto_em
FROM estoque e
LEFT JOIN produto p ON p.produto_id = e.produto_id
LEFT JOIN almoxarifado a ON a.almoxarifado_id = e.almoxarifado_id
LEFT JOIN marca m ON m.marca_id = p.marca_id;

-- bi_compras
CREATE OR REPLACE VIEW bi_compras AS
SELECT
    p.pedido_data_fatura AS pedido_data,
    COALESCE(p.pedido_id::text, '') AS pedido_documento,
    COALESCE(p.pedido_tipo::text, '') AS pedido_tipo,
    COALESCE(p.fornecedor_id::text, '') AS fornecedor_id,
    COALESCE(f.pessoa_nome, '') AS fornecedor_nome,
    COALESCE(i.produto_id::text, '') AS produto_id,
    COALESCE(pr.produto_descricao, '') AS produto_descricao,
    COALESCE(i.item_quantidade, 0) AS quantidade,
    COALESCE(i.item_total, 0) AS valor_total,
    COALESCE(i.item_custos, 0) AS valor_custo,
    COALESCE(p.empresa_id::text, '') AS empresa_id,
    COALESCE(m.marca_descricao, '') AS marca_descricao
FROM item_pedido i
JOIN pedido p ON p.pedido_id = i.pedido_id
LEFT JOIN pessoa f ON f.pessoa_id = p.fornecedor_id
LEFT JOIN produto pr ON pr.produto_id = i.produto_id
LEFT JOIN marca m ON m.marca_id = pr.marca_id
WHERE p.pedido_tipo = 'C' AND p.pedido_data_fatura >= '1990-01-01';

-- bi_empresa
CREATE OR REPLACE VIEW bi_empresa AS
SELECT
    COALESCE(e.empresa_id::text, '') AS empresa_id,
    COALESCE(e.empresa_nome, '') AS empresa_nome,
    COALESCE(e.empresa_cnpj, '') AS cnpj,
    COALESCE((SELECT cidade_nome FROM endereco
              LEFT JOIN cidade ON cidade_id = endereco.cidade_id
              WHERE endereco.pessoa_id = e.pessoa_id AND endereco.endereco_padrao = true
              LIMIT 1), '') AS cidade
FROM empresa e;

-- bi_cambio
CREATE OR REPLACE VIEW bi_cambio AS
SELECT
    COALESCE(m.moeda_id::text, '') AS moeda_id,
    COALESCE(m.moeda_sigla, '') AS moeda_sigla,
    DATE_TRUNC('month', c.cambio_data)::date AS mes_referencia,
    COALESCE(AVG(c.cambio_taxa), 0) AS taxa_media
FROM cambio c
LEFT JOIN moeda m ON m.moeda_id = c.moeda_id
WHERE c.cambio_data >= '1990-01-01'
GROUP BY m.moeda_id, m.moeda_sigla, DATE_TRUNC('month', c.cambio_data);
ENDVIEWS
)

  if [[ -z "$PGHOST" ]]; then
    psql -U "$ADMIN_USER" -d "$PGDATABASE" <<< "$VIEWS_SQL" >/dev/null 2>&1 || {
      fatal "Falha ao criar views"
    }
  else
    PGPASSWORD="" psql -h "$PGHOST" -p "$PGPORT" -U "$ADMIN_USER" -d "$PGDATABASE" <<< "$VIEWS_SQL" >/dev/null 2>&1 || {
      fatal "Falha ao criar views"
    }
  fi

  ok "Views criadas com sucesso"
}

# ─── Criação de usuário de sistema ───────────────────────────────────────────

create_system_user() {
  separator
  info "Criando usuário de sistema 'analytics'..."

  if ! id "analytics" &>/dev/null; then
    useradd --system --no-create-home --shell /usr/sbin/nologin analytics || {
      fatal "Falha ao criar usuário de sistema"
    }
    ok "Usuário de sistema criado"
  else
    info "Usuário de sistema já existe"
  fi
}

# ─── Instalação do agente ────────────────────────────────────────────────────

install_agent() {
  separator
  info "Instalando agente em /usr/local/bin/..."

  # Procura pelo mgsis-ingest.sh neste diretório
  local script_dir
  script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

  if [[ ! -f "$script_dir/mgsis-ingest.sh" ]]; then
    fatal "Arquivo mgsis-ingest.sh não encontrado em $script_dir"
  fi

  install -m 755 "$script_dir/mgsis-ingest.sh" /usr/local/bin/mgsis-ingest.sh
  ok "Agente instalado em /usr/local/bin/mgsis-ingest.sh"
}

# ─── Instalação de token ────────────────────────────────────────────────────

install_token() {
  separator
  info "Instalando token..."

  if [[ -z "$TOKEN" ]]; then
    warn "Token vazio — pulando. Configure depois com:"
    warn "  echo 'TOKEN_AQUI' | sudo tee /etc/mgsis-token"
    warn "  sudo chmod 600 /etc/mgsis-token"
    warn "  sudo chown analytics:analytics /etc/mgsis-token"
    return
  fi

  printf '%s' "$TOKEN" | install -m 600 -o analytics -g analytics /dev/stdin /etc/mgsis-token
  ok "Token instalado em /etc/mgsis-token"
}

# ─── Geração do arquivo de configuração ─────────────────────────────────────

create_conf() {
  separator
  info "Gerando /etc/mgsis-ingest.conf..."

  local PGPASSFILE=""
  if [[ -n "$PGHOST" && -n "$PGPASSWORD" ]]; then
    PGPASSFILE="/var/lib/analytics/.pgpass"
  fi

  local CONF_CONTENT
  CONF_CONTENT=$(cat <<ENDCONF
# Configuração do agente MGSIS Analytics
# Gerado automaticamente por setup_analytics.sh

API_URL="https://analytics.mgsis.com"
TOKEN_FILE="/etc/mgsis-token"

# Origem: Postgres do ERP
PGHOST="${PGHOST}"
PGPORT="${PGPORT}"
PGDATABASE="${PGDATABASE}"
PGUSER="analytics"
PGPASSWORD="${PGPASSWORD:-}"
PGPASSFILE="${PGPASSFILE}"

# Comportamento
TENTATIVAS=3
TIMEOUT=600
PERMITIR_VAZIO="nao"
JANELA_MESES_FINANCEIRO=12
INICIO_HISTORICO="${INICIO_HISTORICO}"

# Arquivo de lock
LOCK_FILE="/var/lock/mgsis-ingest.lock"
ENDCONF
  )

  printf '%s' "$CONF_CONTENT" | install -m 640 -o root -g analytics /dev/stdin /etc/mgsis-ingest.conf
  ok "Configuração criada em /etc/mgsis-ingest.conf"

  # Se usar senha TCP, cria .pgpass
  if [[ -n "$PGPASSFILE" && -n "$PGPASSWORD" ]]; then
    mkdir -p /var/lib/analytics
    chown analytics:analytics /var/lib/analytics
    printf '%s' "localhost:${PGPORT}:${PGDATABASE}:analytics:${PGPASSWORD}" | \
      install -m 600 -o analytics -g analytics /dev/stdin "$PGPASSFILE"
    ok "Arquivo .pgpass criado em $PGPASSFILE"
  fi
}

# ─── Testes de conectividade ────────────────────────────────────────────────

test_postgres_connection() {
  separator
  info "Testando conexão ao Postgres..."

  if [[ -z "$PGHOST" ]]; then
    if sudo -u analytics psql -d "$PGDATABASE" -c "SELECT current_user" &>/dev/null; then
      ok "Conexão ao Postgres OK (socket local, peer auth)"
    else
      warn "Não consegui conectar via socket local"
      warn "Teste manual: sudo -u analytics psql -d $PGDATABASE -c 'SELECT current_user'"
    fi
  else
    if PGPASSWORD="" psql -h "$PGHOST" -p "$PGPORT" -U "$ADMIN_USER" -d "$PGDATABASE" -c "SELECT current_user" &>/dev/null; then
      ok "Conexão ao Postgres OK (TCP)"
    else
      warn "Não consegui conectar ao Postgres em $PGHOST:$PGPORT"
    fi
  fi
}

test_views_exist() {
  separator
  info "Verificando se as views foram criadas..."

  local views="bi_movimento bi_orcamentos bi_receber bi_pagar bi_caixa bi_estoque"

  for view in $views; do
    if [[ -z "$PGHOST" ]]; then
      if psql -U "$ADMIN_USER" -d "$PGDATABASE" -c "SELECT 1 FROM $view LIMIT 1" &>/dev/null; then
        ok "View $view existe"
      else
        warn "View $view não encontrada"
      fi
    else
      if PGPASSWORD="" psql -h "$PGHOST" -p "$PGPORT" -U "$ADMIN_USER" -d "$PGDATABASE" -c "SELECT 1 FROM $view LIMIT 1" &>/dev/null; then
        ok "View $view existe"
      else
        warn "View $view não encontrada"
      fi
    fi
  done
}

test_agent_permissions() {
  separator
  info "Testando permissões do usuário analytics..."

  if [[ -z "$PGHOST" ]]; then
    if sudo -u analytics psql -d "$PGDATABASE" -c "SELECT COUNT(*) FROM bi_movimento" &>/dev/null; then
      ok "Usuário analytics consegue ler as views"
    else
      warn "Usuário analytics NÃO consegue ler as views"
    fi
  else
    if PGPASSWORD="${PGPASSWORD:-}" psql -h "$PGHOST" -p "$PGPORT" -U "analytics" -d "$PGDATABASE" -c "SELECT COUNT(*) FROM bi_movimento" &>/dev/null; then
      ok "Usuário analytics consegue ler as views"
    else
      warn "Usuário analytics NÃO consegue ler as views"
    fi
  fi
}

test_simulation() {
  separator
  info "Teste de simulação (sem enviar dados)..."

  if [[ ! -f /etc/mgsis-token ]]; then
    warn "Token não instalado, pulando teste de simulação"
    return
  fi

  if sudo -u analytics /usr/local/bin/mgsis-ingest.sh --periodo "$(date +%Y-%m)" --simular &>/dev/null; then
    ok "Simulação funcionou"
  else
    warn "Simulação retornou erro — confira o log"
  fi
}

# ─── Instalação de automação ────────────────────────────────────────────────

install_systemd() {
  separator
  info "Instalando systemd timer..."

  local script_dir
  script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

  if [[ ! -f "$script_dir/systemd/mgsis-ingest.service" ]]; then
    fatal "Arquivo systemd/mgsis-ingest.service não encontrado"
  fi

  install -m 644 "$script_dir/systemd/mgsis-ingest.service" /etc/systemd/system/
  install -m 644 "$script_dir/systemd/mgsis-ingest.timer" /etc/systemd/system/

  systemctl daemon-reload
  systemctl enable --now mgsis-ingest.timer

  ok "Timer instalado e ativado"
  info "Próxima execução: $(systemctl list-timers mgsis-ingest.timer | tail -1)"
}

install_cron() {
  separator
  info "Instalando cron..."

  # Cria arquivo cron para o usuário analytics
  local CRON_FILE="/etc/cron.d/mgsis-ingest"
  local CRON_CONTENT="# MGSIS Analytics ingest schedule
# Criado por setup_analytics.sh

7 * * * * analytics /usr/local/bin/mgsis-ingest.sh --ciclo >> /var/log/mgsis-ingest.log 2>&1
0 3 * * * analytics /usr/local/bin/mgsis-ingest.sh --recarga-financeira >> /var/log/mgsis-ingest.log 2>&1
"

  printf '%s' "$CRON_CONTENT" | install -m 644 /dev/stdin "$CRON_FILE"
  ok "Cron instalado em $CRON_FILE"

  # Cria log
  touch /var/log/mgsis-ingest.log
  chown analytics:analytics /var/log/mgsis-ingest.log
  chmod 640 /var/log/mgsis-ingest.log
  ok "Arquivo de log criado em /var/log/mgsis-ingest.log"
}

# ─── Resumo final ──────────────────────────────────────────────────────────

print_summary() {
  separator
  info "╔════════════════════════════════════════════════════════════╗"
  info "║  INSTALAÇÃO CONCLUÍDA COM SUCESSO                         ║"
  info "╚════════════════════════════════════════════════════════════╝"

  printf "\n${GREEN}Arquivos instalados:${NC}\n"
  printf "  • Agente:         /usr/local/bin/mgsis-ingest.sh\n"
  printf "  • Configuração:   /etc/mgsis-ingest.conf\n"
  printf "  • Token:          /etc/mgsis-token\n"

  printf "\n${GREEN}Próximos passos:${NC}\n"
  printf "  1. Conferir a configuração:\n"
  printf "       sudo cat /etc/mgsis-ingest.conf\n"
  printf "\n  2. Testar uma simulação:\n"
  printf "       sudo -u analytics mgsis-ingest.sh --periodo $(date +%Y-%m) --simular\n"
  printf "\n  3. Testar um envio real:\n"
  printf "       sudo -u analytics mgsis-ingest.sh --periodo $(date +%Y-%m)\n"
  printf "\n  4. Verificar no Analytics se os dados chegaram\n"
  printf "\n  5. Acompanhar logs automáticos:\n"

  if [[ "$USE_SYSTEMD" == true ]]; then
    printf "       sudo journalctl -u mgsis-ingest.service -f\n"
  else
    printf "       sudo tail -f /var/log/mgsis-ingest.log\n"
  fi

  printf "\n${GREEN}Documentação:${NC}\n"
  printf "  • Guia completo:  agente/README.md\n"
  printf "  • API:            INGESTAO-API.md\n"
  printf "  • Mapeamento:     sql dados/MAPEAMENTO-API.md\n"
  printf "\n${BLUE}Dúvidas?${NC} Confira os arquivos .md no repositório.\n\n"
}

# ─── Fluxo principal ───────────────────────────────────────────────────────

main() {
  clear
  printf "${BLUE}╔════════════════════════════════════════════════════════════╗${NC}\n"
  printf "${BLUE}║  SETUP MGSIS Analytics — Instalação Completa             ║${NC}\n"
  printf "${BLUE}╚════════════════════════════════════════════════════════════╝${NC}\n"

  check_prerequisites
  ask_db_connection
  ask_token
  ask_automation
  ask_ingest_path

  # Resumo do que vai fazer
  separator
  info "Vou executar:"
  printf "  ✓ Criar usuário 'analytics' no Postgres\n"
  printf "  ✓ Criar views bi_* para analytics\n"
  printf "  ✓ Criar usuário de sistema 'analytics'\n"
  printf "  ✓ Instalar agente em /usr/local/bin/\n"
  printf "  ✓ Instalar token em /etc/mgsis-token\n"
  printf "  ✓ Gerar /etc/mgsis-ingest.conf\n"
  if [[ "$USE_SYSTEMD" == true ]]; then
    printf "  ✓ Instalar systemd timer\n"
  else
    printf "  ✓ Instalar cron\n"
  fi
  printf "  ✓ Testar conexões e views\n"

  printf "\n"
  read -p "Confirma? (s/n) " -n 1 -r confirm
  printf "\n"
  if ! [[ "$confirm" =~ ^[Ss]$ ]]; then
    fatal "Instalação cancelada pelo usuário"
  fi

  # Executa instalação
  create_system_user
  create_analytics_user
  create_views
  install_agent
  install_token
  create_conf
  test_postgres_connection
  test_views_exist
  test_agent_permissions
  test_simulation

  if [[ "$USE_SYSTEMD" == true ]]; then
    install_systemd
  else
    install_cron
  fi

  print_summary
}

# ─── Início ────────────────────────────────────────────────────────────────

main "$@"
