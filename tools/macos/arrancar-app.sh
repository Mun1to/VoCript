#!/usr/bin/env bash
# Launches a built VoCript.app and checks it is still alive a while later.
# A signature macOS dislikes (a library from another team under the hardened
# runtime, a bad entitlement) kills the process at launch, and codesign
# --verify does not see that coming.
#
#   tools/macos/arrancar-app.sh <path to VoCript.app> [seconds, default 30]

set -euo pipefail

app="$1"
espera="${2:-30}"
# The executable inside is lowercase, not VoCript (default-run in Cargo.toml).
binario="$app/Contents/MacOS/vocript"
registro="${RUNNER_TEMP:-/tmp}/vocript-arranque.log"

"$binario" >"$registro" 2>&1 &
pid=$!
sleep "$espera"

if kill -0 "$pid" 2>/dev/null; then
  echo "VoCript is alive after ${espera}s (pid $pid)."
  kill "$pid" 2>/dev/null || true
  wait "$pid" 2>/dev/null || true
  exit 0
fi

codigo=0
wait "$pid" || codigo=$?
echo "::error title=Arranque en macOS::VoCript died within ${espera}s (exit code $codigo). Last lines of its output:"
tail -n 40 "$registro" || true
# What macOS's code-signing enforcement said, if it was that.
log show --last 2m --style compact --predicate 'process == "kernel" OR subsystem == "com.apple.amfi"' 2>/dev/null |
  grep -iE 'vocript|amfi|library validation|code signature' | tail -n 20 || true
exit 1
