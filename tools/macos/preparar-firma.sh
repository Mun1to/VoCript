#!/usr/bin/env bash
# Decides how the macOS build gets signed, from whatever Apple secrets the
# workflow has, and hands Tauri exactly the variables it reads.
#
# Input (environment, normally from GitHub secrets):
#   APPLE_CERTIFICATE           the Developer ID Application .p12, base64
#   APPLE_CERTIFICATE_PASSWORD  its password
#   APPLE_API_ISSUER            App Store Connect Issuer ID   } notarization
#   APPLE_API_KEY               App Store Connect Key ID      }
#   APPLE_API_KEY_P8            the AuthKey_<Key ID>.p8 text  }
#
# Output: `modo=adhoc|firmado|notarizado` in GITHUB_OUTPUT, and the variables
# Tauri expects in GITHUB_ENV, but only for the steps that come after this one.
#
#   nothing        -> adhoc       exports nothing: the build is the same ad-hoc
#                                 one VoCript has always shipped.
#   certificate    -> firmado     signed with Developer ID, not notarized. Still
#                                 better than ad-hoc: macOS keeps the
#                                 Accessibility permission across updates.
#   everything     -> notarizado  signed and notarized: opens without the
#                                 "Apple could not verify" dialog.
#
# Nothing here prints a secret, and nothing runs with `set -x`.

set -euo pipefail

tiene() { [ -n "${!1:-}" ]; }

: "${GITHUB_ENV:?this script only runs inside GitHub Actions}"
: "${GITHUB_OUTPUT:?this script only runs inside GitHub Actions}"
temporal="${RUNNER_TEMP:-$(mktemp -d)}"

# Writes NAME=value to GITHUB_ENV with a random delimiter, so a value can never
# end the block early or smuggle in a variable of its own.
exportar() {
  local delimitador
  delimitador="FIN_$(openssl rand -hex 16)"
  {
    printf '%s<<%s\n' "$1" "$delimitador"
    printf '%s\n' "$2"
    printf '%s\n' "$delimitador"
  } >>"$GITHUB_ENV"
}

certificado=false
if tiene APPLE_CERTIFICATE && tiene APPLE_CERTIFICATE_PASSWORD; then
  certificado=true
elif tiene APPLE_CERTIFICATE || tiene APPLE_CERTIFICATE_PASSWORD; then
  echo "::warning title=Firma de Apple::APPLE_CERTIFICATE and APPLE_CERTIFICATE_PASSWORD go together and only one is set. Building ad-hoc."
fi

notarizacion=false
if tiene APPLE_API_ISSUER && tiene APPLE_API_KEY && tiene APPLE_API_KEY_P8; then
  notarizacion=true
elif tiene APPLE_API_ISSUER || tiene APPLE_API_KEY || tiene APPLE_API_KEY_P8; then
  echo "::warning title=Firma de Apple::Notarization needs APPLE_API_ISSUER, APPLE_API_KEY and APPLE_API_KEY_P8, and some are missing. Not notarizing."
fi

if [ "$certificado" = false ]; then
  if [ "$notarizacion" = true ]; then
    echo "::warning title=Firma de Apple::There are notarization keys but no certificate, and Apple only notarizes signed apps. Building ad-hoc."
  fi
  echo "modo=adhoc" >>"$GITHUB_OUTPUT"
  echo "No Apple certificate: building ad-hoc, as before."
  exit 0
fi

# Tauri takes the identity from APPLE_SIGNING_IDENTITY before tauri.conf.json,
# whose "-" (ad-hoc) would otherwise clash with the imported certificate. It is
# read from the certificate itself, so it can never disagree with it.
p12="$temporal/developer-id.p12"
printf '%s' "$APPLE_CERTIFICATE" | base64 --decode >"$p12"
sujeto=$(openssl pkcs12 -in "$p12" -nokeys -clcerts -passin env:APPLE_CERTIFICATE_PASSWORD 2>/dev/null |
  openssl x509 -noout -subject -nameopt multiline 2>/dev/null) || {
  echo "::error title=Firma de Apple::APPLE_CERTIFICATE does not open with APPLE_CERTIFICATE_PASSWORD."
  exit 1
}
rm -f "$p12"
identidad=$(sed -n '/^ *commonName *= */{s///p;q;}' <<<"$sujeto")
case "$identidad" in
  "Developer ID Application:"*) ;;
  *)
    echo "::error title=Firma de Apple::The certificate is \"$identidad\", and downloads need a \"Developer ID Application\" one."
    exit 1
    ;;
esac

exportar APPLE_CERTIFICATE "$APPLE_CERTIFICATE"
exportar APPLE_CERTIFICATE_PASSWORD "$APPLE_CERTIFICATE_PASSWORD"
exportar APPLE_SIGNING_IDENTITY "$identidad"

if [ "$notarizacion" = false ]; then
  echo "::warning title=Firma de Apple::Signed with Developer ID but NOT notarized: macOS will still warn when the DMG is opened from a browser download."
  echo "modo=firmado" >>"$GITHUB_OUTPUT"
  echo "Signing as \"$identidad\", without notarization."
  exit 0
fi

# Tauri wants the .p8 as a file, named the way Apple names it.
clave="$temporal/private_keys/AuthKey_${APPLE_API_KEY}.p8"
mkdir -p "$(dirname "$clave")"
printf '%s\n' "$APPLE_API_KEY_P8" >"$clave"
chmod 600 "$clave"

exportar APPLE_API_ISSUER "$APPLE_API_ISSUER"
exportar APPLE_API_KEY "$APPLE_API_KEY"
exportar APPLE_API_KEY_PATH "$clave"

echo "modo=notarizado" >>"$GITHUB_OUTPUT"
echo "Signing as \"$identidad\" and notarizing with the App Store Connect key."
