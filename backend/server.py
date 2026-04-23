from fastapi import FastAPI, APIRouter, HTTPException, UploadFile, File, Form
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
import platform
import psutil
from pathlib import Path
from pydantic import BaseModel, Field, ConfigDict
from typing import List, Dict, Any, Optional
import uuid
from datetime import datetime, timezone, timedelta
from scum_parser import (
    load_defaults,
    parse_real_config_dir,
    render_server_settings_ini,
    render_gameusersettings_ini,
    render_input_ini,
    render_raid_times_json,
    render_notifications_json,
    render_economy_json,
    render_user_list,
    parse_user_list_text,
    parse_ini_sections,
    parse_input_ini,
)
import scum_db
import scum_backup
import scum_process as scum_proc
import scum_discord
import json as json_lib
import io
import asyncio


ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

app = FastAPI(title="LGSS SCUM Server Manager")
api_router = APIRouter(prefix="/api")

# SCUM server requirement (approx)
SCUM_SERVER_REQUIRED_GB = 30
SETUP_DOC_ID = "lgss-setup"


# ---------- MODELS ----------
class DiskInfo(BaseModel):
    device: str
    mountpoint: str
    fstype: str
    total_gb: float
    used_gb: float
    free_gb: float
    percent_used: float
    eligible: bool
    label: str


class SetupState(BaseModel):
    model_config = ConfigDict(extra="ignore")
    completed: bool = False
    selected_disk: Optional[str] = None
    manager_path: Optional[str] = None
    is_admin_confirmed: bool = False
    language: str = "tr"
    theme: str = "wasteland"
    updated_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


class SetupUpdate(BaseModel):
    selected_disk: Optional[str] = None
    manager_path: Optional[str] = None
    is_admin_confirmed: Optional[bool] = None
    completed: Optional[bool] = None
    language: Optional[str] = None
    theme: Optional[str] = None


class ServerProfile(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    folder_name: str
    folder_path: str
    status: str = "Stopped"
    installed: bool = False
    steam_app_id: str = "3792580"
    public_ip: Optional[str] = None
    game_port: int = 7777
    query_port: int = 7778
    max_players: int = 64
    installed_build_id: Optional[str] = None
    update_available: bool = False
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    settings: Dict[str, Any] = Field(default_factory=dict)
    automation: Dict[str, Any] = Field(default_factory=lambda: {
        "enabled": False,
        "restart_times": [],          # ["06:00", "12:00", "18:00", "00:00"]
        "pre_warning_minutes": [15, 10, 5, 4, 3, 2, 1],
        "final_message_duration": 10,
        "auto_update_enabled": False,
        "update_check_interval_min": 360,  # 6 hours default per user preference
        "backup_enabled": True,               # periodic SaveFiles snapshots
        "backup_interval_min": 10,            # every 10 min by default
        "backup_keep_count": 30,              # prune to newest N auto-backups
    })


class AutomationUpdate(BaseModel):
    enabled: Optional[bool] = None
    restart_times: Optional[List[str]] = None
    pre_warning_minutes: Optional[List[int]] = None
    final_message_duration: Optional[int] = None
    auto_update_enabled: Optional[bool] = None
    update_check_interval_min: Optional[int] = None
    backup_enabled: Optional[bool] = None
    backup_interval_min: Optional[int] = None
    backup_keep_count: Optional[int] = None


class ServerCreate(BaseModel):
    name: Optional[str] = None


class ServerPortsUpdate(BaseModel):
    game_port: Optional[int] = None
    query_port: Optional[int] = None
    max_players: Optional[int] = None


class ServerSettingsUpdate(BaseModel):
    settings: Dict[str, Any]


class ServerRename(BaseModel):
    name: str


class UserEntry(BaseModel):
    steam_id: str
    flags: List[str] = Field(default_factory=list)
    note: Optional[str] = None


class UserListUpdate(BaseModel):
    list_name: str  # admins | banned | exclusive
    users: List[UserEntry]


# ---------- DEFAULT SCUM SETTINGS (categorized) ----------
def default_scum_settings() -> Dict[str, Any]:
    return load_defaults()


# ---------- ENDPOINTS ----------
@api_router.get("/")
async def root():
    return {"service": "LGSS SCUM Server Manager", "version": "1.0.0"}


_PUBLIC_IP_CACHE = {"ts": 0, "ip": None}


@api_router.get("/system/public-ip")
async def get_public_ip():
    """Return the host's public IPv4. Cached 5 minutes so we don't hammer
    ipify. Players use this IP (plus the server's connect-port, which is
    game_port + 2 per SCUM's UDP convention) to join from the in-game
    server list or the 'Direct Connect' box."""
    import httpx
    import time
    now = time.time()
    if _PUBLIC_IP_CACHE["ip"] and now - _PUBLIC_IP_CACHE["ts"] < 300:
        return {"ip": _PUBLIC_IP_CACHE["ip"], "cached": True}
    ip = None
    # Try a couple of free services; first one wins.
    endpoints_to_try = ("https://api.ipify.org", "https://ifconfig.me/ip")
    for url in endpoints_to_try:
        try:
            async with httpx.AsyncClient(timeout=4.0, follow_redirects=True) as c:
                r = await c.get(url)
                candidate = r.text.strip()
                # Basic IPv4 sanity check
                parts = candidate.split(".")
                if len(parts) == 4 and all(p.isdigit() and 0 <= int(p) <= 255 for p in parts):
                    ip = candidate
                    break
        except Exception:
            continue
    if ip:
        _PUBLIC_IP_CACHE["ts"] = now
        _PUBLIC_IP_CACHE["ip"] = ip
    return {"ip": ip, "cached": False}


@api_router.get("/system/admin-check")
async def admin_check():
    is_admin = False
    try:
        if platform.system() == "Windows":
            import ctypes
            is_admin = ctypes.windll.shell32.IsUserAnAdmin() != 0
        else:
            is_admin = os.geteuid() == 0
    except Exception:
        is_admin = False
    return {
        "is_admin": is_admin,
        "platform": platform.system(),
        "release": platform.release(),
    }


@api_router.get("/disks", response_model=List[DiskInfo])
async def list_disks():
    """List local disks with capacity. On Windows shows drive letters. On Linux/container shows mount points."""
    disks: List[DiskInfo] = []
    seen = set()
    for part in psutil.disk_partitions(all=False):
        if part.fstype in ("squashfs", "tmpfs", "devtmpfs", "overlay"):
            continue
        if part.mountpoint in seen:
            continue
        seen.add(part.mountpoint)
        try:
            usage = psutil.disk_usage(part.mountpoint)
        except PermissionError:
            continue
        total_gb = round(usage.total / (1024**3), 2)
        free_gb = round(usage.free / (1024**3), 2)
        used_gb = round(usage.used / (1024**3), 2)
        if total_gb < 1:
            continue
        label = part.device if platform.system() == "Windows" else part.mountpoint
        disks.append(DiskInfo(
            device=part.device,
            mountpoint=part.mountpoint,
            fstype=part.fstype or "unknown",
            total_gb=total_gb,
            used_gb=used_gb,
            free_gb=free_gb,
            percent_used=round(usage.percent, 1),
            eligible=free_gb >= SCUM_SERVER_REQUIRED_GB,
            label=label,
        ))
    # If no disks found (rare), synthesize a demo one
    if not disks:
        disks.append(DiskInfo(
            device="C:\\",
            mountpoint="C:\\",
            fstype="NTFS",
            total_gb=500.0,
            used_gb=220.0,
            free_gb=280.0,
            percent_used=44.0,
            eligible=True,
            label="C:\\",
        ))
    return disks


@api_router.get("/setup/requirements")
async def setup_requirements():
    return {
        "required_gb_per_server": SCUM_SERVER_REQUIRED_GB,
        "recommended_free_gb": SCUM_SERVER_REQUIRED_GB + 10,
    }


@api_router.get("/setup", response_model=SetupState)
async def get_setup():
    doc = await db.setup.find_one({"_id": SETUP_DOC_ID}, {"_id": 0})
    if not doc:
        state = SetupState()
        await db.setup.insert_one({"_id": SETUP_DOC_ID, **state.model_dump()})
        return state
    return SetupState(**doc)


@api_router.put("/setup", response_model=SetupState)
async def update_setup(payload: SetupUpdate):
    existing = await db.setup.find_one({"_id": SETUP_DOC_ID}, {"_id": 0}) or SetupState().model_dump()
    data = {**existing}
    for k, v in payload.model_dump(exclude_none=True).items():
        data[k] = v
    data["updated_at"] = datetime.now(timezone.utc).isoformat()
    await db.setup.update_one({"_id": SETUP_DOC_ID}, {"$set": data}, upsert=True)
    return SetupState(**data)


@api_router.post("/setup/reset", response_model=SetupState)
async def reset_setup():
    state = SetupState()
    await db.setup.update_one({"_id": SETUP_DOC_ID}, {"$set": state.model_dump()}, upsert=True)
    await db.servers.delete_many({})
    return state


@api_router.get("/servers", response_model=List[ServerProfile])
async def list_servers():
    docs = await db.servers.find({}, {"_id": 0}).to_list(500)
    return [ServerProfile(**d) for d in docs]


@api_router.post("/servers", response_model=ServerProfile)
async def create_server(payload: ServerCreate):
    setup_doc = await db.setup.find_one({"_id": SETUP_DOC_ID}, {"_id": 0})
    if not setup_doc or not setup_doc.get("manager_path"):
        raise HTTPException(status_code=400, detail="Setup not completed. Select a disk first.")
    existing_count = await db.servers.count_documents({})
    idx = existing_count + 1
    folder_name = f"Server{idx}"
    name = payload.name or folder_name
    manager_path = setup_doc["manager_path"]
    sep = "\\" if ("\\" in manager_path or (len(manager_path) >= 2 and manager_path[1] == ":")) else "/"
    # LGSSManagers/Servers/ServerN/ per user's new spec
    folder_path = f"{manager_path}{sep}Servers{sep}{folder_name}"
    profile = ServerProfile(
        name=name,
        folder_name=folder_name,
        folder_path=folder_path,
        settings=default_scum_settings(),
    )
    await db.servers.insert_one(profile.model_dump())
    return profile


@api_router.get("/servers/{server_id}", response_model=ServerProfile)
async def get_server(server_id: str):
    doc = await db.servers.find_one({"id": server_id}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Server not found")
    return ServerProfile(**doc)


@api_router.put("/servers/{server_id}", response_model=ServerProfile)
async def rename_server(server_id: str, payload: ServerRename):
    res = await db.servers.find_one_and_update(
        {"id": server_id},
        {"$set": {"name": payload.name}},
        projection={"_id": 0},
        return_document=True,
    )
    if not res:
        raise HTTPException(status_code=404, detail="Server not found")
    return ServerProfile(**res)


@api_router.put("/servers/{server_id}/ports", response_model=ServerProfile)
async def update_server_ports(server_id: str, payload: ServerPortsUpdate):
    """Update game port / query port / max players. Takes effect on next START."""
    update: Dict[str, Any] = {}
    if payload.game_port is not None:
        if not (1024 <= payload.game_port <= 65535):
            raise HTTPException(status_code=400, detail="game_port must be 1024-65535")
        update["game_port"] = payload.game_port
    if payload.query_port is not None:
        if not (1024 <= payload.query_port <= 65535):
            raise HTTPException(status_code=400, detail="query_port must be 1024-65535")
        update["query_port"] = payload.query_port
    if payload.max_players is not None:
        if not (1 <= payload.max_players <= 128):
            raise HTTPException(status_code=400, detail="max_players must be 1-128")
        update["max_players"] = payload.max_players
    if not update:
        raise HTTPException(status_code=400, detail="No fields to update")
    res = await db.servers.find_one_and_update(
        {"id": server_id},
        {"$set": update},
        projection={"_id": 0},
        return_document=True,
    )
    if not res:
        raise HTTPException(status_code=404, detail="Server not found")
    return ServerProfile(**res)


@api_router.put("/servers/{server_id}/settings", response_model=ServerProfile)
async def update_server_settings(server_id: str, payload: ServerSettingsUpdate):
    doc = await db.servers.find_one({"id": server_id}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Server not found")
    merged = {**doc.get("settings", {})}
    for category, values in payload.settings.items():
        if isinstance(values, dict):
            merged[category] = {**merged.get(category, {}), **values}
        else:
            merged[category] = values
    await db.servers.update_one({"id": server_id}, {"$set": {"settings": merged}})
    doc["settings"] = merged
    # Auto-persist to real .ini/.json files so manager edits are never lost.
    # Only if the server has been installed AND the config directory already
    # exists (i.e. first-boot already ran). Otherwise SCUM will overwrite
    # anything we write here on its first boot.
    if doc.get("installed"):
        try:
            _write_config_files_for_doc(doc)
        except Exception:
            logger.exception("update_server_settings: auto-write config failed")
    return ServerProfile(**doc)


@api_router.delete("/servers/{server_id}")
async def delete_server(server_id: str):
    res = await db.servers.delete_one({"id": server_id})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Server not found")
    return {"ok": True}


@api_router.post("/servers/{server_id}/start", response_model=ServerProfile)
async def start_server(server_id: str):
    doc = await db.servers.find_one({"id": server_id}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Server not found")

    # --- Crash auto-recovery ---------------------------------------------
    # If the server was flagged for recovery on its previous shutdown (i.e.
    # scheduler detected an unexpected Running→Stopped transition), restore
    # the most recent safe backup BEFORE spawning SCUMServer.exe. We prefer
    # a 'crash' backup (captured at the moment of the crash) and fall back
    # to the newest 'auto'/'manual' snapshot if none exists.
    if doc.get("crash_recovery_pending"):
        try:
            setup_doc = await db.setup.find_one({"_id": SETUP_DOC_ID}, {"_id": 0}) or {}
            manager_path = setup_doc.get("manager_path")
            server_folder = doc.get("folder_name") or f"Server{doc.get('index', 1)}"
            if manager_path and doc.get("folder_path"):
                backups = await asyncio.to_thread(
                    scum_backup.list_backups,
                    server_id=server_id,
                    manager_path=manager_path,
                    server_folder=server_folder,
                )
                # Prefer newest crash backup; fallback to newest auto/manual.
                preferred = next((b for b in backups if b["backup_type"] == "crash"), None)
                if preferred is None:
                    preferred = next(
                        (b for b in backups if b["backup_type"] in ("auto", "manual")),
                        None,
                    )
                if preferred:
                    logger.warning(
                        "Crash-recovery: restoring %s before starting %s",
                        preferred["filename"], doc.get("name"),
                    )
                    await asyncio.to_thread(
                        scum_backup.restore_backup,
                        server_id=server_id,
                        folder_path=doc["folder_path"],
                        manager_path=manager_path,
                        server_folder=server_folder,
                        backup_id=preferred["id"],
                    )
        except Exception as e:
            logger.exception("crash-recovery restore failed: %s", e)
        # Clear the flag regardless — a failed restore shouldn't re-trigger.
        await db.servers.update_one(
            {"id": server_id},
            {"$set": {"crash_recovery_pending": False}},
        )

    # Real process spawn (Windows only). If not installed or exe missing, fail cleanly.
    try:
        port = int(doc.get("game_port") or 7777)
        query_port = int(doc.get("query_port") or 7778)
        # scum.MaxPlayers lives in ServerSettings.ini -> srv_general category
        settings = (doc.get("settings") or {}).get("srv_general") or {}
        max_players = int(settings.get("scum.MaxPlayers") or doc.get("max_players") or 64)
        pid = scum_proc.start_server(
            server_id=server_id,
            folder_path=doc["folder_path"],
            port=port,
            query_port=query_port,
            max_players=max_players,
        )
        # Set status to Starting; /metrics + scheduler promote to Running when
        # Steam A2S_INFO acks the query port (true online moment).
        await db.servers.update_one({"id": server_id},
                                    {"$set": {"status": "Starting", "last_pid": pid}})
        doc["status"] = "Starting"
    except FileNotFoundError as e:
        raise HTTPException(status_code=409, detail=str(e))
    except RuntimeError as e:
        # Non-Windows fallback: keep legacy simulated status so UI still works in dev/preview
        logger.warning("start_server: %s - using simulated status", e)
        await db.servers.update_one({"id": server_id}, {"$set": {"status": "Running"}})
        doc["status"] = "Running"
    return ServerProfile(**doc)


@api_router.post("/servers/{server_id}/stop", response_model=ServerProfile)
async def stop_server(server_id: str):
    doc = await db.servers.find_one({"id": server_id}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Server not found")
    # Flag this upcoming Running→Stopped transition as admin-driven so the
    # scheduler's crash detector skips the emergency backup.
    mark_expected_stop(server_id)
    try:
        scum_proc.stop_server(server_id)
    except Exception:
        logger.exception("stop_server failed")
    await db.servers.update_one({"id": server_id}, {"$set": {"status": "Stopped"}})
    doc["status"] = "Stopped"
    return ServerProfile(**doc)


@api_router.post("/servers/{server_id}/update", response_model=ServerProfile)
async def update_server(server_id: str):
    """Updates SCUM server binaries via SteamCMD without touching settings.
    In web preview this is simulated — status toggles through Updating → Stopped.
    Real SteamCMD call is in Electron main process (ipc 'lgss:update-server')."""
    doc = await db.servers.find_one({"id": server_id}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Server not found")
    # SteamCMD update requires stopping the EXE. Mark as admin-driven stop.
    mark_expected_stop(server_id)
    # Preserve settings; just toggle status to simulate update cycle
    await db.servers.update_one({"id": server_id}, {"$set": {"status": "Updating"}})
    doc["status"] = "Updating"
    return ServerProfile(**doc)


@api_router.post("/servers/{server_id}/update/complete", response_model=ServerProfile)
async def complete_server_update(server_id: str):
    """Marks a previously-started update as complete. Called by Electron after SteamCMD exits."""
    doc = await db.servers.find_one({"id": server_id}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Server not found")
    # Pull latest known Steam build and set it as installed
    meta = await db.app_meta.find_one({"_id": STEAM_LATEST_KEY}, {"_id": 0}) or {}
    build_id = meta.get("build_id") or doc.get("installed_build_id") or f"build-{int(datetime.now(timezone.utc).timestamp())}"
    await db.servers.update_one({"id": server_id}, {"$set": {
        "status": "Stopped",
        "installed_build_id": build_id,
        "update_available": False,
    }})
    doc["status"] = "Stopped"
    doc["installed_build_id"] = build_id
    doc["update_available"] = False
    return ServerProfile(**doc)


@api_router.post("/servers/{server_id}/install", response_model=ServerProfile)
async def install_server(server_id: str):
    """Download SCUM server files via SteamCMD (AppID 3792580). Runs in a
    background thread; poll /install/progress for live %. When SteamCMD
    finishes it marks the server installed."""
    doc = await db.servers.find_one({"id": server_id}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Server not found")

    setup = await db.setup.find_one({"_id": SETUP_DOC_ID}, {"_id": 0}) or {}
    manager_path = setup.get("manager_path") or ""

    # Non-Windows (dev/preview) — keep legacy simulated install so UI can be exercised.
    if platform.system() != "Windows" or not manager_path:
        build_id = f"build-{int(datetime.now(timezone.utc).timestamp())}"
        await db.servers.update_one({"id": server_id}, {"$set": {
            "installed": True, "status": "Stopped",
            "installed_build_id": build_id, "update_available": False,
        }})
        doc.update({"installed": True, "status": "Stopped",
                    "installed_build_id": build_id, "update_available": False})
        return ServerProfile(**doc)

    # Real Windows install via SteamCMD in a background thread
    def _on_complete(ok: bool, build_id: Optional[str], _log_tail: str):
        import asyncio as _asyncio
        async def _update():
            if ok:
                update_fields: Dict[str, Any] = {
                    "installed": True, "status": "Stopped",
                    "installed_build_id": build_id, "update_available": False,
                }
                # After install + first-boot, parse any generated config files back
                # into the manager settings so the UI reflects REAL values and any
                # edits the user makes write to the files SCUM actually reads.
                try:
                    parsed = parse_real_config_dir(doc["folder_path"])
                    current_doc = await db.servers.find_one({"id": server_id}, {"_id": 0}) or doc
                    current_settings = current_doc.get("settings", {}) or {}
                    merged = {**current_settings}
                    for k, v in parsed.items():
                        if isinstance(v, (list, dict)) and not v:
                            continue
                        merged[k] = v
                    if not parsed.get("notifications"):
                        merged["notifications"] = current_settings.get("notifications", [])
                    if not parsed.get("custom_ini"):
                        merged["custom_ini"] = current_settings.get("custom_ini", {
                            "ExtraServerSettings": "", "ExtraGameSettings": "", "ExtraEngineSettings": "",
                        })
                    update_fields["settings"] = merged
                except Exception:
                    logger.exception("install on_complete: parse_real_config_dir failed")
                await db.servers.update_one({"id": server_id}, {"$set": update_fields})
            else:
                await db.servers.update_one({"id": server_id}, {"$set": {"status": "Stopped"}})
        try:
            _asyncio.run(_update())
        except Exception:
            logger.exception("install on_complete db update failed")

    scum_proc.install_server(
        server_id=server_id,
        folder_path=doc["folder_path"],
        manager_path=manager_path,
        app_id=doc.get("steam_app_id") or "3792580",
        on_complete=_on_complete,
    )
    await db.servers.update_one({"id": server_id}, {"$set": {"status": "Installing"}})
    doc["status"] = "Installing"
    return ServerProfile(**doc)


@api_router.get("/servers/{server_id}/install/progress")
async def install_progress(server_id: str):
    """Poll this endpoint every 1-2 seconds while an install is running."""
    return scum_proc.get_install_progress(server_id)


@api_router.get("/servers/{server_id}/metrics")
async def server_metrics(server_id: str):
    """Live CPU / RAM / uptime / disk usage / last-updated for the given server.
    Also auto-promotes the DB status from `Starting` → `Running` the moment the
    SCUM dedicated server answers its Steam A2S_INFO query (true online state)."""
    doc = await db.servers.find_one({"id": server_id}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Server not found")
    m = scum_proc.get_metrics(server_id, folder_path=doc.get("folder_path"))

    # Reconcile DB status with the live phase. This runs on every UI poll so
    # within ~1-2s of the server becoming queryable the status flips to Running.
    phase = m.get("phase")
    current = doc.get("status")
    if phase == "online" and current != "Running":
        await db.servers.update_one({"id": server_id}, {"$set": {"status": "Running"}})
    elif phase == "stopped" and current in ("Starting", "Running"):
        await db.servers.update_one({"id": server_id}, {"$set": {"status": "Stopped"}})
    # (phase == "starting" keeps whatever status is already in DB — typically "Starting".)
    return m


# ---------- AUTOMATION (auto-restart + auto-update) ----------
def _fmt_update_message(minutes_left: int) -> str:
    """Default English update warning. Editable in the Update Notifications UI."""
    return f"A new version of the game is available. It will update and restart in {minutes_left} minutes."


def _update_duration_for(minutes_left: int) -> str:
    """Longer banner at the 1-minute mark (10s) so nobody misses it; 5s earlier."""
    return "10" if minutes_left == 1 else "5"


async def _schedule_graceful_update(server_id: str, server_doc: Dict[str, Any], lead_minutes: int = 15) -> None:
    """Plan a non-abrupt auto-update.

    1. Compute target time = now + lead_minutes.
    2. Take the admin's UPDATE-kind notification templates (kind='update').
       For each of the standard offsets [15,10,5,4,3,2,1] we stamp a time
       row at (target - offset) so SCUM broadcasts a countdown in-game.
    3. Persist to Notifications.json via the settings doc — SCUM picks it up.
    4. Set pending_update_at so the scheduler tick triggers the actual stop →
       SteamCMD update → restart exactly at target time.

    Safe to call multiple times; no-op if an update is already pending.
    """
    if server_doc.get("pending_update_at"):
        return  # already scheduled
    now = datetime.now(timezone.utc)
    target = now + timedelta(minutes=lead_minutes)
    settings = {**(server_doc.get("settings") or {})}
    notifs = [dict(n) for n in (settings.get("notifications") or [])]
    # Keep restart and non-transient update templates; drop any stale transient
    # update notifications from a previous cycle.
    notifs = [n for n in notifs if not n.get("_transient_update")]
    # Pick template messages from any existing update-kind entries, else use defaults.
    user_templates = {
        # Match the default offsets when possible. Custom update messages the
        # admin wrote stay usable because we re-stamp only transient copies.
    }
    OFFSETS = [15, 10, 5, 4, 3, 2, 1]
    for m in OFFSETS:
        fire_at = target - timedelta(minutes=m)
        # Only include offsets that are in the future
        if fire_at < now:
            continue
        hhmm = f"{fire_at.hour:02d}:{fire_at.minute:02d}"
        msg = user_templates.get(m) or _fmt_update_message(m)
        notifs.append({
            "day": "Everyday",
            "time": [hhmm],
            "duration": _update_duration_for(m),
            "message": msg,
            "kind": "update",
            "_transient_update": True,  # manager-side flag — stripped on export
        })
    settings["notifications"] = notifs
    await db.servers.update_one(
        {"id": server_id},
        {"$set": {
            "settings": settings,
            "pending_update_at": target.isoformat(),
        }},
    )
    # Write to disk so SCUM can pick them up
    try:
        if server_doc.get("folder_path"):
            save_notifications_to_disk(server_doc["folder_path"], notifs)
    except Exception as e:
        logger.info("graceful-update notification write failed: %s", e)
    logger.info(
        "Graceful update scheduled for %s at %s (%d notifications)",
        server_doc.get("name"), target.isoformat(), len(OFFSETS),
    )


def save_notifications_to_disk(folder_path: str, notifs: List[Dict[str, Any]]) -> None:
    """Write Notifications.json to the server's config dir, stripping manager
    metadata (kind, _transient_update) that SCUM doesn't understand."""
    from pathlib import Path
    clean = []
    for n in notifs:
        if isinstance(n, dict):
            clean.append({k: v for k, v in n.items() if not k.startswith("_") and k != "kind"})
    target = Path(folder_path) / "SCUM" / "Saved" / "Config" / "WindowsServer" / "Notifications.json"
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(json_lib.dumps({"Notifications": clean}, indent=2), encoding="utf-8")



def _fmt_restart_message(minutes_left: int) -> str:
    """Default restart warning. Users are expected to edit these in the
    Notifications editor to fit their community's language."""
    return f"The server will restart in {minutes_left} minutes."


def _restart_duration_for(minutes_left: int) -> str:
    """On-screen banner duration. The final 1-minute warning stays 10s for
    extra visibility; the earlier reminders are 5s each so they don't spam
    the screen during active play."""
    return "10" if minutes_left == 1 else "5"


def _minus_minutes(hhmm: str, m: int) -> str:
    """Subtract m minutes from HH:MM and wrap around 24h."""
    h, mi = [int(x) for x in hhmm.split(":")[:2]]
    total = (h * 60 + mi - m) % (24 * 60)
    return f"{total // 60:02d}:{total % 60:02d}"


def _generate_notifications_from_schedule(automation: Dict[str, Any]) -> List[Dict[str, Any]]:
    """Generate RESTART notifications from the schedule. Each entry is tagged
    kind='restart' so the UI can filter restart vs update notifications. The
    tag is stripped before the file is written to disk."""
    times: List[str] = [t for t in (automation.get("restart_times") or []) if t]
    pre: List[int] = sorted(set([int(x) for x in (automation.get("pre_warning_minutes") or [])]), reverse=True)
    if not times:
        return []
    out: List[Dict[str, Any]] = []
    for m in pre:
        stamps = sorted({_minus_minutes(t, m) for t in times})
        out.append({
            "day": "Everyday",
            "time": stamps,
            "duration": _restart_duration_for(m),
            "message": _fmt_restart_message(m),
            "kind": "restart",
        })
    return out


@api_router.put("/servers/{server_id}/automation", response_model=ServerProfile)
async def update_automation(server_id: str, payload: AutomationUpdate):
    doc = await db.servers.find_one({"id": server_id}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Server not found")
    automation = {**(doc.get("automation") or {})}
    for k, v in payload.model_dump(exclude_none=True).items():
        automation[k] = v
    await db.servers.update_one({"id": server_id}, {"$set": {"automation": automation}})
    doc["automation"] = automation
    return ServerProfile(**doc)


@api_router.post("/servers/{server_id}/automation/generate-notifications", response_model=ServerProfile)
async def generate_notifications(server_id: str):
    """Regenerate the Notifications.json entries from the current automation schedule
    and write them into the server's settings.notifications list. Frontend calls
    this to sync the schedule with the actual config the game reads."""
    doc = await db.servers.find_one({"id": server_id}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Server not found")
    automation = doc.get("automation") or {}
    generated = _generate_notifications_from_schedule(automation)
    settings = {**(doc.get("settings") or {})}
    # Preserve any non-restart (e.g. "update") notifications the admin has
    # authored; only replace the restart ones generated from the schedule.
    existing = settings.get("notifications") or []
    kept = [n for n in existing if isinstance(n, dict) and (n.get("kind") or "restart") != "restart"]
    settings["notifications"] = generated + kept
    await db.servers.update_one({"id": server_id}, {"$set": {"settings": settings}})
    doc["settings"] = settings
    return ServerProfile(**doc)


@api_router.post("/servers/{server_id}/post-install", response_model=ServerProfile)
async def server_post_install(server_id: str):
    """Called after SteamCMD install finishes. Seeds a helpful default
    Notifications.json template (2x daily restarts) so new admins have a starting point."""
    doc = await db.servers.find_one({"id": server_id}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Server not found")
    settings = {**(doc.get("settings") or {})}
    if not settings.get("notifications"):
        # Seed with sane template mirroring the user's own config pattern
        settings["notifications"] = _generate_notifications_from_schedule({
            "restart_times": ["06:00", "18:00"],
            "pre_warning_minutes": [15, 10, 5, 4, 3, 2, 1],
            "final_message_duration": 10,
        })
        await db.servers.update_one({"id": server_id}, {"$set": {"settings": settings}})
        doc["settings"] = settings
    return ServerProfile(**doc)


# ---------- STEAM UPDATE CHECK ----------
class SteamUpdateInfo(BaseModel):
    app_id: str
    latest_build_id: str
    checked_at: str
    change_notes: Optional[str] = ""


STEAM_APP_ID = "3792580"
STEAM_LATEST_KEY = "steam-latest-manifest"


@api_router.get("/steam/check-update")
async def steam_check_update():
    """Check Steam for the latest SCUM update.

    Uses Steam's PUBLIC endpoints (no API key required):
      * store.steampowered.com/api/appdetails?appids=3792580 — release/update date
      * steamcommunity.com/games/3792580/rss — patchnotes feed

    The manager uses the most recent patchnote publication date as the "latest build"
    token so it can detect when a game-wide update is released. On Electron desktop
    SteamCMD's app_info_print is used for the real Steam build id.
    """
    import httpx
    latest_build_id = None
    notes = ""
    fetched_from = "mock"
    # The dedicated server (3792580) doesn't have its own RSS, but the main game (513710)
    # is patched in lockstep with the server, so its patchnotes feed tells us when a new
    # build is out. We try both in order.
    CANDIDATE_APPIDS = ["513710", "3792580"]
    try:
        async with httpx.AsyncClient(timeout=8.0, follow_redirects=True, headers={"User-Agent": "LGSSManager/1.0"}) as client:
            for aid in CANDIDATE_APPIDS:
                r = await client.get(f"https://steamcommunity.com/games/{aid}/rss/")
                if r.status_code != 200 or "<item>" not in r.text:
                    continue
                import re
                pubs = re.findall(r"<pubDate>([^<]+)</pubDate>", r.text)
                titles = re.findall(r"<item>.*?<title>([^<]+)</title>", r.text, flags=re.S)
                if pubs:
                    from email.utils import parsedate_to_datetime
                    dt = parsedate_to_datetime(pubs[0])
                    latest_build_id = f"build-{int(dt.timestamp())}"
                    notes = (titles[0] if titles else "").strip()
                    fetched_from = f"steam-rss:{aid}"
                    break
            if not latest_build_id:
                r = await client.get("https://store.steampowered.com/api/appdetails", params={"appids": "513710", "filters": "basic,release_date"})
                if r.status_code == 200:
                    j = r.json().get("513710", {}).get("data", {})
                    rd = (j.get("release_date") or {}).get("date", "")
                    if rd:
                        latest_build_id = f"build-{rd.replace(' ', '-').replace(',', '')}"
                        notes = j.get("name", "")
                        fetched_from = "steam-appdetails"
    except Exception as e:
        logger.info("Steam check failed: %s", e)

    if not latest_build_id:
        # Final fallback: whatever the admin has simulated via /api/steam/publish-build
        doc = await db.app_meta.find_one({"_id": STEAM_LATEST_KEY}, {"_id": 0}) or {}
        latest_build_id = doc.get("build_id") or f"build-{int(datetime.now(timezone.utc).timestamp())}"
        notes = doc.get("notes", "")

    checked_at = datetime.now(timezone.utc).isoformat()
    # Persist for other endpoints + compare to installed builds
    await db.app_meta.update_one(
        {"_id": STEAM_LATEST_KEY},
        {"$set": {"build_id": latest_build_id, "notes": notes, "checked_at": checked_at, "source": fetched_from}},
        upsert=True,
    )
    # Mark servers whose installed build differs as update_available
    servers = await db.servers.find({"installed": True}, {"_id": 0}).to_list(500)
    for s in servers:
        needs_update = bool(s.get("installed_build_id")) and s["installed_build_id"] != latest_build_id
        if needs_update != bool(s.get("update_available")):
            await db.servers.update_one({"id": s["id"]}, {"$set": {"update_available": needs_update}})
    return {
        "app_id": STEAM_APP_ID,
        "latest_build_id": latest_build_id,
        "checked_at": checked_at,
        "change_notes": notes,
        "source": fetched_from,
    }


class SteamPublishBuild(BaseModel):
    build_id: str
    notes: Optional[str] = ""


@api_router.post("/steam/publish-build")
async def steam_publish_build(payload: SteamPublishBuild):
    """Admin/simulation endpoint: pretends a new Steam build has been published.
    Used in web preview to exercise the update-available flow without real SteamCMD."""
    await db.app_meta.update_one(
        {"_id": STEAM_LATEST_KEY},
        {"$set": {"build_id": payload.build_id, "notes": payload.notes, "published_at": datetime.now(timezone.utc).isoformat()}},
        upsert=True,
    )
    await db.servers.update_many({"installed": True, "installed_build_id": {"$ne": payload.build_id}}, {"$set": {"update_available": True}})
    return {"ok": True, "latest_build_id": payload.build_id}


# ---------- LOG INGESTION / EVENTS / DISCORD ----------
from scum_logs import parse_log_text, detect_log_type, read_log_file, LOG_TYPE_ORDER  # noqa: E402


class DiscordWebhookConfig(BaseModel):
    admin: Optional[str] = ""
    chat: Optional[str] = ""
    login: Optional[str] = ""
    kill: Optional[str] = ""
    economy: Optional[str] = ""
    violation: Optional[str] = ""
    fame: Optional[str] = ""
    raid: Optional[str] = ""
    mention_role_id: Optional[str] = ""  # pinged on violation events


def _event_to_discord_embed(ev: Dict[str, Any]) -> Dict[str, Any]:
    palette = {
        "admin":     (0xFF8C00, "🛠 Admin"),
        "chat":      (0x00C9FF, "💬 Chat"),
        "login":     (0x22D36F, "🔐 Login"),
        "kill":      (0xE53935, "💀 Kill"),
        "economy":   (0xFFD166, "💰 Trade"),
        "violation": (0xD32F2F, "🚨 Violation"),
        "fame":      (0x9B59B6, "🏆 Fame"),
        "raid":      (0x607D8B, "⚔ Raid"),
    }
    color, title = palette.get(ev.get("type", ""), (0x8B9A46, f"· {ev.get('type','event').upper()}"))
    player = ev.get("player_name") or ev.get("killer_name") or "-"
    desc_lines: List[str] = []
    if ev["type"] == "admin":
        desc_lines.append(f"**{player}** ran `{ev.get('command','?')}` {ev.get('args','')}")
    elif ev["type"] == "chat":
        desc_lines.append(f"[{ev.get('channel','?')}] **{player}**: {ev.get('message','')}")
    elif ev["type"] == "login":
        desc_lines.append(f"**{player}** {ev.get('action','?')}")
    elif ev["type"] == "kill":
        desc_lines.append(f"**{ev.get('killer_name','?')}** killed **{ev.get('victim_name','?')}** with `{ev.get('weapon','?')}` · {ev.get('distance_m',0):.0f}m")
    elif ev["type"] == "economy":
        desc_lines.append(f"**{player}** {ev.get('action','?')} {ev.get('quantity',1)}× `{ev.get('item_code','?')}` for {ev.get('amount',0)} @ {ev.get('trader','?')}")
    elif ev["type"] == "violation":
        desc_lines.append(f"⚠ **{player}** — {ev.get('description','')}")
    elif ev["type"] == "fame":
        d = ev.get("delta", 0)
        desc_lines.append(f"**{player}** {'gained' if d >= 0 else 'lost'} {abs(d)} fame")
    else:
        desc_lines.append(ev.get("raw", ""))
    return {
        "embeds": [{
            "title": title,
            "description": "\n".join(desc_lines)[:1800],
            "color": color,
            "timestamp": ev.get("ts"),
            "footer": {"text": f"Server {ev.get('server_id','')[:8]} · {ev.get('source_file','')}"},
        }]
    }


async def _forward_to_discord(webhooks: Dict[str, Any], events: List[Dict[str, Any]]) -> int:
    sent = 0
    if not webhooks:
        return 0
    import httpx
    # Group by event type so we issue one request per type (respect Discord rate limit).
    async with httpx.AsyncClient(timeout=8.0) as client:
        for ev in events:
            hook = (webhooks.get(ev.get("type")) or "").strip()
            if not hook or not hook.startswith("https://discord"):
                continue
            payload = _event_to_discord_embed(ev)
            if ev.get("type") == "violation" and webhooks.get("mention_role_id"):
                payload["content"] = f"<@&{webhooks['mention_role_id']}>"
            try:
                r = await client.post(hook, json=payload)
                if r.status_code < 400:
                    sent += 1
            except Exception as e:
                logger.info("Discord POST failed: %s", e)
    return sent


async def _store_events_and_forward(server_id: str, events: List[Dict[str, Any]]) -> Dict[str, int]:
    """Store events in MongoDB (de-duplicated by 'id') and forward ONLY the
    freshly-inserted ones to the server's Discord hooks. Previously we forwarded
    the full batch if any insert succeeded, which caused Discord to re-announce
    old events every time a log file grew (the "player re-joined every 30 min"
    and "admin ran ? repeatedly" bugs)."""
    if not events:
        return {"stored": 0, "forwarded": 0}
    srv = await db.servers.find_one({"id": server_id}, {"_id": 0, "discord_webhooks": 1}) or {}
    hooks = srv.get("discord_webhooks") or {}
    newly_inserted: List[Dict[str, Any]] = []
    for ev in events:
        try:
            res = await db.server_events.update_one({"id": ev["id"]}, {"$setOnInsert": ev}, upsert=True)
            if res.upserted_id is not None:
                newly_inserted.append(ev)
        except Exception as e:
            logger.info("event store failed: %s", e)
    sent = 0
    if newly_inserted:
        # Hard cap so a big initial ingest doesn't blast a Discord channel with 500+ embeds
        to_send = newly_inserted[-200:]
        sent = await _forward_to_discord(hooks, to_send)
    return {"stored": len(newly_inserted), "forwarded": sent}


@api_router.post("/servers/{server_id}/logs/import")
async def import_server_log(server_id: str, file: UploadFile = File(...)):
    """Upload a SCUM log file (UTF-16) and parse+store its events.

    Useful for web preview where no real SCUM server is running: the admin can drag
    a real log here and immediately see kills/chat/admin/economy feeds + Discord relays.
    """
    srv = await db.servers.find_one({"id": server_id}, {"_id": 0})
    if not srv:
        raise HTTPException(status_code=404, detail="Server not found")
    raw = await file.read()
    from scum_logs import _decode_scum_log_bytes
    text = _decode_scum_log_bytes(raw)
    log_type = detect_log_type(file.filename or "")
    events = parse_log_text(text, log_type, filename=file.filename or "", server_id=server_id)
    res = await _store_events_and_forward(server_id, events)
    return {"log_type": log_type, "parsed": len(events), **res, "filename": file.filename}


# ---------------------------------------------------------------------------
#  Backup endpoints — SaveFiles zip snapshots
# ---------------------------------------------------------------------------
async def _get_server_for_backup(server_id: str) -> Dict[str, Any]:
    """Resolve server doc + manager_path context. Raises HTTPException if missing."""
    doc = await db.servers.find_one({"id": server_id}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Server not found")
    setup = await db.setup.find_one({"_id": SETUP_DOC_ID}, {"_id": 0}) or {}
    manager_path = setup.get("manager_path")
    if not manager_path:
        raise HTTPException(status_code=400, detail="Manager path not configured")
    return {
        "doc": doc,
        "manager_path": manager_path,
        "server_folder": doc.get("folder_name") or f"Server{doc.get('index', 1)}",
    }


@api_router.get("/servers/{server_id}/backups")
async def list_server_backups(server_id: str):
    ctx = await _get_server_for_backup(server_id)
    backups = await asyncio.to_thread(
        scum_backup.list_backups,
        server_id=server_id,
        manager_path=ctx["manager_path"],
        server_folder=ctx["server_folder"],
    )
    total = sum(b["size_bytes"] for b in backups)
    return {
        "server_id": server_id,
        "count": len(backups),
        "total_size_mb": round(total / (1024 * 1024), 2),
        "backups": backups,
    }


@api_router.post("/servers/{server_id}/backups")
async def create_server_backup(server_id: str, backup_type: str = "manual"):
    """Create an on-demand ZIP backup of SaveFiles. Non-blocking; completes
    within 5-30 seconds depending on save size. Safe while server is running
    — SCUM.db is copied via SQLite's online backup API."""
    ctx = await _get_server_for_backup(server_id)
    res = await asyncio.to_thread(
        scum_backup.create_backup,
        server_id=server_id,
        folder_path=ctx["doc"]["folder_path"],
        manager_path=ctx["manager_path"],
        server_folder=ctx["server_folder"],
        backup_type=backup_type,
    )
    if not res.get("ok"):
        raise HTTPException(status_code=500, detail=res.get("error", "backup failed"))
    return res


@api_router.delete("/servers/{server_id}/backups/{backup_id}")
async def delete_server_backup(server_id: str, backup_id: str):
    ctx = await _get_server_for_backup(server_id)
    ok = await asyncio.to_thread(
        scum_backup.delete_backup,
        manager_path=ctx["manager_path"],
        server_folder=ctx["server_folder"],
        backup_id=backup_id,
    )
    if not ok:
        raise HTTPException(status_code=404, detail="Backup not found")
    return {"ok": True}


@api_router.post("/servers/{server_id}/backups/{backup_id}/restore")
async def restore_server_backup(server_id: str, backup_id: str):
    """Restore a backup into SaveFiles. REQUIRES the server to be Stopped —
    we refuse if the SCUM process is alive to avoid clobbering live DB files
    and corrupting mid-write tables. A `pre_restore` safety backup is
    automatically captured before extraction."""
    ctx = await _get_server_for_backup(server_id)
    # Check running state (DB status + real OS process)
    metrics = scum_proc.get_metrics(server_id, folder_path=ctx["doc"].get("folder_path"))
    if metrics.get("running") or ctx["doc"].get("status") in ("Running", "Starting"):
        raise HTTPException(status_code=409, detail="Stop the server before restoring")
    res = await asyncio.to_thread(
        scum_backup.restore_backup,
        server_id=server_id,
        folder_path=ctx["doc"]["folder_path"],
        manager_path=ctx["manager_path"],
        server_folder=ctx["server_folder"],
        backup_id=backup_id,
    )
    if not res.get("ok"):
        raise HTTPException(status_code=500, detail=res.get("error", "restore failed"))
    return res


@api_router.get("/servers/{server_id}/backups/{backup_id}/download")
async def download_server_backup(server_id: str, backup_id: str):
    """Stream a backup zip back to the admin for off-machine archiving."""
    ctx = await _get_server_for_backup(server_id)
    p = scum_backup.find_backup(
        manager_path=ctx["manager_path"],
        server_folder=ctx["server_folder"],
        backup_id=backup_id,
    )
    if p is None or not p.exists():
        raise HTTPException(status_code=404, detail="Backup not found")
    from fastapi.responses import FileResponse
    return FileResponse(str(p), media_type="application/zip", filename=p.name)


# ============================================================
# Discord Bot — token management + state collector
# ============================================================

class DiscordBotConfig(BaseModel):
    enabled: Optional[bool] = None
    token: Optional[str] = None
    status_guild_id: Optional[str] = None
    status_channel_id: Optional[str] = None


def _discord_state_collector() -> Dict[str, Any]:
    """Return the latest cached snapshot of all managed servers for the
    Discord bot (presence + /online command). The cache is refreshed every
    10s by `_refresh_discord_state_cache()` inside the scheduler tick."""
    return _discord_state_collector._cache  # type: ignore[attr-defined]


_discord_state_collector._cache = {"servers": []}  # type: ignore[attr-defined]


async def _discord_message_id_store(folder_name: str, message_id: str) -> None:
    """Callback handed to the Discord bot so it can persist the message id
    it just posted. Used by the status-channel loop so restarting the bot
    doesn't spawn duplicate embeds — it edits the existing message instead."""
    setup = await db.setup.find_one({"_id": SETUP_DOC_ID}, {"_id": 0}) or {}
    cfg = {**(setup.get("discord_bot") or {})}
    ids = {**(cfg.get("status_message_ids") or {})}
    ids[folder_name] = message_id
    cfg["status_message_ids"] = ids
    await db.setup.update_one(
        {"_id": SETUP_DOC_ID}, {"$set": {"discord_bot": cfg}}, upsert=True,
    )


async def _refresh_discord_state_cache():
    """Rebuild the Discord state cache from live DB + A2S queries.
    Called once per scheduler tick so the bot's presence + status channel
    embeds stay within 10s of the real state without hammering UDP."""
    servers_out: List[Dict[str, Any]] = []
    now_ts = datetime.now(timezone.utc).timestamp()
    async for s in db.servers.find({}, {"_id": 0}):
        query_port = int(s.get("query_port") or 7778)
        max_p = int((s.get("settings") or {}).get("srv_general", {}).get("scum.MaxPlayers")
                    or s.get("max_players") or 64)
        metrics = scum_proc.get_metrics(s["id"], s.get("folder_path"))
        players: List[Dict[str, Any]] = []
        if metrics.get("ready"):
            try:
                raw = await asyncio.to_thread(
                    scum_proc.a2s_player_query, "127.0.0.1", query_port, 1.0,
                )
                # Enrich with squad info from SCUM.db (best-effort: matches on
                # db_name, which is the in-game display name). We do this once
                # per tick rather than per player so SQLite stays happy.
                name_to_squad: Dict[str, str] = {}
                if s.get("folder_path"):
                    try:
                        stats = await asyncio.to_thread(scum_db.read_player_stats, s["folder_path"])
                        for sid, st in stats.items():
                            nm = (st.get("db_name") or "").strip()
                            if nm and st.get("squad_name"):
                                name_to_squad[nm] = st["squad_name"]
                    except Exception:
                        pass
                for p in raw:
                    players.append({
                        "name": p["name"],
                        "duration_s": p["duration_s"],
                        "squad": name_to_squad.get(p["name"]),
                    })
            except Exception:
                players = []

        uptime_s = int(metrics.get("online_uptime_seconds") or 0)
        servers_out.append({
            "id": s["id"],
            "name": s.get("name"),
            "folder_name": s.get("folder_name"),
            "status": s.get("status"),
            "ready": bool(metrics.get("ready")),
            "max_players": max_p,
            "players": players,
            "uptime_s": uptime_s,
            "game_port": s.get("game_port"),
            "query_port": query_port,
            "snapshot_ts": now_ts,
        })
    _discord_state_collector._cache = {"servers": servers_out}  # type: ignore[attr-defined]


@api_router.get("/discord/bot")
async def get_discord_bot_config():
    """Return current bot config. Token is never returned — only a masked preview."""
    setup = await db.setup.find_one({"_id": SETUP_DOC_ID}, {"_id": 0}) or {}
    cfg = setup.get("discord_bot") or {}
    tok = cfg.get("token") or ""
    return {
        "enabled": bool(cfg.get("enabled")),
        "token_set": bool(tok),
        "token_preview": (tok[:6] + "…" + tok[-4:]) if len(tok) > 12 else "",
        "status_guild_id": cfg.get("status_guild_id") or "",
        "status_channel_id": cfg.get("status_channel_id") or "",
        "status": scum_discord.get_status(),
    }


@api_router.put("/discord/bot")
async def update_discord_bot_config(payload: DiscordBotConfig):
    """Persist token/enabled flag and start or stop the bot. Token is stored
    in the manager setup doc but never returned to the client."""
    setup = await db.setup.find_one({"_id": SETUP_DOC_ID}, {"_id": 0}) or {}
    cfg = {**(setup.get("discord_bot") or {})}
    data = payload.model_dump(exclude_none=True)
    if "token" in data:
        cfg["token"] = (data["token"] or "").strip()
    if "enabled" in data:
        cfg["enabled"] = bool(data["enabled"])
    if "status_guild_id" in data:
        cfg["status_guild_id"] = (data["status_guild_id"] or "").strip()
    if "status_channel_id" in data:
        new_ch = (data["status_channel_id"] or "").strip()
        if new_ch != (cfg.get("status_channel_id") or ""):
            # Channel changed — clear remembered message ids so a fresh embed
            # is posted in the new channel.
            cfg["status_message_ids"] = {}
        cfg["status_channel_id"] = new_ch
    await db.setup.update_one(
        {"_id": SETUP_DOC_ID},
        {"$set": {"discord_bot": cfg}},
        upsert=True,
    )
    # Apply: start or stop the bot
    if cfg.get("enabled") and cfg.get("token"):
        if scum_discord.get_status().get("running"):
            await scum_discord.stop_bot()
        await scum_discord.start_bot(
            cfg["token"],
            _discord_state_collector,
            status_channel_id=cfg.get("status_channel_id") or None,
            message_id_store=_discord_message_id_store,
            initial_message_ids=cfg.get("status_message_ids") or {},
        )
    else:
        await scum_discord.stop_bot()

    return await get_discord_bot_config()


@api_router.get("/discord/bot/status")
async def get_discord_bot_status():
    return scum_discord.get_status()





@api_router.post("/servers/{server_id}/logs/scan")
async def scan_server_logs(server_id: str, limit: int = 20):
    """Walk {folder_path}/SCUM/Saved/SaveFiles/Logs/ and parse the `limit` most recent files.

    This is the "real server" path: when a SCUM server is actually writing logs on the
    host, calling this endpoint ingests everything new. Deduplication is by event id so
    re-scans are safe. Works on both Windows (backend bundled into Electron) and
    Linux/macOS (dev preview) — `pathlib.Path` handles both separator styles natively.
    """
    srv = await db.servers.find_one({"id": server_id}, {"_id": 0})
    if not srv:
        raise HTTPException(status_code=404, detail="Server not found")
    folder = srv["folder_path"]
    logs_dir = Path(folder) / "SCUM" / "Saved" / "SaveFiles" / "Logs"
    if not logs_dir.exists():
        return {"error": f"Logs directory not found: {logs_dir}", "scanned": 0}
    files = sorted(logs_dir.glob("*.log"), key=lambda p: p.stat().st_mtime, reverse=True)[:limit]
    total_parsed = 0
    total_stored = 0
    total_forwarded = 0
    per_file: List[Dict[str, Any]] = []
    for p in files:
        try:
            text = read_log_file(p)
            lt = detect_log_type(p.name)
            evs = parse_log_text(text, lt, filename=p.name, server_id=server_id)
            r = await _store_events_and_forward(server_id, evs)
            total_parsed += len(evs)
            total_stored += r["stored"]
            total_forwarded += r["forwarded"]
            per_file.append({"file": p.name, "type": lt, "parsed": len(evs), **r})
        except Exception as e:
            per_file.append({"file": p.name, "error": str(e)})
    return {"scanned": len(files), "parsed": total_parsed, "stored": total_stored, "forwarded": total_forwarded, "files": per_file}


@api_router.get("/servers/{server_id}/events")
async def list_server_events(
    server_id: str,
    type: Optional[str] = None,
    player: Optional[str] = None,
    limit: int = 200,
    since: Optional[str] = None,
):
    q: Dict[str, Any] = {"server_id": server_id}
    if type:
        q["type"] = type
    if player:
        q["$or"] = [{"player_name": {"$regex": player, "$options": "i"}}, {"steam_id": player}]
    if since:
        q["ts"] = {"$gt": since}
    limit = max(1, min(int(limit or 200), 1000))
    cur = db.server_events.find(q, {"_id": 0}).sort("ts", -1).limit(limit)
    events = await cur.to_list(limit)
    return {"server_id": server_id, "count": len(events), "events": events}


@api_router.get("/servers/{server_id}/events/stats")
async def server_event_stats(server_id: str, days: int = 0):
    """Aggregate counts per type. `days=0` (default) means all time."""
    match: Dict[str, Any] = {"server_id": server_id}
    if days and days > 0:
        cutoff = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()
        match["ts"] = {"$gt": cutoff}
    pipeline = [
        {"$match": match},
        {"$group": {"_id": "$type", "count": {"$sum": 1}}},
    ]
    rows = await db.server_events.aggregate(pipeline).to_list(100)
    by_type = {r["_id"]: r["count"] for r in rows}
    for t in LOG_TYPE_ORDER:
        by_type.setdefault(t, 0)
    top_pipe = [
        {"$match": {**match, "player_name": {"$nin": [None, ""]}}},
        {"$group": {"_id": "$player_name", "count": {"$sum": 1}}},
        {"$sort": {"count": -1}},
        {"$limit": 5},
    ]
    top_players = await db.server_events.aggregate(top_pipe).to_list(5)
    total = sum(by_type.values())
    return {"server_id": server_id, "total": total, "by_type": by_type, "top_players": [{"name": r["_id"], "count": r["count"]} for r in top_players]}


@api_router.delete("/servers/{server_id}/events")
async def clear_server_events(server_id: str):
    res = await db.server_events.delete_many({"server_id": server_id})
    await db.server_players.delete_many({"server_id": server_id})
    return {"deleted": res.deleted_count}


# ---------- PLAYERS REGISTRY ----------
@api_router.get("/servers/{server_id}/players")
async def list_players(server_id: str, online: Optional[bool] = None, search: Optional[str] = None):
    """Aggregate unique players across all ingested events for this server.

    For each steam_id we compute: first_seen, last_seen, last_name (most recent display name),
    is_online (last login event is connect without a subsequent disconnect), total event count,
    admin_flag (has ever executed an admin command), fame_delta_total, trade_amount_total,
    plus per-type event counts.
    """
    pipeline = [
        {"$match": {"server_id": server_id, "steam_id": {"$nin": [None, ""]}}},
        {"$sort": {"ts": 1}},
        {"$group": {
            "_id": "$steam_id",
            "first_seen": {"$first": "$ts"},
            "last_seen": {"$last": "$ts"},
            "last_name": {"$last": "$player_name"},
            "last_action": {"$last": "$action"},
            "last_event_type": {"$last": "$type"},
            "total_events": {"$sum": 1},
            "types": {"$push": "$type"},
            "fame_delta": {"$sum": {"$ifNull": ["$delta", 0]}},
            "trade_amount": {"$sum": {"$cond": [{"$eq": ["$type", "economy"]}, {"$ifNull": ["$amount", 0]}, 0]}},
            "is_admin_invoker": {"$max": {"$cond": [{"$eq": ["$type", "admin"]}, 1, 0]}},
        }},
    ]
    rows = await db.server_events.aggregate(pipeline).to_list(5000)

    # Compute online-state from ONLY login events (connect / disconnect transitions),
    # not from any arbitrary "last event". A player can chat / kill / trade while
    # still online; treating any non-login event as "offline" was causing the UI to
    # flip players to offline as soon as they chatted.
    login_pipe = [
        {"$match": {"server_id": server_id, "type": "login", "steam_id": {"$nin": [None, ""]}}},
        {"$sort": {"ts": 1}},
        {"$group": {
            "_id": "$steam_id",
            "last_login_action": {"$last": "$action"},
            "last_login_ts": {"$last": "$ts"},
        }},
    ]
    login_state = {r["_id"]: r for r in await db.server_events.aggregate(login_pipe).to_list(5000)}

    # A login that is older than 12h without a matching disconnect is almost
    # certainly a stale state (server restart wiped sessions). Treat it as offline.
    STALE_LOGIN_HOURS = 12
    now_dt = datetime.now(timezone.utc)

    # Also track kills scored (kill events where this sid is killer_steam_id)
    kills_pipe = [
        {"$match": {"server_id": server_id, "type": "kill", "killer_steam_id": {"$nin": [None, ""]}}},
        {"$group": {"_id": "$killer_steam_id", "kills": {"$sum": 1}}},
    ]
    kills_map = {r["_id"]: r["kills"] for r in await db.server_events.aggregate(kills_pipe).to_list(5000)}
    deaths_pipe = [
        {"$match": {"server_id": server_id, "type": "kill", "victim_steam_id": {"$nin": [None, ""]}}},
        {"$group": {"_id": "$victim_steam_id", "deaths": {"$sum": 1}}},
    ]
    deaths_map = {r["_id"]: r["deaths"] for r in await db.server_events.aggregate(deaths_pipe).to_list(5000)}

    # SCUM.db enrichment — pull current fame / vehicle / flag / squad counts
    # directly from the live game DB (SCUM.db). Log files only contain deltas,
    # never current totals, so this is the only way to show real numbers.
    srv_full = await db.servers.find_one({"id": server_id}, {"_id": 0, "folder_path": 1}) or {}
    db_stats: Dict[str, Dict[str, Any]] = {}
    if srv_full.get("folder_path"):
        try:
            db_stats = await asyncio.to_thread(scum_db.read_player_stats, srv_full["folder_path"])
        except Exception as e:
            logger.info("list_players: SCUM.db read failed (non-fatal): %s", e)

    players: List[Dict[str, Any]] = []
    for r in rows:
        types = r.pop("types", [])
        by_type: Dict[str, int] = {}
        for t in types:
            by_type[t] = by_type.get(t, 0) + 1
        sid = r.pop("_id")
        ls = login_state.get(sid) or {}
        last_login_action = ls.get("last_login_action") or ""
        last_login_ts = ls.get("last_login_ts")
        is_online = last_login_action in ("logged_in", "connected")
        if is_online and last_login_ts:
            try:
                age_h = (now_dt - datetime.fromisoformat(last_login_ts)).total_seconds() / 3600
                if age_h > STALE_LOGIN_HOURS:
                    is_online = False
            except Exception:
                pass
        db_row = db_stats.get(sid) or {}
        # Prefer SCUM.db fame; fall back to sum of fame events if DB unavailable
        fame = db_row.get("fame") if db_row.get("fame") is not None else float(r.get("fame_delta") or 0)
        player = {
            "steam_id": sid,
            "name": db_row.get("db_name") or r.get("last_name") or sid,
            "first_seen": r.get("first_seen"),
            "last_seen": r.get("last_seen"),
            "is_online": is_online,
            "total_events": r.get("total_events", 0),
            "fame": float(fame),
            "fame_delta": int(r.get("fame_delta") or 0),
            "trade_amount": int(r.get("trade_amount") or 0),
            "is_admin_invoker": bool(r.get("is_admin_invoker")),
            "kills": int(kills_map.get(sid, 0)),
            "deaths": int(deaths_map.get(sid, 0)),
            "by_type": by_type,
            # Live game-state — from SCUM.db. None means DB couldn't be read.
            "flag_count": db_row.get("flag_count"),
            "vehicle_count": db_row.get("vehicle_count"),
            "squad_vehicle_count": db_row.get("squad_vehicle_count"),
            "squad_name": db_row.get("squad_name"),
            "squad_id": db_row.get("squad_id"),
            # Wallet + playtime — from SCUM.db (nullable: column may not exist on this patch)
            "money": db_row.get("money"),
            "gold": db_row.get("gold"),
            "play_time_seconds": db_row.get("play_time_seconds"),
        }
        players.append(player)

    # Filters
    if online is not None:
        players = [p for p in players if p["is_online"] == online]
    if search:
        q = search.lower()
        players = [p for p in players if q in (p["name"] or "").lower() or q in p["steam_id"]]

    # Sort: online players first, then by last_seen descending
    players.sort(key=lambda p: (0 if p["is_online"] else 1, p["last_seen"] or ""), reverse=False)
    # Secondary: most-recent last_seen first (descending within each group)
    players.sort(key=lambda p: (0 if p["is_online"] else 1, -(datetime.fromisoformat(p["last_seen"]).timestamp() if p["last_seen"] else 0)))

    return {
        "server_id": server_id,
        "count": len(players),
        "online_count": sum(1 for p in players if p["is_online"]),
        "players": players,
    }


@api_router.get("/servers/{server_id}/players/{steam_id}")
async def get_player_detail(server_id: str, steam_id: str, limit: int = 50):
    """Return a single player's summary + their last N events."""
    # Reuse aggregator
    agg = await list_players(server_id, search=steam_id)
    player = next((p for p in agg["players"] if p["steam_id"] == steam_id), None)
    if not player:
        raise HTTPException(status_code=404, detail="Player not found in event history")

    # Fallback: if SCUM.db didn't expose play_time_seconds, compute total time
    # by pairing login events (connect -> disconnect). This is approximate —
    # if the server crashed before writing the disconnect line we'd miss that
    # session, but it's close enough for an admin overview.
    if player.get("play_time_seconds") in (None, 0):
        login_events = await db.server_events.find(
            {"server_id": server_id, "type": "login", "steam_id": steam_id},
            {"_id": 0, "ts": 1, "action": 1},
        ).sort("ts", 1).to_list(10000)
        total_secs = 0
        open_ts: Optional[datetime] = None
        for ev in login_events:
            action = (ev.get("action") or "").lower()
            try:
                ts = datetime.fromisoformat(ev["ts"]) if ev.get("ts") else None
            except Exception:
                ts = None
            if not ts:
                continue
            if action in ("logged_in", "connected") and open_ts is None:
                open_ts = ts
            elif action in ("logged_out", "disconnected") and open_ts is not None:
                total_secs += max(0, int((ts - open_ts).total_seconds()))
                open_ts = None
        # If the player is still online, count the still-open session up to now
        if open_ts is not None and player.get("is_online"):
            total_secs += max(0, int((datetime.now(timezone.utc) - open_ts).total_seconds()))
        if total_secs > 0:
            player["play_time_seconds"] = total_secs
            player["play_time_source"] = "logs"

    recent = await db.server_events.find(
        {"server_id": server_id, "$or": [{"steam_id": steam_id}, {"killer_steam_id": steam_id}, {"victim_steam_id": steam_id}]},
        {"_id": 0},
    ).sort("ts", -1).limit(max(1, min(int(limit or 50), 200))).to_list(200)
    return {"player": player, "recent_events": recent}


@api_router.get("/servers/{server_id}/discord", response_model=DiscordWebhookConfig)
async def get_discord_webhooks(server_id: str):
    srv = await db.servers.find_one({"id": server_id}, {"_id": 0}) or {}
    hooks = srv.get("discord_webhooks") or {}
    return DiscordWebhookConfig(**hooks)


@api_router.put("/servers/{server_id}/discord", response_model=DiscordWebhookConfig)
async def set_discord_webhooks(server_id: str, payload: DiscordWebhookConfig):
    data = payload.model_dump()
    await db.servers.update_one({"id": server_id}, {"$set": {"discord_webhooks": data}})
    return DiscordWebhookConfig(**data)


class DiscordTestPayload(BaseModel):
    event_type: str = "admin"
    webhook_url: str


@api_router.post("/servers/{server_id}/discord/test")
async def test_discord_webhook(server_id: str, payload: DiscordTestPayload):
    fake = {
        "type": payload.event_type,
        "ts": datetime.now(timezone.utc).isoformat(),
        "server_id": server_id,
        "source_file": "manual-test",
        "player_name": "LGSS Manager",
        "command": "test",
        "args": "This is a test notification from LGSS Manager.",
        "message": "Hello from the manager!",
        "action": "logged_in",
        "killer_name": "TestKiller", "victim_name": "TestVictim", "weapon": "M9", "distance_m": 42.0,
        "item_code": "Improvised_Metal_Chest", "quantity": 1, "amount": 1320, "trader": "A_0_Trader",
        "description": "Suspicious teleport pattern",
        "delta": 50,
        "raw": "Manual test event",
    }
    sent = await _forward_to_discord({payload.event_type: payload.webhook_url}, [fake])
    return {"sent": sent}


def _plan_config_files(settings: Dict[str, Any], folder_path: str) -> tuple[str, List[Dict[str, str]]]:
    """Return (config_dir, files) where files = [{path, content}, ...].
    Uses the correct path separator for the host OS so the plan is usable both
    for Electron IPC (Windows) and direct backend writes."""
    sep = "\\" if ("\\" in folder_path or (len(folder_path) >= 2 and folder_path[1] == ":")) else "/"
    config_dir = f"{folder_path}{sep}SCUM{sep}Saved{sep}Config{sep}WindowsServer"
    files = [
        {"path": f"{config_dir}{sep}ServerSettings.ini", "content": render_server_settings_ini(settings)},
        {"path": f"{config_dir}{sep}AdminUsers.ini", "content": render_user_list(settings.get("users_admins", []))},
        {"path": f"{config_dir}{sep}ServerSettingsAdminUsers.ini", "content": render_user_list(settings.get("users_server_admins", []))},
        {"path": f"{config_dir}{sep}BannedUsers.ini", "content": render_user_list(settings.get("users_banned", []))},
        {"path": f"{config_dir}{sep}WhitelistedUsers.ini", "content": render_user_list(settings.get("users_whitelisted", []))},
        {"path": f"{config_dir}{sep}ExclusiveUsers.ini", "content": render_user_list(settings.get("users_exclusive", []))},
        {"path": f"{config_dir}{sep}SilencedUsers.ini", "content": render_user_list(settings.get("users_silenced", []))},
        {"path": f"{config_dir}{sep}EconomyOverride.json", "content": render_economy_json(settings)},
        {"path": f"{config_dir}{sep}RaidTimes.json", "content": render_raid_times_json(settings)},
        {"path": f"{config_dir}{sep}Notifications.json", "content": render_notifications_json(settings)},
        {"path": f"{config_dir}{sep}Input.ini", "content": render_input_ini(settings)},
    ]
    return config_dir, files


def _write_config_files_for_doc(doc: Dict[str, Any]) -> Dict[str, Any]:
    """Write rendered SCUM config files directly to disk for the given server doc.
    Works on both Windows (backend bundled into Electron) and Linux/macOS (dev).
    Returns {written_count, written, errors, config_dir}."""
    settings = doc.get("settings", {}) or {}
    folder = doc["folder_path"]
    config_dir, files = _plan_config_files(settings, folder)
    written: List[str] = []
    errors: List[Dict[str, str]] = []
    try:
        Path(config_dir).mkdir(parents=True, exist_ok=True)
        for f in files:
            try:
                p = Path(f["path"])
                p.write_text(f["content"], encoding="utf-8")
                written.append(str(p))
            except Exception as e:
                errors.append({"path": f["path"], "error": str(e)})
    except Exception as e:
        errors.append({"path": config_dir, "error": str(e)})
    return {
        "config_dir": config_dir,
        "files": files,
        "count": len(files),
        "written_count": len(written),
        "written": written,
        "errors": errors,
        "wrote_to_disk": bool(written),
    }


@api_router.post("/servers/{server_id}/save-config")
async def save_server_config(server_id: str, write_to_disk: bool = True):
    """Render all manager settings into actual SCUM config files and write them to disk.

    Target directory: {folder_path}/SCUM/Saved/Config/WindowsServer/

    The backend writes files directly on whichever OS it runs on. When shipped
    inside the Electron app (PyInstaller bundle on Windows) this produces the
    real files SCUM reads. In Electron desktop the shell can also receive the
    same plan via `window.lgss.writeConfigFiles` for cross-process verification.
    """
    doc = await db.servers.find_one({"id": server_id}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Server not found")
    settings = doc.get("settings", {}) or {}
    folder = doc["folder_path"]
    config_dir, files = _plan_config_files(settings, folder)

    if not write_to_disk:
        return {
            "config_dir": config_dir,
            "files": files,
            "count": len(files),
            "written_count": 0,
            "written": [],
            "errors": [],
            "wrote_to_disk": False,
        }

    res = _write_config_files_for_doc(doc)
    return res


@api_router.post("/servers/{server_id}/first-boot", response_model=ServerProfile)
async def first_boot_server(server_id: str, timeout_sec: int = 120):
    """Run SCUMServer.exe once for a few seconds so the game generates its
    default `Saved/Config/WindowsServer/*.ini` files, then stop it and parse
    those real files back into the manager's settings.

    Called automatically by the frontend after a successful SteamCMD install.
    Safe to call manually afterwards (re-parses whatever is on disk).

    On non-Windows hosts this is a no-op (SCUMServer.exe is Windows-only) but
    we still parse any existing config files that may have been placed manually.
    """
    doc = await db.servers.find_one({"id": server_id}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Server not found")
    if not doc.get("installed"):
        raise HTTPException(status_code=400, detail="Server not installed yet")

    folder = doc["folder_path"]
    port = int(doc.get("game_port") or 7777)
    query_port = int(doc.get("query_port") or 7778)
    max_players = int(doc.get("max_players") or 64)

    # Actually boot SCUMServer.exe so it produces its config files.
    # Runs the blocking scum_proc.first_boot in a thread so we don't stall the
    # FastAPI event loop for 60+ seconds.
    def _run_boot() -> Dict[str, Any]:
        return scum_proc.first_boot(
            server_id=server_id,
            folder_path=folder,
            port=port,
            query_port=query_port,
            max_players=max_players,
            timeout_sec=timeout_sec,
        )
    try:
        boot_result = await asyncio.to_thread(_run_boot)
    except Exception as e:
        logger.exception("first_boot failed")
        raise HTTPException(status_code=500, detail=f"first_boot failed: {e}")

    # Parse whatever config files now exist (partial is OK; missing sections fall back to defaults).
    parsed = parse_real_config_dir(folder)
    # Merge parsed REAL values over the current settings; keep manager-only keys
    # like `notifications`, `custom_ini`, and `economy_traders` if the game didn't
    # produce them. SCUM never writes Notifications.json itself — preserve ours.
    current = {**(doc.get("settings") or {})}
    merged = {**current}
    for k, v in parsed.items():
        # Never overwrite manager-authored list/dict categories with empty parsed data
        if isinstance(v, (list, dict)) and not v:
            continue
        merged[k] = v
    # Explicitly keep manager-managed fields if parse produced blanks
    if not parsed.get("notifications"):
        merged["notifications"] = current.get("notifications", [])
    if not parsed.get("custom_ini"):
        merged["custom_ini"] = current.get("custom_ini", {
            "ExtraServerSettings": "", "ExtraGameSettings": "", "ExtraEngineSettings": "",
        })

    await db.servers.update_one({"id": server_id}, {"$set": {"settings": merged, "status": "Stopped"}})
    doc["settings"] = merged
    doc["status"] = "Stopped"

    # Persist anything we have back to disk so next boot reflects what the user sees.
    try:
        _write_config_files_for_doc(doc)
    except Exception:
        logger.exception("first_boot: post-parse write failed (non-fatal)")

    # Attach boot telemetry to the response via a side-channel (saved under meta).
    # (ServerProfile does not include these fields, but the frontend polls /first-boot for the raw result.)
    REGISTRY_KEY = f"lgss-first-boot-{server_id}"
    await db.app_meta.update_one(
        {"_id": REGISTRY_KEY},
        {"$set": {**boot_result, "at": datetime.now(timezone.utc).isoformat()}},
        upsert=True,
    )
    return ServerProfile(**doc)


@api_router.get("/servers/{server_id}/first-boot/result")
async def first_boot_result(server_id: str):
    """Returns the most recent `first-boot` outcome for this server."""
    doc = await db.app_meta.find_one({"_id": f"lgss-first-boot-{server_id}"}, {"_id": 0})
    return doc or {"ok": False, "files_found": [], "error": "never_run"}


# ---------- MANAGER VERSION / SELF-UPDATE ----------
CURRENT_MANAGER_VERSION = "1.0.0"
LATEST_MANAGER_VERSION_KEY = "manager-latest-version"


@api_router.get("/app/version")
async def get_app_version():
    doc = await db.app_meta.find_one({"_id": LATEST_MANAGER_VERSION_KEY}, {"_id": 0})
    latest = (doc or {}).get("version", CURRENT_MANAGER_VERSION)
    return {
        "current": CURRENT_MANAGER_VERSION,
        "latest": latest,
        "update_available": latest != CURRENT_MANAGER_VERSION,
        "notes": (doc or {}).get("notes", ""),
    }


class ManagerReleasePublish(BaseModel):
    version: str
    notes: Optional[str] = ""


@api_router.post("/app/release")
async def publish_manager_release(payload: ManagerReleasePublish):
    """Admin-only endpoint used by the main agent to push a new manager release.
    Users' UI shows a pulsing 'Manager Update' button whenever latest != current."""
    await db.app_meta.update_one(
        {"_id": LATEST_MANAGER_VERSION_KEY},
        {"$set": {"version": payload.version, "notes": payload.notes, "published_at": datetime.now(timezone.utc).isoformat()}},
        upsert=True,
    )
    return {"ok": True, "latest": payload.version}


@api_router.post("/app/apply-update")
async def apply_manager_update():
    """In web preview this simply acknowledges the update. In Electron the shell triggers
    auto-updater + relaunch. Here we just bump the local 'current' record."""
    return {"ok": True, "message": "Update acknowledged. In desktop build Electron will download and relaunch."}


# ---------- SCUM FILE EXPORT / IMPORT ----------
EXPORT_MAP = {
    "admins": ("AdminUsers.ini", lambda s: render_user_list(s.get("users_admins", []))),
    "server_admins": ("ServerSettingsAdminUsers.ini", lambda s: render_user_list(s.get("users_server_admins", []))),
    "banned": ("BannedUsers.ini", lambda s: render_user_list(s.get("users_banned", []))),
    "exclusive": ("ExclusiveUsers.ini", lambda s: render_user_list(s.get("users_exclusive", []))),
    "whitelisted": ("WhitelistedUsers.ini", lambda s: render_user_list(s.get("users_whitelisted", []))),
    "silenced": ("SilencedUsers.ini", lambda s: render_user_list(s.get("users_silenced", []))),
    "economy": ("EconomyOverride.json", lambda s: render_economy_json(s)),
    "gameusersettings": ("GameUserSettings.ini", lambda s: render_gameusersettings_ini(s)),
    "server_settings": ("ServerSettings.ini", lambda s: render_server_settings_ini(s)),
    "raid_times": ("RaidTimes.json", lambda s: render_raid_times_json(s)),
    "notifications": ("Notifications.json", lambda s: render_notifications_json(s)),
    "input": ("Input.ini", lambda s: render_input_ini(s)),
}


USER_LIST_IMPORT_MAP = {
    "admins": "users_admins",
    "server_admins": "users_server_admins",
    "banned": "users_banned",
    "exclusive": "users_exclusive",
    "whitelisted": "users_whitelisted",
    "silenced": "users_silenced",
}


@api_router.get("/servers/{server_id}/export/{file_key}")
async def export_server_file(server_id: str, file_key: str):
    doc = await db.servers.find_one({"id": server_id}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Server not found")
    if file_key not in EXPORT_MAP:
        raise HTTPException(status_code=400, detail="Unknown file_key")
    filename, renderer = EXPORT_MAP[file_key]
    settings = doc.get("settings", {})
    return {"filename": filename, "content": renderer(settings)}


@api_router.post("/servers/{server_id}/import/{file_key}")
async def import_server_file(server_id: str, file_key: str, payload: Dict[str, Any]):
    """Import a raw file content string and merge into server settings."""
    text = payload.get("content", "")
    doc = await db.servers.find_one({"id": server_id}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Server not found")
    try:
        settings = _apply_file_to_settings(doc.get("settings", {}), file_key, text)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    await db.servers.update_one({"id": server_id}, {"$set": {"settings": settings}})
    doc["settings"] = settings
    return ServerProfile(**doc)


def _apply_file_to_settings(current: Dict[str, Any], file_key: str, text: str) -> Dict[str, Any]:
    """Pure function: take current settings + file key + raw text, return updated settings.
    Raises ValueError if the file cannot be parsed. Used by both single-file and bulk import."""
    settings = {**current}
    if file_key in USER_LIST_IMPORT_MAP:
        settings[USER_LIST_IMPORT_MAP[file_key]] = parse_user_list_text(text)
    elif file_key == "economy":
        try:
            data = json_lib.loads(text)
        except json_lib.JSONDecodeError as e:
            raise ValueError(f"Invalid JSON: {e}") from e
        overrides = data.get("economy-override", data)
        settings["economy_override"] = {k: v for k, v in overrides.items() if not isinstance(v, (dict, list))}
        traders = overrides.get("traders")
        if isinstance(traders, dict):
            settings["economy_traders"] = traders
    elif file_key == "gameusersettings":
        tmp_path = Path("/tmp/_gus.ini")
        tmp_path.write_text(text, encoding="utf-8")
        sects = parse_ini_sections(tmp_path)
        if not sects:
            raise ValueError("No [Section] headers found — not a valid GameUserSettings.ini")
        for sect, dest in (("Game", "client_game"), ("Mouse", "client_mouse"), ("Video", "client_video"), ("Graphics", "client_graphics"), ("Sound", "client_sound")):
            if sect in sects:
                settings[dest] = sects[sect]
    elif file_key == "server_settings":
        tmp_path = Path("/tmp/_ss.ini")
        tmp_path.write_text(text, encoding="utf-8")
        sects = parse_ini_sections(tmp_path)
        if not sects:
            raise ValueError("No [Section] headers found — not a valid ServerSettings.ini")
        if "General" not in sects:
            raise ValueError("Missing [General] section — does not look like a SCUM ServerSettings.ini")
        for sect, dest in (("General", "srv_general"), ("World", "srv_world"), ("Respawn", "srv_respawn"), ("Vehicles", "srv_vehicles"), ("Damage", "srv_damage"), ("Features", "srv_features")):
            if sect in sects:
                settings[dest] = sects[sect]
    elif file_key == "raid_times":
        try:
            data = json_lib.loads(text)
        except json_lib.JSONDecodeError as e:
            raise ValueError(f"Invalid JSON: {e}") from e
        settings["raid_times"] = data.get("raiding-times", [])
    elif file_key == "notifications":
        try:
            data = json_lib.loads(text)
        except json_lib.JSONDecodeError as e:
            raise ValueError(f"Invalid JSON: {e}") from e
        settings["notifications"] = data.get("Notifications", [])
    elif file_key == "input":
        tmp_path = Path("/tmp/_in.ini")
        tmp_path.write_text(text, encoding="utf-8")
        parsed = parse_input_ini(tmp_path)
        settings["input_axis"] = parsed["AxisMappings"]
        settings["input_action"] = parsed["ActionMappings"]
    else:
        raise ValueError(f"Unknown file_key: {file_key}")
    return settings


IMPORT_FILE_KEYS = [
    "server_settings", "gameusersettings", "economy", "raid_times",
    "notifications", "input", "admins", "server_admins",
    "banned", "whitelisted", "exclusive", "silenced",
]


@api_router.post("/servers/{server_id}/import-bulk")
async def import_server_files_bulk(
    server_id: str,
    files: List[UploadFile] = File(...),
    file_keys: str = Form(...),  # comma-separated keys parallel to files
):
    """Import multiple SCUM config files at once. Files not uploaded keep their current values.

    `file_keys` is a comma-separated list of IMPORT_FILE_KEYS in the same order as `files`.
    Returns per-file result: { imported, errored, results: [{file_key, filename, ok, error}] }.
    """
    doc = await db.servers.find_one({"id": server_id}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Server not found")
    keys = [k.strip() for k in (file_keys or "").split(",") if k.strip()]
    if len(keys) != len(files):
        raise HTTPException(status_code=400, detail=f"file_keys count ({len(keys)}) must equal files count ({len(files)})")

    settings = {**doc.get("settings", {})}
    results: List[Dict[str, Any]] = []
    imported = 0
    errored = 0
    for fk, up in zip(keys, files):
        try:
            raw = await up.read()
            # Try UTF-8 first, fall back to UTF-16 (SCUM's own logs use this)
            try:
                text = raw.decode("utf-8-sig")
            except UnicodeDecodeError:
                text = raw.decode("utf-16", errors="replace")
            if fk not in IMPORT_FILE_KEYS:
                raise ValueError(f"Unsupported file_key '{fk}'")
            settings = _apply_file_to_settings(settings, fk, text)
            results.append({"file_key": fk, "filename": up.filename, "ok": True, "error": None})
            imported += 1
        except Exception as e:
            results.append({"file_key": fk, "filename": up.filename, "ok": False, "error": str(e)})
            errored += 1

    if imported:
        await db.servers.update_one({"id": server_id}, {"$set": {"settings": settings}})
        doc["settings"] = settings
    return {
        "server_id": server_id,
        "imported": imported,
        "errored": errored,
        "results": results,
        "server": ServerProfile(**doc).model_dump(),
    }


# ---------- RESTART / BULK POWER ACTIONS ----------
@api_router.post("/servers/{server_id}/restart", response_model=ServerProfile)
async def restart_server(server_id: str):
    """Stop -> Start cycle. In Electron this sequences SCUMServer.exe."""
    doc = await db.servers.find_one({"id": server_id}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Server not found")
    if not doc.get("installed"):
        raise HTTPException(status_code=400, detail="Server not installed")
    mark_expected_stop(server_id)
    await db.servers.update_one({"id": server_id}, {"$set": {"status": "Updating"}})
    await asyncio.sleep(0.4)
    await db.servers.update_one({"id": server_id}, {"$set": {"status": "Stopped"}})
    await asyncio.sleep(0.3)
    await db.servers.update_one({"id": server_id}, {"$set": {"status": "Running"}})
    doc["status"] = "Running"
    return ServerProfile(**doc)


@api_router.post("/servers/bulk/stop-all")
async def stop_all_servers():
    servers = await db.servers.find({"installed": True, "status": "Running"}, {"_id": 0}).to_list(500)
    for s in servers:
        mark_expected_stop(s["id"])
        await db.servers.update_one({"id": s["id"]}, {"$set": {"status": "Stopped"}})
    return {"stopped": len(servers)}


@api_router.post("/servers/bulk/restart-all")
async def restart_all_servers():
    servers = await db.servers.find({"installed": True}, {"_id": 0}).to_list(500)
    affected = 0
    for s in servers:
        if s.get("status") == "Running":
            mark_expected_stop(s["id"])
            await db.servers.update_one({"id": s["id"]}, {"$set": {"status": "Stopped"}})
            await asyncio.sleep(0.2)
            await db.servers.update_one({"id": s["id"]}, {"$set": {"status": "Running"}})
            affected += 1
        elif s.get("status") == "Stopped":
            await db.servers.update_one({"id": s["id"]}, {"$set": {"status": "Running"}})
            affected += 1
    return {"restarted": affected}


# ---------- SCHEMA METADATA (FUNCTIONAL GROUPING) ----------
# Categories are grouped by purpose rather than source file. Each category may:
# - point to a `sourceKey` (storage location) and a list of `fieldKeys` to show (filters)
# - or use a specialized renderer (user_list, raid_times, notifications, traders, input)
@api_router.get("/settings/schema")
async def get_settings_schema():
    return {
        "sections": [
            {"key": "essentials", "labelKey": "sec_essentials"},
            {"key": "gameplay", "labelKey": "sec_gameplay"},
            {"key": "world", "labelKey": "sec_world"},
            {"key": "economy", "labelKey": "sec_economy"},
            {"key": "security", "labelKey": "sec_security"},
            {"key": "users", "labelKey": "sec_users"},
            {"key": "advanced", "labelKey": "sec_advanced"},
            {"key": "automation", "labelKey": "sec_automation"},
            {"key": "discord", "labelKey": "sec_discord"},
        ],
        "categories": [
            # ------ ESSENTIALS ------
            {"key": "essentials_identity", "labelKey": "cat_essentials_identity", "icon": "Tag", "section": "essentials",
             "renderer": "dynamic", "sourceKey": "srv_general", "exportKey": "server_settings",
             "fieldKeys": ["scum.ServerName", "scum.ServerDescription", "scum.ServerBannerUrl", "scum.ServerPlaystyle",
                           "scum.WelcomeMessage", "scum.MessageOfTheDay", "scum.MessageOfTheDayCooldown"]},
            {"key": "essentials_access", "labelKey": "cat_essentials_access", "icon": "KeyRound", "section": "essentials",
             "renderer": "dynamic", "sourceKey": "srv_general", "exportKey": "server_settings",
             "fieldKeys": ["scum.ServerPassword", "scum.MaxPlayers"]},
            {"key": "essentials_performance", "labelKey": "cat_essentials_performance", "icon": "Gauge", "section": "essentials",
             "renderer": "dynamic", "sourceKey": "srv_general", "exportKey": "server_settings",
             "fieldKeys": ["scum.MinServerTickRate", "scum.MaxServerTickRate", "scum.MaxPingCheckEnabled", "scum.MaxPing",
                           "scum.MasterServerUpdateSendInterval"]},
            {"key": "essentials_wipe", "labelKey": "cat_essentials_wipe", "icon": "Eraser", "section": "essentials",
             "renderer": "dynamic", "sourceKey": "srv_general", "exportKey": "server_settings",
             "fieldKeys": ["scum.PartialWipe", "scum.GoldWipe", "scum.FullWipe"]},

            # ------ GAMEPLAY ------
            {"key": "gameplay_view", "labelKey": "cat_gameplay_view", "icon": "Eye", "section": "gameplay",
             "renderer": "dynamic", "sourceKey": "srv_general", "exportKey": "server_settings",
             "fieldKeys": ["scum.AllowFirstPerson", "scum.AllowThirdPerson", "scum.AllowCrosshair", "scum.AllowMapScreen",
                           "scum.HideKillNotification", "scum.DisableExamineGhost"]},
            {"key": "gameplay_pvp_rules", "labelKey": "cat_gameplay_pvp_rules", "icon": "Swords", "section": "gameplay",
             "renderer": "dynamic", "sourceKey": "srv_general", "exportKey": "server_settings",
             "fieldKeys": ["scum.AllowKillClaiming", "scum.AllowComa", "scum.AllowMinesAndTraps", "scum.AllowSkillGainInSafeZones",
                           "scum.AllowEvents", "scum.LogoutTimer", "scum.LogoutTimerWhileCaptured", "scum.LogoutTimerInBunker"]},
            {"key": "gameplay_chat", "labelKey": "cat_gameplay_chat", "icon": "MessageCircle", "section": "gameplay",
             "renderer": "dynamic", "sourceKey": "srv_general", "exportKey": "server_settings",
             "fieldKeys": ["scum.LimitGlobalChat", "scum.AllowGlobalChat", "scum.AllowLocalChat", "scum.AllowSquadChat", "scum.AllowAdminChat"]},
            {"key": "gameplay_voting", "labelKey": "cat_gameplay_voting", "icon": "Vote", "section": "gameplay",
             "renderer": "dynamic", "sourceKey": "srv_general", "exportKey": "server_settings",
             "fieldKeys": ["scum.AllowVoting", "scum.VotingDuration", "scum.PlayerMinimalVotingInterest", "scum.PlayerPositiveVotePercentage"]},
            {"key": "gameplay_respawn", "labelKey": "cat_gameplay_respawn", "icon": "RotateCcw", "section": "gameplay",
             "renderer": "dynamic", "sourceKey": "srv_respawn", "exportKey": "server_settings"},
            {"key": "gameplay_damage", "labelKey": "cat_gameplay_damage", "icon": "Swords", "section": "gameplay",
             "renderer": "dynamic", "sourceKey": "srv_damage", "exportKey": "server_settings"},
            {"key": "gameplay_progression", "labelKey": "cat_gameplay_progression", "icon": "TrendingUp", "section": "gameplay",
             "renderer": "dynamic", "sourceKey": "srv_general", "exportKey": "server_settings",
             "fieldKeys": ["scum.FameGainMultiplier", "scum.FamePointPenaltyOnDeath", "scum.FamePointPenaltyOnKilled",
                           "scum.FamePointRewardOnKill", "scum.LogSuicides", "scum.EnableSpawnOnGround"]},
            {"key": "gameplay_skills", "labelKey": "cat_gameplay_skills", "icon": "GraduationCap", "section": "gameplay",
             "renderer": "dynamic", "sourceKey": "srv_features", "exportKey": "server_settings",
             "fieldKeys": ["scum.ArcherySkillMultiplier", "scum.AviationSkillMultiplier", "scum.AwarenessSkillMultiplier",
                           "scum.BrawlingSkillMultiplier", "scum.CamouflageSkillMultiplier", "scum.CookingSkillMultiplier",
                           "scum.DemolitionSkillMultiplier", "scum.DrivingSkillMultiplier", "scum.EnduranceSkillMultiplier",
                           "scum.EngineeringSkillMultiplier", "scum.FarmingSkillMultiplier", "scum.HandgunSkillMultiplier",
                           "scum.MedicalSkillMultiplier", "scum.MeleeWeaponsSkillMultiplier", "scum.MotorcycleSkillMultiplier",
                           "scum.RiflesSkillMultiplier", "scum.RunningSkillMultiplier", "scum.SnipingSkillMultiplier",
                           "scum.StealthSkillMultiplier", "scum.SurvivalSkillMultiplier", "scum.ThieverySkillMultiplier"]},
            {"key": "gameplay_stamina", "labelKey": "cat_gameplay_stamina", "icon": "Activity", "section": "gameplay",
             "renderer": "dynamic", "sourceKey": "srv_features", "exportKey": "server_settings",
             "fieldKeys": ["scum.MovementInertiaAmount", "scum.StaminaDrainOnJumpMultiplier", "scum.StaminaDrainOnClimbMultiplier",
                           "scum.DisableExhaustion", "scum.BodySimulationSpeedMultiplier"]},
            {"key": "gameplay_new_players", "labelKey": "cat_gameplay_new_players", "icon": "UserPlus", "section": "gameplay",
             "renderer": "dynamic", "sourceKey": "srv_features", "exportKey": "server_settings",
             "fieldKeys": ["scum.EnableNewPlayerProtection", "scum.NewPlayerProtectionDuration", "scum.NameChangeCooldown", "scum.NameChangeCost"]},

            # ------ WORLD ------
            {"key": "world_time", "labelKey": "cat_world_time", "icon": "Clock", "section": "world",
             "renderer": "dynamic", "sourceKey": "srv_world", "exportKey": "server_settings",
             "fieldKeys": ["scum.StartTimeOfDay", "scum.TimeOfDaySpeed", "scum.NighttimeDarkness", "scum.SunriseTime", "scum.SunsetTime", "scum.EnableFog"]},
            {"key": "world_spawn_limits", "labelKey": "cat_world_spawn_limits", "icon": "Users", "section": "world",
             "renderer": "dynamic", "sourceKey": "srv_world", "exportKey": "server_settings",
             "fieldKeys": ["scum.MaxAllowedBirds", "scum.MaxAllowedCharacters", "scum.MaxAllowedPuppets",
                           "scum.MaxAllowedAnimals", "scum.MaxAllowedNPCs", "scum.MaxAllowedDrones"]},
            {"key": "world_puppets", "labelKey": "cat_world_puppets", "icon": "Skull", "section": "world",
             "renderer": "dynamic", "sourceKey": "srv_world", "exportKey": "server_settings",
             "fieldKeys": ["scum.PuppetsCanOpenDoors", "scum.PuppetsCanVaultWindows", "scum.PuppetHealthMultiplier",
                           "scum.PuppetRunningSpeedMultiplier", "scum.PuppetLimpingEnabled", "scum.DisableSuicidePuppetSpawning"]},
            {"key": "world_armed_npcs", "labelKey": "cat_world_armed_npcs", "icon": "Crosshair", "section": "world",
             "renderer": "dynamic", "sourceKey": "srv_world", "exportKey": "server_settings",
             "fieldKeys": ["scum.ArmedNPCDifficultyLevel", "scum.ArmedNPCHealthMultiplier", "scum.ArmedNPCDamageMultiplier",
                           "scum.ArmedNPCSpreadMultiplier", "scum.ArmedNPCRunningSpeedMultiplier", "scum.ArmedNPCLimpingEnabled",
                           "scum.ProbabilityForArmedNPCToDropItemFromHandsWhenSearched"]},
            {"key": "world_sentries", "labelKey": "cat_world_sentries", "icon": "Radar", "section": "world",
             "renderer": "dynamic", "sourceKey": "srv_world", "exportKey": "server_settings",
             "fieldKeys": ["scum.DisableSentrySpawning", "scum.EnableSentryRespawning", "scum.SentryHealthMultiplier",
                           "scum.BaseBuildingAttackerSentryHealthMultiplier", "scum.DropshipHealthMultiplier"]},
            {"key": "world_animals", "labelKey": "cat_world_animals", "icon": "Rabbit", "section": "world",
             "renderer": "dynamic", "sourceKey": "srv_world", "exportKey": "server_settings",
             "fieldKeys": ["scum.BearMaxHealthMultiplier", "scum.BoarMaxHealthMultiplier", "scum.ChickenMaxHealthMultiplier",
                           "scum.DeerMaxHealthMultiplier", "scum.DonkeyMaxHealthMultiplier", "scum.GoatMaxHealthMultiplier",
                           "scum.HorseMaxHealthMultiplier", "scum.RabbitMaxHealthMultiplier", "scum.WolfMaxHealthMultiplier"]},
            {"key": "world_hunts", "labelKey": "cat_world_hunts", "icon": "Target", "section": "world",
             "renderer": "dynamic", "sourceKey": "srv_world", "exportKey": "server_settings",
             "fieldKeys": ["scum.MaxAllowedHunts", "scum.HuntFailureTime", "scum.HuntFailureDistance",
                           "scum.HuntTriggerChanceOverride_ContinentalForest", "scum.HuntTriggerChanceOverride_ContinentalMeadow",
                           "scum.HuntTriggerChanceOverride_Mediterranean", "scum.HuntTriggerChanceOverride_Mountain",
                           "scum.HuntTriggerChanceOverride_Urban", "scum.HuntTriggerChanceOverride_Village"]},
            {"key": "world_bunkers", "labelKey": "cat_world_bunkers", "icon": "DoorClosed", "section": "world",
             "renderer": "dynamic", "sourceKey": "srv_world", "exportKey": "server_settings",
             "fieldKeys": ["scum.AbandonedBunkerMaxSimultaneouslyActive", "scum.AbandonedBunkerActiveDurationHours",
                           "scum.AbandonedBunkerKeyCardActiveDurationHours", "scum.SecretBunkerKeyCardActiveDurationHours",
                           "scum.MaxAllowedKillboxKeycards", "scum.MaxAllowedKillboxKeycards_PoliceStation",
                           "scum.MaxAllowedKillboxKeycards_RadiationZone", "scum.AbandonedBunkerBCUTerminalCooldown"]},
            {"key": "world_cargo", "labelKey": "cat_world_cargo", "icon": "Package", "section": "world",
             "renderer": "dynamic", "sourceKey": "srv_world", "exportKey": "server_settings",
             "fieldKeys": ["scum.CargoDropCooldownMinimum", "scum.CargoDropCooldownMaximum", "scum.CargoDropFallDelay",
                           "scum.CargoDropFallDuration", "scum.CargoDropSelfdestructTime"]},
            {"key": "world_encounters", "labelKey": "cat_world_encounters", "icon": "Zap", "section": "world",
             "renderer": "dynamic", "sourceKey": "srv_world", "exportKey": "server_settings",
             "fieldKeys": ["scum.EncounterBaseCharacterAmountMultiplier", "scum.EncounterExtraCharacterPerPlayerMultiplier",
                           "scum.EncounterExtraCharacterPlayerCapMultiplier", "scum.EncounterCharacterRespawnTimeMultiplier",
                           "scum.EncounterHordeActivationChanceMultiplier", "scum.EncounterHordeSpawnDistanceMultiplier",
                           "scum.EncounterNeverRespawnCharacters", "scum.PuppetWorldEncounterSpawnWeightMultiplier"]},
            {"key": "world_map", "labelKey": "cat_world_map", "icon": "Map", "section": "world",
             "renderer": "dynamic", "sourceKey": "srv_world", "exportKey": "server_settings",
             "fieldKeys": ["scum.CustomMapEnabled", "scum.CustomMapCenterXCoordinate", "scum.CustomMapCenterYCoordinate",
                           "scum.CustomMapWidth", "scum.CustomMapHeight", "scum.ShouldDestroyEntitiesOutsideMapLimitsOnRestart"]},

            # ------ ECONOMY ------
            {"key": "economy_main", "labelKey": "cat_economy_main", "icon": "Banknote", "section": "economy",
             "renderer": "dynamic", "sourceKey": "economy_override", "exportKey": "economy"},
            {"key": "economy_traders", "labelKey": "cat_economy_traders", "icon": "Store", "section": "economy",
             "renderer": "traders", "sourceKey": "economy_traders", "exportKey": "economy"},
            {"key": "economy_resources", "labelKey": "cat_economy_resources", "icon": "Droplet", "section": "economy",
             "renderer": "dynamic", "sourceKey": "srv_features", "exportKey": "server_settings",
             "fieldKeys": ["scum.WaterPricePerUnitMultiplier", "scum.WaterPeriodicInitialAmountMultiplier", "scum.WaterPeriodicMaxAmountMultiplier",
                           "scum.WaterPeriodicReplenishAmountMultiplier", "scum.WaterPeriodicReplenishIntervalMultiplier",
                           "scum.GasolinePricePerUnitMultiplier", "scum.GasolinePeriodicInitialAmountMultiplier", "scum.GasolinePeriodicMaxAmountMultiplier",
                           "scum.PropanePricePerUnitMultiplier", "scum.PropanePeriodicInitialAmountMultiplier"]},
            {"key": "economy_vehicles_stock", "labelKey": "cat_economy_vehicles_stock", "icon": "Truck", "section": "economy",
             "renderer": "dynamic", "sourceKey": "srv_vehicles", "exportKey": "server_settings"},
            {"key": "economy_loot", "labelKey": "cat_economy_loot", "icon": "Package", "section": "economy",
             "renderer": "dynamic", "sourceKey": "srv_features", "exportKey": "server_settings",
             "fieldKeys": ["scum.SpawnerProbabilityMultiplier", "scum.ExamineSpawnerProbabilityMultiplier",
                           "scum.ExamineSpawnerExpirationTimeMultiplier", "scum.SpawnerExpirationTimeMultiplier",
                           "scum.EnableItemCooldownGroups", "scum.ItemCooldownGroupsDurationMultiplier"]},
            {"key": "economy_quests", "labelKey": "cat_economy_quests", "icon": "ScrollText", "section": "economy",
             "renderer": "dynamic", "sourceKey": "srv_features", "exportKey": "server_settings",
             "fieldKeys": ["scum.QuestsEnabled", "scum.QuestsGlobalCycleDuration", "scum.MaxQuestsPerCyclePerTrader",
                           "scum.MaxSimultaneousQuestsPerTrader", "scum.QuestsTraderRefillCooldown",
                           "scum.QuestsPhoneRefillCooldown", "scum.QuestsNoticeBoardRefillCooldown", "scum.QuestRequirementsBlockTradeableItems"]},

            # ------ SECURITY (Raid & Base) ------
            {"key": "security_base_building", "labelKey": "cat_security_base_building", "icon": "Hammer", "section": "security",
             "renderer": "dynamic", "sourceKey": "srv_features", "exportKey": "server_settings",
             "fieldKeys": ["scum.FlagOvertakeDuration", "scum.MaximumAmountOfElementsPerFlag",
                           "scum.ExtraElementsPerFlagForAdditionalSquadMember", "scum.MaximumNumberOfExpandedElementsPerFlag",
                           "scum.AllowMultipleFlagsPerPlayer", "scum.AllowFlagPlacementOnBBElements",
                           "scum.AllowFloorPlacementOnHalfAndLowWalls", "scum.AllowWallPlacementOnHalfAndLowWalls",
                           "scum.ChestAcquisitionDuration"]},
            {"key": "security_raid_protection", "labelKey": "cat_security_raid_protection", "icon": "ShieldAlert", "section": "security",
             "renderer": "dynamic", "sourceKey": "srv_features", "exportKey": "server_settings",
             "fieldKeys": ["scum.RaidProtectionType", "scum.RaidProtectionEnableLog",
                           "scum.RaidProtectionFlagSpecificChangeSettingCooldown", "scum.RaidProtectionFlagSpecificChangeSettingPrice",
                           "scum.RaidProtectionFlagSpecificMaxProtectionTime", "scum.RaidProtectionOfflineProtectionStartDelay",
                           "scum.RaidProtectionOfflineMaxProtectionTime", "scum.RaidProtectionGlobalShouldShowRaidTimesMessage",
                           "scum.RaidProtectionGlobalShouldShowRaidAnnouncementMessage", "scum.RaidProtectionGlobalShouldShowRaidStartEndMessages"]},
            {"key": "security_raid_times", "labelKey": "cat_security_raid_times", "icon": "CalendarClock", "section": "security",
             "renderer": "raid_times", "sourceKey": "raid_times", "exportKey": "raid_times"},
            {"key": "security_turrets", "labelKey": "cat_security_turrets", "icon": "Crosshair", "section": "security",
             "renderer": "dynamic", "sourceKey": "srv_features", "exportKey": "server_settings",
             "fieldKeys": ["scum.TurretsAttackPrisoners", "scum.TurretsAttackPuppets", "scum.TurretsAttackVehicles",
                           "scum.TurretsAttackSentries", "scum.TurretsAttackAnimals", "scum.TurretsAttackArmedNPCs"]},
            {"key": "security_anticheat", "labelKey": "cat_security_anticheat", "icon": "ShieldCheck", "section": "security",
             "renderer": "dynamic", "sourceKey": "srv_general", "exportKey": "server_settings",
             "fieldKeys": ["scum.RustyLocksLogging", "scum.PlaySafeIdProtection", "scum.DeleteInactiveUsers",
                           "scum.DaysSinceLastLoginToBecomeInactive", "scum.DeleteBannedUsers", "scum.LogChestOwnership"]},

            # ------ USERS ------
            {"key": "users_admins", "labelKey": "cat_users_admins", "icon": "ShieldUser", "renderer": "user_list",
             "exportKey": "admins", "commonFlags": ["godmode", "moderator", "ghost", "commentator"], "section": "users"},
            {"key": "users_server_admins", "labelKey": "cat_users_server_admins", "icon": "UserCog", "renderer": "user_list",
             "exportKey": "server_admins", "commonFlags": ["serveradmin"], "section": "users"},
            {"key": "users_whitelisted", "labelKey": "cat_users_whitelisted", "icon": "ListChecks", "renderer": "user_list",
             "exportKey": "whitelisted", "commonFlags": ["vip"], "section": "users"},
            {"key": "users_exclusive", "labelKey": "cat_users_exclusive", "icon": "UserCheck", "renderer": "user_list",
             "exportKey": "exclusive", "commonFlags": ["vip"], "section": "users"},
            {"key": "users_banned", "labelKey": "cat_users_banned", "icon": "UserX", "renderer": "user_list",
             "exportKey": "banned", "commonFlags": ["permanent"], "section": "users"},
            {"key": "users_silenced", "labelKey": "cat_users_silenced", "icon": "MicOff", "renderer": "user_list",
             "exportKey": "silenced", "commonFlags": ["voice", "chat"], "section": "users"},

            # ------ ADVANCED ------
            {"key": "advanced_vehicles_physics", "labelKey": "cat_advanced_vehicles_physics", "icon": "Fuel", "section": "advanced",
             "renderer": "dynamic", "sourceKey": "srv_vehicles", "exportKey": "server_settings",
             "fieldKeys": ["scum.FuelDrainFromEngineMultiplier", "scum.BatteryDrainFromEngineMultiplier",
                           "scum.BatteryDrainFromDevicesMultiplier", "scum.BatteryDrainFromInactivityMultiplier",
                           "scum.BatteryChargeWithAlternatorMultiplier", "scum.BatteryChargeWithDynamoMultiplier",
                           "scum.MaximumTimeOfVehicleInactivity", "scum.MaximumTimeForVehiclesInForbiddenZones",
                           "scum.LogVehicleDestroyed"]},
            {"key": "advanced_squads", "labelKey": "cat_advanced_squads", "icon": "Users", "section": "advanced",
             "renderer": "dynamic", "sourceKey": "srv_features", "exportKey": "server_settings",
             "fieldKeys": ["scum.SquadMemberCountAtIntLevel1", "scum.SquadMemberCountAtIntLevel2",
                           "scum.SquadMemberCountAtIntLevel3", "scum.SquadMemberCountAtIntLevel4",
                           "scum.SquadMemberCountAtIntLevel5", "scum.SquadMemberCountLimitForPunishment",
                           "scum.RTSquadProbationDuration", "scum.SquadMoneyPenaltyPerPrevSquadMember",
                           "scum.SquadFamePointsPenaltyPerPrevSquadMember", "scum.EnableSquadMemberNameWidget"]},
            {"key": "advanced_input", "labelKey": "cat_advanced_input", "icon": "Keyboard", "section": "advanced",
             "renderer": "input", "exportKey": "input"},
            {"key": "advanced_custom_ini", "labelKey": "cat_advanced_custom_ini", "icon": "FileCode", "section": "advanced",
             "renderer": "dynamic", "sourceKey": "custom_ini", "exportKey": None},

            # ------ AUTOMATION ------
            # Two categories: restart and update. Each category shows both
            # the schedule/options AND the notifications for that kind,
            # inline on the same page. Single `Notifications.json` file is
            # still produced for SCUM (the `kind` metadata is stripped on
            # export — see render_notifications_json).
            {"key": "automation_restart", "labelKey": "cat_automation_restart", "icon": "RefreshCw", "section": "automation",
             "renderer": "automation_restart"},
            {"key": "automation_update", "labelKey": "cat_automation_update", "icon": "Download", "section": "automation",
             "renderer": "automation_update"},

            # ------ DISCORD (webhooks + bot) ------
            {"key": "discord_webhooks", "labelKey": "cat_discord_webhooks", "icon": "Webhook", "section": "discord",
             "renderer": "discord"},
            {"key": "discord_bot", "labelKey": "cat_discord_bot", "icon": "Bot", "section": "discord",
             "renderer": "discord_bot"},

            # ------ CLIENT GAME (moved under Gameplay) ------
            {"key": "gameplay_client_game", "labelKey": "cat_client_game", "icon": "Gamepad2", "section": "gameplay",
             "renderer": "dynamic", "sourceKey": "client_game", "exportKey": "gameusersettings"},
        ],
    }


app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)


# ========== REAL BACKGROUND SCHEDULER ==========
# Wakes every 30 seconds. For each server with automation.enabled:
#   * If any restart_time (HH:MM) matches the current minute, queue a restart cycle
#     (mark Updating -> Stopped -> Running to mimic the real stop/start sequence)
#   * Runs an auto-update check every automation.update_check_interval_min minutes
#   * If auto_update_enabled and a new build is detected while server is Stopped,
#     trigger an update cycle (Updating -> Stopped with new build id)


_scheduler_task: Optional[asyncio.Task] = None
_last_restart_tick: Dict[str, str] = {}   # server_id -> "YYYY-MM-DDTHH:MM" of last restart
_last_update_check_at: Dict[str, float] = {}  # server_id -> epoch seconds
_last_log_scan_at: Dict[str, float] = {}  # server_id -> epoch seconds
_last_config_reimport_at: Dict[str, float] = {}  # server_id -> epoch seconds
_last_backup_at: Dict[str, float] = {}    # server_id -> epoch seconds
_crash_watch: Dict[str, Dict[str, Any]] = {}  # server_id -> {"was_running": bool, "pid": int}
# Set of server_ids whose next Running→Stopped transition is an ADMIN-driven
# stop (manual Stop / Restart / Update / scheduled restart). The scheduler's
# crash detector consults this set and, if present, skips the "crash" backup
# and does NOT set the crash_recovery_pending flag. The entry is popped after
# the first stop transition is observed.
_expected_stops: set = set()


def mark_expected_stop(server_id: str) -> None:
    """Record that the next Running→Stopped transition for this server is an
    expected admin operation (not a crash). Safe to call multiple times."""
    _expected_stops.add(server_id)


_vehicle_ownership_snapshot: Dict[str, Dict[int, Dict[str, Any]]] = {}   # server_id -> {vid: {owner_sid, ...}}
LOG_SCAN_INTERVAL_SEC = 20   # how often the scheduler re-parses log files
CONFIG_REIMPORT_INTERVAL_SEC = 60  # how often we re-read on-disk configs into DB


async def _auto_scan_logs(server_id: str, folder_path: str, limit: int = 20) -> Dict[str, int]:
    """Background helper: parse the N most recent log files for this server and
    forward new events to Discord. Safe to call repeatedly — events are de-duped
    by their stable id. Runs the blocking filesystem walk in a worker thread so
    we never stall the FastAPI event loop."""
    logs_dir = Path(folder_path) / "SCUM" / "Saved" / "SaveFiles" / "Logs"
    if not logs_dir.exists():
        return {"scanned": 0, "stored": 0, "forwarded": 0}

    def _collect() -> List[Dict[str, Any]]:
        files = sorted(logs_dir.glob("*.log"),
                       key=lambda p: p.stat().st_mtime, reverse=True)[:limit]
        all_events: List[Dict[str, Any]] = []
        for p in files:
            try:
                text = read_log_file(p)
                lt = detect_log_type(p.name)
                evs = parse_log_text(text, lt, filename=p.name, server_id=server_id)
                all_events.extend(evs)
            except Exception as e:
                logger.info("auto-scan: %s parse failed: %s", p.name, e)
        return all_events

    events = await asyncio.to_thread(_collect)
    if not events:
        return {"scanned": 0, "stored": 0, "forwarded": 0}
    res = await _store_events_and_forward(server_id, events)
    return {"scanned": len(events), **res}


async def _tick_scheduler():
    while True:
        try:
            now = datetime.now(timezone.utc)
            hhmm = now.strftime("%H:%M")
            day_tag = now.strftime("%Y-%m-%dT%H:%M")
            servers = await db.servers.find({}, {"_id": 0}).to_list(500)

            # Refresh the Discord state cache so the bot's presence/command
            # responses reflect reality without hammering A2S per request.
            if scum_discord.get_status().get("running"):
                try:
                    await _refresh_discord_state_cache()
                except Exception as e:
                    logger.info("discord cache refresh failed: %s", e)

            for s in servers:
                auto = s.get("automation") or {}
                sid = s["id"]
                # --- Scheduled restarts ---
                if auto.get("enabled") and s.get("installed") and s.get("status") == "Running":
                    restart_times = auto.get("restart_times") or []
                    if hhmm in restart_times and _last_restart_tick.get(sid) != day_tag:
                        _last_restart_tick[sid] = day_tag
                        logger.info("Scheduler: restart trigger for %s at %s", s.get("name"), hhmm)
                        mark_expected_stop(sid)
                        await db.servers.update_one({"id": sid}, {"$set": {"status": "Updating"}})
                        await asyncio.sleep(2)
                        await db.servers.update_one({"id": sid}, {"$set": {"status": "Stopped"}})
                        await asyncio.sleep(1)
                        await db.servers.update_one({"id": sid}, {"$set": {"status": "Running"}})
                # --- Auto update ---
                if auto.get("auto_update_enabled") and s.get("installed"):
                    interval = int(auto.get("update_check_interval_min") or 360)
                    last = _last_update_check_at.get(sid, 0)
                    if (now.timestamp() - last) >= interval * 60:
                        _last_update_check_at[sid] = now.timestamp()
                        # Directly check steam (reuses same implementation)
                        try:
                            import httpx
                            async with httpx.AsyncClient(timeout=8.0, follow_redirects=True, headers={"User-Agent": "LGSSManager/1.0"}) as c:
                                build_id = None
                                for aid in ("513710", "3792580"):
                                    r = await c.get(f"https://steamcommunity.com/games/{aid}/rss/")
                                    if r.status_code == 200 and "<item>" in r.text:
                                        import re as _re
                                        pubs = _re.findall(r"<pubDate>([^<]+)</pubDate>", r.text)
                                        if pubs:
                                            from email.utils import parsedate_to_datetime
                                            build_id = f"build-{int(parsedate_to_datetime(pubs[0]).timestamp())}"
                                            break
                                if build_id and s.get("installed_build_id") and s["installed_build_id"] != build_id:
                                    await db.servers.update_one({"id": sid}, {"$set": {"update_available": True}})
                                    logger.info("Scheduler: update_available=True for %s", s.get("name"))
                                    # Kick off graceful update flow (15-min lead):
                                    # notifications get stamped into Notifications.json
                                    # and the update actually runs when pending_update_at
                                    # is reached (see section below).
                                    try:
                                        fresh = await db.servers.find_one({"id": sid}, {"_id": 0})
                                        if fresh and not fresh.get("pending_update_at"):
                                            await _schedule_graceful_update(sid, fresh, lead_minutes=15)
                                    except Exception as e:
                                        logger.info("graceful update scheduling failed: %s", e)
                        except Exception as e:
                            logger.info("Scheduler steam check failed: %s", e)

                # --- Pending graceful update: execute when target reached ---
                pending = s.get("pending_update_at")
                if pending:
                    try:
                        target = datetime.fromisoformat(pending)
                        if target.tzinfo is None:
                            target = target.replace(tzinfo=timezone.utc)
                        if now >= target:
                            logger.warning("Graceful update firing for %s", s.get("name"))
                            # 1. Mark admin-stop so crash detector doesn't fire
                            mark_expected_stop(sid)
                            # 2. Stop the running EXE
                            try:
                                scum_proc.stop_server(sid)
                            except Exception:
                                pass
                            await db.servers.update_one(
                                {"id": sid}, {"$set": {"status": "Updating"}},
                            )
                            # 3. Clear transient update notifications from settings
                            clean_settings = {**(s.get("settings") or {})}
                            notifs_clean = [
                                n for n in (clean_settings.get("notifications") or [])
                                if not (isinstance(n, dict) and n.get("_transient_update"))
                            ]
                            clean_settings["notifications"] = notifs_clean
                            await db.servers.update_one(
                                {"id": sid},
                                {"$set": {
                                    "settings": clean_settings,
                                    "pending_update_at": None,
                                    "update_available": False,
                                }},
                            )
                            # 4. Rewrite Notifications.json without transients
                            try:
                                if s.get("folder_path"):
                                    save_notifications_to_disk(s["folder_path"], notifs_clean)
                            except Exception as e:
                                logger.info("notification cleanup write failed: %s", e)
                            # 5. SteamCMD update + restart is triggered from the
                            # Electron main process (ipc 'lgss:update-server'). On
                            # web preview we just simulate the cycle like the
                            # manual /update endpoint does.
                            await asyncio.sleep(1)
                            await db.servers.update_one(
                                {"id": sid}, {"$set": {"status": "Running"}},
                            )
                    except Exception as e:
                        logger.info("pending update handling failed: %s", e)

                # --- Auto log scan (every LOG_SCAN_INTERVAL_SEC) ---
                # SCUM writes new .log files every few minutes while the server is
                # running. We tail them in the background so the Logs + Players
                # views populate without requiring a manual "Scan" click.
                if s.get("installed") and s.get("folder_path"):
                    last_scan = _last_log_scan_at.get(sid, 0)
                    if (now.timestamp() - last_scan) >= LOG_SCAN_INTERVAL_SEC:
                        _last_log_scan_at[sid] = now.timestamp()
                        try:
                            r = await _auto_scan_logs(sid, s["folder_path"], limit=20)
                            if r.get("stored"):
                                logger.info(
                                    "Auto-scan: %s → %d new events (%d forwarded)",
                                    s.get("name"), r["stored"], r.get("forwarded", 0)
                                )
                        except Exception as e:
                            logger.info("Auto-scan failed for %s: %s", s.get("name"), e)

                # --- Config file re-import (every CONFIG_REIMPORT_INTERVAL_SEC) ---
                # When an admin edits settings from inside the game (via #commands
                # or the in-game admin panel), SCUM rewrites ServerSettings.ini on
                # disk. We periodically re-read those files and merge into the
                # manager's settings so the UI reflects the live game state.
                if s.get("installed") and s.get("folder_path") and s.get("status") in ("Running", "Starting"):
                    last_reimport = _last_config_reimport_at.get(sid, 0)
                    if (now.timestamp() - last_reimport) >= CONFIG_REIMPORT_INTERVAL_SEC:
                        _last_config_reimport_at[sid] = now.timestamp()
                        try:
                            parsed = parse_real_config_dir(s["folder_path"])
                            current = s.get("settings", {}) or {}
                            merged = {**current}
                            changed = False
                            for k, v in parsed.items():
                                # Skip empty parses (file not written yet / missing section)
                                if isinstance(v, (list, dict)) and not v:
                                    continue
                                if merged.get(k) != v:
                                    merged[k] = v
                                    changed = True
                            if changed:
                                await db.servers.update_one({"id": sid}, {"$set": {"settings": merged}})
                                logger.info("Config re-import: %s picked up on-disk changes", s.get("name"))
                        except Exception as e:
                            logger.info("Config re-import failed for %s: %s", s.get("name"), e)

                # --- Auto backup + crash-safe emergency backup ---
                # Two independent triggers:
                #   1) Periodic: if automation.backup_enabled, create a backup every
                #      automation.backup_interval_min (default 120). Pruned to
                #      keep-count so disk doesn't fill.
                #   2) Crash detector: we remember whether the SCUM process was
                #      alive last tick; if it was Running/Starting and is suddenly
                #      gone without an admin-driven Stop, snapshot RIGHT NOW before
                #      the player's progress is potentially corrupted by the crash.
                if s.get("installed") and s.get("folder_path"):
                    setup_doc = await db.setup.find_one({"_id": SETUP_DOC_ID}, {"_id": 0}) or {}
                    manager_path = setup_doc.get("manager_path")
                    if manager_path:
                        server_folder = s.get("folder_name") or f"Server{s.get('index', 1)}"
                        running_now = s.get("status") in ("Running", "Starting")

                        # (1) Periodic
                        if auto.get("backup_enabled"):
                            interval_min = int(auto.get("backup_interval_min") or 10)
                            last_bk = _last_backup_at.get(sid, 0)
                            if (now.timestamp() - last_bk) >= interval_min * 60:
                                _last_backup_at[sid] = now.timestamp()
                                try:
                                    await asyncio.to_thread(
                                        scum_backup.create_backup,
                                        server_id=sid,
                                        folder_path=s["folder_path"],
                                        manager_path=manager_path,
                                        server_folder=server_folder,
                                        backup_type="auto",
                                    )
                                    # Prune: keep max N auto-backups
                                    keep = int(auto.get("backup_keep_count") or 30)
                                    await asyncio.to_thread(
                                        scum_backup.prune_old_backups,
                                        manager_path=manager_path,
                                        server_folder=server_folder,
                                        keep_count=keep,
                                    )
                                    logger.info("Auto-backup: %s done", s.get("name"))
                                except Exception as e:
                                    logger.info("Auto-backup failed for %s: %s", s.get("name"), e)

                        # (2) Crash detector
                        prev = _crash_watch.get(sid, {})
                        if prev.get("was_running") and not running_now:
                            # Running → dead transition. If this was triggered
                            # by an admin action (Stop / Restart / Update /
                            # scheduled restart), the endpoint marked it via
                            # mark_expected_stop() — we pop that flag here and
                            # skip the crash backup entirely. Otherwise we
                            # treat it as a real crash: capture a snapshot and
                            # flag the server for auto-recovery on next start.
                            if sid in _expected_stops:
                                _expected_stops.discard(sid)
                                logger.info(
                                    "Stop transition for %s was admin-initiated; no crash backup.",
                                    s.get("name"),
                                )
                            else:
                                try:
                                    await asyncio.to_thread(
                                        scum_backup.create_backup,
                                        server_id=sid,
                                        folder_path=s["folder_path"],
                                        manager_path=manager_path,
                                        server_folder=server_folder,
                                        backup_type="crash",
                                    )
                                    await db.servers.update_one(
                                        {"id": sid},
                                        {"$set": {"crash_recovery_pending": True,
                                                  "last_crash_at": now.isoformat()}},
                                    )
                                    logger.warning("Crash backup captured for %s", s.get("name"))
                                except Exception as e:
                                    logger.info("Crash backup failed for %s: %s", s.get("name"), e)
                        _crash_watch[sid] = {"was_running": running_now}

                # --- Vehicle-claim detector (SCUM.db owner-diff) ---
                # SCUM writes no "player claimed X" log line. We detect it by
                # polling vehicle_entity and comparing owner_sid between ticks.
                # Any row whose owner changed None→SID (or SID→different SID)
                # becomes a synthetic `vehicle_claim` event so admins see it
                # in the Logs page + Discord.
                if s.get("installed") and s.get("folder_path") and s.get("status") in ("Running", "Starting"):
                    try:
                        new_snapshot = await asyncio.to_thread(
                            scum_db.read_vehicle_ownership, s["folder_path"],
                        )
                        old_snapshot = _vehicle_ownership_snapshot.get(sid) or {}
                        claim_events: List[Dict[str, Any]] = []
                        for vid, row in new_snapshot.items():
                            old_row = old_snapshot.get(vid)
                            new_owner = row.get("owner_sid")
                            old_owner = (old_row or {}).get("owner_sid")
                            if new_owner and new_owner != old_owner:
                                # Changed hands (either from unowned or from another player)
                                klass = row.get("klass") or ""
                                pretty = klass.replace("BP_", "").replace("_C", "").replace("_", " ").strip() or klass
                                ts_iso = now.isoformat()
                                ev = {
                                    "type": "vehicle_claim",
                                    "ts": ts_iso,
                                    "server_id": sid,
                                    "source_file": "scum.db",
                                    "vehicle_id": vid,
                                    "vehicle_class": klass,
                                    "vehicle_pretty": pretty,
                                    "steam_id": new_owner,
                                    "player_name": row.get("owner_name"),
                                    "previous_owner_sid": old_owner,
                                    "action": "claimed" if not old_owner else "transferred",
                                    "raw": f"[SCUM.db] {pretty} (VehicleId={vid}) owner={new_owner}",
                                }
                                # Stable id so the same claim isn't re-forwarded next tick
                                import hashlib as _h
                                ev["id"] = _h.sha1(
                                    f"{sid}|claim|{vid}|{new_owner}".encode()
                                ).hexdigest()[:24]
                                claim_events.append(ev)
                        if claim_events:
                            r = await _store_events_and_forward(sid, claim_events)
                            logger.info(
                                "Claim detector: %s → %d new events (%d forwarded)",
                                s.get("name"), r.get("stored", 0), r.get("forwarded", 0),
                            )
                        _vehicle_ownership_snapshot[sid] = new_snapshot
                    except Exception as e:
                        logger.info("Claim detector failed for %s: %s", s.get("name"), e)
        except Exception as e:
            logger.exception("Scheduler tick failed: %s", e)
        await asyncio.sleep(10)


@app.on_event("startup")
async def _start_scheduler():
    global _scheduler_task
    # One-time migration: earlier versions defaulted to game=7779 / query=7780.
    # For any server that has NEVER been installed (admin hasn't configured it
    # on disk yet), silently shift those defaults to the new values (7777/7778)
    # so the UI reflects what brand-new servers will get. Installed servers
    # keep whatever the admin chose.
    try:
        r = await db.servers.update_many(
            {"installed": False, "game_port": 7779, "query_port": 7780},
            {"$set": {"game_port": 7777, "query_port": 7778}},
        )
        if r.modified_count:
            logger.info("Port default migration: shifted %d server(s) 7779/7780 → 7777/7778", r.modified_count)
    except Exception as e:
        logger.info("port migration skipped: %s", e)
    if _scheduler_task is None:
        _scheduler_task = asyncio.create_task(_tick_scheduler())
        logger.info("LGSS automation scheduler started (tick=10s)")
    # Auto-start Discord bot if the user has saved a token in a previous session.
    try:
        setup = await db.setup.find_one({"_id": SETUP_DOC_ID}, {"_id": 0}) or {}
        bot_cfg = setup.get("discord_bot") or {}
        if bot_cfg.get("enabled") and bot_cfg.get("token"):
            await scum_discord.start_bot(
                bot_cfg["token"],
                _discord_state_collector,
                status_channel_id=bot_cfg.get("status_channel_id") or None,
                message_id_store=_discord_message_id_store,
                initial_message_ids=bot_cfg.get("status_message_ids") or {},
            )
            logger.info("Discord bot auto-started from saved token")
    except Exception as e:
        logger.info("Discord bot auto-start skipped: %s", e)


@app.on_event("shutdown")
async def shutdown_db_client():
    global _scheduler_task
    if _scheduler_task:
        _scheduler_task.cancel()
    try:
        await scum_discord.stop_bot()
    except Exception:
        pass
    client.close()
