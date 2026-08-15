//! Catches an installation whose updates would land in a folder nobody opens.
//!
//! Not hypothetical. On 2026-08-15 a machine turned up with its shortcuts
//! pointing at one folder while `InstallLocation` in the registry pointed at
//! another. Every update installed perfectly, into the folder nobody launched,
//! so each reboot brought back the old version and offered the same update
//! again. From the outside that is indistinguishable from a broken updater, and
//! there is no way for a user to diagnose it without a registry editor.
//!
//! Windows only. It is the one platform where the installer decides its target
//! folder by reading a registry value that can drift out of sync with the
//! shortcuts. A `.dmg` is dragged wherever the user wants, and the AppImage
//! replaces itself in place.

use serde::Serialize;
use specta::Type;
use std::path::Path;

/// A running copy and an update target that are not the same folder.
#[derive(Debug, Clone, PartialEq, Serialize, Type)]
pub struct InstallMismatch {
    /// Folder the running executable lives in.
    pub running_from: String,
    /// Folder the installer would write the update to.
    pub updates_go_to: String,
}

/// The two folders, whether or not they agree, for the debug panel to show.
#[derive(Debug, Clone, Serialize, Type)]
pub struct InstallPaths {
    /// Folder the running executable lives in.
    pub running_from: String,
    /// Folder the installer would write to, or `None` when nothing claims one
    /// (portable copies, Scoop, a dev build, anything but Windows).
    pub updates_go_to: Option<String>,
}

/// Always answers, unlike `detect`. A support log or a screenshot of the debug
/// panel should show the real state of the machine even when it is fine, and
/// especially in a dev build, where `detect` stays quiet on purpose.
pub fn paths() -> InstallPaths {
    let running_from = std::env::current_exe()
        .ok()
        .and_then(|exe| exe.parent().map(|p| p.to_string_lossy().into_owned()))
        .unwrap_or_default();

    #[cfg(target_os = "windows")]
    let updates_go_to = install_location_from_registry();
    #[cfg(not(target_os = "windows"))]
    let updates_go_to = None;

    InstallPaths {
        running_from,
        updates_go_to,
    }
}

/// Returns the mismatch when there is one, `None` when everything lines up.
///
/// Biased hard towards silence: a warning that fires when nothing is wrong
/// would be worse than not having one at all, since it appears at the exact
/// moment the user is trying to update.
pub fn detect() -> Option<InstallMismatch> {
    // A dev build runs from `target/debug`, which never matches the installed
    // copy, so this would fire on every single `tauri dev` launch.
    if cfg!(debug_assertions) {
        return None;
    }
    detect_inner()
}

#[cfg(not(target_os = "windows"))]
fn detect_inner() -> Option<InstallMismatch> {
    None
}

#[cfg(target_os = "windows")]
fn detect_inner() -> Option<InstallMismatch> {
    // Portable copies live outside any install location on purpose, and they
    // already refuse to self-update with a dialog of their own.
    if crate::portable::is_portable() {
        return None;
    }

    let exe = std::env::current_exe().ok()?;
    let running_from = exe.parent()?.to_path_buf();

    // No registry entry means nothing claims to know where updates go: a Scoop
    // install, a hand-unzipped copy, a first run before the installer ever ran.
    // Guessing a target here would only invent false alarms.
    let updates_go_to = std::path::PathBuf::from(install_location_from_registry()?);

    if same_folder(&running_from, &updates_go_to) {
        return None;
    }

    Some(InstallMismatch {
        running_from: running_from.to_string_lossy().into_owned(),
        updates_go_to: updates_go_to.to_string_lossy().into_owned(),
    })
}

/// Where the NSIS installer would put the next update.
#[cfg(target_os = "windows")]
fn install_location_from_registry() -> Option<String> {
    use winreg::enums::{HKEY_CURRENT_USER, HKEY_LOCAL_MACHINE};
    use winreg::RegKey;

    const UNINSTALL_KEY: &str = r"SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\VoCript";

    // Per-user first: that is what `installMode: currentUser` writes, and what
    // the installer itself reads first when it runs again.
    for hive in [HKEY_CURRENT_USER, HKEY_LOCAL_MACHINE] {
        let Ok(key) = RegKey::predef(hive).open_subkey(UNINSTALL_KEY) else {
            continue;
        };
        let Ok(raw) = key.get_value::<String, _>("InstallLocation") else {
            continue;
        };
        let cleaned = unquote(&raw);
        if !cleaned.is_empty() {
            return Some(cleaned.to_string());
        }
    }
    None
}

/// Tauri's NSIS installer stores this value with the quotes *inside* the data,
/// so the raw string reads `"C:\Program Files\VoCript"`, quote characters and
/// all. Comparing that against a real path would never match.
fn unquote(raw: &str) -> &str {
    raw.trim().trim_matches('"')
}

/// Whether two paths name the same folder.
fn same_folder(a: &Path, b: &Path) -> bool {
    // `canonicalize` resolves 8.3 short names, symlinks, junctions and trailing
    // separators, which a string comparison cannot. It only works on paths that
    // exist, hence the textual fallback below for a target folder that the
    // installer has not created yet.
    if let (Ok(a), Ok(b)) = (a.canonicalize(), b.canonicalize()) {
        return a == b;
    }
    normalize(a) == normalize(b)
}

/// Lowercased, forward slashes folded to backslashes, no trailing separator.
/// Windows paths are case insensitive, and the registry value is written by a
/// different program than the one that produced `current_exe()`.
fn normalize(p: &Path) -> String {
    p.to_string_lossy()
        .replace('/', "\\")
        .trim_end_matches('\\')
        .to_lowercase()
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    #[test]
    fn quotes_around_the_registry_value_are_stripped() {
        assert_eq!(unquote(r#""C:\Apps\VoCript""#), r"C:\Apps\VoCript");
        // Older entries were written without them.
        assert_eq!(unquote(r"C:\Apps\VoCript"), r"C:\Apps\VoCript");
        assert_eq!(unquote("  \"C:\\Apps\\VoCript\"  "), r"C:\Apps\VoCript");
        assert_eq!(unquote(r#""""#), "");
    }

    #[test]
    fn the_same_folder_written_differently_is_still_the_same_folder() {
        // Neither path exists, so this exercises the textual fallback.
        let a = PathBuf::from(r"C:\Apps\Random APPS\vocript");
        let b = PathBuf::from(r"c:\apps\random apps\vocript\");
        assert!(same_folder(&a, &b));

        let c = PathBuf::from("C:/Apps/Random APPS/vocript");
        assert!(same_folder(&a, &c));
    }

    #[test]
    fn different_folders_are_reported_as_different() {
        let running = PathBuf::from(r"C:\Apps\Random APPS\vocript");
        let target = PathBuf::from(r"C:\ct\verify-install");
        assert!(!same_folder(&running, &target));
    }

    #[test]
    fn a_subfolder_is_not_the_parent() {
        let parent = PathBuf::from(r"C:\Apps\vocript");
        let child = PathBuf::from(r"C:\Apps\vocript\resources");
        assert!(!same_folder(&parent, &child));
    }

    /// Reads this machine's actual registry and prints what it found. Ignored
    /// by default because the answer depends on the computer running it, which
    /// is exactly why the automated tests above cannot cover this half.
    ///
    ///     cargo test --lib install_check -- --ignored --nocapture
    #[cfg(target_os = "windows")]
    #[test]
    #[ignore]
    fn manual_what_does_this_machine_say() {
        match install_location_from_registry() {
            Some(dir) => {
                println!("InstallLocation reads: {dir}");
                assert!(!dir.starts_with('"'), "quotes were not stripped");
                assert!(!dir.is_empty());
            }
            None => println!("No install entry on this machine (portable, Scoop, or a dev box)"),
        }

        // `detect_inner` skips the debug guard, so this exercises the whole
        // path for real: current_exe, the registry read and the comparison.
        // The test binary lives under the target directory, so unless that is
        // where the app is installed the answer here should be a mismatch.
        // `paths` es lo que enseña el panel de depuración: tiene que responder
        // siempre, también en una build de desarrollo como esta.
        let p = paths();
        println!("paths() -> running_from: {}", p.running_from);
        println!("paths() -> updates_go_to: {:?}", p.updates_go_to);
        assert!(
            !p.running_from.is_empty(),
            "running_from nunca puede ir vacío"
        );

        println!("running from: {:?}", std::env::current_exe());
        match detect_inner() {
            Some(m) => println!(
                "detect_inner -> MISMATCH\n  running_from: {}\n  updates_go_to: {}",
                m.running_from, m.updates_go_to
            ),
            None => println!("detect_inner -> no mismatch"),
        }
    }

    #[test]
    fn dev_builds_never_report_a_mismatch() {
        // The test binary is a debug build, so this also documents why the
        // guard exists: without it, every `tauri dev` run would warn.
        assert_eq!(detect(), None);
    }
}
