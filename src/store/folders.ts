import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface Folder {
  id: string;
  name: string;
  color?: string;
  description?: string;
  serverIds: string[];
  createdAt: number;
  subscriptionId?: string;
  pinned?: boolean;
}

interface FoldersState {
  folders: Folder[];
  create: (name: string, opts?: { subscriptionId?: string }) => string;
  rename: (id: string, name: string) => void;
  setDescription: (id: string, description: string) => void;
  setNameAndDescription: (id: string, name: string, description: string) => void;
  remove: (id: string) => void;
  setServerIds: (id: string, ids: string[]) => void;
  move: (serverId: string, folderId: string | null) => void;
  unindex: (serverId: string) => void;
  findBySubscription: (subId: string) => Folder | null;
  removeBySubscription: (subId: string) => void;
  togglePinned: (id: string) => void;
  reorder: (ids: string[]) => void;
  reorderServers: (folderId: string, ids: string[]) => void;
  collapsedProfileIds: string[];
  toggleProfileCollapsed: (subId: string) => void;
  // Folder open/closed state on the dashboard. Persisted because the
  // <ServersList> component is unmounted whenever the user navigates to
  // Profiles and back, and React-local `useState` collapsed-state was
  // lost on remount — folders silently re-expanded after every tab
  // switch (and after every app restart).
  closedFolderIds: string[];
  setFolderClosed: (folderId: string, closed: boolean) => void;
  toggleFolderClosed: (folderId: string) => void;
}

export const useFolders = create<FoldersState>()(
  persist(
    (set, get) => ({
      folders: [],
      create: (name, opts) => {
        const id = `fld-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
        const trimmed = name.trim() || "Новая папка";
        set((st) => ({
          folders: [
            {
              id,
              name: trimmed,
              serverIds: [],
              createdAt: Date.now(),
              subscriptionId: opts?.subscriptionId,
            },
            ...st.folders,
          ],
        }));
        return id;
      },
      rename: (id, name) =>
        set((st) => ({
          folders: st.folders.map((f) =>
            f.id === id ? { ...f, name: name.trim() || f.name } : f
          ),
        })),
      setDescription: (id, description) =>
        set((st) => ({
          folders: st.folders.map((f) =>
            f.id === id
              ? { ...f, description: description.trim() || undefined }
              : f
          ),
        })),
      setNameAndDescription: (id, name, description) =>
        set((st) => ({
          folders: st.folders.map((f) =>
            f.id === id
              ? {
                  ...f,
                  name: name.trim() || f.name,
                  description: description.trim() || undefined,
                }
              : f
          ),
        })),
      remove: (id) =>
        set((st) => ({ folders: st.folders.filter((f) => f.id !== id) })),
      setServerIds: (id, ids) =>
        set((st) => ({
          folders: st.folders.map((f) =>
            f.id === id ? { ...f, serverIds: [...ids] } : f
          ),
        })),
      findBySubscription: (subId) => {
        return (
          get().folders.find((f) => f.subscriptionId === subId) ?? null
        );
      },
      removeBySubscription: (subId) =>
        set((st) => ({
          folders: st.folders.filter((f) => f.subscriptionId !== subId),
        })),
      move: (serverId, folderId) =>
        set((st) => {
          const detached = st.folders.map((f) =>
            f.serverIds.includes(serverId)
              ? { ...f, serverIds: f.serverIds.filter((x) => x !== serverId) }
              : f
          );
          if (folderId == null) return { folders: detached };
          return {
            folders: detached.map((f) =>
              f.id === folderId
                ? { ...f, serverIds: [serverId, ...f.serverIds] }
                : f
            ),
          };
        }),
      unindex: (serverId) =>
        set((st) => ({
          folders: st.folders.map((f) =>
            f.serverIds.includes(serverId)
              ? { ...f, serverIds: f.serverIds.filter((x) => x !== serverId) }
              : f
          ),
        })),
      togglePinned: (id) =>
        set((st) => ({
          folders: st.folders.map((f) =>
            f.id === id ? { ...f, pinned: !f.pinned } : f
          ),
        })),
      reorder: (ids) =>
        set((st) => {
          const known = new Map<string, Folder>(
            st.folders.map((f) => [f.id, f])
          );
          const seen = new Set<string>();
          const out: Folder[] = [];
          for (const id of ids) {
            const f = known.get(id);
            if (f && !seen.has(id)) {
              out.push(f);
              seen.add(id);
            }
          }
          for (const f of st.folders) {
            if (!seen.has(f.id)) out.push(f);
          }
          return { folders: out };
        }),
      collapsedProfileIds: [],
      toggleProfileCollapsed: (subId) =>
        set((st) => ({
          collapsedProfileIds: st.collapsedProfileIds.includes(subId)
            ? st.collapsedProfileIds.filter((x) => x !== subId)
            : [...st.collapsedProfileIds, subId],
        })),
      closedFolderIds: [],
      setFolderClosed: (folderId, closed) =>
        set((st) => {
          const has = st.closedFolderIds.includes(folderId);
          if (closed && !has) {
            return { closedFolderIds: [...st.closedFolderIds, folderId] };
          }
          if (!closed && has) {
            return {
              closedFolderIds: st.closedFolderIds.filter((x) => x !== folderId),
            };
          }
          return {};
        }),
      toggleFolderClosed: (folderId) =>
        set((st) => ({
          closedFolderIds: st.closedFolderIds.includes(folderId)
            ? st.closedFolderIds.filter((x) => x !== folderId)
            : [...st.closedFolderIds, folderId],
        })),
      reorderServers: (folderId, ids) =>
        set((st) => ({
          folders: st.folders.map((f) => {
            if (f.id !== folderId) return f;
            const known = new Set(f.serverIds);
            const seen = new Set<string>();
            const out: string[] = [];
            for (const id of ids) {
              if (known.has(id) && !seen.has(id)) {
                out.push(id);
                seen.add(id);
              }
            }
            for (const id of f.serverIds) {
              if (!seen.has(id)) out.push(id);
            }
            return { ...f, serverIds: out };
          }),
        })),
    }),
    {
      name: "mint.folders.v2",
      // Bumped to 3 so existing v2 stores hit `migrate` and gain a
      // default `closedFolderIds: []` instead of rehydrating with the
      // field undefined and crashing `includes(...)` on first toggle.
      version: 3,
      migrate: (persisted: unknown) => {
        if (persisted && typeof persisted === "object") {
          const p = persisted as Record<string, unknown>;
          if (!Array.isArray(p.closedFolderIds)) {
            p.closedFolderIds = [];
          }
          if (!Array.isArray(p.collapsedProfileIds)) {
            p.collapsedProfileIds = [];
          }
        }
        return persisted as FoldersState;
      },
    }
  )
);

export function folderOfServer(
  folders: Folder[],
  serverId: string
): Folder | null {
  return folders.find((f) => f.serverIds.includes(serverId)) ?? null;
}
