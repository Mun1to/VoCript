use crate::managers::history::{HistoryEntry, HistoryManager};
use crate::managers::model::ModelManager;
use crate::managers::transcription::TranscriptionManager;
use crate::settings;
use crate::tray_i18n::get_tray_translations;
use log::{error, info, warn};
use serde::{Deserialize, Serialize};
use specta::Type;
use std::sync::atomic::{AtomicU8, Ordering};
use std::sync::Arc;
use tauri::image::Image;
use tauri::menu::{CheckMenuItem, Menu, MenuItem, PredefinedMenuItem, Submenu};
use tauri::tray::TrayIcon;
use tauri::{AppHandle, Emitter, Manager, Theme};
use tauri_plugin_clipboard_manager::ClipboardExt;

/// Last state the tray was rendered with, so the custom menu window can show
/// the right actions (Cancel while busy) without threading state through the UI.
static TRAY_STATE: AtomicU8 = AtomicU8::new(0);

fn store_tray_state(state: &TrayIconState) {
    let v = match state {
        TrayIconState::Idle => 0,
        TrayIconState::Recording => 1,
        TrayIconState::Transcribing => 2,
    };
    TRAY_STATE.store(v, Ordering::Relaxed);
}

#[derive(Clone, Debug, PartialEq)]
pub enum TrayIconState {
    Idle,
    Recording,
    Transcribing,
}

#[derive(Clone, Debug, PartialEq)]
pub enum AppTheme {
    Dark,
    Light,
    Colored, // Pink/colored theme for Linux
}

/// Gets the current app theme, with Linux defaulting to Colored theme
pub fn get_current_theme(app: &AppHandle) -> AppTheme {
    if cfg!(target_os = "linux") {
        // On Linux, always use the colored theme
        AppTheme::Colored
    } else {
        // On other platforms, map system theme to our app theme
        if let Some(main_window) = app.get_webview_window("main") {
            match main_window.theme().unwrap_or(Theme::Dark) {
                Theme::Light => AppTheme::Light,
                Theme::Dark => AppTheme::Dark,
                _ => AppTheme::Dark, // Default fallback
            }
        } else {
            AppTheme::Dark
        }
    }
}

/// Gets the appropriate icon path for the given theme and state
pub fn get_icon_path(theme: AppTheme, state: TrayIconState) -> &'static str {
    match (theme, state) {
        // Dark theme uses light icons
        (AppTheme::Dark, TrayIconState::Idle) => "resources/tray_idle.png",
        (AppTheme::Dark, TrayIconState::Recording) => "resources/tray_recording.png",
        (AppTheme::Dark, TrayIconState::Transcribing) => "resources/tray_transcribing.png",
        // Light theme uses dark icons
        (AppTheme::Light, TrayIconState::Idle) => "resources/tray_idle_dark.png",
        (AppTheme::Light, TrayIconState::Recording) => "resources/tray_recording_dark.png",
        (AppTheme::Light, TrayIconState::Transcribing) => "resources/tray_transcribing_dark.png",
        // Colored theme uses pink icons (for Linux)
        (AppTheme::Colored, TrayIconState::Idle) => "resources/handy.png",
        (AppTheme::Colored, TrayIconState::Recording) => "resources/recording.png",
        (AppTheme::Colored, TrayIconState::Transcribing) => "resources/transcribing.png",
    }
}

pub fn change_tray_icon(app: &AppHandle, icon: TrayIconState) {
    let tray = app.state::<TrayIcon>();
    let theme = get_current_theme(app);

    let icon_path = get_icon_path(theme, icon.clone());

    let _ = tray.set_icon(Some(
        Image::from_path(
            app.path()
                .resolve(icon_path, tauri::path::BaseDirectory::Resource)
                .expect("failed to resolve"),
        )
        .expect("failed to set icon"),
    ));

    // Update menu based on state
    update_tray_menu(app, &icon, None);
}

pub fn tray_tooltip() -> String {
    version_label()
}

fn version_label() -> String {
    if cfg!(debug_assertions) {
        format!("VoCript v{} (Dev)", env!("CARGO_PKG_VERSION"))
    } else {
        format!("VoCript v{}", env!("CARGO_PKG_VERSION"))
    }
}

pub fn update_tray_menu(app: &AppHandle, state: &TrayIconState, locale: Option<&str>) {
    store_tray_state(state);
    let settings = settings::get_settings(app);

    let locale = locale.unwrap_or(&settings.app_language);
    let strings = get_tray_translations(Some(locale.to_string()));

    // Platform-specific accelerators
    #[cfg(target_os = "macos")]
    let (settings_accelerator, quit_accelerator) = (Some("Cmd+,"), Some("Cmd+Q"));
    #[cfg(not(target_os = "macos"))]
    let (settings_accelerator, quit_accelerator) = (Some("Ctrl+,"), Some("Ctrl+Q"));

    // Create common menu items
    let version_label = version_label();
    let version_i = MenuItem::with_id(app, "version", &version_label, false, None::<&str>)
        .expect("failed to create version item");
    let settings_i = MenuItem::with_id(
        app,
        "settings",
        &strings.settings,
        true,
        settings_accelerator,
    )
    .expect("failed to create settings item");
    let check_updates_i = MenuItem::with_id(
        app,
        "check_updates",
        &strings.check_updates,
        settings.update_checks_enabled,
        None::<&str>,
    )
    .expect("failed to create check updates item");
    let copy_last_transcript_i = MenuItem::with_id(
        app,
        "copy_last_transcript",
        &strings.copy_last_transcript,
        true,
        None::<&str>,
    )
    .expect("failed to create copy last transcript item");
    // Checkable so the menu shows whether a live mode is currently on.
    let live_voice_i = CheckMenuItem::with_id(
        app,
        "live_transcription_voice",
        &strings.live_transcription_voice,
        true,
        settings.live_mode,
        None::<&str>,
    )
    .expect("failed to create live voice item");
    let live_system_i = CheckMenuItem::with_id(
        app,
        "live_transcription_system",
        &strings.live_transcription_system,
        true,
        settings.live_mode_system,
        None::<&str>,
    )
    .expect("failed to create live system item");
    let model_loaded = app.state::<Arc<TranscriptionManager>>().is_model_loaded();
    let quit_i = MenuItem::with_id(app, "quit", &strings.quit, true, quit_accelerator)
        .expect("failed to create quit item");
    let separator = || PredefinedMenuItem::separator(app).expect("failed to create separator");

    // Build model submenu — label is the active model name
    let model_manager = app.state::<Arc<ModelManager>>();
    let models = model_manager.get_available_models();
    let current_model_id = &settings.selected_model;

    let mut downloaded: Vec<_> = models.into_iter().filter(|m| m.is_downloaded).collect();
    downloaded.sort_by(|a, b| a.name.cmp(&b.name));

    // Prefixed ("Model: Whisper Turbo") so it reads as a picker, not a stray item.
    let submenu_label = downloaded
        .iter()
        .find(|m| m.id == *current_model_id)
        .map(|m| format!("{}: {}", strings.model, m.name))
        .unwrap_or_else(|| strings.model.clone());

    let unload_model_i = MenuItem::with_id(
        app,
        "unload_model",
        &strings.unload_model,
        model_loaded,
        None::<&str>,
    )
    .expect("failed to create unload model item");

    let model_submenu = {
        let submenu = Submenu::with_id(app, "model_submenu", &submenu_label, true)
            .expect("failed to create model submenu");

        for model in &downloaded {
            let is_active = model.id == *current_model_id;
            let item_id = format!("model_select:{}", model.id);
            let item =
                CheckMenuItem::with_id(app, &item_id, &model.name, true, is_active, None::<&str>)
                    .expect("failed to create model item");
            let _ = submenu.append(&item);
        }

        // Unloading lives here: an advanced, rare action that does not need to
        // take up a slot in the top-level menu.
        let _ = submenu.append(&separator());
        let _ = submenu.append(&unload_model_i);

        submenu
    };

    // Language picker: one click away instead of buried in Settings. Entries are
    // in each language's own name so a user stuck in a script they cannot read
    // can still find their way back.
    let language_submenu = {
        let label = format!("{}: {}", strings.language, settings::language_native_name(locale));
        let submenu = Submenu::with_id(app, "language_submenu", &label, true)
            .expect("failed to create language submenu");

        for &(code, native_name) in settings::SUPPORTED_APP_LANGUAGES {
            let is_active = code == locale;
            let item_id = format!("language_select:{}", code);
            let item =
                CheckMenuItem::with_id(app, &item_id, native_name, true, is_active, None::<&str>)
                    .expect("failed to create language item");
            let _ = submenu.append(&item);
        }

        submenu
    };

    let menu = match state {
        TrayIconState::Recording | TrayIconState::Transcribing => {
            let cancel_i = MenuItem::with_id(app, "cancel", &strings.cancel, true, None::<&str>)
                .expect("failed to create cancel item");
            Menu::with_items(
                app,
                &[
                    &version_i,
                    &separator(),
                    &cancel_i,
                    &live_voice_i,
                    &live_system_i,
                    &separator(),
                    &copy_last_transcript_i,
                    &separator(),
                    &settings_i,
                    &check_updates_i,
                    &separator(),
                    &quit_i,
                ],
            )
            .expect("failed to create menu")
        }
        TrayIconState::Idle => Menu::with_items(
            app,
            &[
                &version_i,
                &separator(),
                &live_voice_i,
                &live_system_i,
                &separator(),
                &copy_last_transcript_i,
                &separator(),
                &model_submenu,
                &language_submenu,
                &separator(),
                &settings_i,
                &check_updates_i,
                &separator(),
                &quit_i,
            ],
        )
        .expect("failed to create menu"),
    };

    let tray = app.state::<TrayIcon>();
    // The custom window replaces the native menu when it is available. A menu
    // left assigned would still be popped up by Windows on right-click, so it
    // is only kept as a real fallback if the window could not be created.
    if app
        .get_webview_window(crate::tray_menu::TRAY_MENU_LABEL)
        .is_some()
    {
        let _ = tray.set_menu(None::<Menu<tauri::Wry>>);
    } else {
        let _ = tray.set_menu(Some(menu));
    }
    let _ = tray.set_icon_as_template(true);
    let _ = tray.set_tooltip(Some(version_label));
}

fn last_transcript_text(entry: &HistoryEntry) -> &str {
    entry
        .post_processed_text
        .as_deref()
        .unwrap_or(&entry.transcription_text)
}

pub fn set_tray_visibility(app: &AppHandle, visible: bool) {
    let tray = app.state::<TrayIcon>();
    if let Err(e) = tray.set_visible(visible) {
        error!("Failed to set tray visibility: {}", e);
    } else {
        info!("Tray visibility set to: {}", visible);
    }
}

pub fn copy_last_transcript(app: &AppHandle) {
    let history_manager = app.state::<Arc<HistoryManager>>();
    let entry = match history_manager.get_latest_completed_entry() {
        Ok(Some(entry)) => entry,
        Ok(None) => {
            warn!("No completed transcription history entries available for tray copy.");
            return;
        }
        Err(err) => {
            error!(
                "Failed to fetch last completed transcription entry: {}",
                err
            );
            return;
        }
    };

    let text = last_transcript_text(&entry);
    if text.trim().is_empty() {
        warn!("Last completed transcription is empty; skipping tray copy.");
        return;
    }

    if let Err(err) = app.clipboard().write_text(text) {
        error!("Failed to copy last transcript to clipboard: {}", err);
        return;
    }

    info!("Copied last transcript to clipboard via tray.");
}

// ──────────────────────────────────────────────────────────────────────
// Custom tray menu: a real window styled like the app, because native OS
// tray menus cannot be themed. State for it is gathered here; the window
// itself lives in `tray_menu.rs` and the UI in `src/tray-menu/`.
// Labels are NOT sent from Rust — the webview already has all 20 locales
// through i18next and renders `tray.*` keys itself.
// ──────────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct TrayMenuModel {
    pub id: String,
    pub name: String,
    pub is_active: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct TrayMenuLanguage {
    pub code: String,
    pub native_name: String,
    pub is_active: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct TrayMenuState {
    pub version_label: String,
    pub live_voice: bool,
    pub live_system: bool,
    pub model_loaded: bool,
    pub is_busy: bool,
    pub update_checks_enabled: bool,
    pub models: Vec<TrayMenuModel>,
    pub active_model_name: Option<String>,
    pub languages: Vec<TrayMenuLanguage>,
    pub active_language_native: String,
}

#[tauri::command]
#[specta::specta]
pub fn get_tray_menu_state(app: AppHandle) -> Result<TrayMenuState, String> {
    let settings = settings::get_settings(&app);

    let mut downloaded: Vec<_> = app
        .state::<Arc<ModelManager>>()
        .get_available_models()
        .into_iter()
        .filter(|m| m.is_downloaded)
        .collect();
    downloaded.sort_by(|a, b| a.name.cmp(&b.name));

    Ok(TrayMenuState {
        version_label: version_label(),
        live_voice: settings.live_mode,
        live_system: settings.live_mode_system,
        model_loaded: app.state::<Arc<TranscriptionManager>>().is_model_loaded(),
        is_busy: TRAY_STATE.load(Ordering::Relaxed) != 0,
        update_checks_enabled: settings.update_checks_enabled,
        active_model_name: downloaded
            .iter()
            .find(|m| m.id == settings.selected_model)
            .map(|m| m.name.clone()),
        models: downloaded
            .iter()
            .map(|m| TrayMenuModel {
                id: m.id.clone(),
                name: m.name.clone(),
                is_active: m.id == settings.selected_model,
            })
            .collect(),
        languages: settings::SUPPORTED_APP_LANGUAGES
            .iter()
            .map(|&(code, native_name)| TrayMenuLanguage {
                code: code.to_string(),
                native_name: native_name.to_string(),
                is_active: code == settings.app_language,
            })
            .collect(),
        active_language_native: settings::language_native_name(&settings.app_language).to_string(),
    })
}

/// Runs an action picked in the custom menu window. Same ids as the native
/// menu items, so both menus share one code path.
#[tauri::command]
#[specta::specta]
pub fn tray_menu_action(app: AppHandle, action: String) -> Result<(), String> {
    crate::tray_menu::hide_tray_menu(&app);
    handle_tray_action(&app, &action);
    Ok(())
}

/// Executes a tray action by menu-item id. Shared by the native tray menu
/// (`on_menu_event`) and the custom menu window so behaviour cannot drift.
pub fn handle_tray_action(app: &AppHandle, id: &str) {
    match id {
        "settings" => {
            crate::show_main_window(app);
        }
        "check_updates" => {
            if settings::get_settings(app).update_checks_enabled {
                crate::show_main_window(app);
                let _ = app.emit("check-for-updates", ());
            }
        }
        "copy_last_transcript" => {
            copy_last_transcript(app);
        }
        "live_transcription_voice" => {
            // Toggle a voice (mic) live session: click to start, click again
            // to finish (the coordinator handles both).
            if let Some(coordinator) = app.try_state::<crate::TranscriptionCoordinator>() {
                coordinator.send_input("transcribe_live", "", true, false);
            }
        }
        "live_transcription_system" => {
            if let Some(coordinator) = app.try_state::<crate::TranscriptionCoordinator>() {
                coordinator.send_input("transcribe_system_live", "", true, false);
            }
        }
        "unload_model" => {
            let transcription_manager = app.state::<Arc<TranscriptionManager>>();
            if !transcription_manager.is_model_loaded() {
                warn!("No model is currently loaded.");
                return;
            }
            match transcription_manager.unload_model() {
                Ok(()) => info!("Model unloaded via tray."),
                Err(e) => error!("Failed to unload model via tray: {}", e),
            }
        }
        "cancel" => {
            crate::utils::cancel_current_operation(app);
        }
        "quit" => {
            app.exit(0);
        }
        id if id.starts_with("language_select:") => {
            let language = id.strip_prefix("language_select:").unwrap().to_string();
            let mut settings = settings::get_settings(app);
            if settings.app_language == language {
                return;
            }
            // Mirrors LanguageQuickSwitch in the frontend: picking a UI
            // language also sets the transcription language. Only Chinese
            // differs between the two code sets.
            let model_language = match language.as_str() {
                "zh" => "zh-Hans",
                "zh-TW" => "zh-Hant",
                other => other,
            };
            settings.app_language = language.clone();
            settings.selected_language = model_language.to_string();
            settings::write_settings(app, settings);

            let _ = app.emit("app-language-changed", &language);
            update_tray_menu(app, &TrayIconState::Idle, Some(&language));
            info!("App language switched to {} via tray.", language);
        }
        id if id.starts_with("model_select:") => {
            let model_id = id.strip_prefix("model_select:").unwrap().to_string();
            if model_id == settings::get_settings(app).selected_model {
                return;
            }
            let app_clone = app.clone();
            std::thread::spawn(move || {
                match crate::commands::models::switch_active_model(&app_clone, &model_id) {
                    Ok(()) => info!("Model switched to {} via tray.", model_id),
                    Err(e) => error!("Failed to switch model via tray: {}", e),
                }
                update_tray_menu(&app_clone, &TrayIconState::Idle, None);
            });
        }
        other => {
            warn!("Unhandled tray action: {}", other);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::last_transcript_text;
    use crate::managers::history::HistoryEntry;

    fn build_entry(transcription: &str, post_processed: Option<&str>) -> HistoryEntry {
        HistoryEntry {
            id: 1,
            file_name: "handy-1.wav".to_string(),
            timestamp: 0,
            saved: false,
            title: "Recording".to_string(),
            transcription_text: transcription.to_string(),
            post_processed_text: post_processed.map(|text| text.to_string()),
            post_process_prompt: None,
            post_process_requested: false,
        }
    }

    #[test]
    fn uses_post_processed_text_when_available() {
        let entry = build_entry("raw", Some("processed"));
        assert_eq!(last_transcript_text(&entry), "processed");
    }

    #[test]
    fn falls_back_to_raw_transcription() {
        let entry = build_entry("raw", None);
        assert_eq!(last_transcript_text(&entry), "raw");
    }
}
