use crate::input;
use crate::settings;
use crate::settings::{OverlayCustomPosition, OverlayPosition};
use std::sync::atomic::{AtomicBool, AtomicI32, AtomicU64, Ordering};
use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager, PhysicalPosition, PhysicalSize};

#[cfg(not(target_os = "macos"))]
use log::debug;

#[cfg(not(target_os = "macos"))]
use tauri::WebviewWindowBuilder;

#[cfg(target_os = "macos")]
use tauri::WebviewUrl;

#[cfg(target_os = "macos")]
use tauri_nspanel::{tauri_panel, CollectionBehavior, PanelBuilder, PanelLevel};

#[cfg(target_os = "linux")]
use gtk_layer_shell::{Edge, KeyboardMode, Layer, LayerShell};

#[cfg(target_os = "linux")]
use std::env;

#[cfg(target_os = "macos")]
tauri_panel! {
    panel!(RecordingOverlayPanel {
        config: {
            can_become_key_window: false,
            is_floating_panel: true
        }
    })
}

// Fallback/initial size only — every state show_overlay_state() actually
// displays picks its own size below (RECORDING_/STATUS_OVERLAY_*).
const OVERLAY_WIDTH: f64 = 172.0;
const OVERLAY_HEIGHT: f64 = 36.0;

// The plain "recording" capsule only shows the logo + level bars + cancel
// button (no text label), so it can be smaller than the transcribing/
// processing/copied states that share this same window and need room for text.
const RECORDING_OVERLAY_WIDTH: f64 = 120.0;
const RECORDING_OVERLAY_HEIGHT: f64 = 36.0;

// "Transcribing…"/"Processing…"/"Copied" status: logo + one short label, no
// cancel button — smaller than the old shared 172x36, though a little wider
// than RECORDING_OVERLAY_WIDTH since the label needs more room than the
// bars did. The longest translations of the label ellipsize (see
// RecordingOverlay.css) rather than forcing this wider still.
const STATUS_OVERLAY_WIDTH: f64 = 132.0;
const STATUS_OVERLAY_HEIGHT: f64 = 32.0;

/// Set right before every `set_position` call this module makes, so the
/// `Moved` event it triggers is not mistaken for the user dragging the
/// window — which would immediately "save" our own automatic placement as a
/// custom one, permanently overriding `overlay_position` after the very
/// first time the overlay was ever shown.
static IGNORE_NEXT_MOVE: AtomicBool = AtomicBool::new(false);

/// Bumped on every un-ignored `Moved` event, so the debounce below can tell
/// "the drag is still going" from "that was the last move" without polling.
static MOVE_GENERATION: AtomicU64 = AtomicU64::new(0);

/// Whether a settle-watcher thread is already running for the current drag
/// (see `register_drag_persistence`) — caps it at one thread per gesture
/// instead of one per `Moved` event.
static DRAG_SETTLE_PENDING: AtomicBool = AtomicBool::new(false);

/// The most recent position reported by a `Moved` event, kept outside the
/// event closure so the settle-watcher thread can read the final position
/// once the drag stops rather than the one that happened to start it.
static LAST_MOVE_X: AtomicI32 = AtomicI32::new(0);
static LAST_MOVE_Y: AtomicI32 = AtomicI32::new(0);

/// How long the overlay must sit still before a drag is written to disk. The
/// OS reports a `Moved` event on nearly every pixel of a native drag; writing
/// settings that often would thrash the disk for no benefit, since only the
/// final position matters.
const DRAG_SETTLE: Duration = Duration::from_millis(250);

/// Safety net for [`IGNORE_NEXT_MOVE`]: if the platform never fires a `Moved`
/// event for this position change (observed for windows repositioned while
/// still hidden), the flag would otherwise stay stuck and silently swallow
/// the *next* genuine drag.
const IGNORE_FLAG_TIMEOUT: Duration = Duration::from_millis(400);

// Live-transcription mode uses a wider, taller capsule (logo + text bubble).
const LIVE_OVERLAY_WIDTH: f64 = 560.0;
const LIVE_OVERLAY_HEIGHT: f64 = 100.0;

#[cfg(target_os = "macos")]
const OVERLAY_TOP_OFFSET: f64 = 46.0;
#[cfg(any(target_os = "windows", target_os = "linux"))]
const OVERLAY_TOP_OFFSET: f64 = 4.0;

#[cfg(target_os = "macos")]
const OVERLAY_BOTTOM_OFFSET: f64 = 15.0;

#[cfg(any(target_os = "windows", target_os = "linux"))]
const OVERLAY_BOTTOM_OFFSET: f64 = 40.0;

#[cfg(target_os = "linux")]
fn update_gtk_layer_shell_anchors(overlay_window: &tauri::webview::WebviewWindow) {
    let window_clone = overlay_window.clone();
    let _ = overlay_window.run_on_main_thread(move || {
        // Try to get the GTK window from the Tauri webview
        if let Ok(gtk_window) = window_clone.gtk_window() {
            let settings = settings::get_settings(window_clone.app_handle());
            match settings.overlay_position {
                OverlayPosition::Top => {
                    gtk_window.set_anchor(Edge::Top, true);
                    gtk_window.set_anchor(Edge::Bottom, false);
                }
                OverlayPosition::Bottom | OverlayPosition::None => {
                    gtk_window.set_anchor(Edge::Bottom, true);
                    gtk_window.set_anchor(Edge::Top, false);
                }
            }
        }
    });
}

/// Returns true when the environment variable is set to a truthy value
/// (e.g. "1", "true", "yes", "on").
/// "0", "false", "no", "off" and empty string are treated as falsy (case-insensitive).
/// Returns false when the variable is not set.
#[cfg(target_os = "linux")]
fn env_flag_enabled(name: &str) -> bool {
    match env::var(name) {
        Ok(v) => !matches!(
            v.trim().to_ascii_lowercase().as_str(),
            "" | "0" | "false" | "no" | "off"
        ),
        Err(_) => false,
    }
}

/// Initializes GTK layer shell for Linux overlay window
/// Returns true if layer shell was successfully initialized, false otherwise
#[cfg(target_os = "linux")]
fn init_gtk_layer_shell(overlay_window: &tauri::webview::WebviewWindow) -> bool {
    if env_flag_enabled("HANDY_NO_GTK_LAYER_SHELL") {
        debug!("Skipping GTK layer shell init (HANDY_NO_GTK_LAYER_SHELL is enabled)");
        return false;
    }

    if !gtk_layer_shell::is_supported() {
        return false;
    }

    // Try to get the GTK window from the Tauri webview
    if let Ok(gtk_window) = overlay_window.gtk_window() {
        // Initialize layer shell
        gtk_window.init_layer_shell();
        gtk_window.set_layer(Layer::Overlay);
        gtk_window.set_keyboard_mode(KeyboardMode::None);
        gtk_window.set_exclusive_zone(0);

        update_gtk_layer_shell_anchors(overlay_window);

        return true;
    }
    false
}

/// Forces a window to be topmost using Win32 API (Windows only)
/// This is more reliable than Tauri's set_always_on_top which can be overridden
#[cfg(target_os = "windows")]
fn force_overlay_topmost(overlay_window: &tauri::webview::WebviewWindow) {
    use windows::Win32::UI::WindowsAndMessaging::{
        SetWindowPos, HWND_TOPMOST, SWP_NOACTIVATE, SWP_NOMOVE, SWP_NOSIZE, SWP_SHOWWINDOW,
    };

    // Clone because run_on_main_thread takes 'static
    let overlay_clone = overlay_window.clone();

    // Make sure the Win32 call happens on the UI thread
    let _ = overlay_clone.clone().run_on_main_thread(move || {
        if let Ok(hwnd) = overlay_clone.hwnd() {
            unsafe {
                // Force Z-order: make this window topmost without changing size/pos or stealing focus
                let _ = SetWindowPos(
                    hwnd,
                    Some(HWND_TOPMOST),
                    0,
                    0,
                    0,
                    0,
                    SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE | SWP_SHOWWINDOW,
                );
            }
        }
    });
}

fn get_monitor_with_cursor(app_handle: &AppHandle) -> Option<tauri::Monitor> {
    if let Some(mouse_location) = input::get_cursor_position(app_handle) {
        if let Ok(monitors) = app_handle.available_monitors() {
            for monitor in monitors {
                // Tauri's monitor position/size are physical pixels, but enigo
                // may return logical coordinates (confirmed on macOS via
                // NSEvent::mouseLocation; on Windows, GetCursorPos behavior
                // depends on the process DPI-awareness context). Dividing by
                // scale_factor normalizes to logical, which is safe regardless:
                // if enigo returns logical it matches directly, and if it returns
                // physical on a scale=1 monitor the division is a no-op.
                let scale = monitor.scale_factor();
                let pos = PhysicalPosition::new(
                    (monitor.position().x as f64 / scale) as i32,
                    (monitor.position().y as f64 / scale) as i32,
                );
                let size = PhysicalSize::new(
                    (monitor.size().width as f64 / scale) as u32,
                    (monitor.size().height as f64 / scale) as u32,
                );
                if is_mouse_within_monitor(mouse_location, &pos, &size) {
                    return Some(monitor);
                }
            }
        }
    }

    app_handle.primary_monitor().ok().flatten()
}

fn is_mouse_within_monitor(
    mouse_pos: (i32, i32),
    monitor_pos: &PhysicalPosition<i32>,
    monitor_size: &PhysicalSize<u32>,
) -> bool {
    let (mouse_x, mouse_y) = mouse_pos;
    let PhysicalPosition {
        x: monitor_x,
        y: monitor_y,
    } = *monitor_pos;
    let PhysicalSize {
        width: monitor_width,
        height: monitor_height,
    } = *monitor_size;

    mouse_x >= monitor_x
        && mouse_x < (monitor_x + monitor_width as i32)
        && mouse_y >= monitor_y
        && mouse_y < (monitor_y + monitor_height as i32)
}

/// On Windows, find the monitor that contains the foreground (focused) window.
/// This is where the user is actually typing, which is far more reliable than
/// the mouse cursor for placing the overlay on multi-monitor setups: the mouse
/// may sit on a different screen than the text field being dictated into.
#[cfg(target_os = "windows")]
fn get_monitor_with_foreground_window(app_handle: &AppHandle) -> Option<tauri::Monitor> {
    use windows::Win32::Graphics::Gdi::{
        GetMonitorInfoW, MonitorFromWindow, MONITORINFO, MONITOR_DEFAULTTONEAREST,
    };
    use windows::Win32::UI::WindowsAndMessaging::GetForegroundWindow;

    let rect = unsafe {
        let hwnd = GetForegroundWindow();
        if hwnd.0.is_null() {
            return None;
        }
        // Let Windows resolve the monitor instead of testing the window's centre
        // ourselves: MONITOR_DEFAULTTONEAREST always yields a monitor, so a window
        // straddling two screens — or sitting in a gap of the virtual desktop left
        // by screens of different heights — no longer falls through to the cursor
        // path and, from there, to the primary monitor.
        let hmonitor = MonitorFromWindow(hwnd, MONITOR_DEFAULTTONEAREST);
        let mut info = MONITORINFO {
            cbSize: std::mem::size_of::<MONITORINFO>() as u32,
            ..Default::default()
        };
        if !GetMonitorInfoW(hmonitor, &mut info).as_bool() {
            return None;
        }
        info.rcMonitor
    };

    // GetMonitorInfoW and Tauri report monitors in the same physical
    // virtual-desktop coordinates, so the top-left corner identifies the screen.
    let monitors = app_handle.available_monitors().ok()?;
    monitors
        .iter()
        .find(|m| m.position().x == rect.left && m.position().y == rect.top)
        .or_else(|| {
            // Defensive: if no origin matches exactly, fall back to whichever
            // Tauri monitor contains the centre of the resolved screen.
            let center_x = (rect.left + rect.right) / 2;
            let center_y = (rect.top + rect.bottom) / 2;
            monitors.iter().find(|m| {
                let pos = m.position();
                let size = m.size();
                center_x >= pos.x
                    && center_x < pos.x + size.width as i32
                    && center_y >= pos.y
                    && center_y < pos.y + size.height as i32
            })
        })
        .cloned()
}

/// Returns the monitor where the overlay should appear. On Windows we prefer the
/// monitor holding the focused window (where the user is typing); otherwise we
/// fall back to the monitor under the mouse cursor.
fn get_target_monitor(app_handle: &AppHandle) -> Option<tauri::Monitor> {
    #[cfg(target_os = "windows")]
    {
        if let Some(monitor) = get_monitor_with_foreground_window(app_handle) {
            return Some(monitor);
        }
    }
    get_monitor_with_cursor(app_handle)
}

/// Returns the position where the overlay window should be placed, ready to
/// hand to Tauri.
///
/// Uses monitor position/size directly rather than work_area(), which can
/// return incorrect coordinates on macOS for monitors with negative positions.
/// The per-platform OVERLAY_TOP_OFFSET / OVERLAY_BOTTOM_OFFSET constants
/// already account for system chrome (menu bar, taskbar).
///
/// The geometry is computed in the target monitor's *physical* pixels, then:
///
/// - On Windows it is returned as a PhysicalPosition and applied as-is. A
///   LogicalPosition would be converted by tao using the scale factor of the
///   monitor the window is *currently* on rather than the one it is moving to,
///   so on a mixed-DPI multi-monitor setup (a 150% laptop screen next to 100%
///   externals) the coordinates were scaled by the wrong factor and the overlay
///   landed on the wrong screen.
/// - Elsewhere it is converted back to logical units (points on macOS), which
///   is what those platforms expect.
fn calculate_overlay_position_sized(
    app_handle: &AppHandle,
    width: f64,
    height: f64,
) -> Option<tauri::Position> {
    let monitor = get_target_monitor(app_handle)?;
    let scale = monitor.scale_factor();
    let monitor_x = monitor.position().x as f64;
    let monitor_y = monitor.position().y as f64;
    let monitor_width = monitor.size().width as f64;
    let monitor_height = monitor.size().height as f64;

    // The overlay's size and offsets are logical, so scale them to the target
    // monitor's DPI to centre it correctly there.
    let overlay_width = width * scale;
    let overlay_height = height * scale;

    let settings = settings::get_settings(app_handle);

    let x = monitor_x + (monitor_width - overlay_width) / 2.0;
    let y = match settings.overlay_position {
        OverlayPosition::Top => monitor_y + OVERLAY_TOP_OFFSET * scale,
        OverlayPosition::Bottom | OverlayPosition::None => {
            monitor_y + monitor_height - overlay_height - OVERLAY_BOTTOM_OFFSET * scale
        }
    };

    #[cfg(target_os = "windows")]
    let position = tauri::Position::Physical(PhysicalPosition {
        x: x.round() as i32,
        y: y.round() as i32,
    });
    #[cfg(not(target_os = "windows"))]
    let position = tauri::Position::Logical(tauri::LogicalPosition {
        x: x / scale,
        y: y / scale,
    });

    Some(position)
}

/// The overlay window's current logical size, read straight from the OS
/// rather than assumed, since the window is resized in place between the
/// compact "recording" capsule, the normal text states and the live capsule.
/// `None` before the window exists yet (first call, during creation).
fn current_overlay_logical_size(app_handle: &AppHandle) -> Option<(f64, f64)> {
    let window = app_handle.get_webview_window("recording_overlay")?;
    let scale = window.scale_factor().ok()?;
    let size = window.inner_size().ok()?;
    Some((size.width as f64 / scale, size.height as f64 / scale))
}

fn calculate_overlay_position(app_handle: &AppHandle) -> Option<tauri::Position> {
    let (width, height) =
        current_overlay_logical_size(app_handle).unwrap_or((OVERLAY_WIDTH, OVERLAY_HEIGHT));
    resolved_overlay_position(app_handle, width, height)
}

/// The saved position from the user dragging the overlay, converted to
/// whatever `Position` variant this platform's `set_position` expects.
///
/// `WindowEvent::Moved` always reports physical pixels, so that is what gets
/// saved; only the *type* needs adjusting here, not the numbers. On Windows a
/// `Physical` position is applied as-is. Elsewhere it is converted to logical
/// units using whichever monitor the point now falls on — it may not be the
/// monitor it was dragged on, if that display was unplugged since.
fn custom_overlay_position(app_handle: &AppHandle) -> Option<tauri::Position> {
    let saved = settings::get_settings(app_handle).overlay_custom_position?;

    #[cfg(target_os = "windows")]
    {
        Some(tauri::Position::Physical(PhysicalPosition {
            x: saved.x,
            y: saved.y,
        }))
    }
    #[cfg(not(target_os = "windows"))]
    {
        let scale = app_handle
            .available_monitors()
            .ok()
            .into_iter()
            .flatten()
            .find(|m| is_mouse_within_monitor((saved.x, saved.y), &m.position(), &m.size()))
            .map(|m| m.scale_factor())
            .unwrap_or(1.0);
        Some(tauri::Position::Logical(tauri::LogicalPosition {
            x: saved.x as f64 / scale,
            y: saved.y as f64 / scale,
        }))
    }
}

/// Where the overlay should sit right now: the user's own saved spot if they
/// have ever dragged it, otherwise today's automatic monitor-following one.
fn resolved_overlay_position(
    app_handle: &AppHandle,
    width: f64,
    height: f64,
) -> Option<tauri::Position> {
    custom_overlay_position(app_handle)
        .or_else(|| calculate_overlay_position_sized(app_handle, width, height))
}

/// Moves the overlay and marks the resulting `Moved` event as ours, not a
/// user drag. Every programmatic reposition in this module must go through
/// this — a raw `set_position` call would be indistinguishable from a drag
/// and get "saved" as a custom position the user never chose.
fn set_overlay_position_programmatic(window: &tauri::WebviewWindow, position: tauri::Position) {
    IGNORE_NEXT_MOVE.store(true, Ordering::SeqCst);
    let _ = window.set_position(position);
    std::thread::spawn(|| {
        std::thread::sleep(IGNORE_FLAG_TIMEOUT);
        IGNORE_NEXT_MOVE.store(false, Ordering::SeqCst);
    });
}

/// Watches the overlay window for the user dragging it, and remembers where
/// they left it. Registered once, right after the window is created.
fn register_drag_persistence(app_handle: &AppHandle) {
    let Some(window) = app_handle.get_webview_window("recording_overlay") else {
        return;
    };
    let app_handle = app_handle.clone();
    window.on_window_event(move |event| {
        let tauri::WindowEvent::Moved(position) = event else {
            return;
        };
        if IGNORE_NEXT_MOVE.swap(false, Ordering::SeqCst) {
            return;
        }
        MOVE_GENERATION.fetch_add(1, Ordering::SeqCst);
        LAST_MOVE_X.store(position.x, Ordering::SeqCst);
        LAST_MOVE_Y.store(position.y, Ordering::SeqCst);

        // The OS fires a `Moved` event on nearly every pixel of a native
        // drag. Spawning an OS thread per event (as this used to do) added
        // enough thread-creation overhead during the drag itself to make the
        // capsule feel less smooth while being dragged. Instead, only one
        // "settle watcher" thread runs per drag gesture: it re-checks the
        // generation counter after each sleep and keeps waiting as long as
        // new moves keep landing, then writes only the final position once
        // the drag actually stops.
        if DRAG_SETTLE_PENDING.swap(true, Ordering::SeqCst) {
            return;
        }
        let app_handle = app_handle.clone();
        std::thread::spawn(move || {
            loop {
                let generation_before = MOVE_GENERATION.load(Ordering::SeqCst);
                std::thread::sleep(DRAG_SETTLE);
                if MOVE_GENERATION.load(Ordering::SeqCst) == generation_before {
                    break;
                }
            }
            DRAG_SETTLE_PENDING.store(false, Ordering::SeqCst);
            let (x, y) = (
                LAST_MOVE_X.load(Ordering::SeqCst),
                LAST_MOVE_Y.load(Ordering::SeqCst),
            );
            let mut settings = settings::get_settings(&app_handle);
            settings.overlay_custom_position = Some(OverlayCustomPosition { x, y });
            settings::write_settings(&app_handle, settings);
            log::debug!("Overlay dragged by the user; remembering position ({x}, {y})");
        });
    });
}

/// Forgets the dragged position, so the overlay goes back to following
/// `overlay_position` (top/bottom, tracking the active monitor) on its own.
#[tauri::command]
#[specta::specta]
pub fn reset_overlay_position(app: AppHandle) -> Result<(), String> {
    let mut settings = settings::get_settings(&app);
    settings.overlay_custom_position = None;
    settings::write_settings(&app, settings);
    update_overlay_position(&app);
    Ok(())
}

/// Whether the overlay has ever been dragged, for the settings screen to show
/// (or hide) the "reset position" action.
#[tauri::command]
#[specta::specta]
pub fn has_custom_overlay_position(app: AppHandle) -> bool {
    settings::get_settings(&app)
        .overlay_custom_position
        .is_some()
}

/// Creates the recording overlay window and keeps it hidden by default
#[cfg(not(target_os = "macos"))]
pub fn create_recording_overlay(app_handle: &AppHandle) {
    // On Linux (Wayland), monitor detection often fails, but we don't need exact coordinates
    // for Layer Shell as we use anchors. On other platforms, we require a monitor.
    #[cfg(not(target_os = "linux"))]
    {
        let position = calculate_overlay_position(app_handle);
        if position.is_none() {
            debug!("Failed to determine overlay position, not creating overlay window");
            return;
        }
    }

    // Position starts unset — update_overlay_position() sets the correct
    // LogicalPosition before the overlay is shown.
    let mut builder = WebviewWindowBuilder::new(
        app_handle,
        "recording_overlay",
        tauri::WebviewUrl::App("src/overlay/index.html".into()),
    )
    .title("Recording")
    .resizable(false)
    .inner_size(OVERLAY_WIDTH, OVERLAY_HEIGHT)
    .shadow(false)
    .maximizable(false)
    .minimizable(false)
    .closable(false)
    .accept_first_mouse(true)
    .decorations(false)
    .always_on_top(true)
    .skip_taskbar(true)
    .transparent(true)
    .focused(false)
    .visible(false);

    if let Some(data_dir) = crate::portable::data_dir() {
        builder = builder.data_directory(data_dir.join("webview"));
    }

    #[allow(unused_variables)]
    match builder.build() {
        Ok(window) => {
            #[cfg(target_os = "linux")]
            {
                // Try to initialize GTK layer shell, ignore errors if compositor doesn't support it
                if init_gtk_layer_shell(&window) {
                    debug!("GTK layer shell initialized for overlay window");
                } else {
                    debug!("GTK layer shell not available, falling back to regular window");
                }
            }

            register_drag_persistence(app_handle);
            debug!("Recording overlay window created successfully (hidden)");
        }
        Err(e) => {
            debug!("Failed to create recording overlay window: {}", e);
        }
    }
}

/// Creates the recording overlay panel and keeps it hidden by default (macOS)
#[cfg(target_os = "macos")]
pub fn create_recording_overlay(app_handle: &AppHandle) {
    if let Some(position) = calculate_overlay_position(app_handle) {
        // PanelBuilder creates a Tauri window then converts it to NSPanel.
        // The window remains registered, so get_webview_window() still works.
        match PanelBuilder::<_, RecordingOverlayPanel>::new(app_handle, "recording_overlay")
            .url(WebviewUrl::App("src/overlay/index.html".into()))
            .title("Recording")
            .position(position)
            .level(PanelLevel::Status)
            .size(tauri::Size::Logical(tauri::LogicalSize {
                width: OVERLAY_WIDTH,
                height: OVERLAY_HEIGHT,
            }))
            .has_shadow(false)
            .transparent(true)
            .no_activate(true)
            .corner_radius(0.0)
            .with_window(|w| w.decorations(false).transparent(true))
            .collection_behavior(
                CollectionBehavior::new()
                    .can_join_all_spaces()
                    .full_screen_auxiliary(),
            )
            .build()
        {
            Ok(panel) => {
                let _ = panel.hide();
                register_drag_persistence(app_handle);
            }
            Err(e) => {
                log::error!("Failed to create recording overlay panel: {}", e);
            }
        }
    }
}

fn show_overlay_state(app_handle: &AppHandle, state: &str) {
    // Check if overlay should be shown based on position setting
    let settings = settings::get_settings(app_handle);
    if settings.overlay_position == OverlayPosition::None {
        return;
    }

    // Reset to this state's size in case a previous live session (or either
    // of the other compact sizes below) left the window a different size.
    let (width, height) = match state {
        "recording" => (RECORDING_OVERLAY_WIDTH, RECORDING_OVERLAY_HEIGHT),
        _ => (STATUS_OVERLAY_WIDTH, STATUS_OVERLAY_HEIGHT),
    };
    if let Some(overlay_window) = app_handle.get_webview_window("recording_overlay") {
        let _ = overlay_window.set_size(tauri::Size::Logical(tauri::LogicalSize {
            width,
            height,
        }));

        #[cfg(target_os = "linux")]
        update_gtk_layer_shell_anchors(&overlay_window);

        if let Some(position) = resolved_overlay_position(app_handle, width, height) {
            set_overlay_position_programmatic(&overlay_window, position);
        }

        let _ = overlay_window.show();

        // On Windows, aggressively re-assert "topmost" in the native Z-order after showing
        #[cfg(target_os = "windows")]
        force_overlay_topmost(&overlay_window);

        let _ = overlay_window.emit("show-overlay", state);
    }
}

/// Shows the recording overlay window with fade-in animation
pub fn show_recording_overlay(app_handle: &AppHandle) {
    show_overlay_state(app_handle, "recording");
}

/// Shows the transcribing overlay window
pub fn show_transcribing_overlay(app_handle: &AppHandle) {
    show_overlay_state(app_handle, "transcribing");
}

/// Shows the processing overlay window
pub fn show_processing_overlay(app_handle: &AppHandle) {
    show_overlay_state(app_handle, "processing");
}

/// Shows the "copied to clipboard" confirmation in the overlay.
pub fn show_copied_overlay(app_handle: &AppHandle) {
    show_overlay_state(app_handle, "copied");
}

/// Shows the live-transcription capsule: a wider/taller overlay that displays
/// the text as it is recognised. Resizes the overlay window accordingly.
pub fn show_live_overlay(app_handle: &AppHandle) {
    let settings = settings::get_settings(app_handle);
    if settings.overlay_position == OverlayPosition::None {
        return;
    }

    if let Some(overlay_window) = app_handle.get_webview_window("recording_overlay") {
        let _ = overlay_window.set_size(tauri::Size::Logical(tauri::LogicalSize {
            width: LIVE_OVERLAY_WIDTH,
            height: LIVE_OVERLAY_HEIGHT,
        }));

        #[cfg(target_os = "linux")]
        update_gtk_layer_shell_anchors(&overlay_window);

        if let Some(position) =
            resolved_overlay_position(app_handle, LIVE_OVERLAY_WIDTH, LIVE_OVERLAY_HEIGHT)
        {
            set_overlay_position_programmatic(&overlay_window, position);
        }

        let _ = overlay_window.show();

        #[cfg(target_os = "windows")]
        force_overlay_topmost(&overlay_window);

        let _ = overlay_window.emit("show-overlay", "live");
    }
}

/// Updates the overlay window position based on current settings
pub fn update_overlay_position(app_handle: &AppHandle) {
    if let Some(overlay_window) = app_handle.get_webview_window("recording_overlay") {
        #[cfg(target_os = "linux")]
        {
            update_gtk_layer_shell_anchors(&overlay_window);
        }

        if let Some(position) = calculate_overlay_position(app_handle) {
            set_overlay_position_programmatic(&overlay_window, position);
        }
    }
}

/// Hides the recording overlay window with fade-out animation
pub fn hide_recording_overlay(app_handle: &AppHandle) {
    // Always hide the overlay regardless of settings - if setting was changed while recording,
    // we still want to hide it properly
    if let Some(overlay_window) = app_handle.get_webview_window("recording_overlay") {
        // Emit event to trigger fade-out animation
        let _ = overlay_window.emit("hide-overlay", ());
        // Hide the window after a short delay to allow animation to complete
        let window_clone = overlay_window.clone();
        std::thread::spawn(move || {
            std::thread::sleep(std::time::Duration::from_millis(300));
            let _ = window_clone.hide();
        });
    }
}

/// Emit live-transcription text to the recording overlay window.
pub fn emit_live_text(app_handle: &AppHandle, text: &str) {
    if let Some(overlay_window) = app_handle.get_webview_window("recording_overlay") {
        let _ = overlay_window.emit("live-text", text);
    }
}

#[derive(Clone, serde::Serialize)]
struct LiveFinishedEvent {
    text: String,
    copied: bool,
}

/// Signal that the live session has finished: deliver the final text and whether
/// it was already copied to the clipboard. The bubble switches to an editable
/// state and shows the copy button.
pub fn emit_live_finished(app_handle: &AppHandle, text: &str, copied: bool) {
    if let Some(overlay_window) = app_handle.get_webview_window("recording_overlay") {
        let _ = overlay_window.emit(
            "live-finished",
            LiveFinishedEvent {
                text: text.to_string(),
                copied,
            },
        );
    }
}

pub fn emit_levels(app_handle: &AppHandle, levels: &Vec<f32>) {
    // emit levels to main app
    let _ = app_handle.emit("mic-level", levels);

    // also emit to the recording overlay if it's open
    if let Some(overlay_window) = app_handle.get_webview_window("recording_overlay") {
        let _ = overlay_window.emit("mic-level", levels);
    }
}
