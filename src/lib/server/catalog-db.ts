import { PrismaClient } from "../../../node_modules/.prisma/catalog-client";

// SQL executado na primeira conexão para criar as tabelas do catalog se ainda
// não existirem. Mesmo padrão idempotente usado em db.ts para o banco de tenant.
const CATALOG_MIGRATION_SQL = `
CREATE TABLE IF NOT EXISTS empresas (
  id           SERIAL PRIMARY KEY,
  cnpj_ruc     TEXT NOT NULL UNIQUE,
  nome         TEXT NOT NULL DEFAULT '',
  db_name      TEXT NOT NULL UNIQUE,
  status       TEXT NOT NULL DEFAULT 'pendente',
  email_master TEXT NOT NULL DEFAULT '',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS master_users (
  id            SERIAL PRIMARY KEY,
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL DEFAULT '',
  name          TEXT NOT NULL DEFAULT '',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS invite_tokens (
  id          SERIAL PRIMARY KEY,
  empresa_id  INTEGER NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  token_hash  TEXT NOT NULL UNIQUE,
  email       TEXT NOT NULL DEFAULT '',
  role        TEXT NOT NULL DEFAULT 'admin',
  expires_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  used_at     TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE invite_tokens ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'admin';
CREATE INDEX IF NOT EXISTS idx_invite_tokens_empresa ON invite_tokens(empresa_id);

CREATE TABLE IF NOT EXISTS integration_tokens (
  id          SERIAL PRIMARY KEY,
  empresa_id  INTEGER NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  token_hash  TEXT NOT NULL UNIQUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revoked_at  TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_integration_tokens_empresa ON integration_tokens(empresa_id);
`;

declare global {
  // eslint-disable-next-line no-var
  var __catalogPrismaInstance: PrismaClient | undefined;
  // eslint-disable-next-line no-var
  var __catalogPrismaUrl: string | undefined;
  // eslint-disable-next-line no-var
  var __catalogMigrated: boolean | undefined;
  // eslint-disable-next-line no-var
  var __catalogMigrating: Promise<void> | undefined;
}

// Chave diferente da lock key do banco de tenant (727272 em db.ts) — evita
// colisão quando catalog e tenant apontam pra mesma database (default atual).
const CATALOG_MIGRATION_LOCK_KEY = 727273;

function getCatalogDatabaseUrl(): string | undefined {
  return process.env.CATALOG_DATABASE_URL || process.env.DATABASE_URL || undefined;
}

async function runCatalogMigration(prisma: PrismaClient): Promise<void> {
  const statements = CATALOG_MIGRATION_SQL.split(";")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  await prisma.$transaction([
    prisma.$executeRawUnsafe(`SELECT pg_advisory_xact_lock(${CATALOG_MIGRATION_LOCK_KEY})`),
    ...statements.map((stmt) => prisma.$executeRawUnsafe(stmt)),
  ]);
}

export async function getCatalogPrisma(): Promise<PrismaClient> {
  const url = getCatalogDatabaseUrl();
  if (!url) {
    throw new Error(
      "Banco catalog não configurado. Defina CATALOG_DATABASE_URL (ou DATABASE_URL como fallback)."
    );
  }

  if (global.__catalogPrismaUrl !== url) {
    if (global.__catalogPrismaInstance) {
      await global.__catalogPrismaInstance.$disconnect().catch(() => {});
    }
    global.__catalogPrismaInstance = new PrismaClient({
      datasources: { db: { url } },
    });
    global.__catalogPrismaUrl = url;
    global.__catalogMigrated = false;
  }

  const prisma = global.__catalogPrismaInstance!;

  if (!global.__catalogMigrated) {
    if (!global.__catalogMigrating) {
      global.__catalogMigrating = runCatalogMigration(prisma).catch((err) => {
        global.__catalogMigrating = undefined;
        throw err;
      });
    }
    await global.__catalogMigrating;
    global.__catalogMigrated = true;
  }

  return prisma;
}
