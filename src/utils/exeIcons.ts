
import { invoke } from "@tauri-apps/api/core";

type Listener = () => void;

const cache = new Map<string, string | null>();
const listeners = new Set<Listener>();
let pending = new Set<string>();
let flushTimer: number | null = null;

function notify() {
  for (const l of listeners) l();
}

async function flushNow() {
  flushTimer = null;
  if (pending.size === 0) return;
  const batch = [...pending].filter((p) => !cache.has(p));
  pending = new Set();
  if (batch.length === 0) return;
  for (const p of batch) cache.set(p, null);
  try {
    const got = await invoke<Record<string, string>>("get_exe_icons_b64", {
      paths: batch,
    });
    for (const [p, b64] of Object.entries(got ?? {})) {
      cache.set(p, b64);
    }
  } catch {
  }
  notify();
}

export function getCachedIcon(path: string | null | undefined): string | null {
  if (!path) return null;
  return cache.get(path) ?? null;
}

export function prefetchIcons(paths: (string | null | undefined)[]): void {
  let added = false;
  for (const p of paths) {
    if (!p) continue;
    if (cache.has(p) || pending.has(p)) continue;
    pending.add(p);
    added = true;
  }
  if (!added) return;
  if (flushTimer != null) return;
  flushTimer = window.setTimeout(() => {
    void flushNow();
  }, 50);
}

export function subscribeIcons(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
