use serde::Serialize;
use tauri::{AppHandle, Emitter};

#[derive(Debug, Serialize)]
pub struct SubscriptionResponse {
    pub body: String,
    pub user_info: Option<String>,
    pub update_interval: Option<String>,
    pub title: Option<String>,
    /// `x-server-description` — short tagline shown under each server
    /// row imported from this subscription. Optional; tolerant parse:
    /// missing / non-UTF8 / empty -> None.
    pub server_description: Option<String>,
    /// `x-profile-description` — short tagline shown under the folder
    /// header that wraps this subscription. Optional, same semantics.
    pub profile_description: Option<String>,
    /// `support-url` — a contact link (Telegram bot, support form,
    /// etc.) the subscription folder header surfaces as a one-click
    /// button. Optional.
    pub support_url: Option<String>,
    /// `profile-web-page-url` — landing page / dashboard link the
    /// subscription folder header surfaces alongside the support link.
    /// Optional.
    pub web_page_url: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct AppVersion {
    pub name: String,
    pub version: String,
    pub channel: String,
}

#[tauri::command]
pub fn app_version() -> AppVersion {
    AppVersion {
        name: "Mint".to_string(),
        version: env!("CARGO_PKG_VERSION").to_string(),
        channel: "dev".to_string(),
    }
}

#[tauri::command]
pub fn is_elevated() -> bool {
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        use std::process::Command;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        let output = Command::new("powershell.exe")
            .args([
                "-NoProfile", "-NonInteractive", "-Command",
                "([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)",
            ])
            .creation_flags(CREATE_NO_WINDOW)
            .output();
        match output {
            Ok(o) if o.status.success() => {
                let s = String::from_utf8_lossy(&o.stdout).trim().to_lowercase();
                s == "true"
            }
            _ => false,
        }
    }
    #[cfg(not(windows))]
    {
        unsafe { libc::geteuid() == 0 }
    }
}

// Probe a remote host:port and report the median round-trip in
// milliseconds. By default we layer a single TLS ClientHello on top
// of the TCP connect; callers can opt out with `tlsHandshake: false`
// to get a pure TCP three-way handshake.
//
// Timing: we report a single round-trip (1 RTT) regardless of the
// probe mode, so the number lines up with every other "ping" the
// user sees — system `ping`, the dashboard tunnel-ping card, and
// external speedtests. For the bare-TCP fallback that's the
// SYN/SYN-ACK leg of the three-way handshake (one RTT). For the
// default TLS mode it's the time from *after* TCP-connect to the
// first byte of the peer's reply (also one RTT). Earlier versions
// timed both legs of the TLS path and double-counted, which is why
// the same Finland hop showed ~50 ms in the stats card and ~100 ms
// in the row.
//
// Why default to TLS instead of bare TCP:
// Mint runs sing-box in TUN mode with the gvisor user-mode TCP/IP
// stack. While the tunnel is up, every outbound TCP `connect()` is
// SYN-ACK'd by gvisor *locally*, in <1ms, before the SYN ever leaves
// the machine. `TcpStream::connect` therefore returns almost
// instantly and the median lands at 0–1ms regardless of how far the
// real server is.
//
// The Mint process itself is matched by `process_name: ["Mint",
// "Mint.exe"] -> direct` in `configBuilder.ts`, so once gvisor
// hands sing-box bytes to forward they go out via the `direct`
// outbound (auto-bound to the active physical interface), bypassing
// the proxy. But the application-side TCP stream is already
// "connected" by then. The only way to measure a real RTT under TUN
// is to force gvisor to actually move bytes — which is what sending
// a TLS ClientHello and waiting for the first response byte does.
//
// We deliberately do NOT use `reqwest::head()` here. A full HTTP
// HEAD over rustls is TCP-connect + TLS-1.3 handshake (which on
// Reality/Vision servers transparently forwards to the configured
// `dest=` host like www.gstatic.com — across the public internet,
// not just to our proxy node) + an HTTP request/response. That is
// 3–4 RTT and routinely inflates list-pings to 200–500ms, while
// the connect-panel ping (`/proxies/.../delay` over an already-open
// tunnel) shows the real ~1 RTT.
//
// Sending a 50-byte TLS 1.0 ClientHello and reading a single byte
// of the reply takes exactly one round trip after TCP-connect: the
// server answers with a ServerHello, a TLS Alert, or an RST — all
// of those are a single packet from the proxy's own TLS stack and
// never traverse the `dest=` forwarder. The numbers it produces
// match the connect-panel within noise.
//
// Callers that want the cleaner bare-TCP RTT can still pass
// `tlsHandshake: false` (e.g. when the VPN is known to be off).
#[tauri::command(rename_all = "camelCase")]
pub async fn ping_test(
    app: AppHandle,
    host: String,
    attempts: Option<usize>,
    timeout_ms: Option<u64>,
    tls_handshake: Option<bool>,
) -> Result<u32, String> {
    use std::net::ToSocketAddrs;
    use tokio::net::TcpStream;
    use tokio::time::{timeout, Duration, Instant};

    let target = if host.contains(':') {
        host.clone()
    } else {
        format!("{host}:443")
    };

    let dns_started = Instant::now();
    let addrs: Vec<_> = match target.to_socket_addrs() {
        Ok(it) => it.collect(),
        Err(e) => {
            let msg = format!("DNS: {e}");
            let _ = app.emit(
                "ping-diag",
                serde_json::json!({ "host": host, "error": msg, "stage": "dns" }),
            );
            return Err(msg);
        }
    };
    let addr = match addrs.into_iter().next() {
        Some(a) => a,
        None => {
            let msg = format!("DNS: no addresses for {target}");
            let _ = app.emit(
                "ping-diag",
                serde_json::json!({ "host": host, "error": msg, "stage": "dns" }),
            );
            return Err(msg);
        }
    };
    let dns_ms = dns_started.elapsed().as_millis();

    let attempts_received = attempts;
    let timeout_ms_received = timeout_ms;
    let attempts = attempts.unwrap_or(3).clamp(1, 10);
    let attempt_timeout = Duration::from_millis(timeout_ms.unwrap_or(2500).clamp(200, 10_000));
    let do_tls = tls_handshake.unwrap_or(true);
    let mut measurements: Vec<u128> = Vec::with_capacity(attempts);
    let mut errors: Vec<String> = Vec::new();
    let mut last_err: Option<String> = None;
    let mut used_tls = false;
    let mut tls_failed = false;
    for _ in 0..attempts {
        if do_tls {
            match tls_hello_probe(addr, attempt_timeout).await {
                Ok(post_connect_ms) => {
                    measurements.push(post_connect_ms);
                    used_tls = true;
                    tokio::time::sleep(Duration::from_millis(80)).await;
                    continue;
                }
                Err(TlsProbeErr::AfterConnect(post_connect_ms)) => {
                    // We finished the TCP three-way handshake and the
                    // peer also reacted to our ClientHello (RST,
                    // half-close, etc.) — that round-trip is a real
                    // RTT, count it.
                    measurements.push(post_connect_ms);
                    used_tls = true;
                    tokio::time::sleep(Duration::from_millis(80)).await;
                    continue;
                }
                Err(TlsProbeErr::Connect(e)) => {
                    // Couldn't even establish the TCP underneath the
                    // TLS attempt — fall through to a bare-TCP probe
                    // below so we still emit a measurement.
                    errors.push(format!("tls: {e}"));
                    last_err = Some(format!("tls: {e}"));
                    tls_failed = true;
                }
                Err(TlsProbeErr::Timeout) => {
                    errors.push("tls: timeout".into());
                    last_err = Some("tls: timeout".into());
                    tls_failed = true;
                    tokio::time::sleep(Duration::from_millis(80)).await;
                    continue;
                }
            }
        }
        let started = Instant::now();
        match timeout(attempt_timeout, TcpStream::connect(addr)).await {
            Ok(Ok(stream)) => {
                let elapsed = started.elapsed().as_millis();
                drop(stream);
                measurements.push(elapsed);
            }
            Ok(Err(e)) => {
                let es = e.to_string();
                errors.push(es.clone());
                last_err = Some(es);
            }
            Err(_) => {
                errors.push("timeout".into());
                last_err = Some("timeout".into());
            }
        }
        tokio::time::sleep(Duration::from_millis(80)).await;
    }

    let mode = if used_tls {
        "tls"
    } else if tls_failed {
        "tls→tcp"
    } else {
        "tcp"
    };
    let _ = app.emit(
        "ping-diag",
        serde_json::json!({
            "host": host,
            "resolved": addr.to_string(),
            "dns_ms": dns_ms,
            "attempts_ms": measurements,
            "errors": errors,
            "args_attempts": attempts_received,
            "args_timeout_ms": timeout_ms_received,
            "mode": mode,
        }),
    );

    if measurements.is_empty() {
        return Err(last_err.unwrap_or_else(|| "no successful TCP connect".into()));
    }
    measurements.sort_unstable();
    let median = measurements[measurements.len() / 2];
    eprintln!(
        "[ping_test] {host} -> {addr} dns={dns_ms}ms mode={mode} attempts={measurements:?} median={median}ms"
    );
    Ok(median.min(u32::MAX as u128) as u32)
}

enum TlsProbeErr {
    /// TCP `connect()` failed before we could send anything.
    Connect(String),
    /// We timed out waiting for either the TCP connect, the
    /// ClientHello write, or the first byte of the reply.
    Timeout,
    /// TCP succeeded and our ClientHello reached the peer, but the
    /// peer responded by closing/resetting instead of speaking TLS.
    /// The caller can still treat the elapsed time as a real RTT.
    /// `post_connect_ms` is the time from end-of-TCP-connect to the
    /// peer's reaction — i.e. exactly one round-trip, matching what
    /// every other ping/speedtest tool reports.
    AfterConnect(u128),
}

// Send a tiny, version-agnostic TLS 1.0 ClientHello and wait for the
// first byte of the server's response. This is the cheapest probe
// that still forces a real round trip across the proxy:
//   - The record header advertises TLS 1.0 so even ancient stacks
//     accept it.
//   - The inner ClientHello advertises TLS 1.2 (0x0303) and a single
//     mandatory cipher suite (TLS_RSA_WITH_AES_128_CBC_SHA, 0x002F).
//   - There are no extensions — no SNI, no ALPN, no Reality auth.
//
// Reality / Vision proxies that don't recognise the auth handshake
// will reply with a TLS Alert (single record, ~7 bytes) or close the
// connection. Either way we read exactly one byte and stop. We never
// finish a handshake, so we never trigger the proxy's `dest=`
// forwarder — the measurement stays local to the proxy.
async fn tls_hello_probe(
    addr: std::net::SocketAddr,
    attempt_timeout: std::time::Duration,
) -> Result<u128, TlsProbeErr> {
    use tokio::io::{AsyncReadExt, AsyncWriteExt};
    use tokio::net::TcpStream;
    use tokio::time::{timeout, Instant};

    // 5-byte TLS record header (0x16 = handshake, 0x0301 = TLS 1.0,
    // length = 0x002D = 45) followed by a 45-byte ClientHello body:
    //   handshake header  : 01 00 00 29       (ClientHello, len 41)
    //   client_version    : 03 03             (TLS 1.2)
    //   random            : 32 zero bytes
    //   session_id        : 00                (empty)
    //   cipher_suites     : 00 02 00 2F       (TLS_RSA_WITH_AES_128_CBC_SHA)
    //   compression       : 01 00             (null)
    // Total wire size: 50 bytes.
    const CLIENT_HELLO: [u8; 50] = [
        0x16, 0x03, 0x01, 0x00, 0x2D,
        0x01, 0x00, 0x00, 0x29,
        0x03, 0x03,
        0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
        0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
        0x00,
        0x00, 0x02, 0x00, 0x2F,
        0x01, 0x00,
    ];

    let mut stream = match timeout(attempt_timeout, TcpStream::connect(addr)).await {
        Ok(Ok(s)) => s,
        Ok(Err(e)) => return Err(TlsProbeErr::Connect(e.to_string())),
        Err(_) => return Err(TlsProbeErr::Timeout),
    };
    // Start the timer *after* TCP-connect completes. The TCP
    // three-way handshake is itself one RTT, but every other ping
    // tool (system `ping`, the dashboard's tunnel-ping card,
    // external speedtests) reports a single RTT for latency. Timing
    // both legs would double our reading and is exactly the
    // user-visible bug — the row pinged 101 ms while the same hop
    // measured ~50 ms everywhere else.
    let started = Instant::now();
    let _ = stream.set_nodelay(true);

    match timeout(attempt_timeout, stream.write_all(&CLIENT_HELLO)).await {
        Ok(Ok(())) => {}
        Ok(Err(_)) => return Err(TlsProbeErr::AfterConnect(started.elapsed().as_millis())),
        Err(_) => return Err(TlsProbeErr::Timeout),
    }

    let mut buf = [0u8; 1];
    match timeout(attempt_timeout, stream.read(&mut buf)).await {
        // Read of any size (including 0 = clean EOF) means the peer
        // saw our bytes and reacted — that's a full RTT.
        Ok(Ok(_)) => Ok(started.elapsed().as_millis()),
        Ok(Err(_)) => Err(TlsProbeErr::AfterConnect(started.elapsed().as_millis())),
        Err(_) => Err(TlsProbeErr::Timeout),
    }
}

#[tauri::command]
pub async fn fetch_subscription(url: String) -> Result<SubscriptionResponse, String> {
    const UAS: &[&str] = &[
        "Mint/0.1.0",
        "clash-verge/1.7.7",
        "FlClash/0.8.71",
        "Happ/3.13.0",
        "v2rayNG/1.8.11",
        "ClashforWindows/0.20.32",
    ];

    let mut last_err: Option<String> = None;
    for ua in UAS {
        match try_fetch(&url, ua).await {
            Ok(resp) if looks_like_subscription(&resp.body) => return Ok(resp),
            Ok(resp) => {
                last_err = Some(format!(
                    "Сервер вернул нераспознанный ответ ({} байт)",
                    resp.body.len()
                ));
                if *ua == UAS.last().copied().unwrap_or_default() {
                    return Ok(resp);
                }
            }
            Err(e) => last_err = Some(e),
        }
    }
    Err(last_err.unwrap_or_else(|| "Не удалось загрузить подписку".to_string()))
}

async fn try_fetch(url: &str, ua: &str) -> Result<SubscriptionResponse, String> {
    let client = reqwest::Client::builder()
        .user_agent(ua)
        .timeout(std::time::Duration::from_secs(10))
        .build()
        .map_err(|e| e.to_string())?;
    let mut req = client.get(url);
    if ua.starts_with("Happ/") {
        req = req
            .header("X-Device-Os", "Android")
            .header("X-Device-Locale", "ru")
            .header("X-Device-Model", "ELP-NX1")
            .header("X-Ver-Os", "15");
    }
    let resp = req
        .send()
        .await
        .map_err(|e| format!("Не удалось загрузить подписку: {e}"))?;
    if !resp.status().is_success() {
        return Err(format!("Ответ сервера: HTTP {}", resp.status()));
    }
    let headers = resp.headers().clone();
    let header = |name: &str| {
        headers
            .get(name)
            .and_then(|v| v.to_str().ok())
            .map(|s| s.to_string())
    };
    let user_info = header("subscription-userinfo");
    let update_interval = header("profile-update-interval");
    let title = header("profile-title");
    let server_description = header("x-server-description");
    // Folder description: try every realistic header name we've seen
    // panels emit. Mint's own server uses `x-profile-description`,
    // but Marzban / Marzneshin / Hiddify / xUI / 3xUI variants ship
    // the announcement under `announce`, `profile-description`,
    // `subscription-description` (or even just `description` on the
    // older Hiddify branch). First non-empty wins. This was the cause
    // of "у нас не ставится описание подписки" on subscriptions that
    // worked in Happ — Happ reads `announce` and showed the panel's
    // welcome message, while Mint only looked at the Mint-specific
    // header so it always landed on undefined.
    let profile_description = header("x-profile-description")
        .or_else(|| header("profile-description"))
        .or_else(|| header("subscription-description"))
        .or_else(|| header("announce"))
        .or_else(|| header("description"));
    let support_url = header("support-url");
    let web_page_url = header("profile-web-page-url");
    let body = resp
        .text()
        .await
        .map_err(|e| format!("Не удалось прочитать ответ: {e}"))?;
    Ok(SubscriptionResponse {
        body,
        user_info,
        update_interval,
        title,
        server_description,
        profile_description,
        support_url,
        web_page_url,
    })
}

fn looks_like_subscription(body: &str) -> bool {
    let trimmed = body.trim();
    if trimmed.is_empty() {
        return false;
    }
    if trimmed.contains("vless://")
        || trimmed.contains("vmess://")
        || trimmed.contains("trojan://")
        || trimmed.contains("ss://")
        || trimmed.contains("ssconf://")
    {
        return true;
    }
    if (trimmed.contains("proxies:") || trimmed.contains("proxy-providers:"))
        && !is_empty_clash_yaml(trimmed)
    {
        return true;
    }
    if (trimmed.starts_with('{') || trimmed.starts_with('['))
        && trimmed.contains("\"outbounds\"")
    {
        return true;
    }
    let one_line: String = trimmed
        .chars()
        .filter(|c| !c.is_whitespace())
        .collect();
    if one_line.len() >= 64
        && one_line
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '+' || c == '/' || c == '=' || c == '-' || c == '_')
    {
        return true;
    }
    false
}

fn is_empty_clash_yaml(body: &str) -> bool {
    if body.contains("proxy-providers:") {
        return false;
    }
    let mut in_proxies_block = false;
    let mut proxies_seen = false;
    let mut entries_in_proxies = false;
    for raw_line in body.lines() {
        let line = raw_line.trim_end();
        let trimmed = line.trim_start();

        let is_top_level_key =
            !line.is_empty() && !line.starts_with(' ') && !line.starts_with('\t');
        if is_top_level_key && !line.starts_with("proxies:") && in_proxies_block {
            in_proxies_block = false;
        }

        if line.starts_with("proxies:") {
            proxies_seen = true;
            if line.trim_end().ends_with("[]") {
                in_proxies_block = false;
            } else {
                in_proxies_block = true;
            }
            continue;
        }

        if in_proxies_block {
            if trimmed.starts_with("- ") {
                entries_in_proxies = true;
                break;
            }
        }
    }
    proxies_seen && !entries_in_proxies
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_stub_clash_yaml() {
        let stub = "mixed-port: 7890\nproxies: []\nproxy-groups:\n  - name: → group\n    type: select\n    proxies: []\nrules:\n  - MATCH,→ group\n";
        assert!(is_empty_clash_yaml(stub));
        assert!(!looks_like_subscription(stub));
    }

    #[test]
    fn accepts_populated_clash_yaml() {
        let yaml = "proxies:\n  - name: SE-1\n    type: vless\n    server: 1.2.3.4\n    port: 443\n";
        assert!(!is_empty_clash_yaml(yaml));
        assert!(looks_like_subscription(yaml));
    }

    #[test]
    fn accepts_v2rayng_json_array() {
        let body = r#"[{"outbounds":[{"protocol":"vless"}]}]"#;
        assert!(looks_like_subscription(body));
    }

    #[test]
    fn accepts_singbox_json() {
        let body = r#"{"outbounds":[{"type":"vless"}]}"#;
        assert!(looks_like_subscription(body));
    }
}

