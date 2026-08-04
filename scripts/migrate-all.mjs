#!/usr/bin/env node
/**
 * Aplica as migrations versionadas no banco `catalog` e em TODOS os bancos de
 * tenant (um por empresa cadastrada). Roda no start do container e também pode
 * ser chamado à mão: `npm run migrate:all` (ou `-- --check` pra só auditar).
 *
 * Regras de ouro deste script:
 *  - Uma empresa com schema quebrado NÃO pode impedir o deploy das demais:
 *    cada banco é tratado de forma isolada e o erro é acumulado no relatório.
 *  - Bancos criados antes da fase 7 (pelo SQL idempotente de src/lib/server/db.ts)
 *    são "adotados" automaticamente — mas só depois de conferir que o schema
 *    real bate com o datamodel. Se não bater, o banco é PULADO e o drift é
 *    impresso, em vez de marcar um baseline errado e mascarar o problema.
 */
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const CHECK_ONLY = process.argv.includes("--check");

const TENANT = {
  schema: join(ROOT, "prisma", "schema.prisma"),
  migrations: join(ROOT, "prisma", "migrations"),
  urlEnv: "DATABASE_URL",
};
const CATALOG = {
  schema: join(ROOT, "prisma", "catalog", "schema.prisma"),
  migrations: join(ROOT, "prisma", "catalog", "migrations"),
  urlEnv: "CATALOG_DATABASE_URL",
};

/** Caminho do CLI do Prisma — no container ele vive fora do node_modules do standalone. */
function prismaCli() {
  const candidates = [
    process.env.PRISMA_CLI,
    join(ROOT, "node_modules", "prisma", "build", "index.js"),
    join(ROOT, "migrator", "node_modules", "prisma", "build", "index.js"),
  ].filter(Boolean);
  const found = candidates.find((p) => existsSync(p));
  if (!found) {
    throw new Error(
      `CLI do Prisma não encontrado. Procurei em:\n  ${candidates.join("\n  ")}\n` +
        "Defina PRISMA_CLI apontando pro build/index.js."
    );
  }
  return found;
}

/** Nomes de todas as migrations, em ordem cronológica. */
function migrationNames(migrationsDir) {
  const dirs = readdirSync(migrationsDir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort();
  if (!dirs.length) throw new Error(`Nenhuma migration em ${migrationsDir}`);
  return dirs;
}

/** Nome da migration mais antiga = o baseline usado pra adotar bancos legados. */
function baselineName(migrationsDir) {
  return migrationNames(migrationsDir)[0];
}

const CLI = prismaCli();

// O CLI do Prisma prefixa toda saída com um cabeçalho fixo ("Environment
// variables loaded...", "Datasource...") e envolve erros em "Invalid `x()`
// invocation:". Sem descartar isso, o resumo final repete boilerplate em vez de
// dizer o que de fato deu errado em cada banco.
const RUIDO = [
  /^Environment variables loaded/,
  /^Prisma schema loaded/,
  /^Datasource "/,
  /^\d+ migrations? found/,
  /^Invalid `.*` invocation:?$/,
];

function primeiraLinhaUtil(msg) {
  return (
    msg
      .split("\n")
      .map((l) => l.trim())
      .find((l) => l && !RUIDO.some((re) => re.test(l))) ?? "erro desconhecido"
  );
}

function runPrisma(args, url, urlEnv) {
  // A URL vai explícita no env do subprocesso: o Prisma carrega o .env local,
  // mas não sobrescreve variável já definida — então este valor sempre vence.
  const res = spawnSync(process.execPath, [CLI, ...args], {
    env: { ...process.env, [urlEnv]: url },
    encoding: "utf8",
  });
  return {
    code: res.status ?? 1,
    out: `${res.stdout ?? ""}${res.stderr ?? ""}`.trim(),
  };
}

const { PrismaClient } = await import("@prisma/client");

/**
 * Tabelas e colunas que a migration baseline cria, lidas do próprio
 * migration.sql. É o formato que o Prisma gera, então o parse é previsível:
 * cada coluna é uma linha iniciando com "nome", e linhas de CONSTRAINT ficam
 * de fora.
 */
function baselineShape(migrationsDir) {
  const dir = baselineName(migrationsDir);
  const sql = readFileSync(join(migrationsDir, dir, "migration.sql"), "utf8");
  const tabelas = new Map();
  const reTabela = /CREATE TABLE\s+"([^"]+)"\s*\(([\s\S]*?)\n\);/g;
  let m;
  while ((m = reTabela.exec(sql)) !== null) {
    const colunas = new Set();
    for (const linha of m[2].split("\n")) {
      const col = linha.trim().match(/^"([^"]+)"\s/);
      if (col) colunas.add(col[1]);
    }
    tabelas.set(m[1], colunas);
  }
  return tabelas;
}

/**
 * Estado do banco. `adopted` olha o NOME do baseline, não a mera existência de
 * `_prisma_migrations`: catalog e tenant dividem a mesma database por padrão
 * (CATALOG_DATABASE_URL cai em DATABASE_URL) e, portanto, a mesma tabela de
 * histórico — checar só a tabela faria o catalog se dar por migrado assim que o
 * tenant fosse adotado, pulando a criação das tabelas dele.
 */
async function inspect(url, baseline) {
  const client = new PrismaClient({ datasources: { db: { url } } });
  try {
    const [t] = await client.$queryRawUnsafe(
      "SELECT to_regclass('public._prisma_migrations') IS NOT NULL AS present"
    );

    let adopted = false;
    if (t.present) {
      const [r] = await client.$queryRawUnsafe(
        `SELECT EXISTS (
           SELECT 1 FROM _prisma_migrations
           WHERE migration_name = $1 AND finished_at IS NOT NULL
         ) AS adopted`,
        baseline
      );
      adopted = r.adopted;
    }

    const linhas = await client.$queryRawUnsafe(
      `SELECT table_name, column_name FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name <> '_prisma_migrations'`
    );
    const real = new Map();
    for (const l of linhas) {
      if (!real.has(l.table_name)) real.set(l.table_name, new Set());
      real.get(l.table_name).add(l.column_name);
    }

    return { adopted, real };
  } finally {
    await client.$disconnect();
  }
}

/**
 * Adota um banco pré-existente: confere que ele já contém tudo o que o baseline
 * criaria e, só então, marca o baseline como aplicado (nenhum DDL roda).
 *
 * A comparação é restrita às tabelas DO PRÓPRIO baseline — de propósito. Um
 * `migrate diff` contra o datamodel acusaria as tabelas do tenant como drift ao
 * adotar o catalog (e vice-versa) sempre que os dois dividissem a database, que
 * é justamente o arranjo padrão. O que precisa ser verdade pra baselinar com
 * segurança é só isto: nada que o baseline criaria está faltando.
 */
function adopt({ schema, migrations, urlEnv }, url, real) {
  const esperado = baselineShape(migrations);
  const faltando = [];

  for (const [tabela, colunas] of esperado) {
    const reais = real.get(tabela);
    if (!reais) {
      faltando.push(`tabela ${tabela}`);
      continue;
    }
    for (const coluna of colunas) {
      if (!reais.has(coluna)) faltando.push(`${tabela}.${coluna}`);
    }
  }

  const name = baselineName(migrations);

  if (faltando.length > 0) {
    throw new Error(
      `banco legado incompleto — adoção abortada pra não gravar um baseline ` +
        `errado. Suba o app uma vez contra ele (o SQL idempotente de db.ts põe o ` +
        `schema em dia) e rode de novo. Faltando:\n  - ${faltando.join("\n  - ")}`
    );
  }

  if (CHECK_ONLY) {
    console.log(`   ↳ banco pré-existente ainda não adotado (baseline ${name} seria aplicável)`);
    return;
  }
  console.log(`   ↳ adotando banco pré-existente (baseline ${name})`);
  const res = runPrisma(["migrate", "resolve", "--applied", name, `--schema=${schema}`], url, urlEnv);
  if (res.code !== 0) throw new Error(`falha ao marcar baseline: ${res.out}`);
}

/**
 * Aplica cada migration do alvo na mão (`db execute` + `migrate resolve
 * --applied`), pulando o `migrate deploy` de propósito.
 *
 * Precisa disto quando o alvo não tem NENHUMA tabela própria ainda, mas a
 * database (compartilhada entre catalog e tenant) já não está vazia — o
 * outro schema já rodou e criou as tabelas dele. O `prisma migrate deploy`
 * decide se pode aplicar olhando a database inteira, não só as tabelas do
 * seu schema: vendo tabelas de outro schema sem nenhum registro em
 * `_prisma_migrations` pras SUAS migrations, ele recusa com P3005 achando
 * que é um banco de produção não-vazio e desconhecido — mesmo o alvo em si
 * estando genuinamente vazio. Aplicar e registrar migration por migration
 * contorna essa checagem sem abrir mão do histórico correto.
 */
function applyFresh(target, url) {
  console.log(`   ↳ database compartilhada já não está vazia (outro schema) — aplicando na mão`);
  for (const name of migrationNames(target.migrations)) {
    const sqlFile = join(target.migrations, name, "migration.sql");
    const exec = runPrisma(["db", "execute", `--file=${sqlFile}`, `--schema=${target.schema}`], url, target.urlEnv);
    if (exec.code !== 0) throw new Error(`falha ao aplicar ${name}: ${exec.out}`);
    const resolve = runPrisma(["migrate", "resolve", "--applied", name, `--schema=${target.schema}`], url, target.urlEnv);
    if (resolve.code !== 0) throw new Error(`falha ao registrar ${name}: ${resolve.out}`);
  }
}

async function migrateOne(target, url, label) {
  console.log(`\n▶ ${label}`);
  const state = await inspect(url, baselineName(target.migrations));

  // "Tem tabela pra adotar?" precisa olhar só as tabelas DESTE alvo (catalog
  // OU tenant) — não a database toda. Catalog e tenant dividem a mesma
  // database por padrão; se o catalog já rodou e criou `empresas` etc., a
  // database "tem tabelas", mas nenhuma delas é do tenant. Checar genérico
  // fazia o tenant entrar no fluxo de adoção de banco legado e abortar,
  // porque nenhuma tabela SUA (users, sale_items...) existia ainda — a
  // migration nunca chegava a rodar de verdade num banco novo compartilhado.
  const esperado = baselineShape(target.migrations);
  const temTabelaPropria = [...esperado.keys()].some((tabela) => state.real.has(tabela));

  if (!state.adopted && temTabelaPropria) {
    adopt(target, url, state.real);
  } else if (!state.adopted && !temTabelaPropria && state.real.size > 0 && !CHECK_ONLY) {
    applyFresh(target, url);
  }

  const cmd = CHECK_ONLY ? "status" : "deploy";
  const res = runPrisma(["migrate", cmd, `--schema=${target.schema}`], url, target.urlEnv);
  if (res.code !== 0) throw new Error(res.out);
  console.log(
    `   ✅ ${CHECK_ONLY ? "em dia" : "migrations aplicadas"}${state.adopted ? "" : " (banco novo/adotado)"}`
  );
}

/** Lê a lista de tenants direto do catalog, sem depender do client gerado do catalog. */
async function listTenantDbNames(catalogUrl) {
  const client = new PrismaClient({ datasources: { db: { url: catalogUrl } } });
  try {
    const [{ exists }] = await client.$queryRawUnsafe(
      "SELECT to_regclass('public.empresas') IS NOT NULL AS exists"
    );
    if (!exists) return [];
    const rows = await client.$queryRawUnsafe(
      "SELECT db_name FROM empresas ORDER BY db_name"
    );
    return rows.map((r) => r.db_name);
  } finally {
    await client.$disconnect();
  }
}

function buildTenantUrl(base, dbName) {
  return base.replace(/\/([^/?]+)(\?|$)/, `/${dbName}$2`);
}

// ─── main ─────────────────────────────────────────────────────
const baseUrl = process.env.DATABASE_URL;
if (!baseUrl) {
  console.error("DATABASE_URL não definida — nada a migrar.");
  process.exit(1);
}
const catalogUrl = process.env.CATALOG_DATABASE_URL || baseUrl;

console.log(
  CHECK_ONLY
    ? "🔍 Auditando migrations (nenhuma alteração será aplicada)"
    : "🏗️  Aplicando migrations em catalog + tenants"
);

const failures = [];

// 1. Catalog primeiro: é dele que sai a lista de tenants.
try {
  await migrateOne(CATALOG, catalogUrl, "catalog");
} catch (err) {
  failures.push(["catalog", err.message]);
  console.error(`   ❌ ${err.message}`);
}

// 2. Tenants. Inclui a DATABASE_URL padrão — na instalação de empresa única ela
//    é o próprio tenant e não aparece na tabela `empresas`.
let dbNames = [];
try {
  dbNames = await listTenantDbNames(catalogUrl);
} catch (err) {
  failures.push(["listar empresas", err.message]);
  console.error(`\n❌ não consegui listar as empresas: ${err.message}`);
}

const tenantUrls = new Map([[baseUrl, "tenant padrão (DATABASE_URL)"]]);
for (const dbName of dbNames) {
  tenantUrls.set(buildTenantUrl(baseUrl, dbName), `empresa ${dbName}`);
}

for (const [url, label] of tenantUrls) {
  try {
    await migrateOne(TENANT, url, label);
  } catch (err) {
    // Isolado de propósito: um tenant quebrado não interrompe os demais.
    failures.push([label, err.message]);
    console.error(`   ❌ ${err.message}`);
  }
}

// 3. Relatório.
const total = tenantUrls.size + 1;
console.log(`\n${"─".repeat(60)}`);
if (failures.length === 0) {
  console.log(`✅ ${total} banco(s) OK`);
  process.exit(0);
}
console.log(`⚠️  ${failures.length} de ${total} banco(s) com problema:`);
for (const [label, msg] of failures) console.log(`   • ${label}: ${primeiraLinhaUtil(msg)}`);
process.exit(1);
