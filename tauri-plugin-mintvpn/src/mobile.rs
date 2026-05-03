use serde::de::DeserializeOwned;
use tauri::{
    AppHandle, Runtime,
    plugin::{PluginApi, PluginHandle},
};

use crate::models::*;

#[cfg(target_os = "android")]
const PLUGIN_IDENTIFIER: &str = "com.mint.vpn";

pub fn init<R: Runtime, C: DeserializeOwned>(
    _app: &AppHandle<R>,
    api: PluginApi<R, C>,
) -> crate::Result<MintVpn<R>> {
    #[cfg(target_os = "android")]
    {
        let handle = api.register_android_plugin(PLUGIN_IDENTIFIER, "MintVpnPlugin")?;
        Ok(MintVpn(handle))
    }
    #[cfg(not(target_os = "android"))]
    {
        let _ = api;
        Err(crate::Error::Other(
            "mintvpn plugin is only available on Android".to_string(),
        ))
    }
}

/// Access to the Mint VPN Android plugin.
pub struct MintVpn<R: Runtime>(PluginHandle<R>);

impl<R: Runtime> MintVpn<R> {
    pub fn prepare_vpn(&self, payload: VoidRequest) -> crate::Result<PrepareResponse> {
        self.0
            .run_mobile_plugin("prepare_vpn", payload)
            .map_err(Into::into)
    }

    pub fn start_vpn(&self, payload: StartVpnRequest) -> crate::Result<StatusResponse> {
        self.0
            .run_mobile_plugin("start_vpn", payload)
            .map_err(Into::into)
    }

    pub fn stop_vpn(&self, payload: VoidRequest) -> crate::Result<StatusResponse> {
        self.0
            .run_mobile_plugin("stop_vpn", payload)
            .map_err(Into::into)
    }

    pub fn vpn_status(&self, payload: VoidRequest) -> crate::Result<StatusResponse> {
        self.0
            .run_mobile_plugin("vpn_status", payload)
            .map_err(Into::into)
    }

    pub fn list_installed_apps(&self, payload: VoidRequest) -> crate::Result<InstalledAppsResponse> {
        self.0
            .run_mobile_plugin("list_installed_apps", payload)
            .map_err(Into::into)
    }
}
