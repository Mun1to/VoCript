#!/usr/bin/env bash
#
# Prueba de humo de los paquetes de Linux DENTRO de un contenedor limpio.
#
# Responde a una pregunta que hasta ahora se contestaba de oído: ¿en qué
# distribuciones arranca de verdad VoCript? El README promete «glibc 2.39 o
# superior (Ubuntu 24.04+, Debian 13, Fedora 39+, Arch)» y nadie lo había
# comprobado en ninguna de ellas.
#
# No hace falta pantalla. El binario resuelve sus bibliotecas al cargarse, así
# que si falta webkit, gtk o la glibc es demasiado antigua, ni siquiera llega a
# imprimir la ayuda de la línea de comandos. Un `--help` que responde es prueba
# de que el enlazado entero está resuelto en esa distribución.
#
# Uso (desde el contenedor, con /dist montado con los artefactos dentro):
#   probar.sh debian|fedora|arch
#
set -uo pipefail

familia="${1:?Falta la familia: debian, fedora o arch}"
dist_dir="${DIST_DIR:-/dist}"
fallos=0

titulo() { printf '\n\033[1m== %s ==\033[0m\n' "$1"; }
ok()     { printf '  \033[32mOK\033[0m   %s\n' "$1"; }
falla()  { printf '  \033[31mFALLA\033[0m %s\n' "$1"; fallos=$((fallos + 1)); }
nota()   { printf '       %s\n' "$1"; }

titulo "Sistema"
# La versión de glibc es la razón por la que el job de release se construye en
# ubuntu-24.04 y no en 22.04: los motores de reconocimiento vienen compilados
# y exigen una glibc reciente.
if command -v ldd >/dev/null 2>&1; then
  nota "glibc: $(ldd --version | head -n1)"
fi
nota "distribución: $(. /etc/os-release 2>/dev/null && echo "$PRETTY_NAME")"

titulo "Instalando lo que tendría un escritorio normal"
case "$familia" in
  debian)
    export DEBIAN_FRONTEND=noninteractive
    apt-get update -qq
    # Sin los paquetes uno a uno: se instala el propio .deb y que apt resuelva
    # las dependencias que VoCript declara. Así esto también comprueba que esas
    # dependencias están bien declaradas y existen en la distribución.
    apt-get install -y -qq --no-install-recommends ca-certificates file >/dev/null
    ;;
  fedora)
    dnf install -y -q webkit2gtk4.1 gtk3 libappindicator-gtk3 alsa-lib \
      librsvg2 file >/dev/null
    ;;
  arch)
    pacman -Sy --noconfirm --quiet webkit2gtk-4.1 gtk3 libayatana-appindicator \
      alsa-lib librsvg file >/dev/null
    ;;
  *)
    echo "Familia desconocida: $familia" >&2
    exit 2
    ;;
esac

# ---------------------------------------------------------------------------
# 1. El paquete .deb, solo donde tiene sentido
# ---------------------------------------------------------------------------
if [ "$familia" = "debian" ]; then
  deb=$(find "$dist_dir" -name '*.deb' | head -n1)
  if [ -z "$deb" ]; then
    falla ".deb: no hay ninguno en $dist_dir"
  else
    titulo "Paquete .deb ($(basename "$deb"))"
    if apt-get install -y -qq "$deb" >/tmp/apt.log 2>&1; then
      ok "se instala y apt resuelve sus dependencias"
      if timeout 60 vocript --help >/tmp/help.log 2>&1; then
        ok "el binario instalado arranca (--help responde)"
      else
        falla "el binario instalado NO arranca"
        nota "$(tail -n 3 /tmp/help.log)"
      fi
    else
      falla "apt no puede instalarlo en esta distribución"
      nota "$(grep -iE 'depend|no instalable|not installable|E:' /tmp/apt.log | head -n 4)"
    fi
  fi
fi

# ---------------------------------------------------------------------------
# 2. El AppImage, en todas
# ---------------------------------------------------------------------------
appimage=$(find "$dist_dir" -name '*.AppImage' | head -n1)
if [ -z "$appimage" ]; then
  falla "AppImage: no hay ninguno en $dist_dir"
else
  titulo "AppImage ($(basename "$appimage"))"
  # Se copia fuera del volumen montado: la extracción escribe al lado del
  # archivo y el volumen va en solo lectura.
  cp "$appimage" /tmp/app.AppImage
  chmod +x /tmp/app.AppImage
  cd /tmp || exit 1
  # --appimage-extract no necesita FUSE, que en un contenedor sin privilegios
  # no está disponible. Es la forma correcta de probar esto en Docker.
  if ./app.AppImage --appimage-extract >/dev/null 2>&1; then
    ok "el AppImage se abre y extrae"
    binario=$(find /tmp/squashfs-root -type f -name 'vocript' -perm -u+x | head -n1)
    if [ -z "$binario" ]; then
      falla "no encuentro el ejecutable dentro del AppImage"
    else
      faltan=$(ldd "$binario" 2>/dev/null | grep 'not found' | awk '{print $1}')
      if [ -n "$faltan" ]; then
        falla "faltan bibliotecas del sistema"
        echo "$faltan" | sed 's/^/       /'
      else
        ok "todas las bibliotecas que necesita están presentes"
      fi
      if timeout 60 "$binario" --help >/tmp/help2.log 2>&1; then
        ok "el binario del AppImage arranca (--help responde)"
      else
        falla "el binario del AppImage NO arranca"
        nota "$(tail -n 3 /tmp/help2.log)"
      fi
    fi
  else
    falla "el AppImage no se puede extraer"
  fi
fi

titulo "Resultado"
if [ "$fallos" -eq 0 ]; then
  ok "VoCript funciona en esta distribución"
  exit 0
fi
falla "$fallos comprobación(es) han fallado"
exit 1
