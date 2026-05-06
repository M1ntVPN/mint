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

// Probe a remote host:port with a raw TCP handshake and report the
// median round-trip in milliseconds.
//
// Why no TLS / HTTP layer here:
// The previous version of this command optionally layered a TLS HEAD
// request on top of the TCP connect, which sounded reasonable for a
// "ping" but produced **fake-looking** times against VPN proxy ports.
// VPN servers (VLESS, Trojan, Shadowsocks, etc.) do not actually
// terminate TLS in the way `reqwest` expects — most either close the
// connection mid-handshake or hold it open while sing-box-style
// inner-protocol negotiation happens. The old code recorded the
// elapsed time even when the TLS handshake **failed** with a
// non-connect error, so what got reported was "TCP connect + part of
// a doomed TLS handshake" instead of a clean RTT. The user reported
// every server in the list converging on ~30–40 ms regardless of
// geography, which is exactly what an early-aborted TLS handshake to
// a nearby anti-censorship CDN edge looks like.
//
// The fix is to drop the TLS layer entirely. A TCP three-way handshake
// is a single RTT — what every other ping/mtr/speedtest tool reports —
// and it works equally well for every protocol we support, since
// `server:port` is always the literal listener for the proxy.
#[tauri::command(rename_all = "camelCase")]
pub async fn ping_test(
    app: AppHandle,
    host: String,
    attempts: Option<usize>,
    timeout_ms: Option<u64>,
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
    let mut measurements: Vec<u128> = Vec::with_capacity(attempts);
    let mut errors: Vec<String> = Vec::new();
    let mut last_err: Option<String> = None;
    for _ in 0..attempts {
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
            "mode": "tcp",
        }),
    );

    if measurements.is_empty() {
        return Err(last_err.unwrap_or_else(|| "no successful TCP connect".into()));
    }
    measurements.sort_unstable();
    let median = measurements[measurements.len() / 2];
    eprintln!(
        "[ping_test] {host} -> {addr} dns={dns_ms}ms attempts={measurements:?} median={median}ms"
    );
    Ok(median.min(u32::MAX as u128) as u32)
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
    let profile_description = header("x-profile-description");
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

