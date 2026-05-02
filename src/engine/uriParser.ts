
export interface SingboxOutbound {
  type: string;
  tag?: string;
  server: string;
  server_port: number;
  [k: string]: unknown;
}

function decodeBase64(s: string): string {
  const norm = s.replace(/-/g, "+").replace(/_/g, "/");
  const padded = norm + "===".slice((norm.length + 3) % 4);
  try {
    return atob(padded);
  } catch {
    return "";
  }
}

function parseQuery(q: string): Record<string, string> {
  const out: Record<string, string> = {};
  if (!q) return out;
  const search = q.startsWith("?") ? q.slice(1) : q;
  for (const pair of search.split("&")) {
    if (!pair) continue;
    const eq = pair.indexOf("=");
    if (eq < 0) {
      out[decodeURIComponent(pair)] = "";
    } else {
      out[decodeURIComponent(pair.slice(0, eq))] = decodeURIComponent(pair.slice(eq + 1));
    }
  }
  return out;
}

function parseVless(uri: string): SingboxOutbound {
  const rest = uri.slice("vless://".length);
  const hashIdx = rest.indexOf("#");
  const headPart = hashIdx >= 0 ? rest.slice(0, hashIdx) : rest;

  const qIdx = headPart.indexOf("?");
  const before = qIdx >= 0 ? headPart.slice(0, qIdx) : headPart;
  const query = qIdx >= 0 ? parseQuery(headPart.slice(qIdx)) : {};

  const at = before.lastIndexOf("@");
  if (at < 0) throw new Error("VLESS: нет @");
  const uuid = decodeURIComponent(before.slice(0, at));
  const hostport = before.slice(at + 1);
  const colon = hostport.lastIndexOf(":");
  if (colon < 0) throw new Error("VLESS: нет порта");
  const host = hostport.slice(0, colon);
  const port = parseInt(hostport.slice(colon + 1), 10);
  if (!host || !Number.isFinite(port)) throw new Error("VLESS: некорректный host:port");

  const ob: SingboxOutbound = {
    type: "vless",
    server: host,
    server_port: port,
    uuid,
  };
  if (query.flow) ob.flow = query.flow;

  const security = query.security || "";
  if (security === "tls" || security === "reality") {
    const tls: Record<string, unknown> = {
      enabled: true,
      server_name: query.sni || query.host || host,
    };
    if (query.alpn) tls.alpn = query.alpn.split(",").filter(Boolean);
    if (query.fp) tls.utls = { enabled: true, fingerprint: query.fp };
    if (security === "reality") {
      tls.reality = {
        enabled: true,
        public_key: query.pbk || "",
        short_id: query.sid || "",
      };
    }
    ob.tls = tls;
  }

  const transport = (query.type || "tcp").toLowerCase();
  if (transport === "ws") {
    ob.transport = {
      type: "ws",
      path: query.path || "/",
      headers: query.host ? { Host: query.host } : undefined,
    };
  } else if (transport === "grpc") {
    ob.transport = {
      type: "grpc",
      service_name: query.serviceName || query.path || "",
    };
  } else if (transport === "http" || transport === "h2") {
    ob.transport = {
      type: "http",
      host: query.host ? [query.host] : undefined,
      path: query.path || "/",
    };
  }

  return ob;
}

function parseVmess(uri: string): SingboxOutbound {
  const payload = uri.slice("vmess://".length);
  const decoded = decodeBase64(payload);
  if (!decoded) throw new Error("VMess: не удалось декодировать base64");
  const j = JSON.parse(decoded) as Record<string, string>;
  const port = parseInt(j.port, 10);
  const ob: SingboxOutbound = {
    type: "vmess",
    server: j.add,
    server_port: port,
    uuid: j.id,
    security: j.scy || "auto",
    alter_id: parseInt(j.aid || "0", 10),
  };
  if ((j.tls || "").toLowerCase() === "tls") {
    ob.tls = {
      enabled: true,
      server_name: j.sni || j.host || j.add,
    };
  }
  const net = (j.net || "tcp").toLowerCase();
  if (net === "ws") {
    ob.transport = {
      type: "ws",
      path: j.path || "/",
      headers: j.host ? { Host: j.host } : undefined,
    };
  } else if (net === "grpc") {
    ob.transport = { type: "grpc", service_name: j.path || "" };
  }
  return ob;
}

function parseTrojan(uri: string): SingboxOutbound {
  const rest = uri.slice("trojan://".length);
  const hashIdx = rest.indexOf("#");
  const headPart = hashIdx >= 0 ? rest.slice(0, hashIdx) : rest;
  const qIdx = headPart.indexOf("?");
  const before = qIdx >= 0 ? headPart.slice(0, qIdx) : headPart;
  const query = qIdx >= 0 ? parseQuery(headPart.slice(qIdx)) : {};
  const at = before.lastIndexOf("@");
  if (at < 0) throw new Error("Trojan: нет @");
  const password = decodeURIComponent(before.slice(0, at));
  const hostport = before.slice(at + 1);
  const colon = hostport.lastIndexOf(":");
  const host = hostport.slice(0, colon);
  const port = parseInt(hostport.slice(colon + 1), 10);
  const ob: SingboxOutbound = {
    type: "trojan",
    server: host,
    server_port: port,
    password,
    tls: {
      enabled: true,
      server_name: query.sni || query.host || host,
      alpn: query.alpn ? query.alpn.split(",").filter(Boolean) : undefined,
    },
  };
  const transport = (query.type || "tcp").toLowerCase();
  if (transport === "ws") {
    ob.transport = {
      type: "ws",
      path: query.path || "/",
      headers: query.host ? { Host: query.host } : undefined,
    };
  } else if (transport === "grpc") {
    ob.transport = {
      type: "grpc",
      service_name: query.serviceName || query.path || "",
    };
  }
  return ob;
}

function parseShadowsocks(uri: string): SingboxOutbound {
  const rest = uri.slice("ss://".length);
  const hashIdx = rest.indexOf("#");
  const headPart = hashIdx >= 0 ? rest.slice(0, hashIdx) : rest;
  const at = headPart.lastIndexOf("@");
  if (at < 0) throw new Error("Shadowsocks: нет @");
  const userPart = headPart.slice(0, at);
  const hostport = headPart.slice(at + 1);
  let method: string;
  let password: string;
  if (userPart.includes(":")) {
    [method, password] = userPart.split(":");
    method = decodeURIComponent(method);
    password = decodeURIComponent(password);
  } else {
    const decoded = decodeBase64(userPart);
    const colon = decoded.indexOf(":");
    if (colon < 0) throw new Error("Shadowsocks: некорректный user-info");
    method = decoded.slice(0, colon);
    password = decoded.slice(colon + 1);
  }
  const colon = hostport.lastIndexOf(":");
  const host = hostport.slice(0, colon);
  const port = parseInt(hostport.slice(colon + 1), 10);
  return {
    type: "shadowsocks",
    server: host,
    server_port: port,
    method,
    password,
  };
}

interface WgPayload {
  server: string;
  port: number;
  private_key: string;
  peer_public_key: string;
  preshared_key?: string;
  local_address: string[];
  dns?: string[];
  mtu?: number;
  allowed_ips?: string[];
  keepalive?: number;
  name?: string;
}

function parseWireguard(uri: string): SingboxOutbound {
  const rest = uri.slice("wireguard://".length);
  const hashIdx = rest.indexOf("#");
  const head = hashIdx >= 0 ? rest.slice(0, hashIdx) : rest;
  const payload = decodeBase64(head);
  if (!payload) throw new Error("WireGuard: не удалось декодировать конфиг");
  const j = JSON.parse(payload) as WgPayload;
  const ob: SingboxOutbound = {
    type: "wireguard",
    server: j.server,
    server_port: j.port,
    local_address: j.local_address,
    private_key: j.private_key,
    peer_public_key: j.peer_public_key,
  };
  if (j.preshared_key) ob.pre_shared_key = j.preshared_key;
  if (j.mtu) ob.mtu = j.mtu;
  if (j.keepalive) ob.persistent_keepalive_interval = j.keepalive;
  return ob;
}

export function parseShareUri(uri: string): SingboxOutbound {
  const trimmed = uri.trim();
  const lower = trimmed.toLowerCase();
  if (lower.startsWith("vless://")) return parseVless(trimmed);
  if (lower.startsWith("vmess://")) return parseVmess(trimmed);
  if (lower.startsWith("trojan://")) return parseTrojan(trimmed);
  if (lower.startsWith("ss://")) return parseShadowsocks(trimmed);
  if (lower.startsWith("wireguard://")) return parseWireguard(trimmed);
  throw new Error(`Неизвестный протокол: ${trimmed.slice(0, 16)}…`);
}
