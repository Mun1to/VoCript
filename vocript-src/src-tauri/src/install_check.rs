//! Catches an installation whose updates would land in a folder nobody opens.
//!
//! Not hypothetical. On 2026-08-15 a machine turned up with its shortcuts
//! pointing at one folder while the registry pointed the installer at another.
//! Every update installed perfectly, into the folder nobody launched, so each
//! reboot brought back the old version and offered the same update again. From
//! the outside that is indistinguishable from a broken updater, and there is no
//! way for a user to diagnose it without a registry editor.
//!
//! The first version of this check read `InstallLocation`, which is the wrong
//! value and let the same machine pass as healthy for another day. See
//! `install_location_from_registry` for which value actually decides.
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
pub fn paths(product: &str) -> InstallPaths {
    let running_from = std::env::current_exe()
        .ok()
        .and_then(|exe| exe.parent().map(|p| p.to_string_lossy().into_owned()))
        .unwrap_or_default();

    #[cfg(target_os = "windows")]
    let updates_go_to = install_location_from_registry(product);
    #[cfg(not(target_os = "windows"))]
    let updates_go_to = {
        let _ = product;
        None
    };

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
pub fn detect(product: &str) -> Option<InstallMismatch> {
    // A dev build runs from `target/debug`, which never matches the installed
    // copy, so this would fire on every single `tauri dev` launch.
    if cfg!(debug_assertions) {
        return None;
    }
    detect_inner(product)
}

#[cfg(not(target_os = "windows"))]
fn detect_inner(_product: &str) -> Option<InstallMismatch> {
    None
}

#[cfg(target_os = "windows")]
fn detect_inner(product: &str) -> Option<InstallMismatch> {
    // Portable copies live outside any install location on purpose, and they
    // already refuse to self-update with a dialog of their own.
    if crate::portable::is_portable() {
        return None;
    }

    // A Store install never updates through this path, and a leftover registry
    // key from an older plain install would otherwise make it warn that updates
    // go somewhere else - true, and completely irrelevant to this copy.
    if crate::packaged::is_packaged() {
        return None;
    }

    let exe = std::env::current_exe().ok()?;
    let running_from = exe.parent()?.to_path_buf();

    // No registry entry means nothing claims to know where updates go: a Scoop
    // install, a hand-unzipped copy, a first run before the installer ever ran.
    // Guessing a target here would only invent false alarms.
    let updates_go_to = std::path::PathBuf::from(install_location_from_registry(product)?);

    if same_folder(&running_from, &updates_go_to) {
        return None;
    }

    Some(InstallMismatch {
        running_from: running_from.to_string_lossy().into_owned(),
        updates_go_to: updates_go_to.to_string_lossy().into_owned(),
    })
}

/// Where the NSIS installer would put the next update.
///
/// This reads `Software\<Publisher>\<ProductName>` and NOT the `InstallLocation`
/// under the uninstall key, which is the obvious-looking one and the wrong one.
/// In Tauri's `installer.nsi` the target folder comes from
/// `RestorePreviousInstallLocation`, which reads only this value:
///
/// ```nsi
/// Function RestorePreviousInstallLocation
///   ReadRegStr $4 SHCTX "${MANUPRODUCTKEY}" ""
///   StrCmp $4 "" +2 0
///     StrCpy $INSTDIR $4
/// ```
///
/// `InstallLocation` is written beside it for the Windows "Installed apps" list
/// and is never read back. The two can disagree, and on the machine that
/// prompted this check they did: reading the harmless one found it matching and
/// reported the install healthy while every update went somewhere else.
#[cfg(target_os = "windows")]
fn install_location_from_registry(product: &str) -> Option<String> {
    use winreg::enums::{HKEY_CURRENT_USER, HKEY_LOCAL_MACHINE};
    use winreg::RegKey;

    // MANUPRODUCTKEY in installer.nsi is Software\${MANUFACTURER}\${PRODUCTNAME},
    // so the product half comes from whoever is running, not from a constant.
    //
    // It used to be hardcoded, and that was a real bug: an edition with its own
    // `productName` read the *other* edition's key, decided its updates would
    // land in a folder it does not use, and refused to update at all. The
    // publisher half stays fixed because it is the same for every edition.
    let install_dir_key = format!(r"Software\VoCript\{product}");

    // Per-user first: that is the hive `installMode: currentUser` writes to, and
    // the one SHCTX resolves to when the installer runs again.
    for hive in [HKEY_CURRENT_USER, HKEY_LOCAL_MACHINE] {
        let Ok(key) = RegKey::predef(hive).open_subkey(&install_dir_key) else {
            continue;
        };
        // The default value of the key, written bare by `WriteRegStr ... "" $INSTDIR`.
        let Ok(raw) = key.get_value::<String, _>("") else {
            continue;
        };
        let cleaned = unquote(&raw);
        if !cleaned.is_empty() {
            return Some(cleaned.to_string());
        }
    }
    None
}

/// The install folder is written bare, but `InstallLocation` beside it carries
/// its quotes *inside* the data (`"C:\Program Files\VoCript"`, quote characters
/// and all). Stripping them costs nothing and keeps an entry written by an older
/// installer, or read from the other key, from failing every comparison.
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
        // El nombre del producto de esta edición. La de pruebas es la de casa.
        const PRODUCTO: &str = "VoCript";
        match install_location_from_registry(PRODUCTO) {
            Some(dir) => {
                println!("Software\\VoCript\\{PRODUCTO} (decides) reads: {dir}");
                assert!(!dir.starts_with('"'), "quotes were not stripped");
                assert!(!dir.is_empty());
            }
            None => println!("No install entry on this machine (portable, Scoop, or a dev box)"),
        }

        // Printed alongside because the two disagreeing is the whole failure,
        // and a support log that shows only one of them cannot say so.
        {
            use winreg::enums::HKEY_CURRENT_USER;
            use winreg::RegKey;
            let shown = RegKey::predef(HKEY_CURRENT_USER)
                .open_subkey(r"Software\Microsoft\Windows\CurrentVersion\Uninstall\VoCript")
                .ok()
                .and_then(|k| k.get_value::<String, _>("InstallLocation").ok());
            println!("InstallLocation (display only) reads: {shown:?}");
        }

        // `detect_inner` skips the debug guard, so this exercises the whole
        // path for real: current_exe, the registry read and the comparison.
        // The test binary lives under the target directory, so unless that is
        // where the app is installed the answer here should be a mismatch.
        // `paths` es lo que enseña el panel de depuración: tiene que responder
        // siempre, también en una build de desarrollo como esta.
        let p = paths(PRODUCTO);
        println!("paths() -> running_from: {}", p.running_from);
        println!("paths() -> updates_go_to: {:?}", p.updates_go_to);
        assert!(
            !p.running_from.is_empty(),
            "running_from nunca puede ir vacío"
        );

        println!("running from: {:?}", std::env::current_exe());
        match detect_inner(PRODUCTO) {
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
        assert_eq!(detect("VoCript"), None);
    }
}
