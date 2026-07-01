import { promises as fs } from "node:fs";
import path from "node:path";

const CONFIG_PATH = path.join(process.cwd(), "data", "db-config.json");

interface DbConfig {
  databaseUrl: string;
}

export function getEnvUrl(): string | undefined {
  return process.env.DATABASE_URL || undefined;
}

export async function getSavedUrl(): Promise<string | undefined> {
  try {
    const raw = await fs.readFile(CONFIG_PATH, "utf8");
    const cfg = JSON.parse(raw) as DbConfig;
    return cfg.databaseUrl || undefined;
  } catch {
    return undefined;
  }
}

export async function getDatabaseUrl(): Promise<string | undefined> {
  return getEnvUrl() ?? (await getSavedUrl());
}

export async function saveDatabaseUrl(url: string): Promise<void> {
  await fs.mkdir(path.dirname(CONFIG_PATH), { recursive: true });
  await fs.writeFile(CONFIG_PATH, JSON.stringify({ databaseUrl: url }, null, 2), "utf8");
}

export async function isDbConfigured(): Promise<boolean> {
  return !!(await getDatabaseUrl());
}
