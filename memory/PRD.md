# SCUM Server Manager — PRD

## Original Problem Statement
Electron-based desktop server manager for SCUM game. On first launch: ask user to select a physical disk drive, show capacities, request Admin privileges. Create workspace `LGSSManagers/Servers/ServerN/`. Parse, manage, and save all official SCUM configuration files (ServerSettings.ini, EconomyOverride.json, etc.) into functional, easy-to-use categories.

**Stack:** React Frontend + FastAPI backend + Electron shell + SteamCMD integration.
**User language:** Turkish (TR) — always respond in TR.

## Architecture
```
/app/
├── backend/         FastAPI + scum_process + scum_parser + scum_logs + scum_db + scum_backup
├── frontend/        React SPA (ServerCard, LogsView, BackupsView, PlayersView)
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
- Auto-Updater via `electron-updater` + GitHub Releases
- Custom rainbow grunge "S" logo
- Simplified NSIS installer (`perMachine`, desktop shortcut prompt)
- Bulk operations (start all / restart all / update all)
- ServerCard action buttons (Start/Stop, Restart, Update, Settings)

## Recent Changes (Feb 2026)
- **2026-02**: ServerCard update button tooltip simplified to just "Güncelle" / "Update" (new i18n key `card_btn_update`).

## Backlog / Next Action Items
### P1 — Upcoming
- **Router Port Forwarding Wizard (UPnP)**: Auto-open `game_port` + `query_port` via UPnP. Fixes "server not visible in in-game list" issue.
- **Discord Bot Integration (RCON alternative)**: Manage server via Discord commands; pipe logs to Discord channels.

### P2 — Future
- **"Load Preset" for Configs**: Custom templates (Max Loot Economy, Custom Traders, etc.) vs SCUM Vanilla defaults.

### Refactoring
- `server.py` is ~2000 lines — split into `/app/backend/routes/` modules (backups, logs, servers, bulk).

## Tech Stack Notes
- Python built-ins: `sqlite3`, `socket` (A2S_INFO UDP), `zipfile`, `shutil`
- `electron-updater` with GitHub publish
- Background `_scheduler_tick()` every 10s: crash detection, log parse, auto-backup, player status

## Critical Constraints
- Windows target — use `os.path.join`/`Path`, never hardcode `/` paths
- Server "Online" = EXE alive AND UDP A2S_INFO responds
- User communicates only in Turkish
