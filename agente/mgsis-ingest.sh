#!/usr/bin/env bash
#
# Agente de ingestão MGSIS Analytics
#
# Lê as views bi_* do ERP e envia para o Analytics pela API de ingestão.
# Roda no servidor Linux do cliente, por cron ou systemd timer.
#
# Por que bash + psql + curl: a máquina já é o servidor do Postgres, então psql
# está lá por definição, e curl está em qualquer distribuição. Nada a instalar,
# nada para quebrar em atualização de runtime.
#
# Uso:
#   mgsis-ingest.sh --ciclo                 mês corrente + anterior + estoque
#   mgsis-ingest.sh --inicial 2022-01       carga inicial, daquele mês até hoje
#   mgsis-ingest.sh --periodo 2026-05       um mês, todos os datasets
#   mgsis-ingest.sh --periodo 2026-05 --dataset vendas
#   mgsis-ingest.sh --ciclo --simular       monta e valida, não envia
#
set -Eeuo pipefail

CONF="${MGSIS_CONF:-/etc/mgsis-ingest.conf}"
[[ -r "$CONF" ]] || { echo "ERRO: configuração não encontrada em $CONF" >&2; exit 78; }
# shellcheck disable=SC1090
source "$CONF"

: "${API_URL:?defina API_URL no $CONF}"
: "${TOKEN_FILE:?defina TOKEN_FILE no $CONF}"
: "${PGDATABASE:?defina PGDATABASE no $CONF}"
# `${PGHOST-...}` sem os dois-pontos: PGHOST="" no conf é uma escolha, não uma
# omissão — significa "use o socket local", que é o que habilita autenticação
# `peer` e dispensa senha. Com `:-` o vazio viraria "localhost" e forçaria TCP.
export PGHOST="${PGHOST-localhost}"
export PGPORT="${PGPORT:-5432}"
export PGUSER="${PGUSER:-analytics}"
export PGDATABASE PGPASSWORD="${PGPASSWORD:-}"
TENTATIVAS="${TENTATIVAS:-3}"
TIMEOUT="${TIMEOUT:-600}"

[[ -r "$TOKEN_FILE" ]] || { echo "ERRO: token não legível em $TOKEN_FILE" >&2; exit 78; }
TOKEN="$(tr -d '[:space:]' < "$TOKEN_FILE")"
[[ "$TOKEN" =~ ^[0-9a-fA-F]{64}$ ]] || {
  echo "ERRO: o token em $TOKEN_FILE não tem o formato esperado (64 hex)." >&2
  echo "      Gere um novo em Master → Empresas → (empresa) → token de integração." >&2
  exit 78
}

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

log() { printf '%s  %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$*"; }
erro() { printf '%s  ERRO: %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$*" >&2; }

# Aritmética de mês SEMPRE em UTC (-u). Em horário local o dia 1º pode
# simplesmente NÃO EXISTIR: o Paraguai começava o horário de verão no primeiro
# domingo de outubro à meia-noite, então 2023-10-01 00:00 nunca aconteceu — o
# relógio pulou de 23:59:59 para 01:00. O GNU date recusa horário local
# inexistente com "data inválida", e a carga inicial morria naquele mês.
# UTC não tem essa descontinuidade em nenhum ano.
#
# Falha vira erro alto: sem isto, a data vazia entrava no SQL como `< ''` e
# produzia um erro obscuro cinco linhas abaixo.
desloca_mes() { # <YYYY-MM-DD> <deslocamento> <formato>
  local r
  r="$(date -u -d "$1 $2" "+$3" 2>/dev/null)" || r=""
  [[ -n "$r" ]] || {
    erro "não consegui calcular \"$1 $2\" — o comando 'date' desta máquina não aceita deslocamento relativo?"
    return 1
  }
  printf '%s' "$r"
}

# ─── Consultas ───────────────────────────────────────────────────────────────
#
# Cada uma devolve UMA linha com o corpo pronto da requisição. Os apelidos entre
# aspas são os nomes exatos que a API espera — é aqui, e só aqui, que mora o
# mapeamento view → contrato. Ver sql dados/MAPEAMENTO-API.md.
#
# O filtro é `>= de AND < ate`, com `ate` no primeiro dia do mês SEGUINTE: as
# colunas são timestamp, e `<= '2026-05-31'` perderia tudo depois da meia-noite
# do dia 31.

sql_vendas() { cat <<'SQL'
SELECT json_build_object('periodo', :'periodo', 'linhas', COALESCE(json_agg(x), '[]'::json))
FROM (
  SELECT to_char(pedido_data, 'YYYY-MM-DD') AS "date",
         pedido_documento   AS "orderId",     pedido_tipo        AS "orderType",
         pedido_canal       AS "channel",     cliente_id         AS "clientId",
         cliente_nome       AS "clientName",  pedido_cidade      AS "clientCity",
         produto_id         AS "productId",   produto_descricao  AS "productName",
         produto_quantidade AS "quantity",    produto_valor_total AS "totalOrig",
         produto_valor_custo AS "costOrig",   item_desconto      AS "discountOrig",
         subgrupo_id        AS "subgroupId",  subgrupo_descricao AS "subgroupName",
         vendedor_id        AS "sellerId",    vendedor_nome      AS "sellerName",
         moeda_id           AS "currencyId",  moeda_sigla        AS "currencyCode",
         empresa_id         AS "empresaId"
  FROM bi_movimento
  WHERE pedido_data >= :'de' AND pedido_data < :'ate'
) x
SQL
}

# Compras: uma linha por item comprado. Não há custo nem desconto — a compra É
# o custo — nem vendedor ou canal, porque quem compra é a empresa.
sql_compras() { cat <<'SQL'
SELECT json_build_object('periodo', :'periodo', 'linhas', COALESCE(json_agg(x), '[]'::json))
FROM (
  SELECT to_char(pedido_data, 'YYYY-MM-DD') AS "pedidoData",
         pedido_documento   AS "pedidoDocumento",
         pedido_tipo        AS "pedidoTipo",
         fornecedor_id      AS "fornecedorId",
         fornecedor_nome    AS "fornecedorNome",
         produto_id         AS "produtoId",
         produto_descricao  AS "produtoDescricao",
         produto_quantidade AS "produtoQuantidade",
         produto_valor_total AS "produtoValorTotal",
         moeda_id           AS "moedaId",
         moeda_sigla        AS "moedaSigla",
         empresa_id         AS "empresaId",
         -- Já vem como texto da view ('' quando ausente ou fora de 1990–2035),
         -- então NÃO leva to_char: aplicá-lo de novo em texto é erro de tipo.
         pedido_emissao     AS "pedidoEmissao",
         subgrupo_id        AS "subgrupoId",
         subgrupo_descricao AS "subgrupoDescricao"
  FROM bi_compras
  WHERE pedido_data >= :'de' AND pedido_data < :'ate'
) x
SQL
}

sql_orcamentos() { cat <<'SQL'
SELECT json_build_object('periodo', :'periodo', 'linhas', COALESCE(json_agg(x), '[]'::json))
FROM (
  SELECT orcamento_id AS "orcamentoId",
         to_char(orcamento_data, 'YYYY-MM-DD') AS "orcamentoData",
         orcamento_confirmado       AS "orcamentoConfirmado",
         orcamento_data_confirmacao AS "orcamentoDataConfirmacao",
         cliente_id  AS "clienteId",  cliente_nome  AS "clienteNome",
         vendedor_id AS "vendedorId", vendedor_nome AS "vendedorNome",
         empresa_id  AS "empresaId",  moeda_id      AS "moedaId",
         moeda_sigla AS "moedaSigla", item_orcamento_id AS "itemOrcamentoId",
         produto_id  AS "produtoId",  produto_descricao  AS "produtoDescricao",
         produto_fabricante AS "produtoFabricante",
         item_quantidade AS "itemQuantidade",
         item_quantidade_confirmada AS "itemQuantidadeConfirmada",
         item_total AS "itemTotal"
  FROM bi_orcamentos
  WHERE orcamento_data >= :'de' AND orcamento_data < :'ate'
) x
SQL
}

sql_receber() { cat <<'SQL'
SELECT json_build_object('periodo', :'periodo', 'linhas', COALESCE(json_agg(x), '[]'::json))
FROM (
  SELECT receber_documento AS "documentId",
         to_char(data_emissao, 'YYYY-MM-DD') AS "issueDate",
         data_vencimento  AS "dueDate",    data_recebimento AS "receivedDate",
         is_paid          AS "isPaid",     tipolanzamiento  AS "entryType",
         valor_documento  AS "amountOrig", pessoa_cliente_id AS "clientId",
         pessoa_nome      AS "clientName", pessoa_cidade    AS "clientCity",
         vendedor_id      AS "sellerId",   vendedor_nome    AS "sellerName",
         moeda_id         AS "currencyId", moeda_sigla      AS "currencyCode",
         empresa_id       AS "empresaId"
  FROM bi_receber
  WHERE data_emissao >= :'de' AND data_emissao < :'ate'
) x
SQL
}

sql_pagar() { cat <<'SQL'
SELECT json_build_object('periodo', :'periodo', 'linhas', COALESCE(json_agg(x), '[]'::json))
FROM (
  SELECT pagar_documento AS "documentId",
         to_char(data_emissao, 'YYYY-MM-DD') AS "issueDate",
         data_vencimento AS "dueDate",    data_pagamento AS "paidDate",
         is_paid         AS "isPaid",     tipolanzamiento AS "entryType",
         valor_documento AS "amountOrig", pessoa_fornecedor_id AS "supplierId",
         pessoa_nome     AS "supplierName",
         moeda_id        AS "currencyId", moeda_sigla    AS "currencyCode",
         empresa_id      AS "empresaId"
  FROM bi_pagar
  WHERE data_emissao >= :'de' AND data_emissao < :'ate'
) x
SQL
}

sql_caixa() { cat <<'SQL'
SELECT json_build_object('periodo', :'periodo', 'linhas', COALESCE(json_agg(x), '[]'::json))
FROM (
  SELECT to_char(caixa_data_emissao, 'YYYY-MM-DD') AS "date",
         centro_custo_id        AS "centroCustoId",
         centro_custo_descricao AS "centroCustoDescricao",
         plano_conta_id         AS "planoContaId",
         plano_conta_codigo     AS "planoContaCodigo",
         plano_conta_descricao  AS "planoContaDescricao",
         caixa_id               AS "caixaId",
         caixa_descricao        AS "caixaDescricao",
         caixa_valor_documento  AS "valorDocumento",
         moeda_id               AS "moedaId",
         moeda_sigla            AS "moedaSigla",
         empresa_id             AS "empresaId"
  FROM bi_caixa
  WHERE caixa_data_emissao >= :'de' AND caixa_data_emissao < :'ate'
) x
SQL
}

# Estoque é uma FOTO: vai inteiro, sem período.
sql_estoque() { cat <<'SQL'
SELECT json_build_object('periodo', 'tudo', 'linhas', COALESCE(json_agg(x), '[]'::json))
FROM (
  SELECT produto_id AS "productId",  produto_descricao AS "description",
         produto_fabricante AS "manufacturerCode",
         estoque_item   AS "stock",  valor_estoque AS "costTotalUSD",
         estoque_minimo AS "minStock",
         moeda_id AS "currencyId",   moeda_sigla AS "currencyCode",
         empresa_id AS "empresaId"
  FROM bi_estoque
) x
SQL
}


# Câmbio: MÉDIA MENSAL, e vai INTEIRO a cada ciclo, sem recorte de período.
#
# São algumas centenas de linhas — controlar período aqui só traria o risco de
# um buraco por sincronismo parcial sem economizar nada. O servidor reescreve a
# tabela derivando os dois sentidos de cada par e preenchendo mês sem cotação
# com o mais próximo.
#
# `taxa` é a MAGNITUDE que a view devolve ("1 dólar custa 7.350 guaranis"), não
# um fator de multiplicação — quem resolve a direção é o servidor.
sql_cambio() { cat <<'SQL'
SELECT json_build_object('periodo', 'tudo', 'linhas', COALESCE(json_agg(x), '[]'::json))
FROM (
  SELECT to_char(mes_referencia, 'YYYY-MM') AS "competencia",
         moeda_origem  AS "moedaOrigem",
         moeda_destino AS "moedaDestino",
         cambio_medio  AS "taxa"
  FROM bi_cambio
) x
SQL
}

conta_sql() {
  case "$1" in
    vendas)     echo "SELECT count(*) FROM bi_movimento  WHERE pedido_data        >= :'de' AND pedido_data        < :'ate'" ;;
    compras)    echo "SELECT count(*) FROM bi_compras    WHERE pedido_data        >= :'de' AND pedido_data        < :'ate'" ;;
    orcamentos) echo "SELECT count(*) FROM bi_orcamentos WHERE orcamento_data     >= :'de' AND orcamento_data     < :'ate'" ;;
    receber)    echo "SELECT count(*) FROM bi_receber    WHERE data_emissao       >= :'de' AND data_emissao       < :'ate'" ;;
    pagar)      echo "SELECT count(*) FROM bi_pagar      WHERE data_emissao       >= :'de' AND data_emissao       < :'ate'" ;;
    caixa)      echo "SELECT count(*) FROM bi_caixa      WHERE caixa_data_emissao >= :'de' AND caixa_data_emissao < :'ate'" ;;
    estoque)    echo "SELECT count(*) FROM bi_estoque" ;;
    cambio)     echo "SELECT count(*) FROM bi_cambio" ;;
  esac
}

DATASETS_PERIODO=(vendas compras orcamentos receber pagar caixa)

# ─── Envio ───────────────────────────────────────────────────────────────────

# envia <dataset> <periodo> <de> <ate>
envia() {
  local ds="$1" periodo="$2" de="${3:-}" ate="${4:-}"
  local corpo="$TMP/$ds.json"

  # Pela ENTRADA PADRÃO, não por -c: `psql -c` manda a string direto ao
  # servidor e não expande variável do psql — a documentação exige que ela seja
  # "completamente analisável pelo servidor, sem recursos específicos do psql".
  # Com -c, o `:'de'` chegaria literal e o Postgres devolveria erro de sintaxe.
  local n
  n="$(conta_sql "$ds" | psql -X -A -t -q -v ON_ERROR_STOP=1 \
        -v de="$de" -v ate="$ate" -f - | tr -d '[:space:]')" || {
    erro "$ds $periodo: falha ao consultar o ERP"
    return 1
  }

  # A operação da API é "substitua o período por estas linhas" — mandar zero
  # linhas APAGA o período. Se a consulta voltar vazia por defeito (view
  # recriada, permissão revogada, filtro errado), enviar destruiria dado bom.
  if [[ "$n" == "0" ]]; then
    if [[ "${PERMITIR_VAZIO:-nao}" == "sim" ]]; then
      log "  $ds $periodo: 0 linhas — enviando assim mesmo (PERMITIR_VAZIO=sim)"
    else
      log "  $ds $periodo: 0 linhas — PULADO (envio vazio apagaria o período)"
      return 0
    fi
  fi

  # Idem: pela entrada padrão. Também evita depender de `<(...)`, que precisa de
  # /dev/fd — um a menos para dar errado em ambiente enxuto.
  "sql_$ds" | psql -X -A -t -q -v ON_ERROR_STOP=1 \
       -v periodo="$periodo" -v de="$de" -v ate="$ate" -f - > "$corpo" || {
    erro "$ds $periodo: falha ao montar o corpo"
    return 1
  }

  local tam
  tam="$(wc -c < "$corpo")"

  if [[ "${SIMULAR:-nao}" == "sim" ]]; then
    log "  $ds $periodo: $n linhas · $((tam / 1024)) KB · SIMULADO (não enviado)"
    return 0
  fi

  local tentativa=1 http resposta detalhe
  resposta="$TMP/resposta.txt"
  # Quando o curl nem conecta, ele não cria o arquivo de saída — ler direto
  # encheria o log de "No such file or directory" no lugar do erro de verdade.
  corpo_da_resposta() { [[ -s "$resposta" ]] && head -c 500 "$resposta" || echo "(sem resposta do servidor)"; }

  while true; do
    : > "$resposta"
    http="$(curl -sS -o "$resposta" -w '%{http_code}' \
      --max-time "$TIMEOUT" \
      -X POST "$API_URL/api/ingest/$ds" \
      -H "Authorization: Bearer $TOKEN" \
      -H 'Content-Type: application/json' \
      --data-binary "@$corpo" 2>>"$TMP/curl.err")" || http="000"

    if [[ "$http" == "200" ]]; then
      log "  $ds $periodo: $n linhas · $((tam / 1024)) KB · OK"
      return 0
    fi

    # 4xx é defeito do que mandamos: repetir dá o mesmo erro.
    if [[ "$http" =~ ^4 ]]; then
      erro "$ds $periodo: HTTP $http — $(corpo_da_resposta)"
      return 1
    fi

    if (( tentativa >= TENTATIVAS )); then
      erro "$ds $periodo: HTTP $http após $TENTATIVAS tentativas — $(corpo_da_resposta)"
      [[ -s "$TMP/curl.err" ]] && erro "curl: $(tail -1 "$TMP/curl.err")"
      return 1
    fi

    local espera=$(( tentativa * 15 ))
    log "  $ds $periodo: HTTP $http — nova tentativa em ${espera}s ($tentativa/$TENTATIVAS)"
    sleep "$espera"
    tentativa=$(( tentativa + 1 ))
  done
}

  # Os dois datasets sem período: foto do momento (estoque) e histórico
  # completo de cotações (câmbio). Vão inteiros, sempre.
  envia_sem_periodo() {
    local so="${1:-}" falhas=0
    for ds in estoque cambio; do
      [[ -n "$so" && "$so" != "$ds" ]] && continue
      log "$ds (envio completo)"
      envia "$ds" tudo || falhas=$(( falhas + 1 ))
    done
    return "$falhas"
  }

# envia_mes <YYYY-MM> [dataset]
envia_mes() {
  local mes="$1" so="${2:-}"
  local de="$mes-01"
  local ate
  ate="$(desloca_mes "$de" "+1 month" "%Y-%m-%d")" || return 1
  log "período $mes"
  local falhas=0
  for ds in "${DATASETS_PERIODO[@]}"; do
    [[ -n "$so" && "$so" != "$ds" ]] && continue
    envia "$ds" "$mes" "$de" "$ate" || falhas=$(( falhas + 1 ))
  done
  return "$falhas"
}

# ─── Argumentos ──────────────────────────────────────────────────────────────

MODO="" ARG="" SO_DATASET=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --ciclo)    MODO=ciclo ;;
    --inicial)  MODO=inicial; ARG="${2:-}"; shift ;;
    --periodo)  MODO=periodo; ARG="${2:-}"; shift ;;
    --dataset)  SO_DATASET="${2:-}"; shift ;;
    --simular)  SIMULAR=sim ;;
    --permitir-vazio) PERMITIR_VAZIO=sim ;;
    -h|--help)  sed -n '2,20p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *)          erro "argumento desconhecido: $1"; exit 64 ;;
  esac
  shift
done
[[ -n "$MODO" ]] || { erro "informe --ciclo, --inicial <YYYY-MM> ou --periodo <YYYY-MM>"; exit 64; }

if [[ -n "$SO_DATASET" ]]; then
  case "$SO_DATASET" in
    vendas|compras|orcamentos|receber|pagar|caixa|estoque|cambio) ;;
    *) erro "dataset inválido: $SO_DATASET"; exit 64 ;;
  esac
fi

# Duas execuções ao mesmo tempo mandariam o mesmo período duas vezes. É
# idempotente, então não corrompe — mas dobra a carga à toa, e uma carga
# inicial longa cruzaria com o ciclo de 2 h.
#
# Sem `flock` na máquina, o agente SEGUE sem trava, avisando. A alternativa —
# tratar a ausência do comando como "já tem outra execução" — faria o cron
# sair com sucesso e não enviar nada, para sempre, sem sinal nenhum.
if command -v flock >/dev/null 2>&1; then
  exec 9>"${LOCK_FILE:-/var/lock/mgsis-ingest.lock}"
  flock -n 9 || { log "outra execução em andamento — saindo"; exit 0; }
else
  log "AVISO: 'flock' não encontrado — seguindo SEM trava contra execução simultânea."
  log "       Instale util-linux para evitar que duas execuções se cruzem."
fi

INICIO=$SECONDS
FALHAS=0

case "$MODO" in
  ciclo)
    # Mês anterior junto, sempre. Uma venda lançada dia 1º com data do dia 31
    # do mês passado cairia num mês que o ciclo não reescreve mais, e nunca
    # chegaria ao Analytics — sem sinal de erro nenhum.
    ANTERIOR="$(desloca_mes "$(date +%Y-%m-01)" "-1 month" "%Y-%m")" || exit 1
    CORRENTE="$(date +%Y-%m)"
    log "ciclo: $ANTERIOR e $CORRENTE"
    envia_mes "$ANTERIOR" "$SO_DATASET" || FALHAS=$(( FALHAS + $? ))
    envia_mes "$CORRENTE" "$SO_DATASET" || FALHAS=$(( FALHAS + $? ))
    envia_sem_periodo "$SO_DATASET" || FALHAS=$(( FALHAS + $? ))
    ;;

  inicial)
    [[ "$ARG" =~ ^[0-9]{4}-[0-9]{2}$ ]] || { erro "--inicial espera YYYY-MM"; exit 64; }
    FIM="$(date +%Y-%m)"
    log "carga inicial: $ARG até $FIM"
    MES="$ARG"
    while [[ "$MES" < "$FIM" || "$MES" == "$FIM" ]]; do
      envia_mes "$MES" "$SO_DATASET" || FALHAS=$(( FALHAS + $? ))
      MES="$(desloca_mes "$MES-01" "+1 month" "%Y-%m")" || exit 1
    done
    envia_sem_periodo "$SO_DATASET" || FALHAS=$(( FALHAS + $? ))
    ;;

  periodo)
    [[ "$ARG" =~ ^[0-9]{4}-[0-9]{2}$ ]] || { erro "--periodo espera YYYY-MM"; exit 64; }
    if [[ "$SO_DATASET" == "estoque" || "$SO_DATASET" == "cambio" ]]; then
      envia_sem_periodo "$SO_DATASET" || FALHAS=$(( FALHAS + $? ))
    else
      envia_mes "$ARG" "$SO_DATASET" || FALHAS=$(( FALHAS + $? ))
    fi
    ;;
esac

DUR=$(( SECONDS - INICIO ))
if (( FALHAS > 0 )); then
  erro "concluído com $FALHAS falha(s) em ${DUR}s"
  exit 1
fi
log "concluído sem falhas em ${DUR}s"
