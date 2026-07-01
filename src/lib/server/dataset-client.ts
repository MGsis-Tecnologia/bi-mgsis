import type { DatasetKind } from "./dataset-storage";

export interface ServerMeta {
  filename: string;
  rowCount: number;
  importedAt: string;
}

// ---------------------------------------------------------------------------
// Leitura de metadata
// ---------------------------------------------------------------------------

export async function serverGetMeta(kind: DatasetKind): Promise<ServerMeta | null> {
  try {
    const res = await fetch(`/api/datasets/${kind}`, { cache: "no-store" });
    if (!res.ok) return null;
    const json = (await res.json()) as { present: boolean; meta?: ServerMeta };
    if (!json.present || !json.meta) return null;
    return json.meta;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Leitura de rows paginada (para sincronização no bootstrap)
// ---------------------------------------------------------------------------

export async function serverGetRows(kind: DatasetKind, skip: number, take: number): Promise<unknown[]> {
  const res = await fetch(`/api/datasets/${kind}/rows?skip=${skip}&take=${take}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`GET rows failed: ${res.status}`);
  const json = (await res.json()) as { rows: unknown[] };
  return json.rows;
}

// Baixa todas as rows do servidor em lotes e reconstrói o objeto armazenado
export async function serverDownloadAll<T>(
  kind: DatasetKind,
  meta: ServerMeta,
  onProgress?: (loaded: number, total: number) => void
): Promise<T & { filename: string; rowCount: number; importedAt: string }> {
  const BATCH = 10_000;
  const allRows: unknown[] = [];

  for (let skip = 0; skip < meta.rowCount; skip += BATCH) {
    const rows = await serverGetRows(kind, skip, BATCH);
    allRows.push(...rows);
    onProgress?.(allRows.length, meta.rowCount);
  }

  return {
    items: allRows,
    filename: meta.filename,
    rowCount: meta.rowCount,
    importedAt: meta.importedAt,
  } as unknown as T & { filename: string; rowCount: number; importedAt: string };
}

// ---------------------------------------------------------------------------
// Escrita — upload em lotes (substitui serverPut)
// ---------------------------------------------------------------------------

const CHUNK_SIZE = 3_000;

export async function serverImport(
  kind: DatasetKind,
  items: unknown[],
  meta: { filename: string; rowCount: number; importedAt: string },
  onProgress?: (sent: number, total: number) => void
): Promise<void> {
  // 1. Limpa rows existentes
  const delRes = await fetch(`/api/datasets/${kind}/rows`, { method: "DELETE" });
  if (!delRes.ok) throw new Error(`Falha ao limpar dados anteriores (${delRes.status})`);

  // 2. Envia em lotes
  for (let i = 0; i < items.length; i += CHUNK_SIZE) {
    const chunk = items.slice(i, i + CHUNK_SIZE);
    const res = await fetch(`/api/datasets/${kind}/rows`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rows: chunk }),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`Falha ao enviar lote (${res.status}): ${text}`);
    }
    onProgress?.(Math.min(i + CHUNK_SIZE, items.length), items.length);
  }

  // 3. Atualiza metadata
  const patchRes = await fetch(`/api/datasets/${kind}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(meta),
  });
  if (!patchRes.ok) {
    const text = await patchRes.text().catch(() => "");
    throw new Error(`Falha ao salvar metadata (${patchRes.status}): ${text}`);
  }
}

// ---------------------------------------------------------------------------
// Delete
// ---------------------------------------------------------------------------

export async function serverDelete(kind: DatasetKind): Promise<void> {
  try {
    await fetch(`/api/datasets/${kind}`, { method: "DELETE" });
  } catch {
    // swallowed — UI já mutou estado local
  }
}
