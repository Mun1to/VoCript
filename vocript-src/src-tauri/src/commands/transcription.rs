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
    /// How long the last dictation took to transcribe, in milliseconds, or
    /// `None` if nothing has been transcribed since the app started.
    last_transcription_ms: Option<u64>,
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
        last_transcription_ms: transcription_manager.last_transcription_ms(),
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

/// Save a PNG drawn by the frontend (the shareable streak card) to a path the
/// user chose in the save dialog. Arrives as base64 because a `Vec<u8>` would
/// cross the bridge as a JSON array of numbers, four times the size. Refuses
/// anything that is not a `.png` holding PNG bytes: this writes wherever it is
/// told, so it should only ever write what it exists for. `async` so decoding
/// and writing a few MB runs off the main thread and cannot freeze the window.
#[tauri::command(async)]
#[specta::specta]
pub fn save_png_file(path: String, png_base64: String) -> Result<(), String> {
    use base64::{engine::general_purpose::STANDARD, Engine as _};

    if !path.to_lowercase().ends_with(".png") {
        return Err("Only .png files can be saved here".to_string());
    }
    let bytes = STANDARD
        .decode(png_base64.as_bytes())
        .map_err(|e| format!("Not valid base64: {}", e))?;
    if !bytes.starts_with(b"\x89PNG\r\n\x1a\n") {
        return Err("Not a PNG image".to_string());
    }
    std::fs::write(&path, bytes).map_err(|e| format!("Failed to save file: {}", e))
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

#[cfg(test)]
mod tests {
    use super::save_png_file;
    use base64::{engine::general_purpose::STANDARD, Engine as _};

    /// The smallest valid PNG: one transparent pixel.
    const PNG_1PX: &[u8] = &[
        0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44,
        0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x06, 0x00, 0x00, 0x00, 0x1f,
        0x15, 0xc4, 0x89, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9c, 0x63, 0x00,
        0x01, 0x00, 0x00, 0x05, 0x00, 0x01, 0x0d, 0x0a, 0x2d, 0xb4, 0x00, 0x00, 0x00, 0x00, 0x49,
        0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82,
    ];

    #[test]
    fn saves_a_png_byte_for_byte() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("card.PNG");
        save_png_file(path.to_string_lossy().into(), STANDARD.encode(PNG_1PX)).unwrap();
        assert_eq!(std::fs::read(&path).unwrap(), PNG_1PX);
    }

    #[test]
    fn refuses_anything_that_is_not_a_png() {
        let dir = tempfile::tempdir().unwrap();
        // Right bytes, wrong name: it would overwrite whatever that file is.
        let txt = dir.path().join("notes.txt");
        assert!(save_png_file(txt.to_string_lossy().into(), STANDARD.encode(PNG_1PX)).is_err());
        assert!(!txt.exists());
        // Right name, wrong bytes.
        let fake = dir.path().join("card.png");
        let text = STANDARD.encode(b"not an image");
        assert!(save_png_file(fake.to_string_lossy().into(), text).is_err());
        assert!(!fake.exists());
        // Not base64 at all.
        assert!(save_png_file(fake.to_string_lossy().into(), "%%%".into()).is_err());
    }
}
