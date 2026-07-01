import { PrismaClient } from "@prisma/client";
import { getDatabaseUrl } from "./db-config";

// SQL executado na primeira conexão para criar as tabelas se ainda não existirem.
// Usar CREATE TABLE IF NOT EXISTS garante idempotência.
const MIGRATION_SQL = `
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
  channel       TEXT NOT NULL DEFAULT '',
  client_id     TEXT NOT NULL DEFAULT '',
  client_name   TEXT NOT NULL DEFAULT '',
  client_city   TEXT NOT NULL DEFAULT '',
  product_id    TEXT NOT NULL DEFAULT '',
  product_name  TEXT NOT NULL DEFAULT '',
  quantity      DOUBLE PRECISION NOT NULL DEFAULT 0,
  total_orig    DOUBLE PRECISION NOT NULL DEFAULT 0,
  cost_orig     DOUBLE PRECISION NOT NULL DEFAULT 0,
  subgroup_id   TEXT NOT NULL DEFAULT '',
  subgroup_name TEXT NOT NULL DEFAULT '',
  seller_id     TEXT NOT NULL DEFAULT '',
  seller_name   TEXT NOT NULL DEFAULT '',
  currency_id   TEXT NOT NULL DEFAULT '1',
  currency_code TEXT NOT NULL DEFAULT 'R$'
);
CREATE INDEX IF NOT EXISTS idx_sale_items_date       ON sale_items(date);
CREATE INDEX IF NOT EXISTS idx_sale_items_client_id  ON sale_items(client_id);
CREATE INDEX IF NOT EXISTS idx_sale_items_product_id ON sale_items(product_id);
CREATE INDEX IF NOT EXISTS idx_sale_items_seller_id  ON sale_items(seller_id);

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
  currency_code TEXT NOT NULL DEFAULT 'R$'
);
CREATE INDEX IF NOT EXISTS idx_receivable_due_date  ON receivable_items(due_date);
CREATE INDEX IF NOT EXISTS idx_receivable_client_id ON receivable_items(client_id);
CREATE INDEX IF NOT EXISTS idx_receivable_is_paid   ON receivable_items(is_paid);

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
  currency_code TEXT NOT NULL DEFAULT 'R$'
);
CREATE INDEX IF NOT EXISTS idx_payable_due_date   ON payable_items(due_date);
CREATE INDEX IF NOT EXISTS idx_payable_supplier   ON payable_items(supplier_id);
CREATE INDEX IF NOT EXISTS idx_payable_is_paid    ON payable_items(is_paid);

CREATE TABLE IF NOT EXISTS inventory_items (
  id                SERIAL PRIMARY KEY,
  product_id        TEXT NOT NULL DEFAULT '',
  description       TEXT NOT NULL DEFAULT '',
  manufacturer_code TEXT NOT NULL DEFAULT '',
  stock             DOUBLE PRECISION NOT NULL DEFAULT 0,
  cost_total_usd    DOUBLE PRECISION NOT NULL DEFAULT 0,
  min_stock         DOUBLE PRECISION NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_inventory_product_id ON inventory_items(product_id);

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
  moeda_sigla           TEXT NOT NULL DEFAULT 'R$'
);
CREATE INDEX IF NOT EXISTS idx_caixa_date   ON caixa_items(date);
CREATE INDEX IF NOT EXISTS idx_caixa_plano  ON caixa_items(plano_conta_codigo);
`;

// Singleton global para sobreviver ao hot-reload do Next.js em desenvolvimento.
declare global {
  // eslint-disable-next-line no-var
  var __prismaInstance: PrismaClient | undefined;
  // eslint-disable-next-line no-var
  var __prismaUrl: string | undefined;
  // eslint-disable-next-line no-var
  var __prismaMigrated: boolean | undefined;
}

export async function getPrisma(): Promise<PrismaClient> {
  const url = await getDatabaseUrl();
  if (!url) throw new Error("Banco de dados não configurado. Acesse /setup.");

  if (global.__prismaUrl !== url) {
    // URL mudou (ou primeira inicialização) → reconectar
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

  // Criar tabelas na primeira conexão com uma URL nova
  if (!global.__prismaMigrated) {
    await prisma.$executeRawUnsafe(MIGRATION_SQL);
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
}

export async function testConnection(url: string): Promise<void> {
  const client = new PrismaClient({ datasources: { db: { url } } });
  try {
    await client.$queryRaw`SELECT 1`;
  } finally {
    await client.$disconnect();
  }
}
