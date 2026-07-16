use crate::models::TrayRect;
use tauri::{
    menu::{Menu, MenuItem, PredefinedMenuItem},
    tray::{MouseButton, TrayIconBuilder, TrayIconEvent},
    Emitter, Manager, Runtime,
};

pub fn setup<R: Runtime>(app: &tauri::App<R>) -> tauri::Result<()> {
    let show    = MenuItem::with_id(app, "show",    "Show",          true, None::<&str>)?;
    let hide    = MenuItem::with_id(app, "hide",    "Hide",          true, None::<&str>)?;
    let compact = MenuItem::with_id(app, "compact", "Compact Mode",  true, None::<&str>)?;
    let sep     = PredefinedMenuItem::separator(app)?;
    let quit    = MenuItem::with_id(app, "quit",    "Quit",          true, None::<&str>)?;

    let menu = Menu::with_items(app, &[&show, &hide, &compact, &sep, &quit])?;

    TrayIconBuilder::with_id("main")
        .icon(app.default_window_icon().unwrap().clone())
        .menu(&menu)
        .tooltip("AI Usage Counter  (Ctrl+Shift+U)")
        .on_menu_event(|app, event| match event.id.as_ref() {
            "show" => {
                if let Some(win) = app.get_webview_window("main") {
                    let _ = win.show();
                    let _ = win.set_focus();
                }
            }
            "hide" => {
                if let Some(win) = app.get_webview_window("main") {
                    let _ = win.hide();
                }
            }
            "compact" => {
                // Tell the frontend to toggle compact mode
                if let Some(win) = app.get_webview_window("main") {
                    let _ = win.show();
                    let _ = win.emit("toggle-compact", ());
                }
            }
            "quit" => app.exit(0),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| match event {
            // Left-click tray icon → show/hide
            TrayIconEvent::Click {
                button: MouseButton::Left,
                ..
            } => {
                let app = tray.app_handle();
                if let Some(win) = app.get_webview_window("main") {
                    let visible = win.is_visible().unwrap_or(false);
                    if visible {
                        let _ = win.hide();
                    } else {
                        let _ = win.show();
                        let _ = win.set_focus();
                    }
                }
            }
            // Cursor entered/moved over the icon region → let the frontend
            // decide whether to show the flyout (only in tray-hover mode).
            TrayIconEvent::Enter { rect, .. } | TrayIconEvent::Move { rect, .. } => {
                let app = tray.app_handle();
                let (x, y) = match rect.position {
                    tauri::Position::Physical(p) => (p.x as f64, p.y as f64),
                    tauri::Position::Logical(p) => (p.x, p.y),
                };
                let (width, height) = match rect.size {
                    tauri::Size::Physical(s) => (s.width as f64, s.height as f64),
                    tauri::Size::Logical(s) => (s.width, s.height),
                };
                let _ = app.emit("tray-hover-enter", TrayRect { x, y, width, height });
            }
            TrayIconEvent::Leave { .. } => {
                let app = tray.app_handle();
                let _ = app.emit("tray-hover-leave", ());
            }
            _ => {}
        })
        .build(app)?;

    Ok(())
}
