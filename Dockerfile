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
# Diretório gravável para snapshots/importações locais, antes de trocar de user.
RUN mkdir -p /app/data && chown nextjs:nodejs /app/data
USER nextjs
EXPOSE 3000
# Healthcheck usa PORT dinâmico (não fixa 3000) e bate em /health.
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD node -e "require('http').get('http://127.0.0.1:'+(process.env.PORT||3000)+'/health',r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"
CMD ["node", "server.js"]
