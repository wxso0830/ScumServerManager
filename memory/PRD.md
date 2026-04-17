# LGSS Managers – SCUM Server Manager PRD

## Original Problem Statement
Turkish user requested: "bana scum oyunu için bir manager oluştur..." — a SCUM server manager desktop app with:
- First-launch "Run as Administrator" (UAC) prompt (Yes → relaunch elevated, No → close)
- Disk selection wizard showing all disks, capacities, free space, and SCUM server required size (~30GB); eligible-only selection
- Auto-creates LGSSManagers folder on chosen disk; + button adds Server1, Server2, ...
- Categorized and easily adjustable SCUM server settings (ARK Manager-style)
- Multiple themes and language support

## Architecture
- Backend: FastAPI + MongoDB (server profiles, setup state, settings)
- Frontend: React (CRA) with custom ThemeProvider (4 themes via CSS variables + data-theme), I18nProvider (TR/EN), shadcn-compatible utility styles
- Desktop shell: Electron (`/app/electron/main.js`, `preload.js`) with real admin elevation, disk enumeration (wmic), folder creation, SCUMServer.exe spawning

## User Personas
- **Server Admin** (primary): runs SCUM dedicated server for a community, needs dense admin tool with all settings accessible
- **New Host**: first-time server host, needs setup wizard to pick a disk and create folder structure

## Core Requirements (Static)
- Admin privilege elevation flow on desktop
- Disk detection + capacity visualization + eligibility enforcement (≥30GB free)
- Multi-server workspace (Server1, Server2, ...) under LGSSManagers root
- Categorized collapsible SCUM setting panels: Administration, World, Economy, Loot, Vehicles, Raid Protection, Squads, Weapons, Zombies/Puppets, Players, Network, Custom INI
- Theme switcher (Wasteland, Cyber Neon, Obsidian, Amber CRT)
- Language switcher (TR, EN)
- Start/Stop/Status for each server profile

## What's Been Implemented (2026-02-17)
- Full FastAPI backend: admin-check, disks, setup state, server CRUD, settings merge, start/stop — all tested (22/22)
- Full React UI: Admin prompt → disk wizard → empty workspace → server profile dashboards with all 12 categorized setting panels and 60+ tunable fields (text, number, toggle, slider, password, textarea)
- 4 cohesive dark themes with atmospheric backgrounds per theme
- TR/EN localization
- Sidebar with + button, server tabs, status dots, path display
- Top bar with version, task status (Auto Backup/Update/Discord Bot), admin badge, theme picker, language picker, reset, donate
- Electron shell scaffolding (main.js, preload.js, README) for real Windows admin elevation, real disk enumeration via wmic, SCUMServer.exe spawning

## Prioritized Backlog
### P0
- None – MVP complete

### P1
- SteamCMD integration in Electron main to auto-install SCUM dedicated server on Server1 creation
- Live log tail viewer per server (WebSocket from Electron child_process → React panel)
- Scheduled restart / auto-update timers
- Config file (ServerSettings.ini / Game.ini / Engine.ini) export from settings state

### P2
- Discord bot integration (announcements, player count)
- Automatic backup rotation with restore UI
- RCON console for live in-game commands
- Mod manager for Steam Workshop items
- Multi-language expansion (DE, RU)

## Next Tasks
1. Wire Electron IPC to backend so disk listing prefers `window.lgss.listDisks` when available
2. Add SteamCMD wrapper to Electron main with progress streaming to UI
3. Render-side INI file generator that writes to `{folder_path}/SCUM/Saved/Config/WindowsServer/*.ini` on Save
4. Server logs panel
