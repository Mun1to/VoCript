#!/usr/bin/env bash
#
# Prueba de humo de los paquetes de Linux DENTRO de un contenedor limpio.
#
# Responde a una pregunta que hasta ahora se contestaba de oído: ¿en qué
# distribuciones arranca de verdad VoCript? El README prometía «Fedora 39+»
# cuando Fedora 39 lleva una glibc por debajo del mínimo, y nadie lo había
# comprobado en ninguna distribución.
#
# Hay DOS pruebas por paquete, y hacen falta las dos:
#
#   1. `--help`. El binario resuelve sus bibliotecas al cargarse, así que si
#      falta gtk o la glibc es demasiado antigua, ni siquiera llega a imprimir
#      la ayuda. Barata y detecta todo lo que es enlazado.
#
#   2. La ventana, con una pantalla virtual. `--help` NO crea ninguna ventana
#      ni carga WebKit, y por eso esta prueba daba Fedora en verde mientras un
#      usuario la abría y le salía en blanco (issue #7): el AppImage se lleva
#      dentro su propio WebKitGTK con las rutas de Debian, que en Fedora están
#      en otro sitio, y el proceso que dibuja se cae al arrancar. Un fallo que
#      solo aparece cuando hay algo que dibujar no se ve sin dibujar.
#
# El segundo argumento dice si la distribución está DENTRO de lo soportado. Las
# de fuera no se prueban para ver si funcionan, sino para ver si **fallan
# bien**: lo que no puede pasar es que apt instale el paquete sin una queja y
# luego el programa no arranque, que fue justo lo que hacía hasta hoy.
#
# La regla de aprobado en una distribución soportada es: al menos UN paquete
# tiene que llegar a pintar la ventana. Que el AppImage no valga en Fedora es
# aceptable mientras el rpm sí valga y sea el que se ofrece ahí; lo que no es
# aceptable es que no valga ninguno.
#
# Uso (desde el contenedor, con /dist montado con los artefactos dentro):
#   probar.sh debian|fedora|arch  si|no
#
set -uo pipefail

familia="${1:?Falta la familia: debian, fedora o arch}"
soportada="${2:-si}"
dist_dir="${DIST_DIR:-/dist}"
fallos=0
# Cuántos paquetes han conseguido pintar la ventana en esta distribución.
ventanas_ok=0
# Cuántos lo han intentado, para no exigir una ventana donde no se probó nada.
ventanas_probadas=0

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
aviso()    { printf '  \033[33mAVISO\033[0m    %s\n' "$1"; }
nota()     { printf '           %s\n' "$1"; }

# ---------------------------------------------------------------------------
# ¿Llega a pintarse la ventana?
#
# Se arranca de verdad contra una pantalla virtual y se mira, pasados unos
# segundos, si el proceso que dibuja el contenido sigue vivo. Esa es la
# diferencia entre "el programa abre" y "el programa se ve": en el fallo del
# issue #7 el proceso principal sobrevive y lo que muere es WebKitWebProcess,
# dejando el marco vacío.
#
# El log se guarda entero y se busca en él la firma del fallo, para no
# confundirlo con un contenedor sin tarjeta de sonido, que es otra cosa y da
# otro error.
# ---------------------------------------------------------------------------
prueba_de_ventana() {
  local etiqueta="$1"
  shift
  local log=/tmp/ventana.log

  ventanas_probadas=$((ventanas_probadas + 1))
  : >"$log"
  # HOME propio: un primer arranque escribe configuración y no queremos que un
  # paquete se encuentre lo que dejó el anterior. Se guarda el de antes porque
  # esta función se llama varias veces y el directorio se borra al salir: dejar
  # HOME apuntando a algo que ya no existe rompería la llamada siguiente.
  local home_previo="${HOME:-/root}"
  export HOME=/tmp/casa-$$-$ventanas_probadas
  mkdir -p "$HOME"

  xvfb-run -a --server-args="-screen 0 1280x800x24" "$@" >"$log" 2>&1 &
  local pid=$!
  local vivo_web="no"
  # Hasta 40 s. Arrancar carga modelos y monta la interfaz; menos tiempo daba
  # falsos negativos en los contenedores más lentos.
  for _ in $(seq 1 40); do
    sleep 1
    if pgrep -f 'WebKitWebProcess' >/dev/null 2>&1; then
      vivo_web="si"
      break
    fi
    kill -0 "$pid" 2>/dev/null || break
  done

  # Un respiro más: lo que falla en Fedora arranca el proceso y se cae acto
  # seguido, así que verlo nacer no basta, hay que verlo seguir vivo.
  if [ "$vivo_web" = "si" ]; then
    sleep 8
    pgrep -f 'WebKitWebProcess' >/dev/null 2>&1 || vivo_web="murio"
  fi

  local firma
  firma=$(grep -iE 'EGL_BAD_PARAMETER|Could not create default EGL|WebKitWebProcess|injectedbundle|Failed to create GBM' "$log" | head -n2)

  pkill -f 'WebKitWebProcess' >/dev/null 2>&1
  kill "$pid" >/dev/null 2>&1
  wait "$pid" 2>/dev/null
  rm -rf "$HOME"
  export HOME="$home_previo"

  case "$vivo_web" in
    si)
      ok "$etiqueta: la ventana se pinta (el proceso de WebKit sigue vivo)"
      ventanas_ok=$((ventanas_ok + 1))
      return 0
      ;;
    murio)
      aviso "$etiqueta: el proceso de WebKit arranca y se cae, la ventana queda en blanco"
      ;;
    *)
      aviso "$etiqueta: el proceso de WebKit no llega a arrancar"
      ;;
  esac
  [ -n "$firma" ] && echo "$firma" | sed 's/^/           /'
  [ -z "$firma" ] && nota "$(tail -n 2 "$log")"
  return 1
}

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
      libayatana-appindicator3-1 librsvg2-2 "$alsa" \
      xvfb xauth procps >/dev/null
    # xauth va explícito: en Debian 13 dejó de ser dependencia dura de xvfb y
    # pasó a recomendación, así que con --no-install-recommends no entraba y
    # `xvfb-run` moría con "xauth command not found" antes de abrir pantalla.
    # Se leía como que la app no pintaba la ventana, y era la prueba la rota.
    ;;
  fedora)
    # Aquí SOLO las herramientas de la prueba, ni una biblioteca de escritorio.
    # Es a propósito y es la única forma de que el rpm demuestre algo: en un
    # contenedor donde webkit ya está puesto a mano, un rpm que no declarase
    # nada se instalaría y arrancaría igual, y pasaría por bueno hasta que
    # alguien lo instalase en su Fedora de verdad. Las bibliotecas se instalan
    # más abajo, después del rpm y antes del AppImage.
    dnf install -y -q file binutils xorg-x11-server-Xvfb procps-ng >/dev/null
    ;;
  arch)
    pacman -Sy --noconfirm --quiet webkit2gtk-4.1 gtk3 libayatana-appindicator \
      alsa-lib librsvg file binutils xorg-server-xvfb procps-ng >/dev/null
    ;;
  *)
    echo "Familia desconocida: $familia" >&2
    exit 2
    ;;
esac

# ---------------------------------------------------------------------------
# 1. El paquete nativo de cada familia: .deb en Debian, .rpm en Fedora.
#
# Los dos hacen lo mismo y por eso son los buenos: no empaquetan WebKit, lo
# piden al sistema, así que no puede haber choque de rutas.
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
        prueba_de_ventana ".deb" vocript
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

if [ "$familia" = "fedora" ]; then
  rpm_file=$(find "$dist_dir" -name '*.rpm' | head -n1)
  if [ -z "$rpm_file" ]; then
    falla ".rpm: no hay ninguno en $dist_dir"
    nota "es el paquete que le toca a Fedora, ver el issue #7"
  else
    titulo "Paquete .rpm ($(basename "$rpm_file"))"
    # Igual que con el .deb: lo que declara decide si dnf se trae webkit o si
    # el usuario acaba con la ventana en blanco.
    nota "Requires: $(rpm -qp --requires "$rpm_file" 2>/dev/null | tr '\n' ' ' | cut -c1-300)"
    if dnf install -y "$rpm_file" >/tmp/dnf.log 2>&1; then
      arranca="no"
      timeout 60 vocript --help >/tmp/help_rpm.log 2>&1 && arranca="si"
      if [ "$arranca" = "si" ]; then
        ok "se instala, dnf resuelve sus dependencias y el programa arranca"
        prueba_de_ventana ".rpm" vocript
      else
        falla "dnf lo instala sin quejarse y luego el programa NO arranca"
        nota "$(tail -n 2 /tmp/help_rpm.log)"
      fi
    elif [ "$soportada" = "no" ]; then
      esperado "dnf lo rechaza antes de instalar nada, que es lo correcto aquí"
      nota "$(tail -n 3 /tmp/dnf.log)"
    else
      falla "dnf no puede instalarlo en una distribución que sí soportamos"
      nota "$(tail -n 3 /tmp/dnf.log)"
    fi
  fi
fi

# En Fedora el contenedor llegó pelado para que el rpm se examinara solo. El
# AppImage no declara nada a nadie, así que a partir de aquí se le da el
# escritorio que tendría cualquiera, o fallaría por falta de bibliotecas en
# vez de por lo que se quiere medir.
if [ "$familia" = "fedora" ]; then
  dnf install -y -q webkit2gtk4.1 gtk3 libappindicator-gtk3 alsa-lib \
    librsvg2 gtk-layer-shell >/dev/null 2>&1
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
        # La ventana se prueba por el AppRun, no por el binario suelto: es el
        # AppRun el que coloca las rutas del WebKit empaquetado, que es justo
        # lo que se rompe en Fedora.
        if [ "$soportada" = "si" ]; then
          prueba_de_ventana "AppImage" /tmp/squashfs-root/AppRun ||
            nota "en esta distribución el paquete recomendado es el nativo, no el AppImage"
        fi
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

# ---------------------------------------------------------------------------
# 3. El veredicto sobre la ventana, que es lo que ve el usuario.
# ---------------------------------------------------------------------------
if [ "$soportada" = "si" ] && [ "$ventanas_probadas" -gt 0 ] && [ "$ventanas_ok" -eq 0 ]; then
  falla "ningún paquete llega a pintar la ventana en esta distribución"
  nota "el programa arranca pero el usuario ve el marco vacío, que es el issue #7"
fi

titulo "Resultado"
if [ "$fallos" -eq 0 ]; then
  if [ "$soportada" = "si" ]; then
    ok "VoCript funciona en esta distribución ($ventanas_ok de $ventanas_probadas paquetes pintan la ventana)"
  else
    ok "queda fuera del soporte y falla de forma limpia, sin engañar a nadie"
  fi
  exit 0
fi
falla "$fallos comprobación(es) han fallado"
exit 1
