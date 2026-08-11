use crate::audio_feedback;
use crate::audio_toolkit::audio::{list_input_devices, list_output_devices};
use crate::managers::audio::{AudioRecordingManager, MicrophoneMode};
use crate::settings::{get_settings, write_settings};
use log::warn;
use serde::{Deserialize, Serialize};
use specta::Type;
use std::sync::Arc;
use tauri::{AppHandle, Manager};

#[cfg(target_os = "windows")]
use winreg::{
    enums::{HKEY_CURRENT_USER, HKEY_LOCAL_MACHINE},
    RegKey, HKEY,
};

#[derive(Serialize, Type)]
pub struct CustomSounds {
    start: bool,
    stop: bool,
}

fn custom_sound_exists(app: &AppHandle, sound_type: &str) -> bool {
    crate::portable::resolve_app_data(app, &format!("custom_{}.wav", sound_type))
        .is_ok_and(|path| path.exists())
}

#[tauri::command]
#[specta::specta]
pub fn check_custom_sounds(app: AppHandle) -> CustomSounds {
    CustomSounds {
        start: custom_sound_exists(&app, "start"),
        stop: custom_sound_exists(&app, "stop"),
    }
}

#[derive(Serialize, Deserialize, Debug, Clone, Type)]
pub struct AudioDevice {
    pub index: String,
    pub name: String,
    pub is_default: bool,
}

#[derive(Serialize, Deserialize, Debug, Clone, Copy, PartialEq, Eq, Type)]
#[serde(rename_all = "snake_case")]
pub enum PermissionAccess {
    Allowed,
    Denied,
    Unknown,
}

#[derive(Serialize, Deserialize, Debug, Clone, Type)]
pub struct WindowsMicrophonePermissionStatus {
    pub supported: bool,
    pub overall_access: PermissionAccess,
    pub device_access: PermissionAccess,
    pub app_access: PermissionAccess,
    pub desktop_app_access: PermissionAccess,
}

#[cfg(target_os = "windows")]
fn read_registry_permission_access(root_hkey: HKEY, path: &str) -> PermissionAccess {
    let root = RegKey::predef(root_hkey);
    let Ok(key) = root.open_subkey(path) else {
        return PermissionAccess::Unknown;
    };

    let Ok(value) = key.get_value::<String, _>("Value") else {
        return PermissionAccess::Unknown;
    };

    match value.to_ascii_lowercase().as_str() {
        "allow" => PermissionAccess::Allowed,
        "deny" => PermissionAccess::Denied,
        _ => PermissionAccess::Unknown,
    }
}

/// Combine the Windows consent switches that actually govern a non-packaged
/// desktop app into one verdict. Pure so the cases that stranded real users can
/// be pinned by tests instead of by re-reading someone's registry.
///
/// `this_app_access` is VoCript's own entry under NonPackaged, which Windows
/// writes when you toggle a single app in the desktop-app list. It overrides the
/// blanket desktop-app switch, so it is checked first.
///
/// `app_access` (the packaged/Store-app switch) is deliberately ignored: it says
/// nothing about us. Honouring it made onboarding unpassable for anyone who had
/// turned packaged-app access off — the microphone step sat on "Waiting…"
/// forever no matter how many times they granted the permission that does apply
/// (issue #6).
fn combine_microphone_access(
    device_access: PermissionAccess,
    desktop_app_access: PermissionAccess,
    this_app_access: PermissionAccess,
) -> PermissionAccess {
    // The machine-wide device switch overrides everything below it.
    if device_access == PermissionAccess::Denied {
        return PermissionAccess::Denied;
    }

    // Our own entry, when present, beats the blanket desktop-app switch.
    let desktop = if this_app_access == PermissionAccess::Unknown {
        desktop_app_access
    } else {
        this_app_access
    };

    match (device_access, desktop) {
        (_, PermissionAccess::Denied) => PermissionAccess::Denied,
        (PermissionAccess::Allowed, PermissionAccess::Allowed) => PermissionAccess::Allowed,
        // Unknown means "no explicit entry", which Windows treats as allowed for
        // desktop apps. Blocking on it would strand users whose registry simply
        // has no value yet — a real capture failure is reported separately.
        _ => PermissionAccess::Unknown,
    }
}

/// Registry sub-key Windows uses for a single desktop app: its full path with
/// backslashes replaced by `#`.
#[cfg(target_os = "windows")]
fn current_exe_consent_key() -> Option<String> {
    let exe = std::env::current_exe().ok()?;
    Some(exe.to_string_lossy().replace('\\', "#"))
}

#[cfg(target_os = "windows")]
fn get_windows_microphone_permission_status_impl() -> WindowsMicrophonePermissionStatus {
    const MICROPHONE_PATH: &str =
        "Software\\Microsoft\\Windows\\CurrentVersion\\CapabilityAccessManager\\ConsentStore\\microphone";
    const DESKTOP_APPS_PATH: &str =
        "Software\\Microsoft\\Windows\\CurrentVersion\\CapabilityAccessManager\\ConsentStore\\microphone\\NonPackaged";

    let device_access = read_registry_permission_access(HKEY_LOCAL_MACHINE, MICROPHONE_PATH);
    let app_access = read_registry_permission_access(HKEY_CURRENT_USER, MICROPHONE_PATH);
    let desktop_app_access = read_registry_permission_access(HKEY_CURRENT_USER, DESKTOP_APPS_PATH);
    let this_app_access = current_exe_consent_key()
        .map(|key| {
            read_registry_permission_access(
                HKEY_CURRENT_USER,
                &format!("{DESKTOP_APPS_PATH}\\{key}"),
            )
        })
        .unwrap_or(PermissionAccess::Unknown);

    let from_registry =
        combine_microphone_access(device_access, desktop_app_access, this_app_access);

    // The registry is a hint; the microphone itself is the authority. Users have
    // been locked out of onboarding twice now by a consent value that did not
    // match what the audio stack actually allows, so when the registry says no,
    // ask the device before believing it.
    let overall_access = if from_registry == PermissionAccess::Denied {
        match microphone_opens_successfully() {
            Some(true) => PermissionAccess::Allowed,
            Some(false) => PermissionAccess::Denied,
            // Could not tell (no device, device busy): do not block on a guess.
            None => PermissionAccess::Unknown,
        }
    } else {
        from_registry
    };

    WindowsMicrophonePermissionStatus {
        supported: true,
        overall_access,
        device_access,
        app_access,
        desktop_app_access,
    }
}

/// Try to actually open the default input device.
///
/// `Some(true)` = capture works, `Some(false)` = the OS refused on permission
/// grounds, `None` = inconclusive (no input device, device in use, driver
/// error), which must never be treated as a denial.
#[cfg(target_os = "windows")]
fn microphone_opens_successfully() -> Option<bool> {
    use crate::audio_toolkit::audio::is_microphone_access_denied;
    use cpal::traits::{DeviceTrait, HostTrait};

    let device = cpal::default_host().default_input_device()?;
    let config = device.default_input_config().ok()?;

    match device.build_input_stream(
        &config.into(),
        |_: &[f32], _: &cpal::InputCallbackInfo| {},
        |_| {},
        None,
    ) {
        Ok(_stream) => Some(true),
        Err(e) => {
            let message = e.to_string();
            if is_microphone_access_denied(&message) {
                Some(false)
            } else {
                warn!("Microphone probe was inconclusive: {message}");
                None
            }
        }
    }
}

#[tauri::command]
#[specta::specta]
pub fn get_windows_microphone_permission_status() -> WindowsMicrophonePermissionStatus {
    #[cfg(target_os = "windows")]
    {
        get_windows_microphone_permission_status_impl()
    }

    #[cfg(not(target_os = "windows"))]
    {
        WindowsMicrophonePermissionStatus {
            supported: false,
            overall_access: PermissionAccess::Unknown,
            device_access: PermissionAccess::Unknown,
            app_access: PermissionAccess::Unknown,
            desktop_app_access: PermissionAccess::Unknown,
        }
    }
}

#[tauri::command]
#[specta::specta]
pub fn open_microphone_privacy_settings() -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        use std::process::Command;
        Command::new("cmd")
            .args(["/C", "start", "", "ms-settings:privacy-microphone"])
            .spawn()
            .map_err(|e| format!("Failed to open Windows microphone privacy settings: {}", e))?;
        Ok(())
    }

    #[cfg(not(target_os = "windows"))]
    {
        Err("Opening microphone privacy settings is only supported on Windows".to_string())
    }
}

#[tauri::command]
#[specta::specta]
pub fn update_microphone_mode(app: AppHandle, always_on: bool) -> Result<(), String> {
    // Update settings
    let mut settings = get_settings(&app);
    settings.always_on_microphone = always_on;
    write_settings(&app, settings);

    // Update the audio manager mode
    let rm = app.state::<Arc<AudioRecordingManager>>();
    let new_mode = if always_on {
        MicrophoneMode::AlwaysOn
    } else {
        MicrophoneMode::OnDemand
    };

    rm.update_mode(new_mode)
        .map_err(|e| format!("Failed to update microphone mode: {}", e))
}

#[tauri::command]
#[specta::specta]
pub fn get_microphone_mode(app: AppHandle) -> Result<bool, String> {
    let settings = get_settings(&app);
    Ok(settings.always_on_microphone)
}

#[tauri::command]
#[specta::specta]
pub fn get_available_microphones() -> Result<Vec<AudioDevice>, String> {
    let devices =
        list_input_devices().map_err(|e| format!("Failed to list audio devices: {}", e))?;

    let mut result = vec![AudioDevice {
        index: "default".to_string(),
        name: "Default".to_string(),
        is_default: true,
    }];

    result.extend(devices.into_iter().map(|d| AudioDevice {
        index: d.index,
        name: d.name,
        is_default: false, // The explicit default is handled separately
    }));

    Ok(result)
}

#[tauri::command]
#[specta::specta]
pub fn set_selected_microphone(app: AppHandle, device_name: String) -> Result<(), String> {
    let mut settings = get_settings(&app);
    settings.selected_microphone = if device_name == "default" {
        None
    } else {
        Some(device_name)
    };
    write_settings(&app, settings);

    // Update the audio manager to use the new device
    let rm = app.state::<Arc<AudioRecordingManager>>();
    rm.update_selected_device()
        .map_err(|e| format!("Failed to update selected device: {}", e))?;

    Ok(())
}

#[tauri::command]
#[specta::specta]
pub fn get_selected_microphone(app: AppHandle) -> Result<String, String> {
    let settings = get_settings(&app);
    Ok(settings
        .selected_microphone
        .unwrap_or_else(|| "default".to_string()))
}

#[tauri::command]
#[specta::specta]
pub fn get_available_output_devices() -> Result<Vec<AudioDevice>, String> {
    let devices =
        list_output_devices().map_err(|e| format!("Failed to list output devices: {}", e))?;

    let mut result = vec![AudioDevice {
        index: "default".to_string(),
        name: "Default".to_string(),
        is_default: true,
    }];

    result.extend(devices.into_iter().map(|d| AudioDevice {
        index: d.index,
        name: d.name,
        is_default: false, // The explicit default is handled separately
    }));

    Ok(result)
}

#[tauri::command]
#[specta::specta]
pub fn set_selected_output_device(app: AppHandle, device_name: String) -> Result<(), String> {
    let mut settings = get_settings(&app);
    settings.selected_output_device = if device_name == "default" {
        None
    } else {
        Some(device_name)
    };
    write_settings(&app, settings);
    Ok(())
}

#[tauri::command]
#[specta::specta]
pub fn get_selected_output_device(app: AppHandle) -> Result<String, String> {
    let settings = get_settings(&app);
    Ok(settings
        .selected_output_device
        .unwrap_or_else(|| "default".to_string()))
}

#[tauri::command]
#[specta::specta]
pub async fn play_test_sound(app: AppHandle, sound_type: String) {
    let sound = match sound_type.as_str() {
        "start" => audio_feedback::SoundType::Start,
        "stop" => audio_feedback::SoundType::Stop,
        _ => {
            warn!("Unknown sound type: {}", sound_type);
            return;
        }
    };
    audio_feedback::play_test_sound(&app, sound);
}

#[tauri::command]
#[specta::specta]
pub fn set_clamshell_microphone(app: AppHandle, device_name: String) -> Result<(), String> {
    let mut settings = get_settings(&app);
    settings.clamshell_microphone = if device_name == "default" {
        None
    } else {
        Some(device_name)
    };
    write_settings(&app, settings);
    Ok(())
}

#[tauri::command]
#[specta::specta]
pub fn get_clamshell_microphone(app: AppHandle) -> Result<String, String> {
    let settings = get_settings(&app);
    Ok(settings
        .clamshell_microphone
        .unwrap_or_else(|| "default".to_string()))
}

#[tauri::command]
#[specta::specta]
pub fn is_recording(app: AppHandle) -> bool {
    let audio_manager = app.state::<Arc<AudioRecordingManager>>();
    audio_manager.is_recording()
}

#[cfg(test)]
mod tests {
    use super::{combine_microphone_access, PermissionAccess};

    /// The exact registry state from issue #6: packaged-app access off, desktop
    /// access on. VoCript is a desktop app, so this must read as allowed — it
    /// used to read as denied and left the reporter stuck on "Waiting…" forever.
    #[test]
    fn packaged_app_switch_being_off_does_not_block_us() {
        assert_eq!(
            combine_microphone_access(
                PermissionAccess::Allowed,
                PermissionAccess::Allowed,
                PermissionAccess::Unknown,
            ),
            PermissionAccess::Allowed
        );
    }

    #[test]
    fn the_machine_wide_device_switch_wins() {
        assert_eq!(
            combine_microphone_access(
                PermissionAccess::Denied,
                PermissionAccess::Allowed,
                PermissionAccess::Allowed,
            ),
            PermissionAccess::Denied
        );
    }

    #[test]
    fn our_own_entry_overrides_the_blanket_desktop_switch() {
        // Blanket switch off but VoCript explicitly allowed.
        assert_eq!(
            combine_microphone_access(
                PermissionAccess::Allowed,
                PermissionAccess::Denied,
                PermissionAccess::Allowed,
            ),
            PermissionAccess::Allowed
        );
        // Blanket switch on but VoCript explicitly turned off in the app list.
        assert_eq!(
            combine_microphone_access(
                PermissionAccess::Allowed,
                PermissionAccess::Allowed,
                PermissionAccess::Denied,
            ),
            PermissionAccess::Denied
        );
    }

    #[test]
    fn a_registry_with_no_entries_is_never_a_denial() {
        // Windows treats "no value" as allowed for desktop apps, and blocking on
        // it would strand users whose registry has simply never been written.
        assert_eq!(
            combine_microphone_access(
                PermissionAccess::Unknown,
                PermissionAccess::Unknown,
                PermissionAccess::Unknown,
            ),
            PermissionAccess::Unknown
        );
    }
}
