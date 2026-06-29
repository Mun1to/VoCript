use crate::audio_toolkit::decode_audio_file_16k_mono;
use crate::managers::transcription::TranscriptionManager;
use crate::settings::{get_settings, write_settings, ModelUnloadTimeout};
use serde::Serialize;
use specta::Type;
use std::sync::Arc;
use tauri::{AppHandle, State};
use transcribe_rs::TranscriptionSegment;

#[derive(Serialize, Type)]
pub struct ModelLoadStatus {
    is_loaded: bool,
    current_model: Option<String>,
}

#[tauri::command]
#[specta::specta]
pub fn set_model_unload_timeout(app: AppHandle, timeout: ModelUnloadTimeout) {
    let mut settings = get_settings(&app);
    settings.model_unload_timeout = timeout;
    write_settings(&app, settings);
}

#[tauri::command]
#[specta::specta]
pub fn get_model_load_status(
    transcription_manager: State<Arc<TranscriptionManager>>,
) -> Result<ModelLoadStatus, String> {
    Ok(ModelLoadStatus {
        is_loaded: transcription_manager.is_model_loaded(),
        current_model: transcription_manager.get_current_model(),
    })
}

#[tauri::command]
#[specta::specta]
pub fn unload_model_manually(
    transcription_manager: State<Arc<TranscriptionManager>>,
) -> Result<(), String> {
    transcription_manager
        .unload_model()
        .map_err(|e| format!("Failed to unload model: {}", e))
}

/// Result of transcribing an imported audio/video file. Both the plain text
/// and the SRT subtitle string are returned so the UI can offer either.
#[derive(Serialize, Type)]
pub struct FileTranscriptionResult {
    pub text: String,
    pub srt: String,
    pub duration_secs: f32,
}

/// Decode an arbitrary audio/video file and transcribe it to text + SRT.
///
/// Runs on a blocking worker thread (not the UI thread) so a long file won't
/// freeze the window. The model is loaded on demand if not already in memory,
/// using the user's currently selected model and language.
#[tauri::command]
#[specta::specta]
pub async fn transcribe_file(
    transcription_manager: State<'_, Arc<TranscriptionManager>>,
    path: String,
) -> Result<FileTranscriptionResult, String> {
    let manager = transcription_manager.inner().clone();

    tokio::task::spawn_blocking(move || {
        let samples = decode_audio_file_16k_mono(&path)
            .map_err(|e| format!("Could not read the audio file: {}", e))?;

        if samples.is_empty() {
            return Err("The file contains no audio".to_string());
        }

        let duration_secs = samples.len() as f32 / 16_000.0;

        // Ensure a model is loaded (transcribe_segments waits for the load).
        manager.initiate_model_load();

        let result = manager
            .transcribe_segments(samples)
            .map_err(|e| format!("Transcription failed: {}", e))?;

        let srt = segments_to_srt(result.segments.as_deref(), &result.text, duration_secs);

        Ok(FileTranscriptionResult {
            text: result.text,
            srt,
            duration_secs,
        })
    })
    .await
    .map_err(|e| format!("Transcription task failed: {}", e))?
}

/// Save UTF-8 text (e.g. a transcription or SRT) to an arbitrary path chosen
/// by the user via the save dialog. Done on the backend to avoid having to
/// widen the frontend filesystem scope beyond `$APPDATA`.
#[tauri::command]
#[specta::specta]
pub fn save_text_file(path: String, content: String) -> Result<(), String> {
    std::fs::write(&path, content).map_err(|e| format!("Failed to save file: {}", e))
}

/// Read a UTF-8 text file chosen by the user via the open dialog (e.g. a CSV to
/// import into the personal dictionary). Done on the backend to avoid widening
/// the frontend filesystem scope beyond `$APPDATA`. Tolerates invalid bytes and
/// strips a leading UTF-8 BOM (Excel often adds one).
#[tauri::command]
#[specta::specta]
pub fn read_text_file(path: String) -> Result<String, String> {
    let bytes = std::fs::read(&path).map_err(|e| format!("Failed to read file: {}", e))?;
    let content = String::from_utf8_lossy(&bytes);
    Ok(content
        .strip_prefix('\u{feff}')
        .unwrap_or(&content)
        .to_string())
}

/// Build an SRT subtitle string from transcription segments. Falls back to a
/// single cue spanning the whole file when the engine produced no segments.
fn segments_to_srt(
    segments: Option<&[TranscriptionSegment]>,
    full_text: &str,
    duration_secs: f32,
) -> String {
    let mut out = String::new();
    let mut index = 1;

    match segments {
        Some(segs) if !segs.is_empty() => {
            for seg in segs {
                let text = seg.text.trim();
                if text.is_empty() {
                    continue;
                }
                out.push_str(&format!("{}\n", index));
                out.push_str(&format!(
                    "{} --> {}\n",
                    format_srt_timestamp(seg.start),
                    format_srt_timestamp(seg.end)
                ));
                out.push_str(text);
                out.push_str("\n\n");
                index += 1;
            }
        }
        _ => {
            let text = full_text.trim();
            if !text.is_empty() {
                out.push_str("1\n");
                out.push_str(&format!(
                    "{} --> {}\n",
                    format_srt_timestamp(0.0),
                    format_srt_timestamp(duration_secs)
                ));
                out.push_str(text);
                out.push_str("\n\n");
            }
        }
    }

    out
}

/// Format seconds as an SRT timestamp: `HH:MM:SS,mmm`.
fn format_srt_timestamp(seconds: f32) -> String {
    let total_ms = (seconds.max(0.0) * 1000.0).round() as u64;
    let ms = total_ms % 1000;
    let total_secs = total_ms / 1000;
    let s = total_secs % 60;
    let m = (total_secs / 60) % 60;
    let h = total_secs / 3600;
    format!("{:02}:{:02}:{:02},{:03}", h, m, s, ms)
}
