
use std::sync::atomic::{AtomicBool, Ordering};

static ACTIVE: AtomicBool = AtomicBool::new(false);

#[tauri::command]
pub fn killswitch_active() -> bool {
    ACTIVE.load(Ordering::SeqCst)
}

#[tauri::command]
pub async fn killswitch_enable() -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        windows::enable()?;
    }
    ACTIVE.store(true, Ordering::SeqCst);
    Ok(())
}

#[tauri::command]
pub async fn killswitch_disable() -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        windows::disable()?;
    }
    ACTIVE.store(false, Ordering::SeqCst);
    Ok(())
}

pub(crate) fn disable_blocking() {
    #[cfg(target_os = "windows")]
    {
        let _ = windows::disable();
    }
    ACTIVE.store(false, Ordering::SeqCst);
}

#[cfg(target_os = "windows")]
mod windows {
    use std::os::windows::process::CommandExt;
    use std::process::Command;

    const CREATE_NO_WINDOW: u32 = 0x08000000;

    const GROUP: &str = "Mint Kill Switch";

    pub fn enable() -> Result<(), String> {
        disable_silent();

        let mut sb = std::env::current_exe().map_err(|e| e.to_string())?;
        sb.pop();
        sb.push("sing-box.exe");
        let sb_path = sb.to_string_lossy().to_string();

        run_netsh(&[
            "advfirewall", "firewall", "add", "rule",
            &format!("name=Mint KS allow sing-box"),
            "dir=out",
            "action=allow",
            &format!("program={}", sb_path),
            "enable=yes",
            &format!("description={}", GROUP),
        ])?;

        run_netsh(&[
            "advfirewall", "firewall", "add", "rule",
            "name=Mint KS allow loopback",
            "dir=out",
            "action=allow",
            "remoteip=127.0.0.1,::1",
            "enable=yes",
            &format!("description={}", GROUP),
        ])?;

        run_netsh(&[
            "advfirewall", "firewall", "add", "rule",
            "name=Mint KS block all",
            "dir=out",
            "action=block",
            "enable=yes",
            &format!("description={}", GROUP),
        ])?;

        Ok(())
    }

    pub fn disable() -> Result<(), String> {
        disable_silent();
        Ok(())
    }

    fn disable_silent() {
        for name in [
            "Mint KS allow sing-box",
            "Mint KS allow loopback",
            "Mint KS block all",
        ] {
            let _ = run_netsh(&[
                "advfirewall", "firewall", "delete", "rule",
                &format!("name={}", name),
            ]);
        }
    }

    fn run_netsh(args: &[&str]) -> Result<(), String> {
        let output = Command::new("netsh")
            .args(args)
            .creation_flags(CREATE_NO_WINDOW)
            .output()
            .map_err(|e| format!("netsh spawn: {e}"))?;
        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            return Err(format!(
                "netsh exit {}: {}",
                output.status.code().unwrap_or(-1),
                stderr.trim()
            ));
        }
        Ok(())
    }
}
