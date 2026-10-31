#!/bin/sh
# VoCript installer for macOS.
#
#   curl -fsSL https://vocript.app/mac | sh
#
# Since 3.7.11 VoCript is signed with an Apple Developer ID and notarized, so
# the .dmg opens on its own and this script is just the Terminal way to get the
# same app: it downloads the latest build and copies it to Applications.
#
# It started as a way around the "Apple could not verify that this app is free
# of malware" dialog, back when VoCript was not notarized. That is why it still
# clears the download tag (com.apple.quarantine) at the end, which does nothing
# harmful to a notarized app.
#
# Nothing here disables a security feature on your Mac, and you can read every
# line of it first.

set -eu

REPO="Mun1to/VoCript"
ASSET="VoCript_aarch64.app.tar.gz"
APP="/Applications/VoCript.app"

rojo() { printf '\033[31m%s\033[0m\n' "$1" >&2; }
verde() { printf '\033[32m%s\033[0m\n' "$1"; }
info() { printf '%s\n' "$1"; }

# --- 1. Is this even the right machine? ---------------------------------
[ "$(uname -s)" = "Darwin" ] || { rojo "This installer is for macOS."; exit 1; }

if [ "$(uname -m)" != "arm64" ]; then
    rojo "VoCript needs an Apple Silicon Mac (M1 or newer); this one reports $(uname -m)."
    rojo "There is no Intel build. Sorry."
    exit 1
fi

# --- 2. Nothing gets replaced while it is running -----------------------
if pgrep -x VoCript >/dev/null 2>&1; then
    info "VoCript is running; closing it first."
    osascript -e 'quit app "VoCript"' >/dev/null 2>&1 || true
    sleep 2
    pgrep -x VoCript >/dev/null 2>&1 && { rojo "VoCript will not close. Quit it and run this again."; exit 1; }
fi

# --- 3. Download ---------------------------------------------------------
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT INT TERM

URL="https://github.com/$REPO/releases/latest/download/$ASSET"
info "Downloading the latest VoCript..."
curl -fSL --retry 3 --progress-bar "$URL" -o "$TMP/$ASSET" || {
    rojo "Download failed. Check your connection, or grab the .dmg from"
    rojo "https://github.com/$REPO/releases/latest"
    exit 1
}

# A truncated download extracts into something that looks almost right, so
# check the size before trusting it. The real archive is around 19 MB.
BYTES=$(wc -c < "$TMP/$ASSET" | tr -d ' ')
[ "$BYTES" -gt 10000000 ] || { rojo "That download is only $BYTES bytes, far too small. Stopping."; exit 1; }

# --- 4. Unpack and check what came out -----------------------------------
tar -xzf "$TMP/$ASSET" -C "$TMP" || { rojo "The archive would not unpack."; exit 1; }
[ -d "$TMP/VoCript.app" ] || { rojo "No VoCript.app inside the archive. Stopping rather than guessing."; exit 1; }
[ -x "$TMP/VoCript.app/Contents/MacOS/VoCript" ] || { rojo "The app has no runnable binary inside. Stopping."; exit 1; }

# --- 5. Install ----------------------------------------------------------
info "Installing to $APP"
if [ -d "$APP" ]; then
    rm -rf "$APP" 2>/dev/null || sudo rm -rf "$APP"
fi
mv "$TMP/VoCript.app" "$APP" 2>/dev/null || sudo mv "$TMP/VoCript.app" "$APP"

# curl never set the tag, but the app may have been installed before by a
# browser download, and an inherited tag would bring the dialog straight back.
xattr -dr com.apple.quarantine "$APP" 2>/dev/null || true

[ -d "$APP" ] || { rojo "Something went wrong: $APP is not there."; exit 1; }

verde "VoCript is installed. Open it from Applications or Spotlight."
info ""
info "It will open straight away, with no security dialog: this copy never"
info "carried the browser download tag that triggers one."
