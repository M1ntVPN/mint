// Mint-side autostart wrapper.
//
// Why we don't use HKCU\...\Run on Windows
// ----------------------------------------
// Mint ships with `requestedExecutionLevel = requireAdministrator` in
// its app manifest because creating the wintun TUN adapter (the
// sing-box backing inbound) needs admin. That means *every* launch of
// `Mint.exe` triggers UAC.
//
// Windows' Run key (HKCU\Software\Microsoft\Windows\CurrentVersion\Run)
// is read at logon and the entries are launched non-interactively
// under the user's standard medium-IL token. When the entry points at
// a `requireAdministrator` binary, Windows can't show a UAC consent
// dialog at logon (no interactive desktop yet) and just silently drops
// the launch. From the user's point of view "autostart is broken" —
// the toggle is on, the registry value is correct, the app simply
// never appears.
//
// The well-known fix for elevated apps is to use Task Scheduler
// instead. A task with `LogonTrigger` + `RunLevel=HighestAvailable`
// can launch an admin-required binary at user logon without a UAC
// prompt because the task service is already running as SYSTEM and
// hands the user their elevated token directly.
//
// We drive `schtasks.exe` rather than COM so we don't add a
// `windows`-crate dependency just for this. The XML we feed it makes
// the task per-user (UserId locked to whoever installed it), low
// overhead, and resilient to the user moving the binary (we
// re-register it on every launch via `refresh_if_enabled` so the
// `<Command>` element always points at the current exe).
//
// On non-Windows we keep using `tauri-plugin-autostart` directly via
// `app.autolaunch()` — its `.desktop` / LaunchAgent paths don't have
// the elevation problem (Linux/macOS don't auto-elevate at all).

#[cfg(windows)]
use serde::Serialize;

#[cfg(windows)]
const TASK_NAME: &str = "Mint VPN Autostart";
// Stable subkey + value name for the *legacy* Run-key entry written by
// Mint <= 0.3.29 (and by earlier `tauri-plugin-autostart` integrations
// before that). We never write here anymore; the legacy entry is just
// removed on enable/disable so an upgrade cleans up after itself.
#[cfg(windows)]
const LEGACY_RUN_SUBKEY: &str =
    "Software\\Microsoft\\Windows\\CurrentVersion\\Run";
#[cfg(windows)]
const LEGACY_RUN_VALUE: &str = "Mint VPN";
#[cfg(windows)]
const LEGACY_STARTUP_APPROVED_SUBKEY: &str =
    "Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\StartupApproved\\Run";

/// CLI flag we append to the autostart entry's command line. When the
/// app is launched from Task Scheduler / the .desktop autostart /
/// LaunchAgent, we use this to decide whether to start hidden in the
/// tray instead of popping the main window in the user's face.
pub const AUTOSTART_ARG: &str = "--autostart";

#[cfg(windows)]
#[derive(Debug, Serialize)]
pub struct AutostartError(pub String);

#[cfg(windows)]
impl<E: std::fmt::Display> From<E> for AutostartError {
    fn from(err: E) -> Self {
        AutostartError(err.to_string())
    }
}

#[cfg(windows)]
fn current_user_sid() -> Option<String> {
    // `whoami /user /fo csv /nh` prints `"DOMAIN\\user","S-1-5-…"`
    // for the *real* (pre-elevation) interactive user. We prefer the
    // SID because:
    //   1. It survives display-name changes and is locale-agnostic
    //      — non-ASCII USERNAMEs (Cyrillic, CJK) round-trip fine.
    //   2. Microsoft accounts populate USERNAME with a 5-char prefix
    //      of the email instead of the actual logon name, which made
    //      `<UserId>DOMAIN\\user</UserId>` resolve to the wrong
    //      principal on first logon — the task got created but the
    //      LogonTrigger never matched the user's real SID.
    use std::os::windows::process::CommandExt;
    use std::process::Command;
    const CREATE_NO_WINDOW: u32 = 0x0800_0000;
    let out = Command::new("whoami.exe")
        .args(["/user", "/fo", "csv", "/nh"])
        .creation_flags(CREATE_NO_WINDOW)
        .output()
        .ok()?;
    if !out.status.success() {
        return None;
    }
    let stdout = String::from_utf8_lossy(&out.stdout);
    let line = stdout.lines().next()?.trim();
    // CSV row looks like: "domain\user","S-1-5-21-…"
    let mut fields = line.split(',').map(|f| f.trim().trim_matches('"').to_string());
    let _account = fields.next()?;
    let sid = fields.next()?;
    if sid.starts_with("S-") {
        Some(sid)
    } else {
        None
    }
}

#[cfg(windows)]
fn current_user_account() -> String {
    // `<UserId>` accepts either a SID or a `DOMAIN\user` (or
    // `MACHINE\user` for local accounts) value. The env-var pair
    // populated by Windows for every interactive logon is the
    // simplest portable source — `USERDOMAIN` is the local computer
    // name for local accounts and the AD domain for domain joins.
    let domain = std::env::var("USERDOMAIN")
        .or_else(|_| std::env::var("COMPUTERNAME"))
        .unwrap_or_default();
    let user = std::env::var("USERNAME").unwrap_or_default();
    if domain.is_empty() {
        user
    } else {
        format!("{domain}\\{user}")
    }
}

#[cfg(windows)]
fn current_user_id() -> String {
    // Prefer the SID (locale-independent, immune to Microsoft-account
    // name quirks). Fall back to the legacy DOMAIN\user form only if
    // `whoami /user` failed for some reason — that path still works
    // on the vast majority of installs but has the known issues
    // documented in `current_user_sid`.
    current_user_sid().unwrap_or_else(current_user_account)
}

#[cfg(windows)]
fn xml_escape(s: &str) -> String {
    s.replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
        .replace('\'', "&apos;")
}

#[cfg(windows)]
fn task_xml(exe_path: &str, user_id: &str) -> String {
    let exe = xml_escape(exe_path);
    let user = xml_escape(user_id);
    format!(
        "<?xml version=\"1.0\" encoding=\"UTF-16\"?>\n\
<Task version=\"1.2\" xmlns=\"http://schemas.microsoft.com/windows/2004/02/mit/task\">\n\
  <RegistrationInfo>\n\
    <Description>Mint VPN autostart at user logon</Description>\n\
    <Author>{user}</Author>\n\
  </RegistrationInfo>\n\
  <Triggers>\n\
    <LogonTrigger>\n\
      <Enabled>true</Enabled>\n\
      <UserId>{user}</UserId>\n\
      <Delay>PT8S</Delay>\n\
    </LogonTrigger>\n\
  </Triggers>\n\
  <Principals>\n\
    <Principal id=\"Author\">\n\
      <UserId>{user}</UserId>\n\
      <LogonType>InteractiveToken</LogonType>\n\
      <RunLevel>HighestAvailable</RunLevel>\n\
    </Principal>\n\
  </Principals>\n\
  <Settings>\n\
    <MultipleInstancesPolicy>IgnoreNew</MultipleInstancesPolicy>\n\
    <DisallowStartIfOnBatteries>false</DisallowStartIfOnBatteries>\n\
    <StopIfGoingOnBatteries>false</StopIfGoingOnBatteries>\n\
    <AllowHardTerminate>true</AllowHardTerminate>\n\
    <StartWhenAvailable>false</StartWhenAvailable>\n\
    <RunOnlyIfNetworkAvailable>false</RunOnlyIfNetworkAvailable>\n\
    <IdleSettings>\n\
      <StopOnIdleEnd>false</StopOnIdleEnd>\n\
      <RestartOnIdle>false</RestartOnIdle>\n\
    </IdleSettings>\n\
    <AllowStartOnDemand>true</AllowStartOnDemand>\n\
    <Enabled>true</Enabled>\n\
    <Hidden>false</Hidden>\n\
    <RunOnlyIfIdle>false</RunOnlyIfIdle>\n\
    <WakeToRun>false</WakeToRun>\n\
    <ExecutionTimeLimit>PT0S</ExecutionTimeLimit>\n\
    <Priority>7</Priority>\n\
  </Settings>\n\
  <Actions Context=\"Author\">\n\
    <Exec>\n\
      <Command>{exe}</Command>\n\
      <Arguments>{arg}</Arguments>\n\
    </Exec>\n\
  </Actions>\n\
</Task>\n",
        exe = exe,
        user = user,
        arg = xml_escape(AUTOSTART_ARG),
    )
}

#[cfg(windows)]
fn write_task_xml_to_temp(xml: &str) -> std::io::Result<std::path::PathBuf> {
    use std::io::Write;
    // schtasks expects the XML file to be UTF-16 LE with BOM. UTF-8
    // works on most Windows builds but UTF-16 is the documented
    // canonical encoding (Task Scheduler's own export uses it) and
    // sidesteps a couple of locale-specific schtasks bugs that have
    // surfaced over the years.
    let mut bytes: Vec<u8> = vec![0xFF, 0xFE];
    for unit in xml.encode_utf16() {
        bytes.extend_from_slice(&unit.to_le_bytes());
    }
    let mut path = std::env::temp_dir();
    path.push(format!(
        "mint-autostart-{}.xml",
        std::process::id()
    ));
    let mut f = std::fs::File::create(&path)?;
    f.write_all(&bytes)?;
    f.sync_all()?;
    Ok(path)
}

#[cfg(windows)]
fn run_schtasks(args: &[&str]) -> Result<std::process::Output, AutostartError> {
    use std::os::windows::process::CommandExt;
    use std::process::Command;
    const CREATE_NO_WINDOW: u32 = 0x0800_0000;
    Command::new("schtasks.exe")
        .args(args)
        .creation_flags(CREATE_NO_WINDOW)
        .output()
        .map_err(|e| AutostartError(format!("schtasks spawn: {e}")))
}

#[cfg(windows)]
fn cleanup_legacy_run_key() {
    use winreg::enums::{HKEY_CURRENT_USER, KEY_SET_VALUE};
    use winreg::RegKey;

    let hkcu = RegKey::predef(HKEY_CURRENT_USER);
    if let Ok(run_key) = hkcu.open_subkey_with_flags(LEGACY_RUN_SUBKEY, KEY_SET_VALUE) {
        let _ = run_key.delete_value(LEGACY_RUN_VALUE);
    }
    if let Ok(approved) =
        hkcu.open_subkey_with_flags(LEGACY_STARTUP_APPROVED_SUBKEY, KEY_SET_VALUE)
    {
        let _ = approved.delete_value(LEGACY_RUN_VALUE);
    }
}

#[cfg(windows)]
pub fn enable() -> Result<(), AutostartError> {
    let exe = std::env::current_exe()?;
    let exe_str = exe.to_string_lossy().to_string();
    let user_id = current_user_id();
    let xml = task_xml(&exe_str, &user_id);
    let path = write_task_xml_to_temp(&xml)
        .map_err(|e| AutostartError(format!("write xml: {e}")))?;
    let path_str = path.to_string_lossy().to_string();

    let output = run_schtasks(&[
        "/Create",
        "/TN",
        TASK_NAME,
        "/XML",
        &path_str,
        "/F",
    ])?;
    let _ = std::fs::remove_file(&path);

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).to_string();
        let stdout = String::from_utf8_lossy(&output.stdout).to_string();
        return Err(AutostartError(format!(
            "schtasks /Create failed (status {}): {} {}",
            output.status,
            stderr.trim(),
            stdout.trim()
        )));
    }

    // Now that the new Task Scheduler entry exists, scrub any
    // pre-existing Run-key value so we don't end up with two
    // competing autostart paths. (The Run-key one was already
    // silently dropped by Windows for elevated apps, but cleaning it
    // up keeps Task Manager → Startup tidy.)
    cleanup_legacy_run_key();
    Ok(())
}

#[cfg(windows)]
pub fn disable() -> Result<(), AutostartError> {
    let _ = run_schtasks(&["/Delete", "/TN", TASK_NAME, "/F"]);
    cleanup_legacy_run_key();
    Ok(())
}

#[cfg(windows)]
pub fn is_enabled() -> bool {
    match run_schtasks(&["/Query", "/TN", TASK_NAME]) {
        Ok(out) => out.status.success(),
        Err(_) => false,
    }
}

#[cfg(windows)]
pub fn refresh_if_enabled() {
    // Re-register the task on every launch so the <Command> element
    // always points at the *currently running* exe even if the
    // updater swapped it or NSIS reinstall moved it. Idempotent
    // (`/F` overwrites) and silent on failure.
    if is_enabled() {
        let _ = enable();
    } else {
        // No active task, but a stale legacy Run-key entry might
        // still be lingering on a freshly upgraded machine. Best-
        // effort cleanup so the user's "Запускать Mint при входе"
        // toggle reflects reality.
        cleanup_legacy_run_key();
    }
}

// Non-Windows fallbacks defer to tauri-plugin-autostart, which handles
// `.desktop` autostart on Linux and LaunchAgent / AppleScript on macOS
// without the elevation pitfall Windows has — nothing to refresh
// on those platforms.
