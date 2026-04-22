# SCUM Server Manager — PRD

## Original Problem Statement
Electron-based desktop server manager for SCUM game. On first launch: ask user to select a physical disk drive, show capacities, request Admin privileges. Create workspace `LGSSManagers/Servers/ServerN/`. Parse, manage, and save all official SCUM configuration files (ServerSettings.ini, EconomyOverride.json, etc.) into functional, easy-to-use categories.

**Stack:** React Frontend + FastAPI backend + Electron shell + SteamCMD integration.
**User language:** Turkish (TR) — always respond in TR.

## Architecture
```
/app/
├── backend/         FastAPI + scum_process + scum_parser + scum_logs + scum_db + scum_backup
├── frontend/        React SPA (ServerCard, LogsView, BackupsView, PlayersView, AutomationEditor)
├── electron/        Electron main + electron-builder (NSIS + GitHub publish)
└── scripts/         Logo/icon generation
```

## Implemented Features
- First-boot flow (drive selection, admin, workspace creation)
- Full `.ini` + JSON config persistence (UI → SCUM config files)
- Log parser (Chat w/ filters, Kills, Admin events, Vehicle destruction/lock)
- Player tracking via `SCUM.db` SQLite (Fame, Squads, Flags, Vehicles)
- UDP A2S_INFO polling for accurate Online detection
- Live Logs UI with auto-refresh
- Backup & Restore system (auto-backups, pre-restore safety snapshot)
  - Expected-stop tracking: admin Stop/Restart/Update no longer mis-labeled as crash
  - Crash auto-recovery: on next start after real crash, latest good backup is auto-restored
  - UI-configurable auto-save interval (`backup_interval_min`) + retention (`backup_keep_count`)
- Auto-Updater via `electron-updater` + GitHub Releases
- Custom rainbow grunge "S" logo
- Simplified NSIS installer (`perMachine`, desktop shortcut prompt)
- Bulk operations (start all / restart all / update all)
- ServerCard action buttons (Start/Stop, Restart, Update, Settings)

## Recent Changes
- **2026-02**: ServerCard update button tooltip simplified to "Güncelle" / "Update".
- **2026-02**: Fixed crash-backup false positives — admin-driven stops now tracked via `mark_expected_stop()`; scheduler skips crash snapshot and the `crash_recovery_pending` flag for these transitions.
- **2026-02**: Real crash → set `crash_recovery_pending=True` + capture crash ZIP. On next `start_server`, latest non-crash backup is auto-restored over SaveFiles.
- **2026-02**: Exposed backup settings in AutomationEditor (toggle, interval, keep-count). Backend defaults: enabled=true, 120min, keep=30.

## Backlog / Next Action Items
### P1 — Upcoming
- **Router Port Forwarding Wizard (UPnP)**: Auto-open `game_port` + `query_port`. Fixes "server not visible in in-game list".
- **Discord Bot Integration (RCON alternative)**: Discord commands + log piping.

### P2 — Future
- **"Load Preset" for Configs**: Custom templates vs SCUM Vanilla defaults.

### Refactoring
- `server.py` (~2100 lines) — split into `/app/backend/routes/` modules.

## Key API Endpoints
- `POST /api/servers/{id}/start` — auto-restores if `crash_recovery_pending`, then spawns EXE
- `POST /api/servers/{id}/stop` — marks expected-stop, kills process, sets Stopped
- `POST /api/servers/{id}/restart` — marks expected-stop, cycles status
- `POST /api/servers/{id}/update` — marks expected-stop, starts SteamCMD cycle
- `PUT /api/servers/{id}/automation` — now accepts `backup_enabled`, `backup_interval_min`, `backup_keep_count`
- `POST /api/servers/{id}/backups` — manual backup create
- `POST /api/servers/{id}/backups/{bid}/restore` — admin restore

## DB Schema
- `server_profiles`: adds `crash_recovery_pending: bool`, `last_crash_at: iso_str`
- `automation`: adds `backup_enabled`, `backup_interval_min`, `backup_keep_count`

## Critical Constraints
- Windows target — use `os.path.join`/`Path`, never hardcode `/` paths
- Server "Online" = EXE alive AND UDP A2S_INFO responds
- User communicates only in Turkish
- Auto-backup uses SQLite online-backup API → non-blocking, invisible to players
