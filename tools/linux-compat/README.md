# Compatibilidad de Linux

Comprueba en qué distribuciones arranca de verdad el paquete de Linux, en vez de
deducirlo de la versión de glibc con la que se compiló.

Cada distribución se prueba en un contenedor limpio, así que lo que haya
instalado en la máquina que lanza la prueba no influye en el resultado.

## Qué comprueba

1. Que el `.deb` se instala y que **apt sabe resolver las dependencias que
   declara** (solo en las distribuciones basadas en Debian).
2. Que el AppImage se abre y se extrae.
3. Que no falta ninguna biblioteca del sistema (`ldd`).
4. Que el binario **arranca**: si responde a `--help`, todo el enlazado está
   resuelto en esa distribución.

No hace falta pantalla. El binario resuelve sus bibliotecas al cargarse, así que
si falta webkit, falta gtk o la glibc es demasiado antigua, ni siquiera llega a
imprimir la ayuda.

## Cómo se lanza

**En GitHub Actions** (recomendado, no necesita nada instalado):

Pestaña *Actions* → *Compatibilidad de Linux* → *Run workflow*. Opcionalmente se
le pasa una etiqueta; si se deja vacío, prueba la última publicada.

```bash
gh workflow run linux-compat.yml
gh run watch
```

**En local con Docker**, con los paquetes ya descargados en una carpeta:

```bash
mkdir -p dist
gh release download --pattern "VoCript-x86_64.AppImage" --pattern "*_amd64.deb" --dir dist

docker run --rm \
  -v "$PWD/dist:/dist:ro" \
  -v "$PWD/tools/linux-compat:/tools:ro" \
  ubuntu:24.04 \
  bash /tools/probar.sh debian
```

La familia es `debian`, `fedora` o `arch`, y decide con qué gestor se instalan
las dependencias de escritorio.

## Resultado medido (v3.7.1, 2026-08-15)

| Distribución | glibc | `.deb` | AppImage |
| --- | --- | --- | --- |
| Ubuntu 22.04 LTS | 2.35 | Se instala pero **no arranca** | **No arranca** |
| Ubuntu 24.04 LTS | 2.39 | Funciona | Funciona |
| Debian 12 Bookworm | 2.36 | Se instala pero **no arranca** | **No arranca** |
| Debian 13 Trixie | 2.41 | Funciona | Funciona |
| Fedora 41 | 2.40 | (no aplica) | Funciona |
| Arch Linux | 2.44 | (no aplica) | Funciona |

El mínimo real es **glibc 2.39**, que es lo que pide el ejecutable; las
bibliotecas que lleva dentro se conforman con 2.38. Por eso el job de release se
construye en `ubuntu-24.04` y no en `22.04`.

Dos cosas que salieron de la primera ejecución y ya están corregidas:

1. El README prometía **Fedora 39+**, y Fedora 39 lleva glibc 2.38, o sea que se
   quedaba fuera. Ahora dice Fedora 40+.
2. En Ubuntu 22.04 y Debian 12 **apt instalaba el `.deb` sin una sola queja** y
   luego el programa no arrancaba, sin que el usuario tuviera forma de saber por
   qué. El paquete declara ahora `libc6 (>= 2.39)`, así que apt lo rechaza con un
   motivo legible en vez de dejar algo roto instalado. Pendiente de comprobar en
   la próxima release, porque hace falta un `.deb` construido de nuevo.

El AppImage no tiene forma de declarar un mínimo, así que ahí solo cabe
documentarlo.
