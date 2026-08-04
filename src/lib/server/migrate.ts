import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

// Provisionar uma empresa nova cria uma database vazia; aplicar o schema nela é
// um `prisma migrate deploy` de verdade, não o SQL preguiçoso de db.ts — assim o
// tenant já nasce com `_prisma_migrations` preenchido e entra no mesmo histórico
// auditável de todos os outros (fase 7).
//
// O CLI do Prisma não é rastreado pelo build standalone do Next, então no
// container ele é copiado à parte e apontado por PRISMA_CLI (ver Dockerfile).
function resolveFirst(candidates: (string | undefined)[], what: string): string {
  const found = candidates.filter((c): c is string => !!c).find((c) => existsSync(c));
  if (!found) {
    throw new Error(
      `${what} não encontrado. Procurei em: ${candidates.filter(Boolean).join(", ")}`
    );
  }
  return found;
}

function prismaCli(): string {
  return resolveFirst(
    [
      process.env.PRISMA_CLI,
      join(process.cwd(), "node_modules", "prisma", "build", "index.js"),
      join(process.cwd(), "migrator", "node_modules", "prisma", "build", "index.js"),
    ],
    "CLI do Prisma"
  );
}

function tenantSchema(): string {
  return resolveFirst(
    [process.env.PRISMA_TENANT_SCHEMA, join(process.cwd(), "prisma", "schema.prisma")],
    "schema de tenant"
  );
}

const DEPLOY_TIMEOUT_MS = 120_000;

/** Aplica todas as migrations de tenant na database apontada por `url`. */
export async function deployTenantMigrations(url: string): Promise<void> {
  const cli = prismaCli();
  const schema = tenantSchema();

  try {
    await execFileAsync(
      process.execPath,
      [cli, "migrate", "deploy", `--schema=${schema}`],
      {
        // DATABASE_URL explícita: o Prisma carrega o .env mas não sobrescreve
        // variável já definida, então este valor é o que vale.
        env: { ...process.env, DATABASE_URL: url },
        timeout: DEPLOY_TIMEOUT_MS,
      }
    );
  } catch (err) {
    const e = err as { stdout?: string; stderr?: string; message: string };
    const detail = `${e.stdout ?? ""}${e.stderr ?? ""}`.trim() || e.message;
    throw new Error(`prisma migrate deploy falhou: ${detail}`);
  }
}
