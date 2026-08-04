# Deploy no Coolify

Fluxo único de deploy deste projeto: **1 `Dockerfile`, 1 container**, buildado e
gerenciado pelo Coolify. Não usa `docker-compose`.

## Arquitetura

- O `Dockerfile` (multi-stage) builda o Next.js 15 em modo `standalone` e serve
  tudo numa imagem só: as rotas de página, os Server Components e a API em
  `/api/*` saem do mesmo processo Node (`server.js`).
- `/health` é a única rota fora desse padrão — existe para o healthcheck do
  Docker/Coolify. As tabelas já vêm criadas pelas migrations que o entrypoint
  aplica antes do server subir (ver abaixo).
- O Postgres roda **fora** da imagem, como recurso separado (Postgres do
  Coolify, ou qualquer Postgres acessível por `DATABASE_URL`).

## Passo a passo no Coolify

1. **Banco de dados**: `+ New Resource → Databases → PostgreSQL` → Deploy.
   Copie a *Internal Connection URL* gerada (algo como
   `postgresql://postgres:senha@<service>:5432/postgres`).
   > Dica: acrescente `?schema=public` no fim da URL.

2. **Aplicação**: `+ New Resource → Application` → conecte o repositório Git,
   branch `main`.

3. **Build Pack**: `Dockerfile`.

4. **Ports Exposes**: `3000` (o app escuta em `PORT`, default `3000`). Se você
   mudar `PORT`, use o mesmo valor aqui — os dois precisam bater.

5. **Environment Variables** — marque todas como **Runtime only**
   (desmarque "Available at Buildtime"). Isso evita que o Coolify injete
   `NODE_ENV=production` no build e quebre o `npm ci` (as ferramentas de build
   estão em `devDependencies`). O `Dockerfile` já tem uma segunda defesa contra
   isso, mas manter Runtime only é a prática correta.

   | Variável | Exemplo | Obrigatória |
   |---|---|---|
   | `DATABASE_URL` | `postgresql://postgres:senha@host:5432/postgres?schema=public` | **Sim** |
   | `AUTH_SECRET` | saída de `openssl rand -base64 32` | **Sim (obrigatória)** — sem ela o app recusa subir em produção |
   | `APP_URL` | `https://bi.seudominio.com` | **Sim (recomendada)** — sem ela, os links de e-mail (convite, redefinição de senha) saem com o endereço interno do container (`http://0.0.0.0:3000`) em vez do domínio público |
   | `NEXT_PUBLIC_APP_NAME` | `Dash BI` | Não (tem default) |
   | `NEXT_PUBLIC_DEFAULT_CURRENCY` | `BRL` | Não (tem default) |
   | `SETTINGS_ENCRYPTION_KEY` | saída de `openssl rand -base64 32` | Recomendada — criptografa a senha SMTP salva em Configurações > E-mail (cai no `AUTH_SECRET` se ausente) |

   `PORT`, `HOST`/`HOSTNAME` e `NODE_ENV` **não** precisam ser setados — os
   defaults do `Dockerfile` (`3000` / `0.0.0.0` / `production`) já servem.

   > ⚠️ `NEXT_PUBLIC_*` são *inlined no build*. Se quiser mudar o valor delas,
   > aí sim precisam estar disponíveis em buildtime (exceção à regra acima).
   > Os defaults do código cobrem o caso normal — só mexa se for customizar.

6. **Domínio**: aba `Domains` → informe seu domínio (ex.: `https://bi.seudominio.com`).
   O Coolify emite o SSL via Let's Encrypt sozinho. Aponte o DNS (registro A)
   do domínio para o IP do VPS antes.

7. **Deploy**.

## O que acontece sozinho no boot

- O entrypoint (`scripts/docker-entrypoint.sh`) roda `scripts/migrate-all.mjs`
  **antes** de subir o server: aplica `prisma migrate deploy` no banco `catalog`
  e depois em **cada** database de tenant (uma por empresa cadastrada, mais a
  `DATABASE_URL` padrão).
- Falha em um tenant **não** derruba o boot nem impede os outros: o script
  isola cada banco, imprime um relatório no log do container e o app sobe
  mesmo assim. Audite depois com `npm run migrate:check`.
- `/health` responde `200 {"status":"ok","databaseReachable":true}` quando o
  banco está acessível — é o sinal que o Coolify usa pra marcar o deploy como
  saudável. Se o banco estiver fora, responde `503`.
- O `HEALTHCHECK` tem `start-period` de 120s porque esse passo de migração
  acontece antes do server atender a primeira requisição, e o tempo cresce
  junto com o número de empresas.

## Mudanças de schema (migrations versionadas)

O schema é versionado em `prisma/migrations/` (tenant) e
`prisma/catalog/migrations/` (catalog). Fluxo pra alterar qualquer tabela:

```bash
# 1. edite prisma/schema.prisma (ou prisma/catalog/schema.prisma)
npm run migrate:dev           # gera a migration do tenant e aplica no banco local
npm run migrate:dev:catalog   # idem, para o catalog

# 2. commite a pasta da migration junto com o schema
# 3. o deploy aplica em produção sozinho, no boot do container
```

Comandos úteis:

| Comando | O que faz |
|---|---|
| `npm run migrate:all` | Aplica as migrations pendentes no catalog e em todos os tenants |
| `npm run migrate:check` | Só audita: mostra o estado de cada banco, sem alterar nada |

- **Mudanças destrutivas** (remover/renomear coluna, mudar tipo) agora são
  suportadas — é só escrever na migration. A limitação antiga do
  `CREATE TABLE IF NOT EXISTS` não vale mais.
- O SQL idempotente em `src/lib/server/db.ts` / `catalog-db.ts` continua ali,
  mas **congelado** no estado da migration inicial e como rede de segurança:
  ele é ignorado em qualquer banco que já tenha o baseline registrado em
  `_prisma_migrations`. Não edite esse SQL — mudança de schema entra por
  migration, senão o drift que as migrations eliminaram volta.

### Adoção de bancos criados antes das migrations

Bancos que já existiam são "adotados" automaticamente pelo `migrate-all`: ele
confere que o schema real bate com o datamodel e, só então, marca a migration
inicial como aplicada — **nenhum `ALTER TABLE` roda**. Se o banco estiver
defasado, a adoção é **recusada** e o drift é impresso, em vez de gravar um
baseline errado. Nesse caso, suba o app uma vez contra aquele banco (o SQL
idempotente põe o schema em dia) e rode `npm run migrate:all` de novo.

## Primeiro acesso

Catalog vazio (nenhuma empresa nem master cadastrado). Ao abrir o app pela
primeira vez, a raiz (`/`) redireciona sozinha para `/master/bootstrap` —
cadastra a empresa atual (nome, CNPJ/RUC) e cria o usuário **master** do
sistema. Depois disso, o login normal fica em `/login` (CNPJ/RUC + e-mail +
senha) e `/master/bootstrap` se autobloqueia — não dá pra rodar de novo.

## Rotas

Páginas e dashboard saem da raiz (`/`, `/dashboard`, ...); a API fica sob
`/api/*` (ex.: `POST /api/auth/login`, `GET /api/datasets`). `/health` é a
única exceção, reservada ao healthcheck.

## Testando localmente antes de subir

Sem `docker-compose` — `docker build`/`docker run` direto, do mesmo jeito que o
Coolify builda:

```bash
docker build -t dashbi-app .

docker network create dashbi-net
docker run -d --name dashbi-pg --network dashbi-net \
  -e POSTGRES_USER=test -e POSTGRES_PASSWORD=test -e POSTGRES_DB=dashbi \
  postgres:16-alpine

docker run -d --name dashbi-app --network dashbi-net -p 3000:3000 \
  -e DATABASE_URL="postgresql://test:test@dashbi-pg:5432/dashbi?schema=public" \
  -e AUTH_SECRET="$(openssl rand -base64 32)" \
  dashbi-app

# aguarde alguns segundos e teste:
curl http://localhost:3000/health
# → {"status":"ok","databaseReachable":true}
```

Limpar depois: `docker rm -f dashbi-app dashbi-pg && docker network rm dashbi-net`

## Deploy contínuo (Git → Coolify)

Com o repositório conectado, ative o **webhook** do Coolify (aba do app →
*Webhooks*) no seu provedor Git. A partir daí, todo `git push` na branch `main`
dispara um novo build + deploy automático.

## Bugs conhecidos deste padrão (já blindados aqui)

Herdados do histórico do projeto de referência e prevenidos nos arquivos deste
repo:

1. **Healthcheck sem rota `/health`** → criada em `src/app/health/route.ts`.
2. **`.env` vazando pra imagem** → `.dockerignore` exclui `.env` e `.env.*`
   (padrões `**/`), então o segredo nunca entra na imagem.
3. **Build quebrando por `NODE_ENV=production` no buildtime** (npm pula
   `devDependencies` onde estão `typescript`/`tailwindcss`/`postcss`) →
   `Dockerfile` fixa `ENV NODE_ENV=development` no estágio de instalação +
   env vars marcadas como *Runtime only* no Coolify.
4. **Healthcheck com porta fixa** → usa `process.env.PORT` dinamicamente.
5. **Server preso em localhost** → `ENV HOSTNAME=0.0.0.0` no runtime.
