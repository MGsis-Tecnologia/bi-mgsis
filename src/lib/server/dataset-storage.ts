import { promises as fs } from "node:fs";
import path from "node:path";

// Local server-side persistence for imported datasets.
//
// Until the project migrates to a real API, the data must be shared across
// any browser that hits the running server. We write one JSON file per
// dataset kind under ./data/ on the host filesystem.
//
// Concurrency: writes are atomic per file (tmp + rename). Read/write races
// against the same kind are tolerated because the file is small enough to
// rewrite as a whole — last write wins.

export type DatasetKind = "sales" | "receivable" | "payable" | "inventory" | "caixa";

const VALID_KINDS = new Set<DatasetKind>(["sales", "receivable", "payable", "inventory", "caixa"]);

export function isValidKind(s: string): s is DatasetKind {
  return VALID_KINDS.has(s as DatasetKind);
}

// Resolved at first use — keeps the path next to the running Node process.
const DATA_DIR = path.join(process.cwd(), "data");

function fileFor(kind: DatasetKind): string {
  return path.join(DATA_DIR, `${kind}.json`);
}

async function ensureDir(): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
}

export async function readDataset(kind: DatasetKind): Promise<unknown | null> {
  try {
    const raw = await fs.readFile(fileFor(kind), "utf8");
    return JSON.parse(raw);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw err;
  }
}

export async function writeDataset(kind: DatasetKind, value: unknown): Promise<void> {
  await ensureDir();
  const target = fileFor(kind);
  const tmp = `${target}.tmp-${process.pid}-${Date.now()}`;
  await fs.writeFile(tmp, JSON.stringify(value), "utf8");
  // rename is atomic on POSIX; on Windows it overwrites the destination on
  // recent Node versions (fs.rename uses MoveFileEx with replace).
  await fs.rename(tmp, target);
}

export async function deleteDataset(kind: DatasetKind): Promise<void> {
  try {
    await fs.unlink(fileFor(kind));
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
  }
}

export interface DatasetSummary {
  kind: DatasetKind;
  present: boolean;
  filename?: string;
  rowCount?: number;
  importedAt?: string;
  sizeBytes?: number;
}

export async function summarize(kind: DatasetKind): Promise<DatasetSummary> {
  try {
    const stat = await fs.stat(fileFor(kind));
    const data = (await readDataset(kind)) as
      | { filename?: string; rowCount?: number; importedAt?: string }
      | null;
    if (!data) return { kind, present: false };
    return {
      kind,
      present: true,
      filename: data.filename,
      rowCount: data.rowCount,
      importedAt: data.importedAt,
      sizeBytes: stat.size,
    };
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      return { kind, present: false };
    }
    throw err;
  }
}

export async function summarizeAll(): Promise<DatasetSummary[]> {
  return Promise.all([...VALID_KINDS].map((k) => summarize(k)));
}
