
use once_cell::sync::Lazy;
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_shell::process::{CommandChild, CommandEvent};
use tauri_plugin_shell::ShellExt;
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::Child as TokioChild;

enum RunningChild {
    PluginShell(CommandChild),
    Tokio(TokioChild),
}

impl RunningChild {
    fn kill(self) -> Result<(), String> {
        match self {
            RunningChild::PluginShell(c) => c.kill().map_err(|e| e.to_string()),
            RunningChild::Tokio(mut c) => {
                c.start_kill().map_err(|e| e.to_string())
            }
        }
    }
}

static CHILD: Lazy<Mutex<Option<RunningChild>>> = Lazy::new(|| Mutex::new(None));

fn resolve_sing_box_binary(app: &AppHandle) -> Option<std::path::PathBuf> {
    let ext = if cfg!(windows) { ".exe" } else { "" };
    if let Ok(exe) = std::env::current_exe() {
        if let Some(dir) = exe.parent() {
            for candidate in [
                format!("sing-box{ext}"),
                format!("sing-box-x86_64-pc-windows-msvc{ext}"),
                format!("sing-box-x86_64-apple-darwin{ext}"),
                format!("sing-box-aarch64-apple-darwin{ext}"),
                format!("sing-box-x86_64-unknown-linux-gnu{ext}"),
            ] {
                let p = dir.join(&candidate);
                if p.is_file() {
                    return Some(p);
                }
            }
        }
    }
    if let Ok(res) = app.path().resource_dir() {
        for candidate in [
            format!("sing-box{ext}"),
            format!("sing-box-x86_64-pc-windows-msvc{ext}"),
        ] {
            let p = res.join(&candidate);
            if p.is_file() {
                return Some(p);
            }
        }
    }
    None
}

#[cfg(windows)]
fn ensure_wintun_dll(app: &AppHandle) {
    // sing-box's TUN inbound on Windows requires wintun.dll in a location
    // searchable by LoadLibrary — typically the same directory as the
    // sing-box.exe sidecar. The Tauri NSIS bundler stages wintun.dll under
    // <install_dir>/resources/, so on first run we copy it next to
    // sing-box.exe if it isn't already there.
    let Ok(exe) = std::env::current_exe() else { return };
    let Some(install_dir) = exe.parent() else { return };
    let target = install_dir.join("wintun.dll");
    if target.is_file() {
        return;
    }
    let candidates: Vec<std::path::PathBuf> = {
        let mut v = Vec::new();
        if let Ok(res) = app.path().resource_dir() {
            v.push(res.join("wintun.dll"));
            v.push(res.join("binaries").join("wintun.dll"));
        }
        v.push(install_dir.join("resources").join("wintun.dll"));
        v.push(install_dir.join("resources").join("binaries").join("wintun.dll"));
        v
    };
    for src in candidates {
        if src.is_file() {
            if let Err(e) = std::fs::copy(&src, &target) {
                eprintln!("ensure_wintun_dll: copy {src:?} -> {target:?} failed: {e}");
            }
            break;
        }
    }
}

#[cfg(not(windows))]
fn ensure_wintun_dll(_app: &AppHandle) {}

#[tauri::command]
pub async fn singbox_start(app: AppHandle, config: String) -> Result<(), String> {
    if CHILD.lock().map_err(|e| e.to_string())?.is_some() {
        return Err("sing-box уже запущен".to_string());
    }

    ensure_wintun_dll(&app);

    let base = app
        .path()
        .app_local_data_dir()
        .map_err(|e| format!("Не удалось получить AppLocalData: {e}"))?;
    let run_dir = base.join("run");
    std::fs::create_dir_all(&run_dir).map_err(|e| format!("mkdir {run_dir:?}: {e}"))?;
    let cfg_path = run_dir.join("config.json");
    std::fs::write(&cfg_path, &config).map_err(|e| format!("write config: {e}"))?;

    let cfg_str = cfg_path
        .to_str()
        .ok_or_else(|| "config path не UTF-8".to_string())?;
    let dir_str = run_dir
        .to_str()
        .ok_or_else(|| "run dir не UTF-8".to_string())?;

    let spawn_result: Result<_, String> = match app.shell().sidecar("sing-box") {
        Ok(cmd) => cmd
            .args(["run", "-c", cfg_str, "-D", dir_str])
            .spawn()
            .map_err(|e| format!("spawn sing-box: {e}")),
        Err(e) => Err(format!("sidecar('sing-box'): {e}")),
    };

    let running = match spawn_result {
        Ok((rx, child)) => {
            let app_handle = app.clone();
            tauri::async_runtime::spawn(async move {
                let mut rx = rx;
                while let Some(event) = rx.recv().await {
                    match event {
                        CommandEvent::Stdout(line) | CommandEvent::Stderr(line) => {
                            let text = String::from_utf8_lossy(&line).to_string();
                            let _ = app_handle.emit("singbox-log", text);
                        }
                        CommandEvent::Terminated(payload) => {
                            let _ = app_handle.emit("singbox-exit", payload.code);
                            if let Ok(mut guard) = CHILD.lock() {
                                *guard = None;
                            }
                        }
                        _ => {}
                    }
                }
            });
            RunningChild::PluginShell(child)
        }
        Err(native_err) => {
            let path = resolve_sing_box_binary(&app).ok_or_else(|| {
                format!(
                    "sing-box sidecar не найден. Убедитесь, что sing-box.exe лежит рядом с Mint.exe. ({native_err})",
                )
            })?;
            let mut cmd = tokio::process::Command::new(&path);
            cmd.args(["run", "-c", cfg_str, "-D", dir_str])
                .stdout(std::process::Stdio::piped())
                .stderr(std::process::Stdio::piped())
                .kill_on_drop(true);
            #[cfg(windows)]
            {
                use std::os::windows::process::CommandExt;
                cmd.creation_flags(0x0800_0000);
            }
            let mut child = cmd
                .spawn()
                .map_err(|e| format!("spawn sing-box (fallback): {e}"))?;

            let stdout = child.stdout.take();
            let stderr = child.stderr.take();
            let app_handle = app.clone();
            tauri::async_runtime::spawn(async move {
                let fwd_stdout = async {
                    if let Some(s) = stdout {
                        let mut lines = BufReader::new(s).lines();
                        while let Ok(Some(line)) = lines.next_line().await {
                            let _ = app_handle.emit("singbox-log", line);
                        }
                    }
                };
                let fwd_stderr = async {
                    if let Some(s) = stderr {
                        let mut lines = BufReader::new(s).lines();
                        while let Ok(Some(line)) = lines.next_line().await {
                            let _ = app_handle.emit("singbox-log", line);
                        }
                    }
                };
                tokio::join!(fwd_stdout, fwd_stderr);
                let _ = app_handle.emit("singbox-exit", Option::<i32>::None);
                if let Ok(mut guard) = CHILD.lock() {
                    *guard = None;
                }
            });
            RunningChild::Tokio(child)
        }
    };

    *CHILD.lock().map_err(|e| e.to_string())? = Some(running);
    Ok(())
}

#[tauri::command]
pub fn singbox_stop() -> Result<(), String> {
    let mut guard = CHILD.lock().map_err(|e| e.to_string())?;
    if let Some(child) = guard.take() {
        child.kill().map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub fn singbox_running() -> bool {
    CHILD
        .lock()
        .map(|g| g.is_some())
        .unwrap_or(false)
}

#[tauri::command]
pub fn singbox_kill_orphans() -> Result<(), String> {
    kill_all_blocking();
    Ok(())
}

pub(crate) fn kill_all_blocking() {
    if let Ok(mut guard) = CHILD.lock() {
        if let Some(c) = guard.take() {
            let _ = c.kill();
        }
    }
    std::thread::sleep(std::time::Duration::from_millis(80));
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        let mut cmd = std::process::Command::new("taskkill");
        cmd.args(["/F", "/IM", "sing-box.exe", "/T"]);
        cmd.creation_flags(0x0800_0000);
        let _ = cmd.output();
    }
    #[cfg(unix)]
    {
        let _ = std::process::Command::new("pkill")
            .args(["-f", "sing-box"])
            .output();
    }
}

#[tauri::command]
pub fn singbox_pick_free_clash_port() -> Option<u16> {
    use std::net::{Ipv4Addr, SocketAddrV4, TcpListener};
    for _ in 0..32 {
        let port: u16 = 19090 + (rand_u16() % 10000);
        let addr = SocketAddrV4::new(Ipv4Addr::LOCALHOST, port);
        if TcpListener::bind(addr).is_ok() {
            return Some(port);
        }
    }
    if let Ok(listener) = TcpListener::bind(SocketAddrV4::new(Ipv4Addr::LOCALHOST, 0)) {
        if let Ok(addr) = listener.local_addr() {
            return Some(addr.port());
        }
    }
    None
}

fn rand_u16() -> u16 {
    use std::sync::atomic::{AtomicU64, Ordering};
    use std::time::{SystemTime, UNIX_EPOCH};
    static STATE: AtomicU64 = AtomicU64::new(0);
    let mut s = STATE.load(Ordering::Relaxed);
    if s == 0 {
        s = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|d| d.as_nanos() as u64)
            .unwrap_or(0x9E3779B97F4A7C15);
    }
    s ^= s << 13;
    s ^= s >> 7;
    s ^= s << 17;
    if s == 0 {
        s = 0x9E3779B97F4A7C15;
    }
    STATE.store(s, Ordering::Relaxed);
    s as u16
}
