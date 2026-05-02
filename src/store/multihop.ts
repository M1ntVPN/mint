import { create } from "zustand";
import { persist } from "zustand/middleware";

interface MultiHopState {
  enabled: boolean;
  entryId: string | null;
  exitId: string | null;
  setEnabled: (v: boolean) => void;
  setEntry: (id: string | null) => void;
  setExit: (id: string | null) => void;
}

export const useMultiHop = create<MultiHopState>()(
  persist(
    (set) => ({
      enabled: false,
      entryId: null,
      exitId: null,
      setEnabled: (v) => set({ enabled: v }),
      setEntry: (id) => set({ entryId: id }),
      setExit: (id) => set({ exitId: id }),
    }),
    { name: "mint.multihop.v1" }
  )
);
