import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Power,
  LayoutGrid,
  Settings as SettingsIcon,
  ScrollText,
  Split,
  Sparkles,
  X,
} from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { cn } from "../utils/cn";
import { useTheme } from "../theme";
import type { ConnState } from "../types";

export type PageKey = "home" | "profiles" | "tunneling" | "settings" | "logs";

const NAV: { key: PageKey; label: string; icon: React.ComponentType<{ size?: number }> }[] = [
  { key: "home", label: "Главная", icon: Power },
  { key: "profiles", label: "Профили", icon: LayoutGrid },
  { key: "tunneling", label: "Туннелирование", icon: Split },
  { key: "settings", label: "Настройки", icon: SettingsIcon },
  { key: "logs", label: "Логи", icon: ScrollText },
];

interface Props {
  page: PageKey;
  setPage: (p: PageKey) => void;
  state: ConnState;
  update?: { version: string; notes?: string } | null;
  updateBusy?: "idle" | "downloading" | "installing";
  updateProgress?: { done: number; total: number } | null;
  updateError?: string | null;
  onInstallUpdate?: () => void;
  onDismissUpdate?: () => void;
  onDismissUpdateError?: () => void;
}

export function Sidebar({
  page,
  setPage,
  state,
  update,
  updateBusy = "idle",
  updateProgress,
  updateError,
  onInstallUpdate,
  onDismissUpdate,
  onDismissUpdateError,
}: Props) {
  const { iconVariant } = useTheme();
  const brandSrc = iconVariant === "leaf" ? "/mint-leaf.png" : "/mint-shield.png";
  const [version, setVersion] = useState<string>("");
  useEffect(() => {
    (async () => {
      try {
        const info = (await invoke("app_version")) as { version: string };
        setVersion(info.version);
      } catch {
      }
    })();
  }, []);
  const haloColor =
    state === "connected"
      ? "from-emerald-500/20"
      : state === "connecting" || state === "disconnecting"
        ? "from-amber-500/15"
        : "from-violet-500/15";

  return (
    <aside className="w-[230px] shrink-0 h-full flex flex-col px-3 pt-4 pb-4 border-r border-white/[0.05] bg-ink-900/60 backdrop-blur-xl">
      <motion.div
        initial={{ opacity: 0, y: -4 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
        className="relative p-3.5 mb-4 overflow-hidden antialiased rounded-2xl bg-gradient-to-b from-white/[0.05] to-white/[0.02] border border-white/[0.08]"
      >
        <div className={cn("pointer-events-none absolute -top-12 -right-10 w-32 h-32 rounded-full bg-gradient-to-br to-transparent blur-2xl transition-colors duration-700", haloColor)} />
        <div className="relative flex items-center gap-2.5">
          <div className="relative w-12 h-12 shrink-0">
            <img
              src={brandSrc}
              alt="Mint"
              draggable={false}
              width={96}
              height={96}
              className="w-full h-full object-contain pointer-events-none select-none"
              style={{ imageRendering: "auto" }}
            />
          </div>
          <div className="flex-1 flex flex-col items-center leading-tight min-w-0">
            <span className="text-[18px] font-bold tracking-tight text-white">Mint</span>
            <span className="text-[11.5px] tracking-tight text-white/55 mt-0.5 whitespace-nowrap">
              VPN client{version ? ` · ${version}` : ""}
            </span>
          </div>
        </div>
      </motion.div>

      <nav className="flex flex-col gap-1.5">
        {NAV.map((item) => {
          const Icon = item.icon;
          const active = page === item.key;
          return (
            <button
              key={item.key}
              onClick={() => setPage(item.key)}
              className={cn(
                "relative flex items-center gap-3 px-3 h-10 rounded-xl text-sm font-medium transition group",
                active
                  ? "text-white"
                  : "text-white/55 hover:text-white hover:bg-white/[0.035]"
              )}
            >
              {active && (
                <motion.div
                  layoutId="navActive"
                  transition={{ type: "spring", stiffness: 360, damping: 32 }}
                  className="absolute inset-0 rounded-xl bg-accent-soft border-accent-soft border"
                  style={{
                    backgroundImage:
                      "linear-gradient(90deg, rgba(var(--accent-rgb), 0.30), rgba(var(--accent-rgb), 0.15) 50%, transparent)",
                    boxShadow: "inset 0 0 20px rgba(var(--accent-rgb), 0.15)",
                  }}
                />
              )}
              <Icon size={17} />
              <span className="relative">{item.label}</span>
              {active && (
                <span
                  className="absolute right-3 w-1.5 h-1.5 rounded-full"
                  style={{
                    backgroundColor: "var(--accent-400)",
                    boxShadow: "0 0 10px 2px rgba(var(--accent-rgb), 0.8)",
                  }}
                />
              )}
            </button>
          );
        })}
      </nav>

      <div className="flex-1" />

      <AnimatePresence>
        {updateError && (
          <motion.div
            key="update-error"
            initial={{ opacity: 0, y: 8, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.96 }}
            transition={{ type: "spring", stiffness: 380, damping: 30 }}
            className="relative mb-3 p-3 rounded-xl bg-rose-500/[0.07] border border-rose-400/30 overflow-hidden"
          >
            <button
              onClick={onDismissUpdateError}
              className="absolute top-1.5 right-1.5 w-6 h-6 grid place-items-center rounded-md text-white/40 hover:text-white hover:bg-white/[0.06] transition"
              title="Скрыть"
            >
              <X size={12} />
            </button>
            <div className="flex flex-col leading-snug pr-5">
              <span className="text-[12px] font-semibold text-rose-200">Ошибка обновления</span>
              <span className="text-[11px] text-white/65 mt-1">{updateError}</span>
            </div>
          </motion.div>
        )}
        {update && !updateError && (
          <motion.div
            key="update-banner"
            initial={{ opacity: 0, y: 8, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.96 }}
            transition={{ type: "spring", stiffness: 380, damping: 30 }}
            className="relative mb-3 p-3 rounded-xl bg-accent-soft border-accent-soft border overflow-hidden"
          >
            {updateBusy === "idle" && (
              <button
                onClick={onDismissUpdate}
                className="absolute top-1.5 right-1.5 w-6 h-6 grid place-items-center rounded-md text-white/40 hover:text-white hover:bg-white/[0.06] transition"
                title="Скрыть"
              >
                <X size={12} />
              </button>
            )}
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-accent-soft border-accent-soft border grid place-items-center text-accent">
                <Sparkles size={14} />
              </div>
              <div className="flex flex-col leading-tight">
                <span className="text-[12.5px] font-semibold text-white">Доступно {update.version}</span>
                <span className="text-[11px] text-white/55">
                  {updateBusy === "downloading"
                    ? updateProgress && updateProgress.total > 0
                      ? `Загрузка · ${Math.min(
                          100,
                          Math.round((updateProgress.done / updateProgress.total) * 100)
                        )}%`
                      : "Загрузка…"
                    : updateBusy === "installing"
                      ? "Установка…"
                      : "вышло обновление"}
                </span>
              </div>
            </div>
            {updateBusy === "downloading" && updateProgress && updateProgress.total > 0 && (
              <div className="mt-2 h-1 rounded-full bg-white/[0.08] overflow-hidden">
                <div
                  className="h-full bg-accent-grad transition-all"
                  style={{
                    width: `${Math.min(
                      100,
                      Math.round((updateProgress.done / updateProgress.total) * 100)
                    )}%`,
                  }}
                />
              </div>
            )}
            <button
              onClick={onInstallUpdate}
              disabled={updateBusy !== "idle"}
              className="mt-2.5 w-full h-8 rounded-lg bg-accent-grad shadow-accent-glow text-white text-[12.5px] font-medium hover:brightness-110 active:scale-[0.98] transition disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {updateBusy === "downloading"
                ? "Скачивание…"
                : updateBusy === "installing"
                  ? "Установка…"
                  : "Обновить сейчас"}
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </aside>
  );
}
