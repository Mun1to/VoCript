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

## Distribuciones de la matriz

| Distribución | glibc | Se espera |
| --- | --- | --- |
| Ubuntu 22.04 LTS | 2.35 | Falla: por debajo del mínimo |
| Ubuntu 24.04 LTS | 2.39 | Funciona |
| Debian 12 Bookworm | 2.36 | Falla: por debajo del mínimo |
| Debian 13 Trixie | 2.41 | Funciona |
| Fedora 41 | 2.40 | Funciona |
| Arch Linux | reciente | Funciona |

El mínimo viene de los motores de reconocimiento, que se distribuyen ya
compilados y exigen glibc 2.38 o superior. Es la misma razón por la que el job
de release se construye en `ubuntu-24.04` y no en `22.04`.

Si alguna fila no coincide con la realidad, la que se corrige es la tabla del
README principal, no la prueba.
