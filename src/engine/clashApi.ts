
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

  const attempt = async () => {
    const base = BASE();
    if (!base) return;
    controller = new AbortController();
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
  };

  const loop = async () => {
    while (!cancelled) {
      try {
        await attempt();
      } catch {
        // fetch failed or stream broke — retry after a short delay
      }
      if (!cancelled) await new Promise((r) => setTimeout(r, 1000));
    }
  };

  loop();

  return () => {
    cancelled = true;
    controller?.abort();
  };
}

export async function urlTest(
  outboundTag = "proxy",
  // Use plain HTTP (not HTTPS) so clash's `delay` measurement is
  // dominated by network RTT instead of TLS-handshake time. The clash
  // /proxies/:name/delay endpoint times the *full* request round-trip
  // through the proxy outbound: TCP connect + (TLS handshake) + HTTP
  // request + response. Over HTTPS that's ~3-4 × raw RTT (TCP 1-RTT +
  // TLS 1.3 ≥1-RTT + HTTP 1-RTT), so a tunnel with a real 100ms ping
  // would render as ~300-400ms in the dashboard "Пинг" card and read
  // as if the VPN were 4× slower than speedtest reported. HTTP brings
  // the sample down to ~2 × RTT (TCP + HTTP) which is much closer to
  // what users see in third-party speedtests / pings.
  //
  // cp.cloudflare.com/generate_204 is Cloudflare's published captive-
  // portal probe — it returns HTTP 204 with no body and no redirect,
  // and Cloudflare's edge is geographically wide so the test isn't
  // bottlenecked on a single distant origin.
  testUrl = "http://cp.cloudflare.com/generate_204",
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
