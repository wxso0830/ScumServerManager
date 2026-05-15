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
- **2026-02 (v1.0.10 — real restart + pre-stop backup)**:
  1. **Auto-restart / Restart / Stop now actually controls the process**: Previously these endpoints only mutated the DB `status` field — the SCUMServer.exe was never killed/respawned. Refactored into three shared helpers in `server.py`:
     - `_do_pre_stop_backup(server_id, doc, backup_type)` — best-effort SaveFiles snapshot via `scum_backup.create_backup`. Never raises.
     - `_do_stop_internal(server_id, take_backup=True)` — takes backup → marks expected stop → calls `scum_proc.stop_server` in a thread → sets status=Stopped.
     - `_do_start_internal(server_id, doc)` — runs crash-recovery restore if flagged, then `scum_proc.start_server`. Falls back to simulated status on non-Windows preview.
  2. **Endpoints now using the helpers**: `POST /servers/{id}/start`, `POST /servers/{id}/stop`, `POST /servers/{id}/restart`, `POST /servers/{id}/update`, `POST /servers/bulk/stop-all`, `POST /servers/bulk/restart-all`. Every one of them takes a pre-stop backup before terminating the EXE.
  3. **Scheduler also fixed**: `_tick_scheduler` scheduled-restart block now calls `_do_stop_internal` + `_do_start_internal` (was just flipping status). Pending graceful-update block calls `_do_pre_stop_backup` + `_do_stop_internal` + SteamCMD `install_server(run_first_boot=False)` + `_do_start_internal`. Real Windows behavior: backup → kill EXE → SteamCMD delta update → respawn.
  4. **Tested**: 13/13 backend regression tests passed (iteration_13.json).
- **2026-02 (v1.0.9 — user-requested cleanup)**:
  1. **Discord Bot feature removed**: The bot (token input, slash commands, presence updates) was hidden from the UI. Only the **webhook** integration remains. `discord_bot` category removed from `/api/settings/schema`; `DiscordBotSettings` import & render case removed from `ServerDashboard.jsx`; auto-start on backend boot disabled. `scum_discord.py` + bot endpoints remain in code (used by tests) but are not surfaced anywhere.
  2. **Auto-restart / auto-update default messages removed**: The manager no longer auto-generates or auto-seeds default English warning messages ("The server will restart in N minutes" / "A new version of the game is available…"). Both `_generate_notifications_from_schedule()` (backend) and the `InlineKindNotifications` first-view auto-seed (frontend) now produce empty lists. Restart/Update SCHEDULING still fires at the configured times — admins who want pre-warning chat broadcasts add them manually via the Notifications editor. Also removed the now-useless "Generate Notifications" button.
  3. **Installer publisher metadata**: `electron-builder` config updated with `publisherName: "Legendary Gaming"`, `legalTrademarks`, and a structured `author` object (`name`/`email`/`url`). This sets the EXE's embedded Company Name (visible in right-click → Properties → Details). NOTE: Windows SmartScreen's "Yayımcı: Bilinmeyen yayıncı" warning is read from the Authenticode signature — removing it requires a paid code-signing certificate (OV ~$200/yr or EV ~$300/yr). Without signing the warning persists; once signed, the publisher will read "Legendary Gaming".
- **2026-02 (v1.0.8 — full i18n coverage)**:
  1. **`fieldMeta.js` deep translation completed**: All 217 SCUM setting labels + descriptions now have full translations for all 8 supported languages (EN, TR, RU, DE, FR, IT, AR, AZ). Previously only the first 9 entries had RU/DE/FR/IT/AR/AZ; remaining 208 fell back to English.
  2. **Translation pipeline**: Added `/app/scripts/translate_field_meta.py` — a re-usable batch translator that parses `fieldMeta.js`, sends untranslated entries to Claude/Gemini via Emergent LLM Key (configurable provider + model), caches progress per-batch to `.fieldmeta_cache.json` so partial failures don't lose work, then re-emits the JS file with 8 languages per entry. Used `gemini-2.5-flash` for the bulk run (Anthropic budget was exhausted mid-run; the cache + provider switch made resumption trivial).
- **2026-02 (v1.0.7 — admin UX polish)**:
  1. **Open Server Folder button**: New `FolderOpen` icon next to the server switcher in `ServerDashboard.jsx`. Calls new `POST /api/servers/{id}/open-folder` which spawns `explorer.exe "<path>"` (Windows), `open` (macOS), or `xdg-open` (Linux). Disabled when server has no `folder_path` yet.
  2. **Section header source-file badge moved**: `Collapsible.jsx` now renders the `server_settings` / `gameusersettings` source-file label on the **right side**, dimmed (opacity-50), hidden on mobile. Cleaner heading hierarchy — title left, optional metadata right.
  3. **Section title localization**: 9 main section titles (`sec_essentials`, `sec_gameplay`, etc.) + 4 key `cat_essentials_*` titles translated to all 6 new languages (RU/DE/FR/IT/AR/AZ).
  4. **Language picker scroll fix**: Popover wrapped with sticky header + `max-h-[420px] overflow-y-auto`, `min-w-[230px]` so all 8 languages always fit and scroll when overflowing.
  5. **Discord + Feedback TopBar buttons**: Two new icon buttons next to the reset-setup button. Discord opens `https://discord.gg/ZBzTRNbTy3`, Feedback opens `https://legendaryhub.vip/` in the default browser via `window.open`.
- **Version 1.0.6 → 1.0.7.**
- **2026-02 (v1.0.4 — multi-fix release)**:
  - Update notification spam (CRITICAL): defensive scheduler-tick cleanup of stale `_transient_update` rows; OFFSETS [15,10,5,4,3,2,1] → **[15,10,5]**.
  - Update button: real SteamCMD via `install_server(run_first_boot=False)`, `InstallProgressModal mode="update"`, 409 if running.
  - Default English + 6 new languages (RU/DE/FR/IT/AR with RTL/AZ).
  - User-supplied `icon.png` as TopBar logo.
- Versions auto-incremented per change: 1.0.3 → 1.0.4 → 1.0.5.
- **2026-02 (Backup)**: Expected-stop tracking via `mark_expected_stop()` in stop/restart/update/bulk/scheduled endpoints. Real crash sets `crash_recovery_pending` + captures crash ZIP. `start_server` auto-restores latest crash/auto/manual backup if flag set.
- **2026-02 (Iteration 11)**: Discord Bot integration (discord.py 2.x, scum_discord.py). New endpoints GET/PUT `/api/discord/bot` + `/api/discord/bot/status`. DiscordBotSettings.jsx component. Auto-backup UI moved from AutomationEditor → BackupsView (AutoSavePanel). Schema: `discord` section + `discord_webhooks` + `discord_bot` categories; `client` section removed; `gameplay_client_game` under `gameplay`. `get_metrics` now returns `players` + `max_players_live` from A2S_INFO. `a2s_player_query` added for Discord `/online` command.

## Backlog
### P1
- **Router Port Forwarding Wizard (UPnP)** — fixes "server not visible in in-game list".

### P2
- "Load Preset" for Configs (Vanilla/Max Loot/Custom Traders templates).
- Player Leaderboards (Top Richest / Most Active) using `scum_logs.py` parsers.

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
