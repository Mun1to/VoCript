//! Decides whether a transcribed snippet contains the wake word.
//!
//! Speech models never write "VoCript". Real transcriptions of Munir saying it
//! during development came out as "Bocrypt", "Vocrypt", "voz grit", "bocrypt"
//! and "vocrypt" — Spanish speakers merge b/v, and the model has never seen the
//! brand name, so it guesses at a plausible spelling every time.
//!
//! Matching the literal string would therefore fail almost always. Instead the
//! text is normalised and compared by edit distance, both word by word and in
//! pairs, since the models often split it in two ("vo script").

/// Spellings to compare against. Two forms rather than one because b/v is the
/// single most common substitution and starting from both halves the distance
/// budget needed to reach either.
const TARGETS: [&str; 2] = ["vocript", "bocript"];

/// How many single-character edits away a candidate may be.
///
/// One, not two. At two, **"script" matches** — it is exactly two edits from
/// "vocript" — and this user dictates about code all day, so "el script de la
/// reunión" would start dictation on its own. One edit still covers the endings
/// the models actually produce (-crypt, -crip), and anything further off is
/// listed explicitly below.
const MAX_DISTANCE: usize = 1;

/// Transcriptions too far from the name for edit distance to reach safely, but
/// known to be it. "voz grit" is 4 edits away: accepting that distance in
/// general would match half the dictionary, so these are hardcoded instead.
const KNOWN_VARIANTS: [&str; 6] = [
    "vozgrit", "vozcrit", "vozcript", "bozcript", "vocrit", "bocrit",
];

/// Below this length a candidate cannot be the wake word, and allowing edits on
/// very short words matches almost anything.
const MIN_CANDIDATE_LEN: usize = 5;

/// The consonant core the word keeps in every mangled spelling.
///
/// Real log output when the word was spoken into a listening window: "Ball
/// Crypto", "All crypt", "Bocrypt", "Vocrypt", "voz grit". The vowels and the
/// first syllable are a lottery — the model guesses at a name it has never seen,
/// often in the wrong language — but this core always survives.
/// Note "grit" is deliberately absent even though the model once produced "voz
/// grit": it would also fire on "grito" and "gritar", everyday Spanish words.
/// That spelling is covered by `KNOWN_VARIANTS` instead.
const CORES: [&str; 5] = ["cript", "crypt", "kript", "krypt", "crip"];

/// A window this short holds a single spoken word, which is how the wake word is
/// said. Sentences are held to the strict edit-distance rule instead.
const SHORT_WINDOW_WORDS: usize = 3;
const SHORT_WINDOW_CHARS: usize = 25;

/// Whether the text carries the core as its own word-start sound.
///
/// The core must not be preceded by an "s": that is what tells "crypto" apart
/// from "script", and "script" is a word this user says constantly.
fn has_wake_core(normalized: &str) -> bool {
    for word in normalized.split_whitespace() {
        for core in CORES {
            let mut from = 0;
            while let Some(offset) = word[from..].find(core) {
                let at = from + offset;
                let preceded_by_s = at > 0 && word.as_bytes()[at - 1] == b's';
                if !preceded_by_s {
                    return true;
                }
                from = at + 1;
            }
        }
    }
    false
}

/// Lowercases, strips accents and drops everything that is not a letter, so
/// "¡VoCript!" and "vocript" become the same string.
fn normalize(text: &str) -> String {
    text.chars()
        .flat_map(|c| c.to_lowercase())
        .map(|c| match c {
            'á' | 'à' | 'ä' | 'â' | 'ã' => 'a',
            'é' | 'è' | 'ë' | 'ê' => 'e',
            'í' | 'ì' | 'ï' | 'î' => 'i',
            'ó' | 'ò' | 'ö' | 'ô' | 'õ' => 'o',
            'ú' | 'ù' | 'ü' | 'û' => 'u',
            other => other,
        })
        .map(|c| if c.is_alphanumeric() { c } else { ' ' })
        .collect()
}

/// Levenshtein distance, capped: once every cell of a row exceeds the limit the
/// answer can only grow, so the rest of the matrix is not worth computing.
fn distance_within(a: &str, b: &str, limit: usize) -> Option<usize> {
    let a: Vec<char> = a.chars().collect();
    let b: Vec<char> = b.chars().collect();
    if a.len().abs_diff(b.len()) > limit {
        return None;
    }

    let mut previous: Vec<usize> = (0..=b.len()).collect();
    let mut current = vec![0usize; b.len() + 1];

    for (i, ca) in a.iter().enumerate() {
        current[0] = i + 1;
        for (j, cb) in b.iter().enumerate() {
            let cost = if ca == cb { 0 } else { 1 };
            current[j + 1] = (previous[j] + cost)
                .min(previous[j + 1] + 1)
                .min(current[j] + 1);
        }
        if current.iter().min().copied().unwrap_or(usize::MAX) > limit {
            return None;
        }
        std::mem::swap(&mut previous, &mut current);
    }

    let result = previous[b.len()];
    (result <= limit).then_some(result)
}

fn matches_target(candidate: &str) -> bool {
    if candidate.len() < MIN_CANDIDATE_LEN {
        return false;
    }
    if KNOWN_VARIANTS.contains(&candidate) {
        return true;
    }
    TARGETS
        .iter()
        .any(|target| distance_within(candidate, target, MAX_DISTANCE).is_some())
}

/// True when the snippet matches a phrase the user taught the app.
///
/// This is the reliable path. The built-in rules below have to guess how a model
/// will mangle a name it has never seen; a taught sample is what *this* user's
/// model actually produced for *this* user's voice, so comparing against it is
/// nearly exact. One edit of slack absorbs a stray plural or final letter.
pub fn matches_taught_sample(text: &str, samples: &[String]) -> bool {
    if samples.is_empty() {
        return false;
    }
    let heard = normalize(text)
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ");
    if heard.is_empty() {
        return false;
    }

    samples.iter().any(|sample| {
        let learned = normalize(sample)
            .split_whitespace()
            .collect::<Vec<_>>()
            .join(" ");
        if learned.is_empty() {
            return false;
        }
        // Contained, or within one edit of the whole window.
        heard.contains(&learned) || distance_within(&heard, &learned, 1).is_some()
    })
}

/// True when the snippet contains the wake word in any of the shapes a speech
/// model is likely to produce.
///
/// Two rules, because one is not enough:
///
/// - **Anywhere in a sentence**, only a near-exact spelling counts. Loose
///   matching inside real speech fires on ordinary words.
/// - **In a short window** — one or two words, which is what a wake word said on
///   its own produces — the consonant core is enough. This is the rule that
///   catches what the model actually writes: "Ball Crypto", "All crypt".
pub fn contains_wake_word(text: &str) -> bool {
    let normalized = normalize(text);
    let words: Vec<&str> = normalized.split_whitespace().collect();

    for (index, word) in words.iter().enumerate() {
        if matches_target(word) {
            return true;
        }
        // Models often split the name in two ("vo script", "voz grit"). Joining
        // each adjacent pair catches that without a dictionary of variants.
        if let Some(next) = words.get(index + 1) {
            if matches_target(&format!("{}{}", word, next)) {
                return true;
            }
        }
    }

    let trimmed = normalized.trim();
    if words.len() <= SHORT_WINDOW_WORDS
        && trimmed.len() <= SHORT_WINDOW_CHARS
        && has_wake_core(trimmed)
    {
        return true;
    }

    false
}

/// Removes the wake word from the start or end of a dictation.
///
/// Saying it to stop puts it in the recording, so without this every hands-free
/// dictation would end with a stray "VoCript". Only the edges are touched: the
/// word in the middle of a sentence is something the user meant to say.
pub fn strip_wake_word(text: &str) -> String {
    let words: Vec<&str> = text.split_whitespace().collect();
    if words.is_empty() {
        return String::new();
    }

    let clean = |word: &str| normalize(word).replace(' ', "");
    let joined = |a: &str, b: &str| format!("{}{}", clean(a), clean(b));

    let mut start = 0;
    let mut end = words.len();

    // Two words first: models split the name as often as they join it.
    if end - start >= 2 && matches_target(&joined(words[start], words[start + 1])) {
        start += 2;
    } else if matches_target(&clean(words[start])) {
        start += 1;
    }

    if end >= start + 2 && matches_target(&joined(words[end - 2], words[end - 1])) {
        end -= 2;
    } else if end > start && matches_target(&clean(words[end - 1])) {
        end -= 1;
    }

    words[start..end]
        .join(" ")
        .trim_matches(|c: char| c.is_whitespace() || c == ',' || c == '.')
        .to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn strips_the_word_said_to_stop() {
        assert_eq!(strip_wake_word("hola qué tal VoCript"), "hola qué tal");
        assert_eq!(strip_wake_word("hola qué tal, vocrypt."), "hola qué tal");
        assert_eq!(strip_wake_word("VoCript escribe esto"), "escribe esto");
        assert_eq!(strip_wake_word("vocript hola vocript"), "hola");
    }

    #[test]
    fn leaves_the_middle_of_a_sentence_alone() {
        assert_eq!(
            strip_wake_word("instala VoCript en el portátil"),
            "instala VoCript en el portátil"
        );
    }

    #[test]
    fn survives_a_dictation_that_was_only_the_word() {
        assert_eq!(strip_wake_word("VoCript"), "");
        assert_eq!(strip_wake_word(""), "");
    }

    #[test]
    fn taught_samples_match_what_the_model_produces() {
        // Exactly the strings the log captured for this user's voice.
        let taught = vec!["Ball Crypto.".to_string(), "All crypt.".to_string()];

        assert!(matches_taught_sample("Ball Crypto.", &taught));
        assert!(matches_taught_sample("ball crypto", &taught));
        assert!(matches_taught_sample("All crypt", &taught));
        // A trailing letter the model added this time.
        assert!(matches_taught_sample("all crypts", &taught));
        // And inside a slightly longer window.
        assert!(matches_taught_sample("uh ball crypto", &taught));
    }

    #[test]
    fn taught_samples_ignore_everything_else() {
        let taught = vec!["Ball Crypto.".to_string()];
        assert!(!matches_taught_sample("hola qué tal", &taught));
        assert!(!matches_taught_sample("el script de la reunión", &taught));
        assert!(!matches_taught_sample("", &taught));
        // With nothing taught, this path never fires on its own.
        assert!(!matches_taught_sample("ball crypto", &[]));
    }

    #[test]
    fn matches_the_exact_name() {
        assert!(contains_wake_word("VoCript"));
        assert!(contains_wake_word("vocript"));
        assert!(contains_wake_word("¡VoCript!"));
    }

    #[test]
    fn matches_what_models_actually_wrote() {
        // Every one of these is a real transcription of the word being spoken.
        for real in [
            "Bocrypt",
            "Vocrypt",
            "vocrypt",
            "bocrypt",
            "voz grit",
            "vo script",
            "Bocrypt, dime",
            "oye vocrypt",
        ] {
            assert!(contains_wake_word(real), "should have matched {:?}", real);
        }
    }

    #[test]
    fn matches_inside_a_sentence() {
        assert!(contains_wake_word("a ver, vocript, escribe esto"));
        assert!(contains_wake_word("hey VoCript"));
    }

    /// Straight from the log, the exact strings the model produced while the
    /// word was being spoken into a listening window.
    #[test]
    fn matches_what_the_log_captured() {
        for real in ["Ball Crypto.", "All crypt.", "Bo Crypt", "Vocrypto"] {
            assert!(contains_wake_word(real), "should have matched {:?}", real);
        }
    }

    #[test]
    fn a_short_window_of_something_else_does_not_match() {
        // Also from the log: noise transcribed while nothing was said.
        assert!(!contains_wake_word("No three."));
        assert!(!contains_wake_word("Hola."));
        assert!(!contains_wake_word("¿qué tal?"));
    }

    /// "script" carries the same core, and it must never fire.
    #[test]
    fn script_never_matches_however_short_the_window() {
        assert!(!contains_wake_word("script"));
        assert!(!contains_wake_word("el script"));
        assert!(!contains_wake_word("ejecuta el script"));
        assert!(!contains_wake_word("scripts"));
    }

    #[test]
    fn the_core_rule_only_applies_to_short_windows() {
        // Long enough to be speech, so only the strict rule applies.
        assert!(!contains_wake_word(
            "tengo que mirar la cripta de la catedral mañana"
        ));
    }

    #[test]
    fn ignores_ordinary_speech() {
        for text in [
            "",
            "hola qué tal",
            "vamos a escribir un correo",
            "el script de la reunión",
            "describe el problema",
            "necesito una copia",
            "corta y pega esto",
            "voy a comer",
        ] {
            assert!(
                !contains_wake_word(text),
                "should NOT have matched {:?}",
                text
            );
        }
    }

    #[test]
    fn short_words_without_the_core_never_match() {
        assert!(!contains_wake_word("grit"));
        assert!(!contains_wake_word("grito"));
        assert!(!contains_wake_word("gritar"));
    }

    /// A knowing trade-off: said on its own, "cripta" does fire. Tightening the
    /// rule enough to exclude it would also lose "All crypt", which is what the
    /// model genuinely produces for the wake word. Rare word, cheap mistake —
    /// the dictation is cancelled with Escape.
    #[test]
    fn a_lone_similar_word_is_accepted_as_the_price_of_recall() {
        assert!(contains_wake_word("cripta"));
    }

    #[test]
    fn distance_is_capped() {
        assert_eq!(distance_within("vocript", "vocript", 2), Some(0));
        assert_eq!(distance_within("vocrypt", "vocript", 2), Some(1));
        assert_eq!(distance_within("completely", "vocript", 2), None);
    }

    /// The reason the budget is one edit and not two.
    #[test]
    fn script_is_two_edits_away_and_must_not_match() {
        assert_eq!(distance_within("script", "vocript", 2), Some(2));
        assert!(!contains_wake_word("el script de la reunión"));
        assert!(!contains_wake_word("ejecuta el script"));
    }
}
