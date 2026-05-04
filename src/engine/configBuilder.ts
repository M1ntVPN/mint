
import type { SavedServer } from "../store/servers";
import type { AppRule, NetRule, TunnelMode } from "../store/tunneling";
import { parseShareUri, type SingboxOutbound } from "./uriParser";
import { isAndroid } from "../utils/platform";

interface TunnelingSnapshot {
  mode: TunnelMode;
  apps: AppRule[];
  nets: NetRule[];
}

export let CLASH_API_PORT: number | null = null;
export function setClashApiPort(port: number | null): void {
  CLASH_API_PORT = port;
}
export function rollClashApiPort(): number {
  CLASH_API_PORT = 19090 + Math.floor(Math.random() * 10000);
  return CLASH_API_PORT;
}
export const MIXED_INBOUND_PORT = 7890;

export interface BuildOptions {
  exit: SavedServer;
  entry?: SavedServer | null;
  apiSecret?: string;
  remoteDns?: string;
  localDns?: string;
  clashApiPort?: number | null;
  tunneling?: TunnelingSnapshot;
}

function outboundFromServer(s: SavedServer, tag: string, detour?: string): SingboxOutbound {
  const ob = parseShareUri(s.address);
  ob.tag = tag;
  if (detour) {
    ob.detour = detour;
  }
  return ob;
}

function buildTunnelingRules(t: TunnelingSnapshot): {
  rules: Record<string, unknown>[];
  final: "proxy" | "direct";
} {
  const rules: Record<string, unknown>[] = [];

  for (const n of t.nets) {
    const pat = n.pattern.trim();
    if (!pat) continue;
    const rule: Record<string, unknown> = {
      outbound: n.via === "vpn" ? "proxy" : "direct",
    };
    if (/^\d{1,3}(\.\d{1,3}){3}(\/\d{1,2})?$/.test(pat)) {
      rule.ip_cidr = [pat.includes("/") ? pat : `${pat}/32`];
    } else if (pat.includes(":") && /^[0-9a-fA-F:]+(\/\d{1,3})?$/.test(pat)) {
      rule.ip_cidr = [pat.includes("/") ? pat : `${pat}/128`];
    } else if (pat.startsWith("*.")) {
      rule.domain_suffix = [pat.slice(2)];
    } else if (pat.startsWith(".")) {
      rule.domain_suffix = [pat.slice(1)];
    } else {
      rule.domain = [pat.toLowerCase()];
    }
    rules.push(rule);
  }

  const vpnExe = new Set<string>();
  const directExe = new Set<string>();
  for (const a of t.apps) {
    const exe = a.exe.trim();
    if (!exe) continue;
    const bucket = a.via === "vpn" ? vpnExe : directExe;
    bucket.add(exe);
    if (!exe.toLowerCase().endsWith(".exe")) bucket.add(`${exe}.exe`);
    else bucket.add(exe.replace(/\.exe$/i, ""));
  }
  if (vpnExe.size > 0) {
    rules.push({ process_name: [...vpnExe], outbound: "proxy" });
  }
  if (directExe.size > 0) {
    rules.push({ process_name: [...directExe], outbound: "direct" });
  }

  const final: "proxy" | "direct" = t.mode === "whitelist" ? "direct" : "proxy";
  return { rules, final };
}

export function buildSingboxConfig(opts: BuildOptions): string {
  const {
    exit,
    entry,
    apiSecret = "",
    remoteDns = "https://1.1.1.1/dns-query",
    localDns = "https://223.5.5.5/dns-query",
    clashApiPort = CLASH_API_PORT,
    tunneling,
  } = opts;

  const proxyOutbounds: SingboxOutbound[] = [];

  if (entry && entry.id !== exit.id) {
    proxyOutbounds.push(outboundFromServer(entry, "entry"));
    proxyOutbounds.push(outboundFromServer(exit, "proxy", "entry"));
  } else {
    proxyOutbounds.push(outboundFromServer(exit, "proxy"));
  }

  const experimental: Record<string, unknown> = {};
  if (typeof clashApiPort === "number" && clashApiPort > 0) {
    experimental.clash_api = {
      external_controller: `127.0.0.1:${clashApiPort}`,
      secret: apiSecret,
      default_mode: "Rule",
    };
  }

  const config: Record<string, unknown> = {
    log: { level: "warn", timestamp: true },
    dns: {
      servers: [
        { tag: "remote", address: remoteDns, detour: "proxy" },
        { tag: "local", address: localDns, detour: "direct" },
      ],
      rules: [
        { outbound: ["any"], server: "local" },
      ],
      strategy: "prefer_ipv4",
    },
    inbounds: isAndroid()
      ? [
          {
            type: "tun",
            tag: "tun-in",
            auto_route: true,
            strict_route: true,
            inet4_address: "172.19.0.1/30",
            inet6_address: "fdfe:dcba:9876::1/126",
            stack: "mixed",
            sniff: true,
            sniff_override_destination: true,
          },
        ]
      : [
          // Desktop runs both a TUN inbound (wintun-backed on Windows;
          // utun on macOS; /dev/net/tun on Linux) and a localhost mixed
          // inbound. The TUN owns the OS routing table and captures every
          // packet without requiring users to flip the system proxy. The
          // mixed inbound on 127.0.0.1:7890 stays available for the
          // optional "Использовать системный прокси" toggle (Settings ->
          // Безопасность) which legacy Win32 apps that ignore routing
          // rules occasionally need.
          {
            type: "tun",
            tag: "tun-in",
            auto_route: true,
            strict_route: true,
            inet4_address: "172.19.0.1/30",
            inet6_address: "fdfe:dcba:9876::1/126",
            stack: "mixed",
            sniff: true,
            sniff_override_destination: true,
            mtu: 9000,
          },
          {
            type: "mixed",
            tag: "mixed-in",
            listen: "127.0.0.1",
            listen_port: MIXED_INBOUND_PORT,
          },
        ],
    outbounds: [
      ...proxyOutbounds,
      { type: "direct", tag: "direct" },
      { type: "block", tag: "block" },
      { type: "dns", tag: "dns-out" },
    ],
    route: (() => {
      const baseRules: Record<string, unknown>[] = [
        { protocol: "dns", outbound: "dns-out" },
        { ip_is_private: true, outbound: "direct" },
      ];
      let finalOut: "proxy" | "direct" = "proxy";
      if (tunneling && tunneling.mode !== "full") {
        const r = buildTunnelingRules(tunneling);
        baseRules.push(...r.rules);
        finalOut = r.final;
      }
      return {
        rules: baseRules,
        final: finalOut,
        auto_detect_interface: true,
      };
    })(),
  };

  if (Object.keys(experimental).length > 0) {
    config.experimental = experimental;
  }

  return JSON.stringify(config, null, 2);
}
