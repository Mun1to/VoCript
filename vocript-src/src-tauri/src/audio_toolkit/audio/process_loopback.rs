//! Per-application system-audio capture (Windows only) via WASAPI Process
//! Loopback. Lets VoCript transcribe the audio of a single app (e.g. Spotify)
//! instead of the whole system mix.
//!
//! cpal does not support process loopback, so this uses the `wasapi` crate
//! (which wraps `ActivateAudioInterfaceAsync` with the process-loopback
//! activation params and the async COM completion handler). The captured
//! samples are downmixed to mono and pushed through the same consumer pipeline
//! as the microphone/system paths (VAD, resampling, Whisper).

use std::collections::VecDeque;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;

use wasapi::{
    initialize_mta, AudioClient, DeviceEnumerator, Direction, SampleType, StreamMode, WaveFormat,
};

/// Capture format we request for the loopback client. WASAPI converts the
/// app's audio to this (autoconvert), and our pipeline resamples 48k→16k mono.
const CAPTURE_SAMPLE_RATE: usize = 48000;
const CAPTURE_CHANNELS: usize = 2;
const BYTES_PER_SAMPLE: usize = 4; // f32

/// An application that currently has an audio (render) session.
#[derive(Debug, Clone)]
pub struct AudioApp {
    pub pid: u32,
    pub name: String,
}

/// Resolve a PID to its executable file name (e.g. "Spotify.exe").
fn process_name(pid: u32) -> Option<String> {
    use windows::core::PWSTR;
    use windows::Win32::Foundation::CloseHandle;
    use windows::Win32::System::Threading::{
        OpenProcess, QueryFullProcessImageNameW, PROCESS_NAME_WIN32,
        PROCESS_QUERY_LIMITED_INFORMATION,
    };

    unsafe {
        let handle = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid).ok()?;
        let mut buf = [0u16; 260];
        let mut len = buf.len() as u32;
        let res = QueryFullProcessImageNameW(
            handle,
            PROCESS_NAME_WIN32,
            PWSTR(buf.as_mut_ptr()),
            &mut len,
        );
        let _ = CloseHandle(handle);
        res.ok()?;
        let path = String::from_utf16_lossy(&buf[..len as usize]);
        let name = path
            .rsplit(['\\', '/'])
            .next()
            .unwrap_or(&path)
            .trim()
            .to_string();
        if name.is_empty() {
            None
        } else {
            Some(name)
        }
    }
}

/// List apps that currently have an audio render session, deduplicated by
/// executable name. Used to populate the app selector in settings.
pub fn list_audio_apps() -> Result<Vec<AudioApp>, String> {
    let _ = initialize_mta();

    let enumerator = DeviceEnumerator::new().map_err(|e| format!("device enumerator: {e}"))?;
    let device = enumerator
        .get_default_device(&Direction::Render)
        .map_err(|e| format!("default render device: {e}"))?;
    let manager = device
        .get_iaudiosessionmanager()
        .map_err(|e| format!("session manager: {e}"))?;
    let sessions = manager
        .get_audiosessionenumerator()
        .map_err(|e| format!("session enumerator: {e}"))?;
    let count = sessions
        .get_count()
        .map_err(|e| format!("session count: {e}"))?;

    let mut apps: Vec<AudioApp> = Vec::new();
    for i in 0..count {
        let control = match sessions.get_session(i) {
            Ok(c) => c,
            Err(_) => continue,
        };
        // PID 0 is the system sounds session — skip it.
        let pid = match control.get_process_id() {
            Ok(p) => p,
            Err(_) => continue,
        };
        if pid == 0 {
            continue;
        }
        if let Some(name) = process_name(pid) {
            if apps.iter().any(|a| a.name.eq_ignore_ascii_case(&name)) {
                continue;
            }
            apps.push(AudioApp { pid, name });
        }
    }
    apps.sort_by_key(|a| a.name.to_lowercase());
    Ok(apps)
}

/// Find a currently-running PID for the given executable name (e.g. the app the
/// user previously selected), if it has an audio session right now.
pub fn find_pid_by_name(exe_name: &str) -> Option<u32> {
    // Compara sin distinguir mayúsculas y tolerando el sufijo ".exe", para que
    // un valor guardado como "Spotify" encuentre el proceso "Spotify.exe".
    fn norm(s: &str) -> String {
        let lower = s.to_lowercase();
        lower.strip_suffix(".exe").unwrap_or(&lower).to_string()
    }
    let target = norm(exe_name);
    list_audio_apps()
        .ok()?
        .into_iter()
        .find(|a| norm(&a.name) == target)
        .map(|a| a.pid)
}

/// Run the process-loopback capture loop on the current thread until `shutdown`
/// is set. `on_ready` is called exactly once after init (Ok or Err). While
/// running, mono f32 chunks are delivered via `on_chunk`. When `stop` is set,
/// `on_stop` is invoked once (so the caller can emit an end-of-stream marker),
/// and audio is discarded until `stop` clears again.
pub fn run_capture<R, C, S>(
    pid: u32,
    include_tree: bool,
    stop: Arc<AtomicBool>,
    shutdown: Arc<AtomicBool>,
    on_ready: R,
    mut on_chunk: C,
    mut on_stop: S,
) where
    R: FnOnce(Result<(), String>),
    C: FnMut(Vec<f32>),
    S: FnMut(),
{
    let setup = || -> Result<_, String> {
        let _ = initialize_mta();
        let mut client = AudioClient::new_application_loopback_client(pid, include_tree)
            .map_err(|e| format!("loopback client: {e}"))?;
        let format = WaveFormat::new(
            32,
            32,
            &SampleType::Float,
            CAPTURE_SAMPLE_RATE,
            CAPTURE_CHANNELS,
            None,
        );
        client
            .initialize_client(
                &format,
                &Direction::Capture,
                &StreamMode::EventsShared {
                    autoconvert: true,
                    buffer_duration_hns: 0,
                },
            )
            .map_err(|e| format!("initialize: {e}"))?;
        let h_event = client
            .set_get_eventhandle()
            .map_err(|e| format!("event handle: {e}"))?;
        let capture_client = client
            .get_audiocaptureclient()
            .map_err(|e| format!("capture client: {e}"))?;
        client.start_stream().map_err(|e| format!("start: {e}"))?;
        Ok((client, h_event, capture_client))
    };

    let (client, h_event, capture_client) = match setup() {
        Ok(v) => {
            on_ready(Ok(()));
            v
        }
        Err(e) => {
            on_ready(Err(e));
            return;
        }
    };

    let block_align = BYTES_PER_SAMPLE * CAPTURE_CHANNELS;
    let mut queue: VecDeque<u8> = VecDeque::new();
    let mut eos_sent = false;
    let mut frames_since_start: u64 = 0;

    log::info!("[loopback] capture thread running for pid {pid}");

    while !shutdown.load(Ordering::Relaxed) {
        // WASAPI loopback fires no event while the app is silent, so the wait
        // times out periodically — that's expected.
        let got_event = h_event.wait_for_event(300).is_ok();

        // Honour Stop promptly (even with no audio flowing) so stop()/cancel
        // never hang and the consumer can drain.
        if stop.load(Ordering::Relaxed) {
            if !eos_sent {
                log::info!(
                    "[loopback] stop requested — captured {} frames this take",
                    frames_since_start
                );
                on_stop();
                eos_sent = true;
            }
            queue.clear();
            frames_since_start = 0;
            continue;
        }

        if !got_event {
            continue;
        }
        eos_sent = false;

        if capture_client
            .read_from_device_to_deque(&mut queue)
            .is_err()
        {
            break;
        }

        let frames = queue.len() / block_align;
        if frames == 0 {
            continue;
        }
        let mut mono = Vec::with_capacity(frames);
        for _ in 0..frames {
            let mut acc = 0f32;
            for _ in 0..CAPTURE_CHANNELS {
                let b = [
                    queue.pop_front().unwrap_or(0),
                    queue.pop_front().unwrap_or(0),
                    queue.pop_front().unwrap_or(0),
                    queue.pop_front().unwrap_or(0),
                ];
                acc += f32::from_le_bytes(b);
            }
            mono.push(acc / CAPTURE_CHANNELS as f32);
        }
        frames_since_start += mono.len() as u64;
        on_chunk(mono);
    }

    let _ = client.stop_stream();
    log::info!("[loopback] capture thread ended for pid {pid}");
}

/// Sample rate of the mono chunks produced by [`run_capture`].
pub fn capture_sample_rate() -> u32 {
    CAPTURE_SAMPLE_RATE as u32
}
