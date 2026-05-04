import { create } from "zustand";
import { persist } from "zustand/middleware";

export type TunnelMode = "full" | "whitelist" | "blacklist";

export interface AppRule {
  id: string;
  name: string;
  exe: string;
  brand?: string;
  brandColor?: string;
  via: "vpn" | "bypass";
  folderId?: string | null;
  path?: string | null;
  packageName?: string;
}

export interface NetRule {
  id: string;
  pattern: string;
  via: "vpn" | "bypass";
}

export interface AppFolder {
  id: string;
  name: string;
  createdAt: number;
}

interface TunnelingState {
  mode: TunnelMode;
  apps: AppRule[];
  nets: NetRule[];
  folders: AppFolder[];
  collapsedIds: string[];
  setMode: (m: TunnelMode) => void;
  addApp: (
    entry: Omit<AppRule, "id" | "via" | "folderId">,
    defaultVia: "vpn" | "bypass",
    folderId?: string | null
  ) => void;
  flipApp: (id: string) => void;
  removeApp: (id: string) => void;
  moveApp: (id: string, folderId: string | null) => void;
  addNet: (pattern: string, via: "vpn" | "bypass") => void;
  removeNet: (id: string) => void;
  createFolder: (name: string) => string;
  renameFolder: (id: string, name: string) => void;
  removeFolder: (id: string) => void;
  toggleCollapsed: (id: string) => void;
}

export const useTunneling = create<TunnelingState>()(
  persist(
    (set) => ({
      mode: "whitelist",
      apps: [],
      nets: [],
      folders: [],
      collapsedIds: [],
      setMode: (m) => set({ mode: m }),
      addApp: (entry, defaultVia, folderId) =>
        set((st) => {
          const exeKey = entry.exe.toLowerCase().replace(/\.exe$/, "");
          if (st.apps.some((a) => a.exe.toLowerCase().replace(/\.exe$/, "") === exeKey)) {
            return st;
          }
          return {
            apps: [
              {
                ...entry,
                id: `a-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
                via: defaultVia,
                folderId: folderId ?? null,
              },
              ...st.apps,
            ],
          };
        }),
      flipApp: (id) =>
        set((st) => ({
          apps: st.apps.map((a) =>
            a.id === id ? { ...a, via: a.via === "vpn" ? "bypass" : "vpn" } : a
          ),
        })),
      removeApp: (id) =>
        set((st) => ({ apps: st.apps.filter((a) => a.id !== id) })),
      moveApp: (id, folderId) =>
        set((st) => ({
          apps: st.apps.map((a) =>
            a.id === id ? { ...a, folderId: folderId ?? null } : a
          ),
        })),
      addNet: (pattern, via) =>
        set((st) => {
          const p = pattern.trim();
          if (!p) return st;
          if (st.nets.some((n) => n.pattern.toLowerCase() === p.toLowerCase())) {
            return st;
          }
          return {
            nets: [
              { id: `n-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, pattern: p, via },
              ...st.nets,
            ],
          };
        }),
      removeNet: (id) =>
        set((st) => ({ nets: st.nets.filter((n) => n.id !== id) })),
      createFolder: (name) => {
        const id = `tf-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
        const trimmed = name.trim() || "Новая папка";
        set((st) => ({
          folders: [
            { id, name: trimmed, createdAt: Date.now() },
            ...st.folders,
          ],
        }));
        return id;
      },
      renameFolder: (id, name) =>
        set((st) => ({
          folders: st.folders.map((f) =>
            f.id === id ? { ...f, name: name.trim() || f.name } : f
          ),
        })),
      removeFolder: (id) =>
        set((st) => ({
          folders: st.folders.filter((f) => f.id !== id),
          apps: st.apps.filter((a) => a.folderId !== id),
          collapsedIds: st.collapsedIds.filter((x) => x !== id),
        })),
      toggleCollapsed: (id) =>
        set((st) => ({
          collapsedIds: st.collapsedIds.includes(id)
            ? st.collapsedIds.filter((x) => x !== id)
            : [...st.collapsedIds, id],
        })),
    }),
    { name: "mint.tunneling.v1", version: 1 }
  )
);
