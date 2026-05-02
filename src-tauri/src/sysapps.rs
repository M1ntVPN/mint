
use serde::Serialize;
use std::collections::HashSet;
use std::path::{Path, PathBuf};

#[derive(Debug, Serialize, Clone)]
pub struct AppEntry {
    pub name: String,
    pub exe: String,
    pub path: Option<String>,
    pub key: String,
}

#[derive(Debug, Serialize, Clone)]
pub struct ProcEntry {
    pub pid: u32,
    pub name: String,
    pub exe: String,
    pub path: Option<String>,
    pub user_owned: bool,
}

#[tauri::command]
pub async fn get_exe_icons_b64(
    paths: Vec<String>,
) -> std::collections::HashMap<String, String> {
    if paths.is_empty() {
        return std::collections::HashMap::new();
    }
    tokio::task::spawn_blocking(move || {
        #[cfg(target_os = "windows")]
        { windows::extract_icons_b64(&paths) }
        #[cfg(not(target_os = "windows"))]
        {
            let _ = paths;
            std::collections::HashMap::<String, String>::new()
        }
    })
    .await
    .unwrap_or_default()
}

#[tauri::command]
pub async fn list_installed_apps() -> Vec<AppEntry> {
    tokio::task::spawn_blocking(|| {
        #[cfg(target_os = "linux")]
        { linux::scan_installed() }
        #[cfg(target_os = "windows")]
        { windows::scan_installed() }
        #[cfg(target_os = "macos")]
        { macos::scan_installed() }
        #[cfg(not(any(target_os = "linux", target_os = "windows", target_os = "macos")))]
        { Vec::<AppEntry>::new() }
    })
    .await
    .unwrap_or_default()
}

#[tauri::command]
pub async fn scan_folder_exes(path: String) -> Vec<AppEntry> {
    tokio::task::spawn_blocking(move || scan_folder_impl(Path::new(&path), 0, 6))
        .await
        .unwrap_or_default()
}

fn scan_folder_impl(dir: &Path, depth: usize, max_depth: usize) -> Vec<AppEntry> {
    let mut out = Vec::new();
    if depth > max_depth {
        return out;
    }
    let iter = match std::fs::read_dir(dir) {
        Ok(i) => i,
        Err(_) => return out,
    };
    for entry in iter.flatten() {
        let meta = match entry.metadata() {
            Ok(m) => m,
            Err(_) => continue,
        };
        if meta.file_type().is_symlink() {
            continue;
        }
        if meta.is_dir() {
            out.extend(scan_folder_impl(&entry.path(), depth + 1, max_depth));
            continue;
        }
        if meta.is_file() {
            let path = entry.path();
            let name = entry.file_name().to_string_lossy().to_string();
            let is_exe = {
                #[cfg(target_os = "windows")]
                { name.to_lowercase().ends_with(".exe") }
                #[cfg(not(target_os = "windows"))]
                {
                    #[cfg(unix)]
                    {
                        use std::os::unix::fs::PermissionsExt;
                        meta.permissions().mode() & 0o111 != 0
                            && !name.starts_with('.')
                    }
                    #[cfg(not(unix))]
                    { false }
                }
            };
            if !is_exe {
                continue;
            }
            let exe_lower = name.to_lowercase();
            let key = exe_lower.trim_end_matches(".exe").to_string();
            let display = if cfg!(target_os = "windows") {
                name.trim_end_matches(".exe")
                    .trim_end_matches(".EXE")
                    .to_string()
            } else {
                name.clone()
            };
            out.push(AppEntry {
                name: display,
                exe: exe_lower,
                path: Some(path.to_string_lossy().to_string()),
                key,
            });
        }
    }
    out
}

#[tauri::command]
pub async fn list_running_processes() -> Vec<ProcEntry> {
    tokio::task::spawn_blocking(|| {
        #[cfg(target_os = "linux")]
        { linux::scan_processes() }
        #[cfg(target_os = "windows")]
        { windows::scan_processes() }
        #[cfg(target_os = "macos")]
        { macos::scan_processes() }
        #[cfg(not(any(target_os = "linux", target_os = "windows", target_os = "macos")))]
        { Vec::<ProcEntry>::new() }
    })
    .await
    .unwrap_or_default()
}

fn exe_key(s: &str) -> String {
    let base = Path::new(s).file_name().map(|f| f.to_string_lossy().to_string()).unwrap_or_else(|| s.to_string());
    let base = base.to_lowercase();
    if let Some(stripped) = base.strip_suffix(".exe") { stripped.to_string() } else { base }
}

#[cfg(target_os = "linux")]
mod linux {
    use super::*;
    use std::fs;

    pub fn scan_installed() -> Vec<AppEntry> {
        let mut roots: Vec<PathBuf> = vec![
            PathBuf::from("/usr/share/applications"),
            PathBuf::from("/usr/local/share/applications"),
            PathBuf::from("/var/lib/flatpak/exports/share/applications"),
            PathBuf::from("/var/lib/snapd/desktop/applications"),
        ];
        if let Ok(home) = std::env::var("HOME") {
            roots.push(PathBuf::from(format!("{home}/.local/share/applications")));
            roots.push(PathBuf::from(format!("{home}/.local/share/flatpak/exports/share/applications")));
        }

        let mut out: Vec<AppEntry> = Vec::new();
        let mut seen: HashSet<String> = HashSet::new();

        for root in roots {
            let entries = match fs::read_dir(&root) {
                Ok(e) => e,
                Err(_) => continue,
            };
            for ent in entries.flatten() {
                let p = ent.path();
                if p.extension().and_then(|s| s.to_str()) != Some("desktop") { continue; }
                let body = match fs::read_to_string(&p) {
                    Ok(b) => b,
                    Err(_) => continue,
                };
                let parsed = match parse_desktop(&body) {
                    Some(d) => d,
                    None => continue,
                };
                let key = exe_key(&parsed.exe_basename);
                if key.is_empty() { continue; }
                if seen.insert(key.clone()) {
                    out.push(AppEntry {
                        name: parsed.name,
                        exe: parsed.exe_basename,
                        path: parsed.exec_path,
                        key,
                    });
                }
            }
        }

        out.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
        out
    }

    pub fn scan_processes() -> Vec<ProcEntry> {
        let mut out: Vec<ProcEntry> = Vec::new();
        let mut seen_keys: HashSet<String> = HashSet::new();

        let my_uid = unsafe { libc::geteuid() };

        let entries = match fs::read_dir("/proc") {
            Ok(e) => e,
            Err(_) => return out,
        };
        for ent in entries.flatten() {
            let pid: u32 = match ent.file_name().to_str().and_then(|s| s.parse().ok()) {
                Some(p) => p,
                None => continue,
            };
            let comm = match fs::read_to_string(format!("/proc/{pid}/comm")) {
                Ok(s) => s.trim().to_string(),
                Err(_) => continue,
            };
            if comm.is_empty() { continue; }

            let exe_path = fs::read_link(format!("/proc/{pid}/exe")).ok();
            let exe_str = exe_path.as_ref().and_then(|p| p.file_name()).map(|f| f.to_string_lossy().to_string());

            let exe = exe_str.unwrap_or_else(|| comm.clone());
            let key = exe_key(&exe);
            if key.is_empty() { continue; }
            if KERNEL_NAMES.contains(&key.as_str()) { continue; }

            if !seen_keys.insert(key.clone()) { continue; }

            let user_owned = fs::read_to_string(format!("/proc/{pid}/status"))
                .ok()
                .and_then(|status| {
                    status.lines().find_map(|l| {
                        let l = l.trim();
                        if let Some(rest) = l.strip_prefix("Uid:") {
                            rest.split_whitespace().next().and_then(|s| s.parse::<u32>().ok())
                        } else {
                            None
                        }
                    })
                })
                .map(|uid| uid == my_uid)
                .unwrap_or(false);

            out.push(ProcEntry {
                pid,
                name: comm,
                exe,
                path: exe_path.map(|p| p.to_string_lossy().to_string()),
                user_owned,
            });
        }

        out.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
        out
    }

    const KERNEL_NAMES: &[&str] = &[
        "systemd", "init", "kthreadd", "rcu_sched", "rcu_bh", "rcu_par_gp",
        "ksoftirqd", "migration", "kworker", "watchdog", "khungtaskd",
        "oom_reaper", "writeback", "kcompactd0", "ksmd", "khugepaged",
    ];

    struct Parsed {
        name: String,
        exe_basename: String,
        exec_path: Option<String>,
    }

    fn parse_desktop(body: &str) -> Option<Parsed> {
        let mut in_main = false;
        let mut name: Option<String> = None;
        let mut exec: Option<String> = None;
        let mut no_display = false;
        let mut hidden = false;
        let mut typ: Option<String> = None;
        let mut terminal = false;

        for line in body.lines() {
            let line = line.trim();
            if line.starts_with('[') {
                in_main = line == "[Desktop Entry]";
                continue;
            }
            if !in_main || line.is_empty() || line.starts_with('#') { continue; }

            if let Some((k, v)) = line.split_once('=') {
                let k = k.trim();
                let v = v.trim();
                match k {
                    "Name" => { if name.is_none() { name = Some(v.to_string()); } },
                    "Exec" => { if exec.is_none() { exec = Some(v.to_string()); } },
                    "NoDisplay" => no_display = v.eq_ignore_ascii_case("true"),
                    "Hidden" => hidden = v.eq_ignore_ascii_case("true"),
                    "Type" => typ = Some(v.to_string()),
                    "Terminal" => terminal = v.eq_ignore_ascii_case("true"),
                    _ => {}
                }
            }
        }

        if no_display || hidden { return None; }
        if !matches!(typ.as_deref(), Some("Application") | None) { return None; }
        if terminal { return None; }

        let name = name?;
        let exec = exec?;

        let argv0 = exec
            .split_whitespace()
            .find(|tok| !tok.starts_with('%'))
            .unwrap_or("")
            .trim_matches('"');
        if argv0.is_empty() { return None; }

        let exe_basename = Path::new(argv0)
            .file_name()
            .map(|f| f.to_string_lossy().to_string())
            .unwrap_or_else(|| argv0.to_string());

        let exec_path = if argv0.starts_with('/') { Some(argv0.to_string()) } else { None };

        Some(Parsed { name, exe_basename, exec_path })
    }
}

#[cfg(target_os = "windows")]
mod windows {
    use super::*;
    use std::fs;
    use winreg::enums::*;
    use winreg::RegKey;

    pub fn scan_installed() -> Vec<AppEntry> {
        let mut out: Vec<AppEntry> = Vec::new();
        let mut seen: HashSet<String> = HashSet::new();

        let hklm = RegKey::predef(HKEY_LOCAL_MACHINE);
        let hkcu = RegKey::predef(HKEY_CURRENT_USER);
        let roots: [&RegKey; 2] = [&hklm, &hkcu];
        let paths_per_hive: [&[&str]; 2] = [
            &[
                r"Software\Microsoft\Windows\CurrentVersion\Uninstall",
                r"Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall",
            ],
            &[r"Software\Microsoft\Windows\CurrentVersion\Uninstall"],
        ];
        let mut iter_keys: Vec<RegKey> = Vec::new();
        for (i, root) in roots.iter().enumerate() {
            for path in paths_per_hive[i] {
                if let Ok(k) = root.open_subkey(path) { iter_keys.push(k); }
            }
        }

        for key in &iter_keys {
            for sub_name in key.enum_keys().filter_map(Result::ok) {
                let sub = match key.open_subkey(&sub_name) {
                    Ok(k) => k,
                    Err(_) => continue,
                };

                let display: String = sub.get_value("DisplayName").unwrap_or_default();
                if display.is_empty() { continue; }
                let release_type: String = sub.get_value("ReleaseType").unwrap_or_default();
                if release_type.eq_ignore_ascii_case("Update")
                    || release_type.eq_ignore_ascii_case("Hotfix")
                    || release_type.eq_ignore_ascii_case("Security Update")
                { continue; }
                let system_component: u32 = sub.get_value("SystemComponent").unwrap_or(0);
                if system_component == 1 { continue; }
                let is_minor: u32 = sub.get_value("WindowsInstaller").unwrap_or(0);
                let parent: String = sub.get_value("ParentDisplayName").unwrap_or_default();
                if !parent.is_empty() && is_minor == 1 { continue; }

                let display_icon: String = sub.get_value("DisplayIcon").unwrap_or_default();
                let install_loc: String = sub.get_value("InstallLocation").unwrap_or_default();

                let exe_path: Option<String> = if !display_icon.is_empty() {
                    let trimmed = display_icon.trim_matches('"');
                    let trimmed = trimmed.split(',').next().unwrap_or(trimmed);
                    if trimmed.to_lowercase().ends_with(".exe") {
                        Some(trimmed.to_string())
                    } else { None }
                } else if !install_loc.is_empty() {
                    find_main_exe(&install_loc)
                } else { None };

                let exe_basename = exe_path
                    .as_ref()
                    .and_then(|p| Path::new(p).file_name())
                    .map(|f| f.to_string_lossy().to_string())
                    .unwrap_or_else(|| {
                        let cleaned: String = display.chars().filter(|c| c.is_ascii_alphanumeric()).collect();
                        if cleaned.is_empty() { return display.clone(); }
                        format!("{cleaned}.exe")
                    });

                let key = exe_key(&exe_basename);
                if key.is_empty() { continue; }
                if !seen.insert(key.clone()) { continue; }

                out.push(AppEntry {
                    name: display,
                    exe: exe_basename,
                    path: exe_path,
                    key,
                });
            }
        }

        out.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
        out
    }

    fn find_main_exe(dir: &str) -> Option<String> {
        let dir = Path::new(dir.trim_matches('"'));
        let entries = fs::read_dir(dir).ok()?;
        let mut best: Option<(u64, PathBuf)> = None;
        for ent in entries.flatten() {
            let p = ent.path();
            let name = p.file_name()?.to_string_lossy().to_lowercase();
            if !name.ends_with(".exe") { continue; }
            if name.contains("uninstall") || name.contains("crashpad")
                || name.contains("update") || name.contains("setup")
                || name.contains("helper")
            { continue; }
            let len = ent.metadata().ok().map(|m| m.len()).unwrap_or(0);
            match &best {
                Some((b, _)) if *b >= len => {},
                _ => best = Some((len, p)),
            }
        }
        best.map(|(_, p)| p.to_string_lossy().to_string())
    }

    pub fn scan_processes() -> Vec<ProcEntry> {
        use std::os::windows::process::CommandExt;
        use std::process::Command;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        let script = r#"
            $ErrorActionPreference = 'SilentlyContinue'
            $mySession = (Get-Process -Id $PID).SessionId
            $userProfile = $env:USERPROFILE
            $sysRoot = $env:SystemRoot
            if (-not $sysRoot) { $sysRoot = 'C:\Windows' }
            $sys32 = Join-Path $sysRoot 'System32'
            $sysWow = Join-Path $sysRoot 'SysWOW64'
            Get-Process | Where-Object { $_.Path } | ForEach-Object {
                $p = $_.Path
                $owned = $false
                if ($userProfile -and $p.StartsWith($userProfile, [System.StringComparison]::OrdinalIgnoreCase)) {
                    $owned = $true
                } elseif ($_.SessionId -ne 0 -and $_.SessionId -eq $mySession) {
                    $isSys = $p.StartsWith($sys32, [System.StringComparison]::OrdinalIgnoreCase) -or `
                             $p.StartsWith($sysWow, [System.StringComparison]::OrdinalIgnoreCase)
                    if (-not $isSys) { $owned = $true }
                }
                [pscustomobject]@{
                    Id          = $_.Id
                    ProcessName = $_.ProcessName
                    Path        = $p
                    SessionId   = $_.SessionId
                    UserOwned   = if ($owned) { 1 } else { 0 }
                }
            } | Select-Object Id, ProcessName, Path, SessionId, UserOwned | ConvertTo-Csv -NoTypeInformation
        "#;
        let output = Command::new("powershell.exe")
            .args([
                "-NoProfile", "-NonInteractive", "-Command", script,
            ])
            .creation_flags(CREATE_NO_WINDOW)
            .output();
        let stdout = match output {
            Ok(o) if o.status.success() => String::from_utf8_lossy(&o.stdout).to_string(),
            _ => return Vec::new(),
        };

        let mut out: Vec<ProcEntry> = Vec::new();
        let mut seen_keys: HashSet<String> = HashSet::new();
        for (i, line) in stdout.lines().enumerate() {
            if i == 0 { continue; }
            let cols = parse_csv_row(line);
            if cols.len() < 3 { continue; }
            let pid: u32 = cols[0].parse().unwrap_or(0);
            let name = cols[1].clone();
            let path = if cols[2].is_empty() { None } else { Some(cols[2].clone()) };
            let session_id: u32 = cols.get(3).and_then(|s| s.parse().ok()).unwrap_or(0);
            let user_owned_flag: bool = cols.get(4).map(|s| s == "1").unwrap_or(session_id != 0);
            let exe = path.as_ref()
                .and_then(|p| Path::new(p).file_name())
                .map(|f| f.to_string_lossy().to_string())
                .unwrap_or_else(|| format!("{name}.exe"));
            let key = exe_key(&exe);
            if key.is_empty() { continue; }
            if !seen_keys.insert(key.clone()) { continue; }

            out.push(ProcEntry { pid, name, exe, path, user_owned: user_owned_flag });
        }
        out.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
        out
    }

    fn parse_csv_row(line: &str) -> Vec<String> {
        let mut out = Vec::new();
        let mut cur = String::new();
        let mut in_q = false;
        let mut chars = line.chars().peekable();
        while let Some(c) = chars.next() {
            match c {
                '"' if in_q && chars.peek() == Some(&'"') => { cur.push('"'); chars.next(); },
                '"' => in_q = !in_q,
                ',' if !in_q => { out.push(std::mem::take(&mut cur)); },
                _ => cur.push(c),
            }
        }
        out.push(cur);
        out
    }

    pub fn extract_icons_b64(paths: &[String]) -> std::collections::HashMap<String, String> {
        use std::os::windows::process::CommandExt;
        use std::process::Command;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        if paths.is_empty() {
            return std::collections::HashMap::new();
        }
        let payload = match serde_json::to_string(paths) {
            Ok(s) => s,
            Err(_) => return std::collections::HashMap::new(),
        };
        let temp = std::env::temp_dir().join(format!(
            "mint-icons-{}.json",
            std::process::id()
        ));
        if std::fs::write(&temp, payload.as_bytes()).is_err() {
            return std::collections::HashMap::new();
        }
        let temp_str = temp.to_string_lossy().replace('\'', "''");
        let script = format!(
            r#"
            $ErrorActionPreference = 'SilentlyContinue'
            Add-Type -AssemblyName System.Drawing
            $paths = Get-Content -LiteralPath '{path}' -Raw | ConvertFrom-Json
            $result = @{{}}
            foreach ($p in $paths) {{
                try {{
                    if (-not (Test-Path -LiteralPath $p)) {{ continue }}
                    $icon = [System.Drawing.Icon]::ExtractAssociatedIcon($p)
                    if ($null -eq $icon) {{ continue }}
                    $bmp = $icon.ToBitmap()
                    $ms = New-Object System.IO.MemoryStream
                    $bmp.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)
                    $bytes = $ms.ToArray()
                    $result[$p] = [Convert]::ToBase64String($bytes)
                    $bmp.Dispose()
                    $icon.Dispose()
                    $ms.Dispose()
                }} catch {{ continue }}
            }}
            $result | ConvertTo-Json -Compress -Depth 3
            "#,
            path = temp_str,
        );
        let output = Command::new("powershell.exe")
            .args([
                "-NoProfile",
                "-NonInteractive",
                "-Command",
                &script,
            ])
            .creation_flags(CREATE_NO_WINDOW)
            .output();
        let _ = std::fs::remove_file(&temp);
        let stdout = match output {
            Ok(o) if o.status.success() => {
                String::from_utf8_lossy(&o.stdout).to_string()
            }
            _ => return std::collections::HashMap::new(),
        };
        let trimmed = stdout.trim();
        if trimmed.is_empty() || trimmed == "null" {
            return std::collections::HashMap::new();
        }
        serde_json::from_str::<std::collections::HashMap<String, String>>(trimmed)
            .unwrap_or_default()
    }
}

#[cfg(target_os = "macos")]
mod macos {
    use super::*;
    use std::fs;

    pub fn scan_installed() -> Vec<AppEntry> {
        let mut out: Vec<AppEntry> = Vec::new();
        let mut seen: HashSet<String> = HashSet::new();
        let mut roots: Vec<PathBuf> = vec![
            PathBuf::from("/Applications"),
            PathBuf::from("/System/Applications"),
        ];
        if let Ok(home) = std::env::var("HOME") {
            roots.push(PathBuf::from(format!("{home}/Applications")));
        }
        for root in roots {
            let entries = match fs::read_dir(&root) {
                Ok(e) => e,
                Err(_) => continue,
            };
            for ent in entries.flatten() {
                let p = ent.path();
                let fname = match p.file_name().and_then(|f| f.to_str()) {
                    Some(s) => s,
                    None => continue,
                };
                if !fname.ends_with(".app") { continue; }
                let name = fname.trim_end_matches(".app").to_string();
                let key = exe_key(&name);
                if key.is_empty() || !seen.insert(key.clone()) { continue; }
                out.push(AppEntry {
                    name: name.clone(),
                    exe: name,
                    path: Some(p.to_string_lossy().to_string()),
                    key,
                });
            }
        }
        out.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
        out
    }

    pub fn scan_processes() -> Vec<ProcEntry> {
        use std::process::Command;
        let output = Command::new("ps").args(["-A", "-o", "pid=,user=,comm="]).output();
        let stdout = match output {
            Ok(o) if o.status.success() => String::from_utf8_lossy(&o.stdout).to_string(),
            _ => return Vec::new(),
        };
        let me = std::env::var("USER").unwrap_or_default();
        let mut out: Vec<ProcEntry> = Vec::new();
        let mut seen_keys: HashSet<String> = HashSet::new();
        for line in stdout.lines() {
            let line = line.trim_start();
            let mut parts = line.splitn(3, char::is_whitespace);
            let pid_s = match parts.next() { Some(s) => s, None => continue };
            let user = match parts.next() { Some(s) => s, None => continue };
            let path = match parts.next() { Some(s) => s.trim_start(), None => continue };
            let pid: u32 = match pid_s.parse() { Ok(p) => p, Err(_) => continue };
            let exe = Path::new(path).file_name()
                .map(|f| f.to_string_lossy().to_string())
                .unwrap_or_else(|| path.to_string());
            let key = exe_key(&exe);
            if key.is_empty() || !seen_keys.insert(key.clone()) { continue; }
            let user_owned = !me.is_empty() && user == me;
            out.push(ProcEntry {
                pid,
                name: exe.clone(),
                exe,
                path: Some(path.to_string()),
                user_owned,
            });
        }
        out.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
        out
    }
}
