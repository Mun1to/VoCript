use crate::managers::stats::{DictationStats, StatsManager, TYPING_WPM};
use std::sync::Arc;
use tauri::State;

#[tauri::command]
#[specta::specta]
pub fn get_dictation_stats(stats_manager: State<'_, Arc<StatsManager>>) -> DictationStats {
    stats_manager.get_stats()
}

#[tauri::command]
#[specta::specta]
pub fn reset_dictation_stats(stats_manager: State<'_, Arc<StatsManager>>) -> Result<(), String> {
    stats_manager.reset().map_err(|e| e.to_string())
}

/// Typing speed the "time saved" figure is measured against, so the UI states
/// the assumption instead of presenting the number as an absolute truth.
#[tauri::command]
#[specta::specta]
pub fn get_typing_wpm_baseline() -> f64 {
    TYPING_WPM
}
