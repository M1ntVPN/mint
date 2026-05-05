// Mint-side autostart wrapper. We can't rely on `tauri-plugin-autostart`
// alone on Windows: the underlying `auto-launch` 0.5 crate writes the
// HKCU\...\Run value as `format!("{} {}", path, args)` — i.e. without
// quoting the executable path. With `installMode: perMachine` Mint
// installs to `C:\Program Files\Mint VPN\Mint.exe`, and the unquoted
// value combined with the trailing space (when args are empty) makes
// some setups silently skip the entry on login. Even when Windows'
// progressive parsing does land on the right token, the entry is
// fragile and a number of corp AVs flag unquoted Run keys.
//
// To keep behaviour predictable across machines we manage the registry
// entry ourselves on Windows, using a properly-quoted command line
// (`"C:\Path\To\Mint.exe" --autostart`). The `--autostart` token also
// doubles as a flag the binary inspects on launch to decide whether to
// start hidden in the tray.
//
// Linux and macOS continue to use `tauri-plugin-autostart` directly via
// `app.autolaunch()` — its `.desktop` / LaunchAgent paths don't have the
// quoting issue.

#[cfg(windows)]
use serde::Serialize;

#[cfg(windows)]
const RUN_SUBKEY: &str = "Software\\Microsoft\\Windows\\CurrentVersion\\Run";
#[cfg(windows)]
const STARTUP_APPROVED_SUBKEY: &str =
    "Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\StartupApproved\\Run";
// We pick a stable name that's easy to recognise in Task Manager →
// Startup. The previous `tauri-plugin-autostart` integration used the
// app's package name ("Mint VPN") so we keep that to avoid leaving an
// orphan key behind across upgrades.
#[cfg(windows)]
const APP_NAME: &str = "Mint VPN";

/// CLI flag we append to the autostart entry's command line. When the
/// app is launched from Windows' Run key (or via the equivalent on
/// Linux / macOS), we use this to decide whether to start hidden in
/// the tray instead of popping the main window in the user's face.
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
fn quoted_command_line(exe_path: &str) -> String {
    format!("\"{}\" {}", exe_path, AUTOSTART_ARG)
}

#[cfg(windows)]
pub fn enable() -> Result<(), AutostartError> {
    use winreg::enums::{HKEY_CURRENT_USER, KEY_SET_VALUE};
    use winreg::RegKey;

    let exe = std::env::current_exe()?;
    let exe_str = exe.to_string_lossy().to_string();
    let value = quoted_command_line(&exe_str);

    let hkcu = RegKey::predef(HKEY_CURRENT_USER);
    let (run_key, _) = hkcu.create_subkey(RUN_SUBKEY)?;
    run_key.set_value(APP_NAME, &value)?;

    // Task Manager → Startup overrides the Run key with its own
    // enabled/disabled state. If the user (or another tool) ever
    // disabled Mint there, the StartupApproved\Run entry will mask
    // our Run entry on next boot. Resetting it back to "enabled"
    // (header byte 0x02 + zero timestamp) puts us back in control.
    if let Ok(approved) =
        hkcu.open_subkey_with_flags(STARTUP_APPROVED_SUBKEY, KEY_SET_VALUE)
    {
        const ENABLED_BYTES: [u8; 12] = [
            0x02, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
        ];
        let _ = approved.set_raw_value(
            APP_NAME,
            &winreg::RegValue {
                vtype: winreg::enums::RegType::REG_BINARY,
                bytes: ENABLED_BYTES.to_vec(),
            },
        );
    }
    Ok(())
}

#[cfg(windows)]
pub fn disable() -> Result<(), AutostartError> {
    use winreg::enums::{HKEY_CURRENT_USER, KEY_SET_VALUE};
    use winreg::RegKey;

    let hkcu = RegKey::predef(HKEY_CURRENT_USER);
    if let Ok(run_key) = hkcu.open_subkey_with_flags(RUN_SUBKEY, KEY_SET_VALUE) {
        let _ = run_key.delete_value(APP_NAME);
    }
    Ok(())
}

#[cfg(windows)]
pub fn is_enabled() -> bool {
    use winreg::enums::HKEY_CURRENT_USER;
    use winreg::RegKey;

    let hkcu = RegKey::predef(HKEY_CURRENT_USER);
    let registered = hkcu
        .open_subkey(RUN_SUBKEY)
        .and_then(|k| k.get_value::<String, _>(APP_NAME))
        .is_ok();
    if !registered {
        return false;
    }
    // Honour Task Manager's Startup tab toggle. If the user disabled
    // Mint there, the Run entry is still present but Windows will
    // skip it at login — surface that as "disabled" so the toggle in
    // Settings reflects reality.
    if let Ok(approved) = hkcu.open_subkey(STARTUP_APPROVED_SUBKEY) {
        if let Ok(raw) = approved.get_raw_value(APP_NAME) {
            // First byte 0x03 = disabled by Task Manager; anything
            // else (typically 0x02) = enabled.
            if raw.bytes.first().copied() == Some(0x03) {
                return false;
            }
        }
    }
    true
}

#[cfg(windows)]
pub fn refresh_if_enabled() {
    if is_enabled() {
        let _ = enable();
    }
}

// Non-Windows fallbacks defer to tauri-plugin-autostart, which handles
// `.desktop` autostart on Linux and LaunchAgent / AppleScript on macOS
// without the path-quoting pitfalls Windows has — nothing to refresh
// on those platforms.
