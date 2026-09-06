use crate::models::{ProviderUsageResult, QuotaLaneRaw};
use chrono::Utc;

pub const START_URL: &str = "https://claude.ai/";

// Fetches official usage from claude.ai's internal API, run inside a logged-in
// WebView so it inherits WebKit/WebView2 TLS + cookies (gets past Cloudflare):
//   GET /api/organizations            -> pick the org with the "chat" capability
//   GET /api/organizations/{id}/usage -> { five_hour: {utilization, resets_at},
//                                          seven_day: {utilization, resets_at} }
// Signals the result by navigating to tauri-result.internal.
pub const FETCH_JS: &str = r#"
(async () => {
    const nav = (params) => {
        window.location = 'https://tauri-result.internal/?' +
            new URLSearchParams({ id: '__REQ_ID__', ...params }).toString();
    };
    try {
        const headers = { 'Accept': 'application/json' };
        const orgRes = await fetch('/api/organizations', { credentials: 'include', headers });
        if (orgRes.status === 401 || orgRes.status === 403) { nav({ error: 'auth' }); return; }
        if (!orgRes.ok) { nav({ error: 'http_' + orgRes.status }); return; }
        const orgs = await orgRes.json();
        const org = Array.isArray(orgs) && orgs.length
            ? ((orgs.find(o => (o.capabilities || []).includes('chat')) || orgs[0]).uuid)
            : null;
        if (!org) { nav({ error: 'noorg' }); return; }
        const r = await fetch('/api/organizations/' + org + '/usage', { credentials: 'include', headers });
        if (r.status === 401 || r.status === 403) { nav({ error: 'auth' }); return; }
        if (!r.ok) { nav({ error: 'http_' + r.status }); return; }
        const data = await r.json();
        nav({ data: JSON.stringify(data) });
    } catch (e) {
        nav({ error: String(e) });
    }
})();
"#;

// ── Response parsing ─────────────────────────────────────────────────────────

pub fn parse_usage(raw: &str) -> Option<ProviderUsageResult> {
    let root: serde_json::Value = serde_json::from_str(raw).ok()?;

    let (session_pct, session_reset) = root
        .get("five_hour")
        .map(parse_window)
        .unwrap_or((None, None));
    let (weekly_pct, weekly_reset) = root
        .get("seven_day")
        .map(parse_window)
        .unwrap_or((None, None));

    if session_pct.is_none() && weekly_pct.is_none() {
        return None;
    }

    Some(ProviderUsageResult {
        session_pct,
        session_reset_secs: session_reset,
        weekly_pct,
        weekly_reset_secs: weekly_reset,
        quota_lanes: fable_lane(&root).into_iter().collect(),
        plan_name: None,
        is_auth_expired: false,
        fetched_at: Utc::now().to_rfc3339(),
    })
}

// Fable 5 runs its own weekly quota, separate from the five_hour/seven_day
// totals — surfaced as a `weekly_scoped` entry in `limits[]` (scoped to the
// "Fable" model) rather than a top-level field. Absent entirely on
// responses/plans that don't have a Fable-specific limit.
fn fable_lane(root: &serde_json::Value) -> Option<QuotaLaneRaw> {
    let entry = root.get("limits")?.as_array()?.iter().find(|l| {
        l.get("scope")
            .and_then(|s| s.get("model"))
            .and_then(|m| m.get("display_name"))
            .and_then(|d| d.as_str())
            .map(|s| s.eq_ignore_ascii_case("fable"))
            .unwrap_or(false)
    })?;

    let pct = entry.get("percent").and_then(|p| p.as_f64())?;
    let secs = reset_secs(entry.get("resets_at"));
    let reset_text = secs.map(format_hm);

    Some(QuotaLaneRaw {
        id: "fable".to_string(),
        label: "Fable 5".to_string(),
        group: None,
        pct,
        reset_text,
        reset_secs: secs,
    })
}

fn format_hm(secs: f64) -> String {
    let secs = secs as i64;
    let h = secs / 3600;
    let m = (secs % 3600) / 60;
    if h > 0 {
        format!("Resets in {h}h {m}m")
    } else {
        format!("Resets in {m}m")
    }
}

fn parse_window(d: &serde_json::Value) -> (Option<f64>, Option<f64>) {
    (provider_pct(d.get("utilization")), reset_secs(d.get("resets_at")))
}

// `utilization` is always a 0..1 ratio, so any value <= 1 (including exactly
// 1.0 — full usage — which used to slip through as "1%" since it has no
// fractional part) gets scaled up to a percent.
fn provider_pct(v: Option<&serde_json::Value>) -> Option<f64> {
    let n = provider_num(v)?;
    if n <= 1.0 {
        Some(n * 100.0)
    } else {
        Some(n)
    }
}

fn provider_num(v: Option<&serde_json::Value>) -> Option<f64> {
    let v = v?;
    v.as_f64().or_else(|| v.as_str().and_then(|s| s.parse::<f64>().ok()))
}

fn reset_secs(v: Option<&serde_json::Value>) -> Option<f64> {
    let s = v?.as_str()?;
    let dt = chrono::DateTime::parse_from_rfc3339(s).ok()?;
    Some((dt.timestamp() - Utc::now().timestamp()).max(0) as f64)
}
