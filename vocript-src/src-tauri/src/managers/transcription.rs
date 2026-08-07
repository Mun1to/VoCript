use crate::audio_toolkit::{
    apply_custom_words, apply_word_replacements, coding_commands, filter_transcription_output,
};
use crate::managers::audio::AudioRecordingManager;
use crate::managers::model::{EngineType, ModelManager};
use crate::settings::{
    get_settings, AppSettings, ModelUnloadTimeout, OrtAcceleratorSetting, WhisperAcceleratorSetting,
};
use anyhow::Result;
use log::{debug, error, info, warn};
use serde::Serialize;
use specta::Type;
use std::panic::{catch_unwind, AssertUnwindSafe};
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Arc, Condvar, Mutex, MutexGuard, OnceLock};
use std::thread;
use std::time::{Duration, SystemTime};
use tauri::{AppHandle, Emitter, Manager};
use transcribe_rs::{
    onnx::{
        canary::CanaryModel,
        cohere::CohereModel,
        gigaam::GigaAMModel,
        moonshine::{MoonshineModel, MoonshineVariant, StreamingModel},
        parakeet::{ParakeetModel, ParakeetParams, TimestampGranularity},
        sense_voice::{SenseVoiceModel, SenseVoiceParams},
        Quantization,
    },
    transcriber::{Transcriber, VadChunked, VadChunkedConfig},
    vad::{EnergyVad, SmoothedVad},
    whisper_cpp::{WhisperEngine, WhisperInferenceParams},
    SpeechModel, TranscribeOptions,
};

/// Audio longer than this (seconds) is split into VAD chunks before GigaAM
/// transcription. GigaAM's ONNX encoder has a fixed-length positional embedding,
/// so a single long clip overflows it and inference fails with an ONNX Runtime
/// broadcast error (e.g. "5000 by 8668"). Chunks stay well under that limit
/// (VadChunkedConfig caps them at 30 s); shorter clips keep the direct path.
const GIGAAM_CHUNK_THRESHOLD_SECS: f32 = 30.0;

#[derive(Clone, Debug, Serialize)]
pub struct ModelStateEvent {
    pub event_type: String,
    pub model_id: Option<String>,
    pub model_name: Option<String>,
    pub error: Option<String>,
}

enum LoadedEngine {
    Whisper(WhisperEngine),
    Parakeet(ParakeetModel),
    Moonshine(MoonshineModel),
    MoonshineStreaming(StreamingModel),
    SenseVoice(SenseVoiceModel),
    GigaAM(GigaAMModel),
    Canary(CanaryModel),
    Cohere(CohereModel),
}

/// What the idle watcher should do next.
#[derive(Clone, Copy, Debug)]
enum IdleAction {
    /// Nothing can time out right now, so block until something wakes us.
    /// This is the state the app sits in whenever no model is resident.
    Park,
    /// Sleep this long, sized to land on the unload deadline exactly.
    Sleep(Duration),
    /// The model has been idle past its limit — unload it now.
    Unload,
}

/// RAII guard that clears the `is_loading` flag and notifies waiters on drop.
/// Ensures the loading flag is always reset, even on early returns or panics.
pub struct LoadingGuard {
    is_loading: Arc<Mutex<bool>>,
    loading_condvar: Arc<Condvar>,
}

impl Drop for LoadingGuard {
    fn drop(&mut self) {
        let mut is_loading = self.is_loading.lock().unwrap();
        *is_loading = false;
        self.loading_condvar.notify_all();
    }
}

#[derive(Clone)]
pub struct TranscriptionManager {
    engine: Arc<Mutex<Option<LoadedEngine>>>,
    model_manager: Arc<ModelManager>,
    app_handle: AppHandle,
    current_model_id: Arc<Mutex<Option<String>>>,
    last_activity: Arc<AtomicU64>,
    shutdown_signal: Arc<AtomicBool>,
    /// Wake channel for the idle watcher. The bool is a "re-evaluate pending"
    /// flag, kept so a signal raised while the watcher is awake isn't lost.
    watcher_wake: Arc<(Mutex<bool>, Condvar)>,
    watcher_handle: Arc<Mutex<Option<thread::JoinHandle<()>>>>,
    is_loading: Arc<Mutex<bool>>,
    loading_condvar: Arc<Condvar>,
}

impl TranscriptionManager {
    pub fn new(app_handle: &AppHandle, model_manager: Arc<ModelManager>) -> Result<Self> {
        let manager = Self {
            engine: Arc::new(Mutex::new(None)),
            model_manager,
            app_handle: app_handle.clone(),
            current_model_id: Arc::new(Mutex::new(None)),
            last_activity: Arc::new(AtomicU64::new(Self::now_ms())),
            shutdown_signal: Arc::new(AtomicBool::new(false)),
            watcher_wake: Arc::new((Mutex::new(false), Condvar::new())),
            watcher_handle: Arc::new(Mutex::new(None)),
            is_loading: Arc::new(Mutex::new(false)),
            loading_condvar: Arc::new(Condvar::new()),
        };

        // Start the idle watcher.
        //
        // The watcher is event-driven rather than periodic: it sleeps until the
        // loaded model's unload deadline, and parks indefinitely whenever there
        // is no deadline to wait for (no model resident, or a Never/Immediately
        // timeout). load_model(), unload_model(), write_settings() and shutdown
        // all wake it via wake_idle_watcher(), so parking never costs
        // responsiveness. A tray-resident app therefore performs zero idle
        // wakeups instead of one every 10 seconds.
        {
            let manager_cloned = manager.clone();
            let shutdown_signal = manager.shutdown_signal.clone();
            let wake = manager.watcher_wake.clone();
            let handle = thread::spawn(move || {
                debug!("Idle watcher thread started");
                loop {
                    if shutdown_signal.load(Ordering::Acquire) {
                        break;
                    }

                    let wait_for = match manager_cloned.next_idle_action() {
                        IdleAction::Unload => {
                            if manager_cloned.is_model_loaded() {
                                let unload_start = std::time::Instant::now();
                                info!("Model idle past its unload limit, unloading");
                                match manager_cloned.unload_model() {
                                    Ok(()) => {
                                        info!(
                                            "Model unloaded due to inactivity (took {}ms)",
                                            unload_start.elapsed().as_millis()
                                        );
                                    }
                                    Err(e) => {
                                        error!("Failed to unload idle model: {}", e);
                                    }
                                }
                            }
                            // Re-evaluate; with the model gone this parks.
                            continue;
                        }
                        IdleAction::Sleep(duration) => Some(duration),
                        IdleAction::Park => None,
                    };

                    let (lock, condvar) = &*wake;
                    let mut pending = lock.lock().unwrap_or_else(|p| p.into_inner());
                    // A wake raised while we were evaluating means the schedule
                    // is already stale — loop instead of sleeping on it.
                    if !*pending {
                        pending = match wait_for {
                            Some(duration) => {
                                condvar
                                    .wait_timeout(pending, duration)
                                    .unwrap_or_else(|p| p.into_inner())
                                    .0
                            }
                            None => condvar.wait(pending).unwrap_or_else(|p| p.into_inner()),
                        };
                    }
                    *pending = false;
                }
                debug!("Idle watcher thread shutting down gracefully");
            });
            *manager.watcher_handle.lock().unwrap() = Some(handle);
        }

        Ok(manager)
    }

    /// Lock the engine mutex, recovering from poison if a previous transcription panicked.
    fn lock_engine(&self) -> MutexGuard<'_, Option<LoadedEngine>> {
        self.engine.lock().unwrap_or_else(|poisoned| {
            warn!("Engine mutex was poisoned by a previous panic, recovering");
            poisoned.into_inner()
        })
    }

    pub fn is_model_loaded(&self) -> bool {
        let engine = self.lock_engine();
        engine.is_some()
    }

    /// Atomically check whether a model load is in progress and, if not, mark
    /// one as starting. Returns a [`LoadingGuard`] whose [`Drop`] impl will
    /// clear the flag and wake waiters. Returns `None` if a load is already in
    /// progress.
    pub fn try_start_loading(&self) -> Option<LoadingGuard> {
        let mut is_loading = self.is_loading.lock().unwrap();
        if *is_loading {
            return None;
        }
        *is_loading = true;
        Some(LoadingGuard {
            is_loading: self.is_loading.clone(),
            loading_condvar: self.loading_condvar.clone(),
        })
    }

    pub fn unload_model(&self) -> Result<()> {
        let unload_start = std::time::Instant::now();
        debug!("Starting to unload model");

        {
            let mut engine = self.lock_engine();
            // Dropping the engine frees all resources
            *engine = None;
        }
        {
            let mut current_model = self.current_model_id.lock().unwrap();
            *current_model = None;
        }

        // Emit unloaded event
        let _ = self.app_handle.emit(
            "model-state-changed",
            ModelStateEvent {
                event_type: "unloaded".to_string(),
                model_id: None,
                model_name: None,
                error: None,
            },
        );

        // Nothing left to time out — let the watcher fall back to parking.
        self.wake_idle_watcher();

        let unload_duration = unload_start.elapsed();
        debug!(
            "Model unloaded manually (took {}ms)",
            unload_duration.as_millis()
        );
        Ok(())
    }

    fn now_ms() -> u64 {
        SystemTime::now()
            .duration_since(SystemTime::UNIX_EPOCH)
            .unwrap()
            .as_millis() as u64
    }

    /// Reset the idle timer to now.
    fn touch_activity(&self) {
        self.last_activity.store(Self::now_ms(), Ordering::Relaxed);
    }

    /// Wake the idle watcher so it recomputes its schedule.
    ///
    /// Call after anything that changes *when* the model should unload: a load,
    /// an unload, a settings write, or shutdown. Cheap, and safe to call
    /// spuriously — a redundant wake just costs one extra evaluation.
    pub fn wake_idle_watcher(&self) {
        let (lock, condvar) = &*self.watcher_wake;
        let mut pending = lock.lock().unwrap_or_else(|p| p.into_inner());
        *pending = true;
        condvar.notify_all();
    }

    /// Decide what the idle watcher should do next, without sleeping.
    ///
    /// Returns [`IdleAction::Park`] whenever nothing can time out, which lets
    /// the watcher block indefinitely rather than poll. The cheap
    /// `is_model_loaded` check comes first specifically so the idle path never
    /// touches the settings store.
    fn next_idle_action(&self) -> IdleAction {
        // Nothing resident means nothing to unload.
        if !self.is_model_loaded() {
            return IdleAction::Park;
        }

        let timeout = get_settings(&self.app_handle).model_unload_timeout;

        // `Immediately` is driven by maybe_unload_immediately() after each
        // transcription; treating it as 0s here would unload mid-recording.
        // `Never` has no deadline at all. Both park until a settings write
        // wakes us.
        if timeout == ModelUnloadTimeout::Immediately {
            return IdleAction::Park;
        }
        let Some(limit_seconds) = timeout.to_seconds() else {
            return IdleAction::Park;
        };

        // While recording, keep the timer fresh so the model is never unloaded
        // mid-session, then re-check a full limit later.
        let is_recording = self
            .app_handle
            .try_state::<Arc<AudioRecordingManager>>()
            .is_some_and(|a| a.is_recording());
        if is_recording {
            self.touch_activity();
            return IdleAction::Sleep(Duration::from_secs(limit_seconds));
        }

        let idle_ms = Self::now_ms().saturating_sub(self.last_activity.load(Ordering::Relaxed));
        let limit_ms = limit_seconds.saturating_mul(1000);

        // Sleep straight to the deadline instead of polling toward it. The
        // extra millisecond avoids waking a hair early and looping twice.
        match limit_ms.checked_sub(idle_ms) {
            Some(remaining_ms) if remaining_ms > 0 => {
                IdleAction::Sleep(Duration::from_millis(remaining_ms.saturating_add(1)))
            }
            _ => IdleAction::Unload,
        }
    }

    /// Unloads the model immediately if the setting is enabled and the model is loaded
    pub fn maybe_unload_immediately(&self, context: &str) {
        let settings = get_settings(&self.app_handle);
        if settings.model_unload_timeout == ModelUnloadTimeout::Immediately
            && self.is_model_loaded()
        {
            info!("Immediately unloading model after {}", context);
            if let Err(e) = self.unload_model() {
                warn!("Failed to immediately unload model: {}", e);
            }
        }
    }

    pub fn load_model(&self, model_id: &str) -> Result<()> {
        let load_start = std::time::Instant::now();
        debug!("Starting to load model: {}", model_id);

        // Emit loading started event
        let _ = self.app_handle.emit(
            "model-state-changed",
            ModelStateEvent {
                event_type: "loading_started".to_string(),
                model_id: Some(model_id.to_string()),
                model_name: None,
                error: None,
            },
        );

        let model_info = self
            .model_manager
            .get_model_info(model_id)
            .ok_or_else(|| anyhow::anyhow!("Model not found: {}", model_id))?;

        if !model_info.is_downloaded {
            let error_msg = "Model not downloaded";
            let _ = self.app_handle.emit(
                "model-state-changed",
                ModelStateEvent {
                    event_type: "loading_failed".to_string(),
                    model_id: Some(model_id.to_string()),
                    model_name: Some(model_info.name.clone()),
                    error: Some(error_msg.to_string()),
                },
            );
            return Err(anyhow::anyhow!(error_msg));
        }

        let model_path = self.model_manager.get_model_path(model_id)?;

        // Create appropriate engine based on model type
        let emit_loading_failed = |error_msg: &str| {
            let _ = self.app_handle.emit(
                "model-state-changed",
                ModelStateEvent {
                    event_type: "loading_failed".to_string(),
                    model_id: Some(model_id.to_string()),
                    model_name: Some(model_info.name.clone()),
                    error: Some(error_msg.to_string()),
                },
            );
        };

        let loaded_engine = match model_info.engine_type {
            EngineType::Whisper => {
                let engine = WhisperEngine::load(&model_path).map_err(|e| {
                    let error_msg = format!("Failed to load whisper model {}: {}", model_id, e);
                    emit_loading_failed(&error_msg);
                    anyhow::anyhow!(error_msg)
                })?;
                LoadedEngine::Whisper(engine)
            }
            EngineType::Parakeet => {
                let engine =
                    ParakeetModel::load(&model_path, &Quantization::Int8).map_err(|e| {
                        let error_msg =
                            format!("Failed to load parakeet model {}: {}", model_id, e);
                        emit_loading_failed(&error_msg);
                        anyhow::anyhow!(error_msg)
                    })?;
                LoadedEngine::Parakeet(engine)
            }
            EngineType::Moonshine => {
                let engine = MoonshineModel::load(
                    &model_path,
                    MoonshineVariant::Base,
                    &Quantization::default(),
                )
                .map_err(|e| {
                    let error_msg = format!("Failed to load moonshine model {}: {}", model_id, e);
                    emit_loading_failed(&error_msg);
                    anyhow::anyhow!(error_msg)
                })?;
                LoadedEngine::Moonshine(engine)
            }
            EngineType::MoonshineStreaming => {
                let engine = StreamingModel::load(&model_path, 0, &Quantization::default())
                    .map_err(|e| {
                        let error_msg = format!(
                            "Failed to load moonshine streaming model {}: {}",
                            model_id, e
                        );
                        emit_loading_failed(&error_msg);
                        anyhow::anyhow!(error_msg)
                    })?;
                LoadedEngine::MoonshineStreaming(engine)
            }
            EngineType::SenseVoice => {
                let engine =
                    SenseVoiceModel::load(&model_path, &Quantization::Int8).map_err(|e| {
                        let error_msg =
                            format!("Failed to load SenseVoice model {}: {}", model_id, e);
                        emit_loading_failed(&error_msg);
                        anyhow::anyhow!(error_msg)
                    })?;
                LoadedEngine::SenseVoice(engine)
            }
            EngineType::GigaAM => {
                let engine = GigaAMModel::load(&model_path, &Quantization::Int8).map_err(|e| {
                    let error_msg = format!("Failed to load gigaam model {}: {}", model_id, e);
                    emit_loading_failed(&error_msg);
                    anyhow::anyhow!(error_msg)
                })?;
                LoadedEngine::GigaAM(engine)
            }
            EngineType::Canary => {
                let engine = CanaryModel::load(&model_path, &Quantization::Int8).map_err(|e| {
                    let error_msg = format!("Failed to load canary model {}: {}", model_id, e);
                    emit_loading_failed(&error_msg);
                    anyhow::anyhow!(error_msg)
                })?;
                LoadedEngine::Canary(engine)
            }
            EngineType::Cohere => {
                let engine = CohereModel::load(&model_path, &Quantization::Int8).map_err(|e| {
                    let error_msg = format!("Failed to load cohere model {}: {}", model_id, e);
                    emit_loading_failed(&error_msg);
                    anyhow::anyhow!(error_msg)
                })?;
                LoadedEngine::Cohere(engine)
            }
        };

        // Update the current engine and model ID
        {
            let mut engine = self.lock_engine();
            *engine = Some(loaded_engine);
        }
        {
            let mut current_model = self.current_model_id.lock().unwrap();
            *current_model = Some(model_id.to_string());
        }

        // Reset idle timer so the watcher doesn't immediately unload a just-loaded model
        self.touch_activity();
        // A model is now resident, so the watcher has a deadline to wait for.
        // Without this it would stay parked and never unload it.
        self.wake_idle_watcher();

        // Emit loading completed event
        let _ = self.app_handle.emit(
            "model-state-changed",
            ModelStateEvent {
                event_type: "loading_completed".to_string(),
                model_id: Some(model_id.to_string()),
                model_name: Some(model_info.name.clone()),
                error: None,
            },
        );

        let load_duration = load_start.elapsed();
        debug!(
            "Successfully loaded transcription model: {} (took {}ms)",
            model_id,
            load_duration.as_millis()
        );
        Ok(())
    }

    /// Kicks off the model loading in a background thread if it's not already loaded
    pub fn initiate_model_load(&self) {
        let mut is_loading = self.is_loading.lock().unwrap();
        if *is_loading || self.is_model_loaded() {
            return;
        }

        *is_loading = true;
        let self_clone = self.clone();
        thread::spawn(move || {
            let settings = get_settings(&self_clone.app_handle);
            if let Err(e) = self_clone.load_model(&settings.selected_model) {
                error!("Failed to load model: {}", e);
            }
            let mut is_loading = self_clone.is_loading.lock().unwrap();
            *is_loading = false;
            self_clone.loading_condvar.notify_all();
        });
    }

    pub fn get_current_model(&self) -> Option<String> {
        let current_model = self.current_model_id.lock().unwrap();
        current_model.clone()
    }

    pub fn transcribe(&self, audio: Vec<f32>) -> Result<String> {
        #[cfg(debug_assertions)]
        if std::env::var("HANDY_FORCE_TRANSCRIPTION_FAILURE").is_ok() {
            return Err(anyhow::anyhow!(
                "Simulated transcription failure (HANDY_FORCE_TRANSCRIPTION_FAILURE)"
            ));
        }

        // Update last activity timestamp
        self.touch_activity();

        let st = std::time::Instant::now();

        debug!("Audio vector length: {}", audio.len());

        if audio.is_empty() {
            debug!("Empty audio vector");
            self.maybe_unload_immediately("empty audio");
            return Ok(String::new());
        }

        // Resolve settings and language, then run the loaded engine. The
        // engine call is shared with file transcription via `run_loaded_engine`,
        // which waits for any in-progress model load and recovers from panics.
        let settings = get_settings(&self.app_handle);
        let validated_language = self.resolve_language(&settings);
        let result = self.run_loaded_engine(&audio, &settings, &validated_language)?;

        // Apply word correction if custom words are configured.
        // Skip for Whisper models since custom words are already passed as initial_prompt.
        let is_whisper = self
            .model_manager
            .get_model_info(&settings.selected_model)
            .map(|info| matches!(info.engine_type, EngineType::Whisper))
            .unwrap_or(false);

        let corrected_result = if !settings.custom_words.is_empty() && !is_whisper {
            apply_custom_words(
                &result.text,
                &settings.custom_words,
                settings.word_correction_threshold,
            )
        } else {
            result.text
        };

        // Filter out filler words and hallucinations
        let filtered_result = filter_transcription_output(
            &corrected_result,
            &settings.app_language,
            &settings.custom_filler_words,
        );

        // Personal dictionary (always) + the active professional profile's command
        // layer (coding symbols / custom commands). Deterministic exact replacements,
        // the last touch on every engine's output (including Whisper).
        let mut replacements = settings.word_replacements.clone();
        match settings.work_profile.as_deref() {
            Some("coding") => replacements.extend(coding_commands()),
            Some("custom") => replacements.extend(settings.custom_profile_commands.clone()),
            _ => {}
        }
        let replaced_result = apply_word_replacements(&filtered_result, &replacements);

        let et = std::time::Instant::now();
        let translation_note = if settings.translate_to_english {
            " (translated)"
        } else {
            ""
        };
        info!(
            "Transcription completed in {}ms{}",
            (et - st).as_millis(),
            translation_note
        );

        let final_result = replaced_result;

        if final_result.is_empty() {
            info!("Transcription result is empty");
        } else {
            info!("Transcription result: {}", final_result);
        }

        self.maybe_unload_immediately("transcription");

        Ok(final_result)
    }

    /// Resolve the user-selected language against the active model's supported
    /// languages, falling back to "auto" when unsupported (prevents engine errors).
    fn resolve_language(&self, settings: &AppSettings) -> String {
        if settings.selected_language == "auto" {
            "auto".to_string()
        } else {
            let is_supported = self
                .model_manager
                .get_model_info(&settings.selected_model)
                .map(|info| {
                    info.supported_languages.is_empty()
                        || info
                            .supported_languages
                            .contains(&settings.selected_language)
                })
                .unwrap_or(true);

            if is_supported {
                settings.selected_language.clone()
            } else {
                warn!(
                    "Language '{}' not supported by current model, falling back to auto-detect",
                    settings.selected_language
                );
                "auto".to_string()
            }
        }
    }

    /// Run the currently-loaded engine on `audio`, returning the raw result
    /// (full text + optional per-segment timestamps).
    ///
    /// Waits for any in-progress model load, then takes the engine out of the
    /// mutex for the duration of the call. Uses `catch_unwind` so an engine
    /// panic unloads the model instead of poisoning the mutex (which would hang
    /// the app on every subsequent operation). Shared by live dictation
    /// (`transcribe`) and file transcription (`transcribe_segments`).
    fn run_loaded_engine(
        &self,
        audio: &[f32],
        settings: &AppSettings,
        validated_language: &str,
    ) -> Result<transcribe_rs::TranscriptionResult> {
        // If a model load is in progress, wait for it to complete.
        {
            let mut is_loading = self.is_loading.lock().unwrap();
            while *is_loading {
                is_loading = self.loading_condvar.wait(is_loading).unwrap();
            }

            let engine_guard = self.lock_engine();
            if engine_guard.is_none() {
                return Err(anyhow::anyhow!("Model is not loaded for transcription."));
            }
        }

        let mut engine_guard = self.lock_engine();

        // Take the engine out so we own it during transcription. If it panics
        // we simply don't put it back (effectively unloading it).
        let mut engine = match engine_guard.take() {
            Some(e) => e,
            None => {
                return Err(anyhow::anyhow!(
                    "Model failed to load after auto-load attempt. Please check your model settings."
                ));
            }
        };

        // Release the lock before transcribing — no mutex held during the engine call.
        drop(engine_guard);

        let transcribe_result = catch_unwind(AssertUnwindSafe(
            || -> Result<transcribe_rs::TranscriptionResult> {
                match &mut engine {
                    LoadedEngine::Whisper(whisper_engine) => {
                        let whisper_language = if validated_language == "auto" {
                            None
                        } else {
                            let normalized = if validated_language == "zh-Hans"
                                || validated_language == "zh-Hant"
                            {
                                "zh".to_string()
                            } else {
                                validated_language.to_string()
                            };
                            Some(normalized)
                        };

                        let params = WhisperInferenceParams {
                            language: whisper_language,
                            translate: settings.translate_to_english,
                            initial_prompt: build_whisper_initial_prompt(
                                validated_language,
                                &settings.custom_words,
                                settings.translate_to_english,
                            ),
                            ..Default::default()
                        };

                        whisper_engine
                            .transcribe_with(audio, &params)
                            .map_err(|e| anyhow::anyhow!("Whisper transcription failed: {}", e))
                    }
                    LoadedEngine::Parakeet(parakeet_engine) => {
                        let params = ParakeetParams {
                            timestamp_granularity: Some(TimestampGranularity::Segment),
                            ..Default::default()
                        };
                        parakeet_engine
                            .transcribe_with(audio, &params)
                            .map_err(|e| anyhow::anyhow!("Parakeet transcription failed: {}", e))
                    }
                    LoadedEngine::Moonshine(moonshine_engine) => moonshine_engine
                        .transcribe(audio, &TranscribeOptions::default())
                        .map_err(|e| anyhow::anyhow!("Moonshine transcription failed: {}", e)),
                    LoadedEngine::MoonshineStreaming(streaming_engine) => streaming_engine
                        .transcribe(audio, &TranscribeOptions::default())
                        .map_err(|e| {
                            anyhow::anyhow!("Moonshine streaming transcription failed: {}", e)
                        }),
                    LoadedEngine::SenseVoice(sense_voice_engine) => {
                        let language = match validated_language {
                            "zh" | "zh-Hans" | "zh-Hant" => Some("zh".to_string()),
                            "en" => Some("en".to_string()),
                            "ja" => Some("ja".to_string()),
                            "ko" => Some("ko".to_string()),
                            "yue" => Some("yue".to_string()),
                            _ => None,
                        };
                        let params = SenseVoiceParams {
                            language,
                            use_itn: Some(true),
                        };
                        sense_voice_engine
                            .transcribe_with(audio, &params)
                            .map_err(|e| anyhow::anyhow!("SenseVoice transcription failed: {}", e))
                    }
                    LoadedEngine::GigaAM(gigaam_engine) => {
                        let duration_secs = audio.len() as f32 / 16_000.0;
                        if duration_secs > GIGAAM_CHUNK_THRESHOLD_SECS {
                            // Long clip: split on silence (energy VAD) into chunks
                            // that fit GigaAM's positional-embedding limit, then
                            // merge. Avoids the ONNX broadcast crash on long audio.
                            let vad =
                                SmoothedVad::new(Box::new(EnergyVad::new(480, 0.01)), 15, 15, 2);
                            let mut chunker = VadChunked::new(
                                Box::new(vad),
                                VadChunkedConfig::default(),
                                TranscribeOptions::default(),
                            );
                            chunker
                                .transcribe(gigaam_engine, audio)
                                .map_err(|e| anyhow::anyhow!("GigaAM transcription failed: {}", e))
                        } else {
                            gigaam_engine
                                .transcribe(audio, &TranscribeOptions::default())
                                .map_err(|e| anyhow::anyhow!("GigaAM transcription failed: {}", e))
                        }
                    }
                    LoadedEngine::Canary(canary_engine) => {
                        let lang = if validated_language == "auto" {
                            None
                        } else {
                            Some(validated_language.to_string())
                        };
                        let options = TranscribeOptions {
                            language: lang,
                            translate: settings.translate_to_english,
                            ..Default::default()
                        };
                        canary_engine
                            .transcribe(audio, &options)
                            .map_err(|e| anyhow::anyhow!("Canary transcription failed: {}", e))
                    }
                    LoadedEngine::Cohere(cohere_engine) => {
                        let lang = if validated_language == "auto" {
                            None
                        } else if validated_language == "zh-Hans" || validated_language == "zh-Hant"
                        {
                            Some("zh".to_string())
                        } else {
                            Some(validated_language.to_string())
                        };
                        let options = TranscribeOptions {
                            language: lang,
                            ..Default::default()
                        };
                        cohere_engine
                            .transcribe(audio, &options)
                            .map_err(|e| anyhow::anyhow!("Cohere transcription failed: {}", e))
                    }
                }
            },
        ));

        match transcribe_result {
            Ok(inner_result) => {
                // Success or normal error — put the engine back.
                let mut engine_guard = self.lock_engine();
                *engine_guard = Some(engine);
                inner_result
            }
            Err(panic_payload) => {
                // Engine panicked — do NOT put it back (unknown state). Dropping
                // `engine` here effectively unloads it.
                let panic_msg = if let Some(s) = panic_payload.downcast_ref::<&str>() {
                    s.to_string()
                } else if let Some(s) = panic_payload.downcast_ref::<String>() {
                    s.clone()
                } else {
                    "unknown panic".to_string()
                };
                error!(
                    "Transcription engine panicked: {}. Model has been unloaded.",
                    panic_msg
                );

                {
                    let mut current_model = self
                        .current_model_id
                        .lock()
                        .unwrap_or_else(|e| e.into_inner());
                    *current_model = None;
                }

                let _ = self.app_handle.emit(
                    "model-state-changed",
                    ModelStateEvent {
                        event_type: "unloaded".to_string(),
                        model_id: None,
                        model_name: None,
                        error: Some(format!("Engine panicked: {}", panic_msg)),
                    },
                );

                Err(anyhow::anyhow!(
                    "Transcription engine panicked: {}. The model has been unloaded and will reload on next attempt.",
                    panic_msg
                ))
            }
        }
    }

    /// Transcribe a complete audio buffer (e.g. an imported file) and return the
    /// full result including per-segment timestamps, for subtitle (SRT) export.
    ///
    /// Unlike [`Self::transcribe`], this keeps the raw engine output (no filler
    /// filtering) so the per-segment text stays aligned with the audio.
    pub fn transcribe_segments(
        &self,
        audio: Vec<f32>,
    ) -> Result<transcribe_rs::TranscriptionResult> {
        if audio.is_empty() {
            return Err(anyhow::anyhow!("Audio is empty"));
        }

        self.touch_activity();

        let settings = get_settings(&self.app_handle);
        let validated_language = self.resolve_language(&settings);

        let st = std::time::Instant::now();
        let result = self.run_loaded_engine(&audio, &settings, &validated_language)?;
        info!(
            "File transcription completed in {}ms ({} segments)",
            st.elapsed().as_millis(),
            result.segments.as_ref().map(|s| s.len()).unwrap_or(0)
        );

        self.maybe_unload_immediately("file transcription");

        Ok(result)
    }
}

/// Build the Whisper `initial_prompt`.
///
/// Whisper uses the initial prompt as fake "previous context", which strongly
/// biases the style of the output. For Spanish we seed it with a natural,
/// fully-accented and punctuated sentence so the model produces proper tildes
/// (á é í ó ú ñ ü) and opening punctuation (¿ ¡) with correct capitalization,
/// instead of stripping accents — by far the biggest quality win for Spanish.
///
/// Any user-defined custom words are appended so they are still biased for.
/// The Spanish seed is skipped when translating to English (where it would
/// only confuse the decoder).
fn build_whisper_initial_prompt(
    language: &str,
    custom_words: &[String],
    translate_to_english: bool,
) -> Option<String> {
    const SPANISH_SEED: &str = "Hola, ¿cómo estás? Esta es una transcripción en español con acentos, mayúsculas y signos de puntuación correctos. El niño y el pingüino comieron piña después del fútbol. ¡Qué día tan bonito!";

    let mut parts: Vec<String> = Vec::new();

    if !translate_to_english && (language == "es" || language.starts_with("es")) {
        parts.push(SPANISH_SEED.to_string());
    }

    if !custom_words.is_empty() {
        parts.push(custom_words.join(", "));
    }

    if parts.is_empty() {
        None
    } else {
        Some(parts.join(" "))
    }
}

/// Apply the user's accelerator preferences to the transcribe-rs global atomics.
/// Called on startup and whenever the user changes the setting.
pub fn apply_accelerator_settings(app: &tauri::AppHandle) {
    use transcribe_rs::accel;

    let settings = get_settings(app);

    let whisper_pref = match settings.whisper_accelerator {
        WhisperAcceleratorSetting::Auto => accel::WhisperAccelerator::Auto,
        WhisperAcceleratorSetting::Cpu => accel::WhisperAccelerator::CpuOnly,
        WhisperAcceleratorSetting::Gpu => accel::WhisperAccelerator::Gpu,
    };
    accel::set_whisper_accelerator(whisper_pref);
    accel::set_whisper_gpu_device(settings.whisper_gpu_device);
    info!(
        "Whisper accelerator set to: {}, gpu_device: {}",
        whisper_pref,
        if settings.whisper_gpu_device == accel::GPU_DEVICE_AUTO {
            "auto".to_string()
        } else {
            settings.whisper_gpu_device.to_string()
        }
    );

    let ort_pref = match settings.ort_accelerator {
        OrtAcceleratorSetting::Auto => accel::OrtAccelerator::Auto,
        OrtAcceleratorSetting::Cpu => accel::OrtAccelerator::CpuOnly,
        OrtAcceleratorSetting::Cuda => accel::OrtAccelerator::Cuda,
        OrtAcceleratorSetting::DirectMl => accel::OrtAccelerator::DirectMl,
        OrtAcceleratorSetting::Rocm => accel::OrtAccelerator::Rocm,
    };
    accel::set_ort_accelerator(ort_pref);
    info!("ORT accelerator set to: {}", ort_pref);
}

#[derive(Serialize, Clone, Debug, Type)]
pub struct GpuDeviceOption {
    pub id: i32,
    pub name: String,
    pub total_vram_mb: usize,
}

static GPU_DEVICES: OnceLock<Vec<GpuDeviceOption>> = OnceLock::new();

fn cached_gpu_devices() -> &'static [GpuDeviceOption] {
    use transcribe_rs::whisper_cpp::gpu::list_gpu_devices;

    GPU_DEVICES.get_or_init(|| {
        // ggml's Vulkan backend uses FMA3 instructions internally.
        // On older CPUs without FMA3 (e.g. Sandy Bridge Xeons) this causes
        // a SIGILL crash that cannot be caught. Skip enumeration entirely
        // on those CPUs — GPU-accelerated whisper won't work there anyway.
        #[cfg(target_arch = "x86_64")]
        if !std::arch::is_x86_feature_detected!("fma") {
            warn!("CPU lacks FMA3 support — skipping GPU device enumeration");
            return Vec::new();
        }

        list_gpu_devices()
            .into_iter()
            .map(|d| GpuDeviceOption {
                id: d.id,
                name: d.name,
                total_vram_mb: d.total_vram / (1024 * 1024),
            })
            .collect()
    })
}

#[derive(Serialize, Clone, Debug, Type)]
pub struct AvailableAccelerators {
    pub whisper: Vec<String>,
    pub ort: Vec<String>,
    pub gpu_devices: Vec<GpuDeviceOption>,
}

/// Return which accelerators are compiled into this build.
pub fn get_available_accelerators() -> AvailableAccelerators {
    use transcribe_rs::accel::OrtAccelerator;

    let ort_options: Vec<String> = OrtAccelerator::available()
        .into_iter()
        .map(|a| a.to_string())
        .collect();

    let whisper_options = vec!["auto".to_string(), "cpu".to_string(), "gpu".to_string()];

    AvailableAccelerators {
        whisper: whisper_options,
        ort: ort_options,
        gpu_devices: cached_gpu_devices().to_vec(),
    }
}

impl Drop for TranscriptionManager {
    fn drop(&mut self) {
        // Skip shutdown unless this is the very last clone. TranscriptionManager
        // is cloned by initiate_model_load() and the watcher thread — those
        // clones dropping must not kill the watcher. The watcher thread holds
        // its own clone, so engine's strong_count is always >= 2 while the
        // watcher is alive. When it reaches 1, only this instance remains
        // and we can safely shut down.
        if Arc::strong_count(&self.engine) > 1 {
            return;
        }

        // Signal the watcher thread to shutdown, then wake it so the join below
        // returns immediately instead of waiting out its current sleep.
        self.shutdown_signal.store(true, Ordering::Release);
        self.wake_idle_watcher();

        // Wait for the thread to finish gracefully
        if let Some(handle) = self.watcher_handle.lock().unwrap().take() {
            if let Err(e) = handle.join() {
                warn!("Failed to join idle watcher thread: {:?}", e);
            } else {
                debug!("Idle watcher thread joined successfully");
            }
        }
    }
}
