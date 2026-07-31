//! Hands-free activation: say "VoCript" and dictation starts.
//!
//! ## How it listens
//!
//! Two ears, cheapest first. Every window of microphone audio is compared, as
//! sound, against the recordings made while teaching the word — template
//! matching: nearly free and instant, but it wants the word said roughly the
//! way it was recorded. When that misses and the window holds one short, lone
//! utterance — the shape of a wake word said on purpose — the speech model
//! reads it and the *text* is compared instead, which does not care about
//! intonation at all. Continuous conversation never reaches the model: the
//! isolation gate filters it out, so silence and chatter alike cost almost
//! nothing.
//!
//! Consecutive windows overlap (see `CARRY_SECONDS`): without that, a word
//! spoken across the cut between two windows arrived as two useless halves and
//! matched neither.
//!
//! The alternative, a purpose-built wake-word model, was ruled out for now:
//! Picovoice's Porcupine starts at $6,000 for commercial use, and openWakeWord's
//! pre-trained models are non-commercial. See `VoCript-Core/product/
//! wake-word-spike.md`. The detector lives behind this module so swapping in a
//! trained model later touches nothing else.

mod acoustic;
mod matcher;

use crate::audio_toolkit::constants::WHISPER_SAMPLE_RATE;
use crate::audio_toolkit::AudioRecorder;
use crate::managers::transcription::TranscriptionManager;
use crate::settings::get_settings;
use log::{debug, info, warn};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tauri::{AppHandle, Manager};

pub use matcher::{contains_wake_word, matches_taught_sample, strip_wake_word};

/// Longest the teaching capture will wait for the user to speak.
///
/// It does not simply record a fixed window: pressing a button and immediately
/// speaking is not how people behave, so a blind 2.5 s recording often caught
/// half the word or none of it, and reported "I did not hear anything". Instead
/// it waits, and stops on its own once the word is done.
const TEACH_MAX: Duration = Duration::from_secs(4);
/// How often the incoming audio is checked while waiting.
const TEACH_POLL: Duration = Duration::from_millis(120);
/// Silence after speech that means the word is finished.
const TEACH_TAIL: Duration = Duration::from_millis(500);

/// Below this, a recording the user was actively speaking into carried nothing.
///
/// Only used while teaching, where someone is deliberately talking into the
/// microphone: there, near-zero means the stream is not being fed. It is *not*
/// safe to apply the same test to idle listening, because noise-suppressing
/// microphones legitimately output silence when nobody speaks.
const DEAD_DEVICE_RMS: f32 = 0.0005;

/// Time given to the audio driver to release the device after the listener's
/// thread has ended. The thread finishing is not the same as the device being
/// free, which is why captures failed every other attempt.
const DEVICE_HANDOVER: Duration = Duration::from_millis(350);

/// Internal marker for "the microphone gave us nothing at all", so the capture
/// can retry it instead of blaming the user. Also a translation key, for the
/// case where retrying does not help either.
const DEAD_DEVICE_ERROR: &str = "wakeWord.errors.deadDevice";

/// How long a voice-started dictation may run before being closed on its own.
/// Without a cap, one that never hears its stop word records indefinitely and
/// the listener stays deaf to new activations, which looks like it broke.
const MAX_VOICE_DICTATION: Duration = Duration::from_secs(90);

/// How long after starting by voice the stop word is ignored. Comfortably longer
/// than one listening window, so the trigger has scrolled out of the audio being
/// examined before the listener starts looking for the word again.
const STOP_WORD_GRACE: Duration = Duration::from_millis(2500);

/// Records the user saying the wake word once and stores its acoustic
/// fingerprint. Returns how many recordings are now stored.
#[tauri::command]
#[specta::specta]
pub async fn capture_wake_word_sample(app: AppHandle) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        // Pause rather than stop. Stopping only flags the thread; it keeps the
        // microphone until it next wakes up, so the capture was recording over a
        // device that was still held — which is why the first attempts failed.
        // Pausing makes the thread close the device itself, so we wait for that.
        let was_listening = stop_and_wait(&app);
        if was_listening {
            std::thread::sleep(DEVICE_HANDOVER);
        }

        // Retried once when the device comes back silent, which is a driver
        // handover problem rather than anything the user did. Without this the
        // capture failed on roughly every other attempt.
        let mut result = record_and_transcribe(&app);
        if matches!(result, Err(ref e) if e == DEAD_DEVICE_ERROR) {
            warn!("Microphone delivered silence; retrying the capture once");
            std::thread::sleep(DEVICE_HANDOVER);
            result = record_and_transcribe(&app);
        }
        if let Err(ref e) = result {
            warn!("Wake word sample capture failed: {}", e);
        }

        if was_listening {
            start(&app);
        }
        result
    })
    .await
    .map_err(|e| format!("Capture task failed: {}", e))?
}

fn record_and_transcribe(app: &AppHandle) -> Result<String, String> {
    // Warm the model now: right after the recording it reads the word back once
    // (see `store_taught_text`), and a cold model would add its whole loading
    // time to the teaching flow.
    if let Some(manager) = app.try_state::<Arc<TranscriptionManager>>() {
        manager.initiate_model_load();
    }

    // No VAD here either: teaching needs the raw recording, exactly as the
    // listener will hear it later.
    let mut recorder =
        AudioRecorder::new().map_err(|e| format!("Could not create recorder: {}", e))?;
    recorder
        .open(selected_microphone(app))
        .map_err(|e| format!("Could not open the microphone: {}", e))?;
    recorder
        .start()
        .map_err(|e| format!("Could not start recording: {}", e))?;

    // Wait for the word rather than for the clock: poll the incoming audio,
    // note when speech starts, and stop once it has been quiet for a moment.
    let deadline = std::time::Instant::now() + TEACH_MAX;
    let mut consumed = 0usize;
    let mut heard_speech = false;
    let mut quiet_since: Option<std::time::Instant> = None;

    while std::time::Instant::now() < deadline {
        std::thread::sleep(TEACH_POLL);
        let so_far = recorder.current_samples();
        if so_far.len() <= consumed {
            continue;
        }
        let fresh = &so_far[consumed..];
        consumed = so_far.len();

        if loudness(fresh) >= SPEECH_RMS {
            heard_speech = true;
            quiet_since = None;
        } else if heard_speech {
            match quiet_since {
                None => quiet_since = Some(std::time::Instant::now()),
                Some(since) if since.elapsed() >= TEACH_TAIL => break,
                _ => {}
            }
        }
    }

    let samples = recorder
        .stop()
        .map_err(|e| format!("Could not stop recording: {}", e))?;
    let _ = recorder.close();

    let level = loudness(&samples);
    info!(
        "Wake word teaching: {} samples, loudness {:.4}, speech detected: {}",
        samples.len(),
        level,
        heard_speech
    );
    if level < DEAD_DEVICE_RMS {
        // Not "you were too quiet": the stream carried no room noise at all.
        return Err(DEAD_DEVICE_ERROR.to_string());
    }
    if !heard_speech {
        // A key, not a sentence: the frontend translates it.
        return Err("wakeWord.errors.noSpeech".into());
    }

    // `fingerprint_word`, not `fingerprint`: people say the word two or three
    // times to fill the recording window, and storing all of it means only
    // saying it three times will ever match.
    let print = acoustic::fingerprint_word(&samples);
    if print.len() < 8 {
        return Err("wakeWord.errors.tooShort".into());
    }

    let mut templates = load_templates(app);
    templates.version = acoustic::FORMAT_VERSION;
    templates.prints.push(print);
    templates.threshold = acoustic::derive_threshold(&templates.prints);
    let count = templates.prints.len();
    save_templates(app, &templates)?;
    mark_templates_changed(app);

    info!(
        "Wake word recording {} saved, threshold now {:.2}",
        count, templates.threshold
    );

    // The same recording, read back as text and stored beside the fingerprint:
    // the listener's text ear compares against what this model actually writes
    // for this voice — "Ball Crypto", "Bocrypt" — which no list of guessed
    // spellings fully covers.
    store_taught_text(app, &samples);

    Ok(format!("{}", count))
}

/// Transcribes a teaching recording and stores the text the model produced.
///
/// Best effort by design: the fingerprint is already saved, and a teaching that
/// fails here still taught the sound. Guarded against junk, because a stored
/// everyday word would make the text ear fire on ordinary speech ever after.
fn store_taught_text(app: &AppHandle, samples: &[f32]) {
    let Some(manager) = app.try_state::<Arc<TranscriptionManager>>() else {
        return;
    };
    let deadline = std::time::Instant::now() + Duration::from_secs(6);
    while !manager.is_model_loaded() && std::time::Instant::now() < deadline {
        manager.initiate_model_load();
        std::thread::sleep(Duration::from_millis(250));
    }
    if !manager.is_model_loaded() {
        warn!("Wake word teaching: model never loaded, text sample skipped");
        return;
    }

    let text = match manager.transcribe(pad_to_one_second(samples.to_vec())) {
        Ok(text) => text.trim().to_string(),
        Err(e) => {
            warn!(
                "Wake word teaching: could not read the recording back: {}",
                e
            );
            return;
        }
    };

    // One spoken word must come back as one short line. Too short would match
    // everything; too long is the model hallucinating a sentence.
    let letters = text.chars().filter(|c| c.is_alphanumeric()).count();
    let words = text.split_whitespace().count();
    if !(5..=25).contains(&letters) || words > 3 {
        info!(
            "Wake word teaching: text {:?} not stored (not word-shaped)",
            text
        );
        return;
    }
    // "script" is a word this user says all day, and matcher.rs goes out of its
    // way to never fire on it. A taught sample containing it would undo that.
    let lowered = text.to_lowercase();
    if lowered
        .split(|c: char| !c.is_alphanumeric())
        .any(|word| word == "script" || word == "scripts")
    {
        info!(
            "Wake word teaching: text {:?} not stored (holds \"script\")",
            text
        );
        return;
    }

    let mut stored = get_settings(app).wake_word_samples;
    if stored.iter().any(|s| s.eq_ignore_ascii_case(&text)) {
        return;
    }
    stored.push(text.clone());
    if crate::shortcut::change_wake_word_samples_setting(app.clone(), stored).is_ok() {
        info!("Wake word teaching: stored text {:?}", text);
    }
}

/// Length of each listening window. Short, so the answer comes quickly; the
/// overlap below is what guarantees the whole word is always seen together.
const WINDOW: Duration = Duration::from_millis(1200);

/// Seconds of the previous window re-examined in front of the next one.
/// Windows used to be disjoint blocks, so a word said across the cut between
/// two of them arrived as two useless halves and matched neither — one more way
/// a perfectly good "VoCript" could be shrugged off. One second covers the
/// longest the word takes to say, wherever the cut falls.
const CARRY_SECONDS: f32 = 1.0;

/// Loudness above which a window is treated as speech.
///
/// Deliberately a plain RMS check instead of the Silero VAD used elsewhere. The
/// VAD does not just detect speech, it *trims* the audio to it, and those
/// clipped fragments are what made the model return nothing at all for windows
/// that clearly contained a word. Measuring loudness leaves the audio whole,
/// costs almost nothing, and the model itself is the real filter.
const SPEECH_RMS: f32 = 0.012;

/// Where the recorded fingerprints live. Not in the settings file: they are
/// arrays of numbers, not something a person edits.
fn templates_path(app: &AppHandle) -> Result<std::path::PathBuf, String> {
    crate::portable::app_data_dir(app)
        .map(|dir| dir.join("wake_word_templates.json"))
        .map_err(|e| format!("Could not resolve the app data directory: {}", e))
}

pub fn load_templates(app: &AppHandle) -> acoustic::Templates {
    let Ok(path) = templates_path(app) else {
        return acoustic::Templates::default();
    };
    let mut templates: acoustic::Templates = std::fs::read_to_string(path)
        .ok()
        .and_then(|raw| serde_json::from_str(&raw).ok())
        .unwrap_or_default();

    if templates.version != acoustic::FORMAT_VERSION && !templates.prints.is_empty() {
        warn!(
            "Wake word recordings were made by an older version ({} != {}); discarding them",
            templates.version,
            acoustic::FORMAT_VERSION
        );
        return acoustic::Templates::default();
    }

    // Recomputed rather than trusted. A threshold saved by an earlier version
    // was measured with a different distance and would be meaningless now —
    // too high, and everything matches; too low, and nothing does. Deriving it
    // from the recordings themselves keeps the two in step for good.
    if !templates.prints.is_empty() {
        templates.threshold = acoustic::derive_threshold(&templates.prints);
    }
    templates
}

fn save_templates(app: &AppHandle, templates: &acoustic::Templates) -> Result<(), String> {
    let path = templates_path(app)?;
    let raw = serde_json::to_string(templates)
        .map_err(|e| format!("Could not serialise the recordings: {}", e))?;
    std::fs::write(path, raw).map_err(|e| format!("Could not save the recordings: {}", e))
}

/// Root-mean-square loudness of a window, 0.0 for silence.
fn loudness(samples: &[f32]) -> f32 {
    if samples.is_empty() {
        return 0.0;
    }
    let sum: f32 = samples.iter().map(|s| s * s).sum();
    (sum / samples.len() as f32).sqrt()
}

#[derive(Default)]
pub struct WakeWordState {
    running: Arc<AtomicBool>,
    /// Suppressed while the user dictates with the keyboard: that pipeline needs
    /// the microphone, and hearing the dictation itself would retrigger.
    paused: Arc<AtomicBool>,
    /// A dictation that this listener started. It keeps listening through it, so
    /// saying the word again ends the dictation without touching the keyboard.
    awaiting_stop: Arc<AtomicBool>,
    /// Set when a dictation was ended by voice, so the transcription that comes
    /// out of it gets the spoken stop word removed before being pasted.
    strip_next: Arc<AtomicBool>,
    /// Raised when the recordings on disk change. The loop reloads them instead
    /// of being restarted, which is what deadlocked it: stopping only flags the
    /// thread, so a new one would wait forever on the microphone the old one
    /// still held.
    reload: Arc<AtomicBool>,
    recorder: Arc<Mutex<Option<AudioRecorder>>>,
    /// Kept so a restart can wait for the previous thread to actually finish.
    worker: Arc<Mutex<Option<std::thread::JoinHandle<()>>>>,
}

/// Starts listening, if the setting is on and it is not already running.
pub fn start(app: &AppHandle) {
    let state = app.state::<WakeWordState>();
    if state.running.swap(true, Ordering::SeqCst) {
        return;
    }
    state.paused.store(false, Ordering::SeqCst);

    // Wait out any previous thread. Without this the new one blocks on the
    // recorder the old one has not released yet, and the listener dies silently.
    //
    // The lock is released before joining: holding it across a join of up to a
    // listening window blocks everything else that touches this state.
    let previous = state.worker.lock().unwrap().take();
    if let Some(previous) = previous {
        let _ = previous.join();
    }

    let app = app.clone();
    let running = Arc::clone(&state.running);
    let paused = Arc::clone(&state.paused);
    let recorder_slot = Arc::clone(&state.recorder);

    let awaiting_stop = Arc::clone(&state.awaiting_stop);
    let reload = Arc::clone(&state.reload);

    let handle = std::thread::spawn(move || {
        info!("Wake word listener started");
        if let Err(e) = listen_loop(
            &app,
            &running,
            &paused,
            &awaiting_stop,
            &reload,
            &recorder_slot,
        ) {
            warn!("Wake word listener stopped: {}", e);
        }
        running.store(false, Ordering::SeqCst);
        if let Some(mut recorder) = recorder_slot.lock().unwrap().take() {
            let _ = recorder.close();
        }
        info!("Wake word listener stopped");
    });
    *state.worker.lock().unwrap() = Some(handle);
}

/// Tells a running listener to pick up the recordings again.
fn mark_templates_changed(app: &AppHandle) {
    if let Some(state) = app.try_state::<WakeWordState>() {
        state.reload.store(true, Ordering::SeqCst);
    }
}

pub fn stop(app: &AppHandle) {
    let state = app.state::<WakeWordState>();
    state.running.store(false, Ordering::SeqCst);
}

/// Stops the listener and **waits for its thread to finish**, which is the only
/// point at which the microphone is guaranteed to be free.
///
/// Pausing and waiting for a flag was not enough: the flag could still be set
/// from an earlier pause, so a capture would start while the listener still had
/// the device and record pure silence — intermittently, which is worse. Ending
/// the thread outright removes the whole class of problem. It costs up to one
/// listening window, which nobody notices when they are about to speak anyway.
fn stop_and_wait(app: &AppHandle) -> bool {
    let Some(state) = app.try_state::<WakeWordState>() else {
        return false;
    };
    let was_running = state.running.swap(false, Ordering::SeqCst);
    let handle = state.worker.lock().unwrap().take();
    if let Some(handle) = handle {
        let _ = handle.join();
    }
    was_running
}

/// Deletes every recording, so the user can start teaching from scratch.
#[tauri::command]
#[specta::specta]
pub fn clear_wake_word_recordings(app: AppHandle) -> Result<(), String> {
    save_templates(&app, &acoustic::Templates::default())?;
    mark_templates_changed(&app);
    // The taught text belongs to those recordings: clearing one without the
    // other would leave the text ear matching a voice that was just erased.
    let _ = crate::shortcut::change_wake_word_samples_setting(app, Vec::new());
    Ok(())
}

/// How many recordings are stored, for the settings screen.
#[tauri::command]
#[specta::specta]
pub fn count_wake_word_recordings(app: AppHandle) -> u32 {
    load_templates(&app).prints.len() as u32
}

/// Silences the listener while the user dictates, so it neither competes for the
/// microphone nor hears the dictation itself and fires again.
///
/// Does nothing when the dictation was started by voice: that one has to be
/// stoppable by voice too, which means staying awake through it.
pub fn pause(app: &AppHandle) {
    if let Some(state) = app.try_state::<WakeWordState>() {
        if state.awaiting_stop.load(Ordering::SeqCst) {
            return;
        }
        state.paused.store(true, Ordering::SeqCst);
    }
}

pub fn resume(app: &AppHandle) {
    if let Some(state) = app.try_state::<WakeWordState>() {
        state.paused.store(false, Ordering::SeqCst);
        state.awaiting_stop.store(false, Ordering::SeqCst);
    }
}

/// Consumes the "this dictation ended by voice" flag. Returns true once per
/// voice-ended dictation, so ordinary keyboard dictations keep their text
/// untouched even when the word happens to appear in them.
pub fn take_strip_flag(app: &AppHandle) -> bool {
    app.try_state::<WakeWordState>()
        .map(|state| state.strip_next.swap(false, Ordering::SeqCst))
        .unwrap_or(false)
}

fn listen_loop(
    app: &AppHandle,
    running: &AtomicBool,
    paused: &AtomicBool,
    awaiting_stop: &AtomicBool,
    reload: &AtomicBool,
    recorder_slot: &Mutex<Option<AudioRecorder>>,
) -> Result<(), String> {
    // No VAD and no level callback: the audio must reach the model untrimmed,
    // and the wake word must not drive the on-screen audio meter.
    let recorder = AudioRecorder::new().map_err(|e| format!("Could not create recorder: {}", e))?;
    *recorder_slot.lock().unwrap() = Some(recorder);
    let mut open_device: Option<Option<String>> = None;
    // Consecutive windows with no signal at all, used to spot a dead stream.
    let mut dead_windows = 0u32;
    // When the current voice-started dictation began, to cap how long it runs.
    let mut dictation_started: Option<std::time::Instant> = None;
    // Whether the previous pass was paused, so the device gets a moment to settle.
    let mut was_paused = false;
    // Tail of the previous window, re-examined in front of the next one so a
    // word said across the cut between windows is still seen whole.
    let mut carry: Vec<f32> = Vec::new();
    // When the stop word was last checked by text, to throttle the model.
    let mut last_stop_text_check: Option<std::time::Instant> = None;
    // Counts windows between model keep-warm requests.
    let mut warm_check = 0u32;

    let mut templates = load_templates(app);
    info!(
        "Wake word listening with {} recording(s), threshold {:.2}",
        templates.prints.len(),
        templates.threshold
    );

    // The text ear needs the model resident, recordings or not: a model that
    // has to load first misses the very word that asked for it.
    if let Some(manager) = app.try_state::<Arc<TranscriptionManager>>() {
        manager.initiate_model_load();
    }

    while running.load(Ordering::SeqCst) {
        if reload.swap(false, Ordering::SeqCst) {
            templates = load_templates(app);
            info!(
                "Wake word reloaded {} recording(s), threshold {:.2}",
                templates.prints.len(),
                templates.threshold
            );
        }

        if paused.load(Ordering::SeqCst) {
            // Audio from before the pause must not leak into the next analysis.
            carry.clear();
            // Hand the microphone back entirely while the user dictates, rather
            // than just pausing capture: two open streams on one device show up
            // twice in the system's "in use" indicator and invite driver
            // trouble.
            //
            // Guarded by `open_device` because releasing it twice is fatal:
            // `AudioRecorder::stop` waits for a reply from the capture worker,
            // and once the recorder is closed there is no worker left to reply.
            // The wait never ends, and the listener silently dies — which is
            // exactly what happened after every teaching session, since pausing
            // runs on a loop while the recording takes place.
            if open_device.is_some() {
                if let Some(recorder) = recorder_slot.lock().unwrap().as_mut() {
                    let _ = recorder.stop();
                    let _ = recorder.close();
                }
                open_device = None;
                debug!("Wake word paused, microphone released");
            }
            was_paused = true;
            std::thread::sleep(Duration::from_millis(250));
            continue;
        }

        // Coming back from a pause, the dictation pipeline has just let go of
        // the device. Reopening immediately gets a stream Windows never feeds,
        // which is what kept triggering the "microphone went silent" recovery
        // after every dictation.
        if was_paused {
            was_paused = false;
            std::thread::sleep(DEVICE_HANDOVER);
        }

        // While a voice-started dictation runs, the main pipeline owns the
        // microphone. Opening a second stream on the same device leaves one of
        // them silent for good — the recorder never reopens a stream it thinks
        // is already open — which is why the wake word worked exactly once and
        // then never again. Read the pipeline's own audio instead.
        if awaiting_stop.load(Ordering::SeqCst) {
            carry.clear();
            if open_device.is_some() {
                if let Some(recorder) = recorder_slot.lock().unwrap().as_mut() {
                    // Only closed, never stopped: `capture_window` already
                    // stopped it, and a second stop leaves the worker waiting
                    // two seconds for an end-of-stream that will not come.
                    let _ = recorder.close();
                }
                open_device = None;
            }

            let waiting_since = *dictation_started.get_or_insert_with(std::time::Instant::now);
            if waiting_since.elapsed() > MAX_VOICE_DICTATION {
                // A dictation nobody closes would record forever and leave the
                // listener stuck waiting for a stop word instead of a start one.
                warn!("Voice dictation ran for too long without a stop word; ending it");
                awaiting_stop.store(false, Ordering::SeqCst);
                stop_dictation(app);
                dictation_started = None;
                continue;
            }

            // Grace period before listening for the stop word.
            //
            // The dictation starts recording while the word that triggered it is
            // still in the air, so its buffer contains that very word. Without
            // this, the listener heard its own trigger and stopped the dictation
            // in the same second it began — the log showed both lines sharing a
            // timestamp — leaving overlays flashing at random.
            if waiting_since.elapsed() >= STOP_WORD_GRACE {
                watch_dictation_for_stop(app, awaiting_stop, &templates, &mut last_stop_text_check);
            }
            std::thread::sleep(Duration::from_millis(300));
            continue;
        }
        dictation_started = None;
        last_stop_text_check = None;

        // Keep the model warm: VoCript unloads it after a while idle, and a
        // cold model would miss the first "VoCript" of the day — the exact
        // moment the feature is judged on. A no-op while the model is resident.
        warm_check += 1;
        if warm_check >= 25 {
            warm_check = 0;
            if let Some(manager) = app.try_state::<Arc<TranscriptionManager>>() {
                manager.initiate_model_load();
            }
        }

        let samples = capture_window(app, recorder_slot, &mut open_device)?;
        let level = loudness(&samples);

        // Exactly zero, and for a long stretch, before assuming the stream died.
        //
        // "Quieter than room noise" is not the test it seemed: this user's
        // microphone is a digital array with noise suppression, which outputs
        // perfect zeros when nobody speaks. Treating that as a fault reopened
        // the device every few seconds and broke the listening it meant to fix.
        // A stream Windows has stopped feeding reads 0.0 continuously; a real
        // microphone drifts above it the moment anyone moves.
        if level == 0.0 {
            dead_windows += 1;
            if dead_windows >= 20 {
                warn!("Wake word microphone went silent; reopening it");
                if let Some(recorder) = recorder_slot.lock().unwrap().as_mut() {
                    let _ = recorder.stop();
                    let _ = recorder.close();
                }
                open_device = None;
                dead_windows = 0;
                std::thread::sleep(DEVICE_HANDOVER);
            }
            continue;
        }
        dead_windows = 0;

        // The window under analysis is this capture with the previous one's
        // tail in front, so the word is seen whole wherever the cut fell.
        let mut analysis = std::mem::take(&mut carry);
        analysis.extend_from_slice(&samples);
        let carry_len = (CARRY_SECONDS * WHISPER_SAMPLE_RATE as f32) as usize;
        carry = samples[samples.len().saturating_sub(carry_len)..].to_vec();

        if loudness(&analysis) < SPEECH_RMS {
            continue;
        }

        // First ear: the sound itself, measured against the taught recordings.
        // Nearly free, and instant when the word is said the way it was taught.
        let acoustic_hit = if templates.prints.is_empty() {
            false
        } else {
            let distance = acoustic::best_distance(&acoustic::fingerprint(&analysis), &templates);
            if distance <= templates.threshold {
                info!(
                    "Wake word matched acoustically (distance {:.2} <= {:.2})",
                    distance, templates.threshold
                );
                true
            } else {
                // At info while the feature settles: the distances from a real
                // microphone are the only way to know if the threshold is sane.
                info!(
                    "Wake word: no acoustic match (distance {:.2} > {:.2})",
                    distance, templates.threshold
                );
                false
            }
        };

        // Second ear: the text. Sound matching wants the word said with the
        // tune it was recorded in, and nobody sings the same tune ten times out
        // of ten — that gap is where "it only works one time in ten" lived. The
        // speech model reads the utterance instead, and text does not care how
        // the word was sung.
        if !(acoustic_hit || confirm_by_text(app, &analysis)) {
            continue;
        }

        // The word may sit inside the tail that would be carried into the next
        // window, and matching it twice would toggle the dictation right off.
        carry.clear();

        if awaiting_stop.swap(false, Ordering::SeqCst) {
            info!("Wake word heard again: ending dictation");
            stop_dictation(app);
        } else {
            awaiting_stop.store(true, Ordering::SeqCst);
            trigger_dictation(app);
        }
    }

    Ok(())
}

/// Second ear of the listener: if the window holds one short, lone utterance,
/// the speech model reads it. Gated hard, because transcription is the only
/// expensive thing this module does — conversation and noise must never reach
/// the model, and with this gate they cannot.
fn confirm_by_text(app: &AppHandle, samples: &[f32]) -> bool {
    match isolated_utterance(samples) {
        Some(burst) => utterance_is_wake_word(app, burst, "text"),
        None => false,
    }
}

/// Reads one utterance with the speech model and decides by what it wrote.
///
/// The taught text goes first: it is what this model actually produces for this
/// voice, rather than a guess at how it might spell the name. The built-in
/// variants back it up.
fn utterance_is_wake_word(app: &AppHandle, burst: Vec<f32>, context: &str) -> bool {
    let Some(manager) = app.try_state::<Arc<TranscriptionManager>>() else {
        return false;
    };
    if !manager.is_model_loaded() {
        // Requested, not waited for: the loop must keep listening, and by the
        // next utterance the model is usually there.
        manager.initiate_model_load();
        debug!("Wake word {} check: model not loaded yet", context);
        return false;
    }

    let taught = get_settings(app).wake_word_samples;
    match manager.transcribe(pad_to_one_second(burst)) {
        Ok(text) if matches_taught_sample(&text, &taught) || contains_wake_word(&text) => {
            info!("Wake word read by the {} check: {:?}", context, text.trim());
            true
        }
        Ok(text) if text.trim().is_empty() => {
            info!("Wake word {} check: the model read nothing", context);
            false
        }
        Ok(text) => {
            info!(
                "Wake word {} check heard {:?}, not the word",
                context,
                text.trim().chars().take(40).collect::<String>()
            );
            false
        }
        Err(e) => {
            warn!("Wake word {} check failed to transcribe: {}", context, e);
            false
        }
    }
}

/// Finds a single short burst of speech with quiet around it — the shape of a
/// wake word said on purpose, and a shape conversation almost never makes.
/// Returns the burst with a little padding, or None for continuous speech,
/// mid-sentence words, or nothing at all.
fn isolated_utterance(samples: &[f32]) -> Option<Vec<f32>> {
    /// 100 ms of audio per measured chunk.
    const CHUNK: usize = 1_600;
    /// Quiet chunks tolerated inside a burst: the gap inside a stop consonant.
    const MAX_GAP: usize = 2;
    /// A burst shorter than 0.2 s is a click; longer than 1.4 s is a sentence.
    const MIN_CHUNKS: usize = 2;
    const MAX_CHUNKS: usize = 14;
    /// Quiet required before the burst. Fluent speech pauses less than this
    /// between words, which is what keeps every comma of a dictation from being
    /// read; a word said on purpose has it easily.
    const QUIET_BEFORE: usize = 5;
    /// Quiet required after it: a word still being said is left for the next,
    /// overlapping window, where it will be whole.
    const QUIET_AFTER: usize = 2;
    /// Padding returned around the burst, so the model hears the soft edges the
    /// loudness threshold cut off.
    const PAD: usize = 3_200;

    let levels: Vec<f32> = samples.chunks(CHUNK).map(loudness).collect();

    // Runs of loud chunks, merging gaps short enough to sit inside a word.
    let mut runs: Vec<(usize, usize)> = Vec::new();
    let mut start: Option<usize> = None;
    let mut last_loud = 0usize;
    for (index, &level) in levels.iter().enumerate() {
        if level >= SPEECH_RMS {
            if start.is_none() {
                start = Some(index);
            }
            last_loud = index;
        } else if let Some(begin) = start {
            if index - last_loud > MAX_GAP {
                runs.push((begin, last_loud));
                start = None;
            }
        }
    }
    if let Some(begin) = start {
        runs.push((begin, last_loud));
    }

    // Only the last burst matters: anything earlier was already examined inside
    // the previous, overlapping window.
    let &(begin, end) = runs.last()?;

    if !(MIN_CHUNKS..=MAX_CHUNKS).contains(&(end - begin + 1)) {
        return None;
    }
    let quiet_before = match runs.len() {
        1 => begin,
        n => begin - runs[n - 2].1 - 1,
    };
    if quiet_before < QUIET_BEFORE {
        return None;
    }
    if end + QUIET_AFTER >= levels.len() {
        return None;
    }

    let from = (begin * CHUNK).saturating_sub(PAD);
    let to = ((end + 1) * CHUNK + PAD).min(samples.len());
    Some(samples[from..to].to_vec())
}

/// Tail of the dictation audio examined for the stop word. Longer than the
/// listening window: it must hold the stop word *and* the pause before it.
const STOP_TAIL: Duration = Duration::from_millis(1800);

/// Cooldown between text readings of that tail. A dictation is speech from end
/// to end, so without it the model would re-read the same audio every poll.
const STOP_TEXT_EVERY: Duration = Duration::from_millis(1500);

/// Listens for the stop word inside the audio the dictation pipeline is already
/// capturing, so nothing competes for the microphone. Same two ears as the main
/// loop: sound first, text for what sound misses.
fn watch_dictation_for_stop(
    app: &AppHandle,
    awaiting_stop: &AtomicBool,
    templates: &acoustic::Templates,
    last_text_check: &mut Option<std::time::Instant>,
) {
    let Some(recording) = app.try_state::<Arc<crate::managers::audio::AudioRecordingManager>>()
    else {
        return;
    };

    let captured = recording.current_samples();
    let tail_len = (STOP_TAIL.as_secs_f32() * WHISPER_SAMPLE_RATE as f32) as usize;
    if captured.len() < tail_len {
        return;
    }

    let tail = &captured[captured.len() - tail_len..];
    if loudness(tail) < SPEECH_RMS {
        return;
    }

    if !templates.prints.is_empty() {
        let distance = acoustic::best_distance(&acoustic::fingerprint(tail), templates);
        if distance <= templates.threshold {
            info!(
                "Wake word heard again inside the dictation (distance {:.2}); stopping",
                distance
            );
            awaiting_stop.store(false, Ordering::SeqCst);
            stop_dictation(app);
            return;
        }
        // Logged so this phase stays visible: a listener quietly waiting for a
        // stop word is indistinguishable from a dead one.
        debug!(
            "Wake word waiting for the stop word (distance {:.2} > {:.2})",
            distance, templates.threshold
        );
    }

    if last_text_check.is_some_and(|at| at.elapsed() < STOP_TEXT_EVERY) {
        return;
    }
    let Some(burst) = isolated_utterance(tail) else {
        return;
    };
    *last_text_check = Some(std::time::Instant::now());

    if utterance_is_wake_word(app, burst, "stop") {
        awaiting_stop.store(false, Ordering::SeqCst);
        stop_dictation(app);
    }
}

/// The microphone the user actually picked in settings.
///
/// Passing `None` to the recorder opens the system default, which is how the
/// first version silently listened on the wrong device: the log showed the wake
/// word on "fifine SC3" while dictation ran on "Varios micrófonos (Intel)".
fn selected_microphone(app: &AppHandle) -> Option<cpal::Device> {
    let name = get_settings(app).selected_microphone?;
    if name.eq_ignore_ascii_case("default") {
        return None;
    }
    crate::audio_toolkit::list_input_devices()
        .ok()?
        .into_iter()
        .find(|d| d.name == name)
        .map(|d| d.device)
}

/// Records one window and returns it untouched.
///
/// `open_device` tracks which microphone the stream currently holds. The
/// recorder's `open` returns early when a stream already exists, so switching
/// microphone in settings only takes effect if the old one is closed first.
fn capture_window(
    app: &AppHandle,
    recorder_slot: &Mutex<Option<AudioRecorder>>,
    open_device: &mut Option<Option<String>>,
) -> Result<Vec<f32>, String> {
    let wanted = get_settings(app).selected_microphone;
    {
        let mut guard = recorder_slot.lock().unwrap();
        let recorder = guard
            .as_mut()
            .ok_or_else(|| "Recorder disappeared".to_string())?;

        // `Option<Option<String>>`: the outer layer says whether a stream is
        // open at all, the inner one which device. Tracking only the name lost
        // the difference between "closed" and "open on the default device", so
        // pausing never released the default microphone.
        if open_device.as_ref() != Some(&wanted) {
            let _ = recorder.close();
            recorder
                .open(selected_microphone(app))
                .map_err(|e| format!("Could not open the microphone: {}", e))?;
            *open_device = Some(wanted);
        }

        recorder
            .start()
            .map_err(|e| format!("Could not start listening: {}", e))?;
    }

    std::thread::sleep(WINDOW);

    let mut guard = recorder_slot.lock().unwrap();
    let recorder = guard
        .as_mut()
        .ok_or_else(|| "Recorder disappeared".to_string())?;
    recorder
        .stop()
        .map_err(|e| format!("Could not stop listening: {}", e))
}

/// Pads a short clip with silence, the way the dictation manager does before
/// its own transcriptions. Some engines reject or mangle very short audio, and
/// here that failure would be invisible: the wake word simply would not fire.
fn pad_to_one_second(mut samples: Vec<f32>) -> Vec<f32> {
    const ONE_SECOND: usize = 16_000;
    if samples.len() < ONE_SECOND {
        samples.resize(ONE_SECOND * 5 / 4, 0.0);
    }
    samples
}

/// Binding to drive. Honours the user's live-mode setting so a voice-started
/// dictation behaves exactly like one started from the keyboard, output and all.
fn dictation_binding(app: &AppHandle) -> &'static str {
    if get_settings(app).live_mode {
        "transcribe_live"
    } else {
        "transcribe"
    }
}

fn trigger_dictation(app: &AppHandle) {
    let binding = dictation_binding(app);
    crate::signal_handle::send_transcription_input(app, binding, "wake word");
}

/// Ends a voice-started dictation. The pipeline is a toggle, so the same input
/// that began it also finishes it — and from there the text is pasted, copied or
/// left in the bubble according to the user's own settings.
fn stop_dictation(app: &AppHandle) {
    // The pipeline is a toggle, so sending the input when nothing is recording
    // *starts* a dictation instead of ending one. That is where the overlay
    // appearing out of nowhere came from.
    let recording = app
        .try_state::<Arc<crate::managers::audio::AudioRecordingManager>>()
        .map(|rm| rm.is_recording())
        .unwrap_or(false);
    if !recording {
        debug!("Wake word: nothing is recording, so there is nothing to stop");
        return;
    }

    if let Some(state) = app.try_state::<WakeWordState>() {
        state.strip_next.store(true, Ordering::SeqCst);
    }
    let binding = dictation_binding(app);
    crate::signal_handle::send_transcription_input(app, binding, "wake word stop");
}

/// Applies the current setting: starts or stops the listener to match it.
///
/// Off the caller's thread, because starting waits for any previous listener to
/// finish — up to a full listening window. Doing that on the thread handling a
/// Tauri command freezes the window while the toggle is being flipped.
pub fn sync_with_settings(app: &AppHandle) {
    let app = app.clone();
    std::thread::spawn(move || {
        if get_settings(&app).wake_word_enabled {
            start(&app);
        } else {
            stop(&app);
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    fn tone(seconds: f32) -> Vec<f32> {
        let count = (16_000.0 * seconds) as usize;
        (0..count)
            .map(|i| (2.0 * std::f32::consts::PI * 440.0 * i as f32 / 16_000.0).sin() * 0.4)
            .collect()
    }

    fn silence(seconds: f32) -> Vec<f32> {
        vec![0.0; (16_000.0 * seconds) as usize]
    }

    fn clip(parts: &[Vec<f32>]) -> Vec<f32> {
        parts.iter().flatten().copied().collect()
    }

    #[test]
    fn a_lone_word_is_isolated() {
        let audio = clip(&[silence(0.8), tone(0.5), silence(0.5)]);
        let burst = isolated_utterance(&audio).expect("should find the word");
        // The burst holds the word plus padding, never the whole clip.
        assert!(burst.len() < audio.len());
        assert!(burst.len() >= (16_000.0 * 0.5) as usize);
    }

    #[test]
    fn continuous_speech_is_not_isolated() {
        assert!(isolated_utterance(&tone(2.0)).is_none());
    }

    #[test]
    fn a_word_still_being_said_waits_for_the_next_window() {
        // Speech running right into the end of the window: not finished yet.
        // The next, overlapping window will hold it whole.
        let audio = clip(&[silence(1.0), tone(0.6)]);
        assert!(isolated_utterance(&audio).is_none());
    }

    #[test]
    fn a_word_after_a_comma_pause_is_not_isolated() {
        // Fluent dictation: a phrase, a breath, one more word. Reading that
        // word would send every pause of a dictation to the speech model.
        let audio = clip(&[tone(1.0), silence(0.35), tone(0.4), silence(0.4)]);
        assert!(isolated_utterance(&audio).is_none());
    }

    #[test]
    fn a_word_after_a_real_pause_is_isolated() {
        let audio = clip(&[tone(0.8), silence(0.7), tone(0.5), silence(0.4)]);
        assert!(isolated_utterance(&audio).is_some());
    }

    #[test]
    fn silence_has_no_utterance() {
        assert!(isolated_utterance(&silence(2.0)).is_none());
    }
}
