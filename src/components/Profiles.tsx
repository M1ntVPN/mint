import { useMemo, useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Plus,
  Search,
  Trash2,
  Pencil,
  Star,
  Globe,
  ArrowDownUp,
  Check,
  X,
  Power,
  Edit2,
  Copy,
} from "lucide-react";
import { cn } from "../utils/cn";
import { useServers, type SavedServer } from "../store/servers";
import { useSubscriptions, type Subscription } from "../store/subscriptions";
import { Flag } from "./Flag";
import { ConfirmDialog } from "./ConfirmDialog";
import { AddServerDialog } from "./AddServerDialog";
import { EditDetailsDialog } from "./EditDetailsDialog";
import { probeServer, PROBE_SKIP_WRITE } from "../utils/ping";
import { useFolders } from "../store/folders";
import {
  refreshSubscription as runRefreshSubscription,
  deleteSubscriptionEverywhere,
} from "../utils/refreshSubscription";
import {
  sortAllByPing,
  sortBucketContaining,
} from "../utils/sortByPing";
import { useConnection } from "../store/connection";
import { useSettingsStore } from "../store/settings";
import {
  ChevronDown,
  RefreshCw,
  FolderOpen,
  Trash,
  HelpCircle,
  ExternalLink,
} from "lucide-react";
import type { ConnState } from "../types";

type SortKey = "added-desc" | "added-asc" | "ping-asc" | "name-asc" | "favorite";

const SORTS: { key: SortKey; label: string }[] = [
  { key: "added-desc", label: "Сначала новые" },
  { key: "added-asc", label: "Сначала старые" },
  { key: "ping-asc", label: "По пингу" },
  { key: "name-asc", label: "По имени" },
  { key: "favorite", label: "Избранные" },
];

interface ProfilesPageProps {
  pendingDeepLink?: string | null;
  consumeDeepLink?: () => void;
  // Atomic select-and-connect handler from <App>. We don't expose `setSelectedId`
  // / `toggle` separately because using them sequentially races with React's
  // state batching and reconnects to the *previous* selection.
  onConnectTo?: (id: string) => void;
  state?: ConnState;
  selectedId?: string | null;
}

// Open a subscription-supplied URL (support / web page) in the
// user's default browser via tauri-plugin-shell. Refuses anything
// that isn't http(s) so a hostile subscription server can't get the
// user to open `file://`, `vbscript:`, or other surprise schemes.
async function openSubscriptionLink(url: string): Promise<void> {
  try {
    if (!/^https?:\/\//i.test(url)) return;
    const { open } = await import("@tauri-apps/plugin-shell");
    await open(url);
  } catch {
  }
}

function parseInstallConfigUrl(deepLink: string): string | null {
  try {
    const u = new URL(deepLink);
    const sub = u.searchParams.get("url");
    return sub && sub.startsWith("http") ? sub : null;
  } catch {
    return null;
  }
}

export function ProfilesPage({
  pendingDeepLink,
  consumeDeepLink,
  onConnectTo,
  state,
  selectedId,
}: ProfilesPageProps = {}) {
  const servers = useServers((s) => s.servers);
  const removeServer = useServers((s) => s.remove);
  const renameServer = useServers((s) => s.rename);
  const toggleFav = useServers((s) => s.toggleFavorite);
  const setPing = useServers((s) => s.setPing);
  const pingAll = useServers((s) => s.pingAll);

  const subs = useSubscriptions((s) => s.list);

  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortKey>("added-desc");
  const [protoFilter, setProtoFilter] = useState<string>("all");
  const collapsedProfileIds = useFolders((st) => st.collapsedProfileIds);
  const toggleProfileCollapsed = useFolders((st) => st.toggleProfileCollapsed);
  const [refreshingSub, setRefreshingSub] = useState<string | null>(null);
  const [pingingAll, setPingingAll] = useState(false);
  const [pingingId, setPingingId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [addInitial, setAddInitial] = useState<{
    tab?: "uri" | "manual" | "file" | "subscription";
    uri?: string;
    subUrl?: string;
  }>({});
  const [contextMenu, setContextMenu] = useState<{
    id: string;
    x: number;
    y: number;
  } | null>(null);

  useEffect(() => {
    if (!pendingDeepLink) return;
    const link = pendingDeepLink;
    const subUrl = parseInstallConfigUrl(link);
    if (subUrl) {
      setAddInitial({ tab: "subscription", subUrl });
    } else if (/^https?:\/\//i.test(link)) {
      setAddInitial({ tab: "subscription", subUrl: link });
    } else if (
      /^(vless|vmess|trojan|ss|hiddify|wireguard):\/\//i.test(link)
    ) {
      setAddInitial({ tab: "uri", uri: link });
    } else {
      setAddInitial({ tab: "uri", uri: link });
    }
    setAddOpen(true);
    consumeDeepLink?.();
  }, [pendingDeepLink, consumeDeepLink]);

  const pendingDelete = useMemo(
    () => servers.find((s) => s.id === confirmDeleteId) ?? null,
    [confirmDeleteId, servers]
  );

  const requestDelete = (id: string) => {
    const confirmDelete =
      useSettingsStore.getState().values["mint.confirmDelete"] !== false;
    if (!confirmDelete) {
      useFolders.getState().unindex(id);
      removeServer(id);
      return;
    }
    setConfirmDeleteId(id);
  };

  const probe = async (s: SavedServer) => probeServer(s);
  const sweepProbe = async (s: SavedServer) =>
    probeServer(s, { attempts: 2, timeoutMs: 3000 });
  const folders = useFolders((st) => st.folders);
  const setFolderDetails = useFolders((st) => st.setNameAndDescription);
  const [editFolderId, setEditFolderId] = useState<string | null>(null);
  const vpnActive = useConnection((st) => st.state === "connected");

  const protocolCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const s of servers) m.set(s.protocol, (m.get(s.protocol) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [servers]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    let out = servers.filter((s) => {
      if (protoFilter !== "all" && s.protocol !== protoFilter) return false;
      if (!q) return true;
      return (
        s.name.toLowerCase().includes(q) ||
        (s.country?.toLowerCase().includes(q) ?? false) ||
        (s.city?.toLowerCase().includes(q) ?? false) ||
        s.protocol.toLowerCase().includes(q) ||
        s.address.toLowerCase().includes(q)
      );
    });
    switch (sort) {
      case "added-desc":
        out = [...out].sort((a, b) => b.addedAt - a.addedAt);
        break;
      case "added-asc":
        out = [...out].sort((a, b) => a.addedAt - b.addedAt);
        break;
      case "ping-asc":
        out = [...out].sort(
          (a, b) => (a.ping ?? Number.POSITIVE_INFINITY) - (b.ping ?? Number.POSITIVE_INFINITY)
        );
        break;
      case "name-asc":
        out = [...out].sort((a, b) => a.name.localeCompare(b.name));
        break;
      case "favorite":
        out = [...out].sort(
          (a, b) => Number(!!b.favorite) - Number(!!a.favorite)
        );
        break;
    }
    return out;
  }, [servers, query, sort, protoFilter]);

  useEffect(() => {
    if (!contextMenu) return;
    const close = () => setContextMenu(null);
    window.addEventListener("click", close);
    window.addEventListener("blur", close);
    return () => {
      window.removeEventListener("click", close);
      window.removeEventListener("blur", close);
    };
  }, [contextMenu]);

  const handlePing = async (s: SavedServer) => {
    setPingingId(s.id);
    try {
      const ms = await probe(s);
      if (ms === PROBE_SKIP_WRITE) return;
      setPing(s.id, ms);
    } catch {
      setPing(s.id, null);
    } finally {
      setPingingId(null);
      // Same reasoning as the per-row ping in <ServersList>: a freshly
      // measured row should slide into its right place. Persisting the
      // sort to folder.serverIds (rather than just the local Profiles
      // sort key) means switching to the dashboard immediately after
      // shows the same sorted order — they were drifting apart in
      // 0.3.31.
      sortBucketContaining(s.id);
    }
  };

  const handlePingAll = async () => {
    setPingingAll(true);
    try {
      await pingAll(sweepProbe);
      // After a fresh sweep the user almost always wants to compare
      // hops by latency — flip the sort so the lowest-ping server
      // floats to the top automatically. Without this they had to
      // open the sort menu and click "По пингу" by hand every time.
      setSort("ping-asc");
      // Persist the sort to every folder.serverIds + the loose
      // bucket so the dashboard shows the same order on next visit.
      sortAllByPing();
    } finally {
      setPingingAll(false);
    }
  };

  const refreshSubscription = async (sub: Subscription) => {
    setRefreshingSub(sub.id);
    try {
      await runRefreshSubscription(sub);
    } finally {
      setRefreshingSub(null);
    }
  };

  const deleteSubscription = (sub: Subscription) => {
    deleteSubscriptionEverywhere(sub.id);
  };

  const toggleCollapsed = (id: string) => toggleProfileCollapsed(id);

  const subBuckets = useMemo(() => {
    const m = new Map<string, SavedServer[]>();
    const standalone: SavedServer[] = [];
    for (const s of filtered) {
      if (s.subscriptionId) {
        const arr = m.get(s.subscriptionId) ?? [];
        arr.push(s);
        m.set(s.subscriptionId, arr);
      } else {
        standalone.push(s);
      }
    }
    return { bySub: m, standalone };
  }, [filtered]);

  return (
    <div className="p-6 h-full overflow-y-auto scroll-thin">
      <PageHeader
        title="Серверы"
        subtitle={`Сохранённые узлы — ${servers.length}`}
        cta="Добавить"
        onCta={() => setAddOpen(true)}
      />
      <AddServerDialog
        open={addOpen}
        onClose={() => {
          setAddOpen(false);
          setAddInitial({});
        }}
        initialTab={addInitial.tab}
        initialUri={addInitial.uri}
        initialSubUrl={addInitial.subUrl}
      />

      <div className="mt-5 flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[220px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Поиск по имени, стране, протоколу…"
            className="w-full h-10 pl-9 pr-3 rounded-xl bg-white/[0.04] border border-white/[0.06] text-[14px] text-white placeholder:text-white/35 focus:outline-none focus:border-[rgba(var(--accent-rgb),0.4)] transition"
          />
        </div>

        <SortMenu sort={sort} setSort={setSort} />

        {protocolCounts.length > 1 && (
          <ProtoChips
            value={protoFilter}
            onChange={setProtoFilter}
            counts={protocolCounts}
            total={servers.length}
          />
        )}

        <motion.button
          whileTap={{ scale: 0.97 }}
          onClick={handlePingAll}
          disabled={pingingAll}
          className={cn(
            "h-10 px-4 rounded-xl flex items-center gap-2 text-[14px] font-medium border transition",
            pingingAll
              ? "bg-emerald-400/10 text-emerald-300/70 border-emerald-400/20 cursor-wait"
              : "bg-white/[0.04] hover:bg-white/[0.08] text-white border-white/[0.06]"
          )}
        >
          <RefreshCw size={15} className={pingingAll ? "animate-spin" : ""} />
          {pingingAll ? "Пингуем…" : "Пинговать всё"}
        </motion.button>
      </div>

      <div className="mt-4 space-y-3">
        {subs.map((sub) => {
          const items = subBuckets.bySub.get(sub.id) ?? [];
          const collapsed = collapsedProfileIds.includes(sub.id);
          return (
            <SubscriptionFolder
              key={sub.id}
              sub={sub}
              items={items}
              collapsed={collapsed}
              folderName={
                folders.find((f) => f.subscriptionId === sub.id)?.name
              }
              folderDescription={
                folders.find((f) => f.subscriptionId === sub.id)?.description
              }
              onToggle={() => toggleCollapsed(sub.id)}
              onRefresh={() => refreshSubscription(sub)}
              onDelete={() => deleteSubscription(sub)}
              onEdit={() => {
                const f = folders.find((x) => x.subscriptionId === sub.id);
                if (f) setEditFolderId(f.id);
              }}
              refreshing={refreshingSub === sub.id}
              renderRow={(s, i) => (
                <ServerRow
                  key={s.id}
                  server={s}
                  index={i}
                  editing={editingId === s.id}
                  pinging={pingingId === s.id || pingingAll}
                  onEditStart={() => setEditingId(s.id)}
                  onEditCommit={(name) => {
                    renameServer(s.id, name);
                    setEditingId(null);
                  }}
                  onEditCancel={() => setEditingId(null)}
                  onDelete={() => requestDelete(s.id)}
                  onFav={() => toggleFav(s.id)}
                  onPing={() => handlePing(s)}
                  onContext={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setContextMenu({ id: s.id, x: e.clientX, y: e.clientY });
                  }}
                />
              )}
            />
          );
        })}

        <div className="grad-border p-0 overflow-hidden">
          {subBuckets.standalone.length === 0 && subs.length === 0 ? (
            <EmptyState query={query} />
          ) : subBuckets.standalone.length === 0 ? null : (
            <div className="divide-y divide-white/[0.04]">
              <AnimatePresence initial={false}>
                {subBuckets.standalone.map((s, i) => (
                  <ServerRow
                    key={s.id}
                    server={s}
                    index={i}
                    editing={editingId === s.id}
                    pinging={pingingId === s.id || pingingAll}
                    onEditStart={() => setEditingId(s.id)}
                    onEditCommit={(name) => {
                      renameServer(s.id, name);
                      setEditingId(null);
                    }}
                    onEditCancel={() => setEditingId(null)}
                    onDelete={() => requestDelete(s.id)}
                    onFav={() => toggleFav(s.id)}
                    onPing={() => handlePing(s)}
                    onContext={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setContextMenu({ id: s.id, x: e.clientX, y: e.clientY });
                    }}
                  />
                ))}
              </AnimatePresence>
            </div>
          )}
        </div>
      </div>

      <AnimatePresence>
        {contextMenu && (
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: -4 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96 }}
            transition={{ duration: 0.12 }}
            style={{ left: contextMenu.x, top: contextMenu.y }}
            className="fixed z-50 min-w-[180px] rounded-xl bg-ink-900/95 border border-white/[0.06] shadow-[0_30px_60px_-20px_rgba(0,0,0,0.7)] backdrop-blur-xl py-1.5"
          >
            {(() => {
              const isCurrent =
                vpnActive && selectedId === contextMenu.id;
              const label = isCurrent
                ? "Текущий сервер"
                : vpnActive
                  ? "Переподключиться сюда"
                  : state === "connecting" || state === "disconnecting"
                    ? "Подождите…"
                    : "Подключиться";
              const disabled =
                isCurrent ||
                state === "connecting" ||
                state === "disconnecting";
              return (
                <ContextItem
                  icon={Power}
                  label={label}
                  disabled={disabled}
                  onClick={() => {
                    const id = contextMenu.id;
                    setContextMenu(null);
                    if (disabled) return;
                    onConnectTo?.(id);
                  }}
                />
              );
            })()}
            <ContextItem
              icon={RefreshCw}
              label="Пинговать"
              onClick={() => {
                const s = servers.find((x) => x.id === contextMenu.id);
                if (s) handlePing(s);
                setContextMenu(null);
              }}
            />
            <ContextItem
              icon={Pencil}
              label="Переименовать"
              onClick={() => {
                setEditingId(contextMenu.id);
                setContextMenu(null);
              }}
            />
            <ContextItem
              icon={Star}
              label="В избранное"
              onClick={() => {
                toggleFav(contextMenu.id);
                setContextMenu(null);
              }}
            />
            <ContextItem
              icon={Copy}
              label="Скопировать ссылку"
              onClick={() => {
                const s = servers.find((x) => x.id === contextMenu.id);
                if (s?.address) {
                  navigator.clipboard.writeText(s.address).catch(() => undefined);
                }
                setContextMenu(null);
              }}
            />
            <div className="h-px bg-white/[0.05] my-1" />
            <ContextItem
              icon={Trash2}
              label="Удалить"
              danger
              onClick={() => {
                requestDelete(contextMenu.id);
                setContextMenu(null);
              }}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {(() => {
        const f = folders.find((x) => x.id === editFolderId);
        return (
          <EditDetailsDialog
            open={editFolderId !== null && !!f}
            title="Папка: имя и описание"
            initialName={f?.name ?? ""}
            initialDescription={f?.description ?? ""}
            namePlaceholder="Название папки"
            onSave={(name, description) => {
              if (editFolderId)
                setFolderDetails(editFolderId, name, description);
              setEditFolderId(null);
            }}
            onClose={() => setEditFolderId(null)}
          />
        );
      })()}

      <ConfirmDialog
        open={pendingDelete !== null}
        title={
          pendingDelete
            ? `Удалить «${pendingDelete.name}»?`
            : "Удалить сервер?"
        }
        description={
          pendingDelete
            ? `Сервер ${pendingDelete.country ?? ""} ${pendingDelete.city ? "· " + pendingDelete.city : ""} будет навсегда удалён из списка. Это действие нельзя отменить.`.trim()
            : undefined
        }
        confirmLabel="Удалить"
        cancelLabel="Отмена"
        destructive
        onConfirm={() => {
          if (confirmDeleteId) {
            useFolders.getState().unindex(confirmDeleteId);
            removeServer(confirmDeleteId);
          }
          setConfirmDeleteId(null);
        }}
        onCancel={() => setConfirmDeleteId(null)}
      />
    </div>
  );
}

function ContextItem({
  icon: Icon,
  label,
  onClick,
  danger,
  disabled,
}: {
  icon: React.ComponentType<{ size?: number }>;
  label: string;
  onClick: () => void;
  danger?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      className={cn(
        "w-full flex items-center gap-2.5 px-3 h-8 text-[13.5px] transition",
        disabled
          ? "text-white/35 cursor-not-allowed"
          : danger
            ? "text-rose-300 hover:bg-rose-500/10"
            : "text-white/85 hover:bg-white/[0.05]"
      )}
    >
      <Icon size={13} />
      {label}
    </button>
  );
}

function SubscriptionFolder({
  sub,
  items,
  collapsed,
  refreshing,
  folderName,
  folderDescription,
  onToggle,
  onRefresh,
  onDelete,
  onEdit,
  renderRow,
}: {
  sub: Subscription;
  items: SavedServer[];
  collapsed: boolean;
  refreshing: boolean;
  folderName?: string;
  folderDescription?: string;
  onToggle: () => void;
  onRefresh: () => void;
  onDelete: () => void;
  onEdit: () => void;
  renderRow: (s: SavedServer, i: number) => React.ReactNode;
}) {
  const used = (sub.uploadBytes ?? 0) + (sub.downloadBytes ?? 0);
  const total = sub.totalBytes ?? 0;
  const remaining = Math.max(0, total - used);
  const pct = total > 0 ? Math.min(100, Math.round((used / total) * 100)) : null;
  const expireText = sub.expiresAt ? expireRelative(sub.expiresAt) : null;
  return (
    <div className="grad-border p-0 overflow-hidden">
      <div
        className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-white/[0.025] transition group"
        onClick={onToggle}
      >
        <motion.span
          animate={{ rotate: collapsed ? -90 : 0 }}
          transition={{ duration: 0.32, ease: [0.32, 0.72, 0, 1] }}
          className="text-white/45 grid place-items-center"
        >
          <ChevronDown size={17} />
        </motion.span>
        <div className="w-9 h-9 rounded-lg bg-accent-soft border border-accent-soft grid place-items-center text-accent shrink-0">
          <FolderOpen size={17} />
        </div>
        <div className="flex flex-col leading-tight min-w-0 flex-1">
          <span className="text-[13.5px] font-semibold text-white truncate">
            {folderName || sub.name}
          </span>
          {folderDescription && (
            <span
              className="text-[11.5px] text-white/55 truncate"
              title={folderDescription}
            >
              {folderDescription}
            </span>
          )}
          <span className="text-[11.5px] text-white/45 flex items-center gap-2">
            <span>{items.length} {pluralServers(items.length)}</span>
            {expireText && <span className="text-white/30">·</span>}
            {expireText && <span>{expireText}</span>}
            {sub.syncedAt && <span className="text-white/30">·</span>}
            {sub.syncedAt && (
              <span>обновлено {timeAgo(sub.syncedAt)}</span>
            )}
          </span>
        </div>

        {pct !== null && (
          <div
            className="hidden md:flex flex-col items-end gap-1 mr-1.5"
            title={`Использовано ${fmtBytes(used)} из ${fmtBytes(total)} (${pct}%)`}
          >
            <span className="text-[11px] text-white/55 tabular-nums font-mono">
              {fmtBytes(remaining)} / {fmtBytes(total)}
            </span>
            <div className="w-32 h-1.5 rounded-full bg-white/[0.07] overflow-hidden">
              <div
                className="h-full transition-all bg-[rgba(var(--accent-rgb),0.6)]"
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
        )}

        <button
          onClick={(e) => {
            e.stopPropagation();
            onEdit();
          }}
          title="Имя и описание"
          className="opacity-0 group-hover:opacity-100 transition w-9 h-9 grid place-items-center rounded-md text-white/65 hover:text-white hover:bg-white/[0.07]"
        >
          <Edit2 size={16} />
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            const uris = items.map((s) => s.address).filter(Boolean).join("\n");
            if (uris) navigator.clipboard.writeText(uris).catch(() => undefined);
          }}
          title="Скопировать все ссылки"
          className="opacity-0 group-hover:opacity-100 transition w-9 h-9 grid place-items-center rounded-md text-white/65 hover:text-white hover:bg-white/[0.07]"
        >
          <Copy size={16} />
        </button>
        {sub.supportUrl && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              openSubscriptionLink(sub.supportUrl!);
            }}
            title={`Поддержка — ${sub.supportUrl}`}
            className="opacity-0 group-hover:opacity-100 transition w-9 h-9 grid place-items-center rounded-md text-white/65 hover:text-white hover:bg-white/[0.07]"
          >
            <HelpCircle size={16} />
          </button>
        )}
        {sub.webPageUrl && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              openSubscriptionLink(sub.webPageUrl!);
            }}
            title={`Страница подписки — ${sub.webPageUrl}`}
            className="opacity-0 group-hover:opacity-100 transition w-9 h-9 grid place-items-center rounded-md text-white/65 hover:text-white hover:bg-white/[0.07]"
          >
            <ExternalLink size={16} />
          </button>
        )}
        <button
          onClick={(e) => {
            e.stopPropagation();
            onRefresh();
          }}
          disabled={refreshing}
          title="Обновить"
          className="opacity-0 group-hover:opacity-100 transition w-9 h-9 grid place-items-center rounded-md text-white/65 hover:text-white hover:bg-white/[0.07]"
        >
          <RefreshCw
            size={16}
            className={refreshing ? "animate-spin" : undefined}
          />
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          title="Удалить подписку"
          className="opacity-0 group-hover:opacity-100 transition w-9 h-9 grid place-items-center rounded-md text-white/55 hover:text-rose-300 hover:bg-rose-300/10"
        >
          <Trash size={16} />
        </button>
      </div>

      {sub.lastError && (
        <div className="px-4 pb-2 text-[11.5px] text-rose-300/85">
          ⚠ {sub.lastError}
        </div>
      )}

      <AnimatePresence initial={false}>
        {!collapsed && (
          <motion.div
            key="sub-folder-body"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{
              height: { duration: 0.36, ease: [0.32, 0.72, 0, 1] },
              opacity: { duration: 0.24, ease: [0.4, 0, 0.2, 1] },
            }}
            className="overflow-hidden"
          >
            {items.length > 0 ? (
              <div className="divide-y divide-white/[0.04] border-t border-white/[0.04]">
                <AnimatePresence initial={false}>
                  {items.map((s, i) => renderRow(s, i))}
                </AnimatePresence>
              </div>
            ) : (
              <div className="px-4 pb-3 pt-1 text-[12px] text-white/40 italic border-t border-white/[0.04]">
                Нет серверов в подписке
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function pluralServers(n: number) {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return "сервер";
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return "сервера";
  return "серверов";
}

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

function expireRelative(unix: number): string {
  const ms = unix * 1000 - Date.now();
  if (ms <= 0) return "истекло";
  const days = Math.floor(ms / 86400000);
  if (days >= 1) return `${days} дн. до сброса`;
  const hours = Math.floor(ms / 3600000);
  return `${hours} ч до сброса`;
}

function timeAgo(unix: number): string {
  const ms = Date.now() - unix;
  const min = Math.floor(ms / 60000);
  if (min < 1) return "только что";
  if (min < 60) return `${min} мин назад`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h} ч назад`;
  const d = Math.floor(h / 24);
  return `${d} дн назад`;
}

function ProtoChips({
  value,
  onChange,
  counts,
  total,
}: {
  value: string;
  onChange: (v: string) => void;
  counts: [string, number][];
  total: number;
}) {
  const items: { key: string; label: string; n: number }[] = [
    { key: "all", label: "Все", n: total },
    ...counts.map(([k, n]) => ({ key: k, label: k.toUpperCase(), n })),
  ];
  return (
    <div className="flex p-1 rounded-xl bg-white/[0.04] border border-white/[0.06] h-10">
      {items.map((it) => {
        const active = value === it.key;
        return (
          <button
            key={it.key}
            onClick={() => onChange(it.key)}
            className={cn(
              "relative px-3 h-8 rounded-lg text-[12.5px] font-medium transition flex items-center gap-1.5",
              active ? "text-white" : "text-white/55 hover:text-white"
            )}
          >
            {active && (
              <motion.span
                layoutId="protoChip"
                transition={{ type: "spring", stiffness: 380, damping: 32 }}
                className="absolute inset-0 rounded-lg bg-accent-soft border border-accent-soft"
              />
            )}
            <span className="relative">{it.label}</span>
            <span
              className={cn(
                "relative text-[11px] tabular-nums px-1.5 py-0 rounded-md font-mono",
                active
                  ? "bg-white/15 text-white"
                  : "bg-white/[0.05] text-white/55"
              )}
            >
              {it.n}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function SortMenu({
  sort,
  setSort,
}: {
  sort: SortKey;
  setSort: (s: SortKey) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("mousedown", close);
    return () => window.removeEventListener("mousedown", close);
  }, [open]);

  const current = SORTS.find((s) => s.key === sort);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="h-10 px-3 rounded-xl flex items-center gap-2 text-[14px] text-white/85 bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.06] transition"
      >
        <ArrowDownUp size={13} />
        {current?.label}
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -4, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.98 }}
            transition={{ duration: 0.12 }}
            className="absolute right-0 mt-1.5 z-40 min-w-[200px] rounded-xl bg-ink-900/95 border border-white/[0.06] shadow-[0_20px_40px_-12px_rgba(0,0,0,0.7)] backdrop-blur-xl py-1.5"
          >
            {SORTS.map((s) => (
              <button
                key={s.key}
                onClick={() => {
                  setSort(s.key);
                  setOpen(false);
                }}
                className={cn(
                  "w-full flex items-center justify-between px-3 h-8 text-[13.5px] transition",
                  sort === s.key
                    ? "text-accent-300 bg-accent-soft"
                    : "text-white/80 hover:bg-white/[0.05]"
                )}
              >
                {s.label}
                {sort === s.key && <Check size={13} />}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function ServerRow({
  server,
  index,
  editing,
  pinging,
  onEditStart,
  onEditCommit,
  onEditCancel,
  onDelete,
  onFav,
  onPing,
  onContext,
}: {
  server: SavedServer;
  index: number;
  editing: boolean;
  pinging: boolean;
  onEditStart: () => void;
  onEditCommit: (name: string) => void;
  onEditCancel: () => void;
  onDelete: () => void;
  onFav: () => void;
  onPing: () => void;
  onContext: (e: React.MouseEvent) => void;
}) {
  const [draft, setDraft] = useState(server.name);
  useEffect(() => setDraft(server.name), [server.name, editing]);
  const inputRef = useRef<HTMLInputElement | null>(null);
  useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editing]);

  const ping = server.ping;
  const pingColor =
    ping == null
      ? "text-white/40"
      : ping < 60
        ? "text-emerald-300"
        : ping < 120
          ? "text-amber-300"
          : "text-rose-300";

  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: 56 }}
      exit={{ opacity: 0, height: 0, scale: 0.97 }}
      transition={{
        type: "spring",
        stiffness: 380,
        damping: 32,
        mass: 0.7,
        delay: Math.min(index * 0.018, 0.16),
      }}
      onContextMenu={onContext}
      className="group relative flex items-center gap-3 px-4 h-14 hover:bg-white/[0.025] transition-colors overflow-hidden"
    >
      <Flag flag={server.flag} country={server.country} size={28} />

      <div className="flex flex-col leading-tight min-w-[180px]">
        <AnimatePresence mode="wait" initial={false}>
          {editing ? (
            <motion.input
              key="edit"
              ref={inputRef}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") onEditCommit(draft.trim() || server.name);
                if (e.key === "Escape") onEditCancel();
              }}
              onBlur={() => onEditCommit(draft.trim() || server.name)}
              initial={{ opacity: 0, y: -3 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 3 }}
              transition={{ duration: 0.16 }}
              className="bg-white/[0.06] rounded-md px-2 py-0.5 text-[14px] text-white outline-none border border-accent-soft w-[210px]"
            />
          ) : (
            <motion.span
              key="label"
              initial={{ opacity: 0, y: 3 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -3 }}
              transition={{ duration: 0.16 }}
              className="text-[14px] text-white/95 font-medium flex items-center gap-1.5"
            >
              {server.name}
              <AnimatePresence>
                {server.favorite && (
                  <motion.span
                    key="fav"
                    initial={{ opacity: 0, scale: 0.4, rotate: -30 }}
                    animate={{ opacity: 1, scale: 1, rotate: 0 }}
                    exit={{ opacity: 0, scale: 0.4, rotate: 30 }}
                    transition={{ type: "spring", stiffness: 600, damping: 18 }}
                    className="inline-flex"
                  >
                    <Star size={11} className="text-amber-300 fill-amber-300 drop-shadow-[0_0_6px_rgba(252,211,77,0.6)]" />
                  </motion.span>
                )}
              </AnimatePresence>
            </motion.span>
          )}
        </AnimatePresence>
        <span className="text-[12px] text-white/40 flex items-center gap-1.5">
          <span className="font-mono uppercase">{server.protocol}</span>
          {server.country && (
            <>
              <span className="w-1 h-1 rounded-full bg-white/20" />
              <Globe size={10} />
              <span>{server.country}</span>
            </>
          )}
        </span>
      </div>

      <div className="flex-1" />

      <div className="text-[12px] text-white/35 font-mono w-[88px] text-right">
        {formatRelative(server.addedAt)}
      </div>

      <div
        className={cn(
          "text-[13px] font-mono w-14 text-right",
          pingColor
        )}
        title={undefined}
      >
        {pinging ? (
          <span className="inline-flex items-center gap-1">
            <span className="w-1 h-1 rounded-full bg-current animate-pulse" />
            <span className="opacity-60">…</span>
          </span>
        ) : ping != null ? (
          `${ping}ms`
        ) : (
          "n/a"
        )}
      </div>

      <div className="flex items-center gap-0.5 opacity-60 group-hover:opacity-100 transition">
        <RowAction
          icon={RefreshCw}
          title="Пинговать"
          spinning={pinging}
          onClick={onPing}
        />
        <RowAction
          icon={Star}
          title={server.favorite ? "Убрать из избранного" : "В избранное"}
          active={!!server.favorite}
          onClick={onFav}
        />
        <RowAction
          icon={editing ? X : Pencil}
          title={editing ? "Отменить" : "Переименовать"}
          onClick={editing ? onEditCancel : onEditStart}
        />
        <RowAction icon={Trash2} title="Удалить" danger onClick={onDelete} />
      </div>
    </motion.div>
  );
}

function RowAction({
  icon: Icon,
  title,
  onClick,
  danger,
  active,
  spinning,
  disabled,
}: {
  icon: React.ComponentType<{ size?: number; className?: string }>;
  title: string;
  active?: boolean;
  onClick: () => void;
  danger?: boolean;
  spinning?: boolean;
  disabled?: boolean;
}) {
  return (
    <motion.button
      whileTap={disabled ? undefined : { scale: 0.85 }}
      whileHover={disabled ? undefined : { scale: 1.08 }}
      transition={{ type: "spring", stiffness: 500, damping: 20 }}
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      title={title}
      className={cn(
        "w-9 h-9 rounded-md grid place-items-center transition",
        disabled
          ? "text-white/25 cursor-not-allowed"
          : active
            ? "text-amber-300 bg-amber-400/10"
            : danger
              ? "text-white/55 hover:bg-rose-500/20 hover:text-rose-300"
              : "text-white/55 hover:text-white hover:bg-white/[0.06]"
      )}
    >
      <Icon
        size={17}
        className={cn(
          active ? "fill-amber-300" : undefined,
          spinning ? "animate-spin" : undefined
        )}
      />
    </motion.button>
  );
}

function EmptyState({ query }: { query: string }) {
  return (
    <div className="px-6 py-12 text-center">
      <div className="mx-auto mb-3 w-12 h-12 rounded-2xl bg-white/[0.04] grid place-items-center text-white/40">
        <Globe size={20} />
      </div>
      <div className="text-[14px] text-white/85 font-medium">
        {query ? "Ничего не найдено" : "Серверов пока нет"}
      </div>
      <div className="text-[13px] text-white/45 mt-1">
        {query
          ? "Попробуй другой запрос или измени фильтр"
          : "Добавь сервер вручную, импортируй из подписки или из файла"}
      </div>
    </div>
  );
}

export function PageHeader({
  title,
  subtitle,
  cta,
  onCta,
}: {
  title: string;
  subtitle?: string;
  cta?: string;
  onCta?: () => void;
}) {
  return (
    <div className="flex items-end justify-between select-none">
      <div>
        <h1 className="text-[26px] font-semibold tracking-tight text-white">{title}</h1>
        {subtitle && (
          <p className="text-[14px] text-white/45 mt-0.5">{subtitle}</p>
        )}
      </div>
      {cta && (
        <button
          onClick={onCta}
          className="flex items-center gap-2 h-10 px-4 rounded-xl bg-accent-grad shadow-accent-glow text-white text-[14px] font-medium hover:brightness-110 active:scale-[0.98] transition"
        >
          <Plus size={15} />
          {cta}
        </button>
      )}
    </div>
  );
}

function formatRelative(ts: number) {
  const diff = Date.now() - ts;
  const min = 60_000;
  const hour = 60 * min;
  const day = 24 * hour;
  if (diff < hour) return `${Math.max(1, Math.floor(diff / min))} мин назад`;
  if (diff < day) return `${Math.floor(diff / hour)} ч назад`;
  if (diff < 30 * day) return `${Math.floor(diff / day)} дн назад`;
  const d = new Date(ts);
  return `${d.getDate()}.${String(d.getMonth() + 1).padStart(2, "0")}.${d.getFullYear() % 100}`;
}
