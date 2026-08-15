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

### Las distribuciones viejas también se prueban, y no para ver si funcionan

Cada fila de la matriz lleva `soportada: si` o `soportada: no`. En las de fuera
del soporte no se comprueba que VoCript arranque, sino que **falle bien**:

| Lo que pasa en una distribución vieja | Veredicto |
| --- | --- |
| apt rechaza el paquete por el mínimo de `libc6` | Correcto, el usuario sabe por qué |
| apt lo instala y luego el programa no abre | **Fallo**, se está engañando al usuario |
| El AppImage no arranca | Esperado, no puede declarar un mínimo |

Un rojo en Ubuntu 22.04 no significa "es vieja", significa que alguien va a
instalar algo que no le va a funcionar sin que nada se lo advierta.

## Cómo se lanza

**En GitHub Actions** (recomendado, no necesita nada instalado):

Pestaña *Actions* → *Compatibilidad de Linux* → *Run workflow*. Opcionalmente se
le pasa una etiqueta; si se deja vacío, prueba la última publicada.

```bash
gh workflow run linux-compat.yml                      # la última publicada
gh workflow run linux-compat.yml -f tag=v3.7.1        # una versión concreta
gh run watch
```

**Antes de publicar**, contra los paquetes de un build de CI. Así se comprueba
un cambio de empaquetado sin tener que sacar una release para verlo:

```bash
gh workflow run linux-ci.yml                          # construye deb + AppImage
gh run list --workflow=linux-ci.yml --limit 1         # copia el ID del run
gh workflow run linux-compat.yml -f run_id=<ID>
```

**En local con Docker**, con los paquetes ya descargados en una carpeta:

```bash
mkdir -p dist
gh release download --pattern "VoCript-x86_64.AppImage" --pattern "*_amd64.deb" --dir dist

docker run --rm \
  -v "$PWD/dist:/dist:ro" \
  -v "$PWD/tools/linux-compat:/tools:ro" \
  ubuntu:24.04 \
  bash /tools/probar.sh debian si
```

El primer argumento es la familia (`debian`, `fedora` o `arch`) y decide con qué
gestor se instalan las dependencias de escritorio. El segundo dice si la
distribución está dentro del soporte (`si` o `no`), y cambia qué se considera un
fallo, según la tabla de arriba.

## Resultado medido (2026-08-15)

El mínimo lo dice ahora la propia prueba, leyendo la tabla de símbolos en vez de
deducirlo de en qué distribución peta:

```
glibc que exige el ejecutable: 2.39
glibc que exigen sus bibliotecas: 2.38
mínimo real de esta compilación: 2.39
```

Así que **glibc 2.39**, y por eso el job de release se construye en
`ubuntu-24.04` y no en `22.04`.

| Distribución | glibc | `.deb` | AppImage |
| --- | --- | --- | --- |
| Ubuntu 22.04 LTS | 2.35 | apt lo rechaza citando `libc6 (>= 2.39)` | No arranca (esperado) |
| Ubuntu 24.04 LTS | 2.39 | Funciona | Funciona |
| Debian 12 Bookworm | 2.36 | apt lo rechaza citando `libc6 (>= 2.39)` | No arranca (esperado) |
| Debian 13 Trixie | 2.41 | Funciona | Funciona |
| Fedora 41 | 2.40 | (no aplica) | Funciona |
| Arch Linux | 2.44 | (no aplica) | Funciona |

### Lo que encontró la primera ejecución, ya corregido

1. El README prometía **Fedora 39+**, y Fedora 39 lleva glibc 2.38, o sea que
   nunca iba a funcionar. Ahora dice Fedora 40+.
2. En Ubuntu 22.04 y Debian 12 **apt instalaba el `.deb` sin una sola queja** y
   luego el programa no arrancaba, sin que el usuario tuviera forma de saber por
   qué. El paquete declara ahora `libc6 (>= 2.39)` y apt lo rechaza con el
   motivo delante. Verificado contra un `.deb` construido de nuevo, sin publicar
   nada, con la opción `run_id`.

El AppImage no puede declarar un mínimo, así que ahí solo cabe documentarlo.

### Y lo que encontró la propia prueba sobre sí misma

- El mensaje del cargador enseña el **primer** símbolo que no resuelve, no el
  más alto que hace falta: el mismo binario decía "2.39" en un sitio y "2.38" en
  otro. De ahí que el mínimo se mida con `objdump` y no se lea de un error.
- Cuando apt empezó a rechazar el paquete, el contenedor se quedaba sin webkit
  ni alsa, y entonces el AppImage fallaba por `libasound.so.2` en vez de por la
  glibc: resultado correcto por el motivo equivocado. Las bibliotecas de
  escritorio se instalan ahora antes de tocar el paquete.
