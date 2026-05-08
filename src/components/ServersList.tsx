import { motion, AnimatePresence, Reorder, useDragControls } from "framer-motion";
import {
  Server as ServerIcon,
  Plus,
  FolderPlus,
  ChevronRight,
  Folder,
  MoreHorizontal,
  Trash2,
  Zap,
  Activity,
  Search,
  Crown,
  FolderInput,
  Edit2,
  RefreshCw,
  FolderMinus,
  FileText,
  Star,
  Pin,
  PinOff,
  GripVertical,
  Copy,
} from "lucide-react";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { cn } from "../utils/cn";
import type { Server } from "../types";
import { Flag } from "./Flag";
import { AddServerDialog } from "./AddServerDialog";
import { CreateFolderDialog } from "./CreateFolderDialog";
import { ConfirmDialog } from "./ConfirmDialog";
import { EditDetailsDialog } from "./EditDetailsDialog";
import { useFolders, type Folder as FolderEntry } from "../store/folders";
import { useServers, type SavedServer } from "../store/servers";
import { useSubscriptions, type Subscription } from "../store/subscriptions";
import { probeServer, PROBE_SKIP_WRITE } from "../utils/ping";
import { useSettingsStore, useSetting } from "../store/settings";
import { useConnection } from "../store/connection";
import { mapPool } from "../utils/mapPool";
import {
  refreshSubscription as runRefreshSubscription,
  deleteSubscriptionEverywhere,
} from "../utils/refreshSubscription";
import {
  sortAllByPing,
  sortBucketContaining,
  sortFolderServersByPing,
} from "../utils/sortByPing";

function fmtBytes(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return "0";
  const u = ["B", "KB", "MB", "GB", "TB"];
  let i = 0;
  let v = n;
  while (v >= 1024 && i < u.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(v >= 100 || i === 0 ? 0 : v >= 10 ? 1 : 2)} ${u[i]}`;
}
function expireShort(unix: number): string {
  const d = new Date(unix * 1000);
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${dd}.${mm}.${d.getFullYear()}`;
}

const PROTO_LABEL: Record<string, string> = {
  vless: "VLESS",
  vmess: "VMess",
  trojan: "Trojan",
  shadowsocks: "SS",
  ss: "SS",
  wireguard: "WG",
  wg: "WG",
  hiddify: "Hiddify",
  openvpn: "OpenVPN",
};

function normalizeProto(p: string): string {
  const k = p.toLowerCase();
  if (k === "ss") return "shadowsocks";
  if (k === "wg") return "wireguard";
  return k;
}

interface Props {
  servers: Server[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

export function ServersList({ servers, selectedId, onSelect }: Props) {
  const folderStore = useFolders();
  const reorderFolders = useFolders((s) => s.reorder);
  const reorderFolderServers = useFolders((s) => s.reorderServers);
  const subs = useSubscriptions((s) => s.list);
  const allSavedServers = useServers((s) => s.servers);
  const setPing = useServers((s) => s.setPing);
  const reorderLooseServers = useServers((s) => s.reorderLoose);
  void reorderFolderServers;
  void reorderLooseServers;
  const subById = useMemo(() => {
    const m = new Map<string, Subscription>();
    for (const s of subs) m.set(s.id, s);
    return m;
  }, [subs]);
  const [pingingFolder, setPingingFolder] = useState<Set<string>>(new Set());
  const [pingingAllGlobal, setPingingAllGlobal] = useState(false);
  const [refreshingSub, setRefreshingSub] = useState<Set<string>>(new Set());

  const refreshSubscription = async (sub: Subscription) => {
    if (refreshingSub.has(sub.id)) return;
    setRefreshingSub((p) => new Set(p).add(sub.id));
    try {
      await runRefreshSubscription(sub);
    } finally {
      setRefreshingSub((p) => {
        const n = new Set(p);
        n.delete(sub.id);
        return n;
      });
    }
  };
  const sweepProbe = (s: SavedServer) =>
    probeServer(s, { attempts: 2, timeoutMs: 3000 });
  // Per-folder ping sweep. After every individual setPing() we
  // re-sort that folder so the user sees servers shuffle into
  // ping-ascending order in real time — which is the whole point of
  // pressing "Пропинговать все". The post-sweep call to sortAllByPing
  // covers the corner case where every probe returned the same value
  // and the incremental sorts ended up no-ops.
  const pingFolder = async (folder: FolderEntry) => {
    if (pingingFolder.has(folder.id)) return;
    setPingingFolder((p) => new Set(p).add(folder.id));
    const items = folder.serverIds
      .map((id) => allSavedServers.find((x) => x.id === id))
      .filter((x): x is SavedServer => !!x);
    await mapPool(items, 16, async (srv) => {
      try {
        const ms = await sweepProbe(srv);
        if (ms === PROBE_SKIP_WRITE) return;
        setPing(srv.id, ms);
      } catch {
        setPing(srv.id, null);
      }
      sortFolderServersByPing(folder.id);
    });
    sortFolderServersByPing(folder.id);
    setPingingFolder((p) => {
      const n = new Set(p);
      n.delete(folder.id);
      return n;
    });
  };
  const pingAllServers = async () => {
    if (pingingAllGlobal) return;
    setPingingAllGlobal(true);
    try {
      await mapPool(allSavedServers, 16, async (srv) => {
        try {
          const ms = await sweepProbe(srv);
          if (ms === PROBE_SKIP_WRITE) return;
          setPing(srv.id, ms);
        } catch {
          setPing(srv.id, null);
        }
        // Live re-sort: every measurement that lands updates the
        // bucket the row lives in. Without this the user stares at
        // the original (unsorted) order until the very last probe
        // resolves, which on a slow link feels like "sorting is
        // broken".
        sortBucketContaining(srv.id);
      });
      sortAllByPing();
    } finally {
      setPingingAllGlobal(false);
    }
  };
  // Folder open/closed state lives in zustand+persist (`closedFolderIds`)
  // rather than React-local `useState`. <ServersList> is unmounted when
  // the user navigates to Profiles and remounted on the way back, which
  // used to wipe the local state and silently re-expand every folder
  // on every tab switch (and after every app restart). Storing only the
  // *closed* IDs keeps the default behaviour “newly created folder is
  // open” without bookkeeping for new IDs.
  const closedFolderIds = useFolders((s) => s.closedFolderIds);
  const toggleFolderClosed = useFolders((s) => s.toggleFolderClosed);
  const isFolderOpen = (folderId: string) => !closedFolderIds.includes(folderId);
  const [query, setQuery] = useState("");
  const [protoFilter, setProtoFilter] = useState<string>("all");
  const [addOpen, setAddOpen] = useState<false | "subscription" | "uri">(false);
  const [folderDlgOpen, setFolderDlgOpen] = useState(false);

  const protocols = useMemo(() => {
    const set = new Set<string>();
    for (const s of servers) if (s.protocol) set.add(normalizeProto(s.protocol));
    return Array.from(set);
  }, [servers]);

  const matches = (s: Server) => {
    if (query) {
      const q = query.toLowerCase();
      if (!s.name.toLowerCase().includes(q) && !s.country.toLowerCase().includes(q)) return false;
    }
    if (protoFilter !== "all" && normalizeProto(s.protocol ?? "") !== protoFilter) return false;
    return true;
  };

  const pinnedFirst = <T extends { pinned?: boolean }>(items: T[]): T[] => [
    ...items.filter((x) => x.pinned),
    ...items.filter((x) => !x.pinned),
  ];

  const orderedFolders = useMemo(
    () => pinnedFirst(folderStore.folders),
    [folderStore.folders]
  );

  const partitionByPin = (items: Server[]): Server[] => {
    const savedById = new Map<string, SavedServer>(
      allSavedServers.map((s) => [s.id, s])
    );
    const pinned: Server[] = [];
    const rest: Server[] = [];
    for (const s of items) {
      if (savedById.get(s.id)?.pinned) pinned.push(s);
      else rest.push(s);
    }
    return [...pinned, ...rest];
  };

  const groupedFolders = useMemo(() => {
    const byId = new Map<string, Server>(servers.map((s) => [s.id, s]));
    return orderedFolders.map((f) => {
      const items = f.serverIds
        .map((sid) => byId.get(sid))
        .filter((x): x is Server => !!x);
      return { folder: f, items: partitionByPin(items) };
    });
  }, [orderedFolders, servers, allSavedServers]);

  const looseServers = useMemo(() => {
    const inFolder = new Set<string>();
    for (const f of folderStore.folders)
      for (const id of f.serverIds) inFolder.add(id);
    const items = servers.filter((s) => !inFolder.has(s.id));
    return partitionByPin(items);
  }, [folderStore.folders, servers, allSavedServers]);

  return (
    <div className="w-full h-full flex flex-col rounded-2xl bg-gradient-to-b from-white/[0.04] to-white/[0.015] border border-white/[0.07] p-4">
      <div className="flex items-center gap-2 mb-3">
        <div className="flex items-center gap-2 shrink-0">
          <div className="w-8 h-8 rounded-lg bg-accent-soft border border-accent-soft grid place-items-center">
            <ServerIcon size={17} className="text-accent-300" />
          </div>
          <div className="text-[15px] font-semibold text-white">Серверы</div>
          <div className="text-[13px] text-white/45 px-1.5 py-0.5 rounded-md bg-white/[0.04] border border-white/5 font-mono">
            {servers.length}
          </div>
        </div>

        {protocols.length > 1 ? (
          <div className="flex items-center gap-0.5 p-0.5 rounded-lg bg-white/[0.04] border border-white/[0.06] mx-2 flex-1 min-w-0 overflow-x-auto scroll-thin">
            <ProtoChip
              label="Все"
              active={protoFilter === "all"}
              onClick={() => setProtoFilter("all")}
              stretch
            />
            {protocols.map((p) => (
              <ProtoChip
                key={p}
                label={PROTO_LABEL[p] ?? p.toUpperCase()}
                active={protoFilter === p}
                onClick={() => setProtoFilter(p)}
                stretch
              />
            ))}
          </div>
        ) : (
          <div className="flex-1" />
        )}

        <div className="flex items-center gap-1 shrink-0">
          <div className="flex items-center gap-1.5 px-2.5 h-8 rounded-lg bg-white/[0.04] border border-white/5">
            <Search size={15} className="text-white/45" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Поиск…"
              className="bg-transparent outline-none text-[13.5px] w-24 placeholder:text-white/30 text-white/90"
            />
          </div>
          <IconBtn
            icon={FolderPlus}
            onClick={() => setFolderDlgOpen(true)}
            title="Создать папку"
          />
          <IconBtn
            icon={Plus}
            highlight
            onClick={() => setAddOpen("subscription")}
            title="Добавить подписку"
          />
          <IconBtn
            icon={RefreshCw}
            onClick={pingAllServers}
            disabled={pingingAllGlobal || servers.length === 0}
            spinning={pingingAllGlobal}
            title={
              pingingAllGlobal
                ? "Пингуем все серверы…"
                : "Пинговать все серверы"
            }
          />
        </div>
      </div>

      <AddServerDialog
        open={addOpen !== false}
        onClose={() => setAddOpen(false)}
        initialTab={addOpen === "subscription" ? "subscription" : "uri"}
      />
      <CreateFolderDialog
        open={folderDlgOpen}
        onClose={() => setFolderDlgOpen(false)}
      />

      <div className="flex-1 min-h-0 overflow-y-auto scroll-thin pr-1 space-y-1.5">
      {query || protoFilter !== "all" ? (
        <div className="space-y-1.5">
          {groupedFolders.map(({ folder, items }) => {
            const isOpen = isFolderOpen(folder.id);
            const filtered = items.filter(matches);
            const sub = folder.subscriptionId
              ? subById.get(folder.subscriptionId)
              : undefined;
            return (
              <div key={folder.id}>
                <FolderHeader
                  folder={folder}
                  count={items.length}
                  isOpen={isOpen}
                  onToggle={() => toggleFolderClosed(folder.id)}
                  subscription={sub}
                  onPingAll={() => pingFolder(folder)}
                  pingingAll={pingingFolder.has(folder.id)}
                  onRefreshSub={sub ? () => refreshSubscription(sub) : undefined}
                  refreshingSub={sub ? refreshingSub.has(sub.id) : false}
                />
                {isOpen && (
                  <div
                    className={cn(
                      "pt-1 ml-[18px] pl-3 border-l-2",
                      folder.pinned
                        ? "border-amber-400/25"
                        : "border-accent-faint"
                    )}
                  >
                    {filtered.length === 0 ? (
                      <div className="text-[12px] text-white/35 px-2 py-1.5 pt-1">
                        Пусто — переместите сюда сервер из общего списка.
                      </div>
                    ) : (
                      <div className="space-y-1">
                        {filtered.map((s) => (
                          <ServerRow
                            key={s.id}
                            server={s}
                            selected={selectedId === s.id}
                            onSelect={() => onSelect(s.id)}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <Reorder.Group
          axis="y"
          values={orderedFolders}
          onReorder={(next) => reorderFolders(next.map((f) => f.id))}
          className="space-y-1.5"
        >
          {groupedFolders.map(({ folder, items }) => {
            const isOpen = isFolderOpen(folder.id);
            const filtered = items.filter(matches);
            const sub = folder.subscriptionId
              ? subById.get(folder.subscriptionId)
              : undefined;
            return (
              <FolderReorderItem
                key={folder.id}
                folder={folder}
                count={items.length}
                isOpen={isOpen}
                onToggle={() => toggleFolderClosed(folder.id)}
                subscription={sub}
                onPingAll={() => pingFolder(folder)}
                pingingAll={pingingFolder.has(folder.id)}
                onRefreshSub={sub ? () => refreshSubscription(sub) : undefined}
                refreshingSub={sub ? refreshingSub.has(sub.id) : false}
              >
                <AnimatePresence initial={false}>
                  {isOpen && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{
                        height: { duration: 0.36, ease: [0.32, 0.72, 0, 1] },
                        opacity: { duration: 0.24, ease: [0.4, 0, 0.2, 1] },
                      }}
                      className="overflow-hidden"
                    >
                      <div
                        className={cn(
                          "pt-1 ml-[18px] pl-3 border-l-2",
                          folder.pinned
                            ? "border-amber-400/25"
                            : "border-accent-faint"
                        )}
                      >
                        <Reorder.Group
                          axis="y"
                          values={filtered}
                          onReorder={(next) =>
                            reorderFolderServers(
                              folder.id,
                              next.map((s) => s.id)
                            )
                          }
                          className="space-y-1"
                        >
                          {filtered.map((s) => (
                            <ServerReorderItem
                              key={s.id}
                              server={s}
                              selected={selectedId === s.id}
                              onSelect={() => onSelect(s.id)}
                            />
                          ))}
                        </Reorder.Group>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </FolderReorderItem>
            );
          })}
        </Reorder.Group>
      )}

      {looseServers.filter(matches).length > 0 &&
        (query || protoFilter !== "all" ? (
          // Same reasoning as the per-folder list above: skip the
          // Reorder.Group while the user is filtering, otherwise every
          // keystroke triggers a `layout` animation that reflows the
          // visible rows.
          <div className="space-y-1.5">
            {looseServers.filter(matches).map((s) => (
              <ServerRow
                key={s.id}
                server={s}
                selected={selectedId === s.id}
                onSelect={() => onSelect(s.id)}
              />
            ))}
          </div>
        ) : (
          <Reorder.Group
            axis="y"
            values={looseServers.filter(matches)}
            onReorder={(next) => reorderLooseServers(next.map((s) => s.id))}
            className="space-y-1.5"
          >
            {looseServers.filter(matches).map((s) => (
              <ServerReorderItem
                key={s.id}
                server={s}
                selected={selectedId === s.id}
                onSelect={() => onSelect(s.id)}
              />
            ))}
          </Reorder.Group>
        ))}
      </div>
    </div>
  );
}

function FolderReorderItem({
  folder,
  count,
  isOpen,
  onToggle,
  subscription,
  onPingAll,
  pingingAll,
  onRefreshSub,
  refreshingSub,
  children,
}: {
  folder: FolderEntry;
  count: number;
  isOpen: boolean;
  onToggle: () => void;
  subscription?: Subscription;
  onPingAll: () => void;
  pingingAll: boolean;
  onRefreshSub?: () => void;
  refreshingSub?: boolean;
  children?: React.ReactNode;
}) {
  const controls = useDragControls();
  return (
    <Reorder.Item value={folder} dragListener={false} dragControls={controls} as="div">
      <FolderHeader
        folder={folder}
        count={count}
        isOpen={isOpen}
        onToggle={onToggle}
        subscription={subscription}
        onPingAll={onPingAll}
        pingingAll={pingingAll}
        onRefreshSub={onRefreshSub}
        refreshingSub={refreshingSub}
        dragControls={controls}
      />
      {children}
    </Reorder.Item>
  );
}

function ServerReorderItem({
  server,
  selected,
  onSelect,
}: {
  server: Server;
  selected: boolean;
  onSelect: () => void;
}) {
  const controls = useDragControls();
  return (
    <Reorder.Item value={server} dragListener={false} dragControls={controls} as="div">
      <ServerRow
        server={server}
        selected={selected}
        onSelect={onSelect}
        dragControls={controls}
      />
    </Reorder.Item>
  );
}

function FolderHeader({
  folder,
  count,
  isOpen,
  onToggle,
  subscription,
  onPingAll,
  pingingAll,
  onRefreshSub,
  refreshingSub,
  dragControls,
}: {
  folder: FolderEntry;
  count: number;
  isOpen: boolean;
  onToggle: () => void;
  subscription?: Subscription;
  onPingAll: () => void;
  pingingAll: boolean;
  onRefreshSub?: () => void;
  refreshingSub?: boolean;
  dragControls?: ReturnType<typeof useDragControls>;
}) {
  const removeFolder = useFolders((s) => s.remove);
  const renameFolder = useFolders((s) => s.rename);
  const setFolderDetails = useFolders((s) => s.setNameAndDescription);
  const togglePinned = useFolders((s) => s.togglePinned);
  const removeServer = useServers((s) => s.remove);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(folder.name);
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const performRemoveFolder = () => {
    if (subscription) {
      // Subscription folder: full purge so the entry doesn't keep haunting
      // the Profiles page (was the cause of bug 2 — "deleted folders /
      // servers stay in profile").
      deleteSubscriptionEverywhere(subscription.id);
      return;
    }
    // Standalone folder: drop the folder *and* the servers it contained.
    // Previously we left the servers behind as orphaned loose entries which
    // matched no user expectation — if you wanted to keep a server you
    // would drag it out of the folder first, not press the trash button.
    for (const id of folder.serverIds) removeServer(id);
    removeFolder(folder.id);
  };

  const askRemoveFolder = () => {
    const ask =
      useSettingsStore.getState().values["mint.confirmDelete"] !== false;
    if (ask) setConfirmDelete(true);
    else performRemoveFolder();
  };

  const used =
    (subscription?.uploadBytes ?? 0) + (subscription?.downloadBytes ?? 0);
  const total = subscription?.totalBytes ?? 0;
  const remaining = Math.max(0, total - used);
  const pct =
    subscription && total > 0
      ? Math.min(100, Math.round((used / total) * 100))
      : null;
  const expireText = subscription?.expiresAt
    ? expireShort(subscription.expiresAt)
    : null;

  const commit = () => {
    if (draft.trim() && draft.trim() !== folder.name) {
      renameFolder(folder.id, draft.trim());
    }
    setEditing(false);
  };

  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(null);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    const id = window.setTimeout(() => {
      window.addEventListener("mousedown", close);
      window.addEventListener("blur", close);
      window.addEventListener("keydown", onKey);
    }, 0);
    return () => {
      window.clearTimeout(id);
      window.removeEventListener("mousedown", close);
      window.removeEventListener("blur", close);
      window.removeEventListener("keydown", onKey);
    };
  }, [menu]);

  return (
    <div
      className={cn(
        "w-full flex items-center gap-3 px-3 h-12 rounded-lg transition-colors border group cursor-pointer",
        folder.pinned
          ? "bg-amber-500/[0.06] border-amber-400/15 hover:bg-amber-500/[0.09]"
          : "bg-white/[0.02] border-white/[0.04] hover:bg-white/[0.05] hover:border-white/[0.08]"
      )}
      onClick={editing ? undefined : onToggle}
      onContextMenu={(e) => {
        e.preventDefault();
        e.stopPropagation();
        if (editing) return;
        const W = 200, H = 140, margin = 8;
        const x = Math.min(e.clientX, window.innerWidth - W - margin);
        const y = Math.min(e.clientY, window.innerHeight - H - margin);
        setMenu({ x, y });
      }}
    >
      {dragControls && (
        <button
          onPointerDown={(e) => {
            e.stopPropagation();
            dragControls.start(e);
          }}
          onClick={(e) => e.stopPropagation()}
          title="Перетащить"
          className="shrink-0 -ml-1 mr-0.5 cursor-grab active:cursor-grabbing text-white/30 hover:text-white/70 transition opacity-0 group-hover:opacity-100"
        >
          <GripVertical size={14} />
        </button>
      )}
      <motion.div
        animate={{ rotate: isOpen ? 90 : 0 }}
        transition={{ duration: 0.32, ease: [0.32, 0.72, 0, 1] }}
        className="shrink-0"
      >
        <ChevronRight size={16} className="text-white/40" />
      </motion.div>
      {folder.pinned ? (
        <Pin
          size={16}
          className="text-amber-300 fill-amber-300/30 shrink-0"
        />
      ) : (
        <Folder size={18} className="text-accent-300 shrink-0" />
      )}
      {editing ? (
        <input
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onClick={(e) => e.stopPropagation()}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") commit();
            if (e.key === "Escape") {
              setDraft(folder.name);
              setEditing(false);
            }
          }}
          className="text-[14px] text-white/90 bg-white/[0.05] border border-white/10 rounded px-1.5 py-0.5 outline-none w-[220px] shrink-0"
        />
      ) : (
        <div className="flex flex-col leading-tight min-w-0 shrink-0 max-w-[220px]">
          <span className="text-[14px] text-white/85 font-medium truncate">
            {folder.name}
          </span>
          {folder.description && (
            <span
              className="text-[11.5px] text-white/45 truncate"
              title={folder.description}
            >
              {folder.description}
            </span>
          )}
        </div>
      )}

      {subscription ? (
        <div
          className="flex-1 min-w-[88px] relative h-7 rounded-md bg-white/[0.06] ring-1 ring-inset ring-white/[0.04] overflow-hidden"
          title={
            pct !== null
              ? `Осталось ${fmtBytes(remaining)} из ${fmtBytes(total)} (использовано ${pct.toFixed(1)}%)`
              : `Использовано ${fmtBytes(used)}`
          }
        >
          {pct !== null ? (
            <div
              className="absolute inset-y-0 left-0 transition-all bg-accent-medium"
              style={{ width: `${pct}%` }}
            />
          ) : (
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-[rgba(var(--accent-rgb),0.2)] to-transparent" />
          )}
          <div className="absolute inset-0 flex items-center justify-center px-2.5 min-w-0">
            <span className="text-[11.5px] font-mono tabular-nums text-white/90 truncate">
              {pct !== null
                ? `${fmtBytes(remaining)} / ${fmtBytes(total)}`
                : fmtBytes(used)}
            </span>
          </div>
        </div>
      ) : (
        <div className="flex-1" />
      )}

      <div className="flex items-center gap-1 shrink-0">
        {expireText ? (
          <span
            className="hidden md:inline-block text-[12px] text-white/55 font-mono mr-1 shrink-0 min-w-[72px] text-right"
            title="Срок действия подписки"
          >
            {expireText}
          </span>
        ) : (
          <span className="hidden md:inline-block min-w-[72px]" />
        )}

        <span
          className="text-[13px] font-mono shrink-0 min-w-[32px] text-center text-white/55"
          title="Серверов в папке"
        >
          {count > 0 ? count : "—"}
        </span>

        <button
          onClick={(e) => {
            e.stopPropagation();
            onPingAll();
          }}
          title={
            pingingAll
              ? "Пингуем…"
              : "Пропинговать все"
          }
          disabled={pingingAll || count === 0}
          className={cn(
            "transition w-8 h-8 grid place-items-center rounded-md hover:bg-white/5 text-white/55 hover:text-white",
            // Always visible. Hiding it behind hover used to confuse
            // users into pressing the global "Пинговать всё" button
            // (which sweeps every folder) instead of a single
            // subscription's worth of servers, and made it look
            // like the per-folder sweep didn't exist at all.
            pingingAll ? "opacity-100 cursor-default" : "opacity-100"
          )}
        >
          <Activity size={16} className={pingingAll ? "animate-pulse" : undefined} />
        </button>

        {onRefreshSub && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onRefreshSub();
            }}
            title={refreshingSub ? "Обновляем…" : "Обновить подписку"}
            disabled={refreshingSub}
            className={cn(
              "transition w-8 h-8 grid place-items-center rounded-md hover:bg-white/5 text-white/55 hover:text-white",
              refreshingSub
                ? "opacity-100 cursor-default"
                : "opacity-0 group-hover:opacity-100"
            )}
          >
            <RefreshCw
              size={16}
              className={refreshingSub ? "animate-spin" : undefined}
            />
          </button>
        )}

        <button
          onClick={(e) => {
            e.stopPropagation();
            setDraft(folder.name);
            setEditing(true);
          }}
          title="Переименовать"
          className="opacity-0 group-hover:opacity-100 transition w-8 h-8 grid place-items-center rounded-md hover:bg-white/5 text-white/55 hover:text-white"
        >
          <Edit2 size={16} />
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            askRemoveFolder();
          }}
          title={subscription ? "Удалить подписку" : "Удалить папку"}
          className="opacity-0 group-hover:opacity-100 transition w-8 h-8 grid place-items-center rounded-md hover:bg-white/5 text-white/55 hover:text-rose-300"
        >
          <Trash2 size={16} />
        </button>
      </div>

      {menu &&
        createPortal(
          <motion.div
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
            onContextMenu={(e) => e.preventDefault()}
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.12, ease: "easeOut" }}
            style={{
              position: "fixed",
              left: menu.x,
              top: menu.y,
              zIndex: 1000,
              transformOrigin: "top left",
            }}
            className="w-[200px] rounded-lg border border-white/10 bg-ink-900/95 backdrop-blur-md shadow-2xl py-1 text-[13px] select-none"
          >
            <MenuItem
              icon={ChevronRight}
              label={isOpen ? "Свернуть" : "Развернуть"}
              onClick={() => {
                setMenu(null);
                onToggle();
              }}
            />
            <MenuItem
              icon={Activity}
              label={
                pingingAll
                  ? "Пингуем…"
                  : "Пропинговать все"
              }
              disabled={pingingAll || count === 0}
              onClick={() => {
                setMenu(null);
                onPingAll();
              }}
            />
            {onRefreshSub && (
              <MenuItem
                icon={RefreshCw}
                label={refreshingSub ? "Обновляем…" : "Обновить подписку"}
                disabled={!!refreshingSub}
                onClick={() => {
                  setMenu(null);
                  onRefreshSub();
                }}
              />
            )}
            <MenuItem
              icon={Edit2}
              label="Переименовать"
              onClick={() => {
                setMenu(null);
                setDraft(folder.name);
                setEditing(true);
              }}
            />
            <MenuItem
              icon={FileText}
              label="Имя и описание"
              onClick={() => {
                setMenu(null);
                setDetailsOpen(true);
              }}
            />
            <MenuItem
              icon={folder.pinned ? PinOff : Pin}
              label={folder.pinned ? "Открепить" : "Закрепить наверху"}
              onClick={() => {
                setMenu(null);
                togglePinned(folder.id);
              }}
            />
            <MenuItem
              icon={Copy}
              label={
                subscription
                  ? "Скопировать ссылку подписки"
                  : "Скопировать все ссылки"
              }
              disabled={subscription ? !subscription.url : count === 0}
              onClick={() => {
                setMenu(null);
                if (subscription) {
                  // For a subscription folder the user almost always
                  // wants to share / re-import the *subscription URL*
                  // itself, not the dozens of per-server URIs it
                  // currently expands to. Copying the per-server list
                  // also leaks short-lived UUIDs/credentials that the
                  // subscription rotates on its own schedule, which
                  // the user usually didn't intend to share.
                  if (subscription.url) {
                    navigator.clipboard
                      .writeText(subscription.url)
                      .catch(() => undefined);
                  }
                  return;
                }
                const all = useServers.getState().servers;
                const uris = folder.serverIds
                  .map((id) => all.find((s) => s.id === id)?.address)
                  .filter(Boolean)
                  .join("\n");
                if (uris) navigator.clipboard.writeText(uris).catch(() => undefined);
              }}
            />
            <div className="my-1 border-t border-white/5" />
            <MenuItem
              icon={Trash2}
              label={subscription ? "Удалить подписку" : "Удалить папку"}
              danger
              onClick={() => {
                setMenu(null);
                askRemoveFolder();
              }}
            />
          </motion.div>,
          document.body
        )}

      <EditDetailsDialog
        open={detailsOpen}
        title="Папка: имя и описание"
        initialName={folder.name}
        initialDescription={folder.description}
        namePlaceholder="Название папки"
        onSave={(n, d) => setFolderDetails(folder.id, n, d)}
        onClose={() => setDetailsOpen(false)}
      />

      <ConfirmDialog
        open={confirmDelete}
        title={subscription ? "Удалить подписку?" : "Удалить папку?"}
        description={
          subscription
            ? `Подписка «${folder.name}» и все ${count > 0 ? `${count} ` : ""}серверов внутри будут удалены. Это действие нельзя отменить.`
            : `Папка «${folder.name}» и все ${count > 0 ? `${count} ` : ""}серверов внутри будут удалены. Это действие нельзя отменить.`
        }
        confirmLabel="Удалить"
        destructive
        onConfirm={() => {
          performRemoveFolder();
          setConfirmDelete(false);
        }}
        onCancel={() => setConfirmDelete(false)}
      />
    </div>
  );
}

function IconBtn({
  icon: Icon,
  highlight,
  onClick,
  title,
  disabled,
  spinning,
}: {
  icon: React.ComponentType<{ size?: number; className?: string }>;
  highlight?: boolean;
  onClick?: () => void;
  title?: string;
  disabled?: boolean;
  spinning?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      type="button"
      disabled={disabled}
      className={cn(
        "w-8 h-8 rounded-lg grid place-items-center transition border shrink-0",
        highlight
          ? "bg-accent-soft border-accent-soft text-accent-300 hover:bg-accent-medium"
          : "bg-white/[0.04] border-white/5 text-white/55 hover:text-white hover:bg-white/[0.07]",
        disabled && "opacity-40 cursor-not-allowed hover:text-white/55"
      )}
    >
      <Icon size={16} className={spinning ? "animate-spin" : undefined} />
    </button>
  );
}

function ServerRow({
  server,
  selected,
  onSelect,
  dragControls,
}: {
  server: Server;
  selected: boolean;
  onSelect: () => void;
  dragControls?: ReturnType<typeof useDragControls>;
}) {
  const removeServer = useServers((s) => s.remove);
  const setPing = useServers((s) => s.setPing);
  const renameServer = useServers((s) => s.rename);
  const setServerDetails = useServers((s) => s.setNameAndDescription);
  const toggleFavorite = useServers((s) => s.toggleFavorite);
  const togglePinnedServer = useServers((s) => s.togglePinned);
  const savedServer = useServers((s) => s.servers.find((x) => x.id === server.id));
  const isFavorite = !!savedServer?.favorite;
  const isPinned = !!savedServer?.pinned;
  const folders = useFolders((s) => s.folders);
  const moveServer = useFolders((s) => s.move);
  const unindexFromFolder = useFolders((s) => s.unindex);
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuPos, setMenuPos] = useState<{ left: number; top: number } | null>(null);
  const [pinging, setPinging] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draftName, setDraftName] = useState(server.name);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [createFolderOpen, setCreateFolderOpen] = useState(false);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const moreBtnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const performDelete = () => {
    unindexFromFolder(server.id);
    removeServer(server.id);
  };
  const askDelete = () => {
    const ask =
      useSettingsStore.getState().values["mint.confirmDelete"] !== false;
    if (ask) setConfirmDeleteOpen(true);
    else performDelete();
  };

  useEffect(() => {
    if (!editing) setDraftName(server.name);
  }, [server.name, editing]);

  const commitRename = () => {
    const t = draftName.trim();
    if (t && t !== server.name) renameServer(server.id, t);
    setEditing(false);
  };

  // When the user opts into `mint.pingMode = "ping"` (default), the
  // row for the *connected* server mirrors the dashboard "Пинг" card
  // — i.e. the one-RTT tunnel ping — instead of its own direct probe.
  // For every other row (and for the connected row when the user
  // picked `"ms"`), we keep showing the direct-probe number that the
  // sweep / per-row ping button last measured. This is what the user
  // wanted: when connected, both surfaces agree on a single number.
  const [pingMode] = useSetting<string>("mint.pingMode", "ping");
  const tunnelPing = useConnection((s) => s.tunnelPing);
  const connState = useConnection((s) => s.state);
  const useTunnelPing =
    pingMode === "ping" &&
    selected &&
    connState === "connected" &&
    tunnelPing != null;
  // `> 0` was the pre-0.3.26 check, but TCP probe legitimately
  // returns 0 (or 1) for very nearby endpoints. The real signal of
  // "no measurement yet" is `ping == null`. The "ping spoofed by
  // TUN" case is now filtered upstream in probeServer.
  const displayedPing = useTunnelPing ? tunnelPing : server.ping;
  const measured = displayedPing != null;
  const pingColor = !measured
    ? "text-white/40"
    : displayedPing < 60
      ? "text-emerald-300"
      : displayedPing < 120
        ? "text-amber-300"
        : "text-rose-300";
  const sigLevel = !measured
    ? 0
    : displayedPing < 60
      ? 4
      : displayedPing < 120
        ? 3
        : displayedPing < 180
          ? 2
          : displayedPing < 300
            ? 1
            : 0;
  const sigColor =
    sigLevel >= 3
      ? "bg-emerald-400"
      : sigLevel === 2
        ? "bg-amber-400"
        : sigLevel === 1
          ? "bg-orange-400"
          : "bg-white/15";

  const doPing = async () => {
    if (!savedServer || pinging) return;
    setPinging(true);
    try {
      const ms = await probeServer(savedServer);
      if (ms === PROBE_SKIP_WRITE) return;
      setPing(server.id, ms);
    } catch {
      setPing(server.id, null);
    } finally {
      setPinging(false);
      // After a per-row ping the user expects the row to slide
      // into its "right" place relative to neighbours. Without
      // this nothing visibly changes — the new ping number lights
      // up but the row doesn't move, which is what shipped in
      // 0.3.31 and is what the user reported as "не сортирует".
      sortBucketContaining(server.id);
    }
  };

  const currentFolder =
    folders.find((f) => f.serverIds.includes(server.id)) ?? null;

  const [origin, setOrigin] = useState<"button" | "context">("button");

  const placeMenu = () => {
    const btn = moreBtnRef.current;
    if (!btn) return null;
    const r = btn.getBoundingClientRect();
    const W = 240;
    const margin = 8;
    const estH =
      24 +
      32 +
      22 +
      Math.max(folders.length, 1) * 32 +
      (currentFolder ? 32 : 0) +
      9 +
      32 +
      4;
    const left = Math.max(
      margin,
      Math.min(r.right - W, window.innerWidth - W - margin)
    );
    let top = r.bottom + 6;
    if (top + estH > window.innerHeight - margin) {
      top = Math.max(margin, window.innerHeight - estH - margin);
    }
    return { left, top };
  };

  const placeAt = (x: number, y: number) => {
    const W = 240;
    const estH = 24 + 32 + 22 + Math.max(folders.length, 1) * 32 + (currentFolder ? 32 : 0) + 9 + 32 + 4;
    const margin = 8;
    const left = Math.max(margin, Math.min(x, window.innerWidth - W - margin));
    const top = Math.max(margin, Math.min(y, window.innerHeight - estH - margin));
    return { left, top };
  };

  const reposition = () => {
    const btn = moreBtnRef.current;
    const menu = menuRef.current;
    if (!btn) return;
    const r = btn.getBoundingClientRect();
    const W = menu?.offsetWidth || 240;
    const H = menu?.offsetHeight || 0;
    const margin = 8;
    const left = Math.max(
      margin,
      Math.min(r.right - W, window.innerWidth - W - margin)
    );
    let top = r.bottom + 6;
    if (H && top + H > window.innerHeight - margin) {
      top = Math.max(margin, window.innerHeight - H - margin);
    }
    setMenuPos((prev) =>
      prev && prev.left === left && prev.top === top ? prev : { left, top }
    );
  };

  const openMenu = () => {
    const initial = placeMenu();
    if (!initial) return;
    setOrigin("button");
    setMenuPos(initial);
    setMenuOpen(true);
  };

  const openMenuAt = (x: number, y: number) => {
    setOrigin("context");
    setMenuPos(placeAt(x, y));
    setMenuOpen(true);
  };

  useLayoutEffect(() => {
    if (!menuOpen) return;
    if (origin !== "button") return;
    reposition();
    const onScroll = () => reposition();
    const onResize = () => reposition();
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onResize);
    };
  }, [menuOpen, origin, folders.length]);

  useEffect(() => {
    if (!menuOpen) return;
    const close = () => setMenuOpen(false);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    const id = window.setTimeout(() => {
      window.addEventListener("mousedown", close);
      window.addEventListener("blur", close);
      window.addEventListener("keydown", onKey);
    }, 0);
    return () => {
      window.clearTimeout(id);
      window.removeEventListener("mousedown", close);
      window.removeEventListener("blur", close);
      window.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  return (
    <motion.div
      onClick={onSelect}
      onContextMenu={(e) => {
        e.preventDefault();
        e.stopPropagation();
        openMenuAt(e.clientX, e.clientY);
      }}
      className={cn(
        "group relative w-full flex items-center gap-3 px-3 h-12 rounded-lg transition-colors border text-left cursor-pointer",
        selected
          ? "bg-accent-soft border-accent-soft shadow-[inset_0_0_24px_rgba(var(--accent-rgb),0.15)]"
          : isPinned
            ? "bg-amber-500/[0.06] border-amber-400/15 hover:bg-amber-500/[0.09]"
            : "bg-white/[0.02] border-white/[0.04] hover:bg-white/[0.05] hover:border-white/[0.08]"
      )}
    >
      {dragControls && (
        <button
          onPointerDown={(e) => {
            e.stopPropagation();
            dragControls.start(e);
          }}
          onClick={(e) => e.stopPropagation()}
          title="Перетащить"
          className="shrink-0 -ml-1 cursor-grab active:cursor-grabbing text-white/30 hover:text-white/70 transition opacity-0 group-hover:opacity-100"
        >
          <GripVertical size={14} />
        </button>
      )}
      <Flag flag={server.flag} country={server.country} size={28} />
      {isPinned ? (
        <Pin size={14} className="text-amber-300 fill-amber-300/30" />
      ) : server.premium ? (
        <Crown size={15} className="text-amber-300" />
      ) : (
        <Zap size={15} className="text-accent-300" />
      )}
      {editing ? (
        <input
          autoFocus
          value={draftName}
          onChange={(e) => setDraftName(e.target.value)}
          onClick={(e) => e.stopPropagation()}
          onBlur={commitRename}
          onKeyDown={(e) => {
            if (e.key === "Enter") commitRename();
            if (e.key === "Escape") {
              setDraftName(server.name);
              setEditing(false);
            }
          }}
          className="text-[14px] text-white/90 bg-white/[0.05] border border-white/10 rounded px-1.5 py-0.5 outline-none flex-1 min-w-0"
        />
      ) : (
        <div className="flex flex-col leading-tight min-w-0">
          <span className="text-[14px] text-white/90 font-medium truncate">
            {server.name || server.country}
          </span>
          {savedServer?.description ? (
            <span
              className="text-[11.5px] text-white/45 truncate"
              title={savedServer.description}
            >
              {savedServer.description}
            </span>
          ) : server.city ? (
            <span className="text-[11.5px] text-white/40 truncate">
              {server.city}
            </span>
          ) : null}
        </div>
      )}

      <div className="ml-auto flex items-center gap-3">
        <button
          onClick={(e) => {
            e.stopPropagation();
            toggleFavorite(server.id);
          }}
          title={isFavorite ? "Убрать из избранного" : "В избранное"}
          className={cn(
            "w-7 h-7 grid place-items-center rounded-md transition",
            isFavorite
              ? "text-amber-300 hover:bg-amber-500/10"
              : "text-white/30 hover:text-white/70 hover:bg-white/5"
          )}
        >
          <Star
            size={14}
            className={isFavorite ? "fill-amber-300 drop-shadow-[0_0_6px_rgba(252,211,77,0.55)]" : ""}
          />
        </button>
        <div
          className="flex items-end gap-[3px] h-4 shrink-0"
          title={
            !measured
              ? "Пинг ещё не измерен"
              : `Сигнал: ${displayedPing}ms`
          }
        >
          {[0.35, 0.55, 0.75, 1].map((h, i) => (
            <div
              key={i}
              className={cn(
                "w-[4px] rounded-sm transition-colors",
                i < sigLevel ? sigColor : "bg-white/10"
              )}
              style={{ height: `${h * 100}%` }}
            />
          ))}
        </div>
        <div
          className={cn(
            "text-[13.5px] font-mono w-14 text-right",
            pingColor
          )}
          title={undefined}
        >
          {pinging ? "…" : measured ? `${displayedPing}ms` : "n/a"}
        </div>
        <button
          ref={moreBtnRef}
          onClick={(e) => {
            e.stopPropagation();
            if (menuOpen) {
              setMenuOpen(false);
            } else {
              openMenu();
            }
          }}
          className="w-8 h-8 grid place-items-center rounded-md hover:bg-white/5 text-white/55 hover:text-white"
        >
          <MoreHorizontal size={17} />
        </button>
      </div>

      {menuOpen && menuPos &&
        createPortal(
          <motion.div
            ref={menuRef}
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
            onContextMenu={(e) => e.preventDefault()}
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.12, ease: "easeOut" }}
            style={{
              position: "fixed",
              left: menuPos.left,
              top: menuPos.top,
              zIndex: 1000,
              transformOrigin: origin === "button" ? "top right" : "top left",
            }}
            className="w-[240px] rounded-lg border border-white/10 bg-ink-900/95 backdrop-blur-md shadow-2xl py-1 text-[13px] select-none"
          >
            <MenuItem
              icon={RefreshCw}
              iconClassName={pinging ? "animate-spin" : undefined}
              label={pinging ? "Пингую…" : "Пинговать"}
              onClick={() => {
                setMenuOpen(false);
                doPing();
              }}
              disabled={pinging}
            />
            <MenuItem
              icon={Copy}
              label="Скопировать ссылку"
              onClick={() => {
                setMenuOpen(false);
                if (savedServer?.address) {
                  navigator.clipboard.writeText(savedServer.address).catch(() => undefined);
                }
              }}
            />
            <MenuItem
              icon={Edit2}
              label="Переименовать"
              onClick={() => {
                setMenuOpen(false);
                setDraftName(server.name);
                setEditing(true);
              }}
            />
            <MenuItem
              icon={FileText}
              label="Имя и описание"
              onClick={() => {
                setMenuOpen(false);
                setDetailsOpen(true);
              }}
            />
            <MenuItem
              icon={isPinned ? PinOff : Pin}
              label={isPinned ? "Открепить" : "Закрепить наверху"}
              onClick={() => {
                setMenuOpen(false);
                togglePinnedServer(server.id);
              }}
            />
            <MenuDivider label="Переместить" />
            {folders.map((f) => (
              <MenuItem
                key={f.id}
                icon={Folder}
                label={f.name}
                checked={currentFolder?.id === f.id}
                onClick={() => {
                  moveServer(server.id, f.id);
                  setMenuOpen(false);
                }}
              />
            ))}
            {currentFolder && (
              <MenuItem
                icon={FolderMinus}
                label="Убрать из папки"
                onClick={() => {
                  unindexFromFolder(server.id);
                  setMenuOpen(false);
                }}
              />
            )}
            {folders.length === 0 && (
              <MenuItem
                icon={FolderPlus}
                label="Создать папку…"
                onClick={() => {
                  setMenuOpen(false);
                  setCreateFolderOpen(true);
                }}
              />
            )}
            <div className="my-1 border-t border-white/5" />
            <MenuItem
              icon={Trash2}
              label="Удалить"
              danger
              onClick={() => {
                setMenuOpen(false);
                askDelete();
              }}
            />
          </motion.div>,
          document.body
        )}

      <ConfirmDialog
        open={confirmDeleteOpen}
        title="Удалить сервер?"
        description={`Сервер «${server.name}» будет удалён из списка.`}
        confirmLabel="Удалить"
        destructive
        onConfirm={() => {
          performDelete();
          setConfirmDeleteOpen(false);
        }}
        onCancel={() => setConfirmDeleteOpen(false)}
      />

      <EditDetailsDialog
        open={detailsOpen}
        title="Сервер: имя и описание"
        initialName={server.name}
        initialDescription={savedServer?.description}
        namePlaceholder="Название сервера"
        onSave={(n, d) => setServerDetails(server.id, n, d)}
        onClose={() => setDetailsOpen(false)}
      />

      <CreateFolderDialog
        open={createFolderOpen}
        onClose={() => setCreateFolderOpen(false)}
        onCreated={(fid) => moveServer(server.id, fid)}
      />
    </motion.div>
  );
}

function MenuItem({
  icon: Icon,
  label,
  onClick,
  danger,
  disabled,
  checked,
  iconClassName,
}: {
  icon: React.ComponentType<{ size?: number; className?: string }>;
  label: string;
  onClick: () => void;
  danger?: boolean;
  disabled?: boolean;
  checked?: boolean;
  iconClassName?: string;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "w-full flex items-center gap-2 px-3 h-8 transition text-left",
        disabled
          ? "text-white/30 cursor-not-allowed"
          : danger
            ? "text-rose-300 hover:bg-rose-500/10"
            : "text-white/85 hover:bg-white/[0.06]"
      )}
    >
      <Icon
        size={13}
        className={cn(disabled ? "opacity-50" : "", iconClassName)}
      />
      <span className="flex-1 truncate">{label}</span>
      {checked && (
        <FolderInput size={11} className="text-accent-300 shrink-0" />
      )}
    </button>
  );
}

function MenuDivider({ label }: { label: string }) {
  return (
    <div className="px-3 pt-2 pb-1 text-[10.5px] uppercase tracking-wider text-white/35">
      {label}
    </div>
  );
}

function ProtoChip({
  label,
  active,
  onClick,
  stretch,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  stretch?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "relative px-2.5 h-6 rounded-md text-[11.5px] font-medium transition leading-none select-none",
        stretch && "flex-1 min-w-0",
        active ? "text-white" : "text-white/55 hover:text-white"
      )}
    >
      {active && (
        <motion.span
          layoutId="serversProtoChip"
          transition={{ type: "spring", stiffness: 380, damping: 30 }}
          className="absolute inset-0 bg-accent-medium border border-accent-soft rounded-md"
        />
      )}
      <span className="relative">{label}</span>
    </button>
  );
}
