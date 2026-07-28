import { PrismaClient } from "@prisma/client";
import { getDatabaseUrl } from "./db-config";

// SQL executado na primeira conexão para criar as tabelas se ainda não existirem.
// Usar CREATE TABLE IF NOT EXISTS garante idempotência.
const MIGRATION_SQL = `
CREATE TABLE IF NOT EXISTS users (
  id            SERIAL PRIMARY KEY,
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL DEFAULT '',
  name          TEXT NOT NULL DEFAULT '',
  role          TEXT NOT NULL DEFAULT 'admin',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS dataset_meta (
  kind        TEXT PRIMARY KEY,
  filename    TEXT NOT NULL DEFAULT '',
  row_count   INTEGER NOT NULL DEFAULT 0,
  imported_at TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS sale_items (
  id            SERIAL PRIMARY KEY,
  date          TEXT NOT NULL DEFAULT '',
  order_id      TEXT NOT NULL DEFAULT '',
  order_type    TEXT NOT NULL DEFAULT 'VENDA',
  channel       TEXT NOT NULL DEFAULT '',
  client_id     TEXT NOT NULL DEFAULT '',
  client_name   TEXT NOT NULL DEFAULT '',
  client_city   TEXT NOT NULL DEFAULT '',
  product_id    TEXT NOT NULL DEFAULT '',
  product_name  TEXT NOT NULL DEFAULT '',
  quantity      DOUBLE PRECISION NOT NULL DEFAULT 0,
  total_orig    DOUBLE PRECISION NOT NULL DEFAULT 0,
  cost_orig     DOUBLE PRECISION NOT NULL DEFAULT 0,
  discount_orig DOUBLE PRECISION NOT NULL DEFAULT 0,
  subgroup_id   TEXT NOT NULL DEFAULT '',
  subgroup_name TEXT NOT NULL DEFAULT '',
  seller_id     TEXT NOT NULL DEFAULT '',
  seller_name   TEXT NOT NULL DEFAULT '',
  currency_id   TEXT NOT NULL DEFAULT '1',
  currency_code TEXT NOT NULL DEFAULT 'R$',
  empresa_id    TEXT NOT NULL DEFAULT ''
);
-- Aditivo p/ bancos já existentes (o CREATE TABLE IF NOT EXISTS acima não altera
-- tabelas pré-existentes). Precede o índice de empresa_id abaixo.
ALTER TABLE sale_items ADD COLUMN IF NOT EXISTS empresa_id    TEXT NOT NULL DEFAULT '';
ALTER TABLE sale_items ADD COLUMN IF NOT EXISTS discount_orig DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE sale_items ADD COLUMN IF NOT EXISTS order_type    TEXT NOT NULL DEFAULT 'VENDA';
CREATE INDEX IF NOT EXISTS idx_sale_items_date       ON sale_items(date);
CREATE INDEX IF NOT EXISTS idx_sale_items_client_id  ON sale_items(client_id);
CREATE INDEX IF NOT EXISTS idx_sale_items_product_id ON sale_items(product_id);
CREATE INDEX IF NOT EXISTS idx_sale_items_seller_id  ON sale_items(seller_id);
CREATE INDEX IF NOT EXISTS idx_sale_items_empresa_id ON sale_items(empresa_id);

CREATE TABLE IF NOT EXISTS receivable_items (
  id            SERIAL PRIMARY KEY,
  document_id   TEXT NOT NULL DEFAULT '',
  client_id     TEXT NOT NULL DEFAULT '',
  client_name   TEXT NOT NULL DEFAULT '',
  client_city   TEXT NOT NULL DEFAULT '',
  issue_date    TEXT NOT NULL DEFAULT '',
  due_date      TEXT NOT NULL DEFAULT '',
  received_date TEXT NOT NULL DEFAULT '',
  is_paid       BOOLEAN NOT NULL DEFAULT false,
  entry_type    TEXT NOT NULL DEFAULT '',
  amount_orig   DOUBLE PRECISION NOT NULL DEFAULT 0,
  seller_id     TEXT NOT NULL DEFAULT '',
  seller_name   TEXT NOT NULL DEFAULT '',
  currency_id   TEXT NOT NULL DEFAULT '1',
  currency_code TEXT NOT NULL DEFAULT 'R$',
  empresa_id    TEXT NOT NULL DEFAULT ''
);
ALTER TABLE receivable_items ADD COLUMN IF NOT EXISTS empresa_id TEXT NOT NULL DEFAULT '';
CREATE INDEX IF NOT EXISTS idx_receivable_due_date  ON receivable_items(due_date);
CREATE INDEX IF NOT EXISTS idx_receivable_client_id ON receivable_items(client_id);
CREATE INDEX IF NOT EXISTS idx_receivable_is_paid   ON receivable_items(is_paid);
CREATE INDEX IF NOT EXISTS idx_receivable_empresa   ON receivable_items(empresa_id);

CREATE TABLE IF NOT EXISTS payable_items (
  id            SERIAL PRIMARY KEY,
  document_id   TEXT NOT NULL DEFAULT '',
  supplier_id   TEXT NOT NULL DEFAULT '',
  supplier_name TEXT NOT NULL DEFAULT '',
  issue_date    TEXT NOT NULL DEFAULT '',
  due_date      TEXT NOT NULL DEFAULT '',
  paid_date     TEXT NOT NULL DEFAULT '',
  is_paid       BOOLEAN NOT NULL DEFAULT false,
  entry_type    TEXT NOT NULL DEFAULT '',
  amount_orig   DOUBLE PRECISION NOT NULL DEFAULT 0,
  currency_id   TEXT NOT NULL DEFAULT '1',
  currency_code TEXT NOT NULL DEFAULT 'R$',
  empresa_id    TEXT NOT NULL DEFAULT ''
);
ALTER TABLE payable_items ADD COLUMN IF NOT EXISTS empresa_id TEXT NOT NULL DEFAULT '';
CREATE INDEX IF NOT EXISTS idx_payable_due_date   ON payable_items(due_date);
CREATE INDEX IF NOT EXISTS idx_payable_supplier   ON payable_items(supplier_id);
CREATE INDEX IF NOT EXISTS idx_payable_is_paid    ON payable_items(is_paid);
CREATE INDEX IF NOT EXISTS idx_payable_empresa    ON payable_items(empresa_id);

CREATE TABLE IF NOT EXISTS inventory_items (
  id                SERIAL PRIMARY KEY,
  product_id        TEXT NOT NULL DEFAULT '',
  description       TEXT NOT NULL DEFAULT '',
  manufacturer_code TEXT NOT NULL DEFAULT '',
  stock             DOUBLE PRECISION NOT NULL DEFAULT 0,
  cost_total_usd    DOUBLE PRECISION NOT NULL DEFAULT 0,
  min_stock         DOUBLE PRECISION NOT NULL DEFAULT 0,
  currency_id       TEXT NOT NULL DEFAULT '1',
  currency_code     TEXT NOT NULL DEFAULT 'R$',
  empresa_id        TEXT NOT NULL DEFAULT ''
);
ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS empresa_id    TEXT NOT NULL DEFAULT '';
ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS currency_id   TEXT NOT NULL DEFAULT '1';
ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS currency_code TEXT NOT NULL DEFAULT 'R$';
CREATE INDEX IF NOT EXISTS idx_inventory_product_id ON inventory_items(product_id);
CREATE INDEX IF NOT EXISTS idx_inventory_empresa    ON inventory_items(empresa_id);

CREATE TABLE IF NOT EXISTS caixa_items (
  id                    SERIAL PRIMARY KEY,
  date                  TEXT NOT NULL DEFAULT '',
  centro_custo_id       TEXT NOT NULL DEFAULT '',
  centro_custo_descricao TEXT NOT NULL DEFAULT '',
  plano_conta_id        TEXT NOT NULL DEFAULT '',
  plano_conta_codigo    TEXT NOT NULL DEFAULT '',
  plano_conta_descricao TEXT NOT NULL DEFAULT '',
  caixa_id              TEXT NOT NULL DEFAULT '',
  caixa_descricao       TEXT NOT NULL DEFAULT '',
  valor_documento       DOUBLE PRECISION NOT NULL DEFAULT 0,
  moeda_id              TEXT NOT NULL DEFAULT '1',
  moeda_sigla           TEXT NOT NULL DEFAULT 'R$',
  empresa_id            TEXT NOT NULL DEFAULT ''
);
ALTER TABLE caixa_items ADD COLUMN IF NOT EXISTS empresa_id TEXT NOT NULL DEFAULT '';
CREATE INDEX IF NOT EXISTS idx_caixa_date    ON caixa_items(date);
CREATE INDEX IF NOT EXISTS idx_caixa_plano   ON caixa_items(plano_conta_codigo);
CREATE INDEX IF NOT EXISTS idx_caixa_empresa ON caixa_items(empresa_id);

CREATE TABLE IF NOT EXISTS orcamento_items (
  id                         SERIAL PRIMARY KEY,
  orcamento_id               TEXT NOT NULL DEFAULT '',
  orcamento_data             TEXT NOT NULL DEFAULT '',
  orcamento_confirmado       BOOLEAN NOT NULL DEFAULT false,
  orcamento_data_confirmacao TEXT NOT NULL DEFAULT '',
  cliente_id                 TEXT NOT NULL DEFAULT '',
  cliente_nome               TEXT NOT NULL DEFAULT '',
  vendedor_id                TEXT NOT NULL DEFAULT '',
  vendedor_nome              TEXT NOT NULL DEFAULT '',
  empresa_id                 TEXT NOT NULL DEFAULT '',
  moeda_id                   TEXT NOT NULL DEFAULT '1',
  moeda_sigla                TEXT NOT NULL DEFAULT 'R$',
  item_orcamento_id          TEXT NOT NULL DEFAULT '',
  produto_id                 TEXT NOT NULL DEFAULT '',
  produto_descricao          TEXT NOT NULL DEFAULT '',
  item_quantidade            DOUBLE PRECISION NOT NULL DEFAULT 0,
  item_quantidade_confirmada DOUBLE PRECISION NOT NULL DEFAULT 0,
  item_total                 DOUBLE PRECISION NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_orcamento_data     ON orcamento_items(orcamento_data);
CREATE INDEX IF NOT EXISTS idx_orcamento_empresa  ON orcamento_items(empresa_id);
CREATE INDEX IF NOT EXISTS idx_orcamento_vendedor ON orcamento_items(vendedor_id);
`;

// Singleton global para sobreviver ao hot-reload do Next.js em desenvolvimento.
declare global {
  // eslint-disable-next-line no-var
  var __prismaInstance: PrismaClient | undefined;
  // eslint-disable-next-line no-var
  var __prismaUrl: string | undefined;
  // eslint-disable-next-line no-var
  var __prismaMigrated: boolean | undefined;
  // eslint-disable-next-line no-var
  var __prismaMigrating: Promise<void> | undefined;
}

// Chave arbitrária (mas fixa) para o advisory lock do Postgres.
const MIGRATION_LOCK_KEY = 727272;

async function runMigration(prisma: PrismaClient): Promise<void> {
  const statements = MIGRATION_SQL.split(";")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  // Advisory lock serializa a criação de tabelas entre conexões/processos
  // concorrentes (evita corrida do CREATE TABLE IF NOT EXISTS → erro 23505).
  // O driver usa prepared statements, que não aceitam múltiplos comandos numa
  // única query (erro 42601); por isso cada statement roda separadamente,
  // tudo dentro de uma transação para o lock valer até o commit.
  await prisma.$transaction([
    prisma.$executeRawUnsafe(`SELECT pg_advisory_xact_lock(${MIGRATION_LOCK_KEY})`),
    ...statements.map((stmt) => prisma.$executeRawUnsafe(stmt)),
  ]);
}

export async function getPrisma(): Promise<PrismaClient> {
  const url = getDatabaseUrl();
  if (!url)
    throw new Error(
      "Banco de dados não configurado. Defina a variável de ambiente DATABASE_URL."
    );

  if (global.__prismaUrl !== url) {
    console.log("🔄 Reconectando ao banco de dados...");
    if (global.__prismaInstance) {
      await global.__prismaInstance.$disconnect().catch(() => {});
    }
    global.__prismaInstance = new PrismaClient({
      datasources: { db: { url } },
    });
    global.__prismaUrl = url;
    global.__prismaMigrated = false;
  }

  const prisma = global.__prismaInstance!;

  if (!global.__prismaMigrated) {
    if (!global.__prismaMigrating) {
      console.log("🏗️ Executando migrações...");
      global.__prismaMigrating = runMigration(prisma).catch((err) => {
        console.error("❌ Erro na migração:", err);
        global.__prismaMigrating = undefined;
        throw err;
      });
    }
    await global.__prismaMigrating;
    console.log("✅ Migrações concluídas");
    global.__prismaMigrated = true;
  }

  return prisma;
}

export async function resetPrismaClient(): Promise<void> {
  if (global.__prismaInstance) {
    await global.__prismaInstance.$disconnect().catch(() => {});
  }
  global.__prismaInstance = undefined;
  global.__prismaUrl = undefined;
  global.__prismaMigrated = false;
  global.__prismaMigrating = undefined;
}

export async function testConnection(url: string): Promise<void> {
  const client = new PrismaClient({ datasources: { db: { url } } });
  try {
    await client.$queryRaw`SELECT 1`;
  } finally {
    await client.$disconnect();
  }
}
