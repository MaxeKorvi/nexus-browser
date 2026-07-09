#!/usr/bin/env bash
set -e
cd "$(dirname "$0")"

echo "==> Nexus Browser"
echo "==> Папка проекта: $PWD"

ELECTRON_VERSION="33.4.11"
OS="$(uname -s | tr '[:upper:]' '[:lower:]')"
ARCH="$(uname -m)"

case "$ARCH" in
  x86_64|amd64) ELECTRON_ARCH="x64" ;;
  aarch64|arm64) ELECTRON_ARCH="arm64" ;;
  *) echo "Неизвестная архитектура: $ARCH"; exit 1 ;;
esac

if [ "$OS" != "linux" ]; then
  echo "Этот run.sh сейчас рассчитан на Linux."
  exit 1
fi

ELECTRON_ROOT=".electron"
ELECTRON_DIR="$ELECTRON_ROOT/electron-v${ELECTRON_VERSION}-linux-${ELECTRON_ARCH}"
ELECTRON_BIN="$ELECTRON_DIR/electron"
ELECTRON_ZIP="$ELECTRON_ROOT/electron-v${ELECTRON_VERSION}-linux-${ELECTRON_ARCH}.zip"

# Сначала зеркало, потому что GitHub у некоторых серверов/провайдеров рвёт TLS.
URLS=(
  "https://npmmirror.com/mirrors/electron/${ELECTRON_VERSION}/electron-v${ELECTRON_VERSION}-linux-${ELECTRON_ARCH}.zip"
  "https://github.com/electron/electron/releases/download/v${ELECTRON_VERSION}/electron-v${ELECTRON_VERSION}-linux-${ELECTRON_ARCH}.zip"
)

download_with_curl() {
  local url="$1"
  local out="$2"

  curl \
    --http1.1 \
    -L \
    --fail \
    --connect-timeout 20 \
    --max-time 900 \
    --retry 2 \
    --retry-delay 2 \
    --retry-all-errors \
    "$url" \
    -o "$out"
}

download_with_wget() {
  local url="$1"
  local out="$2"

  wget \
    --tries=3 \
    --timeout=30 \
    --continue \
    "$url" \
    -O "$out"
}

download_file() {
  local out="$1"
  rm -f "${out}.tmp"

  for url in "${URLS[@]}"; do
    echo "==> Пробую скачать Electron:"
    echo "    $url"

    if command -v curl >/dev/null 2>&1; then
      if download_with_curl "$url" "${out}.tmp"; then
        mv "${out}.tmp" "$out"
        return 0
      fi
      echo "==> curl не смог скачать. Пробую wget..."
      rm -f "${out}.tmp"
    fi

    if command -v wget >/dev/null 2>&1; then
      if download_with_wget "$url" "${out}.tmp"; then
        mv "${out}.tmp" "$out"
        return 0
      fi
      echo "==> wget не смог скачать. Пробую следующий адрес..."
      rm -f "${out}.tmp"
    fi
  done

  echo ""
  echo "Не удалось скачать Electron автоматически."
  echo ""
  echo "Скачай вручную один из файлов:"
  echo "  ${URLS[0]}"
  echo "  ${URLS[1]}"
  echo ""
  echo "И положи его сюда:"
  echo "  $PWD/$ELECTRON_ZIP"
  echo ""
  echo "Потом снова запусти:"
  echo "  ./run.sh"
  exit 1
}

check_zip() {
  local zip="$1"
  if [ ! -f "$zip" ]; then
    return 1
  fi

  if command -v unzip >/dev/null 2>&1; then
    unzip -tq "$zip" >/dev/null 2>&1
    return $?
  fi

  return 0
}

if [ ! -x "$ELECTRON_BIN" ]; then
  echo "==> Electron не найден локально. Скачиваю готовый бинарник..."
  mkdir -p "$ELECTRON_ROOT"
  rm -rf "$ELECTRON_DIR"

  if ! command -v unzip >/dev/null 2>&1; then
    echo "Не найден unzip. На Ubuntu/Debian:"
    echo "  sudo apt install unzip"
    exit 1
  fi

  if ! check_zip "$ELECTRON_ZIP"; then
    echo "==> Архив Electron отсутствует или битый. Скачиваю заново..."
    rm -f "$ELECTRON_ZIP"
    download_file "$ELECTRON_ZIP"
  else
    echo "==> Архив Electron уже скачан и выглядит нормально: $ELECTRON_ZIP"
  fi

  echo "==> Распаковываю Electron..."
  mkdir -p "$ELECTRON_DIR"
  unzip -q "$ELECTRON_ZIP" -d "$ELECTRON_DIR"
  chmod +x "$ELECTRON_BIN"
fi

if [ ! -x "$ELECTRON_BIN" ]; then
  echo "Electron не запустится: не найден бинарник $ELECTRON_BIN"
  exit 1
fi

echo "==> Запускаю Nexus..."
# Раньше тут было --no-sandbox (критическая уязвимость). Теперь браузер работает
# с полноценной Chromium sandbox. Если на системах без kernel namespaces
# запуск падает — используй NEXUS_DEV=1 ./run.sh и смотри логи.
"$ELECTRON_BIN" .
