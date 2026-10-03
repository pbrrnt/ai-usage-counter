use serde::Deserialize;
use serde_json::Value;
use tauri::{AppHandle, Manager};

const CONFIG_FILE: &str = "telegram_config.txt";
const OFFSET_FILE: &str = "telegram_offset.txt";
const LOG_FILE: &str = "telegram_log.txt";
const LOG_MAX_BYTES: u64 = 128 * 1024;

// Serializes log writes — two alerts in the same refresh cycle send at once,
// and the trim step's rewrite would otherwise clobber a concurrent append.
static LOG_LOCK: std::sync::Mutex<()> = std::sync::Mutex::new(());

// Every send attempt (success or failure) gets one line here, so a
// silently-swallowed notification (e.g. an off-schedule reset that never
// reached Telegram) can be checked after the fact instead of only living in
// devtools console output nobody sees on a hidden background app.
fn log_line(app: &AppHandle, line: &str) {
    let Ok(dir) = app.path().app_data_dir() else { return };
    let _ = std::fs::create_dir_all(&dir);
    let path = dir.join(LOG_FILE);

    // Multi-line messages (the /usage summary) stay one entry per line, so
    // trimming at line boundaries never splits an entry.
    let now = chrono::Local::now().format("%Y-%m-%d %H:%M:%S");
    let entry = format!("[{now}] {}\n", line.replace('\n', " | "));

    let _guard = LOG_LOCK.lock();

    // Past the cap, keep the newer half — only then is the file read at all.
    let too_big = std::fs::metadata(&path).map_or(false, |m| m.len() > LOG_MAX_BYTES);
    if too_big {
        if let Ok(existing) = std::fs::read_to_string(&path) {
            let lines: Vec<&str> = existing.lines().collect();
            let kept = lines[lines.len() / 2..].join("\n");
            let _ = std::fs::write(&path, kept + "\n" + &entry);
            return;
        }
    }

    use std::io::Write;
    if let Ok(mut f) = std::fs::OpenOptions::new().create(true).append(true).open(&path) {
        let _ = f.write_all(entry.as_bytes());
    }
}

const TEMPLATE: &str = r#"# AI Usage Counter — Telegram notifications
#
# Fill in both values below and save. Changes are picked up immediately —
# no need to restart the app. Leave either value blank (or delete this
# file) to turn notifications off.
#
# How to get these values:
#   1. Open Telegram, message @BotFather, send /newbot, follow the prompts.
#      BotFather replies with a token that looks like 123456789:AA...
#   2. Send your new bot any message (e.g. "hi"), then open this URL in a
#      browser (with YOUR token pasted in):
#        https://api.telegram.org/bot<YOUR_TOKEN>/getUpdates
#      Look for "chat":{"id": ...} in the response — that number is CHAT_ID.
#
# Once set up, send the bot "/usage" any time to get current usage for every
# connected provider (only replies to messages from CHAT_ID — anyone else
# who finds the bot is ignored).

BOT_TOKEN=
CHAT_ID=
"#;

pub fn ensure_config_template(app: &AppHandle) {
    let Ok(dir) = app.path().app_data_dir() else { return };
    let path = dir.join(CONFIG_FILE);
    if path.exists() {
        return;
    }
    let _ = std::fs::create_dir_all(&dir);
    let _ = std::fs::write(path, TEMPLATE);
}

fn load_config(app: &AppHandle) -> Option<(String, String)> {
    let dir = app.path().app_data_dir().ok()?;
    let content = std::fs::read_to_string(dir.join(CONFIG_FILE)).ok()?;

    let mut token = String::new();
    let mut chat_id = String::new();
    for line in content.lines() {
        let line = line.trim();
        if line.is_empty() || line.starts_with('#') {
            continue;
        }
        // split_once + trim so "BOT_TOKEN = 123:abc" works too — otherwise a
        // stray space silently turns notifications off with nothing logged.
        let Some((key, value)) = line.split_once('=') else { continue };
        match key.trim() {
            "BOT_TOKEN" => token = value.trim().to_string(),
            "CHAT_ID" => chat_id = value.trim().to_string(),
            _ => {}
        }
    }

    if token.is_empty() || chat_id.is_empty() {
        None
    } else {
        Some((token, chat_id))
    }
}

// Returns Ok(true) once actually sent, Ok(false) when not configured (the
// "off" state — background reset-detection calls treat this as a quiet
// no-op, the Settings test button surfaces it as "not configured").
pub async fn post_message(app: &AppHandle, text: &str) -> Result<bool, String> {
    let Some((token, chat_id)) = load_config(app) else {
        return Ok(false);
    };

    let chat_id_value: Value = chat_id
        .parse::<i64>()
        .map(Value::from)
        .unwrap_or_else(|_| Value::String(chat_id));

    let url = format!("https://api.telegram.org/bot{token}/sendMessage");
    let client = reqwest::Client::new();
    let sent = client
        .post(&url)
        .json(&serde_json::json!({ "chat_id": chat_id_value, "text": text }))
        .send()
        .await;

    let res = match sent {
        Ok(r) => r,
        Err(e) => {
            // The request URL embeds the bot token — keep it out of the log.
            let e = e.without_url();
            log_line(app, &format!("FAILED (network: {e}): {text}"));
            return Err(e.to_string());
        }
    };

    if res.status().is_success() {
        log_line(app, &format!("SENT: {text}"));
        Ok(true)
    } else {
        let body = res.text().await.unwrap_or_default();
        log_line(app, &format!("FAILED ({body}): {text}"));
        Err(format!("Telegram API error: {body}"))
    }
}

// ── Incoming commands (long-polling getUpdates) ────────────────────────────

#[derive(Deserialize)]
struct UpdatesResponse {
    result: Vec<Update>,
}
#[derive(Deserialize)]
struct Update {
    update_id: i64,
    message: Option<IncomingMessage>,
}
#[derive(Deserialize)]
struct IncomingMessage {
    chat: Chat,
    text: Option<String>,
}
#[derive(Deserialize)]
struct Chat {
    id: i64,
}

fn load_offset(app: &AppHandle) -> i64 {
    app.path()
        .app_data_dir()
        .ok()
        .and_then(|d| std::fs::read_to_string(d.join(OFFSET_FILE)).ok())
        .and_then(|s| s.trim().parse().ok())
        .unwrap_or(0)
}

fn save_offset(app: &AppHandle, offset: i64) {
    if let Ok(dir) = app.path().app_data_dir() {
        let _ = std::fs::create_dir_all(&dir);
        let _ = std::fs::write(dir.join(OFFSET_FILE), offset.to_string());
    }
}

// One getUpdates round-trip: advances past every update seen (so nothing is
// re-delivered on the next poll or after a restart) and reports whether the
// *configured* chat (never a stranger who happens to message the bot) sent
// a usage-check command. Returns Ok(false) — a quiet no-op, same as
// post_message — when Telegram isn't configured at all.
pub async fn poll_usage_command(app: &AppHandle) -> Result<bool, String> {
    let Some((token, chat_id)) = load_config(app) else {
        return Ok(false);
    };
    let expected_chat_id: i64 = chat_id.parse().unwrap_or(0);

    let offset = load_offset(app);
    let url = format!("https://api.telegram.org/bot{token}/getUpdates");
    let client = reqwest::Client::new();
    let res = client
        .get(&url)
        .query(&[("offset", offset), ("timeout", 5)])
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !res.status().is_success() {
        let body = res.text().await.unwrap_or_default();
        return Err(format!("Telegram API error: {body}"));
    }

    let parsed: UpdatesResponse = res.json().await.map_err(|e| e.to_string())?;

    let mut triggered = false;
    let mut next_offset = offset;
    for update in parsed.result {
        next_offset = next_offset.max(update.update_id + 1);
        let Some(msg) = update.message else { continue };
        if msg.chat.id != expected_chat_id {
            continue; // ignore anyone other than the configured chat
        }
        let text = msg.text.unwrap_or_default().trim().to_lowercase();
        if text == "/usage" || text == "usage" {
            triggered = true;
        }
    }
    if next_offset != offset {
        save_offset(app, next_offset);
    }

    Ok(triggered)
}
