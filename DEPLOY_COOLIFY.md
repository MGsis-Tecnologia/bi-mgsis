# Deploy no Coolify

Fluxo único de deploy deste projeto: **1 `Dockerfile`, 1 container**, buildado e
gerenciado pelo Coolify. Não usa `docker-compose`.

## Arquitetura

- O `Dockerfile` (multi-stage) builda o Next.js 15 em modo `standalone` e serve
  tudo numa imagem só: as rotas de página, os Server Components e a API em
  `/api/*` saem do mesmo processo Node (`server.js`).
- `/health` é a única rota fora desse padrão — existe para o healthcheck do
  Docker/Coolify e, de quebra, dispara a criação das tabelas no primeiro boot.
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

- O app **não** roda migration no boot; as tabelas são criadas de forma
  **preguiçosa e idempotente** (`CREATE TABLE IF NOT EXISTS`, com advisory lock
  do Postgres) na primeira vez que uma conexão é aberta — ver
  `src/lib/server/db.ts`.
- O healthcheck (`GET /health`) abre essa primeira conexão, então as tabelas
  já são criadas assim que o container sobe, antes de qualquer usuário acessar.
- `/health` responde `200 {"status":"ok","databaseReachable":true}` quando o
  banco está acessível — é o sinal que o Coolify usa pra marcar o deploy como
  saudável. Se o banco estiver fora, responde `503`.
- **Mudanças destrutivas** de schema (remover/renomear coluna, mudar tipo) não
  aplicam sozinhas — `CREATE TABLE IF NOT EXISTS` é aditivo. Para isso, altere
  o SQL em `db.ts` / rode um `ALTER TABLE` manual no Postgres.

## Primeiro acesso

Não há usuário pré-cadastrado. Ao abrir o app pela primeira vez, use a tela de
cadastro (`/register`) para criar o **primeiro admin** — depois o login normal
fica em `/login`.

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
