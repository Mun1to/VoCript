mod actions;
#[cfg(all(target_os = "macos", target_arch = "aarch64"))]
mod apple_intelligence;
mod audio_feedback;
pub mod audio_toolkit;
pub mod cli;
mod clipboard;
mod commands;
mod fonts;
mod helpers;
mod input;
mod install_check;
mod live;
mod llm_client;
mod managers;
mod media_source;
mod overlay;
pub mod packaged;
pub mod portable;
// VoCript Pro. La carpeta `pro/` solo existe en la edición de pago; sin la bandera se monta
// en su lugar el sustituto, que tiene las mismas funciones y contesta que no están.
#[cfg(feature = "pro")]
#[path = "pro/mod.rs"]
mod pro;
#[cfg(not(feature = "pro"))]
#[path = "pro_stub.rs"]
mod pro;
mod pro_tipos;
mod settings;
mod shortcut;
mod signal_handle;
mod transcription_coordinator;
mod tray;
mod tray_i18n;
mod tray_menu;
mod update_watch;
mod utils;
mod wake_word;

pub use cli::CliArgs;
#[cfg(debug_assertions)]
use specta_typescript::{BigIntExportBehavior, Typescript};
use tauri_specta::{collect_commands, collect_events, Builder};

use env_filter::Builder as EnvFilterBuilder;
use managers::audio::AudioRecordingManager;
use managers::history::HistoryManager;
use managers::model::ModelManager;
use managers::stats::StatsManager;
use managers::transcription::TranscriptionManager;
#[cfg(unix)]
use signal_hook::consts::{SIGUSR1, SIGUSR2};
#[cfg(unix)]
use signal_hook::iterator::Signals;
use std::sync::atomic::{AtomicU64, AtomicU8, Ordering};
use std::sync::Arc;
use std::time::Duration;
use tauri::image::Image;
pub use transcription_coordinator::TranscriptionCoordinator;

use tauri::tray::{MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Emitter, Listener, Manager};
use tauri_plugin_autostart::{MacosLauncher, ManagerExt};
use tauri_plugin_log::{Builder as LogBuilder, RotationStrategy, Target, TargetKind};

use crate::settings::get_settings;

// Global atomic to store the file log level filter
// We use u8 to store the log::LevelFilter as a number
pub static FILE_LOG_LEVEL: AtomicU8 = AtomicU8::new(log::LevelFilter::Debug as u8);

fn level_filter_from_u8(value: u8) -> log::LevelFilter {
    match value {
        0 => log::LevelFilter::Off,
        1 => log::LevelFilter::Error,
        2 => log::LevelFilter::Warn,
        3 => log::LevelFilter::Info,
        4 => log::LevelFilter::Debug,
        5 => log::LevelFilter::Trace,
        _ => log::LevelFilter::Trace,
    }
}

fn build_console_filter() -> env_filter::Filter {
    let mut builder = EnvFilterBuilder::new();

    match std::env::var("RUST_LOG") {
        Ok(spec) if !spec.trim().is_empty() => {
            if let Err(err) = builder.try_parse(&spec) {
                log::warn!(
                    "Ignoring invalid RUST_LOG value '{}': {}. Falling back to info-level console logging",
                    spec,
                    err
                );
                builder.filter_level(log::LevelFilter::Info);
            }
        }
        _ => {
            builder.filter_level(log::LevelFilter::Info);
        }
    }

    builder.build()
}

/// How long the settings window keeps its webview alive after being closed to
/// the tray, before it is torn down and rebuilt on the next open.
///
/// The window costs ~110 MB of private memory (plus its share of the shared
/// GPU process) for a webview nobody is looking at, which is most of what a
/// tray-resident VoCript holds. The delay is there so the common
/// close-then-reopen does not pay the rebuild: only really leaving it closed
/// gives the memory back.
const MAIN_WINDOW_REAP_DELAY: Duration = Duration::from_secs(45);

/// Bumped every time the settings window is hidden or shown, so a pending reap
/// can tell whether it is still the one that was scheduled. Without it, closing
/// and immediately reopening would leave a timer that destroys the window the
/// user is looking at.
static MAIN_WINDOW_REAP_GENERATION: AtomicU64 = AtomicU64::new(0);

/// Builds the settings window. Programmatic rather than declared in
/// tauri.conf.json so portable mode can redirect the WebView2 cache, and so it
/// can be rebuilt after a reap (see `MAIN_WINDOW_REAP_DELAY`).
fn build_main_window<M: Manager<tauri::Wry>>(
    manager: &M,
    visible: bool,
) -> tauri::Result<tauri::WebviewWindow> {
    let mut builder =
        tauri::WebviewWindowBuilder::new(manager, "main", tauri::WebviewUrl::App("/".into()))
            .title("VoCript")
            .inner_size(1080.0, 680.0)
            .min_inner_size(960.0, 600.0)
            .resizable(true)
            .maximizable(false)
            .visible(visible);

    if let Some(data_dir) = portable::data_dir() {
        builder = builder.data_directory(data_dir.join("webview"));
    }

    builder.build()
}

/// Destroys the settings window once it has been closed to the tray for
/// `MAIN_WINDOW_REAP_DELAY`, giving its memory back. `show_main_window` builds
/// it again on demand.
fn schedule_main_window_reap(app: &AppHandle) {
    // Without a tray icon the window is the whole app, so releasing it would
    // leave nothing to click. Same rule the startup code already applies when
    // deciding whether `start_hidden` is safe to honour.
    let tray_available = get_settings(app).show_tray_icon && !app.state::<CliArgs>().no_tray;
    if !tray_available {
        return;
    }

    let generation = MAIN_WINDOW_REAP_GENERATION.fetch_add(1, Ordering::SeqCst) + 1;
    let app = app.clone();
    std::thread::spawn(move || {
        std::thread::sleep(MAIN_WINDOW_REAP_DELAY);
        if MAIN_WINDOW_REAP_GENERATION.load(Ordering::SeqCst) != generation {
            return; // Shown (or hidden again) meanwhile — that timer owns it now.
        }
        let Some(window) = app.get_webview_window("main") else {
            return;
        };
        // Last check on the main thread, where a show cannot race us.
        let _ = app.run_on_main_thread(move || {
            if window.is_visible().unwrap_or(true) {
                return;
            }
            match window.destroy() {
                Ok(()) => log::info!(
                    "Settings window released after {MAIN_WINDOW_REAP_DELAY:?} in the tray"
                ),
                Err(e) => log::warn!("Failed to release the settings window: {e}"),
            }
        });
    });
}

pub(crate) fn show_main_window(app: &AppHandle) {
    // Any pending reap is now stale: the user is asking for the window back.
    MAIN_WINDOW_REAP_GENERATION.fetch_add(1, Ordering::SeqCst);

    #[cfg(target_os = "macos")]
    let restore_dock = || {
        if let Err(e) = app.set_activation_policy(tauri::ActivationPolicy::Regular) {
            log::error!("Failed to set activation policy to Regular: {}", e);
        }
    };

    if let Some(main_window) = app.get_webview_window("main") {
        let _ = main_window.unminimize();
        let _ = main_window.show();
        let _ = main_window.set_always_on_top(true);
        let _ = main_window.set_focus();
        let _ = main_window.set_always_on_top(false);
        #[cfg(target_os = "macos")]
        restore_dock();
        return;
    }

    // Reaped while it sat in the tray — build it back.
    //
    // From a worker thread, deliberately. `build()` hands the actual window
    // creation to the event loop and blocks until it is done, so calling it
    // *on* the main thread (which is where a synchronous Tauri command runs)
    // deadlocks: the event loop is busy waiting inside our own call. Both
    // failed attempts looked the same from outside — an about:blank window
    // that never loads and a tray "Settings" click that never returns.
    let app_for_build = app.clone();
    std::thread::spawn(move || {
        // Two shows in quick succession (tray double-click, CLI relaunch) would
        // otherwise both try to claim the "main" label and the loser would log
        // an error for what is really a no-op.
        if app_for_build.get_webview_window("main").is_some() {
            return;
        }
        match build_main_window(&app_for_build, true) {
            Ok(window) => {
                let _ = window.set_focus();
            }
            Err(e) => {
                let labels = app_for_build
                    .webview_windows()
                    .keys()
                    .cloned()
                    .collect::<Vec<_>>();
                log::error!(
                    "Failed to rebuild the settings window: {e}. Webview labels: {labels:?}"
                );
            }
        }
    });

    #[cfg(target_os = "macos")]
    restore_dock();
}

#[allow(unused_variables)]
fn should_force_show_permissions_window(app: &AppHandle) -> bool {
    #[cfg(target_os = "windows")]
    {
        let model_manager = app.state::<Arc<ModelManager>>();
        let has_downloaded_models = model_manager
            .get_available_models()
            .iter()
            .any(|model| model.is_downloaded);

        if !has_downloaded_models {
            return false;
        }

        let status = commands::audio::get_windows_microphone_permission_status();
        if status.supported && status.overall_access == commands::audio::PermissionAccess::Denied {
            log::info!(
                "Windows microphone permissions are denied; forcing main window visible for onboarding"
            );
            return true;
        }
    }

    false
}

/// Log, show a native error dialog, and exit. Used for startup failures that
/// previously panicked: a panic here closes the process with no window at all,
/// which users experience as "the app opens and closes itself".
fn fatal_startup_error(app_handle: &AppHandle, message: &str) -> ! {
    log::error!("Fatal startup error: {}", message);
    use tauri_plugin_dialog::DialogExt;
    app_handle
        .dialog()
        .message(message)
        .kind(tauri_plugin_dialog::MessageDialogKind::Error)
        .title("VoCript")
        .blocking_show();
    std::process::exit(1);
}

fn initialize_core_logic(app_handle: &AppHandle) {
    // Note: Enigo (keyboard/mouse simulation) is NOT initialized here.
    // The frontend is responsible for calling the `initialize_enigo` command
    // after onboarding completes. This avoids triggering permission dialogs
    // on macOS before the user is ready.

    // La migración de datos de la versión antigua (com.muvox.app) ya corrió en
    // `setup`, antes de la primera lectura de ajustes — aquí sería demasiado
    // tarde para los ajustes, aunque llegase a tiempo para los managers.

    // Register the transcribe-cpp compute backends before anything can load a
    // model. In a `dynamic-backends` build nothing — not even plain CPU — is
    // registered until this runs.
    managers::transcription::init_transcribe_backend();

    // Initialize the managers
    let recording_manager = Arc::new(
        AudioRecordingManager::new(app_handle).expect("Failed to initialize recording manager"),
    );
    let model_manager =
        Arc::new(ModelManager::new(app_handle).expect("Failed to initialize model manager"));
    let transcription_manager = Arc::new(
        TranscriptionManager::new(app_handle, model_manager.clone())
            .expect("Failed to initialize transcription manager"),
    );
    // A failed DB open/migration used to be a bare `expect`: the app "opened
    // and closed itself" with exit code 101 and no window (a real incident —
    // e.g. the database left at a NEWER version by a dev build or a rollback).
    // Tell the user what is wrong instead.
    let history_manager = match HistoryManager::new(app_handle) {
        Ok(manager) => Arc::new(manager),
        Err(e) => fatal_startup_error(
            app_handle,
            &format!(
                "VoCript could not open its history database.\n\n\
                 This usually means the data was written by a newer version of \
                 VoCript (after a downgrade), or the file is locked or damaged.\n\n\
                 Details: {}",
                e
            ),
        ),
    };
    // After the history manager: it owns the migrations that create the
    // dictation_stats table in the database both of them share.
    let stats_manager = match StatsManager::new(app_handle) {
        Ok(manager) => Arc::new(manager),
        Err(e) => fatal_startup_error(
            app_handle,
            &format!(
                "VoCript could not open its statistics database.\n\nDetails: {}",
                e
            ),
        ),
    };

    // Apply accelerator preferences before any model loads
    managers::transcription::apply_accelerator_settings(app_handle);

    // Add managers to Tauri's managed state
    app_handle.manage(recording_manager.clone());
    app_handle.manage(model_manager.clone());
    app_handle.manage(transcription_manager.clone());
    app_handle.manage(history_manager.clone());
    app_handle.manage(stats_manager.clone());
    app_handle.manage(live::LiveState::default());
    app_handle.manage(wake_word::WakeWordState::default());
    // Resumes hands-free listening for users who had it on. No-op by default.
    wake_word::sync_with_settings(app_handle);

    // Note: Shortcuts are NOT initialized here.
    // The frontend is responsible for calling the `initialize_shortcuts` command
    // after permissions are confirmed (on macOS) or after onboarding completes.
    // This matches the pattern used for Enigo initialization.

    #[cfg(unix)]
    let signals = Signals::new(&[SIGUSR1, SIGUSR2]).unwrap();
    // Set up signal handlers for toggling transcription
    #[cfg(unix)]
    signal_handle::setup_signal_handler(app_handle.clone(), signals);

    // Apply macOS Accessory policy if starting hidden and tray is available.
    // If the tray icon is disabled, keep the dock icon so the user can reopen.
    #[cfg(target_os = "macos")]
    {
        let settings = settings::get_settings(app_handle);
        if settings.start_hidden && settings.show_tray_icon {
            let _ = app_handle.set_activation_policy(tauri::ActivationPolicy::Accessory);
        }
    }
    // Get the current theme to set the appropriate initial icon
    let initial_theme = tray::get_current_theme(app_handle);

    // Choose the appropriate initial icon based on theme
    let initial_icon_path = tray::get_icon_path(initial_theme, tray::TrayIconState::Idle);

    let tray = TrayIconBuilder::new()
        .icon(
            Image::from_path(
                app_handle
                    .path()
                    .resolve(initial_icon_path, tauri::path::BaseDirectory::Resource)
                    .unwrap(),
            )
            .unwrap(),
        )
        .tooltip(tray::tray_tooltip())
        .icon_as_template(true)
        .show_menu_on_left_click(false)
        // Both clicks open the custom menu window (see tray_menu.rs). The native
        // menu is only assigned as a fallback if that window fails to be created.
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button_state: MouseButtonState::Up,
                position,
                ..
            } = event
            {
                tray_menu::toggle_tray_menu(tray.app_handle(), position);
            }
        })
        .on_menu_event(|app, event| tray::handle_tray_action(app, event.id.as_ref()))
        .build(app_handle)
        .unwrap();
    app_handle.manage(tray);

    // Build the custom menu window before the first update_tray_menu call: that
    // call decides whether to assign the native fallback menu based on whether
    // this window exists.
    tray_menu::create_tray_menu_window(app_handle);

    // Initialize tray menu with idle state
    utils::update_tray_menu(app_handle, &utils::TrayIconState::Idle, None);

    // Apply show_tray_icon setting
    let settings = settings::get_settings(app_handle);
    if !settings.show_tray_icon {
        tray::set_tray_visibility(app_handle, false);
    }

    // Refresh tray menu when model state changes
    let app_handle_for_listener = app_handle.clone();
    app_handle.listen("model-state-changed", move |_| {
        tray::update_tray_menu(&app_handle_for_listener, &tray::TrayIconState::Idle, None);
    });

    // Get the autostart manager and configure based on user setting
    let autostart_manager = app_handle.autolaunch();
    let settings = settings::get_settings(app_handle);

    if settings.autostart_enabled {
        // Enable autostart if user has opted in
        let _ = autostart_manager.enable();
    } else {
        // Disable autostart if user has opted out
        let _ = autostart_manager.disable();
    }

    // Create the recording overlay window (hidden by default)
    utils::create_recording_overlay(app_handle);

    // Ask about new versions from the backend, once a day, with or without a
    // window open. See update_watch.rs for why the frontend check was not enough.
    update_watch::start(app_handle);

    // Leave a trace when updates would install somewhere other than the folder
    // this copy runs from. The user gets stopped with an explanation before any
    // update is applied (see install_check.rs); this line is so a log sent in
    // for support answers the question without anyone having to ask for it.
    if let Some(mismatch) = install_check::detect() {
        log::warn!(
            "Running from {} but updates would install into {}. \
             Every update will appear to work and change nothing.",
            mismatch.running_from,
            mismatch.updates_go_to
        );
    }
}

#[tauri::command]
#[specta::specta]
fn trigger_update_check(app: AppHandle) -> Result<(), String> {
    let settings = settings::get_settings(&app);
    if !settings.update_checks_enabled {
        return Ok(());
    }
    app.emit("check-for-updates", ())
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
#[specta::specta]
fn show_main_window_command(app: AppHandle) -> Result<(), String> {
    show_main_window(&app);
    Ok(())
}

/// Current OS theme ("light"/"dark"). On Windows it reads the registry value
/// `AppsUseLightTheme`, because WebView2 does not reliably expose
/// `prefers-color-scheme`; the frontend uses this to resolve the "system" theme.
#[tauri::command]
#[specta::specta]
fn get_system_theme() -> String {
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        let resolved = match std::process::Command::new("reg")
            .args([
                "query",
                r"HKCU\SOFTWARE\Microsoft\Windows\CurrentVersion\Themes\Personalize",
                "/v",
                "AppsUseLightTheme",
            ])
            .creation_flags(CREATE_NO_WINDOW)
            .output()
        {
            Ok(out) => {
                let stdout = String::from_utf8_lossy(&out.stdout);
                if stdout.contains("0x1") {
                    "light"
                } else {
                    "dark"
                }
            }
            Err(e) => {
                log::warn!("Failed to read system theme from registry: {e}");
                "dark"
            }
        };
        resolved.to_string()
    }
    #[cfg(not(windows))]
    {
        "dark".to_string()
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run(cli_args: CliArgs) {
    // Detect portable mode before anything else
    portable::init();

    // Parse console logging directives from RUST_LOG, falling back to info-level logging
    // when the variable is unset
    let console_filter = build_console_filter();

    let specta_builder = Builder::<tauri::Wry>::new()
        .commands(collect_commands![
            shortcut::change_binding,
            shortcut::reset_binding,
            shortcut::change_ptt_setting,
            shortcut::change_audio_feedback_setting,
            shortcut::change_audio_feedback_volume_setting,
            shortcut::change_sound_theme_setting,
            shortcut::change_start_hidden_setting,
            shortcut::change_autostart_setting,
            shortcut::change_translate_to_english_setting,
            shortcut::change_selected_language_setting,
            shortcut::change_overlay_position_setting,
            shortcut::change_debug_mode_setting,
            shortcut::change_word_correction_threshold_setting,
            shortcut::change_extra_recording_buffer_setting,
            shortcut::change_paste_delay_ms_setting,
            shortcut::change_paste_method_setting,
            shortcut::get_available_typing_tools,
            shortcut::change_typing_tool_setting,
            shortcut::change_external_script_path_setting,
            shortcut::change_clipboard_handling_setting,
            shortcut::change_auto_submit_setting,
            shortcut::change_auto_submit_key_setting,
            shortcut::change_post_process_enabled_setting,
            shortcut::change_experimental_enabled_setting,
            shortcut::change_post_process_base_url_setting,
            shortcut::change_post_process_api_key_setting,
            shortcut::change_post_process_model_setting,
            shortcut::set_post_process_provider,
            shortcut::fetch_post_process_models,
            shortcut::add_post_process_prompt,
            shortcut::update_post_process_prompt,
            shortcut::delete_post_process_prompt,
            shortcut::set_post_process_selected_prompt,
            shortcut::update_custom_words,
            shortcut::update_word_replacements,
            shortcut::update_custom_profile_commands,
            shortcut::suspend_binding,
            shortcut::resume_binding,
            shortcut::set_system_audio_app,
            shortcut::list_system_audio_apps,
            shortcut::change_clipboard_only_setting,
            shortcut::change_live_auto_paste_setting,
            shortcut::change_mute_while_recording_setting,
            shortcut::change_append_trailing_space_setting,
            shortcut::change_app_language_setting,
            shortcut::change_theme_setting,
            shortcut::change_accent_color_setting,
            shortcut::change_accent_tint_surfaces_setting,
            shortcut::change_source_attribution_setting,
            shortcut::change_live_mode_setting,
            shortcut::change_live_mode_system_setting,
            shortcut::change_tour_completed_setting,
            shortcut::change_work_profile_setting,
            shortcut::change_update_checks_setting,
            shortcut::change_dictation_stats_setting,
            shortcut::change_mute_in_calls_setting,
            shortcut::change_wake_word_setting,
            shortcut::change_wake_word_samples_setting,
            wake_word::capture_wake_word_sample,
            wake_word::clear_wake_word_recordings,
            wake_word::count_wake_word_recordings,
            shortcut::send_call_mute_key,
            shortcut::change_ui_font_setting,
            shortcut::change_ui_font_size_setting,
            shortcut::change_keyboard_implementation_setting,
            shortcut::get_keyboard_implementation,
            shortcut::change_show_tray_icon_setting,
            shortcut::change_whisper_accelerator_setting,
            shortcut::change_ort_accelerator_setting,
            shortcut::change_whisper_gpu_device,
            shortcut::get_available_accelerators,
            shortcut::handy_keys::start_handy_keys_recording,
            shortcut::handy_keys::stop_handy_keys_recording,
            trigger_update_check,
            show_main_window_command,
            commands::cancel_operation,
            commands::is_portable,
            commands::is_packaged,
            commands::install_location_mismatch,
            commands::install_paths,
            commands::get_app_dir_path,
            commands::get_app_settings,
            commands::get_default_settings,
            commands::get_log_dir_path,
            commands::set_log_level,
            commands::open_recordings_folder,
            commands::open_log_dir,
            commands::open_app_data_dir,
            commands::check_apple_intelligence_available,
            commands::detect_local_post_process_provider,
            commands::initialize_enigo,
            commands::initialize_shortcuts,
            commands::models::get_available_models,
            commands::models::get_model_info,
            commands::models::download_model,
            commands::models::delete_model,
            commands::models::cancel_download,
            commands::models::set_active_model,
            commands::models::get_current_model,
            commands::models::get_transcription_model_status,
            commands::models::is_model_loading,
            commands::models::has_any_models_available,
            commands::models::has_any_models_or_downloads,
            commands::models::import_model_from_path,
            tray::get_tray_menu_state,
            tray::tray_menu_action,
            tray_menu::resize_tray_menu,
            commands::models::scan_for_external_models,
            commands::audio::update_microphone_mode,
            commands::audio::get_microphone_mode,
            commands::audio::get_windows_microphone_permission_status,
            commands::audio::open_microphone_privacy_settings,
            commands::audio::get_available_microphones,
            commands::audio::set_selected_microphone,
            commands::audio::get_selected_microphone,
            commands::audio::get_available_output_devices,
            commands::audio::set_selected_output_device,
            commands::audio::get_selected_output_device,
            commands::audio::play_test_sound,
            commands::audio::check_custom_sounds,
            commands::audio::set_clamshell_microphone,
            commands::audio::get_clamshell_microphone,
            commands::audio::is_recording,
            commands::transcription::set_model_unload_timeout,
            commands::transcription::get_model_load_status,
            commands::transcription::unload_model_manually,
            commands::transcription::transcribe_file,
            commands::transcription::save_text_file,
            commands::transcription::read_text_file,
            commands::history::get_history_entries,
            commands::history::toggle_history_entry_saved,
            commands::history::get_audio_file_path,
            commands::history::get_audio_file_data,
            commands::history::delete_history_entry,
            commands::history::retry_history_entry_transcription,
            commands::history::update_history_limit,
            commands::history::update_recording_retention_period,
            commands::stats::get_dictation_stats,
            commands::stats::reset_dictation_stats,
            commands::stats::get_typing_wpm_baseline,
            fonts::get_system_fonts,
            helpers::clamshell::is_laptop,
            get_system_theme,
            overlay::reset_overlay_position,
            overlay::has_custom_overlay_position,
            pro::pro_is_available,
            pro::pro_license_status,
            pro::pro_activate_license,
            pro::pro_deactivate_license,
            pro::pro_read_region,
            pro::pro_read_aloud,
            pro::pro_pick_region,
            pro::pro_read_aloud_pick,
            pro::pro_has_voice,
            pro::pro_read_aloud_screen,
            pro::pro_read_aloud_again,
            pro::pro_can_repeat,
            pro::pro_pause_speaking,
            pro::pro_resume_speaking,
            pro::pro_get_hotkey,
            pro::pro_set_hotkey,
            pro::pro_stop_speaking,
            pro::pro_agent_see,
            pro::pro_agent_do,
        ])
        .events(collect_events![managers::history::HistoryUpdatePayload,]);

    #[cfg(debug_assertions)] // <- Only export on non-release builds
    specta_builder
        .export(
            Typescript::default().bigint(BigIntExportBehavior::Number),
            "../src/bindings.ts",
        )
        .expect("Failed to export typescript bindings");

    let invoke_handler = specta_builder.invoke_handler();

    #[allow(unused_mut)]
    let mut builder = tauri::Builder::default()
        .device_event_filter(tauri::DeviceEventFilter::Always)
        .plugin(tauri_plugin_dialog::init())
        .plugin(
            LogBuilder::new()
                .level(log::LevelFilter::Trace) // Set to most verbose level globally
                .max_file_size(500_000)
                .rotation_strategy(RotationStrategy::KeepOne)
                .clear_targets()
                .targets([
                    // Console output respects RUST_LOG environment variable
                    Target::new(TargetKind::Stdout).filter({
                        let console_filter = console_filter.clone();
                        move |metadata| console_filter.enabled(metadata)
                    }),
                    // File logs respect the user's settings (stored in FILE_LOG_LEVEL atomic)
                    Target::new(if let Some(data_dir) = portable::data_dir() {
                        TargetKind::Folder {
                            path: data_dir.join("logs"),
                            file_name: Some("vocript".into()),
                        }
                    } else {
                        TargetKind::LogDir {
                            file_name: Some("vocript".into()),
                        }
                    })
                    .filter(|metadata| {
                        let file_level = FILE_LOG_LEVEL.load(Ordering::Relaxed);
                        metadata.level() <= level_filter_from_u8(file_level)
                    }),
                ])
                .build(),
        );

    #[cfg(target_os = "macos")]
    {
        builder = builder.plugin(tauri_nspanel::init());
    }

    builder
        .plugin(tauri_plugin_single_instance::init(|app, args, _cwd| {
            if args.iter().any(|a| a == "--toggle-transcription") {
                signal_handle::send_transcription_input(app, "transcribe", "CLI");
            } else if args.iter().any(|a| a == "--toggle-post-process") {
                signal_handle::send_transcription_input(app, "transcribe_with_post_process", "CLI");
            } else if args.iter().any(|a| a == "--cancel") {
                crate::utils::cancel_current_operation(app);
            } else {
                show_main_window(app);
            }
        }))
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_os::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_macos_permissions::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_autostart::init(
            MacosLauncher::LaunchAgent,
            Some(vec![]),
        ))
        .manage(cli_args.clone())
        .setup(move |app| {
            specta_builder.mount_events(app);

            build_main_window(app, false)?;

            // Migrate a pre-rebrand (com.muvox.app) install BEFORE anything
            // reads the settings store. The store plugin caches its file per
            // path and never re-reads it, so the first get_settings() below
            // used to load defaults, cache them and schedule an auto-save that
            // overwrote the settings file the migration had just moved into
            // place — everyone upgrading from <= v2.2.4 kept their models and
            // history but silently lost every preference.
            portable::migrate_legacy_identifier_data(app.handle());

            let mut settings = get_settings(app.handle());

            // CLI --debug flag overrides debug_mode and log level (runtime-only, not persisted)
            if cli_args.debug {
                settings.debug_mode = true;
                settings.log_level = settings::LogLevel::Trace;
            }

            let tauri_log_level: tauri_plugin_log::LogLevel = settings.log_level.into();
            let file_log_level: log::Level = tauri_log_level.into();
            // Store the file log level in the atomic for the filter to use
            FILE_LOG_LEVEL.store(file_log_level.to_level_filter() as u8, Ordering::Relaxed);
            let app_handle = app.handle().clone();
            app.manage(TranscriptionCoordinator::new(app_handle.clone()));

            initialize_core_logic(&app_handle);

            // Pre-warm GPU/accelerator enumeration on a background thread.
            // The first call into transcribe_rs::whisper_cpp::gpu::list_gpu_devices
            // loads the Metal/Vulkan backend and probes devices, which can take
            // several seconds. Without this, that cost is paid synchronously the
            // first time the user opens the Advanced settings page (which calls
            // the get_available_accelerators command), causing a UI freeze.
            // Result is cached in a OnceLock inside the transcription manager.
            std::thread::spawn(|| {
                let _ = crate::managers::transcription::get_available_accelerators();
            });

            // Hide tray icon if --no-tray was passed
            if cli_args.no_tray {
                tray::set_tray_visibility(&app_handle, false);
            }

            // Show main window only if not starting hidden.
            // CLI --start-hidden flag overrides the setting.
            // But if permission onboarding is required, always show the window.
            let should_hide = settings.start_hidden || cli_args.start_hidden;
            let should_force_show = should_force_show_permissions_window(&app_handle);

            // If start_hidden but tray is disabled, we must show the window
            // anyway. Without a tray icon, the dock is the only way back in.
            let tray_available = settings.show_tray_icon && !cli_args.no_tray;
            if should_force_show || !should_hide || !tray_available {
                show_main_window(&app_handle);
            }

            // VoCript Pro. En la edición gratuita esto no hace nada.
            pro::al_arrancar(&app_handle);

            Ok(())
        })
        .on_window_event(|window, event| match event {
            tauri::WindowEvent::CloseRequested { api, .. } => {
                api.prevent_close();
                let _res = window.hide();

                // Closing to the tray is the one moment we know the settings
                // window is not wanted, so that is when its webview is queued
                // for release (see MAIN_WINDOW_REAP_DELAY).
                if window.label() == "main" {
                    schedule_main_window_reap(window.app_handle());
                }

                #[cfg(target_os = "macos")]
                {
                    let settings = get_settings(&window.app_handle());
                    let tray_visible =
                        settings.show_tray_icon && !window.app_handle().state::<CliArgs>().no_tray;
                    if tray_visible {
                        // Tray is available: hide the dock icon, app lives in the tray
                        let res = window
                            .app_handle()
                            .set_activation_policy(tauri::ActivationPolicy::Accessory);
                        if let Err(e) = res {
                            log::error!("Failed to set activation policy: {}", e);
                        }
                    }
                    // No tray: keep the dock icon visible so the user can reopen
                }
            }
            tauri::WindowEvent::ThemeChanged(theme) => {
                log::info!("Theme changed to: {:?}", theme);
                // Update tray icon to match new theme, maintaining idle state
                utils::change_tray_icon(window.app_handle(), utils::TrayIconState::Idle);
            }
            _ => {}
        })
        .invoke_handler(invoke_handler)
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app, event| {
            #[cfg(target_os = "macos")]
            if let tauri::RunEvent::Reopen { .. } = &event {
                show_main_window(app);
            }
            let _ = (app, event); // suppress unused warnings on non-macOS
        });
}
