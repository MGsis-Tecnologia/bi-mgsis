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
