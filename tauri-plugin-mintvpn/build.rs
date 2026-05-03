const COMMANDS: &[&str] = &[
    "prepare_vpn",
    "start_vpn",
    "stop_vpn",
    "vpn_status",
];

fn main() {
    tauri_plugin::Builder::new(COMMANDS)
        .android_path("android")
        .build();
}
