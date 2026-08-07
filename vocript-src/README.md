# VoCript

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

**A free, open source, privacy-first speech-to-text app that works completely offline.**

VoCript is a cross-platform desktop application for simple, privacy-focused speech transcription. Press a shortcut, speak, and your words appear in any text field — entirely on your own computer, with nothing sent to the cloud.

<video src="https://github.com/Mun1to/VoCript/releases/download/v3.5.4/vocript-demo.mp4" controls muted></video>

## Why VoCript?

- **100% local**: 16 transcription models (Whisper, Parakeet, Moonshine, Canary, SenseVoice, GigaAM, Cohere, Breeze ASR) run entirely on your device. Your voice never leaves your computer.
- **No account, no subscription**: download it and use it. Nothing to sign up for.
- **Open source**: the code is here — fork it, read it, change it.
- **More than dictation**: microphone, system audio, or audio/video files — one app for all three.

## Features

- Dictate into any app with a global keyboard shortcut
- Live mode: watch your words appear as you speak
- Transcribe system audio (meetings, videos, podcasts) directly
- Transcribe audio or video files to text or subtitles (`.srt`)
- 16 transcription models to pick the balance of speed, accuracy, and language you need
- Personal dictionary: teach it your own vocabulary and text replacements
- Work profiles: Normal, Coding (voice → symbols), or your own custom commands
- Dictate in your language, get English text (model-dependent)
- Local dictation activity tracking, counted only on your computer
- Custom accent colors and typography
- 20+ interface languages

## How It Works

1. **Press** a configurable keyboard shortcut to start/stop recording (or use push-to-talk mode)
2. **Speak** your words while the shortcut is active
3. **Release** and VoCript transcribes your speech locally
4. **Get** your transcribed text pasted directly into whatever app you were using

The process is entirely local — silence is filtered with Silero VAD, and transcription runs on your own hardware with the model you choose.

## Quick Start

### Installation

1. Download the latest release from the [releases page](https://github.com/Mun1to/VoCript/releases) or [vocript.munito.dev](https://vocript.munito.dev)
   - **Windows**: the `_x64-setup.exe` installer
   - **Linux**: `.deb` (Debian/Ubuntu) or `.AppImage` (any distro)
2. Install the application
3. Launch VoCript and grant necessary system permissions (microphone, accessibility)
4. Configure your preferred keyboard shortcut in Settings
5. Start transcribing!

### Development Setup

For detailed build instructions including platform-specific requirements, see [BUILD.md](BUILD.md).

## Architecture

VoCript is built as a Tauri application combining:

- **Frontend**: React + TypeScript with Tailwind CSS for the settings UI
- **Backend**: Rust for system integration, audio processing, and ML inference
- **Core Libraries**:
  - `whisper-rs`: Local speech recognition with Whisper models
  - `transcribe-rs`: CPU-optimized speech recognition with Parakeet, Moonshine, Canary, SenseVoice, GigaAM, and Cohere models
  - `cpal`: Cross-platform audio I/O
  - `vad-rs`: Voice Activity Detection
  - `rdev`: Global keyboard shortcuts and system events
  - `rubato`: Audio resampling

### Debug Mode

VoCript includes an advanced debug mode for development and troubleshooting. Access it by pressing `Ctrl+Shift+D`.

### CLI Parameters

VoCript supports command-line flags for controlling a running instance and customizing startup behavior.

**Remote control flags** (sent to an already-running instance via the single-instance plugin):

```bash
vocript --toggle-transcription    # Toggle recording on/off
vocript --toggle-post-process     # Toggle recording with post-processing on/off
vocript --cancel                  # Cancel the current operation
```

**Startup flags:**

```bash
vocript --start-hidden            # Start without showing the main window
vocript --no-tray                 # Start without the system tray icon
vocript --debug                   # Enable debug mode with verbose logging
vocript --help                    # Show all available flags
```

Flags can be combined for autostart scenarios:

```bash
vocript --start-hidden --no-tray
```

## Known Limitations

- **No macOS build yet** — VoCript currently ships for Windows and Linux only.
- **Wayland (Linux)**: requires [`wtype`](https://github.com/atx/wtype) or [`dotool`](https://sr.ht/~geb/dotool/) for reliable text input, and the recording overlay is disabled by default (see [Linux Notes](#linux-notes)).

## Linux Notes

**Text Input Tools:**

For reliable text input on Linux, install the appropriate tool for your display server:

| Display Server | Recommended Tool | Install Command                                    |
| --------------- | ----------------- | --------------------------------------------------- |
| X11             | `xdotool`          | `sudo apt install xdotool`                           |
| Wayland         | `wtype`            | `sudo apt install wtype`                             |
| Both            | `dotool`           | `sudo apt install dotool` (requires `input` group)  |

- **X11**: Install `xdotool` for both direct typing and clipboard paste shortcuts
- **Wayland**: Install `wtype` (preferred) or `dotool` for text input to work correctly
- **dotool setup**: Requires adding your user to the `input` group: `sudo usermod -aG input $USER` (then log out and back in)

Without these tools, VoCript falls back to enigo, which may have limited compatibility, especially on Wayland.

**Other Notes:**

- **Runtime library dependency (`libgtk-layer-shell.so.0`)**:
  - VoCript links `gtk-layer-shell` on Linux. If startup fails with `error while loading shared libraries: libgtk-layer-shell.so.0`, install the runtime package for your distro:

    | Distro        | Package to install    | Example command                         |
    | -------------- | ---------------------- | ---------------------------------------- |
    | Ubuntu/Debian | `libgtk-layer-shell0`  | `sudo apt install libgtk-layer-shell0`  |
    | Fedora/RHEL   | `gtk-layer-shell`      | `sudo dnf install gtk-layer-shell`      |
    | Arch Linux    | `gtk-layer-shell`      | `sudo pacman -S gtk-layer-shell`        |

  - For building from source on Ubuntu/Debian, you may also need `libgtk-layer-shell-dev`.

- The recording overlay is disabled by default on Linux (`Overlay Position: None`) because certain compositors treat it as the active window. When the overlay is visible it can steal focus, which prevents VoCript from pasting back into the application that triggered transcription. If you enable the overlay anyway, be aware that clipboard-based pasting might fail or end up in the wrong window.
- If you are having trouble with the app, running with the environment variable `WEBKIT_DISABLE_DMABUF_RENDERER=1` may help.
- If VoCript fails to start reliably on Linux, see [Troubleshooting → Linux Startup Crashes or Instability](#linux-startup-crashes-or-instability).
- **Global keyboard shortcuts (Wayland):** On Wayland, system-level shortcuts must be configured through your desktop environment or window manager. Use the [CLI flags](#cli-parameters) as the command for your custom shortcut.

  **GNOME:**
  1. Open **Settings > Keyboard > Keyboard Shortcuts > Custom Shortcuts**
  2. Click the **+** button to add a new shortcut
  3. Set the **Name** to `Toggle VoCript Transcription`
  4. Set the **Command** to `vocript --toggle-transcription`
  5. Click **Set Shortcut** and press your desired key combination (e.g., `Super+O`)

  **KDE Plasma:**
  1. Open **System Settings > Shortcuts > Custom Shortcuts**
  2. Click **Edit > New > Global Shortcut > Command/URL**
  3. Name it `Toggle VoCript Transcription`
  4. In the **Trigger** tab, set your desired key combination
  5. In the **Action** tab, set the command to `vocript --toggle-transcription`

  **Sway / i3:**

  Add to your config file (`~/.config/sway/config` or `~/.config/i3/config`):

  ```ini
  bindsym $mod+o exec vocript --toggle-transcription
  ```

  **Hyprland:**

  Add to your config file (`~/.config/hypr/hyprland.conf`):

  ```ini
  bind = $mainMod, O, exec, vocript --toggle-transcription
  ```

- You can also manage global shortcuts outside of VoCript via Unix signals, which lets Wayland window managers or other hotkey daemons keep ownership of keybindings:

  | Signal    | Action                                    | Example                   |
  | --------- | ------------------------------------------ | -------------------------- |
  | `SIGUSR2` | Toggle transcription                       | `pkill -USR2 -n vocript`  |
  | `SIGUSR1` | Toggle transcription with post-processing  | `pkill -USR1 -n vocript`  |

  Example Sway config:

  ```ini
  bindsym $mod+o exec pkill -USR2 -n vocript
  bindsym $mod+p exec pkill -USR1 -n vocript
  ```

  `pkill` here simply delivers the signal—it does not terminate the process.

**Overlay & Pasting Issues (Linux):**

- The recording overlay window can interfere with pasting transcribed text into target applications on Linux (X11)
- **Solution:** Open **Settings > Advanced** and set **"Overlay Position"** to **"None"** to disable the overlay
- Enable **"Audio Feedback"** (also in Advanced) if you still want audible confirmation of recording state

### Platform Support

- **x64 Windows**
- **x64 Linux**

macOS support is planned for a future release.

### System Requirements/Recommendations

The following are recommendations for running VoCript on your own machine. If you don't meet the system requirements, the performance of the application may be degraded.

**For Whisper models:**

- **Windows**: Intel, AMD, or NVIDIA GPU (Vulkan acceleration)
- **Linux**: Intel, AMD, or NVIDIA GPU
  - Ubuntu 24.04+ recommended

**For CPU-only models (Parakeet, Moonshine, Canary, SenseVoice, GigaAM, Cohere):**

- Runs on a wide variety of hardware without a GPU
- Automatic language detection on most models — no manual language selection required

## Verify Release Signatures

VoCript release artifacts are signed with Tauri's updater signature format. The public key is stored in [`src-tauri/tauri.conf.json`](src-tauri/tauri.conf.json) under `plugins.updater.pubkey`.

To verify a release manually, set `ARTIFACT` to the filename you downloaded, save the `pubkey` value from `src-tauri/tauri.conf.json` to `vocript.pub.b64`, then decode the public key and matching `.sig` file from base64 and verify the artifact with `minisign`:

```bash
# Replace with the file you downloaded
ARTIFACT="VoCript_3.5.4_x64-setup.exe"

python3 - "$ARTIFACT" <<'PY'
import base64, pathlib, sys

artifact = sys.argv[1]

pub = pathlib.Path("vocript.pub.b64").read_text().strip()
pathlib.Path("vocript.pub").write_bytes(base64.b64decode(pub))

sig = pathlib.Path(f"{artifact}.sig").read_text().strip()
pathlib.Path(f"{artifact}.minisig").write_bytes(base64.b64decode(sig))
PY

minisign -Vm "$ARTIFACT" \
  -p vocript.pub \
  -x "$ARTIFACT.minisig"
```

On success, `minisign` prints:

```text
Signature and comment signature verified
```

Do not use `gpg` for these `.sig` files.

## Troubleshooting

### Manual Model Installation (For Proxy Users or Network Restrictions)

If you're behind a proxy, firewall, or in a restricted network environment where VoCript cannot download models automatically, you can manually download and install them. The URLs are publicly accessible from any browser.

#### Step 1: Find Your App Data Directory

1. Open VoCript settings
2. Navigate to the **About** section to see the "App Data Directory" path, or use `Ctrl+Shift+D` to open the debug menu

The typical paths are:

- **Windows**: `C:\Users\{username}\AppData\Roaming\com.vocript.app\`
- **Linux**: `~/.config/com.vocript.app/`

#### Step 2: Create Models Directory

Inside your app data directory, create a `models` folder if it doesn't already exist:

```bash
# Linux
mkdir -p ~/.config/com.vocript.app/models

# Windows (PowerShell)
New-Item -ItemType Directory -Force -Path "$env:APPDATA\com.vocript.app\models"
```

#### Step 3: Download Model Files

All models are hosted at `https://pub-c3b1118bf35840479957bb0265d1bc3c.r2.dev/`.

**Single-file models (`.bin`):**

| Model          | Filename                        | Size    |
| -------------- | -------------------------------- | ------- |
| Whisper Small  | `ggml-small.bin`                | 465 MB  |
| Whisper Medium | `whisper-medium-q4_1.bin`       | 469 MB  |
| Whisper Turbo  | `ggml-large-v3-turbo.bin`       | 1549 MB |
| Whisper Large  | `ggml-large-v3-q5_0.bin`        | 1031 MB |
| Breeze ASR     | `breeze-asr-q5_k.bin`           | 1030 MB |

**Archive models (`.tar.gz`, extract into a directory):**

| Model                 | Archive                                 | Extracted directory name          | Size    |
| ---------------------- | ---------------------------------------- | ----------------------------------- | ------- |
| Parakeet V2            | `parakeet-v2-int8.tar.gz`               | `parakeet-tdt-0.6b-v2-int8`         | 451 MB  |
| Parakeet V3            | `parakeet-v3-int8.tar.gz`               | `parakeet-tdt-0.6b-v3-int8`         | 456 MB  |
| Moonshine Base         | `moonshine-base.tar.gz`                 | `moonshine-base`                    | 55 MB   |
| Moonshine V2 Tiny      | `moonshine-tiny-streaming-en.tar.gz`    | `moonshine-tiny-streaming-en`       | 31 MB   |
| Moonshine V2 Small     | `moonshine-small-streaming-en.tar.gz`   | `moonshine-small-streaming-en`      | 99 MB   |
| Moonshine V2 Medium    | `moonshine-medium-streaming-en.tar.gz`  | `moonshine-medium-streaming-en`     | 192 MB  |
| SenseVoice             | `sense-voice-int8.tar.gz`               | `sense-voice-int8`                  | 152 MB  |
| GigaAM v3              | `giga-am-v3-int8.tar.gz`                | `giga-am-v3-int8`                   | 151 MB  |
| Canary 180M Flash      | `canary-180m-flash.tar.gz`              | `canary-180m-flash`                 | 146 MB  |
| Canary 1B v2           | `canary-1b-v2.tar.gz`                   | `canary-1b-v2`                      | 691 MB  |
| Cohere                 | `cohere-int8.tar.gz`                    | `cohere-int8`                       | 1708 MB |

#### Step 4: Install Models

**For single-file (`.bin`) models:**

Place the file directly into the `models` directory:

```
{app_data_dir}/models/
├── ggml-small.bin
├── whisper-medium-q4_1.bin
└── ...
```

**For archive (`.tar.gz`) models:**

1. Extract the archive
2. Place the **extracted directory** into the `models` folder, named exactly as shown in the table above:

```
{app_data_dir}/models/
├── parakeet-tdt-0.6b-v3-int8/     (directory with model files inside)
│   ├── (model files)
│   └── (config files)
└── canary-180m-flash/
    ├── (model files)
    └── (config files)
```

**Important Notes:**

- The extracted directory name **must** match exactly as shown in the table
- Do not rename `.bin` files — use the exact filenames from the table
- After placing the files, restart VoCript to detect the new models

#### Step 5: Verify Installation

1. Restart VoCript
2. Open Settings → Models
3. Your manually installed models should now appear as "Downloaded"
4. Select the model you want to use and test transcription

### Custom Whisper Models

VoCript can auto-discover custom Whisper GGML models placed in the `models` directory. This is useful if you want to use fine-tuned or community models not included in the default list.

**How to use:**

1. Obtain a Whisper model in GGML `.bin` format (e.g., from [Hugging Face](https://huggingface.co/models?search=whisper%20ggml))
2. Place the `.bin` file in your `models` directory (see paths above)
3. Restart VoCript to discover the new model
4. The model will appear in the "Custom Models" section of the Models settings page

**Important:**

- Community models are user-provided and may not receive troubleshooting assistance
- The model must be a valid Whisper GGML format (`.bin` file)
- Model name is derived from the filename (e.g., `my-custom-model.bin` → "My Custom Model")

### Linux Startup Crashes or Instability

If VoCript fails to start reliably on Linux — for example, it crashes shortly after launch, never shows its window, or reports a Wayland protocol error — try the steps below in order.

**1. Install (or reinstall) `gtk-layer-shell`**

VoCript uses `gtk-layer-shell` for its recording overlay and links against it at runtime. A missing or broken installation is the most common cause of startup failures and can manifest as a crash or a hang well before any window is shown. Make sure the runtime package is installed for your distro:

| Distro        | Package to install    | Example command                         |
| -------------- | ---------------------- | ---------------------------------------- |
| Ubuntu/Debian | `libgtk-layer-shell0`  | `sudo apt install libgtk-layer-shell0`  |
| Fedora/RHEL   | `gtk-layer-shell`      | `sudo dnf install gtk-layer-shell`      |
| Arch Linux    | `gtk-layer-shell`      | `sudo pacman -S gtk-layer-shell`        |

If it is already installed and you still see startup problems, try reinstalling it in case the library files were corrupted by a partial upgrade.

**2. Disable the GTK layer shell overlay (`HANDY_NO_GTK_LAYER_SHELL`)**

If installing the library does not help, you can skip `gtk-layer-shell` initialization entirely as a workaround (the env var keeps its original name from the codebase this project is forked from). On some compositors (notably KDE Plasma under Wayland) it has been reported to interact poorly with the recording overlay. With this variable set, the overlay falls back to a regular always-on-top window:

```bash
HANDY_NO_GTK_LAYER_SHELL=1 vocript
```

**3. Disable WebKit DMA-BUF renderer (`WEBKIT_DISABLE_DMABUF_RENDERER`)**

On some GPU/driver combinations the WebKitGTK DMA-BUF renderer can cause the window to fail to render or to crash. Try:

```bash
WEBKIT_DISABLE_DMABUF_RENDERER=1 vocript
```

**Making a workaround permanent**

Once you've found a flag that helps, export it from your shell profile (`~/.bashrc`, `~/.zshenv`, …) or from the desktop autostart entry that launches VoCript. If you launch VoCript from a `.desktop` file, you can prefix the `Exec=` line, e.g.:

```ini
Exec=env HANDY_NO_GTK_LAYER_SHELL=1 vocript
```

If a workaround helps you, please [open an issue](https://github.com/Mun1to/VoCript/issues) describing your distro, desktop environment, and session type.

### How to Contribute

1. **Check existing issues** at [github.com/Mun1to/VoCript/issues](https://github.com/Mun1to/VoCript/issues)
2. **Fork the repository** and create a feature branch
3. **Test thoroughly** on your target platform
4. **Submit a pull request** with a clear description of your changes

## Credits

VoCript is a fork of [Handy](https://github.com/cjpais/Handy) by [cjpais](https://github.com/cjpais), rebranded and extended with self-hosted model infrastructure, additional transcription models, live mode, a personal dictionary, work profiles, activity tracking, custom themes and typography, and 20+ interface languages.

## License

MIT License - see [LICENSE](LICENSE) file for details.

## Acknowledgments

- **[Handy](https://github.com/cjpais/Handy)** by cjpais — the project VoCript is forked from
- **Whisper** by OpenAI for the speech recognition model
- **whisper.cpp and ggml** for cross-platform Whisper inference/acceleration
- **Silero** for lightweight VAD
- **Tauri** team for the excellent Rust-based app framework
- **Community contributors** helping make VoCript better
