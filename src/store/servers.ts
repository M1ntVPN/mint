import { create } from "zustand";
import { persist } from "zustand/middleware";
import { mapPool } from "../utils/mapPool";
import { PROBE_SKIP_WRITE } from "../utils/ping";

export type SavedServerSource = "manual" | "subscription" | "file" | "clipboard";

export interface SavedServer {
  id: string;
  name: string;
  address: string;
  protocol: string;
  country?: string;
  city?: string;
  flag?: string;
  ping: number | null;
  load: number | null;
  source: SavedServerSource;
  addedAt: number;
  pingedAt?: number;
  favorite?: boolean;
  description?: string;
  subscriptionId?: string;
  pinned?: boolean;
}

interface ServersState {
  servers: SavedServer[];
  add: (s: Omit<SavedServer, "id" | "addedAt"> & { id?: string }) => string;
  // Optional `id` (auto-generated when missing) and `addedAt` (defaults
  // to now) so callers like `refreshSubscription` can re-add servers
  // while preserving the user's original add date and per-server
  // measurements (ping / load / pingedAt). Preserving the latter is
  // why all servers showed `n/a` after a refresh — we threw away the
  // measured ping along with the row.
  addMany: (
    ss: (Omit<SavedServer, "id" | "addedAt"> & {
      id?: string;
      addedAt?: number;
    })[]
  ) => string[];
  remove: (id: string) => void;
  removeBySubscription: (subId: string) => void;
  rename: (id: string, name: string) => void;
  setDescription: (id: string, description: string) => void;
  setNameAndDescription: (id: string, name: string, description: string) => void;
  toggleFavorite: (id: string) => void;
  togglePinned: (id: string) => void;
  reorderLoose: (ids: string[]) => void;
  setPing: (id: string, ping: number | null) => void;
  pingAll: (
    probe: (s: SavedServer) => Promise<number | typeof PROBE_SKIP_WRITE>
  ) => Promise<void>;
}

const SEED: SavedServer[] = [];

export const useServers = create<ServersState>()(
  persist(
    (set, get) => ({
      servers: SEED,
      add: (s) => {
        const id = s.id ?? `srv-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        set((state) => ({
          servers: [
            { ...s, id, addedAt: Date.now() } as SavedServer,
            ...state.servers,
          ],
        }));
        return id;
      },
      addMany: (ss) => {
        const stamp = Date.now();
        const newIds = ss.map(
          (s, i) =>
            s.id ??
            `srv-${stamp}-${i}-${Math.random().toString(36).slice(2, 8)}`
        );
        const fresh = ss.map((s, i) => ({
          ...s,
          id: newIds[i],
          addedAt: s.addedAt ?? stamp,
        })) as SavedServer[];
        set((state) => ({ servers: [...fresh, ...state.servers] }));
        return newIds;
      },
      remove: (id) =>
        set((state) => ({ servers: state.servers.filter((s) => s.id !== id) })),
      removeBySubscription: (subId) =>
        set((state) => ({
          servers: state.servers.filter((s) => s.subscriptionId !== subId),
        })),
      rename: (id, name) =>
        set((state) => ({
          servers: state.servers.map((s) => (s.id === id ? { ...s, name } : s)),
        })),
      setDescription: (id, description) =>
        set((state) => ({
          servers: state.servers.map((s) =>
            s.id === id
              ? { ...s, description: description.trim() || undefined }
              : s
          ),
        })),
      setNameAndDescription: (id, name, description) =>
        set((state) => ({
          servers: state.servers.map((s) =>
            s.id === id
              ? {
                  ...s,
                  name: name.trim() || s.name,
                  description: description.trim() || undefined,
                }
              : s
          ),
        })),
      toggleFavorite: (id) =>
        set((state) => ({
          servers: state.servers.map((s) =>
            s.id === id ? { ...s, favorite: !s.favorite } : s
          ),
        })),
      togglePinned: (id) =>
        set((state) => ({
          servers: state.servers.map((s) =>
            s.id === id ? { ...s, pinned: !s.pinned } : s
          ),
        })),
      reorderLoose: (ids) =>
        set((state) => {
          const listed = new Set(ids);
          const known = new Map<string, SavedServer>(
            state.servers.map((s) => [s.id, s])
          );
          const reordered: SavedServer[] = [];
          const seen = new Set<string>();
          let inserted = false;
          for (const s of state.servers) {
            if (listed.has(s.id)) {
              if (!inserted) {
                inserted = true;
                for (const id of ids) {
                  const found = known.get(id);
                  if (found && !seen.has(id)) {
                    reordered.push(found);
                    seen.add(id);
                  }
                }
              }
              continue;
            }
            reordered.push(s);
          }
          return { servers: reordered };
        }),
      setPing: (id, ping) =>
        set((state) => ({
          servers: state.servers.map((s) =>
            s.id === id ? { ...s, ping, pingedAt: Date.now() } : s
          ),
        })),
      pingAll: async (probe) => {
        const list = get().servers;
        await mapPool(list, 16, async (s) => {
          try {
            const ms = await probe(s);
            if (ms === PROBE_SKIP_WRITE) return;
            get().setPing(s.id, ms);
          } catch {
            get().setPing(s.id, null);
          }
        });
      },
    }),
    {
      name: "mint.servers.v2",
      version: 2,
    }
  )
);
