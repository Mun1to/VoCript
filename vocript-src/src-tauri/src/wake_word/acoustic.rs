//! Acoustic matching for the wake word: compares **sound to sound**, never text.
//!
//! ## Why this exists
//!
//! The first three attempts at this feature compared what the speech model wrote
//! against the word. That cannot work. Asked to transcribe the same user saying
//! "VoCript" twice, the model produced:
//!
//! ```text
//! "Voklip, Balk."
//! "Three, not print."
//! ```
//!
//! There is no rule that unites those, because the model has never seen the name
//! and invents a spelling each time. The audio, on the other hand, is nearly
//! identical on both occasions — same voice, same microphone, same word.
//!
//! So the user records the word a few times, each recording is reduced to a
//! fingerprint, and every listening window is measured against those. This is
//! classic template matching: weak across different speakers, excellent for the
//! one person who recorded it, which is exactly the case here.

use rustfft::{num_complex::Complex, FftPlanner};
use serde::{Deserialize, Serialize};

const SAMPLE_RATE: f32 = 16_000.0;
/// 25 ms analysis frames every 10 ms — the standard for speech.
const FRAME: usize = 400;
const HOP: usize = 160;
const FFT_SIZE: usize = 512;
/// Mel bands kept. Enough to characterise a word, few enough to stay cheap.
const BANDS: usize = 26;
const MEL_LOW_HZ: f32 = 100.0;
const MEL_HIGH_HZ: f32 = 6_000.0;

/// Frames quieter than this share of the loudest frame are trimmed from the
/// edges, so a fingerprint covers the word and not the silence around it.
///
/// Measured against the **raw** loudness of each frame, never the log-mel
/// energy. Logarithms compress the range so hard that near-silence still scores
/// most of the peak, so trimming by that barely trimmed anything: recordings of
/// a half-second word came out 1.4 to 2.2 seconds long, and matching them
/// compared background against background. The distances showed it — the word
/// itself scored 4 to 6 while the recordings sat 2.3 apart from each other.
const TRIM_RATIO: f32 = 0.18;

/// A recorded example of the wake word, reduced to its spectral shape.
pub type Fingerprint = Vec<[f32; BANDS]>;

/// Bumped whenever the fingerprint maths changes. Recordings made by an older
/// version are numbers on a different scale: comparing them to fresh audio
/// produces confident nonsense, so they are discarded and the user is asked to
/// record again. Silent incompatibility is worse than an empty list.
pub const FORMAT_VERSION: u32 = 4;

#[derive(Default, Serialize, Deserialize)]
pub struct Templates {
    #[serde(default)]
    pub version: u32,
    pub prints: Vec<Fingerprint>,
    /// Distance below which a window counts as the wake word. Derived from how
    /// much the user's own recordings differ from each other, so a consistent
    /// speaker gets a tight threshold and a variable one a looser one.
    pub threshold: f32,
}

fn hz_to_mel(hz: f32) -> f32 {
    2595.0 * (1.0 + hz / 700.0).log10()
}

fn mel_to_hz(mel: f32) -> f32 {
    700.0 * (10f32.powf(mel / 2595.0) - 1.0)
}

/// Triangular mel filter bank over the FFT bins.
fn mel_filters() -> Vec<(usize, usize, usize)> {
    let low = hz_to_mel(MEL_LOW_HZ);
    let high = hz_to_mel(MEL_HIGH_HZ);
    let bins = FFT_SIZE / 2 + 1;

    let point = |index: usize| -> usize {
        let mel = low + (high - low) * index as f32 / (BANDS + 1) as f32;
        let hz = mel_to_hz(mel);
        ((hz / (SAMPLE_RATE / 2.0)) * (bins - 1) as f32).round() as usize
    };

    (0..BANDS)
        .map(|band| (point(band), point(band + 1), point(band + 2)))
        .collect()
}

/// Fingerprint of a **teaching recording**, reduced to a single utterance.
///
/// People fill the recording window rather than sit in silence, so they say the
/// word two or three times in a row. Fingerprinting all of it stores "word word
/// word", and then only saying it three times matches — which is exactly what
/// happened in testing. Isolating one utterance makes the recording mean what
/// the user thinks it means.
pub fn fingerprint_word(samples: &[f32]) -> Fingerprint {
    let (frames, loudness) = analyse(samples);
    if frames.is_empty() {
        return Vec::new();
    }

    let Some((first, last)) = longest_utterance(&loudness) else {
        return Vec::new();
    };
    normalise(frames[first..=last].to_vec())
}

/// Finds the longest run of speech, allowing brief gaps inside a word (the pause
/// in the middle of a stop consonant) but not the silence between repetitions.
fn longest_utterance(loudness: &[f32]) -> Option<(usize, usize)> {
    /// 150 ms. Longer than a consonant gap, shorter than the pause between two
    /// deliberate repetitions of a word.
    const MAX_GAP: usize = 15;

    let peak = loudness.iter().cloned().fold(0.0f32, f32::max);
    if peak <= 0.0 {
        return None;
    }
    let floor = peak * TRIM_RATIO;

    let mut best: Option<(usize, usize)> = None;
    let mut start: Option<usize> = None;
    let mut last_loud = 0usize;

    for (index, &level) in loudness.iter().enumerate() {
        if level >= floor {
            if start.is_none() {
                start = Some(index);
            }
            last_loud = index;
        } else if let Some(begin) = start {
            if index - last_loud > MAX_GAP {
                let candidate = (begin, last_loud);
                if best.is_none_or(|(b, e)| e - b < candidate.1 - candidate.0) {
                    best = Some(candidate);
                }
                start = None;
            }
        }
    }

    if let Some(begin) = start {
        let candidate = (begin, last_loud);
        if best.is_none_or(|(b, e)| e - b < candidate.1 - candidate.0) {
            best = Some(candidate);
        }
    }

    best
}

/// Fingerprint of a **listening window**: only the quiet edges are cut, since
/// the word may sit anywhere inside and the matcher searches for it.
pub fn fingerprint(samples: &[f32]) -> Fingerprint {
    let (frames, loudness) = analyse(samples);
    if frames.is_empty() {
        return Vec::new();
    }

    let peak = loudness.iter().cloned().fold(0.0f32, f32::max);
    let floor = peak * TRIM_RATIO;
    let first = loudness.iter().position(|&e| e >= floor).unwrap_or(0);
    let last = loudness
        .iter()
        .rposition(|&e| e >= floor)
        .unwrap_or(frames.len() - 1);

    normalise(frames[first..=last].to_vec())
}

/// Splits audio into frames and returns their spectra plus the raw loudness of
/// each, which is what locates speech.
fn analyse(samples: &[f32]) -> (Vec<[f32; BANDS]>, Vec<f32>) {
    if samples.len() < FRAME {
        return (Vec::new(), Vec::new());
    }

    let mut planner = FftPlanner::<f32>::new();
    let fft = planner.plan_fft_forward(FFT_SIZE);
    let mut buffer: Vec<Complex<f32>> = vec![Complex::new(0.0, 0.0); FFT_SIZE];
    let spectrum_bins = FFT_SIZE / 2 + 1;
    let filters = mel_filters();

    // Hamming window, precomputed.
    let window: Vec<f32> = (0..FRAME)
        .map(|i| 0.54 - 0.46 * (2.0 * std::f32::consts::PI * i as f32 / (FRAME - 1) as f32).cos())
        .collect();

    let mut frames: Vec<[f32; BANDS]> = Vec::new();
    let mut energies: Vec<f32> = Vec::new();

    let mut start = 0;
    while start + FRAME <= samples.len() {
        buffer.iter_mut().for_each(|v| *v = Complex::new(0.0, 0.0));
        let mut previous = 0.0;
        // Loudness of the untouched audio, used to find where the word is.
        let mut square_sum = 0.0;
        for i in 0..FRAME {
            let raw = samples[start + i];
            square_sum += raw * raw;
            // Pre-emphasis lifts the high frequencies that carry consonants.
            let value = raw - 0.97 * previous;
            previous = raw;
            buffer[i] = Complex::new(value * window[i], 0.0);
        }
        let frame_loudness = (square_sum / FRAME as f32).sqrt();

        fft.process(&mut buffer);

        let mut bands = [0f32; BANDS];
        for (band, &(lower, centre, upper)) in filters.iter().enumerate() {
            let mut sum = 0.0;
            // An index loop on purpose: `bin` drives the triangular weight
            // arithmetic below, not just the lookup.
            #[allow(clippy::needless_range_loop)]
            for bin in lower..=upper.min(spectrum_bins - 1) {
                let magnitude = buffer[bin].norm();
                // Triangular weight, peaking at the centre bin.
                let weight = if bin <= centre {
                    if centre == lower {
                        1.0
                    } else {
                        (bin - lower) as f32 / (centre - lower) as f32
                    }
                } else if upper == centre {
                    1.0
                } else {
                    (upper - bin) as f32 / (upper - centre) as f32
                };
                sum += magnitude * weight;
            }
            bands[band] = (1.0 + sum).ln();
        }

        frames.push(bands);
        energies.push(frame_loudness);
        start += HOP;
    }

    (frames, energies)
}

/// Centres each frame on its own mean so the result describes the shape of the
/// sound rather than its level.
fn normalise(mut kept: Vec<[f32; BANDS]>) -> Fingerprint {
    if kept.is_empty() {
        return Vec::new();
    }

    // Each frame is normalised **against itself**, across its own bands.
    //
    // The obvious alternative — normalising each band over time — makes the
    // numbers depend on how long the clip is and what else it contains. A
    // template holds one word; a listening window holds nearly two seconds of
    // whatever was going on. Normalised that way the two are not on the same
    // scale and the comparison is meaningless, which is what kept the wake word
    // and ordinary speech scoring so close together.
    for frame in kept.iter_mut() {
        let mean: f32 = frame.iter().sum::<f32>() / BANDS as f32;
        let variance: f32 = frame
            .iter()
            .map(|value| (value - mean).powi(2))
            .sum::<f32>()
            / BANDS as f32;
        let deviation = variance.sqrt().max(1e-6);
        for value in frame.iter_mut() {
            *value = (*value - mean) / deviation;
        }
    }

    kept
}

fn frame_distance(a: &[f32; BANDS], b: &[f32; BANDS]) -> f32 {
    a.iter()
        .zip(b.iter())
        .map(|(x, y)| (x - y).powi(2))
        .sum::<f32>()
        .sqrt()
}

/// Dynamic time warping between a listening window and a recorded template,
/// with **both ends free**.
///
/// The window lasts nearly two seconds; the word inside it lasts about half of
/// one. Matching the whole window against the template therefore measured mostly
/// the padding around the word, and the numbers proved it: the wake word scored
/// 1.6–2.6 while ordinary speech scored 2.6–3.0, overlapping right where the
/// decision is made. Letting the template align with any stretch of the window
/// compares the word against the word, which is the whole point.
///
/// Normalised by template length so recordings of different lengths compare.
pub fn dtw_distance(window: &Fingerprint, template: &Fingerprint) -> f32 {
    if window.is_empty() || template.is_empty() {
        return f32::MAX;
    }

    // previous/current hold one row each, indexed by template position.
    // Column 0 is zero on every row: the template may start anywhere.
    let mut previous: Vec<f32> = vec![f32::MAX; template.len() + 1];
    let mut current: Vec<f32> = vec![f32::MAX; template.len() + 1];
    previous[0] = 0.0;

    let mut best_end = f32::MAX;

    for i in 1..=window.len() {
        current[0] = 0.0;
        for j in 1..=template.len() {
            let cost = frame_distance(&window[i - 1], &template[j - 1]);
            let best = previous[j - 1].min(previous[j]).min(current[j - 1]);
            current[j] = if best == f32::MAX {
                f32::MAX
            } else {
                cost + best
            };
        }
        // The template may also end anywhere: keep the best complete alignment.
        if current[template.len()] < best_end {
            best_end = current[template.len()];
        }
        std::mem::swap(&mut previous, &mut current);
    }

    if best_end == f32::MAX {
        return f32::MAX;
    }
    best_end / template.len() as f32
}

/// Best match between a window and every recorded template.
pub fn best_distance(window: &Fingerprint, templates: &Templates) -> f32 {
    templates
        .prints
        .iter()
        .map(|print| dtw_distance(window, print))
        .fold(f32::MAX, f32::min)
}

/// Threshold derived from the user's own recordings: how far apart they are from
/// each other, plus a margin. With a single recording there is nothing to
/// measure, so a conservative default is used.
pub fn derive_threshold(prints: &[Fingerprint]) -> f32 {
    // Both numbers are for the free-ended distance above, which reads lower than
    // whole-window matching did.
    const DEFAULT: f32 = 1.8;
    const MARGIN: f32 = 1.25;

    if prints.len() < 2 {
        return DEFAULT;
    }

    let mut worst: f32 = 0.0;
    for i in 0..prints.len() {
        for j in (i + 1)..prints.len() {
            worst = worst.max(dtw_distance(&prints[i], &prints[j]));
        }
    }
    // Never looser than a sanity ceiling: two sloppy recordings should not open
    // the door to everything.
    (worst * MARGIN).clamp(1.0, DEFAULT * 1.6)
}

#[cfg(test)]
mod tests {
    use super::*;

    /// A tone with the given frequency, as a stand-in for a spoken sound.
    fn tone(hz: f32, seconds: f32) -> Vec<f32> {
        let count = (SAMPLE_RATE * seconds) as usize;
        (0..count)
            .map(|i| (2.0 * std::f32::consts::PI * hz * i as f32 / SAMPLE_RATE).sin() * 0.4)
            .collect()
    }

    fn silence(seconds: f32) -> Vec<f32> {
        vec![0.0; (SAMPLE_RATE * seconds) as usize]
    }

    #[test]
    fn fingerprints_have_frames_and_survive_short_input() {
        assert!(!fingerprint(&tone(440.0, 0.5)).is_empty());
        assert!(fingerprint(&[0.0; 10]).is_empty());
    }

    #[test]
    fn the_same_sound_matches_itself() {
        let a = fingerprint(&tone(440.0, 0.4));
        let b = fingerprint(&tone(440.0, 0.4));
        assert!(
            dtw_distance(&a, &b) < 0.5,
            "identical audio should be near zero, got {}",
            dtw_distance(&a, &b)
        );
    }

    #[test]
    fn a_different_sound_is_further_away() {
        let word = fingerprint(&tone(440.0, 0.4));
        let other = fingerprint(&tone(1800.0, 0.4));
        assert!(dtw_distance(&word, &other) > dtw_distance(&word, &word));
    }

    /// Two tones in sequence, the crudest stand-in for a word with syllables.
    /// A single tone will not do: it has no spectral variation over time, so
    /// per-band normalisation divides by roughly nothing and amplifies noise.
    fn syllables(first: f32, second: f32, each: f32) -> Vec<f32> {
        let mut audio = tone(first, each);
        audio.extend(tone(second, each));
        audio
    }

    #[test]
    fn speed_differences_are_tolerated() {
        let fast = fingerprint(&syllables(400.0, 1200.0, 0.15));
        let slow = fingerprint(&syllables(400.0, 1200.0, 0.30));
        let same_word_other_speed = dtw_distance(&fast, &slow);
        let different_word = dtw_distance(&fast, &fingerprint(&syllables(1200.0, 400.0, 0.15)));

        assert!(
            same_word_other_speed < different_word,
            "the same word said slower ({}) should beat a different one ({})",
            same_word_other_speed,
            different_word
        );
    }

    /// The reason for free ends: the word buried in a longer window must score
    /// far better than unrelated speech of the same length.
    #[test]
    fn the_word_is_found_inside_a_longer_window() {
        let template = fingerprint(&syllables(400.0, 1200.0, 0.2));

        // A window with the word in the middle, padded with a different sound.
        let mut with_word = tone(700.0, 0.4);
        with_word.extend(syllables(400.0, 1200.0, 0.2));
        with_word.extend(tone(700.0, 0.4));

        // The same length, with no word in it.
        let without_word = tone(700.0, 1.2);

        let found = dtw_distance(&fingerprint(&with_word), &template);
        let absent = dtw_distance(&fingerprint(&without_word), &template);

        assert!(
            found < absent,
            "the word inside a window ({}) should beat a window without it ({})",
            found,
            absent
        );
    }

    /// The bug that made the whole feature useless: a half-second word recorded
    /// inside a two-and-a-half-second clip must produce a short fingerprint, not
    /// one covering the entire clip.
    #[test]
    fn a_word_in_a_long_clip_yields_a_short_fingerprint() {
        let mut clip = silence(1.0);
        clip.extend(syllables(400.0, 1200.0, 0.25)); // half a second of "word"
        clip.extend(silence(1.0));

        let print = fingerprint(&clip);
        // 0.5 s at one frame per 10 ms is ~50 frames; allow slack for the edges.
        assert!(
            print.len() < 90,
            "expected the silence to be cut away, got {} frames for a 2.5 s clip",
            print.len()
        );
        assert!(print.len() > 20, "but not so much that the word is lost");
    }

    /// The bug the user found: saying the word three times to fill the recording
    /// window stored all three, so only saying it three times matched.
    #[test]
    fn teaching_keeps_one_utterance_out_of_several() {
        let word = || syllables(400.0, 1200.0, 0.2);

        let mut once = silence(0.2);
        once.extend(word());
        once.extend(silence(0.2));

        let mut three_times = silence(0.2);
        for _ in 0..3 {
            three_times.extend(word());
            three_times.extend(silence(0.4)); // a clear pause between them
        }

        let single = fingerprint_word(&once);
        let repeated = fingerprint_word(&three_times);

        assert!(!single.is_empty() && !repeated.is_empty());
        // Saying it three times must not store a fingerprint three times as long.
        assert!(
            repeated.len() < single.len() * 2,
            "expected one utterance ({} frames), stored {} frames",
            single.len(),
            repeated.len()
        );
        // And the two must look like the same word.
        assert!(dtw_distance(&repeated, &single) < 1.0);
    }

    #[test]
    fn silence_is_trimmed_from_the_edges() {
        let mut padded = silence(0.5);
        padded.extend(tone(440.0, 0.3));
        padded.extend(silence(0.5));

        let padded_print = fingerprint(&padded);
        let bare_print = fingerprint(&tone(440.0, 0.3));
        // Roughly the same length once the silence is gone.
        let difference = padded_print.len().abs_diff(bare_print.len());
        assert!(
            difference < 20,
            "expected similar lengths, got {} vs {}",
            padded_print.len(),
            bare_print.len()
        );
    }

    #[test]
    fn the_threshold_reflects_how_consistent_the_recordings_are() {
        let consistent = vec![
            fingerprint(&syllables(400.0, 1200.0, 0.2)),
            fingerprint(&syllables(400.0, 1200.0, 0.2)),
        ];
        let sloppy = vec![
            fingerprint(&syllables(400.0, 1200.0, 0.2)),
            fingerprint(&syllables(1500.0, 300.0, 0.2)),
        ];
        assert!(derive_threshold(&consistent) < derive_threshold(&sloppy));
        // And a single recording falls back to the default.
        assert_eq!(derive_threshold(&consistent[..1]), 1.8);
    }
}
