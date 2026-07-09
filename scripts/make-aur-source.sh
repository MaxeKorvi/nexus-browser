#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PKGNAME="nexus-browser"
PKGVER="$(node -p "require('${ROOT}/package.json').version")"
OUT_DIR="${ROOT}/packaging/aur-local"
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "${TMP_DIR}"' EXIT

mkdir -p "${TMP_DIR}/${PKGNAME}-${PKGVER}"
rsync -a \
  --exclude '.git' \
  --exclude 'node_modules' \
  --exclude 'release' \
  --exclude 'dist' \
  --exclude 'packaging/aur/PKGBUILD' \
  --exclude 'packaging/aur/.SRCINFO' \
  --exclude 'packaging/aur/README_AUR.md' \
  --exclude 'packaging/aur/*.tar.gz' \
  --exclude 'packaging/aur/*.pkg.tar.*' \
  --exclude 'packaging/aur/src' \
  --exclude 'packaging/aur/pkg' \
  --exclude 'packaging/aur-local/*.tar.gz' \
  --exclude 'packaging/aur-local/*.pkg.tar.*' \
  --exclude 'packaging/aur-local/src' \
  --exclude 'packaging/aur-local/pkg' \
  "${ROOT}/" "${TMP_DIR}/${PKGNAME}-${PKGVER}/"

mkdir -p "${OUT_DIR}"
ARCHIVE="${OUT_DIR}/${PKGNAME}-${PKGVER}.tar.gz"
tar -C "${TMP_DIR}" -czf "${ARCHIVE}" "${PKGNAME}-${PKGVER}"
SUM="$(sha256sum "${ARCHIVE}" | awk '{print $1}')"
if [ -f "${OUT_DIR}/PKGBUILD" ]; then
  sed -i "s/^sha256sums=.*/sha256sums=('${SUM}')/" "${OUT_DIR}/PKGBUILD"
fi
if [ -f "${OUT_DIR}/.SRCINFO" ]; then
  sed -i "s/^\tsha256sums = .*/\tsha256sums = ${SUM}/" "${OUT_DIR}/.SRCINFO"
fi

echo "Created ${ARCHIVE}"
echo "sha256: ${SUM}"
echo "Local build: cd ${OUT_DIR} && makepkg -Csi"
