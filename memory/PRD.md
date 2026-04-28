# SCUM Server Manager — PRD

## Original Problem Statement
Electron-based desktop server manager for SCUM game. On first launch: ask user to select a physical disk drive, show capacities, request Admin privileges. Create workspace `LGSSManagers/Servers/ServerN/`. Parse, manage, and save all official SCUM configuration files.

**Stack:** React + FastAPI + Electron + SteamCMD + Discord.py.
**User language:** Turkish (TR) — always respond in TR.

## Architecture
```
/app/
├── backend/
│   ├── server.py              FastAPI routes + scheduler
│   ├── scum_process.py        SCUMServer/SteamCMD + A2S_INFO + A2S_PLAYER
│   ├── scum_parser.py         INI/JSON parser
│   ├── scum_logs.py           log regex (chat/kill/admin/vehicle)
│   ├── scum_db.py             SCUM.db SQLite reader
│   ├── scum_backup.py         zip snapshot + restore
│   ├── scum_discord.py        Discord bot (discord.py 2.x)
│   └── tests/                 pytest regression suite
├── frontend/src/components/   React SPA (ServerCard, BackupsView, DiscordBotSettings, AutomationEditor, …)
├── electron/                  Electron main + electron-builder (NSIS + GitHub publish)
└── scripts/                   logo generation
```

## Implemented Features
- First-boot flow (drive select, admin, workspace)
- Full `.ini` + JSON config persistence
- Log parser (Chat, Kill, Admin, Vehicle destruction/lock/claim)
- Player tracking via SCUM.db SQLite
- UDP A2S_INFO polling for live Online detection
- **Live active-player count** on ServerCard (`N/M`) via A2S_INFO
- Auto-Save backup system with:
  - Admin-configurable interval + retention in **Backups page** UI
  - Non-blocking: SQLite online-backup API + `asyncio.to_thread`
  - Expected-stop tracking (admin Stop/Restart/Update never mis-labeled as crash)
  - Crash auto-recovery on next start (preferred: crash backup > auto > manual)
- **Discord integration (dedicated section)**:
  - Webhook Channels (existing) — 8 channel types
  - **Discord Bot** (new): token input, start/stop on toggle, live status
  - Bot presence: "X SCUM · Y oyuncu" every 30s (X = local manager servers)
  - `/online` slash command → player list per server via A2S_PLAYER
- Auto-Updater via `electron-updater` + GitHub Releases
- NSIS installer (perMachine, desktop shortcut prompt)
- Bulk ops (start/restart/stop all)
- Schema cleanup: removed `client` section + client_mouse/video/graphics/sound; moved `client_game` under `gameplay`

## Recent Changes
- **2026-02 (Custom launch args)**: New `launch_args` field on `ServerProfile` + `PUT /api/servers/{id}/launch-args` endpoint (max 2000 chars). `start_server` shlex-splits the string and appends tokens AFTER the manager's defaults so admin overrides win for duplicate flags. New `LaunchArgsPanel.jsx` injected into the Essentials → Performance category, sitting next to `NetworkPortsPanel`. Live "Tam Komut" preview shows the full SCUMServer.exe argv. Used for mod ids, custom Unreal flags, ini overrides. Verified: `-mod=2456789012 -CustomFlag=42 -ServerName="My Cool Server"` → 3 tokens, Windows subprocess re-quotes correctly.
- **2026-02 (Version 1.0.3)**: bumped version everywhere — `backend/server.py` (root + CURRENT_MANAGER_VERSION), `frontend/src/App.js`, `TopBar.jsx`, `ManagerUpdateModal.jsx`, `electron/main.js` splash, `electron/package.json`.
- **2026-02 (Activity Chart 24H/7G/30G)**: range buttons updated, TTL extended to 30 days with auto drop+recreate of stale index.
- **2026-02 (Server state self-heal)**: `get_metrics` self-probes A2S_INFO when running-but-not-ready.
- **2026-02 (Fame+Admin+Economy parser v2)**: multi-line fame, teleport events, full wallet flow (cash/bank/gold/conversion).
- **2026-02 (Backup)**: Expected-stop tracking via `mark_expected_stop()` in stop/restart/update/bulk/scheduled endpoints. Real crash sets `crash_recovery_pending` + captures crash ZIP. `start_server` auto-restores latest crash/auto/manual backup if flag set.
- **2026-02 (Iteration 11)**: Discord Bot integration (discord.py 2.x, scum_discord.py). New endpoints GET/PUT `/api/discord/bot` + `/api/discord/bot/status`. DiscordBotSettings.jsx component. Auto-backup UI moved from AutomationEditor → BackupsView (AutoSavePanel). Schema: `discord` section + `discord_webhooks` + `discord_bot` categories; `client` section removed; `gameplay_client_game` under `gameplay`. `get_metrics` now returns `players` + `max_players_live` from A2S_INFO. `a2s_player_query` added for Discord `/online` command.

## Backlog
### P1
- **Router Port Forwarding Wizard (UPnP)** — fixes "server not visible in in-game list".

### P2
- "Load Preset" for Configs (Vanilla/Max Loot/Custom Traders templates).

### Refactoring
- `server.py` (~2400 lines) — split into `/app/backend/routes/`.

## Key API Endpoints (Iteration 11)
- `GET /api/discord/bot` — returns `{enabled, token_set, token_preview, status}`
- `PUT /api/discord/bot` — body `{enabled?, token?}`, starts/stops bot
- `GET /api/discord/bot/status` — live status poll (used by UI every 5s)
- `PUT /api/servers/{id}/automation` — accepts `backup_enabled`, `backup_interval_min`, `backup_keep_count`
- `GET /api/servers/{id}/metrics` — now includes `players`, `max_players_live`

## DB Schema
- `setup.discord_bot`: `{enabled: bool, token: str}` (token never returned to client)
- `server_profiles`: `crash_recovery_pending`, `last_crash_at`
- `automation`: `backup_enabled`, `backup_interval_min`, `backup_keep_count`

## Critical Constraints
- Windows target — always `os.path.join`/`Path`
- Server "Online" = EXE alive AND UDP A2S_INFO responds
- Discord bot coexists on FastAPI's asyncio loop (no threads)
- State cache refresh tied to scheduler tick (10s) — bot queries cache, never hammers A2S per presence update
- User communicates only in Turkish
