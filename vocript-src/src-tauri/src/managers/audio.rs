use crate::audio_toolkit::{
    get_cpal_host, list_input_devices, list_output_devices, vad::SmoothedVad, AudioRecorder,
    SileroVad,
};
use crate::helpers::clamshell;
use crate::settings::{get_settings, AppSettings, AudioSource};
use crate::utils;
use log::{debug, error, info};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};
use tauri::Manager;

fn set_mute(mute: bool) {
    // Expected behavior:
    // - Windows: works on most systems using standard audio drivers.
    // - Linux: works on many systems (PipeWire, PulseAudio, ALSA),
    //   but some distros may lack the tools used.
    // - macOS: works on most standard setups via AppleScript.
    // If unsupported, fails silently.

    #[cfg(target_os = "windows")]
    {
        unsafe {
            use windows::Win32::{
                Media::Audio::{
                    eMultimedia, eRender, Endpoints::IAudioEndpointVolume, IMMDeviceEnumerator,
                    MMDeviceEnumerator,
                },
                System::Com::{CoCreateInstance, CoInitializeEx, CLSCTX_ALL, COINIT_MULTITHREADED},
            };

            macro_rules! unwrap_or_return {
                ($expr:expr) => {
                    match $expr {
                        Ok(val) => val,
                        Err(_) => return,
                    }
                };
            }

            // Initialize the COM library for this thread.
            // If already initialized (e.g., by another library like Tauri), this does nothing.
            let _ = CoInitializeEx(None, COINIT_MULTITHREADED);

            let all_devices: IMMDeviceEnumerator =
                unwrap_or_return!(CoCreateInstance(&MMDeviceEnumerator, None, CLSCTX_ALL));
            let default_device =
                unwrap_or_return!(all_devices.GetDefaultAudioEndpoint(eRender, eMultimedia));
            let volume_interface = unwrap_or_return!(
                default_device.Activate::<IAudioEndpointVolume>(CLSCTX_ALL, None)
            );

            let _ = volume_interface.SetMute(mute, std::ptr::null());
        }
    }

    #[cfg(target_os = "linux")]
    {
        use std::process::Command;

        let mute_val = if mute { "1" } else { "0" };
        let amixer_state = if mute { "mute" } else { "unmute" };

        // Try multiple backends to increase compatibility
        // 1. PipeWire (wpctl)
        if Command::new("wpctl")
            .args(["set-mute", "@DEFAULT_AUDIO_SINK@", mute_val])
            .output()
            .map(|o| o.status.success())
            .unwrap_or(false)
        {
            return;
        }

        // 2. PulseAudio (pactl)
        if Command::new("pactl")
            .args(["set-sink-mute", "@DEFAULT_SINK@", mute_val])
            .output()
            .map(|o| o.status.success())
            .unwrap_or(false)
        {
            return;
        }

        // 3. ALSA (amixer)
        let _ = Command::new("amixer")
            .args(["set", "Master", amixer_state])
            .output();
    }

    #[cfg(target_os = "macos")]
    {
        use std::process::Command;
        let script = format!(
            "set volume output muted {}",
            if mute { "true" } else { "false" }
        );
        let _ = Command::new("osascript").args(["-e", &script]).output();
    }
}

const WHISPER_SAMPLE_RATE: usize = 16000;

/// Peak-normalize quiet audio so low-volume system/loopback captures stay
/// audible to Whisper (the loopback follows the app/system volume). Only
/// amplifies — never attenuates — and caps the gain so near-silence/noise isn't
/// blown up.
fn normalize_peak(mut samples: Vec<f32>, target_peak: f32) -> Vec<f32> {
    let peak = samples.iter().fold(0f32, |m, &s| m.max(s.abs()));
    if peak > 0.0008 && peak < target_peak {
        let gain = (target_peak / peak).min(12.0);
        for s in samples.iter_mut() {
            *s = (*s * gain).clamp(-1.0, 1.0);
        }
    }
    samples
}

/* ──────────────────────────────────────────────────────────────── */

/// Whether a capture device looks like it arrived over Bluetooth.
///
/// Bluetooth headsets have two profiles: a high quality one for listening and a
/// call-quality one that also carries the microphone. Opening the microphone
/// switches the headset to the second, and the music playing through it audibly
/// degrades. A stream left prepared could hold that switch for as long as the
/// app is running, so on these devices the stream is not kept: they go back to
/// opening on the keypress, first word and all.
///
/// This is a guess by name, because cpal exposes no transport information. It
/// covers what Windows calls these endpoints in English and Spanish; a device
/// it fails to recognise simply keeps the prepared stream, which is the
/// behaviour everything else gets. Reading PKEY_Device_EnumeratorName off the
/// WASAPI endpoint would answer this exactly, and is where to go if the guess
/// ever proves too rough.
fn looks_like_bluetooth(name: &str) -> bool {
    let name = name.to_lowercase();
    ["bluetooth", "hands-free", "handsfree", "manos libres"]
        .iter()
        .any(|marker| name.contains(marker))
}

#[derive(Clone, Debug)]
pub enum RecordingState {
    Idle,
    Recording { binding_id: String },
}

#[derive(Clone, Debug)]
pub enum MicrophoneMode {
    AlwaysOn,
    OnDemand,
}

/* ──────────────────────────────────────────────────────────────── */

fn create_audio_recorder(
    vad_path: &str,
    app_handle: &tauri::AppHandle,
    always_capturing: bool,
) -> Result<AudioRecorder, anyhow::Error> {
    let silero = SileroVad::new(vad_path, 0.2)
        .map_err(|e| anyhow::anyhow!("Failed to create SileroVad: {}", e))?;
    let smoothed_vad = SmoothedVad::new(Box::new(silero), 20, 15, 1);

    // Recorder with VAD plus a spectrum-level callback that forwards updates to
    // the frontend.
    let recorder = AudioRecorder::new()
        .map_err(|e| anyhow::anyhow!("Failed to create AudioRecorder: {}", e))?
        .with_vad(Box::new(smoothed_vad))
        .with_level_callback({
            let app_handle = app_handle.clone();
            move |levels| {
                utils::emit_levels(&app_handle, &levels);
            }
        })
        .with_ready_callback({
            let app_handle = app_handle.clone();
            move || {
                utils::emit_mic_ready(&app_handle);
            }
        });

    // Always-on mode leaves the device running between recordings, because
    // that is what feeds the idle level meter. Every other mode leaves it
    // prepared but stopped.
    recorder.set_always_capturing(always_capturing);

    Ok(recorder)
}

/* ──────────────────────────────────────────────────────────────── */

#[derive(Clone)]
pub struct AudioRecordingManager {
    state: Arc<Mutex<RecordingState>>,
    mode: Arc<Mutex<MicrophoneMode>>,
    app_handle: tauri::AppHandle,

    recorder: Arc<Mutex<Option<AudioRecorder>>>,
    is_open: Arc<Mutex<bool>>,
    is_recording: Arc<Mutex<bool>>,
    did_mute: Arc<Mutex<bool>>,

    /// Fuente de audio que se usará en la próxima grabación (micrófono o sistema).
    current_source: Arc<Mutex<AudioSource>>,
    /// Fuente con la que está abierto el stream actual (None si está cerrado).
    /// Permite reabrir el stream cuando cambia la fuente entre grabaciones.
    open_source: Arc<Mutex<Option<AudioSource>>>,
    /// Snapshot de «lo que sonaba» (SMTC) al empezar una grabación de sistema,
    /// para añadir la línea de «Fuente» a la transcripción. Ver media_source.
    system_source_snapshot: Arc<Mutex<Option<crate::media_source::MediaSnapshot>>>,
}

impl AudioRecordingManager {
    /* ---------- construction ------------------------------------------------ */

    pub fn new(app: &tauri::AppHandle) -> Result<Self, anyhow::Error> {
        let settings = get_settings(app);
        let mode = if settings.always_on_microphone {
            MicrophoneMode::AlwaysOn
        } else {
            MicrophoneMode::OnDemand
        };

        let manager = Self {
            state: Arc::new(Mutex::new(RecordingState::Idle)),
            mode: Arc::new(Mutex::new(mode.clone())),
            app_handle: app.clone(),

            recorder: Arc::new(Mutex::new(None)),
            is_open: Arc::new(Mutex::new(false)),
            is_recording: Arc::new(Mutex::new(false)),
            did_mute: Arc::new(Mutex::new(false)),

            current_source: Arc::new(Mutex::new(AudioSource::Microphone)),
            open_source: Arc::new(Mutex::new(None)),
            system_source_snapshot: Arc::new(Mutex::new(None)),
        };

        // Always-on?  Open immediately — but never let a failure here abort
        // startup. The setting persists BEFORE the mode is first applied, so a
        // mic that later disappears (unplugged USB, permission revoked) used
        // to crash-loop the whole app on launch until the user hand-edited the
        // settings JSON. Degrade to on-demand behaviour instead: dictation
        // shortcuts will retry opening the stream (and surface their own
        // error) when actually used.
        if matches!(mode, MicrophoneMode::AlwaysOn) {
            if let Err(e) = manager.start_microphone_stream() {
                log::error!(
                    "Always-on microphone could not be opened at startup ({}); \
                     continuing without it — recording will retry on demand",
                    e
                );
            }
        }

        // Probe the capture device's stream configuration now, in the
        // background, so the first dictation does not pay for it. Measured on
        // WASAPI, that probe costs 178-353 ms, and it used to land squarely
        // between pressing the shortcut and the microphone going live - long
        // enough to swallow the first word of a short dictation.
        //
        // This does NOT open the microphone: it only asks the device which
        // formats it supports. Verified against Windows' own privacy ledger
        // (CapabilityAccessManager\ConsentStore\microphone) - a build that
        // only probes never appears there, while one that captures does.
        {
            let manager = manager.clone();
            std::thread::spawn(move || {
                manager.preload_device_config();
                // And go one step further: build the capture stream itself, so
                // the very first dictation of the session is as quick as the
                // rest. Always-on mode already opened it above.
                //
                // The lock is released on its own line on purpose: opening the
                // stream reads the mode again further down, and holding it
                // across that call would deadlock the app during startup.
                let on_demand = matches!(*manager.mode.lock().unwrap(), MicrophoneMode::OnDemand);
                if on_demand && manager.stream_may_stay_prepared() {
                    if let Err(e) = manager.start_microphone_stream() {
                        debug!("Could not prepare the microphone at startup: {e}");
                    }
                }
            });
        }

        Ok(manager)
    }

    /* ---------- helper methods --------------------------------------------- */

    /// Warm the cached stream configuration for the microphone we would use
    /// right now, off the path a keypress takes. Safe to call repeatedly and
    /// from any thread; it never opens a capture stream.
    pub fn preload_device_config(&self) {
        use cpal::traits::HostTrait;

        let settings = get_settings(&self.app_handle);
        let device = self
            .get_effective_microphone_device(&settings)
            .or_else(|| get_cpal_host().default_input_device());

        if let Some(device) = device {
            let start = Instant::now();
            AudioRecorder::warm_config_cache(&device);
            debug!("Device config pre-probed in {:?}", start.elapsed());
        }
    }

    fn get_effective_microphone_device(&self, settings: &AppSettings) -> Option<cpal::Device> {
        // Check if we're in clamshell mode and have a clamshell microphone configured
        let use_clamshell_mic = if let Ok(is_clamshell) = clamshell::is_clamshell() {
            is_clamshell && settings.clamshell_microphone.is_some()
        } else {
            false
        };

        let device_name = if use_clamshell_mic {
            settings.clamshell_microphone.as_ref().unwrap()
        } else {
            settings.selected_microphone.as_ref()?
        };

        // Find the device by name
        match list_input_devices() {
            Ok(devices) => devices
                .into_iter()
                .find(|d| d.name == *device_name)
                .map(|d| d.device),
            Err(e) => {
                debug!("Failed to list devices, using default: {}", e);
                None
            }
        }
    }

    /// Dispositivo desde el que capturar el audio del sistema (loopback).
    /// En el backend WASAPI de cpal, abrir un dispositivo de *salida* como
    /// entrada activa el loopback de forma transparente, así que devolvemos el
    /// dispositivo de salida por defecto (lo que el usuario está oyendo).
    fn get_system_audio_device(&self) -> Option<cpal::Device> {
        use cpal::traits::HostTrait;
        if let Some(default) = get_cpal_host().default_output_device() {
            return Some(default);
        }
        // Fallback: primer dispositivo de salida disponible.
        match list_output_devices() {
            Ok(devices) => devices.into_iter().next().map(|d| d.device),
            Err(e) => {
                debug!("Failed to list output devices for system capture: {}", e);
                None
            }
        }
    }

    /* ---------- microphone life-cycle -------------------------------------- */

    /// Called after a recording ends in on-demand mode. Undoes the mute and
    /// leaves the stream in place, stopped.
    ///
    /// This used to close the stream outright (or after an idle timeout), which
    /// meant every dictation paid to open a capture device again: measured at
    /// 456 ms on average and up to 968 ms on a real machine, all of it speech
    /// the user had already said and the app never heard. Now the recorder stops
    /// the device when the recording ends, so what stays behind captures
    /// nothing, registers no microphone use with the OS and costs no measurable
    /// CPU, yet is ready to capture again in single-digit milliseconds.
    fn release_after_recording(&self) {
        {
            let mut did_mute = self.did_mute.lock().unwrap();
            if *did_mute {
                set_mute(false);
            }
            *did_mute = false;
        }

        if !self.stream_may_stay_prepared() {
            debug!("Bluetooth capture device; closing the stream instead of keeping it prepared");
            self.stop_microphone_stream();
        }
    }

    /// Whether the stream may be left prepared between recordings, or has to be
    /// closed after each one. See [`looks_like_bluetooth`].
    fn stream_may_stay_prepared(&self) -> bool {
        use cpal::traits::DeviceTrait;

        let settings = get_settings(&self.app_handle);
        let name = self
            .get_effective_microphone_device(&settings)
            .or_else(|| {
                use cpal::traits::HostTrait;
                get_cpal_host().default_input_device()
            })
            .and_then(|device| device.name().ok());

        match name {
            Some(name) => !looks_like_bluetooth(&name),
            // Unknown device: keep the fast path rather than punishing everyone
            // for a name we could not read.
            None => true,
        }
    }

    /// Applies mute if mute_while_recording is enabled and stream is open
    pub fn apply_mute(&self) {
        let settings = get_settings(&self.app_handle);
        if !settings.mute_while_recording {
            return;
        }

        // Lock order matters: `is_open` BEFORE `did_mute`, matching
        // start_microphone_stream and stop_microphone_stream. Taking them the
        // other way round here was a textbook AB-BA deadlock — a shortcut
        // starting a recording at the same moment the user switched microphone
        // in Settings could freeze both threads permanently.
        let open_flag = self.is_open.lock().unwrap();
        let mut did_mute_guard = self.did_mute.lock().unwrap();

        if *open_flag {
            set_mute(true);
            *did_mute_guard = true;
            debug!("Mute applied");
        }
    }

    /// Removes mute if it was applied
    pub fn remove_mute(&self) {
        let mut did_mute_guard = self.did_mute.lock().unwrap();
        if *did_mute_guard {
            set_mute(false);
            *did_mute_guard = false;
            debug!("Mute removed");
        }
    }

    pub fn preload_vad(&self) -> Result<(), anyhow::Error> {
        // Read the mode BEFORE taking the recorder lock. Taking these two in
        // the other order, or nested, is how this turns into a deadlock.
        let always_capturing = matches!(*self.mode.lock().unwrap(), MicrophoneMode::AlwaysOn);

        let mut recorder_opt = self.recorder.lock().unwrap();
        if recorder_opt.is_none() {
            let vad_path = self
                .app_handle
                .path()
                .resolve(
                    "resources/models/silero_vad_v4.onnx",
                    tauri::path::BaseDirectory::Resource,
                )
                .map_err(|e| anyhow::anyhow!("Failed to resolve VAD path: {}", e))?;
            *recorder_opt = Some(create_audio_recorder(
                vad_path.to_str().unwrap(),
                &self.app_handle,
                always_capturing,
            )?);
        }
        Ok(())
    }

    pub fn start_microphone_stream(&self) -> Result<(), anyhow::Error> {
        let mut open_flag = self.is_open.lock().unwrap();
        if *open_flag {
            debug!("Microphone stream already active");
            return Ok(());
        }

        let start_time = Instant::now();

        // Don't mute immediately - caller will handle muting after audio feedback
        let mut did_mute_guard = self.did_mute.lock().unwrap();
        *did_mute_guard = false;

        let settings = get_settings(&self.app_handle);
        let source = *self.current_source.lock().unwrap();

        // Windows: when the user picked a target app for system transcription,
        // capture only that application's audio via WASAPI process loopback.
        #[cfg(windows)]
        if matches!(source, AudioSource::System) {
            if let Some(app_name) = settings.system_audio_app.clone() {
                let pid = crate::audio_toolkit::find_pid_by_name(&app_name).ok_or_else(|| {
                    anyhow::anyhow!(
                        "La app seleccionada ('{}') no esta reproduciendo audio ahora mismo",
                        app_name
                    )
                })?;
                self.preload_vad()?;
                if let Some(rec) = self.recorder.lock().unwrap().as_mut() {
                    rec.open_process_loopback(pid)
                        .map_err(|e| anyhow::anyhow!("Failed to open app loopback: {}", e))?;
                }
                *open_flag = true;
                *self.open_source.lock().unwrap() = Some(source);
                info!(
                    "App loopback stream initialized for '{}' in {:?}",
                    app_name,
                    start_time.elapsed()
                );
                return Ok(());
            }
        }

        // Choose the capture device based on the active audio source.
        let selected_device = match source {
            AudioSource::Microphone => self.get_effective_microphone_device(&settings),
            AudioSource::System => self.get_system_audio_device(),
        };

        // Pre-flight check: fail early with a clear error instead of letting
        // cpal produce a cryptic backend-specific message.
        match source {
            AudioSource::Microphone => {
                // None means "use the default input"; only fail if there are no
                // input devices at all.
                if selected_device.is_none() {
                    let has_any_device = list_input_devices()
                        .map(|devices| !devices.is_empty())
                        .unwrap_or(false);
                    if !has_any_device {
                        return Err(anyhow::anyhow!("No input device found"));
                    }
                }
            }
            AudioSource::System => {
                // For system capture we must have an explicit output device to
                // open in loopback mode; None means none was found.
                if selected_device.is_none() {
                    return Err(anyhow::anyhow!(
                        "No audio output device found for system audio capture"
                    ));
                }
            }
        }

        // Ensure VAD is loaded if it wasn't for whatever reason
        self.preload_vad()?;

        let mut recorder_opt = self.recorder.lock().unwrap();
        if let Some(rec) = recorder_opt.as_mut() {
            rec.open(selected_device)
                .map_err(|e| anyhow::anyhow!("Failed to open recorder: {}", e))?;
        }

        *open_flag = true;
        *self.open_source.lock().unwrap() = Some(source);
        // This timing covers through cpal's stream.play() returning — i.e. the
        // point cpal surfaces as "stream running." It does NOT guarantee the
        // host audio device is producing samples yet; the first input callback
        // fires asynchronously one buffer period later (hardware dependent,
        // typically ~10–200ms on macOS, longer on Bluetooth/USB).
        info!(
            "Microphone stream initialized in {:?}",
            start_time.elapsed()
        );
        Ok(())
    }

    pub fn stop_microphone_stream(&self) {
        let mut open_flag = self.is_open.lock().unwrap();
        if !*open_flag {
            return;
        }

        let mut did_mute_guard = self.did_mute.lock().unwrap();
        if *did_mute_guard {
            set_mute(false);
        }
        *did_mute_guard = false;

        if let Some(rec) = self.recorder.lock().unwrap().as_mut() {
            // If still recording, stop first.
            if *self.is_recording.lock().unwrap() {
                let _ = rec.stop();
                *self.is_recording.lock().unwrap() = false;
            }
            let _ = rec.close();
        }

        *open_flag = false;
        *self.open_source.lock().unwrap() = None;
        debug!("Microphone stream stopped");
    }

    /* ---------- mode switching --------------------------------------------- */

    pub fn update_mode(&self, new_mode: MicrophoneMode) -> Result<(), anyhow::Error> {
        let cur_mode = self.mode.lock().unwrap().clone();

        match (cur_mode, &new_mode) {
            (MicrophoneMode::AlwaysOn, MicrophoneMode::OnDemand) => {
                if matches!(*self.state.lock().unwrap(), RecordingState::Idle) {
                    self.stop_microphone_stream();
                }
            }
            (MicrophoneMode::OnDemand, MicrophoneMode::AlwaysOn) => {
                self.start_microphone_stream()?;
            }
            _ => {}
        }

        let always_capturing = matches!(new_mode, MicrophoneMode::AlwaysOn);
        *self.mode.lock().unwrap() = new_mode;
        if let Some(rec) = self.recorder.lock().unwrap().as_ref() {
            rec.set_always_capturing(always_capturing);
        }
        Ok(())
    }

    /* ---------- recording --------------------------------------------------- */

    pub fn try_start_recording(&self, binding_id: &str) -> Result<(), String> {
        let mut state = self.state.lock().unwrap();

        if let RecordingState::Idle = *state {
            // Determine the audio source for this recording: the dedicated
            // system-audio binding captures the system (loopback); every other
            // binding always uses the microphone.
            // Both the normal system-audio binding and its live variant capture
            // the system (loopback); every other binding uses the microphone.
            let desired_source =
                if binding_id == "transcribe_system" || binding_id == "transcribe_system_live" {
                    AudioSource::System
                } else {
                    AudioSource::Microphone
                };
            *self.current_source.lock().unwrap() = desired_source;

            // For system-audio captures (normal or live), snapshot what's
            // playing now (title, artist, app, position) so the transcription
            // can be attributed to its source. Only when the user enabled it.
            {
                let is_system_capture =
                    binding_id == "transcribe_system" || binding_id == "transcribe_system_live";
                let snapshot =
                    if is_system_capture && get_settings(&self.app_handle).source_attribution {
                        crate::media_source::capture()
                    } else {
                        None
                    };
                *self.system_source_snapshot.lock().unwrap() = snapshot;
            }

            // (Re)open the stream when it is closed, or when it is open with a
            // different source than the one we need now. Otherwise (on-demand,
            // already open with the right source) just cancel the pending close.
            let is_open = *self.is_open.lock().unwrap();
            let open_source = *self.open_source.lock().unwrap();
            if !is_open || open_source != Some(desired_source) {
                self.stop_microphone_stream();
                if let Err(e) = self.start_microphone_stream() {
                    let msg = format!("{e}");
                    error!("Failed to open audio stream: {msg}");
                    return Err(msg);
                }
            }

            let mut start_error = {
                let recorder = self.recorder.lock().unwrap();
                let Some(rec) = recorder.as_ref() else {
                    return Err("Recorder not available".to_string());
                };
                // Only keep the second, readable-while-recording copy of the
                // audio when something will actually read it back mid-run.
                // (The wake word polls current_samples() too, but on recorders
                // of its own, which opt in where they are created.)
                rec.set_live_mirroring(binding_id.ends_with("_live"));
                rec.start().err().map(|e| e.to_string())
            };

            // The stream we kept prepared may have outlived its device: a mic
            // unplugged, a machine resumed from sleep, a driver restarted.
            // Rebuild it once and try again, which is exactly what the old
            // close-after-every-recording behaviour did every single time.
            if let Some(message) = start_error.take() {
                debug!("Prepared microphone would not start ({message}); rebuilding it");
                self.stop_microphone_stream();
                if let Err(e) = self.start_microphone_stream() {
                    return Err(format!("{e}"));
                }
                let recorder = self.recorder.lock().unwrap();
                let Some(rec) = recorder.as_ref() else {
                    return Err("Recorder not available".to_string());
                };
                rec.set_live_mirroring(binding_id.ends_with("_live"));
                if let Err(e) = rec.start() {
                    return Err(format!("{e}"));
                }
            }

            *self.is_recording.lock().unwrap() = true;
            *state = RecordingState::Recording {
                binding_id: binding_id.to_string(),
            };
            debug!("Recording started for binding {binding_id}");
            Ok(())
        } else {
            Err("Already recording".to_string())
        }
    }

    /// Take (consume) the media-source snapshot captured when the current
    /// system-audio recording started. Returns `None` for microphone captures
    /// or when source attribution is disabled.
    pub fn take_system_source_snapshot(&self) -> Option<crate::media_source::MediaSnapshot> {
        self.system_source_snapshot.lock().unwrap().take()
    }

    pub fn update_selected_device(&self) -> Result<(), anyhow::Error> {
        // If currently open, restart the microphone stream to use the new device
        if *self.is_open.lock().unwrap() {
            self.stop_microphone_stream();
            self.start_microphone_stream()?;
        }

        // The config cache is per device, so the new one has never been probed.
        // Do it now in the background rather than on the user's next keypress.
        {
            let manager = self.clone();
            std::thread::spawn(move || {
                manager.preload_device_config();
            });
        }
        Ok(())
    }

    pub fn stop_recording(&self, binding_id: &str) -> Option<Vec<f32>> {
        let mut state = self.state.lock().unwrap();

        match *state {
            RecordingState::Recording {
                binding_id: ref active,
            } if active == binding_id => {
                *state = RecordingState::Idle;
                drop(state);

                // Optionally keep recording for a bit longer to capture trailing audio
                let settings = get_settings(&self.app_handle);
                if settings.extra_recording_buffer_ms > 0 {
                    debug!(
                        "Extra recording buffer: sleeping {}ms before stopping",
                        settings.extra_recording_buffer_ms
                    );
                    std::thread::sleep(Duration::from_millis(settings.extra_recording_buffer_ms));
                }

                let samples = if let Some(rec) = self.recorder.lock().unwrap().as_ref() {
                    match rec.stop() {
                        Ok(buf) => buf,
                        Err(e) => {
                            error!("stop() failed: {e}");
                            Vec::new()
                        }
                    }
                } else {
                    error!("Recorder not available");
                    Vec::new()
                };

                *self.is_recording.lock().unwrap() = false;

                // System audio (loopback) follows the app/system volume, which
                // is often low — boost quiet captures so Whisper gets a usable
                // signal. The microphone path is left untouched.
                let samples = if matches!(*self.current_source.lock().unwrap(), AudioSource::System)
                {
                    normalize_peak(samples, 0.95)
                } else {
                    samples
                };

                // On-demand mode keeps the stream, now stopped, for next time.
                // See release_after_recording for why closing it would be the
                // expensive choice, not the safe one.
                if matches!(*self.mode.lock().unwrap(), MicrophoneMode::OnDemand) {
                    self.release_after_recording();
                }

                // Pad if very short
                let s_len = samples.len();
                // debug!("Got {} samples", s_len);
                if s_len < WHISPER_SAMPLE_RATE && s_len > 0 {
                    let mut padded = samples;
                    padded.resize(WHISPER_SAMPLE_RATE * 5 / 4, 0.0);
                    Some(padded)
                } else {
                    Some(samples)
                }
            }
            _ => None,
        }
    }
    pub fn is_recording(&self) -> bool {
        matches!(
            *self.state.lock().unwrap(),
            RecordingState::Recording { .. }
        )
    }

    /// Snapshot of the audio captured so far in the current recording (16 kHz
    /// mono), for live transcription. Empty when no stream is open.
    pub fn current_samples(&self) -> Vec<f32> {
        self.recorder
            .lock()
            .unwrap()
            .as_ref()
            .map(|r| r.current_samples())
            .unwrap_or_default()
    }

    /// Cancel any ongoing recording without returning audio samples
    pub fn cancel_recording(&self) {
        let mut state = self.state.lock().unwrap();

        if let RecordingState::Recording { .. } = *state {
            *state = RecordingState::Idle;
            drop(state);

            if let Some(rec) = self.recorder.lock().unwrap().as_ref() {
                let _ = rec.stop(); // Discard the result
            }

            *self.is_recording.lock().unwrap() = false;

            // Same as a finished recording: the device is already stopped.
            if matches!(*self.mode.lock().unwrap(), MicrophoneMode::OnDemand) {
                self.release_after_recording();
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::looks_like_bluetooth;

    #[test]
    fn bluetooth_headsets_are_recognised_by_name() {
        // How Windows names these endpoints, in English and in Spanish.
        assert!(looks_like_bluetooth(
            "Headset (Jabra Evolve2 Hands-Free AG Audio)"
        ));
        assert!(looks_like_bluetooth(
            "Micrófono (Auriculares manos libres AG Audio)"
        ));
        assert!(looks_like_bluetooth("Bluetooth Audio Renderer"));
    }

    #[test]
    fn wired_and_built_in_microphones_are_not() {
        // The last one matters: a wired headset is not a Bluetooth one, and
        // matching on "headset" alone would have taken the slow path for it.
        assert!(!looks_like_bluetooth(
            "Varios micrófonos (Intel® Smart Sound Technology for Digital Microphones)"
        ));
        assert!(!looks_like_bluetooth("Micrófono (fifine SC3)"));
        assert!(!looks_like_bluetooth(
            "Headset Microphone (USB Audio Device)"
        ));
    }
}
