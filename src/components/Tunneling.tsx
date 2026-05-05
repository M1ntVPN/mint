import { useState, useMemo, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Shield,
  ShieldOff,
  Split,
  Plus,
  Trash2,
  Globe,
  Info,
  Download,
  Activity,
  RefreshCw,
  Folder,
  FolderPlus,
  ChevronRight,
  Edit2,
  FolderMinus,
  MoreHorizontal,
  Check,
  Search,
  X,
} from "lucide-react";
import { createPortal } from "react-dom";
import { invoke } from "@tauri-apps/api/core";
import { cn } from "../utils/cn";
import { PageHeader } from "./Profiles";
import { Dropdown } from "./Dropdown";
import { brandFor } from "../utils/appBrand";
import { useTunneling, type AppRule, type AppFolder } from "../store/tunneling";
import { useSettingsStore } from "../store/settings";
import {
  getCachedIcon,
  prefetchIcons,
  subscribeIcons,
} from "../utils/exeIcons";
import { isMobile as isMobilePlatform } from "../utils/platform";
import { listInstalledApps, type InstalledApp as AndroidApp } from "../utils/vpn";

type Mode = "full" | "whitelist" | "blacklist";

type InstalledApp = { name: string; exe: string; path: string | null; key: string };
type RunningProc = {
  pid: number;
  name: string;
  exe: string;
  path: string | null;
  user_owned?: boolean;
};

const MODES: { key: Mode; label: string; short: string; icon: React.ComponentType<{ size?: number; className?: string }> }[] = [
  { key: "full", label: "Полный туннель", short: "Всё через VPN", icon: Shield },
  { key: "whitelist", label: "Только указанные", short: "Через VPN — только списки", icon: Split },
  { key: "blacklist", label: "Кроме указанных", short: "Всё через VPN, кроме списков", icon: ShieldOff },
];

function TunnelingMobile() {
  const mode = useTunneling((s) => s.mode);
  const setMode = useTunneling((s) => s.setMode);
  const apps = useTunneling((s) => s.apps);
  const flipApp = useTunneling((s) => s.flipApp);
  const removeApp = useTunneling((s) => s.removeApp);
  const addAppStore = useTunneling((s) => s.addApp);

  const [pickerOpen, setPickerOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [installedApps, setInstalledApps] = useState<AndroidApp[]>([]);
  const [loadingApps, setLoadingApps] = useState(false);

  const openPicker = async () => {
    setPickerOpen(true);
    setSearch("");
    if (installedApps.length === 0) {
      setLoadingApps(true);
      try {
        const list = await listInstalledApps();
        list.sort((a, b) => a.label.localeCompare(b.label));
        setInstalledApps(list);
      } catch (err) {
        console.warn("listInstalledApps failed", err);
      }
      setLoadingApps(false);
    }
  };

  const addedPkgs = useMemo(
    () => new Set(apps.map((a) => a.packageName).filter(Boolean)),
    [apps],
  );

  const filteredApps = useMemo(() => {
    const q = search.toLowerCase();
    return installedApps.filter(
      (a) =>
        !addedPkgs.has(a.packageName) &&
        (a.label.toLowerCase().includes(q) ||
          a.packageName.toLowerCase().includes(q)),
    );
  }, [installedApps, search, addedPkgs]);

  const addApp = (app: AndroidApp) => {
    addAppStore(
      { name: app.label, exe: app.packageName, packageName: app.packageName },
      mode === "whitelist" ? "vpn" : "bypass",
    );
  };

  const splitDisabled = mode === "full";

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <PageHeader title="Туннелирование" />

      <div className="px-4 py-3 flex gap-1 bg-white/[0.03] border-b border-white/5">
        {(["full", "whitelist", "blacklist"] as const).map((m) => (
          <button
            key={m}
            onClick={() => setMode(m)}
            className={cn(
              "flex-1 py-2 rounded-lg text-xs font-medium transition-colors",
              mode === m
                ? "bg-emerald-500/20 text-emerald-400 ring-1 ring-emerald-500/30"
                : "text-white/50 hover:text-white/70 hover:bg-white/5",
            )}
          >
            {m === "full" ? "Весь трафик" : m === "whitelist" ? "Только выбранные" : "Всё кроме выбранных"}
          </button>
        ))}
      </div>

      {!splitDisabled && (
        <div className="px-4 py-2 text-xs text-white/40">
          {mode === "whitelist"
            ? "Только добавленные приложения пойдут через VPN"
            : "Весь трафик через VPN, кроме добавленных приложений"}
        </div>
      )}

      {splitDisabled && (
        <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
          <Globe size={40} className="text-emerald-400/30 mb-3" />
          <p className="text-sm text-white/40">
            Весь трафик идёт через VPN. Переключи на «Только выбранные» или «Всё кроме выбранных», чтобы управлять приложениями.
          </p>
        </div>
      )}

      {!splitDisabled && (
        <>
          <div className="flex-1 overflow-y-auto">
            {apps.length === 0 && (
              <div className="flex flex-col items-center justify-center p-8 text-center h-full">
                <Split size={36} className="text-white/15 mb-3" />
                <p className="text-sm text-white/40 mb-4">Нет приложений</p>
              </div>
            )}
            {apps.map((app) => (
              <div
                key={app.id}
                className="flex items-center gap-3 px-4 py-3 border-b border-white/5"
              >
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-white/90 truncate">{app.name}</div>
                  <div className="text-[11px] text-white/35 truncate">{app.packageName || app.exe}</div>
                </div>
                <button
                  onClick={() => flipApp(app.id)}
                  className={cn(
                    "px-3 py-1 rounded-full text-[11px] font-medium transition-colors shrink-0",
                    app.via === "vpn"
                      ? "bg-emerald-500/20 text-emerald-400"
                      : "bg-amber-500/15 text-amber-400",
                  )}
                >
                  {app.via === "vpn" ? "VPN" : "Напрямую"}
                </button>
                <button
                  onClick={() => removeApp(app.id)}
                  className="p-1 text-white/25 hover:text-red-400 transition-colors shrink-0"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>

          <div className="p-4 border-t border-white/5">
            <button
              onClick={openPicker}
              className="w-full py-3 rounded-xl bg-emerald-500/15 text-emerald-400 text-sm font-medium hover:bg-emerald-500/25 transition-colors flex items-center justify-center gap-2"
            >
              <Plus size={16} />
              Добавить приложение
            </button>
          </div>
        </>
      )}

      {pickerOpen &&
        createPortal(
          <div
            className="fixed inset-0 z-[200] bg-black/70 flex flex-col"
            onClick={() => setPickerOpen(false)}
          >
            <div
              className="mt-auto bg-[#181a20] rounded-t-2xl max-h-[75vh] flex flex-col"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="px-4 pt-4 pb-2 flex items-center justify-between">
                <h3 className="text-base font-medium text-white/90">
                  Выберите приложение
                </h3>
                <button
                  onClick={() => setPickerOpen(false)}
                  className="p-1 text-white/40 hover:text-white"
                >
                  <X size={20} />
                </button>
              </div>
              <div className="px-4 pb-2">
                <div className="flex items-center gap-2 bg-white/5 rounded-lg px-3 py-2">
                  <Search size={14} className="text-white/30" />
                  <input
                    autoFocus
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Поиск приложений…"
                    className="flex-1 bg-transparent text-sm text-white/90 outline-none placeholder:text-white/25"
                  />
                </div>
              </div>
              <div className="flex-1 overflow-y-auto pb-safe">
                {loadingApps && (
                  <div className="flex items-center justify-center p-8 text-white/40 text-sm">
                    Загрузка…
                  </div>
                )}
                {!loadingApps && filteredApps.length === 0 && (
                  <div className="flex items-center justify-center p-8 text-white/40 text-sm">
                    {search ? "Ничего не найдено" : "Нет доступных приложений"}
                  </div>
                )}
                {filteredApps.map((app) => (
                  <button
                    key={app.packageName}
                    onClick={() => {
                      addApp(app);
                    }}
                    className="w-full flex items-center gap-3 px-4 py-3 hover:bg-white/5 transition-colors text-left"
                  >
                    {app.icon ? (
                      <img
                        src={app.icon}
                        alt=""
                        className="w-8 h-8 rounded-lg shrink-0"
                      />
                    ) : (
                      <div className="w-8 h-8 rounded-lg bg-white/10 shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="text-sm text-white/90 truncate">
                        {app.label}
                      </div>
                      <div className="text-[11px] text-white/35 truncate">
                        {app.packageName}
                      </div>
                    </div>
                    <Plus size={16} className="text-white/20 shrink-0" />
                  </button>
                ))}
              </div>
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}

export function TunnelingPage() {
  return isMobilePlatform() ? <TunnelingMobile /> : <TunnelingDesktop />;
}

function TunnelingDesktop() {
  const mode = useTunneling((s) => s.mode);
  const setMode = useTunneling((s) => s.setMode);
  const apps = useTunneling((s) => s.apps);
  const nets = useTunneling((s) => s.nets);
  const folders = useTunneling((s) => s.folders);
  const flipApp = useTunneling((s) => s.flipApp);
  const removeApp = useTunneling((s) => s.removeApp);
  const moveApp = useTunneling((s) => s.moveApp);
  const addAppStore = useTunneling((s) => s.addApp);
  const addNetStore = useTunneling((s) => s.addNet);
  const removeNet = useTunneling((s) => s.removeNet);
  const createFolder = useTunneling((s) => s.createFolder);
  const renameFolder = useTunneling((s) => s.renameFolder);
  const removeFolder = useTunneling((s) => s.removeFolder);

  const collapsedIds = useTunneling((s) => s.collapsedIds);
  const toggleCollapsed = useTunneling((s) => s.toggleCollapsed);

  const [newPattern, setNewPattern] = useState("");
  const [newVia, setNewVia] = useState<"vpn" | "bypass">("bypass");
  const [addAppOpen, setAddAppOpen] = useState(false);
  const [appQuery, setAppQuery] = useState("");
  const [targetFolderId, setTargetFolderId] = useState<string | null>(null);

  const addNet = () => {
    const p = newPattern.trim();
    if (!p) return;
    addNetStore(p, newVia);
    setNewPattern("");
  };

  const splitDisabled = mode === "full";

  const counts = useMemo(() => {
    const viaVpn = apps.filter((a) => a.via === "vpn").length;
    return { total: apps.length, vpn: viaVpn, direct: apps.length - viaVpn };
  }, [apps]);

  const grouped = useMemo(() => {
    const byFolder = new Map<string, AppRule[]>();
    const loose: AppRule[] = [];
    const folderIds = new Set(folders.map((f) => f.id));
    for (const a of apps) {
      if (a.folderId && folderIds.has(a.folderId)) {
        const arr = byFolder.get(a.folderId) ?? [];
        arr.push(a);
        byFolder.set(a.folderId, arr);
      } else {
        loose.push(a);
      }
    }
    return { byFolder, loose };
  }, [apps, folders]);

  const addApp = (entry: Omit<AppRule, "id" | "via" | "folderId">) => {
    addAppStore(
      entry,
      mode === "blacklist" ? "bypass" : "vpn",
      targetFolderId
    );
  };

  const openAddAppInto = (folderId: string | null) => {
    setTargetFolderId(folderId);
    setAddAppOpen(true);
  };

  const [textPrompt, setTextPrompt] = useState<{
    title: string;
    placeholder?: string;
    initial: string;
    confirmLabel: string;
    onOk: (value: string) => void;
  } | null>(null);
  const [confirmDialog, setConfirmDialog] = useState<{
    title: string;
    body: string;
    confirmLabel?: string;
    destructive?: boolean;
    onOk: () => void;
  } | null>(null);

  const newFolder = () => {
    setTextPrompt({
      title: "Новая папка",
      placeholder: "Название папки",
      initial: "",
      confirmLabel: "Создать",
      onOk: (name) => {
        const trimmed = name.trim();
        if (!trimmed) return;
        const id = createFolder(trimmed);
        setTargetFolderId(id);
      },
    });
  };

  const [folderScanState, setFolderScanState] = useState<
    | { kind: "idle" }
    | { kind: "scanning"; path: string }
    | { kind: "done"; path: string; added: number; skipped: number }
    | { kind: "error"; msg: string }
  >({ kind: "idle" });

  const pickFolderFromDisk = async () => {
    try {
      const dialog = await import("@tauri-apps/plugin-dialog");
      const picked = await dialog.open({
        multiple: false,
        directory: true,
        title: "Выбери папку с приложениями",
      });
      if (!picked || Array.isArray(picked)) return;
      const path = picked;
      const basename =
        path.split(/[\\/]/).filter(Boolean).pop() || "Папка";
      setFolderScanState({ kind: "scanning", path });
      const entries = await invoke<InstalledApp[]>("scan_folder_exes", {
        path,
      });
      if (entries.length === 0) {
        setFolderScanState({
          kind: "error",
          msg: `В «${basename}» не найдено исполняемых файлов`,
        });
        return;
      }
      const seen = new Set<string>();
      const unique = entries.filter((e) => {
        const k = e.key || e.exe.toLowerCase().replace(/\.exe$/, "");
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      });
      const folderId = createFolder(basename);
      const beforeCount = apps.length;
      for (const e of unique) {
        const brand = brandFor(e.name, e.exe);
        addAppStore(
          {
            name: e.name || e.exe,
            exe: e.exe,
            brand: brand.brand,
            brandColor: brand.brandColor,
            path: e.path ?? null,
          },
          mode === "blacklist" ? "bypass" : "vpn",
          folderId
        );
      }
      const finalApps = useTunneling.getState().apps;
      const added = Math.max(0, finalApps.length - beforeCount);
      setTargetFolderId(folderId);
      setFolderScanState({
        kind: "done",
        path,
        added,
        skipped: Math.max(0, unique.length - added),
      });
    } catch (e) {
      setFolderScanState({
        kind: "error",
        msg: typeof e === "string" ? e : "Не удалось отсканировать папку",
      });
    }
  };

  const confirmDeleteOn = () =>
    useSettingsStore.getState().values["mint.confirmDelete"] !== false;

  const askRemoveFolder = (folder: AppFolder) => {
    const items = grouped.byFolder.get(folder.id) ?? [];
    if (items.length === 0 || !confirmDeleteOn()) {
      removeFolder(folder.id);
      return;
    }
    setConfirmDialog({
      title: `Удалить папку «${folder.name}»?`,
      body: `Папка и все ${items.length} приложени${items.length === 1 ? "е" : items.length < 5 ? "я" : "й"} внутри будут удалены из списка туннелирования.`,
      confirmLabel: "Удалить",
      destructive: true,
      onOk: () => removeFolder(folder.id),
    });
  };

  const askRemoveApp = (id: string) => {
    if (!confirmDeleteOn()) {
      removeApp(id);
      return;
    }
    const a = apps.find((x) => x.id === id);
    setConfirmDialog({
      title: a ? `Удалить «${a.name}»?` : "Удалить правило?",
      body: "Правило приложения будет удалено из списка туннелирования.",
      confirmLabel: "Удалить",
      destructive: true,
      onOk: () => removeApp(id),
    });
  };

  const askRemoveNet = (id: string) => {
    if (!confirmDeleteOn()) {
      removeNet(id);
      return;
    }
    const n = nets.find((x) => x.id === id);
    setConfirmDialog({
      title: n ? `Удалить правило «${n.pattern}»?` : "Удалить правило?",
      body: "Правило сети будет удалено из списка туннелирования.",
      confirmLabel: "Удалить",
      destructive: true,
      onOk: () => removeNet(id),
    });
  };

  return (
    <div className="p-6 h-full overflow-y-auto">
      <PageHeader title="Туннелирование" />

      <div className="mt-5 flex p-1 rounded-2xl bg-white/[0.03] border border-white/[0.06]">
        {MODES.map((m) => {
          const Icon = m.icon;
          const active = mode === m.key;
          return (
            <button
              key={m.key}
              onClick={() => setMode(m.key)}
              className={cn(
                "relative flex-1 flex items-center justify-center gap-2 h-11 rounded-xl text-[13.5px] font-medium transition-colors",
                active ? "text-white" : "text-white/55 hover:text-white/80"
              )}
            >
              {active && (
                <motion.span
                  layoutId="tunnelMode"
                  transition={{ type: "spring", stiffness: 380, damping: 32 }}
                  className="absolute inset-0 rounded-xl bg-accent-soft border border-accent-soft"
                  style={{
                    backgroundImage:
                      "linear-gradient(90deg, rgba(var(--accent-rgb), 0.30), rgba(var(--accent-rgb), 0.15) 50%, transparent)",
                    boxShadow: "inset 0 0 18px rgba(var(--accent-rgb), 0.18)",
                  }}
                />
              )}
              <span className="relative flex items-center gap-2">
                <Icon size={15} />
                {m.label}
              </span>
            </button>
          );
        })}
      </div>

      {!splitDisabled ? (
        <>
          <div className="mt-6 flex flex-wrap items-end justify-between gap-3 mb-3">
            <div className="min-w-0 flex-1">
              <div className="text-[15px] font-semibold text-white">Приложения</div>
              <div className="text-[12.5px] text-white/45 mt-0.5">
                всего {counts.total} · через VPN — {counts.vpn} · напрямую — {counts.direct}
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
              <button
                onClick={pickFolderFromDisk}
                disabled={folderScanState.kind === "scanning"}
                className="h-10 px-3.5 whitespace-nowrap rounded-xl bg-white/[0.05] text-[14px] text-white/85 hover:text-white hover:bg-white/[0.09] transition flex items-center gap-2 disabled:opacity-60 shrink-0"
                title="Выбрать папку на диске — все .exe внутри попадут в одно правило"
              >
                {folderScanState.kind === "scanning" ? (
                  <RefreshCw size={14} className="animate-spin" />
                ) : (
                  <Folder size={14} />
                )}
                Папка с диска
              </button>
              <button
                onClick={() => openAddAppInto(null)}
                className="h-10 px-3.5 whitespace-nowrap rounded-xl bg-accent-grad shadow-accent-glow text-[14px] text-white font-medium hover:brightness-110 transition flex items-center gap-2 shrink-0"
              >
                <Plus size={14} />
                Добавить
              </button>
            </div>
          </div>

          {folderScanState.kind !== "idle" && (
            <div
              className={cn(
                "mb-3 px-3 py-2 rounded-lg text-[12.5px] flex items-center gap-2",
                folderScanState.kind === "error"
                  ? "bg-rose-500/10 border border-rose-400/25 text-rose-200"
                  : folderScanState.kind === "done"
                    ? "bg-emerald-500/10 border border-emerald-400/25 text-emerald-200"
                    : "bg-white/[0.04] border border-white/[0.08] text-white/70"
              )}
            >
              {folderScanState.kind === "scanning" && (
                <>
                  <RefreshCw size={13} className="animate-spin shrink-0" />
                  <span className="truncate">
                    Сканирую {folderScanState.path}…
                  </span>
                </>
              )}
              {folderScanState.kind === "done" && (
                <>
                  <Folder size={13} className="shrink-0" />
                  <span className="truncate">
                    Добавлено {folderScanState.added} из папки «
                    {folderScanState.path.split(/[\\/]/).filter(Boolean).pop()}»
                    {folderScanState.skipped > 0
                      ? ` (${folderScanState.skipped} уже были в списке)`
                      : ""}
                  </span>
                  <button
                    onClick={() => setFolderScanState({ kind: "idle" })}
                    className="ml-auto text-white/50 hover:text-white"
                  >
                    ✕
                  </button>
                </>
              )}
              {folderScanState.kind === "error" && (
                <>
                  <Info size={13} className="shrink-0" />
                  <span className="truncate">{folderScanState.msg}</span>
                  <button
                    onClick={() => setFolderScanState({ kind: "idle" })}
                    className="ml-auto text-white/50 hover:text-white"
                  >
                    ✕
                  </button>
                </>
              )}
            </div>
          )}

          <div className="space-y-2">
            {folders.map((folder) => {
              const items = grouped.byFolder.get(folder.id) ?? [];
              const isOpen = !collapsedIds.includes(folder.id);
              return (
                <FolderGroup
                  key={folder.id}
                  folder={folder}
                  apps={items}
                  mode={mode}
                  isOpen={isOpen}
                  allFolders={folders}
                  onToggle={() => toggleCollapsed(folder.id)}
                  onRename={(name) => renameFolder(folder.id, name)}
                  onDelete={() => askRemoveFolder(folder)}
                  onAddInto={() => openAddAppInto(folder.id)}
                  onFlip={flipApp}
                  onRemove={askRemoveApp}
                  onMove={moveApp}
                />
              );
            })}

            {(grouped.loose.length > 0 || folders.length === 0) && (
              <LooseGroup
                apps={grouped.loose}
                mode={mode}
                isOpen={!collapsedIds.includes("__loose__")}
                allFolders={folders}
                hasFolders={folders.length > 0}
                onToggle={() => toggleCollapsed("__loose__")}
                onFlip={flipApp}
                onRemove={askRemoveApp}
                onMove={moveApp}
              />
            )}
          </div>

          <div className="mt-7 mb-3">
            <div className="text-[15px] font-semibold text-white">Хосты и подсети</div>
          </div>

          <div className="grad-border p-4">
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Globe size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40" />
                <input
                  value={newPattern}
                  onChange={(e) => setNewPattern(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && addNet()}
                  placeholder="*.netflix.com   или   10.0.0.0/8"
                  className="w-full h-10 pl-9 pr-3 rounded-xl bg-white/[0.04] border border-white/[0.06] text-[13.5px] text-white placeholder:text-white/35 focus:outline-none focus:border-[rgba(var(--accent-rgb),0.4)] transition-colors"
                />
              </div>
              <Dropdown
                value={newVia}
                options={[
                  { value: "bypass", label: "напрямую" },
                  { value: "vpn", label: "через VPN" },
                ]}
                onChange={(v) => setNewVia(v as "vpn" | "bypass")}
                minWidth={130}
              />
              <button
                onClick={addNet}
                className="h-10 px-4 rounded-xl bg-accent-grad shadow-accent-glow text-white text-[13px] font-medium hover:brightness-110 transition flex items-center gap-1.5"
              >
                <Plus size={14} />
                Добавить
              </button>
            </div>

            <div className="mt-3 space-y-1.5">
              <AnimatePresence initial={false}>
                {nets.map((n) => (
                  <motion.div
                    key={n.id}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.18 }}
                    className="group flex items-center gap-2.5 px-3 h-9 rounded-lg bg-white/[0.025] border border-white/[0.04] hover:bg-white/[0.04] transition-colors"
                  >
                    <span
                      className={cn(
                        "w-1.5 h-1.5 rounded-full",
                        n.via === "vpn" ? "bg-emerald-400" : "bg-amber-400"
                      )}
                    />
                    <span className="font-mono text-[13px] text-white/85">{n.pattern}</span>
                    <span className="text-[12px] text-white/40">
                      {n.via === "vpn" ? "→ через VPN" : "→ напрямую"}
                    </span>
                    <div className="flex-1" />
                    <button
                      onClick={() => askRemoveNet(n.id)}
                      className="opacity-0 group-hover:opacity-100 w-7 h-7 grid place-items-center rounded-md text-white/40 hover:text-rose-300 hover:bg-rose-500/10 transition"
                      title="Удалить правило"
                    >
                      <Trash2 size={12} />
                    </button>
                  </motion.div>
                ))}
              </AnimatePresence>
              {nets.length === 0 && (
                <div className="text-center text-[13px] text-white/40 py-4">
                  Правил пока нет — добавь первое выше
                </div>
              )}
            </div>
          </div>
        </>
      ) : (
        <FullTunnelCard />
      )}

      <AppPickerModal
        open={addAppOpen}
        onClose={() => setAddAppOpen(false)}
        query={appQuery}
        setQuery={setAppQuery}
        existingKeys={new Set(apps.map((a) => a.exe.toLowerCase().replace(/\.exe$/, "")))}
        folders={folders}
        folderId={targetFolderId}
        onFolderIdChange={setTargetFolderId}
        onCreateFolder={newFolder}
        onPick={(entry) => {
          addApp(entry);
          setAddAppOpen(false);
          setAppQuery("");
        }}
      />

      <TextPromptModal
        state={textPrompt}
        onClose={() => setTextPrompt(null)}
        onSubmit={(v) => {
          if (!textPrompt) return;
          textPrompt.onOk(v);
          setTextPrompt(null);
        }}
      />

      <ConfirmModal
        state={confirmDialog}
        onClose={() => setConfirmDialog(null)}
        onConfirm={() => {
          if (!confirmDialog) return;
          confirmDialog.onOk();
          setConfirmDialog(null);
        }}
      />
    </div>
  );
}

type Source = "installed" | "running";

function AppPickerModal({
  open,
  onClose,
  query,
  setQuery,
  existingKeys,
  onPick,
  folders,
  folderId,
  onFolderIdChange,
  onCreateFolder,
}: {
  open: boolean;
  onClose: () => void;
  query: string;
  setQuery: (v: string) => void;
  existingKeys: Set<string>;
  onPick: (a: Omit<AppRule, "id" | "via" | "folderId">) => void;
  folders: AppFolder[];
  folderId: string | null;
  onFolderIdChange: (id: string | null) => void;
  onCreateFolder: () => void;
}) {
  const [src, setSrc] = useState<Source>("installed");
  const [installed, setInstalled] = useState<InstalledApp[] | null>(null);
  const [running, setRunning] = useState<RunningProc[] | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [userOnly, setUserOnly] = useState(false);

  const load = async (which: Source, force = false) => {
    setLoadErr(null);
    if (which === "installed" && installed && !force) return;
    if (which === "running" && running && !force) return;
    setLoading(true);
    try {
      if (which === "installed") {
        const r = await invoke<InstalledApp[]>("list_installed_apps");
        setInstalled(r);
      } else {
        const r = await invoke<RunningProc[]>("list_running_processes");
        setRunning(r);
      }
    } catch (e) {
      setLoadErr(typeof e === "string" ? e : "Не удалось получить список");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!open) return;
    load(src);
  }, [open, src]);

  // Live-refresh the "Запущенные" list while the picker is open. The
  // OS process table changes constantly (the user explicitly reported
  // "нет автоматического обновления запущенных процессов" — they
  // launched something with the modal already open and it never showed
  // up). 2.5s is fast enough to feel live but slow enough that the
  // backend `EnumProcesses + IconExtraction` call on Windows doesn't
  // hammer the system. We do NOT poll the "installed" tab because that
  // table only changes on install / uninstall and is much more
  // expensive to enumerate.
  useEffect(() => {
    if (!open || src !== "running") return;
    const id = window.setInterval(() => {
      void load("running", true);
    }, 2500);
    return () => window.clearInterval(id);
  }, [open, src]);

  const items = useMemo<Omit<AppRule, "id" | "via">[]>(() => {
    const q = query.trim().toLowerCase();
    const matchq = (name: string, exe: string) =>
      q === "" || name.toLowerCase().includes(q) || exe.toLowerCase().includes(q);

    if (src === "installed") {
      return (installed ?? [])
        .filter((a) => !existingKeys.has(a.key) && matchq(a.name, a.exe))
        .map((a) => {
          const b = brandFor(a.exe, a.name);
          return {
            name: a.name,
            exe: a.exe,
            brand: b.brand,
            brandColor: b.brandColor,
            path: a.path ?? null,
          };
        });
    }
    return (running ?? [])
      .filter((p) => {
        if (existingKeys.has(p.exe.toLowerCase().replace(/\.exe$/, ""))) return false;
        if (!matchq(p.name, p.exe)) return false;
        if (userOnly && p.user_owned === false) return false;
        return true;
      })
      .map((p) => {
        const b = brandFor(p.exe, p.name);
        return {
          name: p.name,
          exe: p.exe,
          brand: b.brand,
          brandColor: b.brandColor,
          path: p.path ?? null,
        };
      });
  }, [src, installed, running, existingKeys, query, userOnly]);

  useEffect(() => {
    prefetchIcons(items.map((i) => i.path));
  }, [items]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="fixed inset-0 z-[900] grid place-items-center bg-black/55 backdrop-blur-sm"
          onMouseDown={(e) => e.target === e.currentTarget && onClose()}
        >
          <motion.div
            initial={{ y: 12, scale: 0.97, opacity: 0 }}
            animate={{ y: 0, scale: 1, opacity: 1 }}
            exit={{ y: 12, scale: 0.97, opacity: 0 }}
            transition={{ type: "spring", stiffness: 380, damping: 30 }}
            className="relative w-[480px] max-w-[92vw] grad-border p-5"
          >
            <div className="flex items-center gap-2 mb-3">
              <div className="w-8 h-8 grid place-items-center rounded-lg bg-accent-soft border border-accent-soft text-accent">
                <Plus size={15} />
              </div>
              <div className="flex-1 min-w-0">
                <h2 className="text-[16px] font-semibold text-white">Добавить приложение</h2>
                <p className="text-[12.5px] text-white/50 -mt-0.5 truncate">
                  {src === "installed"
                    ? "Из списка установленных программ"
                    : "Из активных процессов системы"}
                </p>
              </div>
              <button
                onClick={() => load(src, true)}
                title="Обновить"
                className="w-8 h-8 grid place-items-center rounded-lg bg-white/[0.04] border border-white/[0.06] text-white/55 hover:text-white hover:bg-white/[0.07] transition"
              >
                <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
              </button>
            </div>

            <div className="flex p-1 mb-3 rounded-xl bg-white/[0.03] border border-white/[0.06] gap-1">
              {([
                { key: "installed", label: "Установленные", icon: Download },
                { key: "running", label: "Запущенные", icon: Activity },
              ] as { key: Source; label: string; icon: React.ComponentType<{ size?: number }> }[]).map((t) => {
                const Icon = t.icon;
                const active = src === t.key;
                return (
                  <button
                    key={t.key}
                    onClick={() => setSrc(t.key)}
                    className={cn(
                      "relative flex-1 flex items-center justify-center gap-1.5 h-9 rounded-lg text-[13px] font-medium transition-colors",
                      active ? "text-white" : "text-white/55 hover:text-white/80"
                    )}
                  >
                    {active && (
                      <motion.span
                        layoutId="appPickerTab"
                        transition={{ type: "spring", stiffness: 380, damping: 32 }}
                        className="absolute inset-0 rounded-lg bg-accent-soft border border-accent-soft"
                      />
                    )}
                    <span className="relative flex items-center gap-1.5">
                      <Icon size={13} />
                      {t.label}
                    </span>
                  </button>
                );
              })}
            </div>

            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={src === "installed" ? "Поиск по имени или .exe…" : "Поиск по имени процесса…"}
              className="w-full h-10 px-3 mb-3 rounded-lg bg-white/[0.04] border border-white/[0.06] text-[13.5px] text-white focus:outline-none focus:bg-white/[0.06] transition placeholder:text-white/30"
            />

            {src === "running" && (
              <label className="flex items-center gap-2 mb-3 cursor-pointer select-none group">
                <span
                  className={cn(
                    "w-4 h-4 rounded-[5px] border flex items-center justify-center transition",
                    userOnly
                      ? "bg-accent-soft border-accent-soft text-accent"
                      : "bg-white/[0.04] border-white/[0.12] text-transparent group-hover:border-white/25"
                  )}
                  aria-hidden
                >
                  <Check size={11} strokeWidth={3} />
                </span>
                <input
                  type="checkbox"
                  className="sr-only"
                  checked={userOnly}
                  onChange={(e) => setUserOnly(e.target.checked)}
                />
                <span className="text-[12.5px] text-white/70 group-hover:text-white transition">
                  Только запущенные пользователем
                </span>
                <span className="text-[11.5px] text-white/35">
                  (скрыть системные процессы)
                </span>
              </label>
            )}

            <div className="flex items-center gap-2 mb-3">
              <div className="flex items-center gap-1.5 text-[12.5px] text-white/50 shrink-0">
                <Folder size={12} className="text-accent-300" />
                Папка:
              </div>
              {folders.length > 0 && (
                <Dropdown
                  value={folderId ?? "__none__"}
                  onChange={(v) =>
                    onFolderIdChange(v === "__none__" ? null : v)
                  }
                  options={[
                    { value: "__none__", label: "Без папки" },
                    ...folders.map((f) => ({ value: f.id, label: f.name })),
                  ]}
                  minWidth={180}
                  align="left"
                />
              )}
              <button
                onClick={onCreateFolder}
                className="h-9 px-3 rounded-lg bg-white/[0.04] border border-white/[0.06] text-white/75 hover:bg-white/[0.07] hover:text-white transition flex items-center gap-1.5 text-[12.5px]"
                title="Создать новую папку"
              >
                <FolderPlus size={12} />
                Новая папка
              </button>
            </div>

            {loadErr && (
              <div className="mb-2 rounded-lg bg-rose-500/10 border border-rose-400/25 p-2.5 text-[12.5px] text-rose-200">
                {loadErr}
              </div>
            )}

            <div className="max-h-[360px] overflow-y-auto scroll-thin -mx-1 px-1">
              {loading && items.length === 0 ? (
                <PickerSkeleton />
              ) : items.length === 0 ? (
                <div className="text-center text-[13px] text-white/40 py-6">
                  {query.trim()
                    ? "Ничего не найдено"
                    : src === "installed"
                      ? "Ни одного приложения не обнаружено"
                      : "Нет активных процессов"}
                </div>
              ) : (
                items.map((a) => (
                  <button
                    key={a.exe + ":" + a.name}
                    onClick={() => onPick(a)}
                    className="w-full flex items-center gap-3 px-3 h-12 rounded-lg hover:bg-white/[0.04] transition text-left"
                  >
                    <BrandIcon brand={a.brand} fallback={a.name.charAt(0).toUpperCase()} color={a.brandColor} path={a.path} />
                    <div className="flex flex-col leading-tight min-w-0 flex-1">
                      <span className="text-[14px] text-white/95 font-medium truncate">{a.name}</span>
                      <span className="text-[12px] text-white/40 font-mono truncate">{a.exe}</span>
                    </div>
                    <Plus size={14} className="text-white/40" />
                  </button>
                ))
              )}
            </div>
            <div className="flex items-center justify-between gap-2 mt-4">
              <span className="text-[11.5px] text-white/35">
                {src === "installed"
                  ? `${installed?.length ?? 0} установлено`
                  : `${running?.length ?? 0} процесса`}
              </span>
              <button
                onClick={onClose}
                className="h-9 px-3 rounded-lg border border-white/10 bg-white/[0.04] text-[13px] text-white/85 hover:bg-white/[0.07] transition"
              >
                Закрыть
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function PickerSkeleton() {
  return (
    <div className="space-y-1.5 py-1">
      {[0, 1, 2, 3, 4].map((i) => (
        <div
          key={i}
          className="flex items-center gap-3 px-3 h-12 rounded-lg bg-white/[0.02] border border-white/[0.04]"
        >
          <div className="w-9 h-9 rounded-lg bg-white/[0.05] animate-pulse" />
          <div className="flex-1 space-y-1.5">
            <div className="h-3 w-1/2 rounded bg-white/[0.05] animate-pulse" />
            <div className="h-2.5 w-1/3 rounded bg-white/[0.04] animate-pulse" />
          </div>
        </div>
      ))}
    </div>
  );
}

function AppRow({
  app,
  mode,
  folders,
  onDelete,
  onMove,
}: {
  app: AppRule;
  mode: Mode;
  folders: AppFolder[];
  onFlip: () => void;
  onDelete: () => void;
  onMove: (folderId: string | null) => void;
}) {
  const effective = mode === "whitelist" ? "vpn" : mode === "blacklist" ? "bypass" : app.via;
  const isVpn = effective === "vpn";
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.18 }}
      className="group flex items-center gap-3 px-4 h-14 hover:bg-white/[0.025] transition-colors"
    >
      <BrandIcon brand={app.brand} fallback={app.name.charAt(0).toUpperCase()} color={app.brandColor} path={app.path} />
      <div className="flex flex-col leading-tight min-w-0">
        <span className="text-[14px] text-white/95 font-medium">{app.name}</span>
        <span className="text-[12px] text-white/40 font-mono">{app.exe}</span>
      </div>
      <div className="flex-1" />
      <span
        className={cn(
          "h-9 px-3.5 rounded-lg text-[13px] font-medium border flex items-center gap-2",
          isVpn
            ? "bg-emerald-500/12 border-emerald-400/30 text-emerald-300"
            : "bg-amber-500/12 border-amber-400/30 text-amber-200"
        )}
      >
        <span
          className={cn(
            "w-1.5 h-1.5 rounded-full",
            isVpn ? "bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.7)]" : "bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.7)]"
          )}
        />
        {isVpn ? "через VPN" : "напрямую"}
      </span>
      {folders.length > 0 && (
        <MoveToFolderMenu
          currentFolderId={app.folderId ?? null}
          folders={folders}
          onMove={onMove}
        />
      )}
      <button
        onClick={onDelete}
        className="opacity-0 group-hover:opacity-100 w-8 h-8 grid place-items-center rounded-md text-white/35 hover:text-rose-300 hover:bg-rose-500/10 transition"
        title="Удалить из списка"
      >
        <Trash2 size={14} />
      </button>
    </motion.div>
  );
}

function MoveToFolderMenu({
  currentFolderId,
  folders,
  onMove,
}: {
  currentFolderId: string | null;
  folders: AppFolder[];
  onMove: (folderId: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement | null>(null);
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(
    null
  );

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (btnRef.current && btnRef.current.contains(e.target as Node)) return;
      setOpen(false);
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    const scroll = () => setOpen(false);
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    document.addEventListener("scroll", scroll, true);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", esc);
      document.removeEventListener("scroll", scroll, true);
    };
  }, [open]);

  const toggle = () => {
    if (open) {
      setOpen(false);
      return;
    }
    const r = btnRef.current?.getBoundingClientRect();
    if (!r) return;
    const W = 220;
    setCoords({
      top: r.bottom + 6,
      left: Math.min(r.right - W, window.innerWidth - W - 8),
    });
    setOpen(true);
  };

  return (
    <>
      <button
        ref={btnRef}
        onClick={toggle}
        className="opacity-0 group-hover:opacity-100 w-8 h-8 grid place-items-center rounded-md text-white/45 hover:text-white hover:bg-white/[0.06] transition"
        title="Переместить в папку"
      >
        <MoreHorizontal size={15} />
      </button>
      {open && coords &&
        createPortal(
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: -4 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ duration: 0.12 }}
            style={{
              position: "fixed",
              top: coords.top,
              left: coords.left,
              width: 220,
              zIndex: 1000,
            }}
            className="rounded-lg border border-white/[0.08] bg-ink-900/95 backdrop-blur-xl shadow-2xl py-1 text-[13px] max-h-[260px] overflow-y-auto"
          >
            <div className="px-3 py-1 text-[11px] uppercase tracking-wide text-white/40 select-none">
              Переместить в папку
            </div>
            <button
              onClick={() => {
                onMove(null);
                setOpen(false);
              }}
              className={cn(
                "w-full flex items-center gap-2 px-3 h-8 text-left transition",
                currentFolderId === null
                  ? "text-white bg-white/[0.05]"
                  : "text-white/80 hover:bg-white/[0.04]"
              )}
            >
              <FolderMinus size={13} className="text-white/55" />
              Без папки
            </button>
            {folders.map((f) => (
              <button
                key={f.id}
                onClick={() => {
                  onMove(f.id);
                  setOpen(false);
                }}
                className={cn(
                  "w-full flex items-center gap-2 px-3 h-8 text-left transition",
                  currentFolderId === f.id
                    ? "text-white bg-white/[0.05]"
                    : "text-white/80 hover:bg-white/[0.04]"
                )}
              >
                <Folder size={13} className="text-accent-300" />
                <span className="truncate">{f.name}</span>
              </button>
            ))}
          </motion.div>,
          document.body
        )}
    </>
  );
}

function FolderGroup({
  folder,
  apps,
  mode,
  isOpen,
  allFolders,
  onToggle,
  onRename,
  onDelete,
  onAddInto,
  onFlip,
  onRemove,
  onMove,
}: {
  folder: AppFolder;
  apps: AppRule[];
  mode: Mode;
  isOpen: boolean;
  allFolders: AppFolder[];
  onToggle: () => void;
  onRename: (name: string) => void;
  onDelete: () => void;
  onAddInto: () => void;
  onFlip: (id: string) => void;
  onRemove: (id: string) => void;
  onMove: (id: string, folderId: string | null) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(folder.name);

  useEffect(() => {
    if (!editing) setDraft(folder.name);
  }, [folder.name, editing]);

  const commit = () => {
    const t = draft.trim();
    if (t && t !== folder.name) onRename(t);
    setEditing(false);
  };

  return (
    <div className="grad-border overflow-hidden">
      <div
        className="group flex items-center gap-3 px-3 h-11 bg-white/[0.02] hover:bg-white/[0.03] transition cursor-pointer select-none"
        onClick={editing ? undefined : onToggle}
      >
        <motion.div
          animate={{ rotate: isOpen ? 90 : 0 }}
          transition={{ duration: 0.32, ease: [0.32, 0.72, 0, 1] }}
          className="shrink-0"
        >
          <ChevronRight size={14} className="text-white/40" />
        </motion.div>
        <Folder size={16} className="text-accent-300 shrink-0" />
        {editing ? (
          <input
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => {
              if (e.key === "Enter") commit();
              if (e.key === "Escape") {
                setDraft(folder.name);
                setEditing(false);
              }
            }}
            className="text-[13.5px] text-white/95 bg-white/[0.05] border border-white/10 rounded px-1.5 py-0.5 outline-none w-[240px]"
          />
        ) : (
          <span className="text-[13.5px] text-white/90 font-medium truncate">
            {folder.name}
          </span>
        )}
        <span className="text-[12px] text-white/40 tabular-nums">
          {apps.length}
        </span>
        <div className="flex-1" />
        <button
          onClick={(e) => {
            e.stopPropagation();
            onAddInto();
          }}
          className="opacity-0 group-hover:opacity-100 h-7 px-2 rounded-md bg-white/[0.04] hover:bg-white/[0.08] text-white/70 hover:text-white text-[12px] flex items-center gap-1 transition"
          title="Добавить приложение в эту папку"
        >
          <Plus size={12} />
          Добавить
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            setDraft(folder.name);
            setEditing(true);
          }}
          className="opacity-40 group-hover:opacity-100 w-7 h-7 grid place-items-center rounded-md hover:bg-white/5 text-white/55 hover:text-white transition"
          title="Переименовать папку"
        >
          <Edit2 size={13} />
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          className="opacity-40 group-hover:opacity-100 w-7 h-7 grid place-items-center rounded-md hover:bg-rose-500/15 text-white/55 hover:text-rose-300 transition"
          title="Удалить папку"
        >
          <Trash2 size={13} />
        </button>
      </div>
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
            <div className="ml-[22px] pl-3 my-1 border-l-2 border-accent-faint divide-y divide-white/[0.04]">
              {apps.length === 0 ? (
                <div className="text-[12px] text-white/35 px-2 py-1.5">
                  Пусто — добавьте приложение через «+ Добавить» выше.
                </div>
              ) : (
                <AnimatePresence initial={false}>
                  {apps.map((a) => (
                    <AppRow
                      key={a.id}
                      app={a}
                      mode={mode}
                      folders={allFolders}
                      onFlip={() => onFlip(a.id)}
                      onDelete={() => onRemove(a.id)}
                      onMove={(folderId) => onMove(a.id, folderId)}
                    />
                  ))}
                </AnimatePresence>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function LooseGroup({
  apps,
  mode,
  isOpen,
  allFolders,
  hasFolders,
  onToggle,
  onFlip,
  onRemove,
  onMove,
}: {
  apps: AppRule[];
  mode: Mode;
  isOpen: boolean;
  allFolders: AppFolder[];
  hasFolders: boolean;
  onToggle: () => void;
  onFlip: (id: string) => void;
  onRemove: (id: string) => void;
  onMove: (id: string, folderId: string | null) => void;
}) {
  if (!hasFolders) {
    return (
      <div className="grad-border overflow-hidden">
        <div className="divide-y divide-white/[0.04]">
          <AnimatePresence initial={false}>
            {apps.map((a) => (
              <AppRow
                key={a.id}
                app={a}
                mode={mode}
                folders={allFolders}
                onFlip={() => onFlip(a.id)}
                onDelete={() => onRemove(a.id)}
                onMove={(folderId) => onMove(a.id, folderId)}
              />
            ))}
          </AnimatePresence>
        </div>
      </div>
    );
  }
  return (
    <div className="grad-border overflow-hidden">
      <div
        className="flex items-center gap-3 px-3 h-10 bg-white/[0.015] hover:bg-white/[0.025] transition cursor-pointer select-none"
        onClick={onToggle}
      >
        <motion.div
          animate={{ rotate: isOpen ? 90 : 0 }}
          transition={{ duration: 0.32, ease: [0.32, 0.72, 0, 1] }}
          className="shrink-0"
        >
          <ChevronRight size={14} className="text-white/40" />
        </motion.div>
        <span className="text-[12.5px] text-white/55 uppercase tracking-wide">
          Без папки
        </span>
        <span className="text-[12px] text-white/40 tabular-nums">
          {apps.length}
        </span>
      </div>
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
            <div className="divide-y divide-white/[0.04]">
              <AnimatePresence initial={false}>
                {apps.map((a) => (
                  <AppRow
                    key={a.id}
                    app={a}
                    mode={mode}
                    folders={allFolders}
                    onFlip={() => onFlip(a.id)}
                    onDelete={() => onRemove(a.id)}
                    onMove={(folderId) => onMove(a.id, folderId)}
                  />
                ))}
              </AnimatePresence>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function BrandIcon({
  brand,
  fallback,
  color,
  path,
}: {
  brand?: string;
  fallback: string;
  color?: string;
  path?: string | null;
}) {
  const [errored, setErrored] = useState(false);
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!path) return;
    prefetchIcons([path]);
    const unsub = subscribeIcons(() => setTick((t) => t + 1));
    return unsub;
  }, [path]);
  const realIcon = path ? getCachedIcon(path) : null;
  if (realIcon) {
    return (
      <div className="w-9 h-9 rounded-lg grid place-items-center bg-white/[0.04] border border-white/[0.05] overflow-hidden">
        <img
          src={`data:image/png;base64,${realIcon}`}
          alt={fallback}
          width={28}
          height={28}
          draggable={false}
          className="select-none pointer-events-none"
        />
      </div>
    );
  }
  if (!brand || errored) {
    return (
      <div
        className="w-9 h-9 rounded-lg grid place-items-center text-[14px] font-bold bg-white/[0.06] border border-white/[0.06] text-white/80"
        style={color ? { color: `#${color}` } : undefined}
      >
        {fallback}
      </div>
    );
  }
  const url = color
    ? `https://cdn.simpleicons.org/${brand}/${color}`
    : `https://cdn.simpleicons.org/${brand}`;
  return (
    <div className="w-9 h-9 rounded-lg grid place-items-center bg-white/[0.04] border border-white/[0.05]">
      <img
        src={url}
        alt={brand}
        width={20}
        height={20}
        loading="lazy"
        draggable={false}
        onError={() => setErrored(true)}
        className="select-none pointer-events-none"
      />
    </div>
  );
}

function FullTunnelCard() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      className="mt-5 grad-border p-7 text-center"
    >
      <div className="w-16 h-16 mx-auto rounded-2xl bg-emerald-500/15 border border-emerald-400/25 grid place-items-center text-emerald-300 shadow-[inset_0_0_24px_rgba(52,211,153,0.2)]">
        <Shield size={28} />
      </div>
      <div className="mt-3 text-[16px] font-semibold text-white">Полный туннель активен</div>
      <div className="mt-2 text-[13.5px] text-white/55 max-w-[480px] mx-auto leading-snug">
        Весь сетевой трафик идёт через выбранный VPN-узел. Чтобы исключить отдельные приложения или
        хосты — переключи режим выше на «Только указанные» или «Кроме указанных».
      </div>
    </motion.div>
  );
}

function TextPromptModal({
  state,
  onClose,
  onSubmit,
}: {
  state: {
    title: string;
    placeholder?: string;
    initial: string;
    confirmLabel: string;
  } | null;
  onClose: () => void;
  onSubmit: (value: string) => void;
}) {
  const [value, setValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (state) {
      setValue(state.initial);
      requestAnimationFrame(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      });
    }
  }, [state]);

  return (
    <AnimatePresence>
      {state && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="fixed inset-0 z-[950] grid place-items-center bg-black/55 backdrop-blur-sm"
          onMouseDown={(e) => e.target === e.currentTarget && onClose()}
        >
          <motion.div
            initial={{ y: 10, scale: 0.97, opacity: 0 }}
            animate={{ y: 0, scale: 1, opacity: 1 }}
            exit={{ y: 10, scale: 0.97, opacity: 0 }}
            transition={{ type: "spring", stiffness: 420, damping: 30 }}
            className="w-[380px] max-w-[92vw] grad-border p-5"
          >
            <div className="flex items-center gap-2 mb-3">
              <div className="w-8 h-8 grid place-items-center rounded-lg bg-accent-soft border border-accent-soft text-accent">
                <FolderPlus size={15} />
              </div>
              <h2 className="text-[15.5px] font-semibold text-white">{state.title}</h2>
            </div>
            <input
              ref={inputRef}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  if (value.trim()) onSubmit(value);
                } else if (e.key === "Escape") {
                  onClose();
                }
              }}
              placeholder={state.placeholder}
              className="w-full h-10 px-3 rounded-lg bg-white/[0.04] border border-white/[0.08] text-[13.5px] text-white focus:outline-none focus:border-accent-soft focus:bg-white/[0.06] transition placeholder:text-white/30"
            />
            <div className="flex items-center justify-between gap-2 mt-4">
              <button
                onClick={() => {
                  if (value.trim()) onSubmit(value);
                }}
                disabled={!value.trim()}
                className="h-9 px-4 rounded-lg bg-accent-grad shadow-accent-glow text-white text-[13px] font-medium hover:brightness-110 transition disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {state.confirmLabel}
              </button>
              <button
                onClick={onClose}
                className="h-9 px-3 rounded-lg border border-white/10 bg-white/[0.04] text-[13px] text-white/85 hover:bg-white/[0.07] transition"
              >
                Отмена
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function ConfirmModal({
  state,
  onClose,
  onConfirm,
}: {
  state: {
    title: string;
    body: string;
    confirmLabel?: string;
    destructive?: boolean;
  } | null;
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <AnimatePresence>
      {state && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="fixed inset-0 z-[950] grid place-items-center bg-black/55 backdrop-blur-sm"
          onMouseDown={(e) => e.target === e.currentTarget && onClose()}
        >
          <motion.div
            initial={{ y: 10, scale: 0.97, opacity: 0 }}
            animate={{ y: 0, scale: 1, opacity: 1 }}
            exit={{ y: 10, scale: 0.97, opacity: 0 }}
            transition={{ type: "spring", stiffness: 420, damping: 30 }}
            className="w-[400px] max-w-[92vw] grad-border p-5"
          >
            <div className="flex items-start gap-3 mb-3">
              <div
                className={cn(
                  "w-8 h-8 shrink-0 grid place-items-center rounded-lg border",
                  state.destructive
                    ? "bg-rose-500/12 border-rose-400/30 text-rose-300"
                    : "bg-accent-soft border-accent-soft text-accent"
                )}
              >
                {state.destructive ? <Trash2 size={15} /> : <Info size={15} />}
              </div>
              <div className="flex-1 min-w-0">
                <h2 className="text-[15.5px] font-semibold text-white leading-tight">
                  {state.title}
                </h2>
                <p className="text-[13px] text-white/55 mt-1 leading-snug">{state.body}</p>
              </div>
            </div>
            <div className="flex items-center justify-between gap-2 mt-4">
              <button
                onClick={onConfirm}
                className={cn(
                  "h-9 px-4 rounded-lg text-[13px] font-medium transition",
                  state.destructive
                    ? "bg-rose-500/85 hover:bg-rose-500 text-white shadow-[0_4px_16px_-4px_rgba(244,63,94,0.4)]"
                    : "bg-accent-grad shadow-accent-glow text-white hover:brightness-110"
                )}
              >
                {state.confirmLabel ?? (state.destructive ? "Удалить" : "OK")}
              </button>
              <button
                onClick={onClose}
                className="h-9 px-3 rounded-lg border border-white/10 bg-white/[0.04] text-[13px] text-white/85 hover:bg-white/[0.07] transition"
              >
                Отмена
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
