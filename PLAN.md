# VoCript — Plan de Desarrollo

> Transcriptor de audio a texto personalizado, basado en [Handy](https://github.com/cjpais/handy).
> Versión base de Handy: 0.8.3 | Modelo: Whisper Turbo

---

## Estado actual (2026-05-31)

| Fase | Estado |
|------|--------|
| 0 — Entorno | ✅ Completada |
| 1 — Identidad (renombrar a VoCript) | ✅ Completada |
| 2 — Visual (rosa → azul) | ✅ Completada (falta: iconos PNG de bandeja) |
| 3 — Audio VAD | ✅ Completada |
| 4 — Español por defecto | ✅ Completada |
| 5 — Extras | Backlog |

**Próximo paso:** `bun tauri build` para generar el instalador MSI de producción.

---

## Entorno de compilación (todo instalado)

Variables de entorno permanentes en el usuario:
- `LIBCLANG_PATH = C:\Program Files\LLVM\bin`
- `VULKAN_SDK = C:\VulkanSDK\1.4.350.0` (fijada por el instalador)
- `CARGO_TARGET_DIR = C:\ct` (evita rutas largas — CRÍTICO)
- `CMAKE_GENERATOR = Ninja`
- PATH incluye: `C:\Program Files\CMake\bin`, Ninja (en AppData\Local\Microsoft\WinGet\Packages\Ninja-build...)

Comando para compilar (desde `C:\proyectos\VoCript\vocript-src`):
```powershell
$env:PATH = "$env:USERPROFILE\.cargo\bin;$env:USERPROFILE\.bun\bin;C:\Program Files\LLVM\bin;C:\Program Files\CMake\bin;" + (Get-ChildItem "$env:LOCALAPPDATA\Microsoft\WinGet\Packages\Ninja-build*" | Select-Object -First 1).FullName + ";$env:PATH"
$env:LIBCLANG_PATH = "C:\Program Files\LLVM\bin"
$env:VULKAN_SDK = "C:\VulkanSDK\1.4.350.0"
$env:CMAKE_GENERATOR = "Ninja"
$env:CARGO_TARGET_DIR = "C:\ct"
bun tauri build
```

---

## Fase 0 — Entorno ✅

- Node.js v24.15.0 (ya estaba)
- Rust v1.96.0 (x86_64-pc-windows-msvc)
- Bun v1.3.14
- Visual Studio 2022 Build Tools (C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools)
- LLVM — C:\Program Files\LLVM\bin
- Vulkan SDK 1.4.350.0 — C:\VulkanSDK\1.4.350.0
- CMake — C:\Program Files\CMake\bin
- Ninja — via WinGet

---

## Fase 1 — Identidad ✅

Archivos modificados:
- `package.json` → name: "vocript-app"
- `index.html` → title: "VoCript"
- `src-tauri/tauri.conf.json` → productName: "VoCript", identifier: "com.vocript.app", sin signCommand, updater endpoints vacíos
- `src-tauri/Cargo.toml` → name: "vocript", default-run: "vocript", lib name: "vocript_app_lib"
- `src-tauri/src/main.rs`, `cli.rs`, `lib.rs`, `tray.rs`, `actions.rs`, `portable.rs`, `managers/history.rs` → todos los strings "Handy"/"handy" → "VoCript"/"vocript"
- `src-tauri/nsis/installer.nsi` → "VoCript Portable Mode"
- `src/components/icons/VoCriptTextLogo.tsx` → SVG de texto "VoCript" (reemplaza paths SVG del logo "handy")

**Pendiente:** reemplazar los PNGs de bandeja del sistema (`src-tauri/resources/handy.png`, etc.) con versiones azules de VoCript. Requiere editor gráfico.

---

## Fase 2 — Visual ✅

- `src/App.css`:
  - `--color-background-ui`: #da5893 → **#2563eb**
  - `--color-logo-primary`: #faa2ca → **#93c5fd** (light) / #f28cbb → **#60a5fa** (dark)
  - `--color-logo-stroke`: #382731 → **#1e3a5f** (light) / #fad1ed → **#bfdbfe** (dark)
- `src/overlay/RecordingOverlay.css`:
  - barras de audio: #ffe5ee → **#dbeafe**
  - hover botón cancelar: #faa2ca33 → **#93c5fd33**

---

## Fase 3 — VAD pre-buffer ✅

`src-tauri/src/managers/audio.rs` función `create_audio_recorder()`:
- threshold Silero: 0.3 → **0.2** (más sensible)
- onset_frames: 2 → **1** (activa en 30ms en vez de 60ms)
- prefill_frames: 15 → **20** (600ms de pre-buffer)

---

## Fase 4 — Español por defecto ✅

`src-tauri/src/settings.rs`:
- L460: `default_selected_language()` → **"es"**
- L782: `selected_language` initial value → **"es"**

---

## Fase 5 — Extras (backlog)

- Integración Claude API para limpiar texto transcrito
- Plantillas de prompts configurables
- Historial de transcripciones
- Modo dictado continuo

---

## Notas sobre actualizaciones

- El auto-updater de Handy está desactivado (endpoints vacíos en tauri.conf.json)
- Para coger mejoras de Handy upstream: revisar GitHub manualmente y aplicar solo los diffs que interesen
- NO hacer merge ciego — los archivos CSS, audio.rs y settings.rs tienen nuestras personalizaciones
