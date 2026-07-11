use serde::Serialize;

#[derive(Debug, Serialize, Clone, Default)]
pub struct AntigravityUsageRaw {
    pub plan_name: Option<String>,
    pub lanes: Vec<QuotaLaneRaw>,
    pub fetched_at: String,
}

// Returned to frontend for Codex / Gemini live usage
#[derive(Debug, Serialize, Clone, Default)]
pub struct ProviderUsageResult {
    pub session_pct: Option<f64>,
    pub session_reset_secs: Option<f64>,
    pub weekly_pct: Option<f64>,
    pub weekly_reset_secs: Option<f64>,
    pub quota_lanes: Vec<QuotaLaneRaw>,
    pub plan_name: Option<String>,
    pub is_auth_expired: bool,
    pub fetched_at: String,
}

#[derive(Debug, Serialize, Clone, Default)]
pub struct QuotaLaneRaw {
    pub id: String,
    pub label: String,
    pub group: Option<String>,
    pub pct: f64,
    pub reset_text: Option<String>,
}

// Tray icon bounds (physical px), sent to the frontend so it can position the
// hover flyout right next to the icon.
#[derive(Debug, Serialize, Clone, Default)]
pub struct TrayRect {
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
}
