<div align="center">

# 🎙️ VoCript

**Speak and it types.** Turn your **voice** and your **PC's audio** into text, instantly and 100% offline.

🌍 [Español](README.md) · English

<p>
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
    <img src="brand/download-button.svg" alt="Download VoCript" width="320" height="72" />
  </a>
</p>

</div>

---

## ✨ What it does

VoCript listens to your **voice** —or the **audio playing on your PC**— and turns it into text **right where your cursor is**, in any app. All recognition happens **on your device**: no accounts, no cloud, no waiting.

- 🎤 **Voice dictation** — press a shortcut, speak, and the text types itself into whatever app you're using.
- 🔊 **System audio** — transcribe what's playing on your PC (a video, a call, a meeting) or a specific app, and optionally tag where it came from.
- ⚡ **Live transcription** — watch the text appear word by word in a floating bubble as you speak or play audio.
- 📁 **Files to text or subtitles** — drop in an audio or video file and get plain text or `.srt` subtitles.
- 🎯 **Accuracy your way** — a **personal dictionary** of exact replacements plus **custom words** that fix names or jargon by how they sound (with CSV import/export).
- 💼 **Work profiles** — *Normal*, *Coding* (dictate symbols: "at sign" → `@`, "semicolon" → `;`) or *Custom* with your own commands.
- 🌍 **Multi-language** — interface in 20 languages and transcription in dozens, with a **quick language switch** (app and model at once). Tuned for Spanish accents and punctuation.
- 🕑 **History** — keeps your transcriptions and lets you replay the original audio anytime.
- 🎨 **Make it yours** — light or dark theme and a guided tour on first run.
- 🔒 **100% local** — no telemetry, with automatic, signed updates.

---

## 📸 Screenshots

<div align="center">
  <img src="brand/screenshots/01-general.png" alt="VoCript — main screen" width="820" />
</div>

<p align="center"><em>Main screen: the header's quick-control bar — voice/system, live, output (paste/copy), activation, profile and language. All recognition runs on your device.</em></p>

| Transcribe files | Transcription models | Advanced settings |
| :--: | :--: | :--: |
| <img src="brand/screenshots/03-transcribe.png" alt="Transcribe files to text or SRT" /> | <img src="brand/screenshots/02-models.png" alt="Transcription models" /> | <img src="brand/screenshots/04-advanced.png" alt="Advanced settings" /> |

---

## ⬇️ Download

1. Click the **Download** button above — or this direct link: **[download VoCript](https://github.com/Mun1to/VoCript/releases/latest/download/VoCript-Setup.exe)**. The installer downloads instantly.
2. Open the downloaded file (`VoCript-Setup.exe`).
3. Follow the steps. Done!

> 💡 Prefer to see all versions and files? They're on the [Releases page](https://github.com/Mun1to/VoCript/releases/latest).

> Windows may show an "unknown publisher" warning (the app isn't signed with a
> paid certificate yet). Click **More info → Run anyway**.

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

## 🛠️ For developers

VoCript is built with **Tauri 2** (Rust + React/TypeScript) and **Whisper.cpp**
with GPU acceleration (Vulkan). Source code lives in [`handy-src/`](handy-src/).

```bash
cd handy-src
bun install
bun run tauri dev      # development (hot-reload)
bun run tauri build    # production installer
```

## 📄 License & credits

VoCript is free software under the [MIT](LICENSE) license.

It is a **fork of [Handy](https://github.com/cjpais/Handy)** by
[CJ Pais](https://github.com/cjpais) (also MIT) — thanks for the great
foundation. The transcription engine is
[Whisper.cpp](https://github.com/ggerganov/whisper.cpp) by Georgi Gerganov.

Found a security issue? See the [security policy](SECURITY.md).

---

<div align="center">

🌸 Part of the **Orquio Foundation** · *Easy Tech*

<sub>Essential technology, orchestrated to be optimized, positive and transparent.</sub>

</div>
