# Nexus Browser public AUR package

This directory is the publish-ready AUR package.

Users will install it with:

```bash
paru -S nexus-browser
```

The package depends on `electron33-bin`, so `paru`/`yay` will fetch Electron automatically.
Users do not need to install Electron manually.

Installed layout:

- `/opt/nexus-browser` — app files
- `/usr/bin/nexus-browser` — launcher
- `/usr/share/applications/nexus-browser.desktop` — app menu shortcut
- `/usr/share/icons/hicolor/*/apps/nexus-browser.png` — icons

## Publish steps

1. Upload this source archive as a GitHub release asset:

   `nexus-browser-6.0.0.tar.gz`

   Release tag:

   `v6.0.0`

2. Push these files from this directory to AUR:

   - `PKGBUILD`
   - `.SRCINFO`
   - `nexus-browser.sh`
   - `nexus-browser.desktop`
   - `nexus-browser.install`

3. Then users can install with:

   `paru -S nexus-browser`

## Runtime note

The launcher uses `/usr/bin/electron33` intentionally. Do not switch it to rolling `/usr/bin/electron` unless this browser is tested on that Electron version.
