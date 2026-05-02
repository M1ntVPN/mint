

#[cfg(not(windows))]
mod stub {
    #[tauri::command]
    pub fn sysproxy_set(_server: String) -> Result<(), String> {
        Ok(())
    }
    #[tauri::command]
    pub fn sysproxy_clear() -> Result<(), String> {
        Ok(())
    }
}

#[cfg(not(windows))]
pub use stub::*;

#[cfg(windows)]
use serde::{Deserialize, Serialize};
#[cfg(windows)]
use std::sync::Mutex;
#[cfg(windows)]
use winreg::enums::*;
#[cfg(windows)]
use winreg::RegKey;

#[cfg(windows)]
const KEY_PATH: &str = r"Software\Microsoft\Windows\CurrentVersion\Internet Settings";

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
#[tauri::command]
pub fn sysproxy_set(server: String) -> Result<(), String> {
    let prev = read_snapshot()?;
    {
        let mut g = PREVIOUS
            .lock()
            .map_err(|e| format!("lock: {e}"))?;
        if g.is_none() {
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
pub fn sysproxy_clear() -> Result<(), String> {
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
    write_snapshot(&restore)
}
