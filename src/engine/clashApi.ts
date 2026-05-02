
import { CLASH_API_PORT } from "./configBuilder";

const BASE = (): string | null =>
  typeof CLASH_API_PORT === "number" && CLASH_API_PORT > 0
    ? `http://127.0.0.1:${CLASH_API_PORT}`
    : null;

export interface TrafficSample {
  up: number;
  down: number;
}

export function subscribeTraffic(onSample: (s: TrafficSample) => void): () => void {
  let cancelled = false;
  let controller: AbortController | null = null;

  const start = async () => {
    const base = BASE();
    if (!base) return;
    controller = new AbortController();
    try {
      const resp = await fetch(`${base}/traffic`, { signal: controller.signal });
      if (!resp.body) return;
      const reader = resp.body.getReader();
      const decoder = new TextDecoder("utf-8");
      let buf = "";
      while (!cancelled) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        let nl: number;
        while ((nl = buf.indexOf("\n")) >= 0) {
          const line = buf.slice(0, nl).trim();
          buf = buf.slice(nl + 1);
          if (!line) continue;
          try {
            const obj = JSON.parse(line) as TrafficSample;
            onSample({ up: obj.up || 0, down: obj.down || 0 });
          } catch {
          }
        }
      }
    } catch {
    }
  };

  start();

  return () => {
    cancelled = true;
    controller?.abort();
  };
}

export async function urlTest(
  outboundTag = "proxy",
  testUrl = "https://www.gstatic.com/generate_204",
  timeoutMs = 5000
): Promise<number | null> {
  const base = BASE();
  if (!base) return null;
  try {
    const resp = await fetch(
      `${base}/proxies/${encodeURIComponent(outboundTag)}/delay?url=${encodeURIComponent(testUrl)}&timeout=${timeoutMs}`
    );
    if (!resp.ok) return null;
    const j = (await resp.json()) as { delay?: number };
    return typeof j.delay === "number" ? j.delay : null;
  } catch {
    return null;
  }
}

export async function ping(): Promise<boolean> {
  const base = BASE();
  if (!base) return false;
  try {
    const resp = await fetch(`${base}/`, { signal: AbortSignal.timeout(800) });
    return resp.ok;
  } catch {
    return false;
  }
}
