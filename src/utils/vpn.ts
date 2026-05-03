import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { UnlistenFn } from "@tauri-apps/api/event";
import { isAndroid } from "./platform";

/**
 * Cross-platform VPN engine bridge.
 *
 * On desktop (Windows / Linux / macOS) commands proxy to the bundled
 * sing-box sidecar (`singbox_*` Tauri commands).
 *
 * On Android they proxy to `tauri-plugin-mintvpn`, which drives a
 * foreground `VpnService` + sing-box (`libbox.aar`).
 *
 * The shape of `config` is identical on both platforms — it's the same
 * sing-box JSON the desktop sidecar consumes, so all of `configBuilder.ts`
 * stays unchanged.
 */
export interface VpnStatus {
  running: boolean;
  errorMsg?: string;
}

export interface InstalledApp {
  packageName: string;
  label: string;
  icon: string;
}

export async function vpnPrepare(): Promise<{ granted: boolean }> {
  if (!isAndroid()) return { granted: true };
  return await invoke<{ granted: boolean }>("plugin:mintvpn|prepare_vpn", {});
}

export async function vpnStart(
  config: string,
  profileName?: string,
  opts?: { allowedApps?: string[]; disallowedApps?: string[] },
): Promise<VpnStatus> {
  if (isAndroid()) {
    return await invoke<VpnStatus>("plugin:mintvpn|start_vpn", {
      config,
      profileName,
      allowedApps: opts?.allowedApps,
      disallowedApps: opts?.disallowedApps,
    });
  }
  await invoke("singbox_start", { config });
  return { running: true };
}

export async function listInstalledApps(): Promise<InstalledApp[]> {
  if (!isAndroid()) return [];
  const res = await invoke<{ apps: InstalledApp[] }>(
    "plugin:mintvpn|list_installed_apps",
    {},
  );
  return res.apps;
}

export async function vpnStop(): Promise<VpnStatus> {
  if (isAndroid()) {
    return await invoke<VpnStatus>("plugin:mintvpn|stop_vpn", {});
  }
  await invoke("singbox_stop");
  return { running: false };
}

export async function vpnStatus(): Promise<VpnStatus> {
  if (isAndroid()) {
    return await invoke<VpnStatus>("plugin:mintvpn|vpn_status", {});
  }
  const running = await invoke<boolean>("singbox_running");
  return { running };
}

/**
 * Subscribe to engine state-change events. Resolves to an unlisten fn.
 * On Android these come from `MintVpnService.eventCallback`; on desktop
 * we rebroadcast `singbox-log` lines as state heuristics aren't needed.
 */
export async function onVpnEvent(
  handler: (event: "started" | "stopped" | "error", payload: unknown) => void,
): Promise<UnlistenFn> {
  if (isAndroid()) {
    const u1 = await listen("plugin:mintvpn|vpn_started", (e) =>
      handler("started", e.payload),
    );
    const u2 = await listen("plugin:mintvpn|vpn_stopped", (e) =>
      handler("stopped", e.payload),
    );
    const u3 = await listen("plugin:mintvpn|vpn_error", (e) =>
      handler("error", e.payload),
    );
    return () => {
      u1();
      u2();
      u3();
    };
  }
  // Desktop callers already use onEngineLog/onEngineExit; no-op subscription.
  return () => {};
}
