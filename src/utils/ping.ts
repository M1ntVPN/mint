import { invoke } from "@tauri-apps/api/core";
import { parseShareUri } from "./uri";
import type { SavedServer } from "../store/servers";

export interface ProbeOpts {
  attempts?: number;
  timeoutMs?: number;
}

// `PROBE_SKIP_WRITE` was used in 0.3.26 to gate probes while the
// VPN tunnel was up, on the (overly defensive) theory that a TUN
// device would always SYN-ACK probes locally and report a fake 0ms.
// In practice Mint.exe is in the engine's process-based direct
// list, so its outbound TCP bypasses TUN and probes return real
// latency even while connected — exactly as it worked in 0.3.22
// before refresh existed. Gating the probe just made the user's
// "Пинговать всё" button look broken when VPN was on.
//
// Kept as an exported symbol so callers that imported it still
// type-check; `probeServer` never returns it.
export const PROBE_SKIP_WRITE: unique symbol = Symbol("probe-skip-write");
export type ProbeOutcome = number | typeof PROBE_SKIP_WRITE;

export async function probeServer(
  s: SavedServer,
  opts: ProbeOpts = {}
): Promise<ProbeOutcome> {
  const inTauri = !!(window as unknown as { __TAURI_INTERNALS__?: unknown })
    .__TAURI_INTERNALS__;
  if (!inTauri) {
    throw new Error("ping requires native runtime");
  }
  const parsed = parseShareUri(s.address);
  if (!parsed.host) {
    throw new Error("server has no resolvable host");
  }
  const target = parsed.port ? `${parsed.host}:${parsed.port}` : parsed.host;
  const ms = await invoke<number>("ping_test", {
    host: target,
    attempts: opts.attempts,
    timeoutMs: opts.timeoutMs,
  });
  if (import.meta.env.DEV) {
    console.debug("[probeServer]", s.name, target, "→", ms, "ms");
  }
  return ms;
}
