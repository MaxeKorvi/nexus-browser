#!/bin/sh
# Nexus Browser AUR launcher.
# The app is tested with Electron 33. Using Arch's rolling /usr/bin/electron
# can silently switch Chromium/Electron versions and break BrowserView/Wayland behavior.
ELECTRON_BIN="${ELECTRON_BIN:-/usr/bin/electron33}"
if [ ! -x "$ELECTRON_BIN" ]; then
  ELECTRON_BIN="/usr/bin/electron"
fi

export ELECTRON_OZONE_PLATFORM_HINT="${ELECTRON_OZONE_PLATFORM_HINT:-auto}"
export ELECTRON_ENABLE_LOGGING="${ELECTRON_ENABLE_LOGGING:-0}"

set -- \
  --class=nexus-browser \
  --ozone-platform-hint="$ELECTRON_OZONE_PLATFORM_HINT" \
  --enable-features=WaylandWindowDecorations \
  --disable-gpu-sandbox \
  /opt/nexus-browser \
  "$@"

exec "$ELECTRON_BIN" "$@"
