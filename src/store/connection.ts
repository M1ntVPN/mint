import { create } from "zustand";
import type { ConnState } from "../types";

interface ConnectionState {
  state: ConnState;
  setState: (s: ConnState) => void;
  // Latest one-RTT tunnel ping in milliseconds, sampled by the
  // dashboard from clash's url-test (`urlTest("proxy")`) and halved
  // to drop the request/response leg. `null` while disconnected or
  // before the first probe lands. Read by the server-row in the
  // sidebar so the connected row can mirror the dashboard "Пинг"
  // card when the user opts into `mint.pingMode = "ping"`.
  tunnelPing: number | null;
  setTunnelPing: (ms: number | null) => void;
}

export const useConnection = create<ConnectionState>((set) => ({
  state: "disconnected",
  setState: (s) =>
    // Drop the stale tunnel-ping sample as soon as we leave the
    // connected state. Keeping it would let the connected-server
    // row briefly show a stale ~50 ms while the user is mid-
    // disconnect, which looks like the row "lying" about an
    // already-down tunnel.
    set(s === "connected" ? { state: s } : { state: s, tunnelPing: null }),
  tunnelPing: null,
  setTunnelPing: (ms) => set({ tunnelPing: ms }),
}));
