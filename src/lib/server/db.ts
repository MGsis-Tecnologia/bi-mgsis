import { PrismaClient } from "@prisma/client";
import { getDatabaseUrl } from "./db-config";

// SQL executado na primeira conexão para criar as tabelas se ainda não existirem.
// Usar CREATE TABLE IF NOT EXISTS garante idempotência.
//
// ⚠️ CONGELADO NA FASE 7. Este bloco descreve o estado da migration baseline
// (prisma/migrations/20260803120000_init) e existe só como rede de segurança pra
// bancos provisionados fora do fluxo normal — ele é PULADO em qualquer banco que
// já tenha `_prisma_migrations` (ver runMigration abaixo). Mudança de schema
// agora entra por `npm run migrate:dev`, nunca aqui: editar este SQL sem uma
// migration correspondente recria exatamente o drift que a fase 7 eliminou.
const MIGRATION_SQL = `
CREATE TABLE IF NOT EXISTS users (
  id            SERIAL PRIMARY KEY,
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL DEFAULT '',
  name          TEXT NOT NULL DEFAULT '',
  role          TEXT NOT NULL DEFAULT 'admin',
  is_active     BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;

CREATE TABLE IF NOT EXISTS menu_permissions (
  id        SERIAL PRIMARY KEY,
  user_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  menu_key  TEXT NOT NULL,
  UNIQUE(user_id, menu_key)
);
CREATE INDEX IF NOT EXISTS idx_menu_permissions_user ON menu_permissions(user_id);

CREATE TABLE IF NOT EXISTS smtp_config (
  id           INTEGER PRIMARY KEY DEFAULT 1,
  host         TEXT NOT NULL DEFAULT '',
  port         INTEGER NOT NULL DEFAULT 587,
  secure       BOOLEAN NOT NULL DEFAULT false,
  "user"       TEXT NOT NULL DEFAULT '',
  password_enc TEXT NOT NULL DEFAULT '',
  from_name    TEXT NOT NULL DEFAULT 'MGSIS Analytics',
  from_email   TEXT NOT NULL DEFAULT '',
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
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
  produto_fabricante         TEXT NOT NULL DEFAULT '',
  item_quantidade            DOUBLE PRECISION NOT NULL DEFAULT 0,
  item_quantidade_confirmada DOUBLE PRECISION NOT NULL DEFAULT 0,
  item_total                 DOUBLE PRECISION NOT NULL DEFAULT 0
);
ALTER TABLE orcamento_items ADD COLUMN IF NOT EXISTS produto_fabricante TEXT NOT NULL DEFAULT '';
CREATE INDEX IF NOT EXISTS idx_orcamento_data     ON orcamento_items(orcamento_data);
CREATE INDEX IF NOT EXISTS idx_orcamento_empresa  ON orcamento_items(empresa_id);
CREATE INDEX IF NOT EXISTS idx_orcamento_vendedor ON orcamento_items(vendedor_id);
`;

// Cache de clients por URL de conexão (uma entrada por tenant), em vez de um
// único client global que troca de banco. Isso é o que torna seguro ter mais
// de um banco de tenant vivo ao mesmo tempo no processo: hoje só existe uma
// URL em uso (DATABASE_URL), então na prática o cache tem 1 entrada só — mas
// sem essa troca, duas requisições concorrentes contra bancos diferentes (uma
// vez que o cadastro multi-empresa existir) derrubariam a conexão uma da
// outra, porque o client global era substituído a cada URL diferente.
interface TenantEntry {
  client: PrismaClient;
  migrated: boolean;
  migrating?: Promise<void>;
  lastUsedAt: number;
}

declare global {
  // eslint-disable-next-line no-var
  var __prismaTenants: Map<string, TenantEntry> | undefined;
  // eslint-disable-next-line no-var
  var __prismaEvictionTimer: NodeJS.Timeout | undefined;
}

function tenants(): Map<string, TenantEntry> {
  if (!global.__prismaTenants) global.__prismaTenants = new Map();
  return global.__prismaTenants;
}

// Desconecta clients de tenant ociosos há muito tempo, pra não acumular
// conexões abertas indefinidamente conforme o número de empresas cresce.
const IDLE_EVICTION_MS = 10 * 60_000;
const EVICTION_SWEEP_INTERVAL_MS = 5 * 60_000;

function scheduleEviction(): void {
  if (global.__prismaEvictionTimer) return;
  const timer = setInterval(async () => {
    const now = Date.now();
    for (const [url, entry] of tenants()) {
      if (now - entry.lastUsedAt > IDLE_EVICTION_MS) {
        tenants().delete(url);
        await entry.client.$disconnect().catch(() => {});
        console.log("🧹 Conexão de tenant ociosa desconectada");
      }
    }
  }, EVICTION_SWEEP_INTERVAL_MS);
  timer.unref?.();
  global.__prismaEvictionTimer = timer;
}

// Chave arbitrária (mas fixa) para o advisory lock do Postgres.
const MIGRATION_LOCK_KEY = 727272;

// Baseline do schema de TENANT (prisma/migrations/). Nome fixo: uma vez criada, a
// migration inicial nunca é renomeada. Checar por ela — e não só pela existência
// de `_prisma_migrations` — importa porque catalog e tenant podem dividir a mesma
// database (CATALOG_DATABASE_URL cai em DATABASE_URL por padrão): lá as duas
// linhagens convivem na mesma tabela de histórico, e olhar só a tabela faria o
// tenant se achar migrado por causa do baseline do catalog, ou vice-versa.
const TENANT_BASELINE = "20260803120000_init";

/**
 * Bancos sob controle das migrations versionadas (fase 7) têm o baseline de
 * tenant registrado em `_prisma_migrations`. Neles o schema é responsabilidade
 * do `prisma migrate deploy` (scripts/migrate-all.mjs, rodado no start do
 * container) e o app não deve mais emitir DDL nenhum.
 */
async function isUnderMigrationControl(prisma: PrismaClient): Promise<boolean> {
  // Em duas etapas de propósito: o Postgres valida a tabela no parse, então
  // referenciar `_prisma_migrations` numa query condicional estouraria 42P01
  // justamente no caso que interessa (banco ainda não adotado).
  const [table] = await prisma.$queryRawUnsafe<{ present: boolean }[]>(
    "SELECT to_regclass('public._prisma_migrations') IS NOT NULL AS present"
  );
  if (!table?.present) return false;

  const [row] = await prisma.$queryRawUnsafe<{ adopted: boolean }[]>(
    `SELECT EXISTS (
       SELECT 1 FROM _prisma_migrations
       WHERE migration_name = $1 AND finished_at IS NOT NULL
     ) AS adopted`,
    TENANT_BASELINE
  );
  return row?.adopted ?? false;
}

async function runMigration(prisma: PrismaClient): Promise<void> {
  if (await isUnderMigrationControl(prisma)) {
    console.log("⏭️  Banco sob migrations versionadas — SQL preguiçoso ignorado");
    return;
  }

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

/**
 * Retorna o client do tenant identificado por `url` (padrão: DATABASE_URL, o
 * comportamento de hoje — único tenant). Cada URL distinta ganha seu próprio
 * client em cache, migrado de forma independente e isolada das demais.
 */
export async function getPrisma(url?: string): Promise<PrismaClient> {
  const resolvedUrl = url ?? getDatabaseUrl();
  if (!resolvedUrl)
    throw new Error(
      "Banco de dados não configurado. Defina a variável de ambiente DATABASE_URL."
    );

  scheduleEviction();

  let entry = tenants().get(resolvedUrl);
  if (!entry) {
    console.log("🔄 Conectando ao banco de dados do tenant...");
    entry = {
      client: new PrismaClient({ datasources: { db: { url: resolvedUrl } } }),
      migrated: false,
      lastUsedAt: Date.now(),
    };
    tenants().set(resolvedUrl, entry);
  }
  entry.lastUsedAt = Date.now();

  if (!entry.migrated) {
    if (!entry.migrating) {
      console.log("🏗️ Executando migrações...");
      entry.migrating = runMigration(entry.client).catch((err) => {
        console.error("❌ Erro na migração:", err);
        entry.migrating = undefined;
        throw err;
      });
    }
    await entry.migrating;
    console.log("✅ Migrações concluídas");
    entry.migrated = true;
  }

  return entry.client;
}

/** Desconecta e remove do cache o client do tenant `url` — ou todos, se omitido. */
export async function resetPrismaClient(url?: string): Promise<void> {
  const map = tenants();
  const entries = url ? [[url, map.get(url)] as const] : [...map.entries()];

  for (const [key, entry] of entries) {
    if (!entry) continue;
    await entry.client.$disconnect().catch(() => {});
    map.delete(key);
  }
}

export async function testConnection(url: string): Promise<void> {
  const client = new PrismaClient({ datasources: { db: { url } } });
  try {
    await client.$queryRaw`SELECT 1`;
  } finally {
    await client.$disconnect();
  }
}
