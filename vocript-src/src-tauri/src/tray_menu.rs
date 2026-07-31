//! Custom tray menu window.
//!
//! Native OS tray menus cannot be styled, so instead of the system menu we show
//! a small frameless window that looks like the rest of VoCript. The trade-off
//! is that behaviour the OS gave for free has to be reimplemented here:
//! closing on focus loss, sizing to the content, and positioning next to the
//! tray on the right monitor.
//!
//! The native menu in `tray.rs` is kept intact as a fallback and still handles
//! the same action ids through `tray::handle_tray_action`.

use log::debug;
use std::sync::Mutex;
use tauri::{
    AppHandle, Emitter, Manager, PhysicalPosition, PhysicalSize, WebviewUrl, WebviewWindow,
    WebviewWindowBuilder,
};

pub const TRAY_MENU_LABEL: &str = "tray_menu";

/// Logical width. Height follows the content — see `resize_tray_menu`.
const MENU_WIDTH: f64 = 296.0;
/// Starting height, replaced as soon as the UI reports its real height.
const MENU_INITIAL_HEIGHT: f64 = 380.0;
/// Never grow past this; the language list scrolls instead.
const MENU_MAX_HEIGHT: f64 = 560.0;
/// Gap between the menu and the screen edge / tray icon.
const EDGE_MARGIN: f64 = 8.0;

/// Where the menu was last opened from, so a resize can re-anchor to the tray
/// instead of drifting (the window grows upward, not downward).
static LAST_ANCHOR: Mutex<Option<(f64, f64)>> = Mutex::new(None);

/// Creates the menu window up front (hidden) so opening it later is instant.
pub fn create_tray_menu_window(app: &AppHandle) {
    if app.get_webview_window(TRAY_MENU_LABEL).is_some() {
        return;
    }

    let mut builder = WebviewWindowBuilder::new(
        app,
        TRAY_MENU_LABEL,
        WebviewUrl::App("src/tray-menu/index.html".into()),
    )
    .title("VoCript menu")
    .inner_size(MENU_WIDTH, MENU_INITIAL_HEIGHT)
    .resizable(false)
    .decorations(false)
    .transparent(true)
    .shadow(false)
    .always_on_top(true)
    .skip_taskbar(true)
    .maximizable(false)
    .minimizable(false)
    .closable(false)
    .focused(false)
    .visible(false);

    if let Some(data_dir) = crate::portable::data_dir() {
        builder = builder.data_directory(data_dir.join("webview"));
    }

    match builder.build() {
        Ok(window) => {
            // A menu must disappear when you click elsewhere — the OS menu did
            // this for us; here we do it on focus loss.
            let app_handle = app.clone();
            window.on_window_event(move |event| {
                if let tauri::WindowEvent::Focused(false) = event {
                    hide_tray_menu(&app_handle);
                }
            });
            debug!("Tray menu window created (hidden)");
        }
        Err(e) => debug!("Failed to create tray menu window: {}", e),
    }
}

pub fn hide_tray_menu(app: &AppHandle) {
    if let Some(window) = app.get_webview_window(TRAY_MENU_LABEL) {
        let _ = window.hide();
    }
}

pub fn is_tray_menu_visible(app: &AppHandle) -> bool {
    app.get_webview_window(TRAY_MENU_LABEL)
        .and_then(|w| w.is_visible().ok())
        .unwrap_or(false)
}

/// Sizes and places the window so its bottom edge sits just above `anchor`
/// (the tray icon), clamped to the monitor under it.
///
/// Physical pixels throughout: mixing in logical coords lands the window on the
/// wrong screen when monitors have different scaling (same trap as overlay.rs).
fn place(app: &AppHandle, window: &WebviewWindow, anchor: (f64, f64), logical_height: f64) {
    let (ax, ay) = anchor;

    let monitor = app
        .monitor_from_point(ax, ay)
        .ok()
        .flatten()
        .or_else(|| app.primary_monitor().ok().flatten());

    let (scale, mon_pos, mon_size) = match &monitor {
        Some(m) => (m.scale_factor(), *m.position(), *m.size()),
        None => (
            1.0,
            PhysicalPosition::new(0, 0),
            PhysicalSize::new(1920, 1080),
        ),
    };

    let height = logical_height.clamp(120.0, MENU_MAX_HEIGHT) * scale;
    let width = MENU_WIDTH * scale;
    let margin = EDGE_MARGIN * scale;
    let _ = window.set_size(PhysicalSize::new(width, height));

    let mon_left = mon_pos.x as f64;
    let mon_top = mon_pos.y as f64;
    let mon_right = mon_left + mon_size.width as f64;
    let mon_bottom = mon_top + mon_size.height as f64;

    // Centred on the tray icon, above it (the taskbar is usually at the
    // bottom); flipped below when there is no room above.
    let mut x = ax - width / 2.0;
    let mut y = ay - height - margin;
    if y < mon_top + margin {
        y = ay + margin;
    }
    x = x.clamp(
        mon_left + margin,
        (mon_right - width - margin).max(mon_left),
    );
    y = y.clamp(
        mon_top + margin,
        (mon_bottom - height - margin).max(mon_top),
    );

    let _ = window.set_position(PhysicalPosition::new(x, y));
}

/// Shows the menu anchored to the tray icon at `cursor` (physical coords, as
/// given by the tray event).
pub fn show_tray_menu_at(app: &AppHandle, cursor: PhysicalPosition<f64>) {
    let Some(window) = app.get_webview_window(TRAY_MENU_LABEL) else {
        debug!("Tray menu window missing");
        return;
    };

    if let Ok(mut anchor) = LAST_ANCHOR.lock() {
        *anchor = Some((cursor.x, cursor.y));
    }

    // Reuse the last measured height so the menu does not visibly jump on open.
    let height = window
        .inner_size()
        .ok()
        .and_then(|s| window.scale_factor().ok().map(|f| s.height as f64 / f))
        .unwrap_or(MENU_INITIAL_HEIGHT);

    place(app, &window, (cursor.x, cursor.y), height);
    let _ = window.show();
    let _ = window.set_focus();
    // The window is reused, so tell the UI to reload state and reset any
    // submenu left open from last time.
    let _ = window.emit("tray-menu-opened", ());
}

/// Right-clicking the tray again while the menu is open should close it.
pub fn toggle_tray_menu(app: &AppHandle, cursor: PhysicalPosition<f64>) {
    if is_tray_menu_visible(app) {
        hide_tray_menu(app);
    } else {
        show_tray_menu_at(app, cursor);
    }
}

/// Called by the menu UI once it knows how tall its content is, so the window
/// hugs the content instead of leaving empty space below it.
#[tauri::command]
#[specta::specta]
pub fn resize_tray_menu(app: AppHandle, height: f64) -> Result<(), String> {
    let Some(window) = app.get_webview_window(TRAY_MENU_LABEL) else {
        return Ok(());
    };
    let anchor = LAST_ANCHOR.lock().ok().and_then(|a| *a);
    match anchor {
        // Re-anchor to the tray: the window grows upward, so only resizing
        // would leave a gap above the taskbar.
        Some(anchor) => place(&app, &window, anchor, height),
        None => {
            let scale = window.scale_factor().unwrap_or(1.0);
            let h = height.clamp(120.0, MENU_MAX_HEIGHT) * scale;
            let _ = window.set_size(PhysicalSize::new(MENU_WIDTH * scale, h));
        }
    }
    Ok(())
}
