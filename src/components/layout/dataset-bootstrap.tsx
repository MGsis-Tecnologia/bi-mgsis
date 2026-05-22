"use client";

import * as React from "react";
import { Loader2 } from "lucide-react";
import { useDatasetStore, IDB_KEY, RECEIVABLES_IDB_KEY } from "@/lib/store/dataset";
import { idbGet } from "@/lib/store/idb";
import type { StoredDataset, StoredReceivables } from "@/lib/types/dataset";

// Mounts once in the layout. Loads the dataset from IndexedDB into Zustand,
// then shows a loading overlay until the attempt finishes (fast if empty,
// a few seconds for large datasets).
export function DatasetBootstrap() {
  const isLoaded = useDatasetStore((s) => s.isLoaded);

  React.useEffect(() => {
    Promise.all([
      idbGet<StoredDataset>(IDB_KEY),
      idbGet<StoredReceivables>(RECEIVABLES_IDB_KEY),
    ])
      .then(([data, receivables]) => {
        const store = useDatasetStore.getState();
        if (data) store.setDataset(data);
        if (receivables) store.setReceivables(receivables);
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
