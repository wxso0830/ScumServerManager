# LGSS Managers - Desktop (Electron) Build

This folder contains the Electron shell that turns the React frontend into a real
Windows desktop application with admin elevation, real disk detection, folder
creation on physical drives, and SCUM server process management.

## Quick build (Windows)

```bash
cd /app/frontend
yarn build                                # produces ./build
cd ..
yarn add -D electron electron-builder is-elevated sudo-prompt -W
yarn electron:dev                         # dev run with live backend
# or
yarn electron:build                       # produces installer under /dist
```

Add these scripts to the root or frontend `package.json`:

```json
{
  "main": "electron/main.js",
  "scripts": {
    "electron:dev": "ELECTRON_START_URL=http://localhost:3000 electron .",
    "electron:build": "electron-builder --win nsis"
  },
  "build": {
    "appId": "com.lgss.managers",
    "productName": "LGSS Managers",
    "files": ["frontend/build/**", "electron/**"],
    "win": { "target": ["nsis"], "requestedExecutionLevel": "requireAdministrator" }
  }
}
```

## How it works

1. On launch, `main.js` checks if the process is elevated (admin). If not, it shows
   the Turkish UAC-style dialog and relaunches via `sudo-prompt`.
2. `preload.js` exposes `window.lgss.*` IPC methods to the React app.
3. The React frontend (same code as the web preview) calls the backend API for
   state and, when running inside Electron, uses `window.lgss` for real disk info
   and server process control.
