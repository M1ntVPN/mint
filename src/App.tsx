import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { TitleBar } from "./components/TitleBar";
import { AppBackground } from "./components/AppBackground";
import { Sidebar, type PageKey } from "./components/Sidebar";
import { Dashboard } from "./components/Dashboard";
import { ProfilesPage } from "./components/Profiles";
import { TunnelingPage } from "./components/Tunneling";
import { SettingsPage } from "./components/Settings";
import { LogsPage } from "./components/Logs";
import type { ConnState } from "./types";
import { useServers } from "./store/servers";
import { useSubscriptions, decodeProfileTitle } from "./store/subscriptions";
import { useFolders } from "./store/folders";
import { useMultiHop } from "./store/multihop";
import { useLogs, parseEngineLine } from "./store/logs";
import { useConnection } from "./store/connection";
import { startEngine, stopEngine, onEngineExit, onEngineLog } from "./engine/engine";
import { subscribeTraffic, urlTest } from "./engine/clashApi";
import { probeServer } from "./utils/ping";
import { notify } from "./utils/notify";
import { invoke } from "@tauri-apps/api/core";
import { useSettingsStore } from "./store/settings";
import { useTunneling, type AppRule, type AppFolder, type NetRule, type TunnelMode } from "./store/tunneling";
import { ConfirmDialog } from "./components/ConfirmDialog";
import { MobileNav } from "./components/MobileNav";
import { useIsMobile } from "./utils/useIsMobile";
import { isMobile as isMobilePlatform } from "./utils/platform";
import { checkAndroidUpdate, type AndroidReleaseInfo } from "./utils/androidUpdater";

function serializeTunnelingConfig(s: {
  mode: TunnelMode;
  apps: AppRule[];
  nets: NetRule[];
  folders: AppFolder[];
}): string {
  const apps = s.apps
    .map((a) => `${a.id}|${a.via}|${a.folderId ?? "_"}`)
    .sort()
    .join(",");
  const nets = s.nets
    .map((n) => `${n.id}|${n.via}|${n.pattern}`)
    .sort()
    .join(",");
  const folders = s.folders
    .map((f) => f.id)
    .sort()
    .join(",");
  return `${s.mode}::${apps}::${nets}::${folders}`;
}

function App() {
  const [page, setPage] = useState<PageKey>("home");
  const [pendingDeepLink, setPendingDeepLink] = useState<string | null>(null);
  const [state, setState] = useState<ConnState>("disconnected");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [uptime, setUptime] = useState(0);
  const [ping, setPing] = useState(0);
  const [down, setDown] = useState(0);
  const [up, setUp] = useState(0);
  const [update, setUpdate] = useState<{ version: string; notes?: string } | null>(null);
  const [updateBusy, setUpdateBusy] = useState<"idle" | "downloading" | "installing">(
    "idle"
  );
  const [updateProgress, setUpdateProgress] = useState<
    { done: number; total: number; percent: number } | null
  >(null);
  const [updateError, setUpdateError] = useState<string | null>(null);
  const [connectError, setConnectError] = useState<string | null>(null);
  const [pendingSwitchId, setPendingSwitchId] = useState<string | null>(null);
  const [pendingClose, setPendingClose] = useState<boolean>(false);

  const tickRef = useRef<number | null>(null);
  const selectedIdRef = useRef<string | null>(null);
  const [hasRealEngine, setHasRealEngine] = useState(false);

  useEffect(() => {
    useConnection.getState().setState(state);
  }, [state]);

  const autoConnectedRef = useRef(false);
  const serverCount = useServers((s) => s.servers.length);
  useEffect(() => {
    if (isMobilePlatform()) return;
    if (autoConnectedRef.current) return;
    const vals = useSettingsStore.getState().values;
    if (vals["mint.autoConnect"] !== true) return;
    if (state !== "disconnected") return;
    const servers = useServers.getState().servers;
    if (servers.length === 0) return;
    autoConnectedRef.current = true;
    const lastId = vals["mint.lastServerId"] as string | undefined;
    const target = lastId && servers.find((s) => s.id === lastId)
      ? lastId
      : servers[0].id;
    setSelectedId((id) => id ?? target);
    window.setTimeout(() => {
      toggle().catch(() => undefined);
    }, 250);
  }, [state, serverCount]);

  useEffect(() => {
    if (tickRef.current) window.clearInterval(tickRef.current);
    let unsubTraffic: (() => void) | undefined;
    let pingTimer: number | undefined;

    if (state === "connected" && hasRealEngine) {
      tickRef.current = window.setInterval(() => setUptime((u) => u + 1), 1000);

      unsubTraffic = subscribeTraffic((sample) => {
        setDown(sample.down);
        setUp(sample.up);
      });
      const probe = async () => {
        const ms = await urlTest("proxy");
        if (ms != null && ms > 0) {
          // Show tunnel RTT in the dashboard StatsCards card.
          // Don't write it back to the server's row ping — that row
          // shows the *direct* (pre-VPN) latency, and overwriting it
          // with the via-tunnel RTT made the list lie about which
          // server is actually closest to the user.
          setPing(ms);
        }
      };
      probe();
      pingTimer = window.setInterval(probe, 5000);
    }

    return () => {
      if (tickRef.current) window.clearInterval(tickRef.current);
      unsubTraffic?.();
      if (pingTimer != null) window.clearInterval(pingTimer);
    };
  }, [state, hasRealEngine]);

  const savedServers = useServers((s) => s.servers);
  const subscriptions = useSubscriptions((s) => s.list);
  const { enabled: multihopOn, entryId, exitId } = useMultiHop();

  useEffect(() => {
    if (subscriptions.length === 0) return;
    const fState = useFolders.getState();
    const sState = useSubscriptions.getState();
    const needsTitleFix = (n: string) => /^base64\s*[:,]\s*/i.test(n.trim());
    for (const sub of subscriptions) {
      if (needsTitleFix(sub.name)) {
        const fixed = decodeProfileTitle(sub.name);
        if (fixed && fixed !== sub.name) sState.update(sub.id, { name: fixed });
      }
      if (fState.findBySubscription(sub.id)) {
        const f = fState.findBySubscription(sub.id);
        if (f && needsTitleFix(f.name)) {
          const fixed = decodeProfileTitle(f.name);
          if (fixed && fixed !== f.name) fState.rename(f.id, fixed);
        }
        continue;
      }
      const ids = savedServers
        .filter((s) => s.subscriptionId === sub.id)
        .map((s) => s.id);
      if (ids.length === 0) continue;
      const folderName = needsTitleFix(sub.name)
        ? decodeProfileTitle(sub.name) ?? sub.name
        : sub.name;
      const folderId = fState.create(folderName, { subscriptionId: sub.id });
      fState.setServerIds(folderId, ids);
    }
  }, [subscriptions]);

  useEffect(() => {
    if (selectedId == null && savedServers.length > 0) {
      setSelectedId(savedServers[0].id);
    }
  }, [savedServers, selectedId]);

  useEffect(() => {
    selectedIdRef.current = selectedId;
  }, [selectedId]);

  const didProxyCleanRef = useRef(false);
  useEffect(() => {
    if (didProxyCleanRef.current) return;
    didProxyCleanRef.current = true;
    if (!isMobilePlatform()) {
      // Conditional cleanup — only undoes a *Mint-installed* stale local
      // proxy on launch. The previous unconditional sysproxy_clear() also
      // wiped any unrelated corporate / third-party proxy the user may
      // have configured outside of Mint.
      invoke("sysproxy_clear_if_local").catch(() => undefined);
    }
  }, []);

  const didPlaceholderPurgeRef = useRef(false);
  useEffect(() => {
    if (didPlaceholderPurgeRef.current) return;
    didPlaceholderPurgeRef.current = true;
    const all = useServers.getState().servers;
    const junk = all.filter((s) => {
      const addr = (s.address ?? "").toLowerCase();
      return (
        addr.includes("00000000-0000-0000-0000-000000000000") ||
        /@0\.0\.0\.0(:|$)/.test(addr) ||
        /%20not%20supported|app%20not%20supported|happ(%20|-)required|upgrade%20required/i.test(
          s.address ?? ""
        )
      );
    });
    if (junk.length === 0) return;
    const remove = useServers.getState().remove;
    for (const s of junk) remove(s.id);
  }, []);

  const pingedSetRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (state === "connected" || state === "connecting") return;
    const setPing = useServers.getState().setPing;
    const STALE_MS = 5 * 60 * 1000;
    const now = Date.now();
    const todo = savedServers.filter(
      (s) =>
        !pingedSetRef.current.has(s.id) ||
        s.pingedAt == null ||
        now - s.pingedAt > STALE_MS
    );
    if (todo.length === 0) return;
    let cancelled = false;
    const concurrency = 6;
    let i = 0;
    const next = async () => {
      while (!cancelled) {
        const idx = i++;
        if (idx >= todo.length) return;
        const s = todo[idx];
        pingedSetRef.current.add(s.id);
        try {
          const ms = await probeServer(s);
          if (!cancelled) setPing(s.id, ms);
        } catch {
          if (!cancelled) setPing(s.id, null);
        }
      }
    };
    const workers = Array.from(
      { length: Math.min(concurrency, todo.length) },
      () => next()
    );
    Promise.all(workers).catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [savedServers.map((s) => s.id).join("|"), state]);

  const toggleInFlightRef = useRef(false);

  const doConnect = async (overrideExitId?: string) => {
    const log = useLogs.getState().push;
    const ts = () => new Date().toISOString().slice(11, 23);
    // Read latest server list from the store rather than the closure so
    // that connect-after-state-change (e.g. profile context-menu, switch
    // confirmation dialog) doesn't fire with a stale `selectedId`.
    const allServers = useServers.getState().servers;
    const targetId =
      overrideExitId ?? selectedIdRef.current ?? selectedId;
    const exit = allServers.find((s) => s.id === targetId) ?? null;
    const entry = multihopOn
      ? allServers.find((s) => s.id === entryId) ?? null
      : null;
    const realExit = multihopOn
      ? allServers.find((s) => s.id === exitId) ?? exit
      : exit;

    if (!realExit) return;
    const inTauri = !!(window as unknown as { __TAURI_INTERNALS__?: unknown })
      .__TAURI_INTERNALS__;
    if (!inTauri) {
      console.warn("Cannot connect — Tauri runtime not available");
      const msg =
        "Tauri runtime недоступен — это окно открыто в обычном браузере, а не из Mint.exe.";
      setConnectError(msg);
      log({ t: ts(), lvl: "WARN", src: "ui", msg });
      return;
    }
    setConnectError(null);

    log({
      t: ts(),
      lvl: "INFO",
      src: "ui",
      msg: `Подключение к ${realExit.name}${entry ? ` через ${entry.name}` : ""}`,
    });
    setState("connecting");
    try {
      if (isMobilePlatform()) {
        const { vpnPrepare } = await import("./utils/vpn");
        const prep = await vpnPrepare();
        if (!prep.granted) {
          setState("disconnected");
          const m = "Доступ к VPN не предоставлен. Откройте настройки Android и разрешите Mint работать как VPN.";
          setConnectError(m);
          log({ t: ts(), lvl: "WARN", src: "ui", msg: m });
          return;
        }
      }
      await startEngine({ exit: realExit, entry });
      setHasRealEngine(true);
      setState("connected");
      useSettingsStore.getState().set("mint.lastServerId", targetId ?? realExit.id);
      setUptime(0);
      setDown(0);
      setUp(0);
      setPing(0);
      log({
        t: ts(),
        lvl: "INFO",
        src: "engine",
        msg: `Туннель поднят: ${realExit.protocol.toUpperCase()} → ${realExit.address}`,
      });
      if (!isMobilePlatform()) {
        const killEnabled =
          useSettingsStore.getState().values["mint.killSwitch"] === true;
        if (killEnabled) {
          try {
            await invoke("killswitch_enable");
          } catch (err) {
            console.warn("killswitch_enable failed", err);
          }
        }
      }
      notify("Mint VPN", `Подключено: ${realExit.name}`);
    } catch (e) {
      console.error("startEngine failed", e);
      const detail =
        typeof e === "string" ? e : (e as Error)?.message ?? "ошибка";
      setConnectError(`Не удалось подключиться: ${detail}`);
      log({
        t: ts(),
        lvl: "ERROR",
        src: "engine",
        msg: `startEngine: ${detail}`,
      });
      // Defensive cleanup — if the engine partly came up (e.g. sing-box
      // started but TUN setup failed mid-way), Windows can be left with
      // sysproxy=127.0.0.1:7890 even though no working VPN is behind it,
      // which kills the user's internet until the next successful
      // connect/disconnect cycle. Always tear those side-effects down.
      if (!isMobilePlatform()) {
        try {
          await invoke("sysproxy_clear");
        } catch {
        }
        try {
          await invoke("singbox_kill_orphans");
        } catch {
        }
      }
      setState("disconnected");
      notify("Mint VPN", `Ошибка подключения: ${detail}`);
    }
  };

  const doDisconnect = async (opts?: { silent?: boolean; clearKillswitch?: boolean }) => {
    const silent = !!opts?.silent;
    const clearKill = opts?.clearKillswitch !== false;
    const log = useLogs.getState().push;
    const ts = () => new Date().toISOString().slice(11, 23);
    if (!silent) {
      log({ t: ts(), lvl: "INFO", src: "ui", msg: "Запрошено отключение" });
    }
    setState("disconnecting");
    try {
      await stopEngine();
    } catch {
    }
    if (clearKill && !isMobilePlatform()) {
      try {
        await invoke("killswitch_disable");
      } catch {
      }
    }
    setHasRealEngine(false);
    if (!silent) {
      setTimeout(() => setState("disconnected"), 600);
      notify("Mint VPN", "Отключено");
    } else {
      setState("disconnected");
    }
  };

  const toggle = async () => {
    if (toggleInFlightRef.current) return;
    toggleInFlightRef.current = true;
    try {
      if (state === "disconnected") {
        await doConnect();
      } else if (state === "connected") {
        await doDisconnect();
      }
    } finally {
      window.setTimeout(() => {
        toggleInFlightRef.current = false;
      }, 400);
    }
  };

  const doRestartInternal = async (overrideExitId?: string) => {
    await doDisconnect({ silent: true, clearKillswitch: false });
    await new Promise((r) => window.setTimeout(r, 500));
    await doConnect(overrideExitId);
  };

  const restartTunnel = async (overrideExitId?: string) => {
    if (toggleInFlightRef.current) return;
    toggleInFlightRef.current = true;
    try {
      await doRestartInternal(overrideExitId);
    } finally {
      window.setTimeout(() => {
        toggleInFlightRef.current = false;
      }, 400);
    }
  };

  // Atomic select-and-connect for entry points outside the dashboard
  // (Profiles context-menu, deep links, etc.). Using `toggle()` after
  // `setSelectedId` would race with React's state batching and reconnect
  // to the *previous* server.
  const connectTo = async (id: string) => {
    selectedIdRef.current = id;
    setSelectedId(id);
    if (toggleInFlightRef.current) return;
    if (state === "connected") {
      const confirmActive =
        useSettingsStore.getState().values["mint.confirmServerSwitch"] !== false;
      if (confirmActive) {
        setPendingSwitchId(id);
        return;
      }
      await restartTunnel(id);
      return;
    }
    if (state === "disconnected") {
      toggleInFlightRef.current = true;
      try {
        await doConnect(id);
      } finally {
        window.setTimeout(() => {
          toggleInFlightRef.current = false;
        }, 400);
      }
    }
  };

  const requestSelectServer = (id: string) => {
    if (id === selectedId) return;
    const confirmActive =
      useSettingsStore.getState().values["mint.confirmServerSwitch"] !== false;
    if (state === "connected" && confirmActive) {
      setPendingSwitchId(id);
      return;
    }
    setSelectedId(id);
  };

  const acceptSwitchPending = () => {
    if (!pendingSwitchId) return;
    const id = pendingSwitchId;
    setPendingSwitchId(null);
    selectedIdRef.current = id;
    setSelectedId(id);
    if (state === "connected") {
      // Pass the new id explicitly — `restartTunnel` would otherwise
      // reach into a stale render closure and reconnect to the *old*
      // selection, which is the "switching server doesn't switch" bug.
      window.setTimeout(() => {
        restartTunnel(id).catch(() => undefined);
      }, 0);
    }
  };

  useEffect(() => {
    let unlistenExit: (() => void) | undefined;
    let unlistenLog: (() => void) | undefined;
    const push = useLogs.getState().push;
    (async () => {
      try {
        unlistenExit = await onEngineExit((code) => {
          setHasRealEngine(false);
          setState("disconnected");
          const t = new Date().toISOString().slice(11, 23);
          const unexpected = !(code === 0 || code == null);
          invoke("sysproxy_clear").catch(() => undefined);
          const killEnabled =
            useSettingsStore.getState().values["mint.killSwitch"] === true;
          if (!unexpected) {
            invoke("killswitch_disable").catch(() => undefined);
          } else if (killEnabled) {
            push({
              t,
              lvl: "WARN",
              src: "engine",
              msg:
                "Killswitch активен — туннель упал, доступ в сеть заблокирован. " +
                "Подключитесь снова или выключите killswitch в Настройках.",
            });
          }
          push({
            t,
            lvl: unexpected ? "ERROR" : "INFO",
            src: "engine",
            msg: unexpected
              ? `sing-box завершился с кодом ${code}`
              : "sing-box остановлен",
          });
          if (unexpected) {
            notify("Mint VPN", `Туннель упал: ${code}`);
          }
        });
        unlistenLog = await onEngineLog((line) => {
          push(parseEngineLine(line));
        });
      } catch {
      }
    })();
    return () => {
      unlistenExit?.();
      unlistenLog?.();
    };
  }, []);

  useEffect(() => {
    if (!isMobilePlatform()) return;
    let unlisten: (() => void) | undefined;
    const log = useLogs.getState().push;
    (async () => {
      try {
        const { onVpnEvent } = await import("./utils/vpn");
        unlisten = await onVpnEvent((event, payload) => {
          const t = new Date().toISOString().slice(11, 23);
          if (event === "error") {
            const msg =
              (payload as { message?: string })?.message ?? "ошибка туннеля";
            setHasRealEngine(false);
            setState("disconnected");
            setConnectError(msg);
            log({ t, lvl: "ERROR", src: "engine", msg: `vpn_error: ${msg}` });
            notify("Mint VPN", `Ошибка: ${msg}`);
          } else if (event === "stopped") {
            setHasRealEngine(false);
            setState("disconnected");
            log({ t, lvl: "INFO", src: "engine", msg: "Туннель остановлен" });
          }
        });
      } catch {}
    })();
    return () => {
      unlisten?.();
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { emit } = await import("@tauri-apps/api/event");
        if (cancelled) return;
        await emit("vpn-state", state);
      } catch {
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [state]);

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    (async () => {
      try {
        const { listen } = await import("@tauri-apps/api/event");
        unlisten = await listen("tray-toggle", () => toggle());
      } catch {
      }
    })();
    return () => {
      unlisten?.();
    };
  }, [state]);

  useEffect(() => {
    // Re-apply tunneling config to the running engine when the user
    // changes mode / rules / folders. The naive version of this only
    // called `restartTunnel()` on the trailing edge of a 600ms debounce
    // — which silently dropped any change made *during* the restart
    // because `restartTunnel` early-returns when `toggleInFlightRef` is
    // set. The user reported this as "чтобы туннелирование сработало
    // надо несколько раз выключить сервер": they would toggle a rule,
    // the restart kicks off, they toggle a second rule mid-restart, and
    // the second toggle never made it into the rebuilt config.
    //
    // We fix it by tracking a "dirty since last restart" flag; if the
    // flag is set when restart finishes, we kick off another one. The
    // signature is recomputed inside the scheduler so we always rebuild
    // with whatever the latest store contents are at the moment we
    // decide to restart.
    let prev = serializeTunnelingConfig(useTunneling.getState());
    let timer: number | undefined;
    let restarting = false;
    let dirty = false;

    const scheduleRestart = () => {
      if (timer != null) window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        timer = undefined;
        if (state !== "connected") return;
        if (restarting) {
          // A previous restart is still in flight. Mark the config
          // dirty; runRestart's tail will pick it up.
          dirty = true;
          return;
        }
        void runRestart();
      }, 600);
    };

    const runRestart = async () => {
      restarting = true;
      try {
        do {
          dirty = false;
          const log = useLogs.getState().push;
          const t = new Date().toISOString().slice(11, 23);
          log({
            t,
            lvl: "INFO",
            src: "engine",
            msg: "Перезапуск туннеля: изменены настройки туннелирования",
          });
          // Wait for any user-initiated toggle to finish, then claim
          // the lock ourselves so the internal restart doesn't race
          // with button presses.
          while (toggleInFlightRef.current) {
            await new Promise((r) => window.setTimeout(r, 100));
          }
          toggleInFlightRef.current = true;
          try {
            await doRestartInternal();
          } catch {
            break;
          } finally {
            toggleInFlightRef.current = false;
          }
        } while (dirty);
      } finally {
        restarting = false;
      }
    };

    const unsub = useTunneling.subscribe((next) => {
      const sig = serializeTunnelingConfig(next);
      if (sig === prev) return;
      prev = sig;
      if (state !== "connected") return;
      dirty = true;
      scheduleRestart();
    });
    return () => {
      unsub();
      if (timer != null) window.clearTimeout(timer);
    };
  }, [state]);

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    (async () => {
      try {
        const { listen } = await import("@tauri-apps/api/event");
        unlisten = await listen<string>("deep-link", (event) => {
          const url = event.payload;
          if (!url) return;
          setPage("profiles");
          setPendingDeepLink(url);
        });
      } catch {
      }
    })();
    return () => {
      unlisten?.();
    };
  }, []);

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    (async () => {
      try {
        const { listen } = await import("@tauri-apps/api/event");
        unlisten = await listen<{
          host: string;
          resolved?: string;
          dns_ms?: number;
          attempts_ms?: number[];
          errors?: string[];
          error?: string;
          stage?: string;
          args_attempts?: number | null;
          args_timeout_ms?: number | null;
        }>("ping-diag", (event) => {
          const p = event.payload;
          const push = useLogs.getState().push;
          const t = new Date().toISOString().slice(11, 23);
          if (p.error) {
            push({
              t,
              lvl: "WARN",
              src: "ping",
              msg: `${p.host}: ${p.error}`,
            });
            return;
          }
          const ms = p.attempts_ms ?? [];
          const median =
            ms.length > 0 ? [...ms].sort((a, b) => a - b)[Math.floor(ms.length / 2)] : null;
          const argsTrace =
            p.args_attempts == null && p.args_timeout_ms == null
              ? " args=defaults"
              : ` args=attempts:${p.args_attempts ?? "—"} timeoutMs:${p.args_timeout_ms ?? "—"}`;
          push({
            t,
            lvl: ms.length > 0 ? "INFO" : "WARN",
            src: "ping",
            msg: `${p.host} → ${p.resolved ?? "?"} attempts=[${ms.join(", ")}]ms median=${median ?? "—"}ms${
              p.errors && p.errors.length ? ` errs=${p.errors.join("|")}` : ""
            }${argsTrace}`,
          });
        });
      } catch {
      }
    })();
    return () => {
      unlisten?.();
    };
  }, []);

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    (async () => {
      try {
        const { listen } = await import("@tauri-apps/api/event");
        unlisten = await listen("close-requested", async () => {
          const vals = useSettingsStore.getState().values;
          const closeToTray = vals["mint.closeToTray"] !== false;
          const confirmActive =
            vals["mint.confirmCloseWhileConnected"] !== false;
          const vpnActive = useConnection.getState().state === "connected";

          if (closeToTray) {
            try {
              const { getCurrentWebviewWindow } = await import(
                "@tauri-apps/api/webviewWindow"
              );
              await getCurrentWebviewWindow().hide();
            } catch {
            }
            return;
          }

          if (vpnActive && confirmActive) {
            setPendingClose(true);
            return;
          }

          try {
            await invoke("quit_app");
          } catch {
          }
        });
      } catch {
      }
    })();
    return () => {
      unlisten?.();
    };
  }, []);

  const updateRef = useRef<unknown>(null);
  const androidUpdateRef = useRef<AndroidReleaseInfo | null>(null);

  useEffect(() => {
    let cancelled = false;
    const doCheck = async () => {
      try {
        if (isMobilePlatform()) {
          const info = (await invoke("app_version")) as { version: string };
          const release = await checkAndroidUpdate(info.version);
          if (cancelled || !release) return;
          androidUpdateRef.current = release;
          setUpdate({ version: release.version, notes: release.notes });
          return;
        }
        const { check } = await import("@tauri-apps/plugin-updater");
        const result = await check();
        if (cancelled || !result) return;
        updateRef.current = result;
        const r = result as { version: string; body?: string | null };
        setUpdate({ version: r.version, notes: r.body ?? undefined });
      } catch {
      }
    };
    doCheck();
    const interval = window.setInterval(doCheck, 30 * 60 * 1000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, []);

  const installUpdate = async () => {
    const log = useLogs.getState().push;
    const ts = () => new Date().toISOString().slice(11, 23);
    setUpdateError(null);
    setUpdateProgress(null);
    if (isMobilePlatform()) {
      // Android: hand off to the system browser to download the APK from
      // GitHub Releases. The user installs it themselves (Android security
      // model — no silent install for sideloaded apps).
      const release = androidUpdateRef.current;
      if (!release) {
        setUpdateError("Не удалось получить ссылку на APK.");
        return;
      }
      try {
        const { open } = await import("@tauri-apps/plugin-shell");
        await open(release.apkUrl);
      } catch (e) {
        const detail =
          typeof e === "string" ? e : (e as Error)?.message ?? "неизвестная ошибка";
        setUpdateError(`Не удалось открыть ссылку: ${detail}`);
        log({
          t: ts(),
          lvl: "ERR",
          src: "updater",
          msg: `android open(apk) failed: ${detail}`,
        });
      }
      return;
    }
    type UpdateHandle = {
      downloadAndInstall: (
        cb?: (event: {
          event: "Started" | "Progress" | "Finished";
          data?: { contentLength?: number; chunkLength?: number };
        }) => void
      ) => Promise<void>;
    };
    try {
      let inst = updateRef.current as UpdateHandle | null;
      if (!inst) {
        const { check } = await import("@tauri-apps/plugin-updater");
        const r = await check();
        if (r) {
          inst = r as UpdateHandle;
          updateRef.current = r;
        }
      }
      if (!inst) {
        setUpdateError("Не удалось получить информацию об обновлении.");
        return;
      }
      if (state === "connected" || state === "connecting") {
        try {
          await doDisconnect({ silent: true });
        } catch (e) {
          log({
            t: ts(),
            lvl: "WARN",
            src: "updater",
            msg: `pre-update disconnect failed: ${(e as Error)?.message ?? e}`,
          });
        }
      }
      try {
        await invoke("prepare_for_update");
      } catch (e) {
        log({
          t: ts(),
          lvl: "WARN",
          src: "updater",
          msg: `prepare_for_update failed: ${(e as Error)?.message ?? e}`,
        });
      }
      setUpdateBusy("downloading");
      let downloaded = 0;
      let total = 0;
      let lastPercent = 0;
      let lastFlush = 0;
      let scheduled = false;
      const flush = () => {
        scheduled = false;
        lastFlush = performance.now();
        const t = total > 0 ? total : downloaded;
        if (t <= 0) return;
        const raw = Math.min(100, Math.round((downloaded / t) * 100));
        if (raw > lastPercent) lastPercent = raw;
        setUpdateProgress({ done: downloaded, total: t, percent: lastPercent });
      };
      const schedule = () => {
        if (scheduled) return;
        const elapsed = performance.now() - lastFlush;
        if (elapsed >= 50) {
          flush();
        } else {
          scheduled = true;
          setTimeout(flush, 50 - elapsed);
        }
      };
      await inst.downloadAndInstall((event) => {
        if (event.event === "Started") {
          const cl = event.data?.contentLength ?? 0;
          if (cl > total) total = cl;
          downloaded = 0;
          lastPercent = 0;
          setUpdateProgress({ done: 0, total, percent: 0 });
          lastFlush = performance.now();
        } else if (event.event === "Progress") {
          const c = event.data?.chunkLength ?? 0;
          if (c > 0) downloaded += c;
          schedule();
        } else if (event.event === "Finished") {
          setUpdateBusy("installing");
          const final = total || downloaded;
          setUpdateProgress({ done: final, total: final, percent: 100 });
        }
      });
      try {
        const { relaunch } = await import("@tauri-apps/plugin-process");
        await relaunch();
      } catch (e) {
        log({
          t: ts(),
          lvl: "WARN",
          src: "updater",
          msg: `relaunch failed: ${(e as Error)?.message ?? e}`,
        });
      }
    } catch (e) {
      const detail = typeof e === "string" ? e : (e as Error)?.message ?? "неизвестная ошибка";
      setUpdateError(`Установка обновления не удалась: ${detail}`);
      log({
        t: ts(),
        lvl: "ERR",
        src: "updater",
        msg: `installUpdate failed: ${detail}`,
      });
    } finally {
      setUpdateBusy("idle");
    }
  };

  const checkForUpdates = async (): Promise<{ version: string } | "uptodate" | "error"> => {
    const log = useLogs.getState().push;
    const ts = () => new Date().toISOString().slice(11, 23);
    setUpdateError(null);
    if (isMobilePlatform()) {
      try {
        const info = (await invoke("app_version")) as { version: string };
        // Manual check bypasses the cache so the user gets fresh data.
        const release = await checkAndroidUpdate(info.version, { force: true });
        if (!release) return "uptodate";
        androidUpdateRef.current = release;
        setUpdate({ version: release.version, notes: release.notes });
        return { version: release.version };
      } catch (e) {
        const detail =
          typeof e === "string" ? e : (e as Error)?.message ?? "неизвестная ошибка";
        setUpdateError(`Проверка обновлений не удалась: ${detail}`);
        log({
          t: ts(),
          lvl: "ERR",
          src: "updater",
          msg: `android checkForUpdates failed: ${detail}`,
        });
        return "error";
      }
    }
    try {
      const { check } = await import("@tauri-apps/plugin-updater");
      const result = await check();
      if (!result) return "uptodate";
      updateRef.current = result;
      const r = result as { version: string; body?: string | null };
      setUpdate({ version: r.version, notes: r.body ?? undefined });
      return { version: r.version };
    } catch (e) {
      const detail = typeof e === "string" ? e : (e as Error)?.message ?? "неизвестная ошибка";
      setUpdateError(`Проверка обновлений не удалась: ${detail}`);
      log({
        t: ts(),
        lvl: "ERR",
        src: "updater",
        msg: `checkForUpdates failed: ${detail}`,
      });
      return "error";
    }
  };

  const pendingSwitchServer = pendingSwitchId
    ? savedServers.find((s) => s.id === pendingSwitchId) ?? null
    : null;

  const isMobile = useIsMobile();

  return (
    <div
      className="h-full w-full flex flex-col bg-ink-950 text-white relative overflow-hidden grain"
      style={
        isMobile
          ? { paddingTop: "env(safe-area-inset-top)" }
          : undefined
      }
    >
      <AppBackground />

      {!isMobile && <TitleBar />}

      <div
        className={
          isMobile
            ? "flex flex-1 overflow-hidden relative flex-col"
            : "flex flex-1 overflow-hidden relative"
        }
      >
        {!isMobile && (
          <Sidebar
            page={page}
            setPage={setPage}
            state={state}
            update={update}
            updateBusy={updateBusy}
            updateProgress={updateProgress}
            updateError={updateError}
            onInstallUpdate={installUpdate}
            onDismissUpdate={() => setUpdate(null)}
            onDismissUpdateError={() => setUpdateError(null)}
          />
        )}

        <main className="flex-1 relative overflow-hidden">
          <AnimatePresence mode="wait">
            <motion.div
              key={page}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.22 }}
              className="absolute inset-0"
            >
              {page === "home" && (
                <Dashboard
                  state={state}
                  toggle={toggle}
                  uptime={uptime}
                  ping={ping}
                  down={down}
                  up={up}
                  selectedId={selectedId}
                  setSelectedId={requestSelectServer}
                  connectError={connectError}
                  dismissConnectError={() => setConnectError(null)}
                />
              )}
              {page === "profiles" && (
                <ProfilesPage
                  pendingDeepLink={pendingDeepLink}
                  consumeDeepLink={() => setPendingDeepLink(null)}
                  onConnectTo={(id) => {
                    connectTo(id).catch(() => undefined);
                  }}
                  state={state}
                  selectedId={selectedId}
                />
              )}
              {page === "tunneling" && <TunnelingPage />}
              {page === "settings" && (
                <SettingsPage
                  onCheckForUpdates={checkForUpdates}
                  onInstallUpdate={installUpdate}
                  availableUpdate={update}
                  updateBusy={updateBusy}
                  updateError={updateError}
                />
              )}
              {page === "logs" && <LogsPage />}
            </motion.div>
          </AnimatePresence>
        </main>

        {isMobile && <MobileNav page={page} setPage={setPage} />}
      </div>

      <ConfirmDialog
        open={pendingSwitchServer !== null}
        title={
          pendingSwitchServer
            ? `Переключиться на ${pendingSwitchServer.name}?`
            : "Сменить сервер?"
        }
        description="VPN сейчас активен. Mint отключится от текущего сервера и переподключится к выбранному."
        confirmLabel="Переподключиться"
        cancelLabel="Остаться"
        onConfirm={acceptSwitchPending}
        onCancel={() => setPendingSwitchId(null)}
      />

      <ConfirmDialog
        open={pendingClose}
        title="VPN активен — закрыть Mint?"
        description="Туннель будет отключён, и приложение полностью завершит работу."
        confirmLabel="Отключить и выйти"
        cancelLabel="Не закрывать"
        destructive
        onConfirm={async () => {
          setPendingClose(false);
          try {
            const { getCurrentWebviewWindow } = await import(
              "@tauri-apps/api/webviewWindow"
            );
            await getCurrentWebviewWindow().hide();
          } catch {
          }
          try {
            await invoke("quit_app");
          } catch {
          }
        }}
        onCancel={() => {
          setPendingClose(false);
        }}
      />
    </div>
  );
}

export default App;
