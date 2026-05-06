import { invoke } from "@tauri-apps/api/core";
import { parseShareUri } from "./uri";
import type { SavedServer } from "../store/servers";
import { useConnection } from "../store/connection";

export interface ProbeOpts {
  attempts?: number;
  timeoutMs?: number;
}

// When the VPN tunnel is up, the OS routes outbound TCP through the
// TUN device and the local TUN driver responds to SYN with SYN-ACK
// in <1ms — long before the packet reaches the actual remote host.
// `TcpStream::connect` therefore reports "connected" almost instantly
// and the median always lands at 0–1ms regardless of how far the
// real server is. That is not a real measurement; it's TUN-local
// loopback. We refuse it so callers (auto-ping, manual click, "Ping
// all") don't overwrite a real pre-tunnel measurement with a fake
// 0ms reading.
//
// The threshold is conservative: real internet RTTs to /any/ public
// host are >2ms even on the same metro fiber. LAN/loopback would be
// <1ms but we don't ping those.
const TUNNEL_SPOOF_THRESHOLD_MS = 2;

// Special sentinel: caller should treat this as "leave the existing
// ping value alone; do not overwrite" rather than as a hard failure.
// Used when the VPN tunnel is up and `ping_test` came back so fast
// that we know it's TUN-spoofed (see comment above).
//
// Declared as `as const` so that `typeof PROBE_SKIP_WRITE` is the
// unique symbol type (not the wider `symbol`); without that, the
// `ms === PROBE_SKIP_WRITE` narrow at the call site can't take
// `ms: number` to the success branch.
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
  const tunnelUp = useConnection.getState().state === "connected";
  // Refuse to even run the probe while the tunnel is up: we already
  // know it would come back as TUN-spoofed 0ms and a useful real
  // measurement is impossible until the tunnel goes down or we
  // implement an out-of-tunnel ICMP probe (planned for 0.3.27+).
  if (tunnelUp) {
    return PROBE_SKIP_WRITE;
  }
  const ms = await invoke<number>("ping_test", {
    host: target,
    attempts: opts.attempts,
    timeoutMs: opts.timeoutMs,
  });
  if (import.meta.env.DEV) {
    console.debug("[probeServer]", s.name, target, "→", ms, "ms");
  }
  if (ms <= TUNNEL_SPOOF_THRESHOLD_MS) {
    // Belt-and-braces: if the user is in some odd half-up state
    // where `useConnection.state` doesn't yet reflect "connected"
    // but TUN already intercepts (e.g. mid-handshake), reject the
    // result rather than recording a fake 0ms.
    if (useConnection.getState().state !== "disconnected") {
      return PROBE_SKIP_WRITE;
    }
  }
  return ms;
}
