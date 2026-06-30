"use client";

import * as React from "react";
import { Loader2 } from "lucide-react";
import {
  useDatasetStore,
  IDB_KEY,
  RECEIVABLES_IDB_KEY,
  PAYABLES_IDB_KEY,
  INVENTORY_IDB_KEY,
  CAIXA_IDB_KEY,
} from "@/lib/store/dataset";
import { idbGet, idbSet } from "@/lib/store/idb";
import { serverGet } from "@/lib/server/dataset-client";
import type {
  StoredCaixa,
  StoredDataset,
  StoredInventory,
  StoredPayables,
  StoredReceivables,
} from "@/lib/types/dataset";

// Mounts once in the layout. Loads each dataset from the server first
// (so that any browser sees the same imports), falling back to IndexedDB
// when the server has nothing yet. Shows a loading overlay until the
// attempt finishes.
//
// Server hits and IDB cache writes happen in parallel per kind. A failing
// server request silently falls back to IDB — the app keeps working offline.

async function loadOne<T>(
  serverKind: "sales" | "receivable" | "payable" | "inventory" | "caixa",
  idbKey: string
): Promise<T | null> {
  // Try the server first
  const fromServer = await serverGet<T>(serverKind);
  if (fromServer) {
    // Refresh the local IDB cache so the next load is instant even offline
    idbSet(idbKey, fromServer).catch(() => {});
    return fromServer;
  }
  // Server has nothing → fall back to whatever this browser cached
  return idbGet<T>(idbKey);
}

export function DatasetBootstrap() {
  const isLoaded = useDatasetStore((s) => s.isLoaded);

  React.useEffect(() => {
    Promise.all([
      loadOne<StoredDataset>("sales", IDB_KEY),
      loadOne<StoredReceivables>("receivable", RECEIVABLES_IDB_KEY),
      loadOne<StoredPayables>("payable", PAYABLES_IDB_KEY),
      loadOne<StoredInventory>("inventory", INVENTORY_IDB_KEY),
      loadOne<StoredCaixa>("caixa", CAIXA_IDB_KEY),
    ])
      .then(([data, receivables, payables, inventory, caixa]) => {
        const store = useDatasetStore.getState();
        if (data) store.setDataset(data);
        if (receivables) store.setReceivables(receivables);
        if (payables) store.setPayables(payables);
        if (inventory) store.setInventory(inventory);
        if (caixa) store.setCaixa(caixa);
        store._setLoaded();
      })
      .catch(() => {
        useDatasetStore.getState()._setLoaded();
      });
  }, []);

  if (isLoaded) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm">
      <div className="flex flex-col items-center gap-3">
        <Loader2 className="h-6 w-6 animate-spin text-accent" />
        <p className="text-xs text-muted-foreground">Carregando dados…</p>
      </div>
    </div>
  );
}
