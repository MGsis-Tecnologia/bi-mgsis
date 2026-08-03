# Fase 7 — Migrations versionadas (prisma migrate deploy)

Status: **não iniciada**. Fases 1–6 do plano multi-empresa (`BI-MGSIS-Plano-Multi-Empresa.pdf`)
já estão implementadas e commitadas. Este arquivo é o ponto de partida pra continuar
com a fase 7 — pode apagar depois que ela for concluída e commitada.

## Onde estamos hoje

Schema é aplicado em runtime por um bloco de SQL manual, executado de forma
preguiçosa (lazy) na primeira conexão de cada banco:

- `src/lib/server/db.ts` → `MIGRATION_SQL` — schema de **tenant** (users, sale_items,
  menu_permissions, etc.), aplicado toda vez que `getPrisma(url)` conecta numa
  database ainda não migrada (flag em memória, `global.__prismaTenants`).
- `src/lib/server/catalog-db.ts` → `CATALOG_MIGRATION_SQL` — schema do **catalog**
  (empresas, master_users, invite_tokens, integration_tokens).

Funciona (testado em todas as fases anteriores), mas tem dois problemas de fundo:
1. **Só faz `CREATE TABLE IF NOT EXISTS` / `ALTER TABLE ADD COLUMN IF NOT EXISTS`.**
   Não existe suporte a renomear/remover coluna ou mudar tipo — isso já está documentado
   como limitação manual no `DEPLOY_COOLIFY.md`.
2. **Sem histórico auditável.** Não dá pra saber, olhando o banco, qual "versão" de
   schema uma empresa está rodando, nem reverter uma migração aplicada errada.

Isso era aceitável com 1 banco só. Com N bancos de tenant (um por empresa, ver
`prisma/catalog/schema.prisma` → `Empresa.dbName`), o schema pode divergir entre
empresas se alguém esquecer de rodar algo, e não há como comparar/auditar isso.

## O que a fase 7 precisa entregar

1. **Gerar a migration inicial** a partir do `schema.prisma` atual (tenant) e do
   `prisma/catalog/schema.prisma` (catalog), usando o histórico real do banco como
   baseline (já existem tabelas criadas via `CREATE TABLE IF NOT EXISTS`, então é
   preciso rodar `prisma migrate dev --create-only` + `prisma migrate resolve --applied`
   pra não tentar recriar tabelas que já existem — ver
   https://www.prisma.io/docs/orm/prisma-migrate/getting-started#adding-prisma-migrate-to-an-existing-project).

2. **Script de deploy multi-tenant** (novo, ex. `scripts/migrate-all.ts`):
   - Roda `prisma migrate deploy` contra o catalog primeiro.
   - Lista todas as `Empresa` ativas (`catalog.empresa.findMany()`).
   - Pra cada uma, monta a URL do tenant (`buildTenantUrl(empresa.dbName)`, já existe
     em `src/lib/server/db-config.ts`) e roda `prisma migrate deploy --schema=prisma/schema.prisma`
     contra ela (via `execa`/`child_process`, passando `DATABASE_URL` no env do subprocesso).
   - Loga sucesso/falha por empresa **sem** travar as outras (uma empresa com schema
     quebrado não pode impedir o deploy das demais).

3. **Plugar isso no fluxo de deploy** (Coolify):
   - Rodar o script acima como parte do `postinstall`/`build`, ou como um passo
     manual/CI antes de subir uma nova versão — decidir qual, dependendo de quão
     automático o Coolify permite (ver `DEPLOY_COOLIFY.md`).
   - Manter o `CREATE TABLE IF NOT EXISTS` de `db.ts`/`catalog-db.ts` como rede de
     segurança pra bancos provisionados fora do fluxo normal (ex: se o script de
     migração falhar numa empresa específica, o app ainda sobe e se auto-corrige na
     próxima conexão) — ou decidir remover isso e confiar 100% nas migrations.

4. **Provisionamento de empresa nova** (`src/app/api/master/empresas/route.ts`) —
   hoje ele confia no `getPrisma(buildTenantUrl(dbName))` pra criar as tabelas
   (lazy migration). Depois da fase 7, esse ponto deveria rodar
   `prisma migrate deploy` explicitamente pra empresa recém-criada, em vez de
   depender da migração preguiçosa.

## Arquivos relevantes pra continuar

- `prisma/schema.prisma` — schema de tenant.
- `prisma/catalog/schema.prisma` — schema do catalog.
- `src/lib/server/db.ts` — `MIGRATION_SQL`, `getPrisma(url)`, cache de clients por tenant.
- `src/lib/server/catalog-db.ts` — `CATALOG_MIGRATION_SQL`, `getCatalogPrisma()`.
- `src/lib/server/db-config.ts` — `buildTenantUrl()`, `getDbNameFromUrl()`.
- `src/app/api/master/empresas/route.ts` — provisionamento de empresa nova (`CREATE DATABASE` + primeira conexão).
- `DEPLOY_COOLIFY.md` — onde documentar o novo passo de deploy.
- `package.json` — scripts `generate:catalog`, `build`, `postinstall`.

## Como as fases anteriores foram testadas (pra manter o padrão)

Cada fase foi validada criando dados/databases descartáveis via script Node direto
contra o Postgres (não só confiando no type-check), sempre limpando tudo ao final
pra não deixar resíduo no banco real. Pra fase 7, o equivalente seria: criar uma
empresa de teste, rodar o script de migração multi-tenant contra ela, conferir que
as tabelas batem com o schema, e derrubar a database de teste ao final.
