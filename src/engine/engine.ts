
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
  try {
    await invoke("singbox_kill_orphans");
  } catch {
  }
  let clashApiPort: number | null = null;
  try {
    const picked = await invoke<number | null>("singbox_pick_free_clash_port");
    clashApiPort = typeof picked === "number" ? picked : null;
  } catch {
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
  await invoke("singbox_start", { config });
  try {
    await invoke("sysproxy_set", { server: `127.0.0.1:${MIXED_INBOUND_PORT}` });
  } catch (e) {
    console.warn("sysproxy_set failed", e);
  }
}

export async function stopEngine(): Promise<void> {
  try {
    await invoke("sysproxy_clear");
  } catch (e) {
    console.warn("sysproxy_clear failed", e);
  }
  await invoke("singbox_stop");
}

export async function isEngineRunning(): Promise<boolean> {
  return await invoke<boolean>("singbox_running");
}

export type LogHandler = (line: string) => void;
export type ExitHandler = (code: number | null) => void;

export async function onEngineLog(handler: LogHandler): Promise<UnlistenFn> {
  return await listen<string>("singbox-log", (e) => handler(e.payload));
}

export async function onEngineExit(handler: ExitHandler): Promise<UnlistenFn> {
  return await listen<number | null>("singbox-exit", (e) => handler(e.payload));
}
