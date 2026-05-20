import { create } from "zustand";
import type { StoredDataset } from "@/lib/types/dataset";

// No persist middleware — dataset is stored in IndexedDB (see idb.ts).
// localStorage quota (~5 MB) is far too small for real datasets.

interface DatasetState {
  dataset: StoredDataset | null;
  isLoaded: boolean;       // true after the initial IDB load attempt completes
  setDataset: (d: StoredDataset) => void;
  clearDataset: () => void;
  _setLoaded: () => void;
}

export const useDatasetStore = create<DatasetState>()((set) => ({
  dataset: null,
  isLoaded: false,
  setDataset:  (dataset) => set({ dataset }),
  clearDataset: ()       => set({ dataset: null }),
  _setLoaded:   ()       => set({ isLoaded: true }),
}));

export const IDB_KEY = "mgsis-dataset";
