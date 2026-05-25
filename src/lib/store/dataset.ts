import { create } from "zustand";
import type { StoredDataset, StoredReceivables, StoredPayables } from "@/lib/types/dataset";

// No persist middleware — datasets are stored in IndexedDB (see idb.ts).
// localStorage quota (~5 MB) is far too small for real datasets.
// Sales, receivables and payables are fully independent datasets.

interface DatasetState {
  dataset: StoredDataset | null;
  receivables: StoredReceivables | null;
  payables: StoredPayables | null;
  isLoaded: boolean;
  setDataset: (d: StoredDataset) => void;
  clearDataset: () => void;
  setReceivables: (r: StoredReceivables) => void;
  clearReceivables: () => void;
  setPayables: (p: StoredPayables) => void;
  clearPayables: () => void;
  _setLoaded: () => void;
}

export const useDatasetStore = create<DatasetState>()((set) => ({
  dataset: null,
  receivables: null,
  payables: null,
  isLoaded: false,
  setDataset:       (dataset)     => set({ dataset }),
  clearDataset:     ()            => set({ dataset: null }),
  setReceivables:   (receivables) => set({ receivables }),
  clearReceivables: ()            => set({ receivables: null }),
  setPayables:      (payables)    => set({ payables }),
  clearPayables:    ()            => set({ payables: null }),
  _setLoaded:       ()            => set({ isLoaded: true }),
}));

export const IDB_KEY = "mgsis-dataset";
export const RECEIVABLES_IDB_KEY = "mgsis-receivables";
export const PAYABLES_IDB_KEY = "mgsis-payables";
