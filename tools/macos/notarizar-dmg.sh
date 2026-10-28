#!/usr/bin/env bash
# Notarizes the DMG and staples the ticket to it. Tauri notarizes and staples
# the .app inside, but only signs the DMG around it, and the DMG is what people
# download. Uses the same credentials preparar-firma.sh exported for Tauri.
#
#   tools/macos/notarizar-dmg.sh <path to the .dmg>

set -euo pipefail

dmg="$1"

if [ -n "${APPLE_API_KEY_PATH:-}" ]; then
  credenciales=(--key "$APPLE_API_KEY_PATH" --key-id "$APPLE_API_KEY" --issuer "$APPLE_API_ISSUER")
elif [ -n "${APPLE_ID:-}" ]; then
  credenciales=(--apple-id "$APPLE_ID" --password "$APPLE_PASSWORD" --team-id "$APPLE_TEAM_ID")
else
  echo "::error title=Notarización del DMG::No notarization credentials: run tools/macos/preparar-firma.sh first." >&2
  exit 1
fi

echo "Sending $(basename "$dmg") to Apple's notary service..."
resultado=$(xcrun notarytool submit "$dmg" "${credenciales[@]}" --wait --output-format json)
echo "$resultado"
estado=$(plutil -extract status raw -o - - <<<"$resultado" 2>/dev/null || echo "?")
if [ "$estado" != Accepted ]; then
  id=$(plutil -extract id raw -o - - <<<"$resultado" 2>/dev/null || true)
  if [ -n "$id" ]; then
    xcrun notarytool log "$id" "${credenciales[@]}" || true
  fi
  echo "::error title=Notarización del DMG::Apple answered \"$estado\" for the DMG."
  exit 1
fi

xcrun stapler staple "$dmg"
xcrun stapler validate "$dmg"
