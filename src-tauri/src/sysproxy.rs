

#[cfg(not(windows))]
mod stub {
    use tauri::AppHandle;

    #[tauri::command]
    pub fn sysproxy_set(_app: AppHandle, _server: String) -> Result<(), String> {
        Ok(())
    }
    #[tauri::command]
    pub fn sysproxy_clear(_app: AppHandle) -> Result<(), String> {
        Ok(())
    }
    #[tauri::command]
    pub fn sysproxy_clear_if_local(_app: AppHandle) -> Result<(), String> {
        Ok(())
    }

    pub fn restore_orphan_snapshot_at_startup(_app: &AppHandle) {}
    pub fn sysproxy_clear_blocking() {}
}

#[cfg(not(windows))]
pub use stub::*;

#[cfg(windows)]
use serde::{Deserialize, Serialize};
#[cfg(windows)]
use std::sync::Mutex;
#[cfg(windows)]
use tauri::{AppHandle, Manager};
#[cfg(windows)]
use winreg::enums::*;
#[cfg(windows)]
use winreg::RegKey;

#[cfg(windows)]
const KEY_PATH: &str = r"Software\Microsoft\Windows\CurrentVersion\Internet Settings";
#[cfg(windows)]
const SNAPSHOT_FILE: &str = "sysproxy.snapshot.json";
// Mint's local mixed inbound (configBuilder.ts:MIXED_INBOUND_PORT). Mirrored
// here so the startup cleanup can identify our own stale registry entries
// without dragging the JS engine into the boot path.
#[cfg(windows)]
const MINT_PROXY_PORT: u16 = 7890;

#[cfg(windows)]
#[derive(Default, Clone, Debug, Serialize, Deserialize)]
struct Snapshot {
    enable: u32,
    server: Option<String>,
    bypass: Option<String>,
}

#[cfg(windows)]
static PREVIOUS: Mutex<Option<Snapshot>> = Mutex::new(None);

#[cfg(windows)]
fn read_snapshot() -> Result<Snapshot, String> {
    let hkcu = RegKey::predef(HKEY_CURRENT_USER);
    let key = hkcu
        .open_subkey_with_flags(KEY_PATH, KEY_READ)
        .map_err(|e| format!("open IE Settings: {e}"))?;
    let enable: u32 = key.get_value("ProxyEnable").unwrap_or(0);
    let server: Option<String> = key.get_value("ProxyServer").ok();
    let bypass: Option<String> = key.get_value("ProxyOverride").ok();
    Ok(Snapshot { enable, server, bypass })
}

#[cfg(windows)]
fn write_snapshot(s: &Snapshot) -> Result<(), String> {
    let hkcu = RegKey::predef(HKEY_CURRENT_USER);
    let (key, _) = hkcu
        .create_subkey(KEY_PATH)
        .map_err(|e| format!("open IE Settings RW: {e}"))?;
    key.set_value("ProxyEnable", &s.enable)
        .map_err(|e| format!("set ProxyEnable: {e}"))?;
    if let Some(srv) = &s.server {
        key.set_value("ProxyServer", srv)
            .map_err(|e| format!("set ProxyServer: {e}"))?;
    } else {
        let _ = key.delete_value("ProxyServer");
    }
    if let Some(bp) = &s.bypass {
        key.set_value("ProxyOverride", bp)
            .map_err(|e| format!("set ProxyOverride: {e}"))?;
    } else {
        let _ = key.delete_value("ProxyOverride");
    }
    Ok(())
}

#[cfg(windows)]
fn snapshot_path(app: &AppHandle) -> Option<std::path::PathBuf> {
    app.path()
        .app_local_data_dir()
        .ok()
        .map(|p| p.join(SNAPSHOT_FILE))
}

#[cfg(windows)]
fn save_snapshot_to_disk(app: &AppHandle, s: &Snapshot) {
    let Some(p) = snapshot_path(app) else { return };
    if let Some(parent) = p.parent() {
        if std::fs::create_dir_all(parent).is_err() {
            return;
        }
    }
    if let Ok(json) = serde_json::to_string(s) {
        let _ = std::fs::write(&p, json);
    }
}

#[cfg(windows)]
fn delete_snapshot_from_disk(app: &AppHandle) {
    if let Some(p) = snapshot_path(app) {
        let _ = std::fs::remove_file(p);
    }
}

#[cfg(windows)]
fn load_snapshot_from_disk(app: &AppHandle) -> Option<Snapshot> {
    let p = snapshot_path(app)?;
    let content = std::fs::read_to_string(&p).ok()?;
    serde_json::from_str(&content).ok()
}

#[cfg(windows)]
fn looks_like_mint_local_proxy(server: &str) -> bool {
    let s = server.trim().to_ascii_lowercase();
    let port_suffix = format!(":{}", MINT_PROXY_PORT);
    // ProxyServer can be "host:port" or scheme prefixed ("http=host:port;https=...").
    // Treat any localhost host + Mint's port as ours.
    s.split([';', ' ']).any(|chunk| {
        let chunk = chunk.trim_start_matches(|c: char| c.is_ascii_alphabetic() || c == '=');
        (chunk.starts_with("127.0.0.1") || chunk.starts_with("localhost"))
            && chunk.ends_with(&port_suffix)
    })
}

#[cfg(windows)]
#[tauri::command]
pub fn sysproxy_set(app: AppHandle, server: String) -> Result<(), String> {
    let prev = read_snapshot()?;
    {
        let mut g = PREVIOUS
            .lock()
            .map_err(|e| format!("lock: {e}"))?;
        if g.is_none() {
            // Persist the *user's* pre-Mint proxy config to disk too, so a
            // crash/kill while connected doesn't lose the original settings.
            save_snapshot_to_disk(&app, &prev);
            *g = Some(prev.clone());
        }
    }
    let new = Snapshot {
        enable: 1,
        server: Some(server),
        bypass: Some(
            "<local>;localhost;127.*;10.*;172.16.*;172.17.*;172.18.*;172.19.*;172.20.*;172.21.*;172.22.*;172.23.*;172.24.*;172.25.*;172.26.*;172.27.*;172.28.*;172.29.*;172.30.*;172.31.*;192.168.*"
                .to_string(),
        ),
    };
    write_snapshot(&new)
}

#[cfg(windows)]
#[tauri::command]
pub fn sysproxy_clear(app: AppHandle) -> Result<(), String> {
    sysproxy_clear_inner(&app)
}

#[cfg(windows)]
fn sysproxy_clear_inner(app: &AppHandle) -> Result<(), String> {
    let prev = {
        let mut g = PREVIOUS
            .lock()
            .map_err(|e| format!("lock: {e}"))?;
        g.take()
    };
    let restore = prev.unwrap_or_else(|| Snapshot {
        enable: 0,
        server: None,
        bypass: None,
    });
    write_snapshot(&restore)?;
    delete_snapshot_from_disk(app);
    Ok(())
}

// Defensive variant used at app startup. Only touches the registry if the
// current ProxyServer matches Mint's own local mixed inbound — otherwise we'd
// happily wipe a user's unrelated corporate / system proxy on every launch.
#[cfg(windows)]
#[tauri::command]
pub fn sysproxy_clear_if_local(app: AppHandle) -> Result<(), String> {
    let current = read_snapshot()?;
    let stuck = current.enable == 1
        && current
            .server
            .as_deref()
            .map(looks_like_mint_local_proxy)
            .unwrap_or(false);
    if !stuck {
        return Ok(());
    }
    sysproxy_clear_inner(&app)
}

// Called from `lib.rs` setup() before the webview loads. If a previous Mint
// session left a snapshot on disk (i.e. crashed / was killed without a
// graceful disconnect), restore the user's original proxy config now.
#[cfg(windows)]
pub fn restore_orphan_snapshot_at_startup(app: &AppHandle) {
    let Some(snapshot) = load_snapshot_from_disk(app) else { return };
    // Only act if the registry still points at Mint's stale proxy. If the
    // user already restored their proxy manually (or another tool fixed it),
    // leave their settings alone.
    let current = read_snapshot().unwrap_or_default();
    let stuck = current.enable == 1
        && current
            .server
            .as_deref()
            .map(looks_like_mint_local_proxy)
            .unwrap_or(false);
    if stuck {
        let _ = write_snapshot(&snapshot);
    }
    delete_snapshot_from_disk(app);
}

// Synchronous variant used during graceful shutdown / `prepare_for_update`.
// Mirrors `sysproxy_clear` but doesn't depend on the JS event loop.
#[cfg(windows)]
pub fn sysproxy_clear_blocking() {
    let prev = {
        match PREVIOUS.lock() {
            Ok(mut g) => g.take(),
            Err(_) => None,
        }
    };
    let restore = prev.unwrap_or_else(|| Snapshot {
        enable: 0,
        server: None,
        bypass: None,
    });
    let _ = write_snapshot(&restore);
}
