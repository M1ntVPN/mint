fn main() {
    // Mint's TUN inbound on Windows uses wintun, and creating a wintun
    // adapter requires Administrator privileges. We brand the EXE itself
    // as `requireAdministrator` so launching Mint always elevates via
    // UAC — without this, sing-box fails to start the TUN with
    // "Access is denied." and the connect button does nothing.
    //
    // The custom manifest is Windows-only; on other platforms we fall
    // through to the default tauri-build path.
    #[cfg(target_os = "windows")]
    {
        let windows = tauri_build::WindowsAttributes::new()
            .app_manifest(include_str!("windows-app-manifest.xml"));
        let attrs = tauri_build::Attributes::new().windows_attributes(windows);
        tauri_build::try_build(attrs).expect("failed to run tauri-build");
        return;
    }

    #[allow(unreachable_code)]
    tauri_build::build();
}
