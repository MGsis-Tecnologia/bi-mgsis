#!/bin/sh
# Entrypoint do container: aplica as migrations versionadas (catalog + todos os
# tenants) e só então sobe o servidor Next standalone.
set -e

echo "→ Aplicando migrations (catalog + tenants)..."
# Falha aqui NÃO impede o boot, de propósito: um tenant com schema quebrado (ou
# um Postgres que ainda não subiu) não pode derrubar o app inteiro nem travar o
# deploy das outras empresas. O relatório do script fica no log do container e
# /health continua sendo o sinal de saúde real.
if node /app/scripts/migrate-all.mjs; then
  echo "→ Migrations OK."
else
  echo "⚠️  Migrations terminaram com pendências — veja o relatório acima."
  echo "   O app vai subir mesmo assim; rode 'npm run migrate:check' pra auditar."
fi

exec node server.js
