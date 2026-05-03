
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { UnlistenFn } from "@tauri-apps/api/event";
import type { SavedServer } from "../store/servers";
import {
  buildSingboxConfig,
  MIXED_INBOUND_PORT,
  setClashApiPort,
} from "./configBuilder";
import { useSettingsStore } from "../store/settings";
import { useTunneling } from "../store/tunneling";
import { useLogs } from "../store/logs";
import { isAndroid } from "../utils/platform";
import { vpnStart, vpnStop, vpnStatus } from "../utils/vpn";

export interface StartOptions {
  exit: SavedServer;
  entry?: SavedServer | null;
}

function resolveDns(): { remoteDns?: string; localDns?: string } {
  const v = useSettingsStore.getState().values;
  const remote = v["mint.dns.remote"];
  const local = v["mint.dns.local"];
  return {
    remoteDns: typeof remote === "string" && remote ? remote : undefined,
    localDns: typeof local === "string" && local ? local : undefined,
  };
}

export async function startEngine(opts: StartOptions): Promise<void> {
  if (!isAndroid()) {
    try {
      await invoke("singbox_kill_orphans");
    } catch {
    }
  }
  let clashApiPort: number | null = null;
  if (!isAndroid()) {
    try {
      const picked = await invoke<number | null>("singbox_pick_free_clash_port");
      clashApiPort = typeof picked === "number" ? picked : null;
    } catch {
    }
  }
  setClashApiPort(clashApiPort);
  const dns = resolveDns();
  const t = useTunneling.getState();
  {
    const log = useLogs.getState().push;
    const ts = new Date().toISOString().slice(11, 23);
    log({
      t: ts,
      lvl: "INFO",
      src: "engine",
      msg:
        `Туннелирование: режим=${t.mode}, ` +
        `приложений=${t.apps.length}, сетевых правил=${t.nets.length}`,
    });
  }
  const config = buildSingboxConfig({
    exit: opts.exit,
    entry: opts.entry,
    clashApiPort,
    tunneling: { mode: t.mode, apps: t.apps, nets: t.nets },
    ...dns,
  });
  const profileName = opts.exit.name || "Mint VPN";

  let vpnOpts: { allowedApps?: string[]; disallowedApps?: string[] } | undefined;
  if (isAndroid() && t.mode !== "full" && t.apps.length > 0) {
    const withPkg = t.apps.filter((a) => a.packageName);
    if (t.mode === "whitelist") {
      vpnOpts = { allowedApps: withPkg.filter((a) => a.via === "vpn").map((a) => a.packageName!) };
    } else {
      vpnOpts = { disallowedApps: withPkg.filter((a) => a.via === "bypass").map((a) => a.packageName!) };
    }
  }

  const status = await vpnStart(config, profileName, vpnOpts);
  if (status.errorMsg) {
    throw new Error(status.errorMsg);
  }
  if (!isAndroid()) {
    // Mint is a TUN-based VPN — sing-box's tun inbound already captures
    // every packet via wintun, so we don't need to also flip the Windows
    // system proxy by default. Doing so used to be the cause of "браузер
    // и Telegram перестали работать после краша VPN" because if Mint
    // crashed, the registry stayed pointing at 127.0.0.1:7890 with no
    // listener. Now we only set the system proxy when the user explicitly
    // opts in via mint.useSystemProxy (some legacy Win32 apps that ignore
    // the routing table need it).
    const useSysproxy =
      useSettingsStore.getState().values["mint.useSystemProxy"] === true;
    if (useSysproxy) {
      try {
        await invoke("sysproxy_set", { server: `127.0.0.1:${MIXED_INBOUND_PORT}` });
      } catch (e) {
        console.warn("sysproxy_set failed", e);
      }
      // Race guard — if sing-box died between vpnStart() returning and
      // us setting the system proxy (e.g. config error caught only at
      // runtime), the singbox-exit listener already ran sysproxy_clear
      // *before* our set, leaving the registry pointing at
      // 127.0.0.1:7890 with no engine behind it. Verify the child is
      // still alive and reverse the set if not, so the user's internet
      // doesn't get silently routed into a dead localhost listener.
      try {
        const stillRunning = await invoke<boolean>("singbox_running");
        if (!stillRunning) {
          try {
            await invoke("sysproxy_clear");
          } catch {
          }
          throw new Error(
            "sing-box завершился сразу после старта (см. логи)"
          );
        }
      } catch (e) {
        if (e instanceof Error && e.message.startsWith("sing-box")) throw e;
      }
    }
    // Race guard — if sing-box died between vpnStart() returning and us
    // setting the system proxy (e.g. config error caught only at runtime),
    // the singbox-exit listener already ran sysproxy_clear *before* our
    // set, leaving the registry pointing at 127.0.0.1:7890 with no engine
    // behind it. Verify the child is still alive and reverse the set if
    // not, so the user's internet doesn't get silently routed into a
    // dead localhost listener.
    try {
      const stillRunning = await invoke<boolean>("singbox_running");
      if (!stillRunning) {
        try {
          await invoke("sysproxy_clear");
        } catch {
        }
        throw new Error(
          "sing-box завершился сразу после старта (см. логи)"
        );
      }
    } catch (e) {
      if (e instanceof Error && e.message.startsWith("sing-box")) throw e;
    }
  }
}

export async function stopEngine(): Promise<void> {
  if (!isAndroid()) {
    // Always try to clear, even if useSystemProxy is currently off — the
    // user might have toggled it off mid-session, or this might be a
    // start-up cleanup after an abnormal shutdown.
    try {
      await invoke("sysproxy_clear_if_local");
    } catch (e) {
      console.warn("sysproxy_clear_if_local failed", e);
    }
  }
  await vpnStop();
}

export async function isEngineRunning(): Promise<boolean> {
  return (await vpnStatus()).running;
}

export type LogHandler = (line: string) => void;
export type ExitHandler = (code: number | null) => void;

export async function onEngineLog(handler: LogHandler): Promise<UnlistenFn> {
  // sing-box log streaming is desktop-only — Android's libbox routes its
  // own logs through the foreground notification + Tauri events.
  if (isAndroid()) return async () => {};
  return await listen<string>("singbox-log", (e) => handler(e.payload));
}

export async function onEngineExit(handler: ExitHandler): Promise<UnlistenFn> {
  if (isAndroid()) return async () => {};
  return await listen<number | null>("singbox-exit", (e) => handler(e.payload));
}
