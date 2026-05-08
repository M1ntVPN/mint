import { useFolders } from "../store/folders";
import { useServers } from "../store/servers";

// Sort an arbitrary list of server ids by their currently-stored ping
// in ascending order. Unreachable rows (ping === null) sink to the
// bottom — that's the natural "I want fastest first" ordering you'd
// hand-do in any list.
function sortIdsByPing(ids: string[]): string[] {
  const latest = useServers.getState().servers;
  const byId = new Map(latest.map((s) => [s.id, s]));
  const score = (id: string): number => {
    const ms = byId.get(id)?.ping;
    return ms == null ? Number.POSITIVE_INFINITY : ms;
  };
  return [...ids].sort((a, b) => score(a) - score(b));
}

// Reorder a single folder's `serverIds` so the fastest-pinging
// servers come first. Reads the canonical order from the folder
// store at call time — callers who just wrote a setPing batch can
// invoke this without passing anything.
export function sortFolderServersByPing(folderId: string): void {
  const fState = useFolders.getState();
  const folder = fState.folders.find((f) => f.id === folderId);
  if (!folder || folder.serverIds.length < 2) return;
  fState.reorderServers(folderId, sortIdsByPing(folder.serverIds));
}

// Reorder loose (folder-less) servers in the global servers list
// so the fastest-pinging ones bubble up. Same semantics as
// sortFolderServersByPing but for the un-grouped bucket the dashboard
// renders below the folders.
export function sortLooseServersByPing(): void {
  const fState = useFolders.getState();
  const sState = useServers.getState();
  const inFolder = new Set<string>();
  for (const f of fState.folders) for (const id of f.serverIds) inFolder.add(id);
  const looseIds = sState.servers
    .filter((s) => !inFolder.has(s.id))
    .map((s) => s.id);
  if (looseIds.length < 2) return;
  sState.reorderLoose(sortIdsByPing(looseIds));
}

// Hoist the lowest-ping rows in every group the user can see —
// every folder gets its serverIds sorted and the loose bucket
// follows. Cheap because each call is a single zustand `set`.
export function sortAllByPing(): void {
  const fState = useFolders.getState();
  for (const f of fState.folders) {
    sortFolderServersByPing(f.id);
  }
  sortLooseServersByPing();
}

// Sort whichever bucket a single server lives in. Used after a
// per-row ping so the row visibly moves to its "right" place
// without the user having to press "Пинговать всё" again.
export function sortBucketContaining(serverId: string): void {
  const fState = useFolders.getState();
  const folder = fState.folders.find((f) => f.serverIds.includes(serverId));
  if (folder) {
    sortFolderServersByPing(folder.id);
  } else {
    sortLooseServersByPing();
  }
}
