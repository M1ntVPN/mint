import { invoke } from "@tauri-apps/api/core";
import { parseShareUri } from "./uri";
import type { SavedServer } from "../store/servers";

export interface ProbeOpts {
  attempts?: number;
  timeoutMs?: number;
}

export async function probeServer(s: SavedServer, opts: ProbeOpts = {}): Promise<number> {
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
