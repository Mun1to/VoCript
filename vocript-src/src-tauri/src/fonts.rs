//! Lists the font families installed on this computer, so the user can pick any
//! of them for the interface instead of the handful VoCript ships with.
//!
//! Reads the registry rather than calling into GDI: the font list lives there in
//! plain text, and `winreg` is already a dependency.

/// Symbol and icon fonts. They are installed on every Windows machine but would
/// turn the interface into dingbats — including the button needed to change the
/// setting back — so they never reach the picker.
#[cfg(target_os = "windows")]
const SYMBOL_FONTS: &[&str] = &[
    "Bookshelf Symbol 7",
    "HoloLens MDL2 Assets",
    "Marlett",
    "MS Outlook",
    "MS Reference Specialty",
    "MT Extra",
    "Segoe Fluent Icons",
    "Segoe MDL2 Assets",
    "SimSun-ExtB",
    "Symbol",
    "Webdings",
    "Wingdings",
    "Wingdings 2",
    "Wingdings 3",
];

#[cfg(target_os = "windows")]
pub fn list_system_fonts() -> Vec<String> {
    use std::collections::BTreeSet;
    use winreg::enums::{HKEY_CURRENT_USER, HKEY_LOCAL_MACHINE};
    use winreg::RegKey;

    const FONTS_KEY: &str = r"SOFTWARE\Microsoft\Windows NT\CurrentVersion\Fonts";

    // BTreeSet: sorted and de-duplicated. A font installed both per-machine and
    // per-user would otherwise show up twice.
    let mut families: BTreeSet<String> = BTreeSet::new();

    for root in [HKEY_LOCAL_MACHINE, HKEY_CURRENT_USER] {
        let Ok(key) = RegKey::predef(root).open_subkey(FONTS_KEY) else {
            continue;
        };
        for (name, _) in key.enum_values().filter_map(Result::ok) {
            if let Some(family) = clean_family_name(&name) {
                families.insert(family);
            }
        }
    }

    families.into_iter().collect()
}

/// Linux: fontconfig is the system's own registry of fonts, and `fc-list`
/// ships with it on every desktop distribution.
#[cfg(target_os = "linux")]
pub fn list_system_fonts() -> Vec<String> {
    use std::collections::BTreeSet;

    let output = match std::process::Command::new("fc-list")
        .args([":", "family"])
        .output()
    {
        Ok(output) if output.status.success() => output.stdout,
        // No fontconfig, no picker: the UI falls back to the bundled fonts.
        _ => return Vec::new(),
    };

    let mut families: BTreeSet<String> = BTreeSet::new();
    for line in String::from_utf8_lossy(&output).lines() {
        // A line lists a family and its aliases, comma-separated; the first
        // entry is the canonical name. Dot-prefixed families are hidden ones.
        let name = line.split(',').next().unwrap_or(line).trim();
        if !name.is_empty() && !name.starts_with('.') {
            families.insert(name.to_string());
        }
    }
    families.into_iter().collect()
}

#[cfg(not(any(target_os = "windows", target_os = "linux")))]
pub fn list_system_fonts() -> Vec<String> {
    // Not wired up on this platform; the UI falls back to the bundled fonts.
    Vec::new()
}

/// Registry entries look like `Arial (TrueType)` or `Meiryo & Meiryo Italic &
/// Meiryo UI & Meiryo UI Italic (TrueType)`. Returns the usable family name, or
/// `None` for entries that should not be offered.
#[cfg(target_os = "windows")]
fn clean_family_name(raw: &str) -> Option<String> {
    let name = match raw.rfind(" (") {
        Some(index) => &raw[..index],
        None => raw,
    };
    // Multi-family entries list every style; the first one is the base family.
    let name = name.split('&').next().unwrap_or(name).trim();

    if name.is_empty() || SYMBOL_FONTS.contains(&name) {
        return None;
    }
    Some(name.to_string())
}

#[tauri::command]
#[specta::specta]
pub fn get_system_fonts() -> Vec<String> {
    list_system_fonts()
}

#[cfg(all(test, target_os = "windows"))]
mod tests {
    use super::*;

    #[test]
    fn strips_the_font_type_suffix() {
        assert_eq!(clean_family_name("Arial (TrueType)").unwrap(), "Arial");
        assert_eq!(
            clean_family_name("Segoe UI Semibold (TrueType)").unwrap(),
            "Segoe UI Semibold"
        );
    }

    #[test]
    fn takes_the_first_family_of_a_grouped_entry() {
        assert_eq!(
            clean_family_name("Meiryo & Meiryo Italic & Meiryo UI (TrueType)").unwrap(),
            "Meiryo"
        );
    }

    #[test]
    fn drops_symbol_fonts() {
        assert!(clean_family_name("Wingdings (TrueType)").is_none());
        assert!(clean_family_name("Segoe MDL2 Assets (TrueType)").is_none());
    }

    #[test]
    fn keeps_names_without_a_suffix() {
        assert_eq!(clean_family_name("Inter").unwrap(), "Inter");
    }
}
