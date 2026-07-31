use enigo::{Enigo, Key, Keyboard, Mouse, Settings};
use log::warn;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use tauri::{AppHandle, Manager};

/// Wrapper for Enigo to store in Tauri's managed state.
/// Enigo is wrapped in a Mutex since it requires mutable access.
pub struct EnigoState(pub Mutex<Enigo>);

impl EnigoState {
    pub fn new() -> Result<Self, String> {
        let enigo = Enigo::new(&Settings::default())
            .map_err(|e| format!("Failed to initialize Enigo: {}", e))?;
        Ok(Self(Mutex::new(enigo)))
    }
}

/// Get the current mouse cursor position using the managed Enigo instance.
/// Returns None if the state is not available or if getting the location fails.
pub fn get_cursor_position(app_handle: &AppHandle) -> Option<(i32, i32)> {
    let enigo_state = app_handle.try_state::<EnigoState>()?;
    let enigo = enigo_state.0.lock().ok()?;
    enigo.location().ok()
}

/// Sends a Ctrl+V or Cmd+V paste command using platform-specific virtual key codes.
/// This ensures the paste works regardless of keyboard layout (e.g., Russian, AZERTY, DVORAK).
/// Note: On Wayland, this may not work - callers should check for Wayland and use alternative methods.
pub fn send_paste_ctrl_v(enigo: &mut Enigo) -> Result<(), String> {
    // Platform-specific key definitions
    #[cfg(target_os = "macos")]
    let (modifier_key, v_key_code) = (Key::Meta, Key::Other(9));
    #[cfg(target_os = "windows")]
    let (modifier_key, v_key_code) = (Key::Control, Key::Other(0x56)); // VK_V
    #[cfg(target_os = "linux")]
    let (modifier_key, v_key_code) = (Key::Control, Key::Unicode('v'));

    // Press modifier + V
    enigo
        .key(modifier_key, enigo::Direction::Press)
        .map_err(|e| format!("Failed to press modifier key: {}", e))?;
    enigo
        .key(v_key_code, enigo::Direction::Click)
        .map_err(|e| format!("Failed to click V key: {}", e))?;

    std::thread::sleep(std::time::Duration::from_millis(100));

    enigo
        .key(modifier_key, enigo::Direction::Release)
        .map_err(|e| format!("Failed to release modifier key: {}", e))?;

    Ok(())
}

/// Sends a Ctrl+Shift+V paste command.
/// This is commonly used in terminal applications on Linux to paste without formatting.
/// Note: On Wayland, this may not work - callers should check for Wayland and use alternative methods.
pub fn send_paste_ctrl_shift_v(enigo: &mut Enigo) -> Result<(), String> {
    // Platform-specific key definitions
    #[cfg(target_os = "macos")]
    let (modifier_key, v_key_code) = (Key::Meta, Key::Other(9)); // Cmd+Shift+V on macOS
    #[cfg(target_os = "windows")]
    let (modifier_key, v_key_code) = (Key::Control, Key::Other(0x56)); // VK_V
    #[cfg(target_os = "linux")]
    let (modifier_key, v_key_code) = (Key::Control, Key::Unicode('v'));

    // Press Ctrl/Cmd + Shift + V
    enigo
        .key(modifier_key, enigo::Direction::Press)
        .map_err(|e| format!("Failed to press modifier key: {}", e))?;
    enigo
        .key(Key::Shift, enigo::Direction::Press)
        .map_err(|e| format!("Failed to press Shift key: {}", e))?;
    enigo
        .key(v_key_code, enigo::Direction::Click)
        .map_err(|e| format!("Failed to click V key: {}", e))?;

    std::thread::sleep(std::time::Duration::from_millis(100));

    enigo
        .key(Key::Shift, enigo::Direction::Release)
        .map_err(|e| format!("Failed to release Shift key: {}", e))?;
    enigo
        .key(modifier_key, enigo::Direction::Release)
        .map_err(|e| format!("Failed to release modifier key: {}", e))?;

    Ok(())
}

/// Sends a Shift+Insert paste command (Windows and Linux only).
/// This is more universal for terminal applications and legacy software.
/// Note: On Wayland, this may not work - callers should check for Wayland and use alternative methods.
pub fn send_paste_shift_insert(enigo: &mut Enigo) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    let insert_key_code = Key::Other(0x2D); // VK_INSERT
    #[cfg(not(target_os = "windows"))]
    let insert_key_code = Key::Other(0x76); // XK_Insert (keycode 118 / 0x76, also used as fallback)

    // Press Shift + Insert
    enigo
        .key(Key::Shift, enigo::Direction::Press)
        .map_err(|e| format!("Failed to press Shift key: {}", e))?;
    enigo
        .key(insert_key_code, enigo::Direction::Click)
        .map_err(|e| format!("Failed to click Insert key: {}", e))?;

    std::thread::sleep(std::time::Duration::from_millis(100));

    enigo
        .key(Key::Shift, enigo::Direction::Release)
        .map_err(|e| format!("Failed to release Shift key: {}", e))?;

    Ok(())
}

/// Key held down to mute the user in voice-chat apps while they dictate.
///
/// F13 exists in the keyboard protocol but on no physical keyboard, so nothing
/// else on the system reacts to it and it types no character into whatever the
/// user has focused. It is the key streamers bind for exactly this reason.
#[cfg(target_os = "windows")]
const CALL_MUTE_KEY: Key = Key::Other(0x7C); // VK_F13
#[cfg(not(target_os = "windows"))]
const CALL_MUTE_KEY: Key = Key::F13;

/// Tracks whether the key is currently held, so releasing it is idempotent: it
/// gets released from the normal stop, the live stop and the cancel path, and a
/// key left stuck down would mute the user forever.
static MUTE_HELD: AtomicBool = AtomicBool::new(false);

/// Holds the mute key down. Discord (or any app with a "push to mute" binding
/// on this key) stays muted until [`release_call_mute`] is called.
pub fn press_call_mute(app_handle: &AppHandle) {
    if MUTE_HELD.swap(true, Ordering::SeqCst) {
        return; // Already held.
    }
    with_enigo(app_handle, |enigo| {
        if let Err(e) = enigo.key(CALL_MUTE_KEY, enigo::Direction::Press) {
            warn!("Could not hold the call-mute key: {}", e);
        }
    });
}

/// Releases the mute key if it is being held. Safe to call at any time.
pub fn release_call_mute(app_handle: &AppHandle) {
    if !MUTE_HELD.swap(false, Ordering::SeqCst) {
        return;
    }
    with_enigo(app_handle, |enigo| {
        if let Err(e) = enigo.key(CALL_MUTE_KEY, enigo::Direction::Release) {
            warn!("Could not release the call-mute key: {}", e);
        }
    });
}

/// Presses and releases the mute key once.
///
/// Needed because no keyboard has an F13 to press: this is how the user gets
/// Discord to capture it while recording the "Push to Mute" binding.
pub fn tap_call_mute(app_handle: &AppHandle) {
    with_enigo(app_handle, |enigo| {
        if let Err(e) = enigo.key(CALL_MUTE_KEY, enigo::Direction::Press) {
            warn!("Could not send the call-mute key: {}", e);
            return;
        }
        // Discord samples the keybind on release; too short and it misses it.
        std::thread::sleep(std::time::Duration::from_millis(120));
        if let Err(e) = enigo.key(CALL_MUTE_KEY, enigo::Direction::Release) {
            warn!("Could not release the call-mute key: {}", e);
        }
    });
}

fn with_enigo(app_handle: &AppHandle, action: impl FnOnce(&mut Enigo)) {
    let Some(state) = app_handle.try_state::<EnigoState>() else {
        warn!("Enigo is not initialized; skipping call mute");
        return;
    };
    match state.0.lock() {
        Ok(mut enigo) => action(&mut enigo),
        Err(e) => warn!("Could not lock Enigo for call mute: {}", e),
    };
}

/// Pastes text directly using the enigo text method.
/// This tries to use system input methods if possible, otherwise simulates keystrokes one by one.
pub fn paste_text_direct(enigo: &mut Enigo, text: &str) -> Result<(), String> {
    enigo
        .text(text)
        .map_err(|e| format!("Failed to send text directly: {}", e))?;

    Ok(())
}
