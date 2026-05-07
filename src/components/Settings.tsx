import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Palette,
  Layers,
  MonitorCog,
  ChevronRight,
  Wifi,
  ShieldCheck,
  Bell,
  Play,
  Globe,
  HelpCircle,
  Sparkles,
  RefreshCw,
} from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { PageHeader } from "./Profiles";
import { cn } from "../utils/cn";
import { Dropdown } from "./Dropdown";
import { useTheme, ACCENTS, type BackgroundKey } from "../theme";
import { BackgroundPreview } from "./AppBackground";
import { MultiHopCard } from "./MultiHopCard";
import { useSetting } from "../store/settings";
import { useConnection } from "../store/connection";
import { isMobile as isMobilePlatform } from "../utils/platform";

type CategoryKey =
  | "appearance"
  | "behavior"
  | "confirmations"
  | "security"
  | "network"
  | "connection"
  | "updates";

// Ordered from "core VPN behaviour" -> "system integration" -> "cosmetic"
// -> "rarely touched". This matches the typical settings-screen mental
// model used by Hiddify / Outline / WireGuard GUIs and matches the
// frequency users open each tab (Connection / Network are touched
// often, Updates almost never).
const ALL_CATEGORIES: {
  key: CategoryKey;
  label: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  desktopOnly?: boolean;
}[] = [
  { key: "connection", label: "Соединение", icon: Wifi },
  { key: "network", label: "Сеть и DNS", icon: Globe },
  { key: "security", label: "Безопасность", icon: ShieldCheck, desktopOnly: true },
  { key: "behavior", label: "Поведение", icon: MonitorCog, desktopOnly: true },
  { key: "confirmations", label: "Подтверждения", icon: HelpCircle },
  { key: "appearance", label: "Внешний вид", icon: Palette },
  { key: "updates", label: "Обновления", icon: Sparkles },
];

interface SettingsPageProps {
  onCheckForUpdates?: () => Promise<{ version: string } | "uptodate" | "error">;
  onInstallUpdate?: () => void | Promise<void>;
  availableUpdate?: { version: string; notes?: string } | null;
  updateBusy?: "idle" | "downloading" | "installing";
  updateError?: string | null;
}

export function SettingsPage({
  onCheckForUpdates,
  onInstallUpdate,
  availableUpdate,
  updateBusy = "idle",
  updateError,
}: SettingsPageProps = {}) {
  const mobile = isMobilePlatform();
  const categories = mobile
    ? ALL_CATEGORIES.filter((c) => !c.desktopOnly)
    : ALL_CATEGORIES;

  // Persist the active settings category between visits. Without this,
  // every time the user navigates away and comes back the panel resets
  // to the first tab, which is annoying when iterating on a deeper one
  // (e.g. tweaking firewall rules under Безопасность). Default lands on
  // the first available category in the (logical) ALL_CATEGORIES order.
  const defaultCategory: CategoryKey = categories[0]?.key ?? "connection";
  const [activeRaw, setActiveRaw] = useSetting<string>(
    "mint.settings.activeCategory",
    defaultCategory
  );
  const isValid = (k: string): k is CategoryKey =>
    categories.some((c) => c.key === k);
  const active: CategoryKey = isValid(activeRaw) ? activeRaw : defaultCategory;
  const setActive = (k: CategoryKey) => setActiveRaw(k);

  return (
    <div className="h-full flex p-6 gap-5 overflow-hidden">
      <div className="w-60 shrink-0 flex flex-col">
        <PageHeader title="Настройки" />
        <div className="mt-5 space-y-1 overflow-y-auto scroll-thin pr-1">
          {categories.map((c) => {
            const Icon = c.icon;
            const isActive = c.key === active;
            return (
              <button
                key={c.key}
                onClick={() => setActive(c.key)}
                className={cn(
                  "relative w-full flex items-center gap-2.5 px-3 h-10 rounded-xl text-[14px] transition group",
                  isActive
                    ? "text-white"
                    : "text-white/55 hover:text-white hover:bg-white/[0.035]"
                )}
              >
                {isActive && (
                  <motion.div
                    layoutId="settingsActive"
                    transition={{ type: "spring", stiffness: 380, damping: 32 }}
                    className="absolute inset-0 rounded-xl bg-gradient-to-r from-[rgba(var(--accent-rgb),0.25)] via-[rgba(var(--accent-rgb),0.10)] to-transparent border border-accent-soft shadow-[inset_0_0_20px_rgba(var(--accent-rgb),0.12)]"
                  />
                )}
                <Icon
                  size={14}
                  className={cn(
                    "relative",
                    isActive ? "text-accent-300" : "text-white/40 group-hover:text-white/70"
                  )}
                />
                <span className="relative">{c.label}</span>
                {isActive && (
                  <ChevronRight size={13} className="relative ml-auto text-accent-300" />
                )}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto scroll-thin pr-2 space-y-4 pt-1">
        <AnimatePresence mode="wait">
          <motion.div
            key={active}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18, ease: "easeOut" }}
            className="space-y-4"
          >
            {active === "appearance" && <AppearanceSection />}
            {active === "behavior" && <BehaviorSection />}
            {active === "confirmations" && <ConfirmationsSection />}
            {active === "security" && <SecuritySection />}
            {active === "network" && <NetworkSection />}
            {active === "connection" && <ConnectionSection />}
            {active === "updates" && (
              <UpdatesSection
                onCheckForUpdates={onCheckForUpdates}
                onInstallUpdate={onInstallUpdate}
                availableUpdate={availableUpdate}
                updateBusy={updateBusy}
                updateError={updateError}
              />
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}

function SectionCard({
  icon: Icon,
  title,
  children,
}: {
  icon: React.ComponentType<{ size?: number; className?: string }>;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="grad-border p-4">
      <div className="flex items-center gap-2 mb-3">
        <div className="w-7 h-7 rounded-lg bg-accent-soft border-accent-soft border grid place-items-center">
          <Icon size={14} className="text-accent-300" />
        </div>
        <div className="text-[14px] font-semibold text-white">{title}</div>
      </div>
      <div className="divide-y divide-white/[0.05]">{children}</div>
    </section>
  );
}

function RowWrap({
  label,
  desc,
  children,
}: {
  label: string;
  desc?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-3">
      <div className="min-w-0">
        <div className="text-[14px] text-white/90 font-medium">{label}</div>
        {desc && <div className="text-[12.5px] text-white/40 mt-0.5">{desc}</div>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

function AppearanceSection() {
  const theme = useTheme();

  return (
    <SectionCard icon={Palette} title="Тема">
      <div className="flex items-start justify-between gap-4 py-3">
        <div className="pt-1">
          <div className="text-[14px] text-white/90 font-medium">Акцент</div>
          <div className="text-[12.5px] text-white/40 mt-0.5">Главный цвет интерфейса</div>
        </div>
        <div className="grid grid-cols-5 gap-1.5 max-w-[200px] shrink-0">
          {(Object.keys(ACCENTS) as Array<keyof typeof ACCENTS>).map((k) => {
            const a = ACCENTS[k];
            const isActive = theme.accent === k;
            return (
              <button
                key={k}
                onClick={() => theme.setAccent(k)}
                title={a.label}
                className={cn(
                  "w-7 h-7 rounded-lg transition relative",
                  isActive
                    ? "ring-2 ring-white/80 ring-offset-2 ring-offset-ink-900"
                    : "hover:scale-110"
                )}
                style={{ backgroundColor: a.swatch }}
              />
            );
          })}
        </div>
      </div>

      <div className="flex items-start justify-between gap-4 py-3">
        <div className="pt-1">
          <div className="text-[14px] text-white/90 font-medium">Иконка приложения</div>
          <div className="text-[12.5px] text-white/40 mt-0.5">
            Какой логотип показывать в брендовой плашке
          </div>
        </div>
        <div className="flex gap-2 shrink-0">
          {(
            [
              { key: "shield", label: "Щит", src: "/mint-shield.png" },
              { key: "leaf", label: "Лист", src: "/mint-leaf.png" },
            ] as const
          ).map((v) => {
            const isActive = theme.iconVariant === v.key;
            return (
              <button
                key={v.key}
                onClick={() => theme.setIconVariant(v.key)}
                title={v.label}
                className={cn(
                  "relative w-[72px] h-[88px] rounded-xl bg-white/[0.04] border transition flex flex-col items-center justify-between pt-2 pb-1.5",
                  isActive
                    ? "border-accent-soft ring-2 ring-accent-soft"
                    : "border-white/[0.08] hover:border-white/20"
                )}
              >
                <img
                  src={v.src}
                  alt={v.label}
                  draggable={false}
                  className="w-12 h-12 object-contain pointer-events-none select-none"
                />
                <span
                  className={cn(
                    "text-[11px] font-medium leading-none",
                    isActive ? "text-accent" : "text-white/55"
                  )}
                >
                  {v.label}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex flex-wrap items-start justify-between gap-4 py-3">
        <div className="pt-1 max-w-[170px] min-w-[120px]">
          <div className="text-[14px] text-white/90 font-medium">Фон приложения</div>
          <div className="text-[12.5px] text-white/40 mt-0.5">
            Что отрисовывать за всем интерфейсом
          </div>
        </div>
        {/* `flex flex-wrap` instead of a fixed `grid grid-cols-4`: the
            background presets need to reflow into 3 / 2 / 1 columns when
            the Settings pane is narrow. With the old fixed grid the last
            preset was clipped on the right edge instead of wrapping.
            `justify-start` keeps tiles packed from the left, so when the
            7 presets wrap into a 4 + 3 layout the empty slot lands at the
            bottom-right of the row rather than the bottom-left (which
            previously read as a missing tile under "Стандарт"). */}
        <div className="flex flex-wrap gap-2 max-w-[380px] justify-start">
          {(
            [
              { key: "default", label: "Стандарт" },
              { key: "worldmap", label: "Карта мира" },
              { key: "neon", label: "Неон" },
              { key: "aurora", label: "Аврора" },
              { key: "mesh", label: "Мешевый" },
              { key: "cosmos", label: "Космос" },
              { key: "minimal", label: "Минимал" },
            ] as { key: BackgroundKey; label: string }[]
          ).map((b) => {
            const isActive = theme.background === b.key;
            return (
              <button
                key={b.key}
                onClick={() => theme.setBackground(b.key)}
                title={b.label}
                className={cn(
                  "relative w-[88px] h-[72px] rounded-xl overflow-hidden border transition flex flex-col",
                  isActive
                    ? "border-accent-soft ring-2 ring-accent-soft"
                    : "border-white/[0.08] hover:border-white/20"
                )}
              >
                <BackgroundPreview
                  variant={b.key}
                  className="absolute inset-0"
                />
                <span
                  className="relative mt-auto text-[10.5px] font-medium leading-none px-1.5 py-1 text-center backdrop-blur-[2px]"
                  style={{
                    background: "rgba(7, 6, 13, 0.65)",
                    color: isActive
                      ? "var(--accent-300)"
                      : "rgba(255, 255, 255, 0.85)",
                  }}
                >
                  {b.label}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </SectionCard>
  );
}

function BehaviorSection() {
  const [closeToTray, setCloseToTray] = useSetting<boolean>("mint.closeToTray", true);
  const [autoConnect, setAutoConnect] = useSetting<boolean>("mint.autoConnect", false);
  const [autostart, setAutostart] = useSetting<boolean>("mint.autostart", false);
  const [notifications, setNotifications] = useSetting<boolean>(
    "mint.notifications",
    false
  );
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    invoke("set_close_to_tray", { enabled: closeToTray }).catch(() => undefined);
  }, [closeToTray]);

  useEffect(() => {
    (async () => {
      try {
        // Source of truth is the OS (Windows Run key, .desktop file,
        // LaunchAgent), not the localStorage flag — keep them in sync
        // in case something changed between sessions (e.g. user
        // disabled it in Task Manager → Startup).
        const current = (await invoke("mint_is_autostart_enabled")) as boolean;
        if (current !== autostart) {
          setAutostart(current);
        }
      } catch {
      }
    })();
  }, []);

  const toggleAutostart = async (v: boolean) => {
    setBusy(true);
    try {
      await invoke("mint_set_autostart", { enabled: v });
      setAutostart(v);
    } catch (e) {
      console.warn("autostart toggle failed", e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <SectionCard icon={MonitorCog} title="Окно и трей">
        <RowWrap label="Сворачивать в трей при закрытии">
          <Toggle value={closeToTray} onChange={setCloseToTray} />
        </RowWrap>
      </SectionCard>

      <SectionCard icon={Play} title="Автозапуск и автоподключение">
        <RowWrap label="Запускать Mint при входе в систему">
          <Toggle value={autostart} onChange={toggleAutostart} disabled={busy} />
        </RowWrap>
        <RowWrap label="Подключаться автоматически при старте">
          <Toggle value={autoConnect} onChange={setAutoConnect} />
        </RowWrap>
      </SectionCard>

      <SectionCard icon={Bell} title="Уведомления">
        <RowWrap label="Показывать уведомления о подключении">
          <Toggle value={notifications} onChange={setNotifications} />
        </RowWrap>
      </SectionCard>
    </>
  );
}

function ConfirmationsSection() {
  const [confirmServerSwitch, setConfirmServerSwitch] = useSetting<boolean>(
    "mint.confirmServerSwitch",
    true
  );
  const [confirmDelete, setConfirmDelete] = useSetting<boolean>(
    "mint.confirmDelete",
    true
  );
  const [confirmCloseWhileConnected, setConfirmCloseWhileConnected] =
    useSetting<boolean>("mint.confirmCloseWhileConnected", true);

  return (
    <SectionCard icon={HelpCircle} title="Запрашивать подтверждение">
      <RowWrap label="При смене сервера во время активного VPN">
        <Toggle value={confirmServerSwitch} onChange={setConfirmServerSwitch} />
      </RowWrap>
      <RowWrap label="При удалении сервера, папки или правила">
        <Toggle value={confirmDelete} onChange={setConfirmDelete} />
      </RowWrap>
      <RowWrap label="При закрытии приложения с активным VPN">
        <Toggle
          value={confirmCloseWhileConnected}
          onChange={setConfirmCloseWhileConnected}
        />
      </RowWrap>
    </SectionCard>
  );
}

function SecuritySection() {
  const [killSwitch, setKillSwitch] = useSetting<boolean>("mint.killSwitch", false);
  const [useSystemProxy, setUseSystemProxy] = useSetting<boolean>(
    "mint.useSystemProxy",
    false
  );
  const vpnActive = useConnection((s) => s.state === "connected");

  const onToggle = async (v: boolean) => {
    setKillSwitch(v);
    try {
      if (v) {
        if (vpnActive) await invoke("killswitch_enable");
      } else {
        await invoke("killswitch_disable");
      }
    } catch (e) {
      console.warn("killswitch invoke failed", e);
    }
  };

  const onToggleSysproxy = async (v: boolean) => {
    setUseSystemProxy(v);
    if (!v) {
      try {
        await invoke("sysproxy_clear_if_local");
      } catch (e) {
        console.warn("sysproxy_clear_if_local failed", e);
      }
    }
  };

  return (
    <>
      <SectionCard icon={ShieldCheck} title="Kill-switch">
        <RowWrap label="Блокировать интернет при обрыве VPN">
          <Toggle value={killSwitch} onChange={onToggle} />
        </RowWrap>
      </SectionCard>
      <SectionCard icon={Globe} title="Системный прокси">
        <RowWrap
          label="Включать системный прокси при подключении"
          desc={
            "По умолчанию выключено и в 99% случаев включать не надо. " +
            "Mint и так гонит весь трафик через VPN-туннель. " +
            "Включай только если какое-то приложение упорно ходит мимо туннеля " +
            "и не видит интернет — тогда оно подцепится к прокси на 127.0.0.1:7890."
          }
        >
          <Toggle value={useSystemProxy} onChange={onToggleSysproxy} />
        </RowWrap>
      </SectionCard>
    </>
  );
}

const DNS_PRESETS: { value: string; label: string }[] = [
  { value: "https://1.1.1.1/dns-query", label: "Cloudflare (1.1.1.1)" },
  { value: "https://8.8.8.8/dns-query", label: "Google (8.8.8.8)" },
  { value: "https://dns.quad9.net/dns-query", label: "Quad9 (9.9.9.9)" },
  { value: "https://dns.adguard-dns.com/dns-query", label: "AdGuard DNS" },
  { value: "https://doh.opendns.com/dns-query", label: "OpenDNS" },
  { value: "tls://1.1.1.1", label: "Cloudflare DoT" },
  { value: "custom", label: "Свой сервер…" },
];

function NetworkSection() {
  const [remote, setRemote] = useSetting<string>(
    "mint.dns.remote",
    "https://1.1.1.1/dns-query"
  );
  // Default for the *local* DNS used to be `https://223.5.5.5/dns-query`
  // (AliDNS, China Telecom). That's a horrible default for non-China
  // users — the endpoint is China-firewalled outbound, so for everyone
  // outside CN it just times out. Match the engine's new default
  // (`configBuilder.ts`) and use Cloudflare 1.1.1.1 — it's also IP-
  // addressed, so it bypasses the system resolver, which matters on
  // RKN-poisoned Russian networks.
  const [local, setLocal] = useSetting<string>(
    "mint.dns.local",
    "https://1.1.1.1/dns-query"
  );

  const isCustomRemote = !DNS_PRESETS.some((p) => p.value === remote) && remote !== "";
  const isCustomLocal = !DNS_PRESETS.some((p) => p.value === local) && local !== "";

  return (
    <SectionCard icon={Globe} title="DNS resolvers">
      <RowWrap
        label="DNS для VPN-трафика"
        desc="Запросы идут через туннель. По умолчанию — Cloudflare 1.1.1.1."
      >
        <div className="flex flex-col gap-1.5 items-end">
          <Dropdown
            value={isCustomRemote ? "custom" : remote}
            options={DNS_PRESETS}
            onChange={(v) => {
              if (v === "custom") {
                setRemote(isCustomRemote ? remote : "https://");
              } else {
                setRemote(v);
              }
            }}
          />
          {isCustomRemote && (
            <input
              value={remote}
              onChange={(e) => setRemote(e.target.value)}
              placeholder="https://example.com/dns-query"
              className="w-[260px] h-8 px-2 rounded-md bg-white/[0.04] border border-white/10 text-[13px] text-white/90 outline-none focus:border-[rgba(var(--accent-rgb),0.55)]"
            />
          )}
        </div>
      </RowWrap>
      <RowWrap
        label="DNS для локальной сети"
        desc="Используется до подключения и для прямых запросов. Лучше IP-DoH (1.1.1.1) чтобы обойти подмену DNS у провайдера."
      >
        <div className="flex flex-col gap-1.5 items-end">
          <Dropdown
            value={isCustomLocal ? "custom" : local}
            options={DNS_PRESETS}
            onChange={(v) => {
              if (v === "custom") {
                setLocal(isCustomLocal ? local : "https://");
              } else {
                setLocal(v);
              }
            }}
          />
          {isCustomLocal && (
            <input
              value={local}
              onChange={(e) => setLocal(e.target.value)}
              placeholder="https://example.com/dns-query"
              className="w-[260px] h-8 px-2 rounded-md bg-white/[0.04] border border-white/10 text-[13px] text-white/90 outline-none focus:border-[rgba(var(--accent-rgb),0.55)]"
            />
          )}
        </div>
      </RowWrap>
      <div className="pt-2 text-[12px] text-white/40">
        Применяется при следующем подключении. Если подключён — переподключись для обновления.
      </div>
    </SectionCard>
  );
}

function ConnectionSection() {
  const [pingMode, setPingMode] = useSetting<string>("mint.pingMode", "ping");
  return (
    <>
      <SectionCard icon={Layers} title="Multi-hop">
        <div className="pt-1">
          <MultiHopCard />
        </div>
      </SectionCard>
      <SectionCard icon={Wifi} title="Пинг в списке серверов">
        <RowWrap label="У подключённого сервера показывать тот же пинг, что в плашке (туннельный)">
          <Toggle
            value={pingMode === "ping"}
            onChange={(v) => setPingMode(v ? "ping" : "ms")}
          />
        </RowWrap>
      </SectionCard>
    </>
  );
}

function Toggle({
  value,
  onChange,
  disabled,
}: {
  value: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={() => !disabled && onChange(!value)}
      disabled={disabled}
      className={cn(
        "relative w-11 h-6 rounded-full transition-colors",
        value ? "bg-accent-grad shadow-accent-glow" : "bg-white/10",
        disabled && "opacity-50 cursor-not-allowed"
      )}
    >
      <motion.div
        layout
        transition={{ type: "spring", stiffness: 500, damping: 30 }}
        className={cn(
          "absolute top-0.5 w-5 h-5 rounded-full bg-white shadow",
          value ? "right-0.5" : "left-0.5"
        )}
      />
    </button>
  );
}

interface UpdatesSectionProps {
  onCheckForUpdates?: () => Promise<{ version: string } | "uptodate" | "error">;
  onInstallUpdate?: () => void | Promise<void>;
  availableUpdate?: { version: string; notes?: string } | null;
  updateBusy?: "idle" | "downloading" | "installing";
  updateError?: string | null;
}

function UpdatesSection({
  onCheckForUpdates,
  onInstallUpdate,
  availableUpdate,
  updateBusy = "idle",
  updateError,
}: UpdatesSectionProps) {
  const [currentVersion, setCurrentVersion] = useState<string>("");
  const [checking, setChecking] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const info = (await invoke("app_version")) as { version: string };
        setCurrentVersion(info.version);
      } catch {
      }
    })();
  }, []);

  const onCheck = async () => {
    if (!onCheckForUpdates) return;
    setChecking(true);
    setStatus(null);
    try {
      const result = await onCheckForUpdates();
      if (result === "uptodate") setStatus("У вас установлена последняя версия.");
      else if (result === "error") setStatus(null);
      else setStatus(`Доступно обновление до ${result.version}.`);
    } finally {
      setChecking(false);
    }
  };

  return (
    <SectionCard icon={Sparkles} title="Обновления приложения">
      <div className="flex items-center justify-between gap-4 py-3">
        <div className="min-w-0">
          <div className="text-[14px] text-white/90 font-medium">Текущая версия</div>
          <div className="text-[12.5px] text-white/45 mt-0.5">
            Mint VPN {currentVersion || "—"}
          </div>
        </div>
        <button
          onClick={onCheck}
          disabled={checking || updateBusy !== "idle"}
          className="shrink-0 h-9 px-4 inline-flex items-center gap-2 rounded-lg border border-white/[0.08] bg-white/[0.04] hover:bg-white/[0.07] text-[12.5px] font-medium text-white/85 transition disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <RefreshCw size={13} className={cn(checking && "animate-spin")} />
          {checking ? "Проверка…" : "Проверить обновления"}
        </button>
      </div>

      {(availableUpdate || status || updateError) && (
        <div className="py-3 space-y-2">
          {availableUpdate && (
            <div className="flex items-start justify-between gap-3 p-3 rounded-xl bg-accent-soft border-accent-soft border">
              <div className="flex-1 min-w-0">
                <div className="text-[13px] font-semibold text-white">
                  Доступно обновление до {availableUpdate.version}
                </div>
                {availableUpdate.notes && (
                  <div className="text-[12px] text-white/55 mt-1 whitespace-pre-line line-clamp-3">
                    {availableUpdate.notes}
                  </div>
                )}
              </div>
              <button
                onClick={() => onInstallUpdate?.()}
                disabled={updateBusy !== "idle"}
                className="shrink-0 h-8 px-3 rounded-lg bg-accent-grad shadow-accent-glow text-white text-[12.5px] font-medium hover:brightness-110 active:scale-[0.98] transition disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {updateBusy === "downloading"
                  ? "Скачивание…"
                  : updateBusy === "installing"
                    ? "Установка…"
                    : isMobilePlatform()
                      ? "Скачать APK"
                      : "Обновить"}
              </button>
            </div>
          )}
          {!availableUpdate && status && (
            <div className="text-[12.5px] text-white/55 px-1">{status}</div>
          )}
          {updateError && (
            <div className="text-[12.5px] text-rose-300/90 px-1">{updateError}</div>
          )}
        </div>
      )}
    </SectionCard>
  );
}
