
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
    // Defaults are deliberately set to *IP-addressed* DoH endpoints, not
    // hostnames. If the default were `https://dns.cloudflare.com/dns-query`
    // sing-box would have to resolve `dns.cloudflare.com` first, and on
    // RKN-hijacked Russian networks the system resolver returns junk
    // (we observed `premium-ru.geodema.network → 194.26.229.156` in user
    // logs). With `https://1.1.1.1/dns-query` the IP is already known
    // and no system-DNS bootstrap is needed.
    remoteDns = "https://1.1.1.1/dns-query",
    // Direct DNS used to be `https://223.5.5.5/dns-query` (AliDNS, China
    // Telecom). That's a terrible default for non-China users — the
    // server is China-firewalled outbound, so for users outside China
    // it just times out. Fall back to the same Cloudflare 1.1.1.1
    // endpoint used by `direct` (also IP-addressed, also bypasses the
    // system resolver).
    localDns = "https://1.1.1.1/dns-query",
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
    // DNS pipeline is deliberately three-tier (remote / direct / local)
    // to defeat ISP-level DNS hijacking, which is rampant on Russian
    // networks. We saw `premium-ru.geodema.network` get poisoned to
    // `194.26.229.156` (Comss.one) in a user log — sing-box then tried
    // to TLS-handshake the wrong server and exited with code 1. The
    // fix is to never let the OS resolver answer hostnames that matter
    // for VPN bring-up.
    //
    //   `local`  - tag for system DNS (Windows/Android resolver). Used
    //              only as the bootstrap floor for resolving the
    //              hostname of `direct`. If `direct` is an IP DoH (as
    //              we default it), this is never actually consulted.
    //
    //   `direct` - Cloudflare DoH at the literal IP 1.1.1.1. No host-
    //              name to resolve, so it can be reached without ever
    //              touching the OS resolver. Used to resolve the
    //              hostnames of (a) the `remote` DoH and (b) every
    //              outbound's server, via `route.default_domain_resolver`.
    //
    //   `remote` - The user's chosen DoH (defaults to 1.1.1.1) routed
    //              through `proxy` so once the tunnel is up, every
    //              user app's DNS query goes through the VPN.
    //
    // The `address_resolver` chain (remote -> direct -> local) tells
    // sing-box which lower tier to use for resolving each server's own
    // hostname; the `route.default_domain_resolver` tells sing-box to
    // resolve every *outbound* server's hostname via `direct` -> 1.1.1.1
    // BEFORE the tunnel comes up. This is the same address-resolver
    // pattern Hiddify uses (hiddify-core/v2/config/dns.go), trimmed
    // down to the parts we actually need.
    dns: {
      // Server order matters. `direct` is listed FIRST so that any DNS
      // query that doesn't match an explicit rule — most importantly,
      // the bootstrap resolution sing-box does for the proxy outbound's
      // own server hostname BEFORE the tunnel is up — falls through to
      // Cloudflare DoH at the literal IP 1.1.1.1 instead of the user's
      // chosen `remote` (which on a hijacked Russian network resolves
      // via the OS resolver and gets poisoned to 194.26.229.156).
      //
      // We also pin `final: "direct"` defensively in case sing-box's
      // "first server is default" semantics change between versions.
      // Confirmed in v1.10/1.11 that `final` overrides server order for
      // unmatched queries.
      servers: [
        {
          tag: "direct",
          address: localDns,
          address_resolver: "local",
          detour: "direct",
        },
        {
          tag: "remote",
          address: remoteDns,
          address_resolver: "direct",
          detour: "proxy",
        },
        { tag: "local", address: "local" },
      ],
      rules: [
        // Inside the tunnel: any DNS query that originates from an
        // outbound (i.e. apps using the VPN) goes through `direct` to
        // bypass the user's potentially hijacked DoH choice. This rule
        // alone is NOT sufficient for bootstrap resolution because
        // bootstrap queries are not associated with an outbound yet —
        // hence the server-order + `final` fallback above.
        { outbound: ["any"], server: "direct" },
      ],
      // Default DNS server for any query not matched by `rules`. This is
      // what catches the proxy outbound's server-hostname resolution at
      // tunnel bring-up and is the actual fix for the RKN DNS-hijack
      // that survived 0.3.5 (`dns.rules` doesn't fire at bootstrap, so
      // queries fell back to the first `dns.servers` entry which used
      // to be `remote`).
      final: "direct",
      strategy: "prefer_ipv4",
      independent_cache: true,
      // Suppress AAAA queries entirely if the user has explicitly opted
      // out of IPv6 (Settings -> Сеть и DNS). On Windows-only IPv4
      // ISPs the AAAA resolution still succeeds (DNS returns valid IPv6)
      // but the dial to that IPv6 fails with `connectex: A socket
      // operation was attempted to an unreachable network`, flooding
      // the log. Default is still off (covered by the noisy-error
      // filter at the UI layer) so existing IPv6 users don't lose
      // anything.
    },
    inbounds: isAndroid()
      ? [
          {
            type: "tun",
            tag: "tun-in",
            auto_route: true,
            strict_route: true,
            // sing-box 1.10 deprecated the split inet4_address /
            // inet6_address fields in favour of a single `address` array;
            // the old fields are removed in 1.12 and produce a `[migration]`
            // WARN in 1.10–1.11. We use the new shape unconditionally
            // because both Android and desktop sidecars are now ≥1.10.
            address: ["172.19.0.1/30", "fdfe:dcba:9876::1/126"],
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
          //
          // `stack: "gvisor"` (userspace TCP/IP) instead of "mixed":
          // sing-box's `mixed` stack uses the OS network stack for
          // UDP/ICMP, which on Windows triggers a Windows Firewall
          // rule-add ("fix windows firewall for system stack: Error
          // adding Rule") that fails on machines where the firewall
          // service is restricted, AV-managed, or governed by group
          // policy — the user just sees sing-box exit with code 1
          // immediately on Connect. Hiddify hit the same issue (see
          // hiddify-app #1224 / #1342) and shipped `gvisor` as the
          // Windows default. gvisor is fully userspace, never touches
          // the firewall, and is the safest cross-version choice.
          {
            type: "tun",
            tag: "tun-in",
            auto_route: true,
            strict_route: true,
            address: ["172.19.0.1/30", "fdfe:dcba:9876::1/126"],
            stack: "gvisor",
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
      // Collect every proxy outbound's own server (host or IP literal)
      // so we can pin direct outbound for any traffic — including
      // traffic from non-Mint apps — that targets the VPN endpoint
      // itself. Without this, a browser tab opened to
      // `https://premium-ru.geodema.network/...` while the VPN is up
      // gets routed through the tun -> proxy outbound -> the same
      // server, asking the server to forward TCP to itself. Reality
      // accepts the inner CONNECT, you get an infinite encapsulation
      // loop, and every read times out at sing-box's connect_timeout
      // (12m15s in user logs). Bypassing the proxy server's host at
      // the route layer breaks the loop without forcing the user to
      // configure a custom whitelist.
      const proxyDomains = new Set<string>();
      const proxyIPs = new Set<string>();
      for (const ob of proxyOutbounds) {
        const h = typeof ob.server === "string" ? ob.server.trim() : "";
        if (!h) continue;
        if (/^\d{1,3}(\.\d{1,3}){3}$/.test(h)) {
          proxyIPs.add(`${h}/32`);
        } else if (h.includes(":") && /^[0-9a-fA-F:]+$/.test(h)) {
          proxyIPs.add(`${h}/128`);
        } else {
          proxyDomains.add(h.toLowerCase());
        }
      }
      const baseRules: Record<string, unknown>[] = [
        { protocol: "dns", outbound: "dns-out" },
        { process_name: ["Mint", "Mint.exe"], outbound: "direct" },
        { ip_is_private: true, outbound: "direct" },
      ];
      if (proxyDomains.size > 0) {
        baseRules.push({ domain: [...proxyDomains], outbound: "direct" });
      }
      if (proxyIPs.size > 0) {
        baseRules.push({ ip_cidr: [...proxyIPs], outbound: "direct" });
      }
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
        // NOTE: we deliberately do NOT set `route.default_domain_resolver`
        // here. That field only exists in sing-box ≥1.13, but the desktop
        // sidecar shipped via `.github/workflows/build.yml` is pinned to
        // 1.10.7 (see SINGBOX_VERSION there). On 1.10.7 the field is
        // rejected as `unknown field "default_domain_resolver"` and the
        // whole config fails to load (exit code 1 immediately on
        // Connect — exactly what 0.3.4 shipped with by accident).
        //
        // Outbound-server hostname resolution is steered to `direct`
        // instead through the `dns.rules` entry `{ outbound: ["any"],
        // server: "direct" }` above, which has been part of the DNS
        // schema since long before 1.10 and behaves the same as the
        // 1.13 `default_domain_resolver` for our purposes. Once we
        // bump the desktop sing-box to ≥1.13 we can re-introduce
        // `default_domain_resolver` for parity, but it's not necessary
        // for the RKN-bypass goal of this fix.
      };
    })(),
  };

  if (Object.keys(experimental).length > 0) {
    config.experimental = experimental;
  }

  return JSON.stringify(config, null, 2);
}
