use tauri::{
    Runtime,
    plugin::{Builder, TauriPlugin},
};

#[cfg(mobile)]
use tauri::Manager;

#[cfg(mobile)]
mod mobile;

mod error;
mod models;

pub use error::{Error, Result};
pub use models::*;

#[cfg(mobile)]
pub use mobile::MintVpn;

/// Extension trait for accessing the Mint VPN Android plugin from a `Manager`.
#[cfg(mobile)]
pub trait MintVpnExt<R: Runtime> {
    fn mintvpn(&self) -> &MintVpn<R>;
}

#[cfg(mobile)]
impl<R: Runtime, T: Manager<R>> MintVpnExt<R> for T {
    fn mintvpn(&self) -> &MintVpn<R> {
        self.state::<MintVpn<R>>().inner()
    }
}

/// Initializes the Mint VPN plugin.
///
/// On desktop this is a no-op (registers an empty plugin). On Android the
/// plugin bridges to a Kotlin `MintVpnService` that owns the system VPN
/// tunnel and runs sing-box (libbox).
pub fn init<R: Runtime>() -> TauriPlugin<R> {
    Builder::new("mintvpn")
        .setup(|_app, _api| {
            #[cfg(mobile)]
            {
                if let Ok(mintvpn) = mobile::init(_app, _api) {
                    _app.manage(mintvpn);
                }
            }
            Ok(())
        })
        .build()
}
