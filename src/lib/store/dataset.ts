import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { StoredDataset } from "@/lib/types/dataset";

interface DatasetState {
  dataset: StoredDataset | null;
  setDataset: (d: StoredDataset) => void;
  clearDataset: () => void;
}

export const useDatasetStore = create<DatasetState>()(
  persist(
    (set) => ({
      dataset: null,
      setDataset: (dataset) => set({ dataset }),
      clearDataset: () => set({ dataset: null }),
    }),
    { name: "mgsis-dataset" }
  )
);
