// Browser-side client for the local-server dataset API (see route.ts).
// Mirrors the IndexedDB helper API so the import flow can persist to both.

import type { DatasetKind } from "./dataset-storage";

interface FetchOk<T> {
  kind: DatasetKind;
  present: boolean;
  data?: T;
}

/** Read a dataset from the server. Returns null when the file does not exist. */
export async function serverGet<T>(kind: DatasetKind): Promise<T | null> {
  try {
    const res = await fetch(`/api/datasets/${kind}`, { cache: "no-store" });
    if (!res.ok) return null;
    const json = (await res.json()) as FetchOk<T>;
    if (!json.present || !json.data) return null;
    return json.data;
  } catch {
    return null;
  }
}

/** Persist a dataset on the server. Throws on transport failure. */
export async function serverPut<T>(kind: DatasetKind, value: T): Promise<void> {
  const res = await fetch(`/api/datasets/${kind}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(value),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`PUT /api/datasets/${kind} failed: ${res.status} ${text}`);
  }
}

/** Best-effort delete on the server. Swallows transport errors. */
export async function serverDelete(kind: DatasetKind): Promise<void> {
  try {
    await fetch(`/api/datasets/${kind}`, { method: "DELETE" });
  } catch {
    // intentionally swallowed — UI already mutated client state
  }
}
