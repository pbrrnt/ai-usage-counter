use serde_json::Value;
use tauri::{AppHandle, Manager};

const CONFIG_FILE: &str = "telegram_config.txt";

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
        if let Some(v) = line.strip_prefix("BOT_TOKEN=") {
            token = v.trim().to_string();
        } else if let Some(v) = line.strip_prefix("CHAT_ID=") {
            chat_id = v.trim().to_string();
        }
    }

    if token.is_empty() || chat_id.is_empty() {
        None
    } else {
        Some((token, chat_id))
    }
}

pub async fn post_message(app: &AppHandle, text: &str) -> Result<(), String> {
    let Some((token, chat_id)) = load_config(app) else {
        return Ok(()); // not configured — silently a no-op, this is the "off" state
    };

    let chat_id_value: Value = chat_id
        .parse::<i64>()
        .map(Value::from)
        .unwrap_or_else(|_| Value::String(chat_id));

    let url = format!("https://api.telegram.org/bot{token}/sendMessage");
    let client = reqwest::Client::new();
    let res = client
        .post(&url)
        .json(&serde_json::json!({ "chat_id": chat_id_value, "text": text }))
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if res.status().is_success() {
        Ok(())
    } else {
        let body = res.text().await.unwrap_or_default();
        Err(format!("Telegram API error: {body}"))
    }
}
