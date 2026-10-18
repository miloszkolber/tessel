#!/usr/bin/env bash
# Package the Tessel web app as a .wgt for Samsung Tizen TV.
#
# Output: dist/tessel.wgt
#
# Sign the resulting .wgt with your Samsung distributor cert before installing.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC="${ROOT}/tizen-app"
OUT="${ROOT}/dist/tessel.wgt"

# Use the existing app icon from the native attempt
cp -f "${ROOT}/res/tessel.png" "${SRC}/icon.png"

mkdir -p "${ROOT}/dist"
rm -f "${OUT}"

cd "${SRC}"
zip -rq "${OUT}" \
    config.xml \
    index.html \
    icon.png \
    assets \
    css \
    js \
    i18n \
    service

ls -lh "${OUT}"
echo ""
echo "Sign and install:"
echo "  sdb connect <tv-ip>"
echo "  sdb install ${OUT}"
