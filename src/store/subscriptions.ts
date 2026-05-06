import { create } from "zustand";
import { persist } from "zustand/middleware";
import { type SavedServer } from "./servers";
import { parseShareUri } from "../utils/uri";

export interface Subscription {
  id: string;
  name: string;
  url: string;
  addedAt: number;
  syncedAt?: number;
  uploadBytes?: number;
  downloadBytes?: number;
  totalBytes?: number;
  expiresAt?: number;
  updateIntervalHours?: number;
  lastError?: string | null;
  // Optional metadata reported by the subscription server via
  // response headers. None of these can crash any pre-existing
  // subscription created before this field landed (undefined is the
  // legitimate "not provided" value).
  description?: string;
  supportUrl?: string;
  webPageUrl?: string;
  // The last value of `description` we *received* from the server.
  // Used by `refreshSubscription` to distinguish "user has not
  // touched the description" (accept new server value on refresh)
  // from "user typed something distinct" (keep the user's edit).
  // Old subscriptions have description === undefined ===
  // backendDescription, so the first refresh accepts whatever the
  // server now reports — migration is bug-free.
  backendDescription?: string;
}

interface SubscriptionsState {
  list: Subscription[];
  add: (s: Omit<Subscription, "id" | "addedAt">) => string;
  update: (id: string, patch: Partial<Subscription>) => void;
  remove: (id: string) => void;
}

export const useSubscriptions = create<SubscriptionsState>()(
  persist(
    (set) => ({
      list: [],
      add: (s) => {
        const id = `sub-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
        set((st) => ({
          list: [{ ...s, id, addedAt: Date.now() }, ...st.list],
        }));
        return id;
      },
      update: (id, patch) =>
        set((st) => ({
          list: st.list.map((x) => (x.id === id ? { ...x, ...patch } : x)),
        })),
      remove: (id) =>
        set((st) => ({ list: st.list.filter((x) => x.id !== id) })),
    }),
    { name: "mint.subscriptions.v1", version: 1 }
  )
);

export function tryDecodeBase64(s: string): string | null {
  const trimmed = s.replace(/\s+/g, "");
  if (trimmed.length === 0) return null;
  let normalized = trimmed.replace(/-/g, "+").replace(/_/g, "/");
  while (normalized.length % 4 !== 0) normalized += "=";
  if (!/^[A-Za-z0-9+/=]+$/.test(normalized)) return null;
  try {
    return new TextDecoder("utf-8", { fatal: false }).decode(
      Uint8Array.from(atob(normalized), (c) => c.charCodeAt(0))
    );
  } catch {
    return null;
  }
}

const SHARE_PROTO_RE = /^(vless|vmess|trojan|ss|hiddify|wireguard):\/\//i;

export function extractShareUris(body: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const considerLine = (raw: string) => {
    const line = raw.trim();
    if (!line) return;
    if (SHARE_PROTO_RE.test(line)) {
      if (!seen.has(line)) {
        seen.add(line);
        out.push(line);
      }
      return;
    }
    const decoded = tryDecodeBase64(line);
    if (decoded && SHARE_PROTO_RE.test(decoded.trim())) {
      const t = decoded.trim();
      if (!seen.has(t)) {
        seen.add(t);
        out.push(t);
      }
    }
  };

  const wholeDecoded = tryDecodeBase64(body);
  const text =
    wholeDecoded &&
    /(vless|vmess|trojan|ss|hiddify):\/\//i.test(wholeDecoded)
      ? wholeDecoded
      : body;

  for (const line of text.split(/\r?\n/)) considerLine(line);

  if (out.length === 0) {
    for (const u of clashYamlToUris(text)) {
      if (!seen.has(u)) {
        seen.add(u);
        out.push(u);
      }
    }
  }
  if (out.length === 0) {
    for (const u of singboxJsonToUris(text)) {
      if (!seen.has(u)) {
        seen.add(u);
        out.push(u);
      }
    }
  }
  if (out.length === 0) {
    const wg = wireguardIniToUri(text);
    if (wg) {
      out.push(wg);
    }
  }
  return out;
}

function wireguardIniToUri(body: string): string | null {
  if (!/^\s*\[Interface\]/mi.test(body)) return null;
  const sections: Record<string, Record<string, string>> = {};
  let current: string | null = null;
  for (const raw of body.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#") || line.startsWith(";")) continue;
    const header = line.match(/^\[(.+?)\]$/);
    if (header) {
      current = header[1].toLowerCase();
      if (!sections[current]) sections[current] = {};
      continue;
    }
    if (!current) continue;
    const eq = line.indexOf("=");
    if (eq < 0) continue;
    const k = line.slice(0, eq).trim().toLowerCase();
    const v = line.slice(eq + 1).trim();
    sections[current][k] = v;
  }
  const iface = sections["interface"];
  const peer = sections["peer"];
  if (!iface || !peer) return null;
  if (!iface["privatekey"] || !peer["publickey"] || !peer["endpoint"]) {
    return null;
  }
  const endpoint = peer["endpoint"];
  const colon = endpoint.lastIndexOf(":");
  if (colon < 0) return null;
  const server = endpoint.slice(0, colon).replace(/^\[|\]$/g, "");
  const port = parseInt(endpoint.slice(colon + 1), 10);
  if (!server || !Number.isFinite(port)) return null;

  const localAddress = (iface["address"] ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const dns = (iface["dns"] ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const allowedIps = (peer["allowedips"] ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  const payload = {
    server,
    port,
    private_key: iface["privatekey"],
    peer_public_key: peer["publickey"],
    preshared_key: peer["presharedkey"] || undefined,
    local_address: localAddress,
    dns: dns.length ? dns : undefined,
    allowed_ips: allowedIps.length ? allowedIps : undefined,
    mtu: iface["mtu"] ? parseInt(iface["mtu"], 10) : undefined,
    keepalive: peer["persistentkeepalive"]
      ? parseInt(peer["persistentkeepalive"], 10)
      : undefined,
  };

  const json = JSON.stringify(payload);
  const b64 = btoa(json).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  const tag = `WireGuard ${server}:${port}`;
  return `wireguard://${b64}#${encodeURIComponent(tag)}`;
}

function clashYamlToUris(yaml: string): string[] {
  if (!/^\s*proxies\s*:/m.test(yaml)) return [];
  const out: string[] = [];
  const lines = yaml.split(/\r?\n/);
  let inside = false;
  let buf = "";
  const flush = () => {
    if (!buf.trim()) return;
    const obj = parseInlineYamlMap(buf);
    if (obj) {
      const uri = clashProxyToUri(obj);
      if (uri) out.push(uri);
    }
    buf = "";
  };
  for (const line of lines) {
    if (/^\s*proxies\s*:/.test(line)) {
      inside = true;
      continue;
    }
    if (!inside) continue;
    if (/^\S.*:\s*$/.test(line)) break;
    if (/^\s*-\s/.test(line)) {
      flush();
      buf = line.replace(/^\s*-\s*/, "");
    } else if (line.trim() && /^\s+/.test(line)) {
      buf += ", " + line.trim();
    }
  }
  flush();
  return out;
}

function parseInlineYamlMap(s: string): Record<string, string> | null {
  let inner = s.trim();
  if (inner.startsWith("{") && inner.endsWith("}")) inner = inner.slice(1, -1);
  const obj: Record<string, string> = {};
  let depth = 0;
  let acc = "";
  const parts: string[] = [];
  for (const ch of inner) {
    if (ch === "[" || ch === "{") depth++;
    if (ch === "]" || ch === "}") depth--;
    if (ch === "," && depth === 0) {
      parts.push(acc);
      acc = "";
    } else {
      acc += ch;
    }
  }
  if (acc.trim()) parts.push(acc);
  for (const p of parts) {
    const idx = p.indexOf(":");
    if (idx < 0) continue;
    const k = p.slice(0, idx).trim().replace(/^["']|["']$/g, "");
    let v = p.slice(idx + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    if (k) obj[k] = v;
  }
  return Object.keys(obj).length ? obj : null;
}

function clashProxyToUri(p: Record<string, string>): string | null {
  const type = (p.type || "").toLowerCase();
  const server = p.server;
  const port = p.port;
  if (!server || !port) return null;
  const name = encodeURIComponent(p.name || `${type}-${server}`);
  if (type === "vless") {
    const uuid = p.uuid;
    if (!uuid) return null;
    const params: string[] = [];
    const security =
      (p as Record<string, unknown>)["reality-opts"]
        ? "reality"
        : (p.tls === "true" || p.security === "tls")
          ? "tls"
          : (p.security ?? "");
    if (security) params.push(`security=${encodeURIComponent(security)}`);
    if (p.flow) params.push(`flow=${encodeURIComponent(p.flow)}`);
    if (p.servername || p.sni) params.push(`sni=${encodeURIComponent(p.servername || p.sni)}`);
    if (p.network) params.push(`type=${encodeURIComponent(p.network)}`);
    return `vless://${uuid}@${server}:${port}?${params.join("&")}#${name}`;
  }
  if (type === "trojan") {
    const password = p.password;
    if (!password) return null;
    const params: string[] = [];
    if (p.sni) params.push(`sni=${encodeURIComponent(p.sni)}`);
    if (p.network) params.push(`type=${encodeURIComponent(p.network)}`);
    return `trojan://${encodeURIComponent(password)}@${server}:${port}?${params.join("&")}#${name}`;
  }
  if (type === "ss" || type === "shadowsocks") {
    const cipher = p.cipher;
    const password = p.password;
    if (!cipher || !password) return null;
    const userinfo = btoa(`${cipher}:${password}`)
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
    return `ss://${userinfo}@${server}:${port}#${name}`;
  }
  return null;
}

function singboxJsonToUris(text: string): string[] {
  const trimmed = text.trim();
  if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return [];
  }
  type Outbound = {
    type?: string;
    protocol?: string;
    tag?: string;
    server?: string;
    address?: string;
    server_port?: number;
    port?: number;
    uuid?: string;
    password?: string;
    method?: string;
    tls?: { enabled?: boolean; server_name?: string };
    streamSettings?: {
      security?: string;
      tlsSettings?: { serverName?: string };
      realitySettings?: {
        serverName?: string;
        publicKey?: string;
        shortId?: string;
        fingerprint?: string;
      };
      network?: string;
    };
    transport?: { type?: string };
    settings?: {
      vnext?: Array<{
        address?: string;
        port?: number;
        users?: Array<{ id?: string; flow?: string }>;
      }>;
    };
  };
  let outbounds: Outbound[] = [];
  if (Array.isArray(parsed)) {
    for (const cfg of parsed) {
      const c = cfg as { outbounds?: Outbound[]; remarks?: string };
      if (Array.isArray(c.outbounds)) {
        for (const ob of c.outbounds) {
          if (!ob.tag && c.remarks) ob.tag = c.remarks;
          outbounds.push(ob);
        }
      }
    }
  } else {
    const o = parsed as { outbounds?: Outbound[] };
    outbounds = Array.isArray(o.outbounds) ? o.outbounds : [];
  }
  const out: string[] = [];
  for (const ob of outbounds) {
    if (ob.protocol === "vless" && ob.settings?.vnext) {
      const vnext = ob.settings.vnext[0];
      const user = vnext?.users?.[0];
      const server = vnext?.address;
      const port = vnext?.port;
      const uuid = user?.id;
      if (server && port && uuid) {
        const params: string[] = ["encryption=none"];
        const ss = ob.streamSettings;
        const sec = ss?.security ?? "";
        if (sec) params.push(`security=${encodeURIComponent(sec)}`);
        if (user.flow) params.push(`flow=${encodeURIComponent(user.flow)}`);
        if (ss?.network) params.push(`type=${encodeURIComponent(ss.network)}`);
        const sni =
          ss?.realitySettings?.serverName || ss?.tlsSettings?.serverName;
        if (sni) params.push(`sni=${encodeURIComponent(sni)}`);
        if (ss?.realitySettings?.publicKey)
          params.push(`pbk=${encodeURIComponent(ss.realitySettings.publicKey)}`);
        if (ss?.realitySettings?.shortId)
          params.push(`sid=${encodeURIComponent(ss.realitySettings.shortId)}`);
        if (ss?.realitySettings?.fingerprint)
          params.push(`fp=${encodeURIComponent(ss.realitySettings.fingerprint)}`);
        const name = encodeURIComponent(ob.tag || "node");
        out.push(
          `vless://${uuid}@${server}:${port}?${params.join("&")}#${name}`
        );
      }
      continue;
    }
    if (!ob.server || !ob.server_port) continue;
    const name = encodeURIComponent(ob.tag || ob.type || "node");
    if (ob.type === "vless" && ob.uuid) {
      const params: string[] = [];
      if (ob.tls?.enabled) params.push("security=tls");
      if (ob.tls?.server_name) params.push(`sni=${encodeURIComponent(ob.tls.server_name)}`);
      if (ob.transport?.type) params.push(`type=${encodeURIComponent(ob.transport.type)}`);
      out.push(
        `vless://${ob.uuid}@${ob.server}:${ob.server_port}?${params.join("&")}#${name}`
      );
    } else if (ob.type === "trojan" && ob.password) {
      out.push(
        `trojan://${encodeURIComponent(ob.password)}@${ob.server}:${ob.server_port}#${name}`
      );
    } else if (ob.type === "shadowsocks" && ob.method && ob.password) {
      const userinfo = btoa(`${ob.method}:${ob.password}`)
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=+$/, "");
      out.push(`ss://${userinfo}@${ob.server}:${ob.server_port}#${name}`);
    }
  }
  return out;
}

export interface UserInfo {
  upload?: number;
  download?: number;
  total?: number;
  expire?: number;
}

export function parseUserInfo(header: string | null | undefined): UserInfo {
  if (!header) return {};
  const out: UserInfo = {};
  for (const part of header.split(";")) {
    const [k, v] = part.split("=").map((x) => x.trim());
    if (!k || !v) continue;
    const n = Number(v);
    if (!Number.isFinite(n)) continue;
    if (k === "upload") out.upload = n;
    else if (k === "download") out.download = n;
    else if (k === "total") out.total = n;
    else if (k === "expire") out.expire = n;
  }
  return out;
}

export function decodeProfileTitle(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;

  const explicit = trimmed.replace(/^base64\s*[:,]\s*/i, "");
  const explicitly_tagged = explicit !== trimmed;

  const decoded = tryDecodeBase64(explicit);
  if (decoded) {
    const d = decoded.trim();
    if (d.length > 0 && !/[\x00-\x08\x0E-\x1F]/.test(d)) return d;
  }

  if (explicitly_tagged) {
    return explicit.length > 0 ? explicit : null;
  }
  return trimmed;
}

function isPlaceholderUri(uri: string): boolean {
  const lower = uri.toLowerCase();
  if (lower.includes("00000000-0000-0000-0000-000000000000")) return true;
  if (/@0\.0\.0\.0(:|$)/.test(lower)) return true;
  if (/@\[::\](:|$)/.test(lower)) return true;
  if (/:1(\?|#|$)/.test(lower) && lower.includes("@0.0.0.0")) return true;
  const sentinel = /%20not%20supported|app%20not%20supported|happ(%20|-)required|upgrade%20required/i;
  if (sentinel.test(uri)) return true;
  return false;
}

// Hard cap on description length on the way into the store. Keeps
// localStorage compact and prevents a malicious / misconfigured
// subscription server from blowing out the UI by returning a
// multi-megabyte tagline. 280 mirrors the twitter limit — it fits
// comfortably in a single truncated row in both the dashboard folder
// header and the Profiles subscription header.
const DESCRIPTION_CAP = 280;

export function capDescription(raw: string | null | undefined): string | undefined {
  if (raw == null) return undefined;
  const trimmed = raw.trim();
  if (!trimmed) return undefined;
  return trimmed.length > DESCRIPTION_CAP
    ? trimmed.slice(0, DESCRIPTION_CAP)
    : trimmed;
}

export function urisToServers(
  uris: string[],
  subId: string,
  options?: { description?: string }
): Omit<SavedServer, "id" | "addedAt">[] {
  const description = capDescription(options?.description);
  const drafts: Omit<SavedServer, "id" | "addedAt">[] = [];
  for (const uri of uris) {
    if (isPlaceholderUri(uri)) continue;
    let p;
    try {
      p = parseShareUri(uri);
    } catch {
      continue;
    }
    drafts.push({
      name: p.name || p.host || uri.slice(0, 20),
      address: uri,
      description,
      protocol: p.protocol || "vless",
      country: p.country,
      city: p.host,
      flag: p.flag,
      ping: null,
      load: null,
      source: "subscription",
      subscriptionId: subId,
    });
  }
  return drafts;
}
