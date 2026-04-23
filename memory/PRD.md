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
- **2026-02 (Fame multi-line parser)**: SCUM 1.x writes periodic fame awards as **multi-line blocks** (`--- separator ---` + `Player NAME(SID) was awarded N fame points in 10 minutes for a total of M` + per-category breakdown). Old single-line parser missed them entirely. Added `_extract_fame_awards()` text-level walker that detects blocks, parses the award line, captures full breakdown (`DistanceTraveledOnFoot`, `AnimalKill`, `GoldBankCardAcquired`, etc.) as a `breakdown` dict. Single-line legacy format still works via fallback.
- **2026-02 (Admin teleport events)**: `parse_admin_line` now recognizes two non-Command admin events: `Used map click teleport to player: 'SID:NAME(N)'` → `command=map_click_teleport, target_name=...`; `Target of TeleportTo: 'SID:NAME(N)'` → `command=teleport_target, admin_name=...` (the player who was force-teleported, with the admin who did it). Location X/Y/Z captured when present.
- **2026-02 (Economy parser v2)**: 6 distinct wallet-modifying patterns covered (`[Trade]` modern + legacy + Before/After snapshots, `[Bank]` purchase/deposit with fee extraction, `[Currency Conversion]`). Verified 19/19 events from real user log; final wallet aggregation: cash=0, account_balance=7978, gold=1.
- **2026-02 (Player Detail UX)**: 3 wallet cards (Nakit/Banka/Altın, negative = red), DD.MM.YYYY HH:MM dates, K/D shows ratio, total playtime.
- **2026-02 (Flag/Vehicle-lock tracking)**: SCUM does NOT log these — already polled from SCUM.db.
- **2026-02 (build.ps1 + requirements.txt fixes)**: auto-install deps, ASCII-only, removed `emergentintegrations`.
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
