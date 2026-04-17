# LGSS Managers – SCUM Server Manager PRD

## Original Problem Statement
Turkish user requested a SCUM server manager desktop application with:
- First-launch "Run as Administrator" (UAC) prompt (Yes → relaunch elevated, No → close)
- Disk selection wizard showing all disks, capacities, free space, and SCUM server required size (~30GB); eligible-only selection
- Auto-creates `LGSSManagers/Servers/ServerN/` folder on chosen disk; + button adds Server1, Server2, ...
- Categorized and easily adjustable SCUM server settings (all 11 official config files)
- SteamCMD integration to download SCUM server files (AppID 3792580)
- Settings must be written to `{folder_path}/SCUM/Saved/Config/WindowsServer/`
- Multiple themes and multi-language support (TR/EN, default English)
- Global action buttons: START ALL, UPDATE SERVER, MANAGER UPDATE
- Brand: **LEGENDARY GAMING SCUM SERVER MANAGER (LGSS Manager)**

## Architecture
- Backend: FastAPI + MongoDB (server profiles, setup state, parsed settings)
- Frontend: React (CRA) with custom ThemeProvider + I18nProvider + shadcn primitives
- Desktop shell: Electron (`/app/electron/main.js`, `preload.js`) for real admin elevation, disk enumeration (wmic), folder creation, SCUMServer.exe spawning, SteamCMD
- Config: Custom parser (`/app/backend/scum_parser.py`) renders/parses 11 SCUM config files exactly per game spec

## User Personas
- **Server Admin** (primary): runs SCUM dedicated server for a community, needs dense admin tool with all settings accessible
- **New Host**: first-time server host, needs setup wizard to pick a disk and create folder structure

## Core Requirements (Static)
- Admin privilege elevation flow on desktop
- Disk detection + capacity visualization + eligibility enforcement (≥30GB free)
- Multi-server workspace (`LGSSManagers/Servers/Server1/`) with auto-increment
- Categorized settings: Essentials, Gameplay, World & NPCs, Economy, Security & Raid, Users, Advanced, Client Defaults
- Support all 11 config files: ServerSettings.ini, GameUserSettings.ini, Input.ini, AdminUsers.ini, ServerSettingsAdminUsers.ini, BannedUsers.ini, WhitelistedUsers.ini, ExclusiveUsers.ini, SilencedUsers.ini, EconomyOverride.json, RaidTimes.json, Notifications.json
- Multi-theme switcher (4 themes)
- Language switcher (TR, EN)
- Start/Stop/Update/Install for each server profile
- Export/Import each config file in its exact SCUM format

## CHANGELOG

### 2026-02-17 — Initial MVP
- Full FastAPI backend: admin-check, disks, setup state, server CRUD, settings merge, start/stop
- Full React UI with 12 categorized setting panels, 60+ tunable fields
- 4 dark themes + TR/EN localization
- Electron shell scaffolding

### 2026-03–04 — Config Parser & SCUM File Formats
- Dynamic settings schema for 11 SCUM config files
- Functional category grouping (Essentials/Gameplay/World/...)
- Export/Import endpoints per file
- SteamCMD install simulation
- START ALL / UPDATE ALL / MANAGER UPDATE buttons

### 2026-04-17 — Complete UI Redesign (Tactical Command)
- **Full structural redesign per user demand** (previous color-tweak rejected).
- **Dashboard-first TOP navigation** — Sidebar DELETED. New layout:
  1. Tactical HUD TopBar (72px) with stencil logo, center nav tabs (Command Center / Configuration / Ops Logs), right actions
  2. Status Ribbon (36px) — tactical HUD with Network LED, Connected Disk, Server count, System Status, Admin badge, Tactical Mode
  3. Dashboard View — Hero "Command Center" with stat tiles (Total/Online/Offline) + Deploy New Server CTA
  4. Server Cards — operator-dossier style with status LED, vitals grid (Players/CPU/Uptime), angled clip-path, scanline hover effect
- **New design system** (`/app/design_guidelines.json`):
  - Fonts: Rajdhani (display/stencil) + IBM Plex Sans (body) + JetBrains Mono (data)
  - Default theme: **Blacksite** (gunmetal + olive-drab + tactical amber `#FF8C00`)
  - Themes: blacksite, bunker, ghost, wastelander
  - Zero rounded corners, sharp armor-plate panels, corner-brackets decoration, scanline overlays, grain texture
  - Buttons: `btn-primary` (amber clip-path), `btn-secondary`, `btn-ghost`, `btn-danger` (hazard stripes)
- **Configuration view** — breadcrumb + server-switcher dropdown, retains 8 section tabs for dense SCUM settings
- **Boot-terminal styled wizards** — Disk Selection + Admin Prompt with `cursor-blink`, boot-scan line, hazard stripes
- **Iframe preview fixed** — added `X-Frame-Options: ALLOWALL` + `Content-Security-Policy: frame-ancestors *` to craco devServer
- Files deleted: `Sidebar.jsx`, `EmptyWorkspace.jsx` (unused)
- Files created: `ServerCard.jsx`, `DashboardView.jsx`
- Testing: `iteration_6.json` — 100% frontend flows passed, 0 issues

## Prioritized Backlog
### P1
- Live WebSocket log tail viewer (Electron → WebSocket → Ops Logs view)
- SteamCMD real-time install progress streaming (~20GB download)
- Scheduled restart / auto-update timers

### P2
- Complete remaining SCUM tooltips in fieldMeta.js (~140/325 currently translated)
- Discord bot integration (announcements, player count)
- Automatic backup rotation with restore UI
- RCON console for live in-game commands
- Mod manager for Steam Workshop items
- Multi-language expansion (DE, RU)

## Next Tasks
1. Stream SteamCMD output to new "Ops Logs" view via WebSocket (currently placeholder)
2. Wire Electron IPC so disk listing prefers `window.lgss.listDisks` when available
3. Add scheduled restart & auto-update timers per server profile
