//! Whether this copy is running from an installed MSIX package.
//!
//! The Microsoft Store build is the same executable as the one in the plain
//! installer, but it lives under a very different set of rules: its folder in
//! `C:\Program Files\WindowsApps` is read-only and managed by Windows, its
//! registry writes are redirected into the package's private hive, and Store
//! policy does not allow an app to fetch and run executables from outside the
//! Store. Anything that assumes it can update itself, or that a registry value
//! it wrote is visible to the system, has to step aside when this returns true.
//!
//! `GetCurrentPackageFullName` is the supported way to ask: it answers
//! `APPMODEL_ERROR_NO_PACKAGE` for a process that has no package identity,
//! which is every non-Store install. Checking the executable path for
//! `WindowsApps` would be a guess; this is the question itself.

/// True when the process runs with package identity, i.e. installed from an
/// MSIX package. Computed once: it cannot change while the process lives.
pub fn is_packaged() -> bool {
    #[cfg(target_os = "windows")]
    {
        use std::sync::OnceLock;
        static PACKAGED: OnceLock<bool> = OnceLock::new();
        *PACKAGED.get_or_init(detect)
    }
    #[cfg(not(target_os = "windows"))]
    {
        false
    }
}

#[cfg(target_os = "windows")]
fn detect() -> bool {
    use windows::core::PWSTR;
    use windows::Win32::Foundation::{APPMODEL_ERROR_NO_PACKAGE, ERROR_INSUFFICIENT_BUFFER};
    use windows::Win32::Storage::Packaging::Appx::GetCurrentPackageFullName;

    // PACKAGE_FULL_NAME_MAX_LENGTH is 127 wide chars plus the terminator, so a
    // real name always fits and the only expected outcomes are "no package" or
    // success. A buffer complaint is treated as packaged: it can only happen
    // when there is a name to report.
    let mut length: u32 = 128;
    let mut buffer = [0u16; 128];
    let result =
        unsafe { GetCurrentPackageFullName(&mut length, Some(PWSTR(buffer.as_mut_ptr()))) };

    if result == APPMODEL_ERROR_NO_PACKAGE {
        return false;
    }
    if result.is_ok() || result == ERROR_INSUFFICIENT_BUFFER {
        log::info!("running from an MSIX package: self-update paths disabled");
        return true;
    }
    // Anything else is a surprise. The safe answer is "not packaged", which
    // keeps the plain installer behaving exactly as it always has.
    log::warn!("GetCurrentPackageFullName returned {result:?}; assuming not packaged");
    false
}
