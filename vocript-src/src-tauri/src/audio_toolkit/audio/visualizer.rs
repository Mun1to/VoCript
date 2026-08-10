use rustfft::{num_complex::Complex32, Fft, FftPlanner};
use std::sync::Arc;

// Loudness window mapped onto the 0-1 bar heights. Widened a long way down from
// the original -55/-8: at a normal dictation distance the loudest bucket of
// speech only reaches about -44 dBFS, so the old window spent most of its range
// on levels no microphone ever sees while ordinary speech sat near the bottom.
// The bottom end is set as low as it can go while a quiet room still reads as
// flat — the overlay's own noise gate (NOISE_GATE in RecordingOverlay.tsx) is
// what keeps the remaining hiss off the bars.
const DB_MIN: f32 = -70.0;
const DB_MAX: f32 = -20.0;
const GAIN: f32 = 1.15;
const CURVE_POWER: f32 = 0.7;

/// Speech loses energy as frequency rises (roughly 6-12 dB per octave above the
/// first formant), so one absolute dB window shared by every band leaves the
/// treble buckets pinned at zero unless you shout — measured, at -34 dBFS only
/// the two lowest of the overlay's five bars moved at all, which is exactly the
/// "you have to talk really loud for the bars to react" complaint. Lifting each
/// bucket by a fixed amount per octave above `freq_min` cancels that natural
/// tilt so normal speech drives all the bars together.
///
/// Room noise is broadband, so the steeper this is the more background hiss
/// reaches the treble bars; 8 dB/oct is where a quiet room still reads flat.
const TILT_DB_PER_OCTAVE: f32 = 8.0;

pub struct AudioVisualiser {
    fft: Arc<dyn Fft<f32>>,
    window: Vec<f32>,
    bucket_ranges: Vec<(usize, usize)>,
    /// Per-bucket dB boost that cancels the natural roll-off of speech; see
    /// TILT_DB_PER_OCTAVE.
    tilt_db: Vec<f32>,
    fft_input: Vec<Complex32>,
    noise_floor: Vec<f32>,
    buffer: Vec<f32>,
    window_size: usize,
    buckets: usize,
}

impl AudioVisualiser {
    pub fn new(
        sample_rate: u32,
        window_size: usize,
        buckets: usize,
        freq_min: f32,
        freq_max: f32,
    ) -> Self {
        let mut planner = FftPlanner::<f32>::new();
        let fft = planner.plan_fft_forward(window_size);

        // Pre-compute Hann window
        let window: Vec<f32> = (0..window_size)
            .map(|i| {
                0.5 * (1.0 - (2.0 * std::f32::consts::PI * i as f32 / window_size as f32).cos())
            })
            .collect();

        // Pre-compute bucket frequency ranges
        let nyquist = sample_rate as f32 / 2.0;
        let freq_min = freq_min.min(nyquist);
        let freq_max = freq_max.min(nyquist);

        let mut bucket_ranges = Vec::with_capacity(buckets);
        let mut tilt_db = Vec::with_capacity(buckets);

        for b in 0..buckets {
            // Use logarithmic spacing for better perceptual representation
            let log_start = (b as f32 / buckets as f32).powi(2);
            let log_end = ((b + 1) as f32 / buckets as f32).powi(2);

            let start_hz = freq_min + (freq_max - freq_min) * log_start;
            let end_hz = freq_min + (freq_max - freq_min) * log_end;

            // Boost this bucket by however many octaves its centre sits above
            // the bottom of the analysed range.
            let center_hz = (start_hz + end_hz) / 2.0;
            let octaves_above_min = (center_hz.max(freq_min) / freq_min.max(1.0)).log2();
            tilt_db.push(TILT_DB_PER_OCTAVE * octaves_above_min);

            let start_bin = ((start_hz * window_size as f32) / sample_rate as f32) as usize;
            let mut end_bin = ((end_hz * window_size as f32) / sample_rate as f32) as usize;

            // Ensure each bucket has at least one bin
            if end_bin <= start_bin {
                end_bin = start_bin + 1;
            }

            // Clamp to valid range
            let start_bin = start_bin.min(window_size / 2);
            let end_bin = end_bin.min(window_size / 2);

            bucket_ranges.push((start_bin, end_bin));
        }

        Self {
            fft,
            window,
            bucket_ranges,
            tilt_db,
            fft_input: vec![Complex32::new(0.0, 0.0); window_size],
            noise_floor: vec![-40.0; buckets], // Initialize to reasonable noise floor
            buffer: Vec::with_capacity(window_size * 2),
            window_size,
            buckets,
        }
    }

    pub fn feed(&mut self, samples: &[f32]) -> Option<Vec<f32>> {
        // Add new samples to buffer
        self.buffer.extend_from_slice(samples);

        // Only process if we have enough samples
        if self.buffer.len() < self.window_size {
            return None;
        }

        // Take the required window of samples
        let window_samples = &self.buffer[..self.window_size];

        // Remove DC component
        let mean = window_samples.iter().sum::<f32>() / self.window_size as f32;

        // Apply window function and prepare FFT input
        for (i, &sample) in window_samples.iter().enumerate() {
            let windowed_sample = (sample - mean) * self.window[i];
            self.fft_input[i] = Complex32::new(windowed_sample, 0.0);
        }

        // Perform FFT
        self.fft.process(&mut self.fft_input);

        // Compute power spectrum and bucket levels
        let mut buckets = vec![0.0; self.buckets];

        for (bucket_idx, &(start_bin, end_bin)) in self.bucket_ranges.iter().enumerate() {
            if start_bin >= end_bin || end_bin > self.fft_input.len() / 2 {
                continue;
            }

            // Calculate average power in this frequency range
            let mut power_sum = 0.0;
            for bin_idx in start_bin..end_bin {
                let magnitude = self.fft_input[bin_idx].norm();
                power_sum += magnitude * magnitude;
            }

            let avg_power = power_sum / (end_bin - start_bin) as f32;

            // Convert to dB with proper scaling
            let db = if avg_power > 1e-12 {
                20.0 * (avg_power.sqrt() / self.window_size as f32).log10()
            } else {
                // Floor for "no energy at all" (a muted or disconnected input
                // hands us literal zeros). It has to stay far below DB_MIN even
                // after the treble buckets add their ~19 dB of tilt, otherwise
                // digital silence would leave the rightmost bar hovering off
                // its rest height instead of flat.
                -120.0
            };

            // Only update noise floor when signal is quiet (below current floor + 10dB)
            if db < self.noise_floor[bucket_idx] + 10.0 {
                const NOISE_ALPHA: f32 = 0.001; // Very slow adaptation
                self.noise_floor[bucket_idx] =
                    NOISE_ALPHA * db + (1.0 - NOISE_ALPHA) * self.noise_floor[bucket_idx];
            }

            // Map configurable dB range to 0-1 with gain and curve shaping,
            // after cancelling the natural high-frequency roll-off of speech so
            // every bar reacts at the same speaking volume.
            let tilted_db = db + self.tilt_db[bucket_idx];
            let normalized = ((tilted_db - DB_MIN) / (DB_MAX - DB_MIN)).clamp(0.0, 1.0);
            buckets[bucket_idx] = (normalized * GAIN).powf(CURVE_POWER).clamp(0.0, 1.0);
        }

        // Apply light smoothing to reduce jitter
        for i in 1..buckets.len() - 1 {
            buckets[i] = buckets[i] * 0.7 + buckets[i - 1] * 0.15 + buckets[i + 1] * 0.15;
        }

        // Clear processed samples from buffer
        self.buffer.clear();

        Some(buckets)
    }

    pub fn reset(&mut self) {
        self.buffer.clear();
        // Reset noise floor to initial values
        self.noise_floor.fill(-40.0);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const SR: u32 = 48_000;
    const WINDOW: usize = 512;
    const BUCKETS: usize = 16;

    /// Same configuration the recorder builds (see run_consumer).
    fn visualiser() -> AudioVisualiser {
        AudioVisualiser::new(SR, WINDOW, BUCKETS, 400.0, 4000.0)
    }

    fn levels_for(samples: &[f32]) -> Vec<f32> {
        visualiser()
            .feed(samples)
            .expect("one full window of samples")
    }

    fn tone(hz: f32, amplitude: f32) -> Vec<f32> {
        (0..WINDOW)
            .map(|i| amplitude * (2.0 * std::f32::consts::PI * hz * i as f32 / SR as f32).sin())
            .collect()
    }

    fn peak(levels: &[f32]) -> f32 {
        levels.iter().copied().fold(0.0, f32::max)
    }

    #[test]
    fn speech_roll_off_no_longer_leaves_the_treble_bars_dead() {
        // A real voice loses roughly 6 dB per octave, so by 3.5 kHz it is some
        // 18 dB quieter than at 500 Hz. Before TILT_DB_PER_OCTAVE that quiet
        // treble read as flat silence while the bass lit up — which is why only
        // the leftmost bars of the overlay meter moved unless you shouted.
        let bass = levels_for(&tone(500.0, 0.07));
        let treble = levels_for(&tone(3500.0, 0.07 / 8.0));

        assert!(
            peak(&treble) > 0.5 * peak(&bass),
            "treble bucket peak {} should track the bass peak {} once tilted",
            peak(&treble),
            peak(&bass)
        );
    }

    #[test]
    fn digital_silence_leaves_every_bucket_at_zero() {
        // The tilt adds ~19 dB to the highest bucket, so the "no energy" floor
        // has to stay far enough below DB_MIN that a muted input still reads as
        // a flat meter rather than a permanently raised rightmost bar.
        let levels = levels_for(&vec![0.0f32; WINDOW]);

        assert!(
            levels.iter().all(|&v| v == 0.0),
            "silence produced non-zero levels: {levels:?}"
        );
    }

    #[test]
    fn quiet_speech_level_audio_lights_the_meter() {
        // ~-40 dBFS is speaking quietly at arm's length. It must produce a
        // visible reading, not the near-zero the old -55 dB floor gave it.
        let levels = levels_for(&tone(700.0, 0.014));

        assert!(
            peak(&levels) > 0.3,
            "quiet speech should still move the bars, peak was {}",
            peak(&levels)
        );
    }

    #[test]
    fn tilt_rises_with_frequency_and_starts_at_zero() {
        let v = visualiser();

        assert_eq!(v.tilt_db.len(), BUCKETS);
        assert!(v.tilt_db[0] < 1.0, "lowest bucket should be untouched");
        assert!(
            v.tilt_db[BUCKETS - 1] > 15.0,
            "highest bucket should get a real boost, got {}",
            v.tilt_db[BUCKETS - 1]
        );
        assert!(
            v.tilt_db.windows(2).all(|w| w[1] >= w[0]),
            "tilt must grow monotonically with frequency: {:?}",
            v.tilt_db
        );
    }
}
