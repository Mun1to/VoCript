<div align="center">

# 🎙️ VoCript

**Speak and it types.** Turn your **voice** and your **PC's audio** into text, instantly and 100% offline.

🌍 [Español](README.es.md) · English

<p>
  <a href="https://vocript.app">
    <img src="https://img.shields.io/badge/website-vocript.app-3b82f6?style=for-the-badge" alt="vocript.app" />
  </a>
  <a href="https://github.com/Mun1to/VoCript/releases/latest">
    <img src="https://img.shields.io/github/v/release/Mun1to/VoCript?label=version&style=for-the-badge&color=3b82f6" alt="Latest release" />
  </a>
  <a href="LICENSE">
    <img src="https://img.shields.io/badge/license-MIT-3b82f6?style=for-the-badge" alt="MIT license" />
  </a>
  <a href="SECURITY.md">
    <img src="https://img.shields.io/badge/100%25-local%20%26%20private-22c55e?style=for-the-badge" alt="100% local and private" />
  </a>
</p>

<p align="center">
  <a href="https://github.com/Mun1to/VoCript/releases/latest/download/VoCript-Setup.exe">
    <img src="brand/download-button-en.svg" alt="Download VoCript for Windows" width="260" height="59" />
  </a>
  <a href="https://github.com/Mun1to/VoCript/releases/latest/download/VoCript-x86_64.AppImage">
    <img src="brand/download-button-linux-en.svg" alt="Download VoCript for Linux" width="260" height="59" />
  </a>
  <a href="https://github.com/Mun1to/VoCript/releases/latest/download/VoCript-arm64.dmg">
    <img src="brand/download-button-mac-en.svg" alt="Download VoCript for macOS" width="260" height="59" />
  </a>
</p>

</div>

https://github.com/user-attachments/assets/b98eb03e-de11-45ea-8825-645253d8ad12

## ✨ What it does

VoCript listens to your **voice** (or the **audio playing on your PC**) and turns it into text **right where your cursor is**, in any app. All recognition happens **on your device**: no accounts, no cloud, no waiting.

- 🎤 **Voice dictation**: press a shortcut, speak, and the text types itself into whatever app you're using.
- 🔊 **System audio**: transcribe what's playing on your PC (a video, a call, a meeting) or a specific app, and optionally tag where it came from.
- ⚡ **Live transcription**: watch the text appear word by word in a floating bubble as you speak or play audio.
- 📁 **Files to text or subtitles**: drop in an audio or video file and get plain text or `.srt` subtitles.
- 🎯 **Accuracy your way**: a **personal dictionary** of exact replacements plus **custom words** that fix names or jargon by how they sound (with CSV import/export).
- 💼 **Work profiles**: *Normal*, *Coding* (dictate symbols: "at sign" → `@`, "semicolon" → `;`) or *Custom* with your own commands.
- 🌍 **Multi-language**: interface in 20 languages and transcription in dozens, with a **quick language switch** (app and model at once). Tuned for Spanish accents and punctuation.
- 🕑 **History**: keeps your transcriptions and lets you replay the original audio anytime.
- 🎨 **Make it yours**: light, dark or **automatic (follows your system)** theme. On first launch it picks up your device's **language and theme**, then a quick guided tour shows you the basics.
- 🔒 **100% local**: no telemetry, with automatic, signed updates.

---

## ⬇️ Download

### Windows

1. Click the **Download** button above, or use this direct link: **[download VoCript](https://github.com/Mun1to/VoCript/releases/latest/download/VoCript-Setup.exe)**. The installer downloads instantly.
2. Open the downloaded file (`VoCript-Setup.exe`).
3. Follow the steps. Done!

> Windows may show an "unknown publisher" warning (the app isn't signed with a
> paid certificate yet). Click **More info → Run anyway**.

### Linux

Download **[VoCript-x86_64.AppImage](https://github.com/Mun1to/VoCript/releases/latest/download/VoCript-x86_64.AppImage)**, make it executable and run it. No installation needed:

```bash
chmod +x VoCript-x86_64.AppImage
./VoCript-x86_64.AppImage
```

There are also native packages: a `.deb` for Debian and Ubuntu on the
[Releases page](https://github.com/Mun1to/VoCript/releases/latest)
(`sudo apt install ./VoCript_*.deb`), and an
**[.rpm](https://github.com/Mun1to/VoCript/releases/latest/download/VoCript-x86_64.rpm)**
for Fedora (`sudo dnf install ./VoCript-x86_64.rpm`).

On Fedora, pick the `.rpm`: it uses the WebKit your system already has instead
of carrying its own, which is where the AppImage runs into trouble there.

> **Needs a reasonably current distro**: glibc 2.39 or newer (Ubuntu 24.04+,
> Debian 13, Fedora 40+, Arch). The speech engines ship as prebuilt binaries
> that require it. **Ubuntu 22.04 and Debian 12 are out**: VoCript will not
> start there. Checked in a clean container for each of these distros, see
> [tools/linux-compat](tools/linux-compat).

> Two things work differently on Linux: **system-audio capture is Windows-only**
> for now (dictating with the microphone works normally), and on **Wayland**
> global shortcuts and auto-typing are limited; X11 is the smoother ride.

### macOS

Paste this in Terminal:

```bash
curl -fsSL https://raw.githubusercontent.com/Mun1to/VoCript/main/tools/install-macos.sh | sh
```

It downloads the latest build and puts VoCript in your Applications folder, and
the app then opens like any other, with no security dialog.

> **Apple Silicon only** (M1 and newer). Intel Macs are not supported.

<details>
<summary>Why a command and not just the .dmg?</summary>

The [.dmg](https://github.com/Mun1to/VoCript/releases/latest/download/VoCript-arm64.dmg)
is still there and works. What it also does is walk you into **"Apple could not
verify that this app is free of malware"**, because VoCript is not notarized -
that needs a paid Apple Developer account, and there is no free tier for it.

Your browser tags everything it downloads with `com.apple.quarantine`, and that
tag is what makes macOS check with Apple before opening an app. `curl` does not
set it, and Apple has said it never will, so a copy installed this way is never
sent to Gatekeeper in the first place. The app is still signed - Apple Silicon
requires that of every binary - just not by an account Apple has charged for.

Nothing on your Mac is weakened by this: no setting is changed, and the script
only installs one app without the browser's download tag. It is about forty
lines and worth reading before you pipe anything into a shell, including this.

If you took the .dmg instead, either click **Open Anyway** in **System Settings
→ Privacy & Security**, or run:

```bash
xattr -dr com.apple.quarantine /Applications/VoCript.app
```

</details>

> Two things work differently on macOS: **system-audio capture is Windows-only**
> for now (dictating with the microphone works normally), and macOS will ask for
> **Accessibility** permission; without it the app cannot type into other apps.

<details>
<summary>Dictation types nothing after an update? Here is the 30 second fix</summary>

macOS decides whether an app still holds a permission by looking at the exact
fingerprint of the app file. VoCript is signed, but not with a paid Apple
Developer certificate, so that fingerprint is all macOS has to go on, and every
update changes it. The result: after updating, the switch next to VoCript under
**Accessibility** is still there and still **on**, but macOS quietly stops
honouring it. Dictation records, and then types nothing.

To fix it:

1. Quit VoCript completely (**Cmd+Q**, and check it is gone from the menu bar).
2. Open **System Settings > Privacy & Security > Accessibility**.
3. Select **VoCript** in the list and click the **-** button below it to remove
   the entry.
4. Open VoCript again and grant the permission when it asks.

If it still says *Waiting*, run this in Terminal and then open VoCript again:

```bash
tccutil reset Accessibility com.vocript.app
```

The only real cure is a Developer ID certificate, the same 99 dollars a year
account that would let us notarize the app. Until VoCript has enough Mac users
to justify it, this is the workaround, and it is the one every ad-hoc signed Mac
app lives with. Apple explains the underlying reason in
[TN3127](https://developer.apple.com/documentation/technotes/tn3127-inside-code-signing-requirements).

</details>

> ⚠️ **macOS support is young.** It has been installed and used on a real Mac,
> but on far fewer machines than Windows, so if something misbehaves please
> [open an issue](https://github.com/Mun1to/VoCript/issues/new).

> 💡 Prefer to see all versions and files? They're on the [Releases page](https://github.com/Mun1to/VoCript/releases/latest).

## 🔄 Automatic updates

VoCript updates **itself**: on launch it checks for a new version and, if there
is one, installs it with a single click. No manual re-downloading.

---

## ⌨️ How to use it

1. Open VoCript (it lives in the system tray, next to the clock).
2. On first run, pick and download a transcription model. A short tour shows you the basics.
3. **To dictate:** place your cursor where you want to type, press the **dictation shortcut**, speak and release.
4. **For your PC's audio:** press the **system-audio shortcut** and VoCript transcribes whatever is playing.

The text appears where your cursor was. Switch modes and shortcuts from the **header** or in **Settings → General**.

## 🔒 Privacy

VoCript runs **100% locally**. No accounts, no cloud, no telemetry: your voice
and transcriptions **never leave your computer**. Optional cloud AI
post-processing is off by default.

> 🛡️ **Security-reviewed.** VoCript has passed a security review with _no
> critical vulnerabilities_: 100% local recognition, no command injection,
> signed updates (minisign) and a restricted webview (CSP). Read the
> [full security model](SECURITY.md).

---

## 🔍 Don't trust it, check it

Open source only helps if somebody actually reads the code, and almost nobody does. So
instead of asking you to trust this project, here is the prompt to check it: point your own
AI agent at this repository and get a security report, in your language, in a few minutes,
even if you do not know how to program.

**[Open AI-AUDIT.md](AI-AUDIT.md)** and paste it into Claude Code, Codex, Cursor, Copilot or
whatever you use. It is the same prompt in every public repository here, so you can compare.

> **ES:** No hace falta que te fíes. Abre [AI-AUDIT.md](AI-AUDIT.md), pega ese texto en tu IA
> y te dirá en tu idioma qué hace este programa de verdad: qué envía por internet, qué toca
> en tu ordenador y qué ejecuta al instalarse.

## 🛠️ For developers

VoCript is built with **Tauri 2** (Rust + React/TypeScript) and **Whisper.cpp**
with GPU acceleration (Vulkan). Source code lives in [`vocript-src/`](vocript-src/).

```bash
cd vocript-src
bun install
bun run tauri dev      # development (hot-reload)
bun run tauri build    # production installer
```

## 📄 License & credits

VoCript is free software under the [MIT](LICENSE) license.

That licence covers the code, not the name: **VoCript**, its logo and its visual
identity are trademarks of Munir Torres. Forks are welcome under a name of their
own.

Copyright (c) 2025-2026 Munir Torres, for everything VoCript adds.
Copyright (c) 2025 [CJ Pais](https://github.com/cjpais), for
[Handy](https://github.com/cjpais/Handy), the project this one was forked from
and which is MIT too. Thanks for the great foundation.

The transcription engine is
[Whisper.cpp](https://github.com/ggerganov/whisper.cpp) by Georgi Gerganov.

Found a security issue? See the [security policy](SECURITY.md).

---

<div align="center">

Made by **[Munito (Munir Torres)](https://munito.dev)**

</div>
