//! Daily update check that does not depend on any window being open.
//!
//! Until now the only check VoCript ever made lived in the settings window's
//! frontend and ran when that window mounted, i.e. once, at launch. A copy left
//! running in the tray for a week therefore never asked again — and someone
//! stuck on the permission screen never asked at all, which is exactly why the
//! v3.5.7 fix could not reach the user who reported issue #6 and they had to be
//! told to download the installer by hand. Since v3.6.0 the settings window is
//! also released after a while in the tray, so leaving the check there would
//! have made this worse.
//!
//! Deliberately quiet: finding an update only changes the tray tooltip and puts
//! the new version number next to "Check for updates" in the tray menu. Nothing
//! pops up, nothing steals focus, nothing downloads on its own.

use std::sync::Mutex;
use std::time::Duration;
use tauri::AppHandle;
use tauri_plugin_updater::UpdaterExt;

/// Not immediately at launch: startup is already the busiest moment, and the
/// frontend's own check covers it whenever the window is on screen.
const FIRST_CHECK_DELAY: Duration = Duration::from_secs(120);

/// Then once a day. Releases do not arrive faster than that, and this runs even
/// on battery.
const CHECK_INTERVAL: Duration = Duration::from_secs(24 * 60 * 60);

/// Version waiting to be installed, if any.
///
/// Never persisted: a restart re-checks within two minutes anyway, and a stale
/// badge claiming an update that is already installed is worse than no badge.
static AVAILABLE_UPDATE: Mutex<Option<String>> = Mutex::new(None);

/// The newer version on offer, for the tray tooltip and menu to show.
pub fn available_update() -> Option<String> {
    AVAILABLE_UPDATE
        .lock()
        .unwrap_or_else(|p| p.into_inner())
        .clone()
}

/// Stores what the check found. Returns whether it differs from what the tray
/// is already showing, so an unchanged result costs no tray rebuild.
fn remember(found: Option<String>) -> bool {
    let mut slot = AVAILABLE_UPDATE.lock().unwrap_or_else(|p| p.into_inner());
    if *slot == found {
        return false;
    }
    *slot = found;
    true
}

/// Starts the watcher. Safe to call once, from setup.
///
/// A plain thread doing the waiting, with the async check blocked on inside it:
/// the alternative needs tokio's `time` feature, and a sleeping OS thread costs
/// nothing measurable next to the WebView2 processes this app already runs.
pub fn start(app: &AppHandle) {
    let app = app.clone();
    std::thread::spawn(move || {
        std::thread::sleep(FIRST_CHECK_DELAY);
        loop {
            tauri::async_runtime::block_on(check_once(&app));
            std::thread::sleep(CHECK_INTERVAL);
        }
    });
}

async fn check_once(app: &AppHandle) {
    // Read the setting on every pass rather than once at startup, so turning
    // update checks off takes effect without a restart.
    if !crate::settings::get_settings(app).update_checks_enabled {
        if remember(None) {
            refresh_tray(app);
        }
        return;
    }

    let updater = match app.updater() {
        Ok(updater) => updater,
        Err(e) => {
            log::warn!("Daily update check: updater unavailable: {e}");
            return;
        }
    };

    match updater.check().await {
        Ok(Some(update)) => {
            let version = update.version.clone();
            log::info!("Daily update check: version {version} is available");
            if remember(Some(version)) {
                refresh_tray(app);
            }
        }
        Ok(None) => {
            // Logged even though nothing changes: a check that leaves no trace
            // is impossible to support ("did it even run?"), and this happens
            // once a day.
            log::info!("Daily update check: already on the latest version");
            if remember(None) {
                refresh_tray(app);
            }
        }
        // Offline, GitHub down, rate limited… none of it is worth bothering the
        // user about; the next pass will try again.
        Err(e) => log::debug!("Daily update check failed (will retry): {e}"),
    }
}

/// Rebuilds the tray so the tooltip and menu pick up the new value, keeping
/// whatever icon state is currently showing.
///
/// Hopped onto the main thread on purpose: this runs from the watcher thread,
/// and rebuilding a tray menu (native menu items, icon, tooltip) off the UI
/// thread is not something to gamble on — especially on a path that only fires
/// the day a release actually lands, i.e. the one time nobody is watching.
fn refresh_tray(app: &AppHandle) {
    let app_for_tray = app.clone();
    if let Err(e) = app.run_on_main_thread(move || {
        let state = crate::tray::current_tray_state();
        crate::utils::update_tray_menu(&app_for_tray, &state, None);
    }) {
        log::warn!("Could not refresh the tray after an update check: {e}");
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn reset() {
        *AVAILABLE_UPDATE.lock().unwrap() = None;
    }

    #[test]
    fn a_new_version_is_reported_once() {
        reset();
        assert!(remember(Some("3.6.1".to_string())));
        // Same answer on the next daily pass: nothing to redraw.
        assert!(!remember(Some("3.6.1".to_string())));
        assert_eq!(available_update().as_deref(), Some("3.6.1"));
    }

    #[test]
    fn installing_the_update_clears_the_badge() {
        reset();
        remember(Some("3.6.1".to_string()));
        assert!(remember(None));
        assert_eq!(available_update(), None);
    }

    #[test]
    fn nothing_available_stays_nothing() {
        reset();
        assert!(!remember(None));
        assert_eq!(available_update(), None);
    }
}
