# Entorno de compilación — VoCript

Todo lo necesario para compilar VoCript en Windows. Este documento recoge el
conocimiento ganado a base de prueba y error (ver troubleshooting al final).

---

## Dependencias instaladas

| Herramienta | Versión | Ubicación / Notas |
|-------------|---------|-------------------|
| Node.js | v24.15.0 | Ya estaba en el sistema |
| Rust | v1.96.0 | Toolchain `x86_64-pc-windows-msvc` |
| Bun | v1.3.14 | `%USERPROFILE%\.bun\bin` — gestor de paquetes del proyecto |
| VS Build Tools 2022 | — | `C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools` (workload "Desktop development with C++") |
| LLVM | — | `C:\Program Files\LLVM\bin` — aporta `libclang.dll` (lo necesita `bindgen`) |
| Vulkan SDK | 1.4.350.0 | `C:\VulkanSDK\1.4.350.0` — backend GPU de whisper.cpp |
| CMake | (Kitware) | `C:\Program Files\CMake\bin` — compila whisper.cpp |
| Ninja | 1.13.2 | Vía WinGet — generador de CMake (evita bug de MSBuild en paralelo) |

> Para reinstalar cualquiera: `winget install <Id>`
> (`LLVM.LLVM`, `KhronosGroup.VulkanSDK`, `Kitware.CMake`, `Ninja-build.Ninja`)

---

## Variables de entorno (CRÍTICAS)

Guardadas permanentemente en el usuario. Si una sesión falla al compilar,
verificar que existen:

```
LIBCLANG_PATH    = C:\Program Files\LLVM\bin
VULKAN_SDK       = C:\VulkanSDK\1.4.350.0
CARGO_TARGET_DIR = C:\ct
CMAKE_GENERATOR  = Ninja
```

⚠️ **`CARGO_TARGET_DIR=C:\ct` es imprescindible.** whisper.cpp genera rutas de
compilación muy profundas; si el target está en la ruta normal
(`...\vocript-src\src-tauri\target`) se supera el límite de 260 caracteres de
Windows (MAX_PATH) y la compilación de C++ falla. Redirigir el target a `C:\ct`
acorta las rutas lo suficiente.

Verificar las variables:
```powershell
Get-ChildItem Env: | Where-Object Name -in 'LIBCLANG_PATH','VULKAN_SDK','CARGO_TARGET_DIR','CMAKE_GENERATOR'
```

---

## Preámbulo de PowerShell (cargar antes de compilar)

Las variables permanentes solo aplican a terminales **nuevas**. Para una sesión
en curso, o para asegurar el PATH completo, pegar esto antes de `bun tauri ...`:

```powershell
$ninja = (Get-ChildItem "$env:LOCALAPPDATA\Microsoft\WinGet\Packages\Ninja-build*" | Select-Object -First 1).FullName
$env:PATH = "$env:USERPROFILE\.cargo\bin;$env:USERPROFILE\.bun\bin;C:\Program Files\LLVM\bin;C:\Program Files\CMake\bin;$ninja;$env:PATH"
$env:LIBCLANG_PATH   = "C:\Program Files\LLVM\bin"
$env:VULKAN_SDK      = "C:\VulkanSDK\1.4.350.0"
$env:CMAKE_GENERATOR = "Ninja"
$env:CARGO_TARGET_DIR = "C:\ct"
```

---

## Comandos

Desde `C:\proyectos\VoCript\vocript-src`:

| Acción | Comando | Notas |
|--------|---------|-------|
| Instalar dependencias JS | `bun install` | Solo la primera vez o si cambia `package.json` |
| Desarrollo | `bun tauri dev` | Hot-reload del frontend; backend recompila al cambiar Rust |
| Verificar compilación | `cd src-tauri; cargo check` | Más rápido que un build completo |
| Build producción | `bun tauri build` | Genera MSI en `C:\ct\release\bundle\msi\` |

⏱️ La **primera** compilación tarda ~10-15 min (compila whisper.cpp en C++ desde
cero). Las siguientes son incrementales y rápidas.

---

## Troubleshooting (errores ya resueltos)

Estos errores aparecieron al montar el entorno. Si reaparecen, esta es la causa:

| Error | Causa | Solución |
|-------|-------|----------|
| `Unable to find libclang` | Falta LLVM | Instalar LLVM + `LIBCLANG_PATH` |
| `Please install Vulkan SDK` | Falta Vulkan | Instalar Vulkan SDK (define `VULKAN_SDK` solo) |
| `is cmake not installed?` | Falta CMake | Instalar CMake y añadir al PATH |
| `FTK1011 / FoCMakeFiles... Invalid argument` | Rutas > 260 chars (MAX_PATH) | `CARGO_TARGET_DIR=C:\ct` |
| `vulkan-shaders-gen ... no se pueden compilar en paralelo` | Bug de MSBuild como generador | `CMAKE_GENERATOR=Ninja` |

> Nota: estos son prerequisitos de **Handy** para compilar en Windows, no
> problemas introducidos por VoCript. La doc oficial de Handy solo menciona
> "Rust + Bun" y asume el resto del toolchain ya instalado.
