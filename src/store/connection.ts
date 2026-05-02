import { create } from "zustand";
import type { ConnState } from "../types";

interface ConnectionState {
  state: ConnState;
  setState: (s: ConnState) => void;
}

export const useConnection = create<ConnectionState>((set) => ({
  state: "disconnected",
  setState: (s) => set({ state: s }),
}));
