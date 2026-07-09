# Local AUR test package

Use this directory only for local testing before uploading the source archive to GitHub Release.

Because this is a local `makepkg` build, install the AUR dependency with an AUR helper first:

```bash
paru -S --needed electron33-bin
cd packaging/aur-local
makepkg -Csi
```

After you publish the public AUR package from `packaging/aur`, users only need:

```bash
paru -S nexus-browser
```
