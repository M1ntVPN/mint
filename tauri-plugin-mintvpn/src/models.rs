use serde::{Deserialize, Serialize};

#[derive(Debug, Default, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VoidRequest {}

#[derive(Debug, Clone, Default, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PrepareResponse {
    pub granted: bool,
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StartVpnRequest {
    /// sing-box JSON config (full document, same shape as desktop sidecar input).
    pub config: String,
    /// Profile name shown in the foreground notification.
    #[serde(default)]
    pub profile_name: Option<String>,
}

#[derive(Debug, Clone, Default, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StatusResponse {
    pub running: bool,
    pub error_msg: Option<String>,
}
