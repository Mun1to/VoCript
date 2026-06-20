//! Live transcription loop.
//!
//! Whisper.cpp does not stream, so "live" transcription is done by periodically
//! re-transcribing the growing in-progress audio buffer and emitting the partial
//! text to the floating overlay bubble. The loop is sequential (it waits for each
//! transcription to finish before scheduling the next), which naturally throttles
//! it so transcriptions never overlap.

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Duration;

use tauri::{AppHandle, Manager};

use crate::managers::audio::AudioRecordingManager;
use crate::managers::transcription::TranscriptionManager;

/// Minimum captured audio (16 kHz mono) before producing a partial, so Whisper
/// doesn't hallucinate on near-empty audio. ~0.8 s.
const MIN_PARTIAL_SAMPLES: usize = 12_800;

/// How long to wait between partial re-transcriptions.
const PARTIAL_INTERVAL: Duration = Duration::from_millis(1500);

/// Holds the stop flag of the currently-running live loop (if any).
#[derive(Default)]
pub struct LiveState {
    stop: Mutex<Option<Arc<AtomicBool>>>,
}

/// Start the live partial-transcription loop, cancelling any previous one.
pub fn start(app: &AppHandle) {
    // Cancel a previous loop first so we never run two at once.
    stop(app);

    let stop_flag = Arc::new(AtomicBool::new(false));
    {
        let state = app.state::<LiveState>();
        *state.stop.lock().unwrap() = Some(stop_flag.clone());
    }

    let app = app.clone();
    std::thread::spawn(move || {
        let rm = app.state::<Arc<AudioRecordingManager>>().inner().clone();
        let tm = app.state::<Arc<TranscriptionManager>>().inner().clone();

        let mut last_len = 0usize;

        loop {
            // Wait in small slices so we react to stop quickly.
            let mut waited = Duration::ZERO;
            while waited < PARTIAL_INTERVAL {
                if stop_flag.load(Ordering::Relaxed) {
                    return;
                }
                std::thread::sleep(Duration::from_millis(100));
                waited += Duration::from_millis(100);
            }
            if stop_flag.load(Ordering::Relaxed) {
                return;
            }

            let samples = rm.current_samples();
            if samples.len() < MIN_PARTIAL_SAMPLES || samples.len() == last_len {
                continue;
            }
            last_len = samples.len();

            match tm.transcribe(samples) {
                Ok(text) => {
                    if stop_flag.load(Ordering::Relaxed) {
                        return;
                    }
                    if !text.trim().is_empty() {
                        crate::overlay::emit_live_text(&app, &text);
                    }
                }
                Err(e) => {
                    log::debug!("Live partial transcription failed: {}", e);
                }
            }
        }
    });
}

/// Stop the live transcription loop (no-op if none is running).
pub fn stop(app: &AppHandle) {
    let state = app.state::<LiveState>();
    let flag = state.stop.lock().unwrap().take();
    if let Some(flag) = flag {
        flag.store(true, Ordering::Relaxed);
    }
}
