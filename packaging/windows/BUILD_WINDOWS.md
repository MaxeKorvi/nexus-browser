# Windows EXE installer

Build on Windows 11 with Node.js 20+:

```powershell
npm install
npm run dist:win
```

Output:

```text
release/Nexus Browser-6.0.0-win-x64.exe
```

Installer settings:

- default install directory: `C:\Program Files\Nexus Browser`
- Start Menu shortcut: `Nexus/Nexus Browser`
- Desktop shortcut: enabled
- uninstall keeps browser profile data by default
- install directory can be changed in installer UI

Portable build:

```powershell
npm run dist:win:portable
```
