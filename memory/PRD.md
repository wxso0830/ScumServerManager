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
- **2026-02 (v1.0.37 — Windows Firewall auto-wizard + server browser visibility fix)**:
  1. User report (TR): "Sunucum bazen in-game listede görünüyor, bazen kayboluyor" + ChatGPT-suggested firewall auto-config instead of forcing users to disable Defender.
  2. **Outbound firewall rules added** (`scum_process._firewall_rule_specs`): previously only inbound rules were created; SCUM dedicated server uses outbound UDP→hl2master.steampowered.com:27011 to advertise itself, and hosts with outbound-deny policies were getting silently delisted from the in-game browser every ~3 polls. Added `*-UDP-game-OUT`, `*-UDP-query-OUT`, `*-EXE-OUT` rules with `profile=any` (covers Public + Private + Domain — previously only the default domain/private was used).
  3. **New helpers in `scum_process.py`**: `apply_firewall_rules()`, `check_firewall_rules()` (read-only), `remove_firewall_rules()`, `check_master_server_reachable()` (UDP probe to Valve master), `is_process_elevated()`.
  4. **New API endpoints**: `GET /api/servers/{id}/firewall/status`, `POST /api/servers/{id}/firewall/apply`, `DELETE /api/servers/{id}/firewall`, `GET /api/servers/{id}/diagnostics/visibility` (combined firewall + A2S + Steam master report with structured `hints` for the UI).
  5. **`DELETE /api/servers/{id}`** now auto-cleans firewall rules so stale `LGSS-SCUM-*` rules don't clutter the admin's Defender console after a profile delete.
  6. **New UI: `NetworkSetupPanel.jsx`** — 5-item checklist (Auto Configure, Open Ports, Inbound, Outbound, Verify) embedded inside the existing `NetworkPortsPanel`. Buttons: "Otomatik Yapılandır" (apply), "Doğrula" (run visibility diagnostic), "Yenile", "Kuralları Sil". Surfaces `needs_admin` warning when netsh fails with access-denied.
  7. **New popup: `FirewallPromptModal`** — triggered immediately after `handleAddServer` if `firewallStatus` reports `ok: false` on Windows. Shows the rule plan ("UDP 7777-7779 + UDP 7778 + SCUMServer.exe, profile=any") and one-click applies.
  8. **Regression test**: `backend/tests/test_lgss_iteration14_firewall.py` — covers full create→status→apply→diagnose→delete cycle. Passes on Linux preview (asserts `non-windows` fallback shape).
  9. Version bump to **v1.0.37** in `server.py`, `electron/package.json`, `TopBar.jsx`, and `App.js` defaults.

- **2026-02 (v1.0.37f — Firewall automation FULLY REMOVED per user request)**:
  1. User report (TR): Sunucu açılıyor ama IP ile bağlanamıyor + listede eski port (7780) görünüyor. Firewall otomasyonu artık daha çok kafa karışıklığı çıkarıyor — kullanıcı vazgeçti, **"awq cokta sıkımde, kapatsınlar"** dedi.
  2. **Backend removed**: All four firewall endpoints (`/firewall/status`, `/firewall/apply`, `/firewall/remove`, `/diagnostics/visibility`) deleted from `server.py`. The `_ensure_firewall_rules()` call removed from `start_server()` in `scum_process.py`. Server-delete also no longer touches netsh. The helper functions in `scum_process.py` are kept (dead code, harmless) so any future re-enablement is a one-line restore.
  3. **Frontend removed**: `NetworkSetupPanel.jsx` deleted, `FirewallPromptModal` deleted from App.js, post-server-create popup trigger removed, `firewallStatus/Apply/Remove/visibilityDiagnostic` removed from `lib/api.js`.
  4. **Cleanup**: `tests/test_lgss_iteration14_firewall.py` deleted.
  5. Launch args still minimal (`-port=N -log -NoVerifyGC -nocrashreports -nosound` + admin extra_args).
  6. Users now manage Windows Firewall manually (one-time GUI click). Steam server-list cache lag (~5 min) is a Steam-side issue and not in scope.

- **2026-02 (v1.0.37e — CRITICAL: Server invisible in Steam browser — launch args overshare fix)**:
  1. User report (TR): "Manuel `SCUMServer.exe -port 7777 -log` ile sunucu listede görünüyor ama Manager'dan başlatınca görünmüyor."
  2. **Root cause**: We were passing `-SteamServerPort=query_port` (e.g. 7778) on the command line. But SCUM's actual connect port is `game_port+2` (7779), not the query port. Forcing Steam to advertise on 7778 made the master server's periodic health check fail → server gets delisted every ~30s. Bonus damage: `-QueryPort`, `-MULTIHOME=0.0.0.0` and `-MaxPlayers` were explicit on argv, fighting with the values in `ServerSettings.ini` (the in-game settings menu writes there).
  3. **Fix**: Stripped launch args down to the documented SCUM minimum — `-log -NoVerifyGC -nocrashreports -nosound -port=N`. Engine auto-derives Query=N+1 and Steam=N+2, binds on all interfaces by default, and reads MaxPlayers from `ServerSettings.ini`. Now matches the user's manual launch byte-for-byte.
  4. **Visibility diagnostic — Steam Master false positive removed**: `hl2master.steampowered.com` is the legacy Source/Goldsrc master, deprecated for modern Steamworks. The hostname doesn't resolve on many networks (the user saw `[Errno 11001] getaddrinfo failed`) even when the server IS visible in the in-game browser. The check is now informational only — rendered gray instead of red, removed from `hints`, and excluded from the `verifiedOk` calculation in `NetworkSetupPanel`. Documented with a comment block so we don't accidentally re-enable it.
  5. UI `<DiagBox>` gained an `informational` prop for soft-failure visualisation.

- **2026-02 (v1.0.37d — Frontend: 503 MONGO_OFFLINE soft fallback)**:
  1. User report (TR): backend 503'leri doğru dönüyor ama frontend hâlâ "Uncaught runtime errors" overlay'i gösteriyor çünkü `App.js` içindeki `Promise.all` 503'leri yakalamıyordu.
  2. **Fix**: `load()` artık her endpoint çağrısını `safe(promise, fallback)` helper'ı ile sarıyor. Bir endpoint 503/MONGO_OFFLINE dönerse `setDbOffline(true)` çağrılıyor, Promise.all sağlam çalışıyor.
  3. **New component `<DbOfflineBanner>`** — `TopBar`'ın hemen altında sticky sarı uyarı bandı (`services.msc` / `net start MongoDB` talimatı + Retry butonu). Retry tıklayınca `load()` yeniden çalışır ve mongod açılmışsa banner kaybolur.
  4. `setupRes` null gelirse phase'i workspace'e oturtuyor, böylece banner kullanıcıya ilk görünen şey oluyor.

- **2026-02 (v1.0.37c — CRITICAL: P0 CORS + MongoDB-offline 500 fix)**:
  1. User screenshot (TR): `localhost:3000` → `127.0.0.1:8001` showed "Access to XMLHttpRequest blocked by CORS policy: No 'Access-Control-Allow-Origin' header is present" plus Uncaught Network Errors on every initial load.
  2. **Root cause #1 (CORS)**: `allow_credentials=True` combined with `allow_origins=["*"]` is forbidden by the CORS spec — Starlette silently DROPS the `Access-Control-Allow-Origin` response header in that combo. The default `CORS_ORIGINS=*` matched this footgun exactly.
  3. **Root cause #2 (500 on exceptions)**: When MongoDB is offline, every API call raised `pymongo.errors.ServerSelectionTimeoutError` (after the 3s `serverSelectionTimeoutMS`), bubbled up through FastAPI's default 500 handler — which does NOT pass back through the CORSMiddleware, so the browser saw a raw 500 with no CORS headers and reported "Network Error" instead of the actual problem.
  4. **Fix #1 — Spec-compliant CORS**: When `CORS_ORIGINS` is `*` or unset, we now use `allow_origin_regex=".*"` (compatible with `credentials=True`). When the admin sets a comma-list, we honour it as an explicit allowlist. Headers `vary: Origin` + `access-control-allow-origin: <echoed>` + `access-control-allow-credentials: true` verified via curl.
  5. **Fix #2 — Global exception handler with manual CORS**: New `@app.exception_handler(Exception)` catches `ServerSelectionTimeoutError`/`ConnectionFailure`/`AutoReconnect`/`NetworkTimeout` and returns a clean `503 MONGO_OFFLINE` JSON. Because Starlette's `ServerErrorMiddleware` sits OUTSIDE `CORSMiddleware`, we attach the CORS headers manually inside the handler (echoes back the request's `Origin`). Other exceptions fall through to 500 + tracebacks logged but still get CORS headers so the UI can surface them.
  6. Verified with `TestClient` + bogus `MONGO_URL=mongodb://192.0.2.1`: `Status: 503`, `access-control-allow-origin: http://localhost:3000`, `code: MONGO_OFFLINE`, body explains how to fix.
  7. Bonus: Electron splash screen hardcoded `v1.0.7` swapped to `v${app.getVersion()}` so it auto-syncs with `electron/package.json`.

- **2026-02 (v1.0.37b — i18n: Network Setup / Firewall panel default English)**:
  1. User report (TR): "server network port + firewall automation default ingilizce yap ve dil dosyasında yer ver."
  2. Replaced every hardcoded Turkish string in `NetworkSetupPanel.jsx` and `FirewallPromptModal` (App.js) with `t("...")` calls. Added ~50 new keys (`netsetup_*`, `fwprompt_*`) with English as primary and Turkish translations preserved.
  3. Also fixed the lingering "OYUNCU BAĞLANTI ADRESİ" hint in `NetworkPortsPanel.jsx` (now `ports_player_address` + 4 hint keys).
  4. Other locales (ru/de/fr/it/ar/az) fall back to English via the existing `t()` fallback chain.
  5. **RCON integration question** (SCUM-RCON UE4SS mod): Answered YES, feasible but parked in backlog. Mod license forbids redistributing the bundle — any future implementation will be an in-app Source RCON client + install wizard pointing to Nexus.

- **2026-02 (v1.0.36 — CRITICAL: backend never blocks on MongoDB startup)**:
  1. User report: Electron stuck on "Loading…" forever on Windows because uvicorn's startup hook ran 3 sequential MongoDB migrations × 30s default timeout = 90+s of blocking, during which port 8001 didn't accept any HTTP connection → frontend got `ERR_CONNECTION_REFUSED`.
  2. **MongoDB timeout**: `AsyncIOMotorClient(..., serverSelectionTimeoutMS=3000)` — every DB call now errors out in 3s instead of 30s.
  3. **Startup is now non-blocking**: All migrations moved into a fire-and-forget `_run_startup_migrations()` background task. Uvicorn reaches "Application startup complete" instantly; HTTP server accepts requests on tick 0.
  4. **MongoDB-down resilience verified**: Backend started with bogus `MONGO_URL=mongodb://192.0.2.1` → `GET /api/` still returned 200 OK in 0.00s.
  5. **Fixed `\L` SyntaxWarning** in `open_server_folder` docstring (used `r"""..."""` raw string).

- **2026-02 (v1.0.35 — Globalization folder relocated to Manager install dir)**:
  1. User pointed out: `Globalization/` belongs **next to the Manager .exe** (e.g. `C:\Program Files\LGSS\LGSS Manager\Globalization\`), NOT inside the SCUM-server workspace (`C:\LGSSManagers\Servers\`). The workspace is for game-server files only.
  2. **Electron** now creates `<install_dir>/Globalization/` on first boot (via `process.resourcesPath`'s parent), drops a README.txt explaining the workflow, and exports `LGSS_GLOBALIZATION_DIR` to the spawned backend.
  3. **Backend** `_get_globalization_dir()` simplified — only honours the env var (production) or `<ROOT_DIR>/Globalization` (dev fallback). Removed the wrong `<manager_path>/Globalization` branch.
  4. **Setup endpoint** no longer creates a `Globalization/` folder inside the workspace. The README that was being written there (incorrectly) is no longer created.
  5. Verified: `/api/i18n/custom` still resolves correctly, custom `pl.xaml` still discoverable.

- **2026-02 (v1.0.34 — CRITICAL: real CTRL_C save + Steam server visibility fixes)**:
  1. **CTRL_BREAK → CTRL_C switch**: User reported world rollbacks after restart. Root cause: SCUM's console handler treats `CTRL_BREAK_EVENT` as **"NO-SAVE force exit"** (literally prints "NO-SAVE" in cyan in the console) and reserves `CTRL_C_EVENT` for the proper save-and-exit path. v1.0.33 was sending CTRL_BREAK — every restart was effectively a kill.
  2. **`_send_real_ctrl_c(pid)`**: New helper uses the canonical Windows technique — `SetConsoleCtrlHandler(None, True)` → `FreeConsole()` → `AttachConsole(scum_pid)` → `GenerateConsoleCtrlEvent(CTRL_C_EVENT, 0)` → `FreeConsole()` → `AttachConsole(ATTACH_PARENT_PROCESS)` → `SetConsoleCtrlHandler(None, False)`. Identical to what ARK Server Manager / RuntPM use for cross-console CTRL+C delivery. Falls back to cross-group broadcast if AttachConsole fails.
  3. `_send_ctrl_break` retained as a thin alias for legacy call sites.
  4. **Server visibility in Steam browser**: Added 3 critical launch args that were missing:
     - `-SteamServerPort={query_port}` — some Unreal builds register with steamcommunity.com via this port (not -QueryPort) so server appeared at port 0 in master.
     - `-MULTIHOME=0.0.0.0` — bind on ALL interfaces. Multiple-NIC Windows hosts (VPN/Hyper-V virtual adapters) were silently binding to the wrong interface and being unreachable from WAN.
     - Reaffirmed `-QueryPort={query_port}` is explicitly set (not relied on as default).

- **2026-02 (v1.0.33 — Globalization drop-in folder for live language testing)**:
  1. New endpoint `GET /api/i18n/custom` scans `<manager_path>/Globalization/*.xaml`, parses each file (regex-based, BOM-tolerant), and returns `{ lang: { meta, strings } }`. Auto-strips `Generic_*` meta keys and surfaces translator + date in the meta block.
  2. Setup endpoint auto-creates the `Globalization/` folder + a README.txt explaining the workflow when the admin sets `manager_path`.
  3. `I18nProvider`:
     - On boot, fetches `/api/i18n/custom` and merges the result into the in-memory `translations` + `LANG_META` dicts.
     - Brand-new languages (not in the built-in 8) get auto-registered with their ISO code as display label.
     - Existing languages get their credits overwritten by the .xaml's `Generic_TranslatedBy` / `Generic_TranslationDate` for instant visible attribution.
     - Exposes `reloadCustom()` + `globalizationDir` via context.
  4. Language modal footer adds a **DROP-IN FOLDER** section showing the absolute path (selectable, copyable) and a **RELOAD LANGUAGES** button (animated spin while fetching).
  5. End-to-end verified with a Polish test file: dropped `pl.xaml` into `/app/Globalization/`, hit Reload, picker showed "PL · Marek Kowalski · 2026-03-22" instantly with no rebuild.
  6. Added `LGSS_GLOBALIZATION_DIR` env override for testing.

- **2026-02 (v1.0.32 — Language modal: emoji flags removed)**:
  1. User reported that emoji flags didn't render on Windows (fell back to `GB`, `SA`, etc. country codes). Removed flag column entirely.
  2. The 2-letter language code on the left is now rendered in the **accent (orange) color** so it still works as a strong visual anchor.
  3. Cleaner, OS-independent layout: `[ACCENT_CODE]  Language Name / translator · date`.

- **2026-02 (v1.0.31 — XAML now includes ALL text sources: UI + 215 SCUM settings)**:
  1. Discovered that `en.xaml` v1.0.30 was missing ~430 strings from `/app/frontend/src/lib/fieldMeta.js` (215 SCUM settings × {label, desc}).
  2. New helper `flattenFieldMeta(FIELD_META, lang)` in `utils/xamlExporter.js` flattens the nested per-field meta into `field.<scum.Key>.label` / `field.<scum.Key>.desc` rows.
  3. TopBar merges `translations[lang]` ∪ `flattenFieldMeta(FIELD_META, lang)` before download. The contributor now sees every SCUM tooltip alongside every UI string in a single file.
  4. Verified browser-side: real downloaded `en.xaml` = **92 KB, 1024 `<sys:String>` entries** (591 UI + 430 SCUM field labels/descs + 3 Generic meta).

- **2026-02 (v1.0.30 — Translator credits in Language modal + editable XAML metadata)**:
  1. `LANG_META` gained two new fields per language: `translator` (name/team) and `date` (YYYY-MM-DD).
  2. **Language modal widened** (320px → 460px) and now shows a small monospace subtitle under each language label: *"Gemini 2.5 · 2026-02-10"*.
  3. **XAML exporter** writes the credit fields as TWO editable `<sys:String>` keys at the top of the file:
     - `Generic_TranslatedBy`  — translator's name / handle / team
     - `Generic_TranslationDate` — submission date (defaults to today UTC)
  4. A highlighted comment block above those keys instructs contributors: *"edit these two lines to take credit"*. When LGSS receives the translated `.xaml`, the new credits get baked into `LANG_META` and appear permanently in the modal as a thank-you.

- **2026-02 (v1.0.29 — XAML translation export for community contributors)**:
  1. New utility `src/utils/xamlExporter.js` builds **WPF GlobalizationResourceDictionary XAML** files (same format ARK Server Manager uses) from any in-memory language dict.
  2. Output is UTF-8 BOM + alphabetically sorted `<sys:String x:Key="…">…</sys:String>` rows with full XML escaping (`& < > " '`).
  3. Two new buttons in the Language modal under a **"Community Translations"** section:
     - **EN · TEMPLATE** → downloads `en.xaml` (the master translation source)
     - **EN · CURRENT** (or whatever lang is selected) → downloads the currently active language's `.xaml`
  4. Workflow: contributor downloads `en.xaml` → translates each `<sys:String>` body → renames to e.g. `fr.xaml` → sends back to LGSS for inclusion in the next release.
  5. Exported `translations` object from I18nProvider so the exporter and any future runtime-override system can reach the data.

- **2026-02 (v1.0.28 — Discord webhooks: auto-restart + auto-update lifecycle hooks)**:
  1. Two new webhook channels added to `DiscordWebhookConfig`: `auto_restart` and `auto_update`.
  2. Scheduler fires `_notify_lifecycle()` at 4 key moments — restart start/end and update detect/start/end/fail — with rich embed messages including server name, slot time, new vs installed build id, and success/failure status.
  3. Distinct embed colors so admins can spot lifecycle events at a glance: 🔄 cyan for restarts, ⬇ blue for updates.
  4. Frontend: two new fields added to Discord Settings panel (after Raid, before Mention Role ID). Each has a SEND TEST button.
  5. The `/discord/test` endpoint accepts the new event types and builds proper embeds.

- **2026-02 (v1.0.27 — BETA / Community Settings tab)**:
  1. New **"BETA · Community"** sub-tab under the Advanced section. Hosts community-reported / undocumented SCUM keys (vehicle parts damage, engine damage, collision damage, loot respawn time, animal respawn time, item durability, god-mode-for-admins, allow-flying-for-admins) as toggleable rows with descriptions.
  2. Big red **"⚠ BETA / UNVERIFIED SETTINGS"** warning banner explicitly states: *not in official docs, LGSS will validate on real servers, invalid ones will be removed in a future release.*
  3. Admins can also add their own ad-hoc `scum.YourCustomKey` rows in the **Custom Keys** panel below the catalog.
  4. **`render_server_settings_ini()`** now appends a `[ScumBeta]` section (with a `# === BETA / community settings ===` comment header) for any *enabled* beta keys. Disabled keys are dropped so admins can stage values without committing.
  5. Backend test verified: `enabled=true` → written; `enabled=false` → skipped.

- **2026-02 (v1.0.26 — Player modal: Copy SteamID + 5/page pagination + Quick Actions)**:
  1. **Copy Steam ID button** next to the player's ID in the detail modal (clipboard write + Copied feedback).
  2. **Recent Events pagination**: 5 events per page with `< 1/N >` controls so long histories no longer require scrolling the whole modal.
  3. **Quick Actions toolbar** under the header: one-click "Make Admin / Server Admin / Add Whitelist / Add Exclusive / Ban / Silence". Each opens an in-modal confirmation overlay (CANCEL / YES, CONFIRM) before writing the steam_id to the corresponding `users_*` list via `PUT /api/servers/{id}/settings`. Already-listed players short-circuit with a toast.
  4. Bump → v1.0.26.

- **2026-02 (v1.0.25 — Users tab simplified, AdminUsers.ini auto [godmode])**:
  1. **FLAGS column REMOVED** from all User-list editors (Administrators, Server Admins, Whitelist, Exclusive, Banned, Silenced). Admins now enter ONLY Steam ID + optional note.
  2. **`render_user_list(entries, force_flag=None)`** centralises flag policy. Backend wiring:
     * `AdminUsers.ini` → `force_flag="godmode"` — every line written as `<sid>[godmode]` so SCUM grants admin privileges automatically (admins can't forget the flag).
     * `ServerSettingsAdminUsers.ini`, `BannedUsers.ini`, `WhitelistedUsers.ini`, `ExclusiveUsers.ini`, `SilencedUsers.ini` → `force_flag=""` — bracket stripped; bare 17-digit ID per line (SCUM rejects flags on these files).
  3. **Inline hints** added to every user tab explaining the file's purpose. The Banned hint explicitly warns: *"admins / server-admins usually bypass bans"* so admins know to remove a steam_id from admin lists too if a ban isn't taking effect.
  4. Bump → v1.0.25.

- **2026-02 (v1.0.24 — build version fix + Update-Notifications removed + graceful shutdown)**:
  1. **Build version parsing FIXED**: `installed_build_id` and `latest_build_id` now use the real SCUM in-game version (e.g. `1.2.3.2.115523`) extracted from Steam patchnote RSS titles, not the meaningless `build-<epoch>` timestamp that used to make every server look "out of date" forever.
  2. **Startup migration**: any legacy `build-<digits>` token in `installed_build_id` is rewritten to the latest known SCUM version on backend boot.
  3. **`_fetch_latest_scum_version()` helper** centralises RSS parsing; consumed by `/api/steam/check-update`, the auto-update scheduler, and the install/update `_on_complete` callbacks.
  4. **"Update Notifications" inline panel REMOVED** from the Update Monitor tab (per user request — admins manage chat broadcasts only for restarts; graceful update flow handles its own 15-min lead silently).
  5. **Graceful Shutdown (CTRL_BREAK_EVENT)** with configurable `automation.shutdown_timeout_sec` (default 30, 0 = INSTANT KILL).
  6. **Update-All button REMOVED** from Dashboard; per-server Update icon changed `ChevronsUp` → `ArrowDownToLine`.

- **2026-02 (v1.0.23 — correct 3-port SCUM model)**:
  1. **Reversal of v1.0.22's wrong "4-port" thinking**: SCUM actually uses **3 consecutive ports**: `game/query/steam = port/+1/+2`. Players connect on the **Steam port** (game_port + 2), NOT on game_port itself. v1.0.22 mistakenly tried to push query OUTSIDE the range thinking 4 ports were involved — that was incorrect.
  2. **NetworkPortsPanel redesigned again**: now shows the proper 3-row layout:
     - **GAME PORT** (editable, MAIN badge) — `-port` flag
     - **QUERY PORT** (editable, auto-follows game+1, green "auto: GAME +1" badge) — `-QueryPort` flag, Steam A2S
     - **STEAM PORT** (read-only computed game+2, accent border + pulsing ★ CONNECT badge) — the actual port players paste in Direct Connect
  3. **Backend defaults reverted**: `query_port = game_port + 1` (back to SCUM standard). Pydantic default `query_port: int = 7778`.
  4. **Migration on startup**: reverses any v1.0.22 `+3` shift by finding not-yet-installed servers with `query_port == game_port + 3` and moving them back to `game_port + 1`. Logged: `v1.0.23 query-port reversal: shifted N`.
  5. **Player connect IP hint updated**: now says `PUBLIC_IP:{game_port+2}` (Steam port), explicitly calling out "game_port değil!" so admins don't share the wrong port.
  6. **Multi-server convention reminder** in the UI: bump game_port by 3 each (S1 7777-7779, S2 7780-7782, S3 7783-7785).
- **2026-02 (v1.0.22 — 4-port layout (1 query + 3 game) + always-on custom args)**:
  1. **Network Ports panel redesigned**: PingPerfect-style stacked rows showing the full 4-port layout per server:
     - **Row 1 — QUERY PORT** (editable, 1 port, isolated for Steam A2S_INFO; green badge "Steam Browser")
     - **Row 2 — GAME PORT** (editable start of range + 2 read-only `+1` and `+2` badges; the `+2` is highlighted in accent color as the actual CONNECT port; orange badge "CONNECT → {port+2}")
  2. **Defaults shifted**: new servers get `game_port = 7777` (range 7777-7779), `query_port = 7780` (game_port + 3, OUTSIDE the range). Previous default `query = game + 1` placed query inside the 3-port game range — a known PingPerfect anti-pattern. Backend pydantic default + ports endpoint auto-derive updated.
  3. **Migration on startup**: every NOT-YET-INSTALLED server whose `query_port == game_port + 1` is shifted to `game_port + 3` automatically. Installed/configured servers are left alone (admin already committed to a layout). Logged: `v1.0.22 query-port migration: shifted N`.
  4. **Overlap warning**: if admin manually sets `query_port` inside the `game_port..game_port+2` range, the UI shows an orange warning chip with the suggested fix (e.g. `7780` or `27015`).
  5. **"Custom Launch Options" textarea is now always visible** at the bottom of the Launch Options category (was hidden in a collapsible). Highlighted with accent border + accent label so admins immediately see where to add mod IDs / custom Unreal flags.
- **2026-02 (v1.0.21 — Query port editable + new Launch Options category)**:
  1. **Query port is now editable** (NetworkPortsPanel + backend): previously locked to `game_port + 1`. Admins can now set independent values (e.g. PingPerfect-style `game_port=11582, query_port=11442`). Convenience: when admin changes game_port AND query is still at the old "+1", query auto-shifts so casual users don't break the convention.
  2. **Auto-firewall now opens all ports on save/start** (already in v1.0.20): UDP `game_port..game_port+2` + UDP/TCP `query_port` + EXE-wide allow. Idempotent.
  3. **New "Launch Options" category** (`essentials_launch_args`) inserted between Performance and Wipe — replaces the inline textarea on Performance. ARK Server Manager-style **grouped checkboxes** for SCUM/Unreal flags:
     - **Performance**: `-USEALLAVAILABLECORES`, `-norhithread`, `-nosteam`, `-NoVerifyGC`, `-nocrashreports`, `-nosound`
     - **Logging**: `-log`, `-stdout`, `-VERBOSE`, `-FORCELOGFLUSH`
     - **Anti-Cheat**: `-NOBATTLEYE`, `-noeac`, `-Insecure`
     - **Network**: `-MULTIHOME=0.0.0.0`, `-NetServerMaxTickRate=30`
     - **Memory**: `-ONETHREAD`, `-AllowSoftwareRendering`
     - Each row: friendly label, technical description, raw flag preview.
     - "Default" badge on safe-by-default flags (recommended).
     - Collapsible "Advanced (Manual Extra Flags)" textarea for power users / mod IDs.
     - Live command-line preview: `SCUMServer.exe -port=X -QueryPort=Y -MaxPlayers=Z <selected flags>`.
     - Serialization: parses existing `launch_args` string into preset checkboxes + leftover extras; saves back as a single CLI string (no schema change needed).
  4. Translations for `cat_essentials_launch_args` added in all 8 languages (TR, EN, RU, DE, FR, IT, AR, AZ).
- **2026-02 (v1.0.20 — SCUM 3-port range + auto-firewall)**:
  1. **Server invisible in Steam browser** (P0 - reported by admin): SCUM dedicated server actually listens on **THREE consecutive UDP ports** starting at `game_port` (game_port, +1, +2), and players connect via `game_port + 2`. The manager was only opening Windows Firewall rules for `game_port` and `query_port`, so `game_port+1` and `game_port+2` were silently dropped by Windows Defender → server didn't appear in the in-game browser even though it was running and responding to A2S query.
  2. **`_ensure_firewall_rules()` helper** added to `scum_process.py`. Runs on every `start_server()` (idempotent — deletes by name first, then re-adds). Creates 5 rules per server:
     - UDP inbound, port range `game_port..game_port+2`
     - TCP inbound, same range (Steam P2P fallback)
     - UDP inbound, `query_port` (single port for A2S)
     - TCP inbound, `query_port`
     - Program-wide allow rule for `SCUMServer.exe` (catches dynamic Steam P2P ports)
  3. All netsh calls use `creationflags=CREATE_NO_WINDOW` so the user doesn't see cmd flashes, and errors are swallowed (a no-admin / restricted environment still boots; user will just see the standard Windows "Allow access" popup as before).
  4. **NetworkPortsPanel UI** now shows the explicit 3-port range + the actual connect port (`game_port + 2`) so admins know exactly what to forward on their router. Backend `PUT /servers/{id}/ports` validation tightened to `game_port` ≤ 65532 (so port+2 stays ≤ 65534).
- **2026-02 (v1.0.19 — Chrome-style settings UI + per-server version pill)**:
  1. **Settings layout completely redesigned**: Each section's categories (Server Name, Performance, Backup, etc.) used to render as a vertical stack of collapsible accordions — bulky and required lots of scrolling. Now they're rendered as a horizontal **Chrome-style tab strip** that visually merges with the active content panel below (rounded top corners, no bottom border on active tab, accent shadow). Clicking a category tab swaps the panel content with a soft fadeIn animation. Files: `ServerDashboard.jsx` (removed `Collapsible`, added `activeCategory` state + tab strip + merged content panel), `DynamicFields.jsx` (form grid bumped to `xl:grid-cols-3` for dense gameplay/world categories).
  2. **SCUM version pill on each server card** (P1): A small pill next to the server name shows the installed SCUM build (`SCUM 1778863625` etc.). Color = **green** if `update_available=false` (in sync with the latest released build), **red** if `update_available=true` (admin should hit UPDATE). Backend already had `installed_build_id` + `update_available` fields; just surfaced them visually. Files: `ServerCard.jsx`.
  3. **fadeIn keyframe** added to `index.css` for the panel transition.
- **2026-02 (v1.0.18 — multi-fix release)**:
  1. **SteamCMD auto-retry** (P0 — was breaking updates for everyone): `install_server()` now retries SteamCMD up to 3 times when it exits non-zero (e.g. `code 8` / `state 0x6 after update job`), wiping the stale `appmanifest_<appid>.acf` between tries. This was preventing updates on every server installed by manager <=1.0.12.
  2. **Player-count fallback via login log**: When A2S_INFO is blocked by Windows Firewall, `get_metrics()` now tails `Saved/SaveFiles/Logs/login_*.log` (and `Saved/Logs/login_*.log`), tracks (joined − left) per steam_id over the last ~4 log files, and returns the resulting online count. UI no longer shows "0/64" while players are actively in.
  3. **Stale auto-notification cleanup**: Scheduler tick now also strips legacy "The server will restart in N minutes." / "A new version of the game is available…" auto-generated notification entries from servers installed by manager <=1.0.8 (which used to seed them). Stale entries detected by message text patterns + `_lgss_auto`/`_transient_update` flags. Cleared from DB + rewritten to `Notifications.json` on disk.
  4. **Query port auto-derive (read-only)**: `query_port = game_port + 1` is now enforced both in the UI (input field disabled, derived from game port live) AND in the backend `PUT /servers/{id}/ports` endpoint (rejects standalone `query_port` updates). Max game port range tightened to 1024-65534 (so query+1 stays valid).
  5. **Advanced → Input Keys category removed**: SCUM dedicated server doesn't read `Input.ini` (client-side keybinds) — the category was misleading admins. Removed from `/api/settings/schema`.
  6. **Auto-restart timezone fix** (P0): `_tick_scheduler()` was comparing the admin's local-time `restart_times` (e.g. "22:00") against `datetime.now(timezone.utc).strftime("%H:%M")` — so Turkey (UTC+3) admins entering 22:00 had restarts evaluated against 19:00 UTC and they never fired. Now uses `now.astimezone()` to compare in local time. The "one-time it worked" report was almost certainly a daylight-coincidence (when local==UTC by accident).
- **2026-02 (v1.0.12 — 8 truly distinct themes)**:
  1. **Removed 5 lookalike themes** per user request: `blacksite`, `ghost`, `wastelander`, `blood-moon`, `arctic`.
  2. **Kept 3 themes**: `bunker` (default), `neon-grid`, `carbon`.
  3. **Added 5 new visually distinctive themes**:
     - `toxic` — radioactive lime green on swamp / Chernobyl
     - `inferno` — pure fire red on charcoal
     - `arctic-storm` — ice white + glacier blue on deep navy
     - `royal` — black + gold + crimson (luxury)
     - `synthwave` — magenta + purple sunset (80s retrowave)
  4. **Default theme is now `bunker`** (was `blacksite`).
  5. **Legacy theme auto-migration**: users on a removed theme are remapped to the closest match in `localStorage` (`blacksite`→`carbon`, `ghost`→`arctic-storm`, `wastelander`→`bunker`, `blood-moon`→`inferno`, `arctic`→`arctic-storm`) — no jarring jump to default.
  6. Updated `TopBar.jsx` `themeLabels` + `themeSwatches`, `ThemeProvider.jsx` (THEMES array, default, migration map), `I18nProvider.jsx` (TR + EN labels for the 5 new themes), `index.css` (replaced 8 `[data-theme=...]` blocks).
- **2026-02 (v1.0.11 — TopBar polish)**:
  1. **Theme picker is now a centered modal**: Matches the language picker UX (full-screen overlay with backdrop, sticky header, close X, color-swatch preview next to each name). Previous popover-dropdown was clipped near the viewport edge and could only fit ~3 items visibly.
  2. **All 8 themes now show with proper names**: `themeLabels` in `TopBar.jsx` was missing entries for `neon-grid`, `blood-moon`, `arctic`, `carbon` — they rendered as empty rows. Added full mapping plus a `themeSwatches` palette so each theme shows a 3-color preview chip (accent/surface/text) before selection.
  3. **"Download Update" button no longer looks dim/disabled**: The `update-btn-pulse` animation was overriding the solid accent background with `background-color: transparent` during the pulse cycle — that wiped `btn-primary`'s orange fill, making the button look hollow. Rewrote the keyframes to pulse via `box-shadow` + `filter: brightness()` only, preserving the solid background. Renamed keyframe `update-btn-pulse-glow` (class name unchanged).
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
