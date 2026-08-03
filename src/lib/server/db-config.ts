/**
 * Configuração do banco via variável de ambiente.
 * A URL de conexão vem exclusivamente de DATABASE_URL — não há tela de /setup
 * nem persistência local da connection string.
 */

export function getDatabaseUrl(): string | undefined {
  return process.env.DATABASE_URL || undefined;
}

export function isDbConfigured(): boolean {
  return !!getDatabaseUrl();
}

/** Extrai o nome da database de uma connection string Postgres (ex: ".../analytics?schema=public" → "analytics"). */
export function getDbNameFromUrl(url: string): string {
  const match = url.match(/\/([^/?]+)(\?|$)/);
  if (!match) throw new Error(`Não foi possível extrair o nome da database de: ${url}`);
  return match[1];
}

/**
 * Monta a connection string de um tenant trocando só o nome da database na
 * URL base (mesmo host/porta/credencial) — os bancos de todas as empresas
 * vivem no mesmo servidor Postgres, só muda a database.
 */
export function buildTenantUrl(dbName: string): string {
  const base = getDatabaseUrl();
  if (!base) {
    throw new Error("DATABASE_URL não configurada — necessária como base para montar URLs de tenant.");
  }
  return base.replace(/\/([^/?]+)(\?|$)/, `/${dbName}$2`);
}
