# Contributing to VoCript

VoCript turns your voice into text in any app, on your own computer. It started as a fork of
[Handy](https://github.com/cjpais/Handy) by CJ Pais, and it keeps Handy's MIT license and credit.

## Reporting a bug

Open an [issue](https://github.com/Mun1to/VoCript/issues) and include:

- The app version, your operating system, and your CPU and GPU.
- What you did, what you expected, and what happened instead.
- A screenshot or the log if you have one. Debug mode opens with `Ctrl+Shift+D` (`Cmd+Shift+D` on Mac).

Please check that the bug is still there in the [latest version](https://github.com/Mun1to/VoCript/releases/latest).

For anything that affects security, follow [SECURITY.md](SECURITY.md) instead of opening a public issue.

## Proposing a change

For anything bigger than a small fix, open an issue first so we can talk about it before you spend time on it.

Keep each pull request to one change, and describe how you tested it.

## Building it

The app lives in `vocript-src`. You need [Rust](https://rustup.rs/), [Bun](https://bun.sh/) and the tools for your system,
which are listed in [BUILD.md](vocript-src/BUILD.md).

```bash
cd vocript-src
bun install
mkdir -p src-tauri/resources/models
curl -o src-tauri/resources/models/silero_vad_v4.onnx https://blob.handy.computer/silero_vad_v4.onnx
bun run tauri dev
```

Before sending a pull request:

```bash
bun run lint
bun run format:check
bun run check:translations
```

## Translating it

The app comes in 20 languages. [CONTRIBUTING_TRANSLATIONS.md](vocript-src/CONTRIBUTING_TRANSLATIONS.md) explains how to add or
improve one.

## License

By contributing, you agree that your work is released under the [MIT License](LICENSE).
