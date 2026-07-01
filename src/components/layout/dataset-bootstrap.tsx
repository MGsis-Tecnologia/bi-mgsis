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
import { serverGetMeta, serverDownloadAll } from "@/lib/server/dataset-client";
import type { DatasetKind } from "@/lib/server/dataset-storage";
import type {
  StoredCaixa,
  StoredDataset,
  StoredInventory,
  StoredPayables,
  StoredReceivables,
} from "@/lib/types/dataset";

// Monta uma vez no layout. Estratégia de carregamento por kind:
// 1. Busca metadata do servidor (importedAt)
// 2. Se IDB já tem a mesma versão → usa IDB (caminho rápido, sem download)
// 3. Se servidor tem versão mais nova → baixa todas as rows e atualiza IDB
// 4. Se servidor sem dados → usa IDB local como fallback

async function syncOne<T extends { importedAt: string }>(
  serverKind: DatasetKind,
  idbKey: string
): Promise<T | null> {
  const [serverMeta, idbData] = await Promise.all([
    serverGetMeta(serverKind),
    idbGet<T>(idbKey),
  ]);

  // Servidor sem dados → usa cache local
  if (!serverMeta) return idbData;

  // Mesma versão → não precisa baixar
  if (idbData && (idbData as { importedAt?: string }).importedAt === serverMeta.importedAt) {
    return idbData;
  }

  // Versão nova no servidor → baixa e armazena no IDB
  try {
    const downloaded = await serverDownloadAll<T>(serverKind, serverMeta);
    idbSet(idbKey, downloaded).catch(() => {});
    return downloaded;
  } catch {
    // Se falhar o download, usa o que há no IDB
    return idbData;
  }
}

export function DatasetBootstrap() {
  const isLoaded = useDatasetStore((s) => s.isLoaded);
  const [progress, setProgress] = React.useState("");

  React.useEffect(() => {
    Promise.all([
      syncOne<StoredDataset>("sales", IDB_KEY),
      syncOne<StoredReceivables>("receivable", RECEIVABLES_IDB_KEY),
      syncOne<StoredPayables>("payable", PAYABLES_IDB_KEY),
      syncOne<StoredInventory>("inventory", INVENTORY_IDB_KEY),
      syncOne<StoredCaixa>("caixa", CAIXA_IDB_KEY),
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
        <p className="text-xs text-muted-foreground">
          {progress || "Carregando dados…"}
        </p>
      </div>
    </div>
  );
}
