//! Dictation statistics: how much the user actually dictates, day by day.
//!
//! Deliberately stores **counters only**, never text: one row per calendar day
//! with the number of words, the seconds of audio and how many dictations. That
//! keeps the feature private by construction, and makes it survive the history
//! being cleared or its retention period expiring — those delete transcriptions,
//! which is exactly what a word count must not depend on.
//!
//! Only microphone dictation counts. System-audio captures are someone else's
//! words, so they would make the numbers meaningless.

use anyhow::Result;
use chrono::{Duration, Local, NaiveDate};
use log::{debug, warn};
use rusqlite::Connection;
use serde::{Deserialize, Serialize};
use specta::Type;
use std::path::PathBuf;
use tauri::AppHandle;

/// Words per minute a decent typist sustains. Used to turn a word count into
/// "time saved"; conservative on purpose, so the number is never inflated.
pub const TYPING_WPM: f64 = 40.0;

#[derive(Clone, Debug, Serialize, Deserialize, Type)]
pub struct DayStat {
    /// Local calendar day, `YYYY-MM-DD`.
    pub day: String,
    pub words: u32,
    pub seconds: f64,
    pub sessions: u32,
}

#[derive(Clone, Debug, Serialize, Deserialize, Type)]
pub struct DictationStats {
    /// One entry per day that has any dictation, oldest first.
    pub days: Vec<DayStat>,
    pub total_words: u32,
    pub total_seconds: f64,
    pub total_sessions: u32,
    /// Consecutive days up to today (yesterday still counts: the streak only
    /// breaks once a full day goes by with nothing dictated).
    pub current_streak: u32,
    pub longest_streak: u32,
    pub best_day: Option<DayStat>,
}

impl DictationStats {
    fn empty() -> Self {
        Self {
            days: Vec::new(),
            total_words: 0,
            total_seconds: 0.0,
            total_sessions: 0,
            current_streak: 0,
            longest_streak: 0,
            best_day: None,
        }
    }
}

pub struct StatsManager {
    db_path: PathBuf,
}

impl StatsManager {
    /// Shares `history.db` with [`HistoryManager`], which owns the migrations.
    /// Must be built after it so the table already exists.
    pub fn new(app_handle: &AppHandle) -> Result<Self> {
        let db_path = crate::portable::app_data_dir(app_handle)?.join("history.db");
        Ok(Self { db_path })
    }

    /// Adds one dictation to today's row. Never propagates errors: losing a
    /// statistic must not break the transcription that produced it.
    pub fn record_dictation(&self, text: &str, seconds: f64) {
        let words = count_words(text);
        if words == 0 {
            return;
        }
        let day = Local::now().format("%Y-%m-%d").to_string();

        let result = Connection::open(&self.db_path).and_then(|conn| {
            conn.execute(
                "INSERT INTO dictation_stats (day, words, seconds, sessions)
                 VALUES (?1, ?2, ?3, 1)
                 ON CONFLICT(day) DO UPDATE SET
                     words = words + ?2,
                     seconds = seconds + ?3,
                     sessions = sessions + 1",
                rusqlite::params![day, words, seconds],
            )
        });

        match result {
            Ok(_) => debug!(
                "Recorded {} dictated words ({:.1}s) on {}",
                words, seconds, day
            ),
            Err(e) => warn!("Could not record dictation stats: {}", e),
        }
    }

    pub fn get_stats(&self) -> DictationStats {
        let conn = match Connection::open(&self.db_path) {
            Ok(conn) => conn,
            Err(e) => {
                warn!("Could not open stats database: {}", e);
                return DictationStats::empty();
            }
        };

        let days: Vec<DayStat> = match conn
            .prepare("SELECT day, words, seconds, sessions FROM dictation_stats ORDER BY day ASC")
            .and_then(|mut stmt| {
                stmt.query_map([], |row| {
                    Ok(DayStat {
                        day: row.get(0)?,
                        words: row.get(1)?,
                        seconds: row.get(2)?,
                        sessions: row.get(3)?,
                    })
                })
                .map(|rows| rows.filter_map(|r| r.ok()).collect())
            }) {
            Ok(days) => days,
            Err(e) => {
                warn!("Could not read dictation stats: {}", e);
                return DictationStats::empty();
            }
        };

        summarize(days, Local::now().date_naive())
    }

    /// Wipes every counter. Exposed so the user can clear their own numbers.
    pub fn reset(&self) -> Result<()> {
        let conn = Connection::open(&self.db_path)?;
        conn.execute("DELETE FROM dictation_stats", [])?;
        Ok(())
    }
}

/// Builds the totals and streaks from the raw daily rows. Split out from the
/// database so it can be tested with a fixed "today".
fn summarize(days: Vec<DayStat>, today: NaiveDate) -> DictationStats {
    if days.is_empty() {
        return DictationStats::empty();
    }

    let total_words = days.iter().map(|d| d.words).sum();
    let total_seconds = days.iter().map(|d| d.seconds).sum();
    let total_sessions = days.iter().map(|d| d.sessions).sum();
    let best_day = days.iter().max_by_key(|d| d.words).cloned();

    let parsed: Vec<NaiveDate> = days
        .iter()
        .filter_map(|d| NaiveDate::parse_from_str(&d.day, "%Y-%m-%d").ok())
        .collect();

    let mut longest_streak = 0u32;
    let mut run = 0u32;
    let mut previous: Option<NaiveDate> = None;
    for date in &parsed {
        run = match previous {
            Some(prev) if *date == prev + Duration::days(1) => run + 1,
            _ => 1,
        };
        longest_streak = longest_streak.max(run);
        previous = Some(*date);
    }

    // The run that reaches today (or yesterday) is the live one; anything older
    // is a streak that already ended.
    let current_streak = match parsed.last() {
        Some(last) if *last == today || *last == today - Duration::days(1) => run,
        _ => 0,
    };

    DictationStats {
        days,
        total_words,
        total_seconds,
        total_sessions,
        current_streak,
        longest_streak,
        best_day,
    }
}

/// Counts words the way a human would in each script.
///
/// Chinese and Japanese are written without spaces, so splitting on whitespace
/// would count a whole sentence as one word; those characters are counted
/// individually instead. Korean, Thai and everything alphabetic keep the
/// whitespace rule. Tokens with no letter or digit (stray punctuation left by
/// the model) are not words.
pub fn count_words(text: &str) -> u32 {
    let mut cjk = 0u32;
    let mut rest = String::with_capacity(text.len());

    for ch in text.chars() {
        if is_scriptio_continua(ch) {
            cjk += 1;
        } else {
            rest.push(ch);
        }
    }

    let spaced = rest
        .split_whitespace()
        .filter(|word| word.chars().any(char::is_alphanumeric))
        .count() as u32;

    cjk + spaced
}

/// Characters from scripts written without spaces between words.
fn is_scriptio_continua(ch: char) -> bool {
    matches!(ch as u32,
        0x3040..=0x30FF     // hiragana + katakana
        | 0x3400..=0x4DBF   // CJK extension A
        | 0x4E00..=0x9FFF   // CJK unified ideographs
        | 0xF900..=0xFAFF   // CJK compatibility ideographs
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn counts_plain_words() {
        assert_eq!(count_words("hola qué tal estás"), 4);
        assert_eq!(count_words("  spaced   out  text "), 3);
        assert_eq!(count_words(""), 0);
    }

    #[test]
    fn ignores_stray_punctuation() {
        assert_eq!(count_words("hello , world ."), 2);
        assert_eq!(count_words("... ---"), 0);
        // Punctuation attached to a word is part of it.
        assert_eq!(count_words("Hello, world!"), 2);
    }

    #[test]
    fn counts_cjk_by_character() {
        // Written without spaces: whitespace splitting would say 1.
        assert_eq!(count_words("今天天气很好"), 6);
        assert_eq!(count_words("こんにちは"), 5);
        // Mixed script: 3 ideographs plus one latin word.
        assert_eq!(count_words("今天很 good"), 4);
    }

    #[test]
    fn counts_spaced_scripts_by_word() {
        assert_eq!(count_words("안녕하세요 반갑습니다"), 2); // Korean
        assert_eq!(count_words("привет как дела"), 3); // Russian
        assert_eq!(count_words("مرحبا بالعالم"), 2); // Arabic
    }

    fn day(day: &str, words: u32) -> DayStat {
        DayStat {
            day: day.to_string(),
            words,
            seconds: 10.0,
            sessions: 1,
        }
    }

    #[test]
    fn empty_history_has_no_streak() {
        let stats = summarize(Vec::new(), NaiveDate::from_ymd_opt(2026, 7, 31).unwrap());
        assert_eq!(stats.current_streak, 0);
        assert!(stats.best_day.is_none());
    }

    #[test]
    fn streak_counts_consecutive_days_up_to_today() {
        let today = NaiveDate::from_ymd_opt(2026, 7, 31).unwrap();
        let stats = summarize(
            vec![
                day("2026-07-29", 10),
                day("2026-07-30", 20),
                day("2026-07-31", 5),
            ],
            today,
        );
        assert_eq!(stats.current_streak, 3);
        assert_eq!(stats.longest_streak, 3);
        assert_eq!(stats.total_words, 35);
        assert_eq!(stats.best_day.unwrap().day, "2026-07-30");
    }

    #[test]
    fn yesterday_keeps_the_streak_alive() {
        let today = NaiveDate::from_ymd_opt(2026, 7, 31).unwrap();
        let stats = summarize(vec![day("2026-07-29", 10), day("2026-07-30", 20)], today);
        assert_eq!(stats.current_streak, 2);
    }

    #[test]
    fn a_missed_day_breaks_the_streak() {
        let today = NaiveDate::from_ymd_opt(2026, 7, 31).unwrap();
        let stats = summarize(
            vec![
                day("2026-07-01", 10),
                day("2026-07-02", 10),
                day("2026-07-20", 10),
            ],
            today,
        );
        assert_eq!(stats.current_streak, 0, "last dictation was 11 days ago");
        assert_eq!(stats.longest_streak, 2);
    }
}
