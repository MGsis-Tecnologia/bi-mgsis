import { create } from "zustand";
import type { StoredDataset, StoredReceivables } from "@/lib/types/dataset";

// No persist middleware — datasets are stored in IndexedDB (see idb.ts).
// localStorage quota (~5 MB) is far too small for real datasets.
// Sales (dataset) and accounts receivable (receivables) are independent:
// importing one never affects the other.

interface DatasetState {
  dataset: StoredDataset | null;
  receivables: StoredReceivables | null;
  isLoaded: boolean;       // true after the initial IDB load attempt completes
  setDataset: (d: StoredDataset) => void;
  clearDataset: () => void;
  setReceivables: (r: StoredReceivables) => void;
  clearReceivables: () => void;
  _setLoaded: () => void;
}

export const useDatasetStore = create<DatasetState>()((set) => ({
  dataset: null,
  receivables: null,
  isLoaded: false,
  setDataset:       (dataset)     => set({ dataset }),
  clearDataset:     ()            => set({ dataset: null }),
  setReceivables:   (receivables) => set({ receivables }),
  clearReceivables: ()            => set({ receivables: null }),
  _setLoaded:       ()            => set({ isLoaded: true }),
}));

export const IDB_KEY = "mgsis-dataset";
export const RECEIVABLES_IDB_KEY = "mgsis-receivables";
