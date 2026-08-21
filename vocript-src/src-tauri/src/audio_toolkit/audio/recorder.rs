use std::{
    collections::HashMap,
    io::Error,
    sync::{
        atomic::{AtomicBool, Ordering},
        mpsc, Arc, Mutex, OnceLock,
    },
    time::Duration,
};

use cpal::{
    traits::{DeviceTrait, HostTrait, StreamTrait},
    Device, Sample, SizedSample,
};

use crate::audio_toolkit::{
    audio::{AudioVisualiser, FrameResampler},
    constants,
    vad::{self, VadFrame},
    VoiceActivityDetector,
};

/// Identifies a cached stream configuration: the same physical device is
/// probed differently depending on whether we capture it as an input or as a
/// loopback of its output.
#[derive(Clone, PartialEq, Eq, Hash)]
struct ConfigKey {
    device: String,
    loopback: bool,
}

/// Stream configurations already probed, keyed by device.
///
/// `supported_input_configs()` is the most expensive call between pressing the
/// shortcut and a live microphone: measured at 178-353 ms on WASAPI, as much as
/// opening the stream itself, because cpal probes the endpoint once per
/// candidate format. Its answer only changes when the device is reconfigured in
/// the OS, so paying it on every dictation threw away a quarter of a second of
/// speech each time - enough to lose the first word of a short one.
static CONFIG_CACHE: OnceLock<Mutex<HashMap<ConfigKey, cpal::SupportedStreamConfig>>> =
    OnceLock::new();

fn config_cache() -> &'static Mutex<HashMap<ConfigKey, cpal::SupportedStreamConfig>> {
    CONFIG_CACHE.get_or_init(|| Mutex::new(HashMap::new()))
}

/// Forget what we know about a device, so the next open probes it again.
/// Called when building a stream fails: a configuration that no longer matches
/// the hardware is the likeliest reason, and a cached wrong answer would keep
/// failing forever.
fn forget_cached_config(device: &Device) {
    if let Ok(name) = device.name() {
        config_cache()
            .lock()
            .unwrap()
            .retain(|k, _| k.device != name);
    }
}

enum Cmd {
    /// Turn the capture device on and begin collecting. Answers on the channel
    /// so the caller knows the microphone is really live before it tells the
    /// user to talk: turning a prepared stream on takes single-digit
    /// milliseconds, so waiting for that answer costs nothing.
    Start(mpsc::Sender<Result<(), String>>),
    Stop(mpsc::Sender<Vec<f32>>),
    Shutdown,
}

enum AudioChunk {
    Samples(Vec<f32>),
    EndOfStream,
}

pub struct AudioRecorder {
    device: Option<Device>,
    cmd_tx: Option<mpsc::Sender<Cmd>>,
    worker_handle: Option<std::thread::JoinHandle<()>>,
    vad: Option<Arc<Mutex<Box<dyn vad::VoiceActivityDetector>>>>,
    level_cb: Option<Arc<dyn Fn(Vec<f32>) + Send + Sync + 'static>>,
    /// Called once per recording, as soon as captured audio actually reaches
    /// the pipeline. Opening a capture device costs around 220 ms on WASAPI
    /// even with everything cached, and the UI used to claim it was recording
    /// from the instant the key went down - so anyone who started talking
    /// straight away lost their first word without the app ever showing it.
    ready_cb: Option<Arc<dyn Fn() + Send + Sync + 'static>>,
    /// Live snapshot of the audio captured so far in the current recording
    /// (16 kHz mono, post-VAD). The consumer thread appends to it; live
    /// transcription reads it via `current_samples()`.
    live_buffer: Arc<Mutex<Vec<f32>>>,
    /// Keep the device capturing between recordings instead of stopping it
    /// after each one. Only the always-on microphone mode wants this: it
    /// drives the level meter while idle. Everything else leaves the stream
    /// prepared but stopped, which captures nothing and costs no measurable
    /// CPU, yet turns on in about 7 ms instead of the ~250 ms a cold open
    /// costs on WASAPI.
    always_capturing: Arc<AtomicBool>,
    /// Whether to mirror captured audio into `live_buffer`. Off by default:
    /// mirroring unconditionally kept a second full copy of every recording in
    /// memory even with live mode disabled (~230 MB each for an hour of system
    /// audio), for a buffer nobody would ever read.
    mirror_live: Arc<AtomicBool>,
    /// Capture thread + shutdown flag for the WASAPI process-loopback path
    /// (per-app system audio, Windows only). `None` for the cpal path.
    #[cfg(windows)]
    capture_handle: Option<std::thread::JoinHandle<()>>,
    #[cfg(windows)]
    capture_shutdown: Option<Arc<AtomicBool>>,
}

impl AudioRecorder {
    pub fn new() -> Result<Self, Box<dyn std::error::Error>> {
        Ok(AudioRecorder {
            device: None,
            cmd_tx: None,
            worker_handle: None,
            vad: None,
            level_cb: None,
            ready_cb: None,
            always_capturing: Arc::new(AtomicBool::new(false)),
            live_buffer: Arc::new(Mutex::new(Vec::new())),
            mirror_live: Arc::new(AtomicBool::new(false)),
            #[cfg(windows)]
            capture_handle: None,
            #[cfg(windows)]
            capture_shutdown: None,
        })
    }

    pub fn with_vad(mut self, vad: Box<dyn VoiceActivityDetector>) -> Self {
        self.vad = Some(Arc::new(Mutex::new(vad)));
        self
    }

    pub fn with_level_callback<F>(mut self, cb: F) -> Self
    where
        F: Fn(Vec<f32>) + Send + Sync + 'static,
    {
        self.level_cb = Some(Arc::new(cb));
        self
    }

    /// Register the callback that fires when the first captured audio of a
    /// recording reaches the pipeline. Fires before the VAD has its say: it
    /// reports that the device is live, not that anyone is speaking.
    pub fn with_ready_callback<F>(mut self, cb: F) -> Self
    where
        F: Fn() + Send + Sync + 'static,
    {
        self.ready_cb = Some(Arc::new(cb));
        self
    }

    /// Snapshot of the audio captured so far in the current recording
    /// (16 kHz mono). Used by live transcription to re-transcribe the growing
    /// buffer. Returns an empty vec when not recording.
    pub fn current_samples(&self) -> Vec<f32> {
        self.live_buffer.lock().unwrap().clone()
    }

    /// Keep the device capturing between recordings (always-on microphone
    /// mode). Set before `open()`; changing it afterwards only affects what
    /// happens after the next `stop()`.
    pub fn set_always_capturing(&self, enabled: bool) {
        self.always_capturing.store(enabled, Ordering::Relaxed);
    }

    /// Turn the live mirror on for recordings that will actually be read back
    /// while they run (live transcription). Set before `start()`.
    pub fn set_live_mirroring(&self, enabled: bool) {
        self.mirror_live.store(enabled, Ordering::Relaxed);
    }

    pub fn open(&mut self, device: Option<Device>) -> Result<(), Box<dyn std::error::Error>> {
        if self.worker_handle.is_some() {
            return Ok(()); // already open
        }

        let (sample_tx, sample_rx) = mpsc::channel::<AudioChunk>();
        let (cmd_tx, cmd_rx) = mpsc::channel::<Cmd>();
        let (init_tx, init_rx) = mpsc::sync_channel::<Result<(), String>>(1);

        let host = crate::audio_toolkit::get_cpal_host();
        let device = match device {
            Some(dev) => dev,
            None => host
                .default_input_device()
                .ok_or_else(|| Error::new(std::io::ErrorKind::NotFound, "No input device found"))?,
        };

        let thread_device = device.clone();
        let vad = self.vad.clone();
        // Move the optional level callback into the worker thread
        let level_cb = self.level_cb.clone();
        let ready_cb = self.ready_cb.clone();
        let always_capturing = self.always_capturing.clone();
        let live_buffer = self.live_buffer.clone();
        let mirror_live = self.mirror_live.clone();

        let worker = std::thread::spawn(move || {
            let stop_flag = Arc::new(AtomicBool::new(false));
            let stop_flag_for_stream = stop_flag.clone();
            let init_result = (|| -> Result<(cpal::Stream, u32), String> {
                let config = AudioRecorder::get_preferred_config(&thread_device)
                    .map_err(|e| format!("Failed to fetch preferred config: {e}"))?;

                let sample_rate = config.sample_rate().0;
                let channels = config.channels() as usize;

                log::info!(
                    "Using device: {:?}\nSample rate: {}\nChannels: {}\nFormat: {:?}",
                    thread_device.name(),
                    sample_rate,
                    channels,
                    config.sample_format()
                );

                let stream = match config.sample_format() {
                    cpal::SampleFormat::U8 => AudioRecorder::build_stream::<u8>(
                        &thread_device,
                        &config,
                        sample_tx,
                        channels,
                        stop_flag_for_stream,
                    )
                    .map_err(|e| format!("Failed to build input stream: {e}"))?,
                    cpal::SampleFormat::I8 => AudioRecorder::build_stream::<i8>(
                        &thread_device,
                        &config,
                        sample_tx,
                        channels,
                        stop_flag_for_stream,
                    )
                    .map_err(|e| format!("Failed to build input stream: {e}"))?,
                    cpal::SampleFormat::I16 => AudioRecorder::build_stream::<i16>(
                        &thread_device,
                        &config,
                        sample_tx,
                        channels,
                        stop_flag_for_stream,
                    )
                    .map_err(|e| format!("Failed to build input stream: {e}"))?,
                    cpal::SampleFormat::I32 => AudioRecorder::build_stream::<i32>(
                        &thread_device,
                        &config,
                        sample_tx,
                        channels,
                        stop_flag_for_stream,
                    )
                    .map_err(|e| format!("Failed to build input stream: {e}"))?,
                    cpal::SampleFormat::F32 => AudioRecorder::build_stream::<f32>(
                        &thread_device,
                        &config,
                        sample_tx,
                        channels,
                        stop_flag_for_stream,
                    )
                    .map_err(|e| format!("Failed to build input stream: {e}"))?,
                    sample_format => {
                        return Err(format!("Unsupported sample format: {sample_format:?}"));
                    }
                };

                // Deliberately NOT started here. Building the stream is the
                // expensive half (~250 ms on WASAPI) and turning it on is
                // nearly free, so the device is left prepared and stopped:
                // it captures nothing, registers no microphone use with the
                // OS, costs no measurable CPU, and goes live in about 7 ms
                // when the user actually presses the shortcut.
                //
                // Always-on mode is the one exception, and it starts the
                // stream below rather than waiting for a recording.
                if always_capturing.load(Ordering::Relaxed) {
                    stream
                        .play()
                        .map_err(|e| format!("Failed to start microphone stream: {e}"))?;
                }

                Ok((stream, sample_rate))
            })();

            match init_result {
                Ok((stream, sample_rate)) => {
                    let _ = init_tx.send(Ok(()));
                    // The stream moves in: the consumer is what turns the
                    // device on and off, and cpal streams are not Send, so
                    // they can only be driven from the thread that built them.
                    run_consumer(
                        sample_rate,
                        vad,
                        sample_rx,
                        cmd_rx,
                        level_cb,
                        ready_cb,
                        stop_flag,
                        LiveMirror {
                            buffer: live_buffer,
                            enabled: mirror_live,
                        },
                        Capture {
                            stream: Some(stream),
                            always_on: always_capturing,
                        },
                    );
                }
                Err(error_message) => {
                    log::error!("{error_message}");
                    let _ = init_tx.send(Err(error_message));
                }
            }
        });

        match init_rx.recv() {
            Ok(Ok(())) => {
                self.device = Some(device);
                self.cmd_tx = Some(cmd_tx);
                self.worker_handle = Some(worker);
                Ok(())
            }
            Ok(Err(error_message)) => {
                let _ = worker.join();
                // The stream would not build. If we handed it a cached config,
                // that config is the prime suspect - drop it so the next
                // attempt re-probes the device instead of failing identically.
                forget_cached_config(&device);
                let kind = if is_microphone_access_denied(&error_message) {
                    std::io::ErrorKind::PermissionDenied
                } else {
                    std::io::ErrorKind::Other
                };
                Err(Box::new(Error::new(kind, error_message)))
            }
            Err(recv_error) => {
                let _ = worker.join();
                Err(Box::new(Error::other(format!(
                    "Failed to initialize microphone worker: {recv_error}"
                ))))
            }
        }
    }

    /// Open the recorder capturing the audio of a single application via WASAPI
    /// process loopback (Windows only). Reuses the same consumer pipeline (VAD,
    /// resampling, level callback) as the cpal path — only the producer differs.
    #[cfg(windows)]
    pub fn open_process_loopback(&mut self, pid: u32) -> Result<(), Box<dyn std::error::Error>> {
        if self.worker_handle.is_some() {
            return Ok(()); // already open
        }

        let (sample_tx, sample_rx) = mpsc::channel::<AudioChunk>();
        let (cmd_tx, cmd_rx) = mpsc::channel::<Cmd>();
        let (init_tx, init_rx) = mpsc::sync_channel::<Result<(), String>>(1);

        // `stop_flag` is shared with run_consumer (its Stop arm toggles it) and
        // read by the capture thread to emit EndOfStream. `shutdown_flag` ends
        // the capture thread on close().
        let stop_flag = Arc::new(AtomicBool::new(false));
        let shutdown_flag = Arc::new(AtomicBool::new(false));

        let cap_stop = stop_flag.clone();
        let cap_shutdown = shutdown_flag.clone();
        let chunk_tx = sample_tx.clone();
        let eos_tx = sample_tx;

        let capture = std::thread::spawn(move || {
            super::process_loopback::run_capture(
                pid,
                true, // include child processes (helpers, e.g. browser tabs)
                cap_stop,
                cap_shutdown,
                move |ready| {
                    let _ = init_tx.send(ready);
                },
                move |mono| {
                    let _ = chunk_tx.send(AudioChunk::Samples(mono));
                },
                move || {
                    let _ = eos_tx.send(AudioChunk::EndOfStream);
                },
            );
        });

        match init_rx.recv() {
            Ok(Ok(())) => {}
            Ok(Err(msg)) => {
                shutdown_flag.store(true, Ordering::Relaxed);
                let _ = capture.join();
                return Err(Box::new(Error::other(msg)));
            }
            Err(e) => {
                shutdown_flag.store(true, Ordering::Relaxed);
                let _ = capture.join();
                return Err(Box::new(Error::other(format!(
                    "Process loopback init failed: {e}"
                ))));
            }
        }

        let sample_rate = super::process_loopback::capture_sample_rate();
        // Bypass VAD for system/app audio: we want to transcribe whatever the
        // app is playing (music, quiet/low-volume playback, etc.), not gate it
        // like close-mic speech — the VAD would otherwise discard most of it.
        let level_cb = self.level_cb.clone();
        let ready_cb = self.ready_cb.clone();
        let live_buffer = self.live_buffer.clone();
        let mirror_live = self.mirror_live.clone();
        let worker = std::thread::spawn(move || {
            run_consumer(
                sample_rate,
                None,
                sample_rx,
                cmd_rx,
                level_cb,
                ready_cb,
                stop_flag,
                LiveMirror {
                    buffer: live_buffer,
                    enabled: mirror_live,
                },
                // The process-loopback path runs its own capture thread rather
                // than a cpal stream, so there is nothing here to turn on and
                // off; it is opened only for the length of one capture anyway.
                Capture {
                    stream: None,
                    always_on: Arc::new(AtomicBool::new(true)),
                },
            );
        });

        self.device = None;
        self.cmd_tx = Some(cmd_tx);
        self.worker_handle = Some(worker);
        self.capture_handle = Some(capture);
        self.capture_shutdown = Some(shutdown_flag);
        Ok(())
    }

    /// Turn the capture device on and start collecting. Returns once the
    /// device is really live, so a caller that shows a "talking now" cue is
    /// not showing it to a microphone that has not started yet.
    pub fn start(&self) -> Result<(), Box<dyn std::error::Error>> {
        let Some(tx) = &self.cmd_tx else {
            return Err(Box::new(Error::new(
                std::io::ErrorKind::NotConnected,
                "recorder is closed",
            )));
        };
        let (resp_tx, resp_rx) = mpsc::channel();
        tx.send(Cmd::Start(resp_tx))?;
        match resp_rx.recv() {
            Ok(Ok(())) => Ok(()),
            Ok(Err(message)) => Err(Box::new(Error::other(message))),
            Err(e) => Err(Box::new(Error::other(format!(
                "microphone worker did not answer: {e}"
            )))),
        }
    }

    pub fn stop(&self) -> Result<Vec<f32>, Box<dyn std::error::Error>> {
        // Historic footgun: with the recorder already closed there is no worker
        // to answer, but resp_tx stayed alive in this scope, so recv() blocked
        // forever — while callers held the audio-manager mutex, freezing every
        // audio operation until an app restart. No worker → nothing recorded.
        let Some(tx) = &self.cmd_tx else {
            log::warn!("AudioRecorder::stop() called on a closed recorder; returning no samples");
            return Ok(Vec::new());
        };
        let (resp_tx, resp_rx) = mpsc::channel();
        tx.send(Cmd::Stop(resp_tx))?;
        Ok(resp_rx.recv()?) // wait for the samples
    }

    pub fn close(&mut self) -> Result<(), Box<dyn std::error::Error>> {
        if let Some(tx) = self.cmd_tx.take() {
            let _ = tx.send(Cmd::Shutdown);
        }
        // Signal the process-loopback capture thread to exit (Windows).
        #[cfg(windows)]
        if let Some(flag) = self.capture_shutdown.take() {
            flag.store(true, Ordering::Relaxed);
        }
        if let Some(h) = self.worker_handle.take() {
            let _ = h.join();
        }
        #[cfg(windows)]
        if let Some(h) = self.capture_handle.take() {
            let _ = h.join();
        }
        self.device = None;
        Ok(())
    }

    fn build_stream<T>(
        device: &cpal::Device,
        config: &cpal::SupportedStreamConfig,
        sample_tx: mpsc::Sender<AudioChunk>,
        channels: usize,
        stop_flag: Arc<AtomicBool>,
    ) -> Result<cpal::Stream, cpal::BuildStreamError>
    where
        T: Sample + SizedSample + Send + 'static,
        f32: cpal::FromSample<T>,
    {
        let mut output_buffer = Vec::new();
        let mut eos_sent = false;

        let stream_cb = move |data: &[T], _: &cpal::InputCallbackInfo| {
            if stop_flag.load(Ordering::Relaxed) {
                if !eos_sent {
                    let _ = sample_tx.send(AudioChunk::EndOfStream);
                    eos_sent = true;
                }
                return;
            }
            eos_sent = false;

            output_buffer.clear();

            if channels == 1 {
                output_buffer.extend(data.iter().map(|&sample| sample.to_sample::<f32>()));
            } else {
                let frame_count = data.len() / channels;
                output_buffer.reserve(frame_count);

                for frame in data.chunks_exact(channels) {
                    let mono_sample = frame
                        .iter()
                        .map(|&sample| sample.to_sample::<f32>())
                        .sum::<f32>()
                        / channels as f32;
                    output_buffer.push(mono_sample);
                }
            }

            if sample_tx
                .send(AudioChunk::Samples(output_buffer.clone()))
                .is_err()
            {
                log::error!("Failed to send samples");
            }
        };

        device.build_input_stream(
            &config.clone().into(),
            stream_cb,
            |err| log::error!("Stream error: {}", err),
            None,
        )
    }

    fn get_preferred_config(
        device: &cpal::Device,
    ) -> Result<cpal::SupportedStreamConfig, Box<dyn std::error::Error>> {
        // Use the device's native/default sample rate and let the FrameResampler
        // in run_consumer() downsample to 16kHz. This avoids forcing hardware into
        // a non-native rate which can cause issues on some devices (Bluetooth
        // codecs, certain ALSA drivers, etc.).
        // For a normal microphone we read the device's *input* config. For
        // system-audio (loopback) capture the device is an *output* device,
        // which has no input config — in that case cpal expects us to use its
        // output config and build an input stream on it (WASAPI loopback). So
        // we try input first and transparently fall back to output.
        let (default_config, is_loopback) = match device.default_input_config() {
            Ok(cfg) => (cfg, false),
            Err(_) => (device.default_output_config()?, true),
        };
        let target_rate = default_config.sample_rate();

        // A cached answer is reused only while the device still reports the
        // same default rate. Reading that rate costs under 4 ms, so this also
        // catches the user changing the format in the OS sound panel, which
        // would otherwise leave us building a stream on a stale config.
        let key = device.name().ok().map(|device_name| ConfigKey {
            device: device_name,
            loopback: is_loopback,
        });
        if let Some(key) = &key {
            if let Some(cached) = config_cache().lock().unwrap().get(key) {
                if cached.sample_rate() == target_rate {
                    return Ok(cached.clone());
                }
            }
        }

        // Try to find the best sample format at the device's default rate
        let supported_configs = if is_loopback {
            device
                .supported_output_configs()
                .map(|configs| configs.collect::<Vec<_>>())
        } else {
            device
                .supported_input_configs()
                .map(|configs| configs.collect::<Vec<_>>())
        };
        let supported_configs = match supported_configs {
            Ok(configs) => configs,
            Err(e) => {
                log::warn!("Could not enumerate configs ({e}), using device default");
                return Ok(default_config);
            }
        };
        let mut best_config: Option<cpal::SupportedStreamConfigRange> = None;

        for config_range in supported_configs {
            if config_range.min_sample_rate() <= target_rate
                && config_range.max_sample_rate() >= target_rate
            {
                match best_config {
                    None => best_config = Some(config_range),
                    Some(ref current) => {
                        // Prioritize F32 > I16 > I32 > others
                        let score = |fmt: cpal::SampleFormat| match fmt {
                            cpal::SampleFormat::F32 => 4,
                            cpal::SampleFormat::I16 => 3,
                            cpal::SampleFormat::I32 => 2,
                            _ => 1,
                        };

                        if score(config_range.sample_format()) > score(current.sample_format()) {
                            best_config = Some(config_range);
                        }
                    }
                }
            }
        }

        let chosen = if let Some(config) = best_config {
            config.with_sample_rate(target_rate)
        } else {
            // Fall back to device default if no config matched (exotic/virtual devices)
            log::warn!(
                "No supported config matched device default rate {:?}, using default config",
                target_rate
            );
            default_config
        };

        if let Some(key) = key {
            config_cache().lock().unwrap().insert(key, chosen.clone());
        }
        Ok(chosen)
    }

    /// Probe and cache a device's configuration ahead of time, so the expensive
    /// part of opening it does not land on the path a keypress takes. A no-op
    /// once that device is cached, and safe to call from a background thread.
    pub fn warm_config_cache(device: &Device) {
        if let Err(e) = Self::get_preferred_config(device) {
            log::debug!("Could not pre-probe device config: {e}");
        }
    }
}

pub fn is_microphone_access_denied(error_message: &str) -> bool {
    let normalized = error_message.to_lowercase();
    normalized.contains("access is denied")
        || normalized.contains("permission denied")
        || normalized.contains("0x80070005")
}

pub fn is_no_input_device_error(error_message: &str) -> bool {
    let normalized = error_message.to_lowercase();
    normalized.contains("no input device found")
        || (normalized.contains("failed to fetch preferred config")
            && normalized.contains("coreaudio"))
}

#[cfg(test)]
#[allow(clippy::items_after_test_module)]
mod tests {
    use super::{config_cache, is_microphone_access_denied, is_no_input_device_error};

    /// The whole point of preparing the stream instead of opening it on the
    /// keypress: starting a prepared device has to be immediate, and it has to
    /// stay immediate for the second dictation and the tenth.
    ///
    /// Needs real capture hardware, so it is ignored by default:
    ///   cargo test --lib starting_a_prepared_device -- --ignored --nocapture
    #[test]
    #[ignore = "needs a real capture device"]
    fn starting_a_prepared_device_is_immediate() {
        use super::AudioRecorder;
        use cpal::traits::HostTrait;
        use std::time::{Duration, Instant};

        let host = crate::audio_toolkit::get_cpal_host();
        let Some(device) = host.default_input_device() else {
            eprintln!("no input device; nothing to measure");
            return;
        };

        let mut rec = AudioRecorder::new().expect("recorder");
        let prepare = Instant::now();
        rec.open(Some(device)).expect("prepare the stream");
        let prepare = prepare.elapsed();

        // Nothing may be captured before the first start(): that is what keeps
        // the microphone out of use between dictations.
        std::thread::sleep(Duration::from_millis(400));
        assert!(
            rec.current_samples().is_empty(),
            "a prepared stream captured audio before anything asked it to"
        );

        let mut starts = Vec::new();
        for _ in 0..3 {
            let t = Instant::now();
            rec.start().expect("start");
            starts.push(t.elapsed());
            std::thread::sleep(Duration::from_millis(250));
            let captured = rec.stop().expect("stop");
            assert!(
                !captured.is_empty(),
                "a started device produced no audio at all"
            );
            // And once stopped it must go quiet again.
            std::thread::sleep(Duration::from_millis(200));
        }
        rec.close().expect("close");

        let worst = starts.iter().max().unwrap();
        println!("prepare: {prepare:?} | starts: {starts:?} | worst: {worst:?}");
        assert!(
            *worst < Duration::from_millis(60),
            "starting a prepared device took {worst:?}; the point of preparing it \
             is that this stays in the low milliseconds"
        );
    }

    /// Splits "the app recorded nothing" into its two possible causes: the
    /// stream not delivering audio, or the VAD discarding all of it. Runs both
    /// paths over the same moment of sound, so whatever is playing in the room
    /// reaches both.
    ///
    ///   VOCRIPT_TEST_VAD=path/to/silero_vad_v4.onnx \
    ///   cargo test --lib with_and_without_the_vad -- --ignored --nocapture
    #[test]
    #[ignore = "needs a real capture device and something making noise"]
    fn with_and_without_the_vad() {
        use super::AudioRecorder;
        use crate::audio_toolkit::vad::{SileroVad, SmoothedVad};
        use cpal::traits::HostTrait;
        use std::time::Duration;

        let Ok(vad_path) = std::env::var("VOCRIPT_TEST_VAD") else {
            eprintln!("set VOCRIPT_TEST_VAD to the silero model");
            return;
        };
        let host = crate::audio_toolkit::get_cpal_host();
        let Some(device) = host.default_input_device() else {
            eprintln!("no input device");
            return;
        };

        // Same VAD the app builds: silero at 0.2, 20 frames of pre-roll, 15 of
        // hangover, speech confirmed on the first voiced frame.
        let silero = SileroVad::new(&vad_path, 0.2).expect("silero");
        let smoothed = SmoothedVad::new(Box::new(silero), 20, 15, 1);
        let mut with_vad = AudioRecorder::new()
            .expect("recorder")
            .with_vad(Box::new(smoothed));
        let mut without_vad = AudioRecorder::new().expect("recorder");

        with_vad.open(Some(device.clone())).expect("open");
        without_vad.open(Some(device)).expect("open");

        with_vad.start().expect("start");
        without_vad.start().expect("start");
        println!("recording for 4 s - make some noise now");
        std::thread::sleep(Duration::from_secs(4));
        let gated = with_vad.stop().expect("stop");
        let raw = without_vad.stop().expect("stop");
        with_vad.close().ok();
        without_vad.close().ok();

        let peak = raw.iter().fold(0f32, |m, &s| m.max(s.abs()));
        println!(
            "without the VAD: {} samples ({:.2} s), peak {peak:.4}",
            raw.len(),
            raw.len() as f32 / 16_000.0
        );
        println!(
            "through the VAD: {} samples ({:.2} s)",
            gated.len(),
            gated.len() as f32 / 16_000.0
        );
        println!(
            "verdict: {}",
            if raw.is_empty() {
                "the STREAM delivered nothing"
            } else if gated.is_empty() {
                "the stream delivered audio and the VAD discarded all of it"
            } else {
                "both paths produced audio"
            }
        );
        assert!(
            !raw.is_empty(),
            "a started stream delivered no audio at all"
        );
    }

    /// The reason the config cache exists, measured end to end: opening the
    /// same device twice must be markedly faster the second time, because the
    /// expensive format probe is skipped. Needs real capture hardware, so it is
    /// ignored by default; run it with:
    ///   cargo test -p vocript --lib probe_cache_makes_opening_faster -- --ignored --nocapture
    #[test]
    #[ignore = "needs a real capture device"]
    fn probe_cache_makes_opening_faster() {
        use super::AudioRecorder;
        use cpal::traits::HostTrait;
        use std::time::Instant;

        let host = crate::audio_toolkit::get_cpal_host();
        let Some(device) = host.default_input_device() else {
            eprintln!("no input device; nothing to measure");
            return;
        };

        // Cold: nothing cached, so the probe runs.
        config_cache().lock().unwrap().clear();
        let mut rec = AudioRecorder::new().expect("recorder");
        let cold = Instant::now();
        rec.open(Some(device.clone())).expect("cold open");
        let cold = cold.elapsed();
        rec.close().expect("close");

        // Warm: same device, config already known.
        let mut rec = AudioRecorder::new().expect("recorder");
        let warm = Instant::now();
        rec.open(Some(device)).expect("warm open");
        let warm = warm.elapsed();
        rec.close().expect("close");

        println!("open cold: {cold:?} | open warm: {warm:?}");
        assert!(
            warm < cold,
            "the cached open ({warm:?}) should beat the cold one ({cold:?})"
        );
    }

    #[test]
    fn detects_access_is_denied() {
        assert!(is_microphone_access_denied("Access is denied"));
    }

    #[test]
    fn detects_permission_denied() {
        assert!(is_microphone_access_denied("permission denied"));
    }

    #[test]
    fn detects_windows_error_code() {
        assert!(is_microphone_access_denied("WASAPI error: 0x80070005"));
    }

    #[test]
    fn does_not_match_unrelated_errors() {
        assert!(!is_microphone_access_denied("device not found"));
    }

    #[test]
    fn detects_no_input_device() {
        assert!(is_no_input_device_error("No input device found"));
    }

    #[test]
    fn detects_coreaudio_config_error() {
        assert!(is_no_input_device_error(
            "Failed to fetch preferred config: A backend-specific error has occurred: An unknown error unknown to the coreaudio-rs API occurred"
        ));
    }

    #[test]
    fn does_not_match_other_errors_for_no_device() {
        assert!(!is_no_input_device_error("permission denied"));
        assert!(!is_no_input_device_error("device not found"));
    }
}

/// The readable-while-recording copy of the audio and the flag that says
/// whether to maintain it. Grouped so run_consumer keeps a sane arity.
struct LiveMirror {
    buffer: Arc<Mutex<Vec<f32>>>,
    enabled: Arc<AtomicBool>,
}

/// The capture device the consumer governs, and whether it may ever be
/// stopped. `stream` is `None` on the process-loopback path, which runs its own
/// capture thread instead of a cpal stream.
struct Capture {
    stream: Option<cpal::Stream>,
    always_on: Arc<AtomicBool>,
}

#[allow(clippy::too_many_arguments)]
fn run_consumer(
    in_sample_rate: u32,
    vad: Option<Arc<Mutex<Box<dyn vad::VoiceActivityDetector>>>>,
    sample_rx: mpsc::Receiver<AudioChunk>,
    cmd_rx: mpsc::Receiver<Cmd>,
    level_cb: Option<Arc<dyn Fn(Vec<f32>) + Send + Sync + 'static>>,
    ready_cb: Option<Arc<dyn Fn() + Send + Sync + 'static>>,
    stop_flag: Arc<AtomicBool>,
    live: LiveMirror,
    capture: Capture,
) {
    let LiveMirror {
        buffer: live_buffer,
        enabled: mirror_live,
    } = live;
    let Capture {
        stream,
        always_on: always_capturing,
    } = capture;
    let mut frame_resampler = FrameResampler::new(
        in_sample_rate as usize,
        constants::WHISPER_SAMPLE_RATE as usize,
        Duration::from_millis(30),
    );

    let mut processed_samples = Vec::<f32>::new();
    let mut raw_samples_seen = 0usize;
    let mut recording = false;
    // Whether the device is currently producing audio. It starts stopped
    // unless always-on mode asked for the opposite (see `open`), and while it
    // is stopped not a single sample can arrive - so the loop below waits on
    // commands instead of on audio that is never coming.
    let mut capturing = stream.is_none() || always_capturing.load(Ordering::Relaxed);
    // Set by Cmd::Start, cleared by the first chunk that arrives after it: the
    // moment the capture device is really feeding us audio.
    let mut announce_ready = false;

    // ---------- spectrum visualisation setup ---------------------------- //
    const BUCKETS: usize = 16;
    const WINDOW_SIZE: usize = 512;
    let mut visualizer = AudioVisualiser::new(
        in_sample_rate,
        WINDOW_SIZE,
        BUCKETS,
        400.0,  // vocal_min_hz
        4000.0, // vocal_max_hz
    );

    fn handle_frame(
        samples: &[f32],
        recording: bool,
        vad: &Option<Arc<Mutex<Box<dyn vad::VoiceActivityDetector>>>>,
        out_buf: &mut Vec<f32>,
    ) {
        if !recording {
            return;
        }

        if let Some(vad_arc) = vad {
            let mut det = vad_arc.lock().unwrap();
            match det.push_frame(samples).unwrap_or(VadFrame::Speech(samples)) {
                VadFrame::Speech(buf) => out_buf.extend_from_slice(buf),
                VadFrame::Noise => {}
            }
        } else {
            out_buf.extend_from_slice(samples);
        }
    }

    loop {
        // Where this loop waits depends on whether the device is running.
        //
        // While it is stopped nothing can arrive on the sample channel, so
        // waiting there would have delayed every Start by up to a full timeout
        // - which is the very latency this design exists to remove. Waiting on
        // commands instead answers a keypress immediately and, being a blocking
        // wait, costs no CPU at all while idle.
        //
        // While it is running we wait on audio, but still time out: WASAPI
        // loopback delivers nothing during silence, and a loop stuck there
        // would hang stop()/close() and freeze the app on a silent capture.
        let mut next_cmd = if capturing {
            match sample_rx.recv_timeout(Duration::from_millis(200)) {
                Ok(AudioChunk::Samples(raw)) => {
                    if recording {
                        raw_samples_seen += raw.len();
                    }
                    // The device is live. Announced before the VAD sees
                    // anything, because this says "the microphone is
                    // capturing", not "somebody is talking".
                    if recording && announce_ready {
                        announce_ready = false;
                        if let Some(cb) = &ready_cb {
                            cb();
                        }
                    }

                    // ---------- spectrum processing ---------------------- //
                    if let Some(buckets) = visualizer.feed(&raw) {
                        if let Some(cb) = &level_cb {
                            cb(buckets);
                        }
                    }

                    // ---------- existing pipeline ------------------------ //
                    let before = processed_samples.len();
                    frame_resampler.push(&raw, &mut |frame: &[f32]| {
                        handle_frame(frame, recording, &vad, &mut processed_samples)
                    });
                    // Mirror newly-appended samples into the live buffer so
                    // live transcription can read the in-progress audio.
                    if recording
                        && mirror_live.load(Ordering::Relaxed)
                        && processed_samples.len() > before
                    {
                        live_buffer
                            .lock()
                            .unwrap()
                            .extend_from_slice(&processed_samples[before..]);
                    }
                }
                Ok(AudioChunk::EndOfStream) => {}
                Err(mpsc::RecvTimeoutError::Timeout) => {}
                Err(mpsc::RecvTimeoutError::Disconnected) => break, // stream closed
            }
            cmd_rx.try_recv().ok()
        } else {
            // A stopped device should send nothing, but that is a promise made
            // by each platform's backend rather than by us. If one ever breaks
            // it, this channel would grow without bound behind a loop that is
            // not reading it, so drain and complain instead of leaking.
            let mut stray = 0usize;
            while let Ok(AudioChunk::Samples(chunk)) = sample_rx.try_recv() {
                stray += chunk.len();
            }
            if stray > 0 {
                log::warn!(
                    "Capture device delivered {stray} samples while stopped;                      this platform does not honour pausing a stream"
                );
            }

            match cmd_rx.recv_timeout(Duration::from_millis(500)) {
                Ok(cmd) => Some(cmd),
                Err(mpsc::RecvTimeoutError::Timeout) => None,
                Err(mpsc::RecvTimeoutError::Disconnected) => break, // recorder closed
            }
        };

        while let Some(cmd) = next_cmd.take() {
            match cmd {
                Cmd::Start(reply_tx) => {
                    stop_flag.store(false, Ordering::Relaxed);
                    processed_samples.clear();
                    live_buffer.lock().unwrap().clear();
                    raw_samples_seen = 0;
                    visualizer.reset();
                    if let Some(v) = &vad {
                        v.lock().unwrap().reset();
                    }

                    // Turn the device on. On a stream that was already built
                    // this is the cheap half, single-digit milliseconds, and it
                    // is the point at which the OS starts counting the
                    // microphone as in use.
                    let started = match (&stream, capturing) {
                        (Some(s), false) => match s.play() {
                            Ok(()) => {
                                capturing = true;
                                Ok(())
                            }
                            Err(e) => Err(format!("Failed to start microphone stream: {e}")),
                        },
                        _ => Ok(()),
                    };

                    recording = started.is_ok();
                    announce_ready = started.is_ok();
                    if let Err(message) = &started {
                        log::error!("{message}");
                    }
                    let _ = reply_tx.send(started);
                }
                Cmd::Stop(reply_tx) => {
                    recording = false;
                    announce_ready = false;
                    stop_flag.store(true, Ordering::Relaxed);

                    // Drain all remaining audio until the producer confirms end-of-stream.
                    // The cpal callback sees the stop flag, sends EndOfStream, and goes
                    // silent, guaranteeing every captured sample is in the channel
                    // ahead of the sentinel. A device that never started has no
                    // callback to answer, so there is nothing to drain.
                    if capturing {
                        loop {
                            match sample_rx.recv_timeout(Duration::from_secs(2)) {
                                Ok(AudioChunk::Samples(remaining)) => {
                                    frame_resampler.push(&remaining, &mut |frame: &[f32]| {
                                        handle_frame(frame, true, &vad, &mut processed_samples)
                                    });
                                }
                                Ok(AudioChunk::EndOfStream) => break,
                                Err(_) => {
                                    log::warn!(
                                        "Timed out waiting for EndOfStream from audio callback"
                                    );
                                    break;
                                }
                            }
                        }
                    }

                    frame_resampler.finish(&mut |frame: &[f32]| {
                        handle_frame(frame, true, &vad, &mut processed_samples)
                    });

                    log::debug!(
                        "Recording captured {raw_samples_seen} raw samples from the device, \
                         {} left after the VAD",
                        processed_samples.len()
                    );
                    let _ = reply_tx.send(std::mem::take(&mut processed_samples));

                    // Stop the device now that its audio has been drained, so
                    // between dictations it stays prepared while capturing
                    // nothing. Always-on mode keeps it running: it is what
                    // drives the idle level meter.
                    //
                    // A device that refuses to stop is not left running, since
                    // that would keep the microphone live behind the user's
                    // back. The consumer returns instead, which drops the
                    // stream and closes it for real.
                    if let Some(s) = &stream {
                        if capturing && !always_capturing.load(Ordering::Relaxed) {
                            match s.pause() {
                                Ok(()) => capturing = false,
                                Err(e) => {
                                    log::error!(
                                        "Could not stop the capture device ({e}); closing it rather than leaving the microphone live"
                                    );
                                    stop_flag.store(true, Ordering::Relaxed);
                                    return;
                                }
                            }
                        }
                    }

                    // Resume the audio callback so the consumer loop can continue
                    // receiving chunks (important for always-on microphone mode).
                    stop_flag.store(false, Ordering::Relaxed);
                }
                Cmd::Shutdown => {
                    stop_flag.store(true, Ordering::Relaxed);
                    return;
                }
            }
            next_cmd = cmd_rx.try_recv().ok();
        }
    }
}
