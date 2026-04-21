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

### 2026-04-17 — Real Functionality + Visual Traders Editor
- **User demand: "not simulation, make it real"** — maximized real functionality within container constraints:
  1. **Real Steam update detection** — `GET /api/steam/check-update` makes a REAL HTTP call to `steamcommunity.com/games/513710/rss/` (SCUM game community feed, tries 513710 then 3792580) and derives `build-{unix_timestamp}` from the latest patchnote publication date. Falls back to `store.steampowered.com/api/appdetails` if RSS fails. `source` field in response documents the data origin (`steam-rss:513710` vs `mock`). Verified working: returns e.g. `"April patch announcement"` with timestamp-based build id.
  2. **Real config file writing** — `POST /api/servers/{id}/save-config?write_to_disk=true` now ACTUALLY writes 11 files to the filesystem via `pathlib.Path.write_text()`. Response includes `wrote_to_disk`, `written_count`, `written[]`, `errors[]`. Windows paths (containing `\` or drive letters) are deferred to Electron.
  3. **Real background scheduler** — asyncio task `_tick_scheduler` starts on FastAPI startup (30 s tick). Per server: if `automation.enabled` + `status==Running` + `hhmm in restart_times` → triggers Updating → Stopped → Running cycle. If `auto_update_enabled` + installed + interval elapsed → real Steam RSS check + sets `update_available=True`.
  4. **Manager-only field strip** — `render_economy_json` uses `_SCUM_TRADEABLE_FIELDS` whitelist to strip `image_url` (UI-only) from the written EconomyOverride.json so the game file stays clean.
- **NEW visual Traders Editor** (`/app/frontend/src/components/TradersEditor.jsx` — full rewrite):
  - Sectors bar (auto-parsed from trader names `{Sector}_{Subsector}_{Type}`) — A_0, B_4, C_2, Z_3
  - Trader type filter chips: Armory / BoatShop / Mechanic / Trader / Saloon / Hospital / Barber
  - 3-column grid: traders list | items list (with auto-detected category chips: Weapons/Armor/Ammo/Food/Medical/Building/Vehicle/Tool/Clothing/Other) | item detail panel
  - Per-item fields: tradeable-code, buy/sell/delta/fame, can-be-purchased, available-after-sale-only
  - **User-provided image URL** per item (`image_url`) — user can paste scum-global.com image URLs manually; preview renders in the item list + detail panel; the field is stripped before writing EconomyOverride.json so it doesn't pollute the game file
  - Search by tradeable-code, add/delete items, copy items from other traders
  - Uses real SCUM default data from `/app/backend/scum_defaults/EconomyOverride.json` (28 traders × ~16 items)
- Backend testing (`iteration_7.json`): **100% pass (10/10)**. Frontend verified end-to-end.

### Desktop-Only Operations (clearly scoped)

### 2026-04-18 — Install Gate + Power Buttons + Import Modal
User feedback: (1) settings access must be locked behind install, (2) add restart & bulk buttons, (3) replace scattered Export buttons with an import-focused workflow. Delivered:

- **Install gate**: `ServerCard` ⚙ disabled when `!server.installed` (35% opacity + `cursor: not-allowed`). `ServerDashboard` renders a dedicated `<InstallGate>` screen if opened for an uninstalled server. Configs server-switcher disables uninstalled entries with `· (not installed)` suffix. `App.handleNavigate('configs')` auto-picks first installed server or toasts 'Download Server Files First'.
- **Power buttons**:
  - New `POST /api/servers/{id}/restart` (Stop → Start cycle; 400 if not installed)
  - `POST /api/servers/bulk/stop-all` and `POST /api/servers/bulk/restart-all`
  - TopBar: START ALL + RESTART ALL + STOP ALL + UPDATE SERVERS (4 global actions). Stop All disabled when no server is Running.
  - Per-server RESTART button appears inline between Start and Stop when running.
- **Import / Export modal** (replaces scattered inline Export buttons):
  - New `POST /api/servers/{id}/import-bulk` (multipart) accepts N files + parallel comma-separated file_keys, validates each, returns per-row {ok, error} results, and merges all successful files into settings. Files not uploaded stay at current values. Shared `_apply_file_to_settings` helper reused by both single and bulk endpoints; all parsers now raise `ValueError` on bad input (captured per-row).
  - `IMPORT_FILE_KEYS` supports all 12 SCUM config files (ServerSettings, GameUserSettings, Economy, RaidTimes, Notifications, Input, Admins, ServerAdmins, Banned, Whitelisted, Exclusive, Silenced).
  - `ImportExportModal.jsx`: 12-row table with per-row file picker + per-row Export download + per-row colored status (Ready / OK / error with full backend message).
  - Old inline per-category Export buttons removed from `ServerDashboard`.
- **Testing**: `iteration_10.json` — **100% pass (13/13 backend + frontend)**, 0 issues, 0 regressions.

### 2026-04-18 — Players Registry (Online/All + Detail Modal)
User requested a player tracking system per server with Online/All tabs, first-seen/last-seen timestamps, flag count, vehicle count, and detail view with recent events. Delivered:

- **Backend aggregator** (no extra collection, computed on the fly from `server_events`):
  - `GET /servers/{id}/players?online=<bool>&search=<str>` — returns unique players with first_seen, last_seen, is_online (derived from last login event + action), total_events, kills, deaths, trade_amount, fame_delta, is_admin_invoker (ever executed admin command), by_type counts, flag_count=null, vehicle_count=null
  - `GET /servers/{id}/players/{steam_id}?limit=N` — single player summary + their last N events (as killer, victim, or actor)
  - `DELETE /servers/{id}/events` now also clears `server_players`
- **Frontend `PlayersView.jsx`** — new top-level nav tab PLAYERS (between Settings and Logs):
  - Header: server switcher + search (matches name or Steam ID) + refresh (auto-every 15 s)
  - Tabs: Online / All Players with live counts
  - Table: STATUS (LED + online/offline), PLAYER (name + Admin badge if ever ran admin command), STEAM ID, FIRST SEEN, LAST SEEN (absolute + relative), EVENTS, K/D, TRADE, FLAGS, VEHICLES
  - Click row → Detail modal with 8 stat tiles (First Seen, Last Seen, Events, K/D, Trade, Fame Change, Flags, Vehicles) + Recent Events timeline
  - Info strip at bottom clearly marks FLAGS / VEHICLES as requiring SCUM SaveFiles DB parsing (future roadmap) — reported as "—" not a misleading 0
- **Testing**: `iteration_9.json` — **100% pass (15/15 backend + frontend)**, 0 issues, 0 regressions.

### 2026-04-18 — RCON Alternative: Log Parser + Event Feed + Discord Webhooks
Research outcome: SCUM has no RCON/API. Community bots (Prisoner Bot, scum_discord_bot_os, Scummy, SCUM-bot) all implement the same pattern — **parse the server's log files** from `SCUM/Saved/SaveFiles/Logs/` (UTF-16 LE with BOM) and relay to Discord. Implemented this pattern natively in the manager:

**Backend — `/app/backend/scum_logs.py`** (new module):
- UTF-16 decoder with BOM handling
- Per-type parsers: `admin`, `chat`, `login`, `kill`, `economy`, `violation`, `fame`, `raid` + `generic` fallback
- Event schema: `{id, ts, type, server_id, source_file, player_name, steam_id, entity_id, + type-specific fields}`
- Deterministic event id (sha1 hash) — re-uploading the same log produces zero duplicates
- Validated against user's real logs (27 admin events, 3 economy events parsed correctly; before/after balance lines filtered)

**New API endpoints** (real, tested end-to-end with user's actual sample logs):
- `POST /api/servers/{id}/logs/import` (multipart) — upload a log file, parse, store, forward to Discord
- `POST /api/servers/{id}/logs/scan?limit=N` — walk the server's log folder on disk and ingest recent files
- `GET /api/servers/{id}/events?type=X&player=Y&limit=N&since=T` — paginated history
- `GET /api/servers/{id}/events/stats?days=N` — by-type counts + top-5 players (days=0 → all time)
- `DELETE /api/servers/{id}/events` — clear the feed
- `GET/PUT /api/servers/{id}/discord` — per-event-type webhook URLs (admin/chat/login/kill/economy/violation/fame/raid) + `mention_role_id` for violation pings
- `POST /api/servers/{id}/discord/test` — send a synthetic event to a webhook to verify it

**Frontend — new LogsView** (`/app/frontend/src/components/LogsView.jsx`):
- Header with server switcher + Upload / Scan / Refresh / Clear buttons
- Filter chips per event type (with live counts from stats endpoint)
- Player filter input (case-insensitive search)
- Color-coded event rows (Admin=amber, Chat=cyan, Login=green, Kill=red, Trade=yellow, Violation=red, Fame=purple)
- Auto-refresh every 10 s
- Top Players ribbon at bottom (most active over selected period)

**Frontend — new DiscordSettings** (`/app/frontend/src/components/DiscordSettings.jsx`):
- Located inside the Automation tab as a second collapsible panel
- 8 individual webhook URL inputs (emoji-prefixed for easy scanning)
- Test-send button per field (posts a realistic embed to the webhook)
- Save persists to MongoDB; Forward-on-ingest wired into log importer

**Legal/ethical notes**:
- Drone/headless-client approach (Prisoner Bot-style, Steam TOS grey area) NOT implemented — user's call to add later via an external "command executor" HTTP bridge
- Image URLs in Traders Editor remain user-sourced; manager does not scrape scum-global.com

**Testing**: `iteration_8.json` — **100% pass (15/15 backend + frontend)**, 0 issues, 0 regressions.

## Feb 2026 — Config Persistence Fix (First-Boot + Auto-Write)
**Problem reported by user (Turkish)**: SteamCMD downloads SCUM but `Saved/Config/WindowsServer/*.ini` files don't exist until the server has been booted once. All settings edited in the manager were only saved to MongoDB, never reaching actual `.ini` files on disk. Even when the "Save Config Files" button was clicked, the save was blocked on Windows paths.

**Fixes shipped**:
- `scum_process.first_boot()` — launches `SCUMServer.exe` hidden for up to 180s after a successful SteamCMD install, polls for `ServerSettings.ini` to appear, waits 5s extra so GameUserSettings/Economy also drop, then kills the tree (including stray `SCUMServer-Win64-Shipping.exe` / `CrashReportClient.exe` via `taskkill /F /T`).
- `install_server._runner` automatically chains: SteamCMD download → `first_boot` → phase `first_boot` exposed via `/install/progress` (users see a dedicated status tile in the InstallProgressModal).
- `scum_parser.parse_real_config_dir(folder_path)` parses the REAL generated files from `{folder}/SCUM/Saved/Config/WindowsServer/` back into the manager settings model. Missing sections fall back to bundled defaults.
- `install_server._on_complete` callback now merges real config values into the server's `settings` doc, preserving manager-only fields (`notifications`, `custom_ini`).
- `save_server_config` refactored — no longer blocks on Windows path separators; writes directly on both Windows (PyInstaller bundle) and Linux (dev preview).
- `update_server_settings` now auto-writes to disk after every DB update for installed servers. Every toggle/slider the user flips is immediately reflected in the `.ini` files SCUM reads.
- New endpoints: `POST /api/servers/{id}/first-boot`, `GET /api/servers/{id}/first-boot/result`.
- I18n: new `first_boot_*` and `install_phase_*` strings (TR + EN).
- InstallProgressModal shows localized phase names and a subtitle during first-boot generation.

**Verified in Linux preview (curl)**:
- `save-config` → 11/11 files written to `/tmp/LGSSManagers/Servers/Server1/SCUM/Saved/Config/WindowsServer/`
- `PUT /settings` with a new ServerName → value appears in `ServerSettings.ini` within 1s
- External change to `ServerSettings.ini` → `POST /first-boot` parses it back into DB settings

## Feb 2026 — Logs & Players Auto-Ingestion
**Problem reported by user (Turkish)**: Logs & Players views were empty. The correct log path is `{folder}/SCUM/Saved/SaveFiles/Logs/` (which the backend already knew), but `POST /servers/{id}/logs/scan` was hard-blocked when the folder path used Windows separators (same legacy anti-Windows guard as `save-config`). There was also no background scanner, so the user had to click "Scan Logs Folder" manually every time.

**Fixes shipped**:
- Removed the Windows-path guard in `scan_server_logs`; `pathlib.Path` handles both separator styles natively on Windows so the PyInstaller backend now ingests real SCUM logs directly.
- Scheduler loop: new `_auto_scan_logs(server_id, folder)` helper + 45s-interval per-server tick that parses the 10 most recent log files in the background, de-duplicates by event id, and forwards new events to Discord webhooks automatically. Runs the blocking filesystem walk in `asyncio.to_thread` so FastAPI stays responsive.
- This makes the Players view self-populating (it aggregates from `server_events`), no manual click required.

**Verified in Linux preview**:
- Manual `POST /logs/scan` on Windows-style path → parsed 4/2 files (chat + login) without the legacy error
- `/players` aggregation returned 2 unique players from those events
- Dropped a synthetic `kill_*.log` → waited 55s → scheduler log showed `Auto-scan: TestServer → 5 new events`, kill event appeared in `/events` without any manual trigger

## Prioritized Backlog

### Desktop-Only Operations (clearly scoped)
These require Electron + Windows because they spawn external binaries; in the web preview they fallback to a simulation of status toggling but real behavior requires Electron IPC (`window.lgss.*`):
- `installServer` → SteamCMD `app_update 3792580`
- `startServer` / `stopServer` → `SCUMServer.exe` child_process
- `updateServer` → SteamCMD update + post-update restart
- **Terminology softened** per user feedback (SCUM feel kept, military-sci-fi jargon removed):
  - Nav: "COMMAND CENTER" → "SERVERS", "CONFIGURATION" → "SETTINGS", "OPS LOGS" → "LOGS"
  - Hero: "FLEET STATUS: EMPTY" → "NO SERVERS YET", "DEPLOY NEW SERVER" → "ADD NEW SERVER"
  - Status: "TACTICAL MODE" removed, "NETWORK LIVE" → "ONLINE", "OPS READY" → "Ready"
  - Removed cursor-blink terminal effects & `BLACKSITE OPS` subtitle
- **Bug fixed: server delete** — `window.confirm()` is blocked inside iframe preview. Replaced with new `ConfirmModal.jsx` component (hazard-stripe Yes,Delete button).
- **NEW — Notifications.json generator** matching user's personal template:
  - `POST /api/servers/{id}/post-install` seeds an 8-entry TR+EN default after install (06:00/18:00 restarts with 15/10/5/4/3/2/1 min warnings + final "SEE YOU IN 1 MINUTE" message exactly like user's own config)
  - `POST /api/servers/{id}/automation/generate-notifications` regenerates from the user's custom schedule
  - Restart times, pre-warnings and final message duration all configurable per server
- **NEW — Automation section** (`/app/frontend/src/components/AutomationEditor.jsx`):
  - Auto-Restart toggle
  - Restart Times list with add/remove
  - Quick templates: "Every 6 Hours" / "Twice Daily (06:00/18:00)"
  - Pre-warning intervals (comma-separated), final message duration, bilingual toggle
  - Auto Update toggle with update-check interval (default 360 min = 6h per user preference)
  - Live preview of generated Notifications.json
- **NEW — Steam update detection** (mocked in preview, Electron wires to real SteamCMD `app_info_print 3792580`):
  - `GET /api/steam/check-update` returns latest build id and marks mismatched servers `update_available=True`
  - `POST /api/steam/publish-build` (admin/mock) to simulate a new Steam build
  - Server Cards + Settings update button **pulse amber** (`update-pulse` CSS keyframe) when `server.update_available`
  - "Check Now" button on dashboard and per-server automation panel
- New endpoints added to `api.js`: `updateAutomation`, `generateNotifications`, `postInstall`, `steamCheckUpdate`, `steamPublishBuild`
- Backend model extended: `ServerProfile.automation` + `installed_build_id` + `update_available`
- Backend & frontend tested end-to-end: install → post-install → 8 seeded notifications → automation update → regenerate → publish-build → update_available pulses ✅

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
