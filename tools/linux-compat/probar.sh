#!/usr/bin/env bash
#
# Prueba de humo de los paquetes de Linux DENTRO de un contenedor limpio.
#
# Responde a una pregunta que hasta ahora se contestaba de oído: ¿en qué
# distribuciones arranca de verdad VoCript? El README prometía «Fedora 39+»
# cuando Fedora 39 lleva una glibc por debajo del mínimo, y nadie lo había
# comprobado en ninguna distribución.
#
# No hace falta pantalla. El binario resuelve sus bibliotecas al cargarse, así
# que si falta webkit, gtk o la glibc es demasiado antigua, ni siquiera llega a
# imprimir la ayuda de la línea de comandos. Un `--help` que responde es prueba
# de que el enlazado entero está resuelto en esa distribución.
#
# El segundo argumento dice si la distribución está DENTRO de lo soportado. Las
# de fuera no se prueban para ver si funcionan, sino para ver si **fallan
# bien**: lo que no puede pasar es que apt instale el paquete sin una queja y
# luego el programa no arranque, que fue justo lo que hacía hasta hoy.
#
# Uso (desde el contenedor, con /dist montado con los artefactos dentro):
#   probar.sh debian|fedora|arch  si|no
#
set -uo pipefail

familia="${1:?Falta la familia: debian, fedora o arch}"
soportada="${2:-si}"
dist_dir="${DIST_DIR:-/dist}"
fallos=0

titulo()   { printf '\n\033[1m== %s ==\033[0m\n' "$1"; }
# Versión de glibc más alta que exige un binario. El mensaje del cargador no
# sirve para esto: enseña el PRIMER símbolo que no encuentra, no el más alto,
# así que el mismo ejecutable "pide 2.38" en una distribución y "2.39" en otra
# según el orden en que resuelva. Esto lee la tabla y se queda con el máximo.
glibc_que_exige() {
  objdump -T "$1" 2>/dev/null |
    grep -oE 'GLIBC_[0-9]+\.[0-9]+' | sed 's/GLIBC_//' | sort -V | tail -n1
}
ok()       { printf '  \033[32mOK\033[0m       %s\n' "$1"; }
falla()    { printf '  \033[31mFALLA\033[0m    %s\n' "$1"; fallos=$((fallos + 1)); }
esperado() { printf '  \033[33mESPERADO\033[0m %s\n' "$1"; }
nota()     { printf '           %s\n' "$1"; }

titulo "Sistema"
if command -v ldd >/dev/null 2>&1; then
  nota "glibc: $(ldd --version | head -n1)"
fi
nota "distribución: $(. /etc/os-release 2>/dev/null && echo "$PRETTY_NAME")"
if [ "$soportada" = "si" ]; then
  nota "dentro de lo soportado: todo tiene que funcionar"
else
  nota "FUERA de lo soportado: se comprueba que falle de forma limpia"
fi

titulo "Instalando lo que tendría un escritorio normal"
case "$familia" in
  debian)
    export DEBIAN_FRONTEND=noninteractive
    apt-get update -qq
    # Las bibliotecas de escritorio se instalan aquí, no se dejan al .deb.
    # Cuando apt rechaza el paquete (una distribución por debajo del mínimo) el
    # contenedor se quedaba pelado, y entonces el AppImage fallaba por falta de
    # libasound en vez de por la glibc: un resultado correcto por el motivo
    # equivocado, que es la peor clase de resultado. Instalar el .deb después
    # sigue comprobando que sus dependencias declaradas se cumplen.
    alsa=libasound2t64 # en Ubuntu 24.04 y Debian 13 el paquete cambió de nombre
    apt-cache show "$alsa" >/dev/null 2>&1 || alsa=libasound2
    apt-get install -y -qq --no-install-recommends \
      ca-certificates file binutils libwebkit2gtk-4.1-0 libgtk-3-0 \
      libayatana-appindicator3-1 librsvg2-2 "$alsa" >/dev/null
    ;;
  fedora)
    dnf install -y -q webkit2gtk4.1 gtk3 libappindicator-gtk3 alsa-lib \
      librsvg2 file binutils >/dev/null
    ;;
  arch)
    pacman -Sy --noconfirm --quiet webkit2gtk-4.1 gtk3 libayatana-appindicator \
      alsa-lib librsvg file binutils >/dev/null
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
    # Lo que el paquete declara, siempre a la vista. Es el dato que convierte
    # un "apt lo rechaza" en una respuesta: sin esto no se sabe si lo rechazó
    # por el mínimo de libc o porque el archivo llegó corrupto.
    nota "Depends: $(dpkg-deb -f "$deb" Depends 2>/dev/null || echo '(no se pudo leer)')"
    # Sin -qq en esta llamada: con él apt se calla justo el motivo del rechazo,
    # que es lo único que hace falta leer cuando falla.
    if apt-get install -y "$deb" >/tmp/apt.log 2>&1; then
      instalado="si"
    else
      instalado="no"
    fi

    if [ "$instalado" = "si" ]; then
      arranca="no"
      if timeout 60 vocript --help >/tmp/help.log 2>&1; then
        arranca="si"
      fi
      if [ "$arranca" = "si" ]; then
        ok "se instala, apt resuelve sus dependencias y el programa arranca"
        [ "$soportada" = "no" ] && nota "funciona en una distribución que damos por fuera, se puede ampliar el soporte"
      else
        # El caso peor y el motivo de esta prueba: apt no protesta y el
        # usuario se queda con algo instalado que no abre.
        falla "apt lo instala sin quejarse y luego el programa NO arranca"
        nota "$(tail -n 2 /tmp/help.log)"
        nota "el paquete debería declarar el mínimo de libc6 para que apt lo rechace"
      fi
    else
      # El grep primero, por si acierta con la línea exacta, y si no las
      # últimas del log tal cual. Nunca se queda sin explicación.
      motivo=$(grep -iE 'Depends:|libc6|not installable|unmet dependencies' /tmp/apt.log | head -n 3)
      [ -z "$motivo" ] && motivo=$(tail -n 4 /tmp/apt.log)
      if [ "$soportada" = "no" ]; then
        esperado "apt lo rechaza antes de instalar nada, que es lo correcto aquí"
      else
        falla "apt no puede instalarlo en una distribución que sí soportamos"
      fi
      echo "$motivo" | sed 's/^/           /'
    fi
  fi
fi

# ---------------------------------------------------------------------------
# 2. El AppImage, en todas. No puede declarar un mínimo de glibc, así que en
#    las distribuciones viejas lo único posible es documentar que no arranca.
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
      # El dato que decide el mínimo del README y el libc6 del .deb, medido
      # sobre el propio archivo en vez de deducido de en qué distro peta.
      exige_exe=$(glibc_que_exige "$binario")
      exige_libs=$(for l in /tmp/squashfs-root/usr/lib/*.so*; do
        [ -f "$l" ] && glibc_que_exige "$l"
      done | sort -V | tail -n1)
      mayor=$(printf '%s\n%s\n' "$exige_exe" "$exige_libs" | grep -v '^$' | sort -V | tail -n1)
      nota "glibc que exige el ejecutable: ${exige_exe:-?}"
      nota "glibc que exigen sus bibliotecas: ${exige_libs:-?}"
      nota "mínimo real de esta compilación: ${mayor:-?}"
      faltan=$(ldd "$binario" 2>/dev/null | grep 'not found' | awk '{print $1}')
      if [ -n "$faltan" ] && [ "$soportada" = "si" ]; then
        falla "faltan bibliotecas del sistema"
        echo "$faltan" | sed 's/^/           /'
      fi
      if timeout 60 "$binario" --help >/tmp/help2.log 2>&1; then
        ok "el binario del AppImage arranca (--help responde)"
      elif [ "$soportada" = "no" ]; then
        esperado "no arranca, como corresponde a una distribución por debajo del mínimo"
        nota "$(grep -m1 GLIBC /tmp/help2.log || tail -n 1 /tmp/help2.log)"
      else
        falla "el binario del AppImage NO arranca"
        nota "$(tail -n 2 /tmp/help2.log)"
      fi
    fi
  else
    falla "el AppImage no se puede extraer"
  fi
fi

titulo "Resultado"
if [ "$fallos" -eq 0 ]; then
  if [ "$soportada" = "si" ]; then
    ok "VoCript funciona en esta distribución"
  else
    ok "queda fuera del soporte y falla de forma limpia, sin engañar a nadie"
  fi
  exit 0
fi
falla "$fallos comprobación(es) han fallado"
exit 1
