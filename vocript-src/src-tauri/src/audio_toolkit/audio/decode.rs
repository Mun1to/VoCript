use std::path::Path;
use std::time::Duration;

use anyhow::{anyhow, Result};
use log::{debug, warn};
use symphonia::core::audio::SampleBuffer;
use symphonia::core::codecs::{DecoderOptions, CODEC_TYPE_NULL};
use symphonia::core::errors::Error as SymphoniaError;
use symphonia::core::formats::FormatOptions;
use symphonia::core::io::MediaSourceStream;
use symphonia::core::meta::MetadataOptions;
use symphonia::core::probe::Hint;

use super::resampler::FrameResampler;

/// Whisper (and the other engines) expect 16 kHz mono f32 audio.
const TARGET_SAMPLE_RATE: usize = 16000;

/// Decode an arbitrary audio or video file to mono f32 samples at 16 kHz.
///
/// Uses Symphonia to demux + decode, so it supports the common formats users
/// drop in: MP3, MP4/M4A/AAC, WAV, FLAC and OGG/Vorbis. Stereo (or more)
/// channels are down-mixed to mono and the result is resampled to 16 kHz with
/// the same `FrameResampler` the live recording path uses.
///
/// `.opus`/WebM-Opus is not supported (Symphonia has no Opus decoder yet).
pub fn decode_audio_file_16k_mono<P: AsRef<Path>>(path: P) -> Result<Vec<f32>> {
    let path = path.as_ref();
    let file = std::fs::File::open(path)
        .map_err(|e| anyhow!("Failed to open audio file {:?}: {}", path, e))?;
    let mss = MediaSourceStream::new(Box::new(file), Default::default());

    // Help the probe with the file extension when available.
    let mut hint = Hint::new();
    if let Some(ext) = path.extension().and_then(|e| e.to_str()) {
        hint.with_extension(ext);
    }

    let probed = symphonia::default::get_probe()
        .format(
            &hint,
            mss,
            &FormatOptions::default(),
            &MetadataOptions::default(),
        )
        .map_err(|e| anyhow!("Unsupported or corrupt media file: {}", e))?;

    let mut format = probed.format;

    // Pick the first decodable audio track.
    let track = format
        .tracks()
        .iter()
        .find(|t| t.codec_params.codec != CODEC_TYPE_NULL)
        .ok_or_else(|| anyhow!("No decodable audio track found in file"))?;
    let track_id = track.id;

    let mut decoder = symphonia::default::get_codecs()
        .make(&track.codec_params, &DecoderOptions::default())
        .map_err(|e| anyhow!("No decoder available for this audio codec: {}", e))?;

    // Source sample rate; falls back to the first decoded frame's spec below.
    let mut in_rate = track.codec_params.sample_rate.unwrap_or(0) as usize;

    let mut mono: Vec<f32> = Vec::new();
    let mut sample_buf: Option<SampleBuffer<f32>> = None;
    let mut channels: usize = 0;

    loop {
        let packet = match format.next_packet() {
            Ok(p) => p,
            // Clean end of stream.
            Err(SymphoniaError::IoError(e)) if e.kind() == std::io::ErrorKind::UnexpectedEof => {
                break;
            }
            Err(SymphoniaError::ResetRequired) => {
                warn!("[decode] stream reset required, stopping early");
                break;
            }
            Err(e) => return Err(anyhow!("Error reading audio packet: {}", e)),
        };

        if packet.track_id() != track_id {
            continue;
        }

        match decoder.decode(&packet) {
            Ok(decoded) => {
                let spec = *decoded.spec();
                if sample_buf.is_none() {
                    channels = spec.channels.count().max(1);
                    if in_rate == 0 {
                        in_rate = spec.rate as usize;
                    }
                    sample_buf = Some(SampleBuffer::<f32>::new(decoded.capacity() as u64, spec));
                }

                if let Some(buf) = sample_buf.as_mut() {
                    buf.copy_interleaved_ref(decoded);
                    let samples = buf.samples();
                    if channels <= 1 {
                        mono.extend_from_slice(samples);
                    } else {
                        for frame in samples.chunks(channels) {
                            let sum: f32 = frame.iter().sum();
                            mono.push(sum / channels as f32);
                        }
                    }
                }
            }
            // A single malformed packet shouldn't abort the whole file.
            Err(SymphoniaError::DecodeError(e)) => {
                warn!("[decode] skipping undecodable packet: {}", e);
                continue;
            }
            Err(e) => return Err(anyhow!("Audio decode failed: {}", e)),
        }
    }

    if mono.is_empty() {
        return Err(anyhow!("File decoded to empty audio"));
    }
    if in_rate == 0 {
        return Err(anyhow!("Could not determine source sample rate"));
    }

    debug!(
        "[decode] decoded {} mono samples at {} Hz from {:?}",
        mono.len(),
        in_rate,
        path
    );

    if in_rate == TARGET_SAMPLE_RATE {
        return Ok(mono);
    }

    // Resample to 16 kHz reusing the recording path's resampler.
    let mut resampler = FrameResampler::new(in_rate, TARGET_SAMPLE_RATE, Duration::from_millis(30));
    let mut out: Vec<f32> = Vec::with_capacity(mono.len() * TARGET_SAMPLE_RATE / in_rate + 1);
    resampler.push(&mono, |frame| out.extend_from_slice(frame));
    resampler.finish(|frame| out.extend_from_slice(frame));

    debug!(
        "[decode] resampled to {} samples at {} Hz",
        out.len(),
        TARGET_SAMPLE_RATE
    );

    Ok(out)
}
