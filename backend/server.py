from fastapi import FastAPI, APIRouter, HTTPException
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
from datetime import datetime, timezone
from scum_parser import (
    load_defaults,
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
import json as json_lib
import io


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
        "bilingual": True,  # write TR+EN like the user's own template
    })


class AutomationUpdate(BaseModel):
    enabled: Optional[bool] = None
    restart_times: Optional[List[str]] = None
    pre_warning_minutes: Optional[List[int]] = None
    final_message_duration: Optional[int] = None
    auto_update_enabled: Optional[bool] = None
    update_check_interval_min: Optional[int] = None
    bilingual: Optional[bool] = None


class ServerCreate(BaseModel):
    name: Optional[str] = None


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


@api_router.get("/system/admin-check")
async def admin_check():
    """Check if process has admin/root privileges. In web preview this is informational."""
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
    await db.servers.update_one({"id": server_id}, {"$set": {"status": "Running"}})
    doc["status"] = "Running"
    return ServerProfile(**doc)


@api_router.post("/servers/{server_id}/stop", response_model=ServerProfile)
async def stop_server(server_id: str):
    doc = await db.servers.find_one({"id": server_id}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Server not found")
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
    """Download SCUM server files via SteamCMD (AppID 3792580).
    In web preview this is simulated — marks the server 'installed'.
    Real SteamCMD execution happens in Electron main process."""
    doc = await db.servers.find_one({"id": server_id}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Server not found")
    # Record a pseudo build id for the install (real value comes from Electron/Steam)
    build_id = f"build-{int(datetime.now(timezone.utc).timestamp())}"
    await db.servers.update_one({"id": server_id}, {"$set": {
        "installed": True,
        "status": "Stopped",
        "installed_build_id": build_id,
        "update_available": False,
    }})
    doc["installed"] = True
    doc["status"] = "Stopped"
    doc["installed_build_id"] = build_id
    doc["update_available"] = False
    return ServerProfile(**doc)


# ---------- AUTOMATION (auto-restart + auto-update) ----------
def _fmt_restart_message(minutes_left: int, bilingual: bool) -> str:
    """Build a bilingual TR+EN restart warning matching the user's template."""
    if minutes_left == 1:
        tr = "1 dakika sonra otomatik olarak yeniden başlatılacaktır. (Klavyeyi bırakın)"
        en = "It will automatically restart after 1 minutes. (Release the keyboard)"
    elif minutes_left == 0:
        tr = "1 DAKİKA SONRA GÖRÜŞÜRÜZ"
        en = "SEE YOU IN 1 MINUTE"
    else:
        tr = f"Otomatik yeniden başlatmaya {minutes_left} dakika kaldı."
        en = f"{minutes_left} minutes remaining until automatic restart."
    if bilingual:
        return f"{tr}   /   {en}"
    return tr


def _minus_minutes(hhmm: str, m: int) -> str:
    """Subtract m minutes from HH:MM and wrap around 24h."""
    h, mi = [int(x) for x in hhmm.split(":")[:2]]
    total = (h * 60 + mi - m) % (24 * 60)
    return f"{total // 60:02d}:{total % 60:02d}"


def _generate_notifications_from_schedule(automation: Dict[str, Any]) -> List[Dict[str, Any]]:
    times: List[str] = [t for t in (automation.get("restart_times") or []) if t]
    pre: List[int] = sorted(set([int(x) for x in (automation.get("pre_warning_minutes") or [])]), reverse=True)
    final_dur = int(automation.get("final_message_duration") or 10)
    bilingual = bool(automation.get("bilingual", True))
    if not times:
        return []
    out: List[Dict[str, Any]] = []
    for m in pre:
        stamps = sorted({_minus_minutes(t, m) for t in times})
        out.append({
            "day": "Everyday",
            "time": stamps,
            "duration": "15",
            "message": _fmt_restart_message(m, bilingual),
        })
    # Final "see you" message at the exact restart time
    final_times = sorted(set(times))
    out.append({
        "day": "Everyday",
        "time": final_times,
        "duration": str(final_dur),
        "message": _fmt_restart_message(0, bilingual),
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
    settings["notifications"] = generated
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
            "bilingual": True,
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
    """Check Steam for the latest SCUM server build.
    In Electron this calls SteamCMD `app_info_print 3792580` for real.
    In web preview we return a mock value persisted to mongo so UI can exercise the flow."""
    doc = await db.app_meta.find_one({"_id": STEAM_LATEST_KEY}, {"_id": 0})
    latest = (doc or {}).get("build_id") or f"build-{int(datetime.now(timezone.utc).timestamp())}"
    checked_at = datetime.now(timezone.utc).isoformat()
    # Mark servers whose installed build differs as update_available
    servers = await db.servers.find({"installed": True}, {"_id": 0}).to_list(500)
    for s in servers:
        needs_update = s.get("installed_build_id") and s["installed_build_id"] != latest
        if needs_update != bool(s.get("update_available")):
            await db.servers.update_one({"id": s["id"]}, {"$set": {"update_available": needs_update}})
    return {"app_id": STEAM_APP_ID, "latest_build_id": latest, "checked_at": checked_at, "change_notes": (doc or {}).get("notes", "")}


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


@api_router.post("/servers/{server_id}/save-config")
async def save_server_config(server_id: str):
    """Render all manager settings into actual SCUM config files at:
    {folder_path}/SCUM/Saved/Config/WindowsServer/
    Returns the files (path + content) the Electron shell should write."""
    doc = await db.servers.find_one({"id": server_id}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Server not found")
    settings = doc.get("settings", {})
    folder = doc["folder_path"]
    sep = "\\" if ("\\" in folder or (len(folder) >= 2 and folder[1] == ":")) else "/"
    config_dir = f"{folder}{sep}SCUM{sep}Saved{sep}Config{sep}WindowsServer"
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
    return {"config_dir": config_dir, "files": files, "count": len(files)}


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
    settings = {**doc.get("settings", {})}
    if file_key in USER_LIST_IMPORT_MAP:
        settings[USER_LIST_IMPORT_MAP[file_key]] = parse_user_list_text(text)
    elif file_key == "economy":
        data = json_lib.loads(text)
        overrides = data.get("economy-override", data)
        settings["economy_override"] = {k: v for k, v in overrides.items() if not isinstance(v, (dict, list))}
        traders = overrides.get("traders")
        if isinstance(traders, dict):
            settings["economy_traders"] = traders
    elif file_key == "gameusersettings":
        tmp_path = Path("/tmp/_gus.ini")
        tmp_path.write_text(text, encoding="utf-8")
        sects = parse_ini_sections(tmp_path)
        for sect, dest in (("Game", "client_game"), ("Mouse", "client_mouse"), ("Video", "client_video"), ("Graphics", "client_graphics"), ("Sound", "client_sound")):
            if sect in sects:
                settings[dest] = sects[sect]
    elif file_key == "server_settings":
        tmp_path = Path("/tmp/_ss.ini")
        tmp_path.write_text(text, encoding="utf-8")
        sects = parse_ini_sections(tmp_path)
        for sect, dest in (("General", "srv_general"), ("World", "srv_world"), ("Respawn", "srv_respawn"), ("Vehicles", "srv_vehicles"), ("Damage", "srv_damage"), ("Features", "srv_features")):
            if sect in sects:
                settings[dest] = sects[sect]
    elif file_key == "raid_times":
        data = json_lib.loads(text)
        settings["raid_times"] = data.get("raiding-times", [])
    elif file_key == "notifications":
        data = json_lib.loads(text)
        settings["notifications"] = data.get("Notifications", [])
    elif file_key == "input":
        tmp_path = Path("/tmp/_in.ini")
        tmp_path.write_text(text, encoding="utf-8")
        parsed = parse_input_ini(tmp_path)
        settings["input_axis"] = parsed["AxisMappings"]
        settings["input_action"] = parsed["ActionMappings"]
    else:
        raise HTTPException(status_code=400, detail="Unknown file_key")
    await db.servers.update_one({"id": server_id}, {"$set": {"settings": settings}})
    doc["settings"] = settings
    return ServerProfile(**doc)


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
            {"key": "client", "labelKey": "sec_client"},
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
            {"key": "advanced_notifications", "labelKey": "cat_advanced_notifications", "icon": "Bell", "section": "advanced",
             "renderer": "notifications", "sourceKey": "notifications", "exportKey": "notifications"},
            {"key": "advanced_input", "labelKey": "cat_advanced_input", "icon": "Keyboard", "section": "advanced",
             "renderer": "input", "exportKey": "input"},
            {"key": "advanced_custom_ini", "labelKey": "cat_advanced_custom_ini", "icon": "FileCode", "section": "advanced",
             "renderer": "dynamic", "sourceKey": "custom_ini", "exportKey": None},

            # ------ AUTOMATION ------
            {"key": "automation_main", "labelKey": "cat_automation_main", "icon": "Clock", "section": "automation",
             "renderer": "automation"},

            # ------ CLIENT DEFAULTS ------
            {"key": "client_game", "labelKey": "cat_client_game", "icon": "Gamepad2", "section": "client",
             "renderer": "dynamic", "sourceKey": "client_game", "exportKey": "gameusersettings"},
            {"key": "client_mouse", "labelKey": "cat_client_mouse", "icon": "Mouse", "section": "client",
             "renderer": "dynamic", "sourceKey": "client_mouse", "exportKey": "gameusersettings"},
            {"key": "client_video", "labelKey": "cat_client_video", "icon": "Monitor", "section": "client",
             "renderer": "dynamic", "sourceKey": "client_video", "exportKey": "gameusersettings"},
            {"key": "client_graphics", "labelKey": "cat_client_graphics", "icon": "Layers", "section": "client",
             "renderer": "dynamic", "sourceKey": "client_graphics", "exportKey": "gameusersettings"},
            {"key": "client_sound", "labelKey": "cat_client_sound", "icon": "Volume2", "section": "client",
             "renderer": "dynamic", "sourceKey": "client_sound", "exportKey": "gameusersettings"},
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


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
