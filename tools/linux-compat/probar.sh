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
    # No se instalan las dependencias una a una a propósito: se instala el
    # propio .deb y que apt resuelva lo que VoCript declara. Así esto comprueba
    # de paso que esas dependencias están bien declaradas y existen.
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
