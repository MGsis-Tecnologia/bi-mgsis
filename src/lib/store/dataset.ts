import { create } from "zustand";
import type {
  StoredCaixa,
  StoredDataset,
  StoredInventory,
  StoredPayables,
  StoredReceivables,
} from "@/lib/types/dataset";

// No persist middleware — datasets are stored in IndexedDB (see idb.ts).
// localStorage quota (~5 MB) is far too small for real datasets.
// Sales, receivables, payables and inventory are fully independent datasets.

interface DatasetState {
  dataset: StoredDataset | null;
  receivables: StoredReceivables | null;
  payables: StoredPayables | null;
  inventory: StoredInventory | null;
  caixa: StoredCaixa | null;
  isLoaded: boolean;
  setDataset: (d: StoredDataset) => void;
  clearDataset: () => void;
  setReceivables: (r: StoredReceivables) => void;
  clearReceivables: () => void;
  setPayables: (p: StoredPayables) => void;
  clearPayables: () => void;
  setInventory: (i: StoredInventory) => void;
  clearInventory: () => void;
  setCaixa: (c: StoredCaixa) => void;
  clearCaixa: () => void;
  _setLoaded: () => void;
}

export const useDatasetStore = create<DatasetState>()((set) => ({
  dataset: null,
  receivables: null,
  payables: null,
  inventory: null,
  caixa: null,
  isLoaded: false,
  setDataset:       (dataset)     => set({ dataset }),
  clearDataset:     ()            => set({ dataset: null }),
  setReceivables:   (receivables) => set({ receivables }),
  clearReceivables: ()            => set({ receivables: null }),
  setPayables:      (payables)    => set({ payables }),
  clearPayables:    ()            => set({ payables: null }),
  setInventory:     (inventory)   => set({ inventory }),
  clearInventory:   ()            => set({ inventory: null }),
  setCaixa:         (caixa)       => set({ caixa }),
  clearCaixa:       ()            => set({ caixa: null }),
  _setLoaded:       ()            => set({ isLoaded: true }),
}));

export const IDB_KEY = "mgsis-dataset";
export const RECEIVABLES_IDB_KEY = "mgsis-receivables";
export const PAYABLES_IDB_KEY = "mgsis-payables";
export const INVENTORY_IDB_KEY = "mgsis-inventory";
export const CAIXA_IDB_KEY = "mgsis-caixa";
