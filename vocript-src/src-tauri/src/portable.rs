use std::path::PathBuf;
use std::sync::OnceLock;
use tauri::Manager;

// Portable mode support for Handy.
//
// When a file named `portable` exists next to the executable, all user data
// (settings, models, recordings, database, logs) is stored in a `Data/`
// directory alongside the executable instead of `%APPDATA%`.

static PORTABLE_DATA_DIR: OnceLock<Option<PathBuf>> = OnceLock::new();

/// Detect portable mode by looking for a `portable` marker file next to the exe.
/// Must be called once at startup before Tauri initializes.
pub fn init() {
    PORTABLE_DATA_DIR.get_or_init(|| {
        let exe_path = std::env::current_exe().ok()?;
        let exe_dir = exe_path.parent()?;

        let marker_path = exe_dir.join("portable");
        let data_dir = exe_dir.join("Data");

        let is_portable = if is_valid_portable_marker(&marker_path) {
            true
        } else if marker_path.exists() && data_dir.exists() {
            // Migration: v0.8.0 created an empty marker file. If we find an
            // empty/invalid marker alongside an existing Data/ dir, this is a
            // real portable install — upgrade the marker in place.
            eprintln!("[portable] upgrading legacy empty marker to magic string");
            let _ = std::fs::write(&marker_path, "VoCript Portable Mode");
            true
        } else {
            false
        };

        if is_portable {
            if !data_dir.exists() {
                std::fs::create_dir_all(&data_dir).ok()?;
            }
            eprintln!("[portable] data dir: {}", data_dir.display());
            Some(data_dir)
        } else {
            None
        }
    });
}

/// Returns `true` if running in portable mode.
pub fn is_portable() -> bool {
    PORTABLE_DATA_DIR.get().and_then(|v| v.as_ref()).is_some()
}

/// Get the portable data dir (if active). Does not require an AppHandle.
/// Returns `None` when not in portable mode.
pub fn data_dir() -> Option<&'static PathBuf> {
    PORTABLE_DATA_DIR.get().and_then(|v| v.as_ref())
}

/// Portable-aware replacement for `app.path().app_data_dir()`.
pub fn app_data_dir(app: &tauri::AppHandle) -> Result<PathBuf, tauri::Error> {
    if let Some(dir) = data_dir() {
        Ok(dir.clone())
    } else {
        app.path().app_data_dir()
    }
}

/// Portable-aware replacement for `app.path().app_log_dir()`.
pub fn app_log_dir(app: &tauri::AppHandle) -> Result<PathBuf, tauri::Error> {
    if let Some(dir) = data_dir() {
        Ok(dir.join("logs"))
    } else {
        app.path().app_log_dir()
    }
}

/// Resolve a relative path against the app data directory (portable-aware).
/// Replaces `app.path().resolve(path, BaseDirectory::AppData)`.
pub fn resolve_app_data(app: &tauri::AppHandle, relative: &str) -> Result<PathBuf, tauri::Error> {
    Ok(app_data_dir(app)?.join(relative))
}

/// Get the path to use with `tauri-plugin-store`.
/// Returns an absolute path in portable mode (so the store plugin writes to
/// the portable Data dir) or the original relative path otherwise.
pub fn store_path(relative: &str) -> PathBuf {
    if let Some(dir) = data_dir() {
        dir.join(relative)
    } else {
        PathBuf::from(relative)
    }
}

/// Identificador antiguo (antes del rebrand a VoCript). Las versiones <= 2.2.4
/// guardaban los datos del usuario en `%APPDATA%\com.muvox.app`.
const LEGACY_IDENTIFIER: &str = "com.muvox.app";

/// Migra los datos de usuario de una instalación antigua (`com.muvox.app`) a la
/// carpeta actual (`com.vocript.app`) la primera vez que se abre la versión
/// renombrada. Así nadie pierde su modelo descargado, historial ni ajustes al
/// actualizar. Solo aplica en instalaciones normales (no portable) y solo se
/// ejecuta si la carpeta nueva aún no tiene un modelo descargado.
pub fn migrate_legacy_identifier_data(app: &tauri::AppHandle) {
    // En modo portable los datos viven junto al .exe, no hay nada que migrar.
    if is_portable() {
        return;
    }

    let current = match app.path().app_data_dir() {
        Ok(d) => d,
        Err(_) => return,
    };
    let legacy = match current.parent() {
        Some(p) => p.join(LEGACY_IDENTIFIER),
        None => return,
    };

    // Nada que migrar si no hay carpeta antigua o si ya es la misma.
    if !legacy.exists() || legacy == current {
        return;
    }

    // Si la carpeta nueva ya tiene un modelo descargado, la migración ya se hizo
    // (o el usuario ya usó la versión nueva) — no tocar nada.
    if dir_has_files(&current.join("models")) {
        return;
    }

    eprintln!(
        "[migrate] migrando datos de usuario de {} a {}",
        legacy.display(),
        current.display()
    );
    let _ = std::fs::create_dir_all(&current);

    // Mover cada entrada de la carpeta antigua a la nueva, EXCEPTO los logs
    // (los gestiona el logger y podrían estar en uso).
    if let Ok(entries) = std::fs::read_dir(&legacy) {
        for entry in entries.flatten() {
            let name = entry.file_name();
            if name == "logs" {
                continue;
            }
            let from = entry.path();
            let to = current.join(&name);
            // Sobrescribir lo que hubiera vacío en la carpeta nueva.
            if to.exists() {
                if to.is_dir() {
                    let _ = std::fs::remove_dir_all(&to);
                } else {
                    let _ = std::fs::remove_file(&to);
                }
            }
            if std::fs::rename(&from, &to).is_err() {
                // rename puede fallar entre volúmenes distintos: copiar y borrar.
                if copy_recursively(&from, &to).is_ok() {
                    if from.is_dir() {
                        let _ = std::fs::remove_dir_all(&from);
                    } else {
                        let _ = std::fs::remove_file(&from);
                    }
                }
            }
        }
    }
    eprintln!("[migrate] migración completada");
}

/// `true` si el directorio existe y contiene al menos una entrada.
fn dir_has_files(dir: &std::path::Path) -> bool {
    std::fs::read_dir(dir)
        .map(|mut it| it.next().is_some())
        .unwrap_or(false)
}

/// Copia recursivamente un fichero o directorio (usado como fallback cuando
/// `rename` no puede cruzar volúmenes).
fn copy_recursively(from: &std::path::Path, to: &std::path::Path) -> std::io::Result<()> {
    if from.is_dir() {
        std::fs::create_dir_all(to)?;
        for entry in std::fs::read_dir(from)? {
            let entry = entry?;
            copy_recursively(&entry.path(), &to.join(entry.file_name()))?;
        }
    } else {
        if let Some(parent) = to.parent() {
            std::fs::create_dir_all(parent)?;
        }
        std::fs::copy(from, to)?;
    }
    Ok(())
}

/// Check if a marker file path contains the portable magic string.
/// Extracted for testability.
fn is_valid_portable_marker(path: &std::path::Path) -> bool {
    std::fs::read_to_string(path)
        .map(|s| s.trim().starts_with("VoCript Portable Mode"))
        .unwrap_or(false)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;

    #[test]
    fn test_valid_magic_string_enables_portable() {
        let dir = std::env::temp_dir().join("handy_test_valid");
        std::fs::create_dir_all(&dir).unwrap();
        let marker = dir.join("portable");
        let mut f = std::fs::File::create(&marker).unwrap();
        write!(f, "VoCript Portable Mode").unwrap();
        assert!(is_valid_portable_marker(&marker));
        std::fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn test_empty_file_does_not_enable_portable() {
        let dir = std::env::temp_dir().join("handy_test_empty");
        std::fs::create_dir_all(&dir).unwrap();
        let marker = dir.join("portable");
        std::fs::File::create(&marker).unwrap();
        assert!(!is_valid_portable_marker(&marker));
        std::fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn test_wrong_content_does_not_enable_portable() {
        let dir = std::env::temp_dir().join("handy_test_wrong");
        std::fs::create_dir_all(&dir).unwrap();
        let marker = dir.join("portable");
        let mut f = std::fs::File::create(&marker).unwrap();
        write!(f, "some other content").unwrap();
        assert!(!is_valid_portable_marker(&marker));
        std::fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn test_missing_file_does_not_enable_portable() {
        let path = std::path::Path::new("/nonexistent/portable");
        assert!(!is_valid_portable_marker(path));
    }

    #[test]
    fn test_legacy_empty_marker_without_data_dir_does_not_enable_portable() {
        // Empty marker alone (scoop scenario) — no Data/ dir → not portable
        let dir = std::env::temp_dir().join("handy_test_legacy_no_data");
        std::fs::create_dir_all(&dir).unwrap();
        let marker = dir.join("portable");
        std::fs::File::create(&marker).unwrap();
        assert!(!is_valid_portable_marker(&marker));
        std::fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn test_magic_string_with_whitespace_enables_portable() {
        let dir = std::env::temp_dir().join("handy_test_ws");
        std::fs::create_dir_all(&dir).unwrap();
        let marker = dir.join("portable");
        let mut f = std::fs::File::create(&marker).unwrap();
        writeln!(f, "  VoCript Portable Mode").unwrap();
        assert!(is_valid_portable_marker(&marker));
        std::fs::remove_dir_all(dir).unwrap();
    }
}
