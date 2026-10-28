#!/usr/bin/env bash
# Checks that a built VoCript.app carries the signature the workflow asked for,
# and the permission texts macOS shows. Fails loudly instead of letting a
# release go out signed differently from what its notes say.
#
#   tools/macos/comprobar-firma.sh <path to VoCript.app> <adhoc|firmado|notarizado>

set -euo pipefail

app="$1"
modo="$2"
fallos=0
mal() { echo "::error title=Firma de macOS::$1"; fallos=$((fallos + 1)); }

# Every tool's output is captured first and searched afterwards: `tool | grep -q`
# under pipefail fails at random when grep stops reading early.
firma=$(codesign -dvvv "$app" 2>&1)
grep -E '^(Identifier|CodeDirectory|Signature|Authority|TeamIdentifier|Timestamp)' <<<"$firma" || true

# Hardened runtime is on in tauri.conf.json, and notarization refuses without it.
grep -qE '^CodeDirectory .*flags=0x[0-9a-f]+\(.*runtime' <<<"$firma" ||
  mal "the hardened runtime flag is missing"

case "$modo" in
  adhoc)
    grep -q '^Signature=adhoc' <<<"$firma" || mal "expected an ad-hoc signature"
    ;;
  firmado | notarizado)
    grep -q '^Authority=Developer ID Application:' <<<"$firma" ||
      mal "expected a Developer ID Application signature"
    codesign --verify --deep --strict --verbose=2 "$app" || mal "codesign --verify failed"
    ;;
  *)
    echo "unknown mode: $modo" >&2
    exit 2
    ;;
esac

if [ "$modo" = notarizado ]; then
  gatekeeper=$(spctl --assess --type execute --verbose=4 "$app" 2>&1 || true)
  echo "$gatekeeper"
  grep -q 'source=Notarized Developer ID' <<<"$gatekeeper" || mal "Gatekeeper does not see it as notarized"
  xcrun stapler validate "$app" || mal "the notarization ticket is not stapled to the app"
fi

# The microphone is the one permission that needs an entitlement under the
# hardened runtime: without it macOS hands the app silence, with no prompt.
derechos=$(codesign -d --entitlements - --xml "$app" 2>/dev/null || true)
grep -q 'com.apple.security.device.audio-input' <<<"$derechos" ||
  mal "the audio-input entitlement is missing"

/usr/libexec/PlistBuddy -c 'Print :NSMicrophoneUsageDescription' "$app/Contents/Info.plist" ||
  mal "Info.plist has no NSMicrophoneUsageDescription"

traducciones=0
for strings in "$app"/Contents/Resources/*.lproj/InfoPlist.strings; do
  [ -e "$strings" ] || continue
  if plutil -lint -s "$strings" && plutil -extract NSMicrophoneUsageDescription raw -o /dev/null "$strings"; then
    traducciones=$((traducciones + 1))
  else
    mal "$(basename "$(dirname "$strings")")/InfoPlist.strings does not parse"
  fi
done
echo "Microphone permission text in $traducciones languages."
[ "$traducciones" -ge 20 ] || mal "expected the permission text in 20 languages, found $traducciones"
plutil -extract NSMicrophoneUsageDescription raw -o - "$app/Contents/Resources/es.lproj/InfoPlist.strings" || true

if [ "$fallos" -gt 0 ]; then
  echo "$fallos check(s) failed." >&2
  exit 1
fi
echo "Signature ($modo) and permission texts OK."
