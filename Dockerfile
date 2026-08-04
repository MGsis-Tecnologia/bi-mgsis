# syntax=docker/dockerfile:1

# ─── Estágio 1: dependências ──────────────────────────────────
FROM node:20-alpine AS deps
WORKDIR /app
# openssl é necessário para o `prisma generate` (postinstall) detectar o
# engine correto no Alpine (OpenSSL 3).
RUN apk add --no-cache openssl
# Fixa NODE_ENV=development para o `npm ci` SEMPRE instalar devDependencies
# (typescript, tailwindcss, postcss...) — o `next build` precisa delas.
# Sem isso, se a plataforma injetar NODE_ENV=production no build, o npm pula
# as devDeps e o build quebra com "tailwindcss/tsc not found".
ENV NODE_ENV=development
COPY package*.json ./
COPY prisma ./prisma
RUN npm ci

# ─── Estágio 2: build ─────────────────────────────────────────
FROM node:20-alpine AS builder
WORKDIR /app
RUN apk add --no-cache openssl
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# DATABASE_URL é usado apenas para satisfazer o schema do Prisma durante o
# build (o `prisma generate` não conecta no banco). A URL real vem em runtime
# pela variável de ambiente do Coolify.
ARG DATABASE_URL="postgresql://placeholder:placeholder@localhost:5432/placeholder"
ENV DATABASE_URL=$DATABASE_URL
# `next build` sempre gera saída de produção, independente do NODE_ENV do shell.
RUN npm run build

# ─── Estágio 3: runtime ───────────────────────────────────────
FROM node:20-alpine AS runner
WORKDIR /app
# openssl: engine do Prisma. curl: usado pelo healthcheck do Coolify, que roda
# de dentro do container (a imagem alpine não traz curl por padrão).
RUN apk add --no-cache openssl curl
ENV NODE_ENV=production
# HOSTNAME=0.0.0.0 garante que o server standalone do Next escute em todas as
# interfaces (senão pode ficar preso em localhost e o Coolify não alcança).
ENV HOSTNAME=0.0.0.0
ENV PORT=3000
RUN addgroup -g 1001 -S nodejs && adduser -S nextjs -u 1001
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# O client do catalog é gerado num caminho fora do padrão
# (node_modules/.prisma/catalog-client, ver prisma/catalog/schema.prisma). O
# bundle do Next embute o código dele, mas guarda o caminho ABSOLUTO pra achar o
# engine binário em runtime — e o `.next/standalone` não traz esse diretório.
# Sem esta cópia, qualquer rota que toque o catalog (login, /master/*) quebra ao
# carregar o engine. O client de tenant (.prisma/client) já vem no standalone.
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/.prisma/catalog-client ./node_modules/.prisma/catalog-client

# ─── Migrations versionadas (fase 7) ──────────────────────────
# O build standalone do Next só traz o que o bundle importa, então o CLI do
# Prisma fica de fora. Ele é copiado para um node_modules PRÓPRIO (/app/migrator)
# em vez de /app/node_modules: assim não sobrescreve o @prisma/client já
# rastreado pelo standalone nem o client gerado em .prisma/.
# Só o CLI e sua árvore de dependências (prisma → @prisma/engines → ...).
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/prisma ./migrator/node_modules/prisma
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/@prisma/engines ./migrator/node_modules/@prisma/engines
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/@prisma/engines-version ./migrator/node_modules/@prisma/engines-version
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/@prisma/debug ./migrator/node_modules/@prisma/debug
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/@prisma/fetch-engine ./migrator/node_modules/@prisma/fetch-engine
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/@prisma/get-platform ./migrator/node_modules/@prisma/get-platform
# Schemas + histórico de migrations (o `migrate deploy` lê os dois).
COPY --from=builder --chown=nextjs:nodejs /app/prisma ./prisma
COPY --from=builder --chown=nextjs:nodejs /app/scripts ./scripts
RUN chmod +x /app/scripts/docker-entrypoint.sh
ENV PRISMA_CLI=/app/migrator/node_modules/prisma/build/index.js
ENV PRISMA_TENANT_SCHEMA=/app/prisma/schema.prisma
# Sem isso o CLI tenta bater num endpoint de telemetria/versão a cada execução
# e engasga alguns segundos quando o container não tem saída pra internet.
ENV CHECKPOINT_DISABLE=1
ENV PRISMA_HIDE_UPDATE_MESSAGE=1

# Diretório gravável para snapshots/importações locais, antes de trocar de user.
RUN mkdir -p /app/data && chown nextjs:nodejs /app/data
USER nextjs
EXPOSE 3000
# Healthcheck usa PORT dinâmico (não fixa 3000) e bate em /health.
# start-period folgado: o entrypoint aplica as migrations de todos os tenants
# ANTES de subir o server, e esse tempo cresce com o número de empresas.
HEALTHCHECK --interval=30s --timeout=5s --start-period=120s --retries=3 \
  CMD node -e "require('http').get('http://127.0.0.1:'+(process.env.PORT||3000)+'/health',r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"
CMD ["/app/scripts/docker-entrypoint.sh"]
