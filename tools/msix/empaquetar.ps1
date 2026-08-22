# Monta el paquete .msix de la Microsoft Store a partir de un build de release.
#
# Existe porque este paquete se armaba a mano y la v3.7.4 se publicó rota por
# saltarse un paso: se copió el .exe y no las DLL que van a su lado, así que
# Microsoft la probó en un equipo real y respondió "Missing transcribe.dll".
# Cada paso de aquí es una de las cosas que hay que acordarse de hacer, y el
# script se niega a empaquetar si alguna falta.
#
#   .\tools\msix\empaquetar.ps1
#   .\tools\msix\empaquetar.ps1 -SinProbar    # salta el arranque de prueba
#
# Deja el paquete en vocript-src\src-tauri\windows\VoCript.msix

[CmdletBinding()]
param(
    # Carpeta del build de release. Por defecto la que usa este equipo, que no
    # es target\release: CARGO_TARGET_DIR está redirigido a C:\ct para esquivar
    # el límite de 260 caracteres de las rutas de Windows.
    [string]$Release = "C:\ct\release",
    [switch]$SinProbar
)

$ErrorActionPreference = "Stop"

$raiz = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$msix = Join-Path $raiz "vocript-src\src-tauri\windows\msix"
$salida = Join-Path $raiz "vocript-src\src-tauri\windows\VoCript.msix"
$manifiesto = Join-Path $msix "AppxManifest.xml"
$conf = Join-Path $raiz "vocript-src\src-tauri\tauri.conf.json"

function Paso($n, $texto) { Write-Host "[$n] $texto" -ForegroundColor Cyan }
function Mal($texto) { Write-Host "  $texto" -ForegroundColor Red }
function Bien($texto) { Write-Host "  $texto" -ForegroundColor Green }

# --- 1. Las versiones tienen que coincidir -------------------------------
# Partner Center rechaza el paquete de plano si la versión del manifiesto no
# sube respecto a la publicada, y es lo más fácil de olvidar.
Paso 1 "Comprobando versiones"
$versionApp = (Get-Content $conf -Raw | ConvertFrom-Json).version
$versionMsix = ([xml](Get-Content $manifiesto -Raw)).Package.Identity.Version
# El cuarto numero es la revision DEL PAQUETE: sube cuando hay que reenviar a
# la Store sin que el codigo cambie, y por eso no tiene que ser cero.
if ($versionMsix -notmatch "^$([regex]::Escape($versionApp))\.\d+$") {
    Mal "AppxManifest.xml dice $versionMsix y la app es $versionApp (esperaba $versionApp.N)."
    Mal "Corrige Version= en $manifiesto antes de empaquetar."
    exit 1
}
Bien "app $versionApp, paquete $versionMsix"

# --- 2. El build tiene que existir y ser el de ahora ---------------------
Paso 2 "Comprobando el build de release"
$exeOrigen = Join-Path $Release "vocript.exe"
if (-not (Test-Path $exeOrigen)) {
    Mal "No encuentro $exeOrigen. Lanza antes: bun run tauri build"
    exit 1
}
$edad = (New-TimeSpan -Start (Get-Item $exeOrigen).LastWriteTime).TotalHours
Bien ("vocript.exe de hace {0:N1} h" -f $edad)
if ($edad -gt 6) {
    Write-Host "  AVISO: ese build tiene más de 6 horas, comprueba que es el de esta versión." -ForegroundColor Yellow
}

$versionExe = (Get-Item $exeOrigen).VersionInfo.FileVersion
if ($versionExe -ne $versionApp) {
    Mal "Ese vocript.exe dice ser la $versionExe y estamos empaquetando la $versionApp."
    exit 1
}
Bien "el exe se declara $versionExe"

# --- 2b. Y tiene que llevar el frontend DENTRO ---------------------------
# Esto es lo que tumbó el cuarto envío (rechazo 10.1.2.10 del 2026-08-21): la
# app abría una ventana con "localhost refused to connect" y nada más.
#
# Tauri decide en tiempo de COMPILACION de dónde carga la interfaz, y no lo
# decide por el perfil sino por una feature: en build.rs de tauri 2.10.2,
# `let dev = !has_feature("custom-protocol")`. `bun run tauri build` la activa
# y empotra la carpeta dist dentro del binario; `cargo build --release` NO, y
# produce un exe de release, con su número de versión correcto, que en vez de
# la interfaz abre el servidor de desarrollo que no existe en la máquina de
# nadie. Los dos exes se parecen en todo salvo en medio mega de assets.
#
# C:\ct\release lo comparten varios proyectos y cualquier comprobación en
# release reescribe ese exe, así que no basta con haber lanzado el build
# correcto: hay que mirar el archivo que se va a copiar.
Paso "2b" "Comprobando que el exe lleva la interfaz dentro"
$texto = [System.Text.Encoding]::ASCII.GetString([System.IO.File]::ReadAllBytes($exeOrigen))
$incrustados = ([regex]::Matches($texto, '/assets/[A-Za-z0-9_-]+\.(js|css)') |
    ForEach-Object { $_.Value } | Sort-Object -Unique).Count
$texto = $null
$enDisco = (Get-ChildItem (Join-Path $raiz "vocript-src\dist\assets") -Include *.js, *.css -Recurse).Count
if ($incrustados -eq 0) {
    Mal "Ese exe NO lleva la interfaz dentro: es un binario de desarrollo."
    Mal "Al abrirlo saldrá 'localhost refused to connect', que es justo por lo que"
    Mal "Microsoft rechazó el envío del 2026-08-21."
    Mal "Recompila con 'bun run tauri build' (no con 'cargo build --release')."
    exit 1
}
if ($incrustados -lt $enDisco) {
    Mal "El exe lleva $incrustados assets y en dist hay ${enDisco}: ese build es de otra versión del frontend."
    exit 1
}
Bien "$incrustados assets empotrados en el binario"

# --- 3. Copiar lo que de verdad se distribuye ----------------------------
# El instalador real incluye, además del exe, todo lo declarado en
# tauri.windows.conf.json -> bundle.resources. Copiar solo el exe es
# exactamente lo que rompió la v3.7.4.
Paso 3 "Copiando el ejecutable, sus DLL y los recursos"
Copy-Item $exeOrigen $msix -Force

# Las DLL se cogen de transcribe-libs, no de la carpeta de release: esa la
# comparten otros proyectos de Rust de este equipo (CARGO_TARGET_DIR común) y
# en el primer msix de la 3.7.5 se coló una DirectML.dll de otro proyecto.
$libs = Join-Path $raiz "vocript-src\src-tauri\transcribe-libs"
if (-not (Test-Path $libs)) {
    Mal "No encuentro $libs, que es la fuente correcta de las DLL."
    exit 1
}
$dlls = Get-ChildItem $libs -Filter *.dll
if ($dlls.Count -lt 20) {
    Mal "Solo hay $($dlls.Count) DLL en transcribe-libs y deberían ser 23 (13 de transcribe + 10 del runtime de C++)."
    exit 1
}
$dlls | Copy-Item -Destination $msix -Force
Bien "$($dlls.Count) DLL copiadas"

$recursosOrigen = Join-Path $Release "resources"
if (-not (Test-Path $recursosOrigen)) {
    Mal "No encuentro $recursosOrigen. Sin esa carpeta la app entra en panic al cargar el icono de bandeja."
    exit 1
}
Remove-Item (Join-Path $msix "resources") -Recurse -Force -ErrorAction SilentlyContinue
Copy-Item $recursosOrigen $msix -Recurse -Force
Bien "carpeta resources copiada"

# --- 4. Que arranque desde ahí -------------------------------------------
# Es el mismo mecanismo de resolución de DLL y recursos que usará el paquete
# instalado, así que un fallo aquí es un rechazo de Microsoft que se ahorra.
if (-not $SinProbar) {
    Paso 4 "Arrancando la app desde la carpeta del paquete"
    $anterior = Get-Process -Name vocript -ErrorAction SilentlyContinue
    if ($anterior) {
        Mal "Hay un VoCript abierto; ciérralo antes (la app es de instancia única y la prueba no valdría)."
        exit 1
    }
    $proc = Start-Process (Join-Path $msix "vocript.exe") -PassThru
    Start-Sleep -Seconds 20
    if ($proc.HasExited) {
        Mal "La app se cerró sola con código $($proc.ExitCode). Falta algo en la carpeta."
        exit 1
    }
    Bien "sigue viva a los 20 s"
    Stop-Process -Id $proc.Id -Force
    Start-Sleep -Seconds 2
} else {
    Write-Host "[4] Arranque de prueba SALTADO (-SinProbar)" -ForegroundColor Yellow
}

# --- 5. Empaquetar --------------------------------------------------------
Paso 5 "Empaquetando"
$makeappx = Get-ChildItem "C:\Program Files (x86)\Windows Kits\10\bin" -Filter makeappx.exe -Recurse -ErrorAction SilentlyContinue |
    Where-Object { $_.FullName -like "*\x64\*" } |
    Sort-Object FullName -Descending | Select-Object -First 1
if (-not $makeappx) {
    Mal "No encuentro makeappx.exe. Hace falta el Windows SDK."
    exit 1
}
& $makeappx.FullName pack /d $msix /p $salida /o
if ($LASTEXITCODE -ne 0) {
    Mal "makeappx falló con código $LASTEXITCODE"
    exit 1
}

$mb = [math]::Round((Get-Item $salida).Length / 1MB, 1)
Bien "$salida ($mb MB)"
if ($mb -lt 40) {
    Mal "Ese tamaño es sospechoso: los paquetes buenos rondan los 47 MB, y 18 MB es la señal de que faltan las DLL."
    exit 1
}

Write-Host ""
Write-Host "Paquete $versionMsix listo. Súbelo en Partner Center." -ForegroundColor Green
