<div align="center">

# 🎙️ VoCript

**Dicta y se escribe.** Convierte tu **voz** y el **audio de tu PC** en texto, al instante y 100 % offline.

🌍 Español · [English](README.md)

<p>
  <a href="https://vocript.app">
    <img src="https://img.shields.io/badge/web-vocript.app-3b82f6?style=for-the-badge" alt="vocript.app" />
  </a>
  <a href="https://github.com/Mun1to/VoCript/releases/latest">
    <img src="https://img.shields.io/github/v/release/Mun1to/VoCript?label=versi%C3%B3n&style=for-the-badge&color=3b82f6" alt="Última versión" />
  </a>
  <a href="LICENSE">
    <img src="https://img.shields.io/badge/licencia-MIT-3b82f6?style=for-the-badge" alt="Licencia MIT" />
  </a>
  <a href="SECURITY.md">
    <img src="https://img.shields.io/badge/100%25-local%20y%20privado-22c55e?style=for-the-badge" alt="100% local y privado" />
  </a>
</p>

<p align="center">
  <a href="https://github.com/Mun1to/VoCript/releases/latest/download/VoCript-Setup.exe">
    <img src="brand/download-button.svg" alt="Descargar VoCript para Windows" width="260" height="59" />
  </a>
  <a href="https://github.com/Mun1to/VoCript/releases/latest/download/VoCript-x86_64.AppImage">
    <img src="brand/download-button-linux.svg" alt="Descargar VoCript para Linux" width="260" height="59" />
  </a>
  <a href="https://github.com/Mun1to/VoCript/releases/latest/download/VoCript-arm64.dmg">
    <img src="brand/download-button-mac.svg" alt="Descargar VoCript para macOS" width="260" height="59" />
  </a>
</p>

<p align="center">
  <a href="https://apps.microsoft.com/detail/9P247C96LC72">
    <img src="https://get.microsoft.com/images/es%20dark.svg" alt="Consigue VoCript en la Microsoft Store" height="52" />
  </a>
</p>

</div>

https://github.com/user-attachments/assets/b98eb03e-de11-45ea-8825-645253d8ad12

## ✨ Qué hace

VoCript escucha tu **voz** (o el **audio que suena en tu PC**) y lo convierte en texto **justo donde tienes el cursor**, en cualquier aplicación. Todo el reconocimiento ocurre **en tu equipo**: ni cuentas, ni nube, ni esperas.

- 🎤 **Dictado por voz**: pulsa un atajo, habla, y el texto se escribe solo en la app que estés usando.
- 🔊 **Audio del sistema**: transcribe lo que suena en el PC (un vídeo, una llamada, una reunión) o una app concreta, y opcionalmente añade de dónde viene.
- ⚡ **Transcripción en vivo**: el texto aparece palabra a palabra en una cápsula flotante mientras hablas o reproduces audio.
- 📁 **Archivos a texto o subtítulos**: arrastra un audio o vídeo y obtén texto plano o subtítulos `.srt`.
- 🎯 **Precisión a tu medida**: un **diccionario personal** de reemplazos exactos y **palabras personalizadas** que corrigen nombres o jerga por su sonido (con importar/exportar CSV).
- 💼 **Perfiles profesionales**: *Normal*, *Programación* (dicta símbolos: «arroba» → `@`, «punto y coma» → `;`) o *Personalizado* con tus propios comandos.
- 🌍 **Multi-idioma**: interfaz en 20 idiomas y transcripción en decenas, con **cambio rápido de idioma** (app y modelo a la vez). Optimizado para español (acentos y puntuación).
- 🕑 **Historial**: guarda tus transcripciones y vuelve a escuchar el audio original cuando quieras.
- 🎨 **A tu gusto**: tema claro, oscuro o **automático según tu sistema**. La primera vez detecta el **idioma y el tema de tu equipo** y te enseña lo básico con un breve tour.
- 🔒 **100 % local**: sin telemetría, con actualizaciones automáticas y firmadas.

---

## ⬇️ Descargar

### Windows

**Desde la Microsoft Store**, que es lo más fácil y de lo único que Windows no
avisa: **[consigue VoCript](https://apps.microsoft.com/detail/9P247C96LC72)**. Se instala de un clic y la Store se encarga de
mantenerlo al día.

**O coge el instalador directamente de aquí:**

1. Pulsa el botón **Descargar** de arriba, o este enlace directo: **[descargar VoCript](https://github.com/Mun1to/VoCript/releases/latest/download/VoCript-Setup.exe)**. Se baja el instalador al instante.
2. Abre el archivo descargado (`VoCript-Setup.exe`).
3. Sigue los pasos. ¡Listo!

> Con este Windows puede mostrar un aviso de "editor desconocido" (la app aún no
> está firmada con un certificado de pago). Pulsa **Más información → Ejecutar de
> todas formas**, o coge la versión de la Store, que no lo muestra nunca.

### Linux

Descarga **[VoCript-x86_64.AppImage](https://github.com/Mun1to/VoCript/releases/latest/download/VoCript-x86_64.AppImage)**, dale permisos de ejecución y ábrelo. No hay que instalar nada:

```bash
chmod +x VoCript-x86_64.AppImage
./VoCript-x86_64.AppImage
```

También hay paquetes nativos: un `.deb` para Debian y Ubuntu en la
[página de Releases](https://github.com/Mun1to/VoCript/releases/latest)
(`sudo apt install ./VoCript_*.deb`), y un
**[.rpm](https://github.com/Mun1to/VoCript/releases/latest/download/VoCript-x86_64.rpm)**
para Fedora (`sudo dnf install ./VoCript-x86_64.rpm`).

En Fedora, elige el `.rpm`: usa el WebKit que ya tiene tu sistema en vez de
traer el suyo, que es donde el AppImage se complica ahí.

> **Necesita una distribución razonablemente actual**: glibc 2.39 o superior
> (Ubuntu 24.04+, Debian 13, Fedora 40+, Arch). Los motores de reconocimiento
> vienen como binarios precompilados que lo exigen. **Ubuntu 22.04 y Debian 12
> se quedan fuera**: ahí VoCript no arranca. Comprobado en un contenedor limpio
> por cada una de estas distribuciones, ver [tools/linux-compat](tools/linux-compat).

> Dos cosas funcionan distinto en Linux: la **captura del audio del sistema es
> solo de Windows** por ahora (dictar con el micrófono funciona igual), y en
> **Wayland** los atajos globales y el pegado automático están limitados; con
> X11 va todo más fino.

### macOS

Pega esto en el Terminal:

```bash
curl -fsSL https://raw.githubusercontent.com/Mun1to/VoCript/main/tools/install-macos.sh | sh
```

Descarga la última versión y deja VoCript en tu carpeta de Aplicaciones. Después
la abres como cualquier otra app, sin ningún aviso de seguridad.

> **Solo Apple Silicon** (M1 en adelante). Los Mac con Intel no están soportados.

<details>
<summary>¿Por qué un comando y no el .dmg de siempre?</summary>

El [.dmg](https://github.com/Mun1to/VoCript/releases/latest/download/VoCript-arm64.dmg)
sigue ahí y funciona. Lo que también hace es llevarte de cabeza al aviso de
**«Apple no ha podido verificar que esta app no contiene software malicioso»**,
porque VoCript no está notarizada: eso exige una cuenta de desarrollador de
Apple de pago, y no hay versión gratuita.

Tu navegador marca todo lo que descarga con `com.apple.quarantine`, y esa marca
es la que hace que macOS consulte con Apple antes de abrir una app. `curl` no la
pone, y Apple ha dicho que nunca lo hará, así que una copia instalada así no
pasa por ese control. La app sigue estando firmada, que es lo que Apple Silicon
exige de cualquier binario; simplemente no por una cuenta que haya pagado.

Esto no debilita nada de tu Mac: no cambia ningún ajuste, solo instala una app
sin la marca de descarga del navegador. Son unas cuarenta líneas y merece la
pena leerlas antes de meter nada en un intérprete de comandos, este incluido.

Si prefieres el .dmg, pulsa **Abrir de todos modos** en **Ajustes del Sistema →
Privacidad y Seguridad**, o ejecuta:

```bash
xattr -dr com.apple.quarantine /Applications/VoCript.app
```

</details>

> Dos cosas funcionan distinto en macOS: la **captura del audio del sistema es
> solo de Windows** por ahora (dictar con el micrófono funciona igual), y macOS
> te pedirá permiso de **Accesibilidad**; sin él la app no puede escribir en
> otros programas.

<details>
<summary>¿El dictado no escribe nada después de una actualización? Se arregla en 30 segundos</summary>

macOS decide si una app conserva un permiso mirando la huella exacta del archivo
de la app. VoCript está firmado, pero no con un certificado de pago de Apple
Developer, así que esa huella es lo único que macOS tiene, y cada actualización
la cambia. El resultado: después de actualizar, el interruptor de VoCript en
**Accesibilidad** sigue ahí y sigue **encendido**, pero macOS deja de hacerle
caso sin decir nada. El dictado graba, y luego no escribe.

Para arreglarlo:

1. Cierra VoCript del todo (**Cmd+Q**, y comprueba que no queda en la barra de menús).
2. Abre **Ajustes del Sistema > Privacidad y seguridad > Accesibilidad**.
3. Selecciona **VoCript** en la lista y pulsa el botón **-** de debajo para
   quitar la entrada.
4. Vuelve a abrir VoCript y concede el permiso cuando te lo pida.

Si sigue diciendo *Esperando*, ejecuta esto en el Terminal y abre VoCript otra vez:

```bash
tccutil reset Accessibility com.vocript.app
```

La única cura de verdad es un certificado Developer ID, la misma cuenta de 99
dólares al año que permitiría notarizar la app. Hasta que VoCript tenga usuarios
de Mac que lo justifiquen, este es el apaño, y es con el que vive cualquier app
de Mac firmada ad-hoc. Apple explica el motivo de fondo en
[TN3127](https://developer.apple.com/documentation/technotes/tn3127-inside-code-signing-requirements).

</details>

> ⚠️ **El soporte de macOS es joven.** Ya se ha instalado y usado en un Mac de
> verdad, pero en muchas menos máquinas que Windows, así que si algo se comporta
> raro, [abre una incidencia](https://github.com/Mun1to/VoCript/issues/new).

> 💡 ¿Prefieres ver todas las versiones y archivos? Están en la [página de Releases](https://github.com/Mun1to/VoCript/releases/latest).

## 🔄 Actualizaciones automáticas

VoCript se actualiza **solo**: al abrirlo comprueba si hay una versión nueva y,
si la hay, te la instala con un clic. No tienes que volver a descargar nada a
mano.

---

## ⌨️ Cómo se usa

1. Abre VoCript (se queda en la bandeja del sistema, junto al reloj).
2. La primera vez, elige y descarga un modelo de transcripción. Un tour te enseña lo básico.
3. **Para dictar:** coloca el cursor donde quieras escribir, pulsa el **atajo de dictado**, habla y suéltalo.
4. **Para el audio del PC:** pulsa el **atajo de audio del sistema** y VoCript transcribe lo que esté sonando.

El texto aparece donde tenías el cursor. Cambia modos y atajos desde el **header** o en **Ajustes → General**.

## 🔒 Privacidad

VoCript funciona **100 % en local**. No hay cuentas, ni nube, ni telemetría: tu
voz y tus transcripciones **no salen de tu ordenador**. El post-procesado con IA
en la nube es opcional y está desactivado por defecto.

> 🛡️ **Revisado en seguridad.** VoCript ha pasado una revisión de seguridad
> _sin vulnerabilidades críticas_: reconocimiento 100 % local, sin inyección de
> comandos, actualizaciones firmadas (minisign) y webview restringido (CSP).
> Lee el [modelo de seguridad completo](SECURITY.md).

---

## 🛠️ Para desarrolladores

VoCript está hecho con **Tauri 2** (Rust + React/TypeScript) y **Whisper.cpp**
con aceleración por GPU (Vulkan). El código fuente está en
[`vocript-src/`](vocript-src/).

```bash
cd vocript-src
bun install
bun run tauri dev      # desarrollo (hot-reload)
bun run tauri build    # instalador de producción
```

## 📄 Licencia y créditos

VoCript es software libre bajo licencia [MIT](LICENSE).

Esa licencia cubre el código, no el nombre: **VoCript**, su logo y su identidad
visual son marcas de Munir Torres. Los forks son bienvenidos con un nombre propio.

Copyright (c) 2025-2026 Munir Torres, por todo lo que añade VoCript.
Copyright (c) 2025 [CJ Pais](https://github.com/cjpais), por
[Handy](https://github.com/cjpais/Handy), el proyecto del que se hizo este fork
y que también es MIT. Gracias por el excelente trabajo base.

El motor de transcripción es
[Whisper.cpp](https://github.com/ggerganov/whisper.cpp), de Georgi Gerganov.

¿Encuentras un fallo de seguridad? Consulta la [política de seguridad](SECURITY.md).

---

<div align="center">

Hecho por **[Munito (Munir Torres)](https://munito.dev)**

</div>
