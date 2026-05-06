use serde::{Deserialize, Serialize};
use tauri::AppHandle;

#[cfg(desktop)]
use tauri::Manager;
#[cfg(desktop)]
use std::sync::atomic::{AtomicBool, Ordering};
#[cfg(desktop)]
use tauri::image::Image;
#[cfg(desktop)]
use tauri::menu::{Menu, MenuItem};
#[cfg(desktop)]
use tauri::tray::TrayIconBuilder;
#[cfg(desktop)]
use tauri::{Emitter, Listener, WindowEvent};

#[cfg(desktop)]
static CLOSE_TO_TRAY: AtomicBool = AtomicBool::new(true);

#[cfg(desktop)]
#[tauri::command]
fn set_close_to_tray(enabled: bool) {
    CLOSE_TO_TRAY.store(enabled, Ordering::SeqCst);
}

#[cfg(desktop)]
#[tauri::command]
async fn mint_set_autostart(
    app: AppHandle,
    enabled: bool,
) -> Result<(), String> {
    #[cfg(windows)]
    {
        let _ = app;
        if enabled {
            autostart::enable().map_err(|e| e.0)?;
        } else {
            autostart::disable().map_err(|e| e.0)?;
        }
        Ok(())
    }
    #[cfg(not(windows))]
    {
        use tauri_plugin_autostart::ManagerExt;
        let mgr = app.autolaunch();
        let res = if enabled { mgr.enable() } else { mgr.disable() };
        res.map_err(|e| e.to_string())
    }
}

#[cfg(desktop)]
#[tauri::command]
async fn mint_is_autostart_enabled(app: AppHandle) -> Result<bool, String> {
    #[cfg(windows)]
    {
        let _ = app;
        Ok(autostart::is_enabled())
    }
    #[cfg(not(windows))]
    {
        use tauri_plugin_autostart::ManagerExt;
        app.autolaunch().is_enabled().map_err(|e| e.to_string())
    }
}

/// Returns true when the binary was launched by the OS' login-items
/// machinery (Windows Run key, .desktop autostart, LaunchAgent). The
/// frontend uses this to skip popping the main window in the user's
/// face on every boot — instead we sit silently in the tray and let
/// auto-connect bring the tunnel up in the background.
#[cfg(desktop)]
#[tauri::command]
fn mint_launched_via_autostart() -> bool {
    std::env::args().any(|a| a == autostart::AUTOSTART_ARG)
}

#[tauri::command]
fn quit_app(app: AppHandle) {
    #[cfg(desktop)]
    perform_graceful_shutdown(&app);
    app.exit(0);
}

#[cfg(desktop)]
#[tauri::command]
fn prepare_for_update() {
    singbox::kill_all_blocking();
    sysproxy::sysproxy_clear_blocking();
    killswitch::disable_blocking();
}

#[cfg(desktop)]
fn perform_graceful_shutdown(app: &AppHandle) {
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.hide();
    }
    singbox::kill_all_blocking();
    sysproxy::sysproxy_clear_blocking();
    killswitch::disable_blocking();
}

#[cfg(desktop)]
mod autostart;
mod commands;
#[cfg(desktop)]
mod killswitch;
#[cfg(windows)]
mod platform;
#[cfg(desktop)]
mod singbox;
#[cfg(desktop)]
mod sysapps;
#[cfg(desktop)]
mod sysproxy;

#[cfg(desktop)]
const TRAY_CONNECTED: &[u8] = include_bytes!("../icons/tray/tray-connected.png");
#[cfg(desktop)]
const TRAY_CONNECTING: &[u8] = include_bytes!("../icons/tray/tray-connecting.png");
#[cfg(desktop)]
const TRAY_DISCONNECTED: &[u8] = include_bytes!("../icons/tray/tray-disconnected.png");

#[cfg(desktop)]
const WIN_ICON_SHIELD: &[u8] = include_bytes!("../icons/icon-shield-256.png");
#[cfg(desktop)]
const WIN_ICON_LEAF: &[u8] = include_bytes!("../icons/icon-leaf-256.png");

#[cfg(desktop)]
#[tauri::command]
fn set_window_icon(app: AppHandle, variant: String) -> Result<(), String> {
    let bytes: &[u8] = match variant.as_str() {
        "leaf" => WIN_ICON_LEAF,
        _ => WIN_ICON_SHIELD,
    };
    let img = Image::from_bytes(bytes).map_err(|e| e.to_string())?;
    if let Some(w) = app.get_webview_window("main") {
        w.set_icon(img).map_err(|e| e.to_string())?;
        #[cfg(windows)]
        platform::refresh_taskbar_icon(&w, bytes);
    }
    Ok(())
}

#[cfg(desktop)]
fn icon_for(state: &str) -> Image<'static> {
    let bytes: &[u8] = match state {
        "connected" => TRAY_CONNECTED,
        "connecting" | "disconnecting" => TRAY_CONNECTING,
        _ => TRAY_DISCONNECTED,
    };
    Image::from_bytes(bytes).expect("tray icon bytes are valid PNG")
}

#[cfg(desktop)]
fn show_main_window(app: &AppHandle) {
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.show();
        let _ = w.unminimize();
        let _ = w.set_focus();
    }
}

#[cfg(desktop)]
fn handle_deep_links(app: &AppHandle, urls: &[String]) {
    if urls.is_empty() {
        return;
    }
    show_main_window(app);
    for raw in urls {
        let trimmed = raw.trim();
        if trimmed.is_empty() {
            continue;
        }
        let _ = app.emit("deep-link", trimmed);
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    #[cfg(desktop)]
    run_desktop();
    #[cfg(mobile)]
    run_mobile();
}

#[cfg(desktop)]
fn run_desktop() {
    let mut builder = tauri::Builder::default();

    #[cfg(any(windows, target_os = "linux"))]
    {
        builder = builder.plugin(tauri_plugin_single_instance::init(
            |app, args, _cwd| {
                let urls: Vec<String> = args
                    .iter()
                    .filter(|a| {
                        a.starts_with("mint://")
                            || a.starts_with("mintvpn://")
                            || a.starts_with("flclashx://")
                            || a.starts_with("clash://")
                            || a.starts_with("sing-box://")
                            || a.starts_with("vless://")
                            || a.starts_with("vmess://")
                            || a.starts_with("trojan://")
                            || a.starts_with("ss://")
                    })
                    .cloned()
                    .collect();
                handle_deep_links(app, &urls);
            },
        ));
    }

    builder
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_os::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            // Pass the marker arg so the binary can tell apart user
            // launches from login-item launches and start hidden in
            // the tray on the latter (Linux / macOS path — Windows
            // bypasses this plugin and writes the Run key directly,
            // see `autostart.rs`).
            Some(vec![autostart::AUTOSTART_ARG]),
        ))
        .plugin(tauri_plugin_updater::Builder::new().build())
        .setup(|app| {
            // Restore the user's pre-Mint proxy settings if a previous Mint
            // session crashed mid-tunnel and left a stale 127.0.0.1:7890
            // entry in HKCU IE Settings. Runs *before* the webview loads
            // so the user gets their internet back even if the React app
            // never reaches the JS-side cleanup.
            sysproxy::restore_orphan_snapshot_at_startup(&app.handle());

            // Re-write the autostart entry on every launch so that, if
            // the binary moved (NSIS reinstall to a different path,
            // updater swap, manual move), the Run key always points to
            // the *currently running* exe. On Windows this also re-
            // applies our quoted command-line, fixing entries that
            // older versions wrote unquoted via tauri-plugin-autostart.
            #[cfg(windows)]
            autostart::refresh_if_enabled();

            // The main window is created with `visible: false` so it
            // never flashes during init. When the OS' login-items
            // machinery launches us (Windows Run key, .desktop, Launch
            // Agent), keep it hidden — the user expects the tunnel to
            // come back silently in the tray. On a normal user launch
            // we show it now.
            let launched_via_autostart =
                std::env::args().any(|a| a == autostart::AUTOSTART_ARG);
            if !launched_via_autostart {
                if let Some(w) = app.get_webview_window("main") {
                    let _ = w.show();
                    let _ = w.set_focus();
                }
            }

            #[cfg(any(windows, target_os = "linux"))]
            {
                use tauri_plugin_deep_link::DeepLinkExt;
                let _ = app.deep_link().register_all();
            }

            {
                use tauri_plugin_deep_link::DeepLinkExt;
                let app_handle = app.handle().clone();
                if let Ok(Some(initial)) = app.deep_link().get_current() {
                    let urls: Vec<String> =
                        initial.iter().map(|u| u.to_string()).collect();
                    handle_deep_links(&app_handle, &urls);
                }
                let app_handle2 = app_handle.clone();
                app.deep_link().on_open_url(move |event| {
                    let urls: Vec<String> =
                        event.urls().iter().map(|u| u.to_string()).collect();
                    handle_deep_links(&app_handle2, &urls);
                });
            }
            if let Some(main) = app.get_webview_window("main") {
                let app_handle = app.handle().clone();
                main.on_window_event(move |event| {
                    if let WindowEvent::CloseRequested { api, .. } = event {
                        api.prevent_close();
                        let _ = app_handle.emit("close-requested", ());
                    }
                });
            }

            #[cfg(debug_assertions)]
            {
                let window = app.get_webview_window("main").unwrap();
                window.open_devtools();
            }

            let show = MenuItem::with_id(app, "show", "Открыть Mint", true, None::<&str>)?;
            let toggle = MenuItem::with_id(app, "toggle", "Подключиться / Отключить", true, None::<&str>)?;
            let separator = tauri::menu::PredefinedMenuItem::separator(app)?;
            let quit = MenuItem::with_id(app, "quit", "Выход", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show, &toggle, &separator, &quit])?;

            let _tray = TrayIconBuilder::with_id("main")
                .icon(icon_for("disconnected"))
                .menu(&menu)
                .tooltip("Mint VPN")
                .show_menu_on_left_click(false)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "show" => show_main_window(app),
                    "toggle" => {
                        let _ = app.emit("tray-toggle", ());
                        show_main_window(app);
                    }
                    "quit" => {
                        perform_graceful_shutdown(app);
                        app.exit(0);
                    }
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let tauri::tray::TrayIconEvent::Click { button, button_state, .. } = event {
                        if matches!(button, tauri::tray::MouseButton::Left)
                            && matches!(button_state, tauri::tray::MouseButtonState::Up)
                        {
                            show_main_window(tray.app_handle());
                        }
                    }
                })
                .build(app)?;

            let app_handle = app.handle().clone();
            app.listen("vpn-state", move |event| {
                let payload = event.payload().trim_matches('"').to_string();
                if let Some(tray) = app_handle.tray_by_id("main") {
                    let _ = tray.set_icon(Some(icon_for(&payload)));
                    let tooltip = match payload.as_str() {
                        "connected" => "Mint VPN — подключено",
                        "connecting" => "Mint VPN — подключение…",
                        "disconnecting" => "Mint VPN — отключение…",
                        _ => "Mint VPN — отключено",
                    };
                    let _ = tray.set_tooltip(Some(tooltip));
                }
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::app_version,
            commands::is_elevated,
            commands::ping_test,
            commands::fetch_subscription,
            singbox::singbox_start,
            singbox::singbox_stop,
            singbox::singbox_running,
            singbox::singbox_kill_orphans,
            singbox::singbox_pick_free_clash_port,
            sysproxy::sysproxy_set,
            sysproxy::sysproxy_clear,
            sysproxy::sysproxy_clear_if_local,
            sysapps::list_installed_apps,
            sysapps::list_running_processes,
            sysapps::scan_folder_exes,
            sysapps::get_exe_icons_b64,
            killswitch::killswitch_enable,
            killswitch::killswitch_disable,
            killswitch::killswitch_active,
            set_window_icon,
            set_close_to_tray,
            quit_app,
            prepare_for_update,
            mint_set_autostart,
            mint_is_autostart_enabled,
            mint_launched_via_autostart,
        ])
        .run(tauri::generate_context!())
        .expect("error while running mint");
}

#[cfg(mobile)]
fn run_mobile() {
    // Phase 2 mobile build: real VPN tunneling on Android via VpnService +
    // sing-box (libbox.aar). The Tauri plugin `tauri-plugin-mintvpn` exposes
    // prepare_vpn / start_vpn / stop_vpn / vpn_status to the JS layer; the
    // UI on Android calls these instead of the desktop sing-box sidecar.
    // Tray, autostart, updater, sysproxy, killswitch remain desktop-only.
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_os::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_mintvpn::init())
        .invoke_handler(tauri::generate_handler![
            commands::app_version,
            commands::is_elevated,
            commands::ping_test,
            commands::fetch_subscription,
            quit_app,
        ])
        .run(tauri::generate_context!())
        .expect("error while running mint");
}

#[derive(Debug, Serialize, Deserialize)]
pub struct AppInfo {
    pub name: String,
    pub version: String,
    pub channel: String,
}
