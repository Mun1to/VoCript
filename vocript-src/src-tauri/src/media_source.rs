//! "Now playing" media source detection for system-audio transcription.
//!
//! When the user transcribes system audio (a YouTube video in a browser, a
//! Spotify podcast…), we snapshot what's playing via the Windows System Media
//! Transport Controls (SMTC) so the transcription can be attributed to its
//! source (title, artist/channel, app and the playback position/minute).
//!
//! Everything here is best-effort: any failure returns `None` and no source is
//! appended. Non-Windows targets always return `None` (SMTC is Windows-only).

/// A snapshot of the media playing when a system-audio capture started.
#[derive(Debug, Clone)]
pub struct MediaSnapshot {
    pub title: String,
    pub artist: String,
    /// Friendly app name (e.g. "Spotify", "Brave"), best-effort from the AUMID.
    pub app: String,
    /// Playback position in whole seconds at capture time, if known.
    pub position_secs: Option<u64>,
    /// Best-effort source URL of the active browser tab. For YouTube it includes
    /// the exact timestamp (`&t=…s`). `None` when not a browser / not readable.
    pub link: Option<String>,
}

impl MediaSnapshot {
    /// Build the "Fuente: …" attribution line appended to the transcription.
    /// `lang` is the app language (e.g. "es", "en-US") used to localize labels.
    pub fn format_source_line(&self, lang: &str) -> String {
        let is_es = lang.to_lowercase().starts_with("es");
        let (source_label, at_label) = if is_es {
            ("Fuente", "minuto")
        } else {
            ("Source", "at")
        };

        let mut parts: Vec<String> = vec![self.title.trim().to_string()];
        if !self.artist.trim().is_empty() {
            parts.push(self.artist.trim().to_string());
        }
        if !self.app.trim().is_empty() {
            parts.push(self.app.trim().to_string());
        }

        let mut line = format!("{}: {}", source_label, parts.join(" · "));
        if let Some(secs) = self.position_secs {
            line.push_str(&format!(" · {} {}", at_label, format_timestamp(secs)));
        }
        if let Some(link) = &self.link {
            if !link.trim().is_empty() {
                line.push('\n');
                line.push_str(link.trim());
            }
        }
        line
    }
}

/// Format seconds as `M:SS` (or `H:MM:SS` past an hour).
fn format_timestamp(secs: u64) -> String {
    let h = secs / 3600;
    let m = (secs % 3600) / 60;
    let s = secs % 60;
    if h > 0 {
        format!("{}:{:02}:{:02}", h, m, s)
    } else {
        format!("{}:{:02}", m, s)
    }
}

/// Capture the currently-playing media, or `None` if nothing is playing / the
/// platform doesn't support it.
pub fn capture() -> Option<MediaSnapshot> {
    #[cfg(windows)]
    {
        // Run on a dedicated MTA thread so WinRT's blocking `.get()` never
        // touches the caller's COM apartment (which could be STA).
        std::thread::spawn(capture_windows).join().ok().flatten()
    }
    #[cfg(not(windows))]
    {
        None
    }
}

#[cfg(windows)]
fn capture_windows() -> Option<MediaSnapshot> {
    use windows::Media::Control::GlobalSystemMediaTransportControlsSessionManager as SessionManager;
    use windows::Win32::System::Com::{CoInitializeEx, COINIT_MULTITHREADED};

    unsafe {
        // Ignore the result: a non-S_OK return (already initialized / changed
        // mode) is fine — we only need *some* apartment for the WinRT calls.
        let _ = CoInitializeEx(None, COINIT_MULTITHREADED);
    }

    let manager = SessionManager::RequestAsync().ok()?.get().ok()?;
    let session = manager.GetCurrentSession().ok()?;

    let props = session.TryGetMediaPropertiesAsync().ok()?.get().ok()?;
    let title = props.Title().ok()?.to_string();
    if title.trim().is_empty() {
        return None;
    }
    let artist = props.Artist().map(|h| h.to_string()).unwrap_or_default();

    let app = session
        .SourceAppUserModelId()
        .map(|h| friendly_app_name(&h.to_string()))
        .unwrap_or_default();

    // TimeSpan is in 100-nanosecond units.
    let position_secs = session
        .GetTimelineProperties()
        .ok()
        .and_then(|tl| tl.Position().ok())
        .map(|ts| (ts.Duration.max(0) / 10_000_000) as u64);

    // Best-effort: if the foreground window is a browser, grab the active tab's
    // URL and (for YouTube) tack on the exact timestamp.
    let link = capture_browser_link(position_secs);

    Some(MediaSnapshot {
        title,
        artist,
        app,
        position_secs,
        link,
    })
}

/// If the foreground window is a known browser, read its active tab URL and,
/// for YouTube, append the exact `&t=…s` timestamp. Best-effort.
#[cfg(windows)]
fn capture_browser_link(position_secs: Option<u64>) -> Option<String> {
    use windows::Win32::UI::WindowsAndMessaging::GetForegroundWindow;

    let hwnd = unsafe { GetForegroundWindow() };
    if hwnd.0.is_null() {
        return None;
    }

    let proc = process_name_of_window(hwnd)?;
    let is_browser = [
        "chrome", "brave", "msedge", "firefox", "opera", "vivaldi", "chromium",
    ]
    .iter()
    .any(|b| proc.contains(b));
    if !is_browser {
        return None;
    }

    let url = read_address_bar(hwnd)?;
    Some(build_link(&url, position_secs))
}

/// Lower-cased executable name of the process that owns `hwnd`.
#[cfg(windows)]
fn process_name_of_window(hwnd: windows::Win32::Foundation::HWND) -> Option<String> {
    use windows::Win32::Foundation::CloseHandle;
    use windows::Win32::System::Threading::{
        OpenProcess, QueryFullProcessImageNameW, PROCESS_NAME_WIN32,
        PROCESS_QUERY_LIMITED_INFORMATION,
    };
    use windows::Win32::UI::WindowsAndMessaging::GetWindowThreadProcessId;

    let mut pid: u32 = 0;
    unsafe { GetWindowThreadProcessId(hwnd, Some(&mut pid)) };
    if pid == 0 {
        return None;
    }

    let handle = unsafe { OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid) }.ok()?;

    let mut buf = [0u16; 260];
    let mut len = buf.len() as u32;
    let result = unsafe {
        QueryFullProcessImageNameW(
            handle,
            PROCESS_NAME_WIN32,
            windows::core::PWSTR(buf.as_mut_ptr()),
            &mut len,
        )
    };
    unsafe {
        let _ = CloseHandle(handle);
    }
    result.ok()?;

    let full = String::from_utf16_lossy(&buf[..len as usize]);
    Some(
        full.rsplit(['\\', '/'])
            .next()
            .unwrap_or(&full)
            .to_lowercase(),
    )
}

/// Read the address-bar (omnibox) value of a browser window via UI Automation.
#[cfg(windows)]
fn read_address_bar(hwnd: windows::Win32::Foundation::HWND) -> Option<String> {
    use windows::core::Interface;
    use windows::Win32::System::Com::{CoCreateInstance, CLSCTX_INPROC_SERVER};
    use windows::Win32::System::Variant::VARIANT;
    use windows::Win32::UI::Accessibility::{
        CUIAutomation, IUIAutomation, IUIAutomationValuePattern, TreeScope_Descendants,
        UIA_ControlTypePropertyId, UIA_EditControlTypeId, UIA_ValuePatternId,
    };

    let uia: IUIAutomation =
        unsafe { CoCreateInstance(&CUIAutomation, None, CLSCTX_INPROC_SERVER) }.ok()?;
    let root = unsafe { uia.ElementFromHandle(hwnd) }.ok()?;

    // Find the first Edit control (the omnibox sits in the toolbar, ahead of the
    // page content in the tree).
    let variant = VARIANT::from(UIA_EditControlTypeId.0);
    let condition =
        unsafe { uia.CreatePropertyCondition(UIA_ControlTypePropertyId, &variant) }.ok()?;
    let edit = unsafe { root.FindFirst(TreeScope_Descendants, &condition) }.ok()?;

    let pattern = unsafe { edit.GetCurrentPattern(UIA_ValuePatternId) }.ok()?;
    let value_pattern: IUIAutomationValuePattern = pattern.cast().ok()?;
    let url = unsafe { value_pattern.CurrentValue() }.ok()?.to_string();

    // Guard against grabbing a search box rather than the address bar.
    if url.trim().is_empty() || url.contains(' ') || !url.contains('.') {
        return None;
    }
    Some(url)
}

/// Normalize the URL and, for YouTube, append the exact playback timestamp.
#[cfg(windows)]
fn build_link(url: &str, position_secs: Option<u64>) -> String {
    let normalized = if url.starts_with("http://") || url.starts_with("https://") {
        url.to_string()
    } else {
        format!("https://{}", url)
    };

    let lower = normalized.to_lowercase();
    let is_youtube = lower.contains("youtube.com/watch") || lower.contains("youtu.be/");
    if let (true, Some(secs)) = (is_youtube, position_secs) {
        if secs > 0 && !lower.contains("t=") {
            let sep = if normalized.contains('?') { '&' } else { '?' };
            return format!("{}{}t={}s", normalized, sep, secs);
        }
    }
    normalized
}

/// Turn an SMTC `SourceAppUserModelId` (an AUMID or exe path) into a friendly
/// app name. Best-effort: covers the common players/browsers, otherwise falls
/// back to the executable's base name.
#[cfg(windows)]
fn friendly_app_name(aumid: &str) -> String {
    let a = aumid.to_lowercase();
    let known = [
        ("spotify", "Spotify"),
        ("brave", "Brave"),
        ("chrome", "Chrome"),
        ("msedge", "Edge"),
        ("firefox", "Firefox"),
        ("opera", "Opera"),
        ("vivaldi", "Vivaldi"),
        ("zen", "Zen"),
        ("vlc", "VLC"),
        ("chromium", "Chromium"),
    ];
    for (needle, name) in known {
        if a.contains(needle) {
            return name.to_string();
        }
    }
    // Fall back to the executable base name without extension.
    let base = aumid.rsplit(['\\', '/']).next().unwrap_or(aumid);
    let base = base
        .strip_suffix(".exe")
        .or_else(|| base.strip_suffix(".Exe"))
        .unwrap_or(base);
    base.to_string()
}
