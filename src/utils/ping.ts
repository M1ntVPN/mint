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
// 0.3.27 removed the gate but still used a bare TCP-connect probe,
// which gvisor's TUN stack happily ACKs locally — so the readings
// really were stuck at 0ms whenever the user was connected.
//
// 0.3.28 restores the 0.3.22 behavior: the Rust `ping_test` command
// now layers a TLS HEAD on top of the TCP connect by default. The
// TLS handshake forces gvisor to actually move bytes through
// sing-box's `direct` outbound (Mint is in the process-name direct
// list), so we end up measuring a real RTT even with the VPN up.
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
