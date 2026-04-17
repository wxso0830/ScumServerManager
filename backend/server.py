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
    public_ip: Optional[str] = None
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    settings: Dict[str, Any] = Field(default_factory=dict)


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
    sep = "\\" if "\\" in manager_path else "/"
    folder_path = f"{manager_path}{sep}{folder_name}"
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


# ---------- SCUM FILE EXPORT / IMPORT ----------
EXPORT_MAP = {
    "admins": ("AdminUsers.ini", lambda s: render_user_list(s.get("users_admins", []))),
    "banned": ("BannedUsers.ini", lambda s: render_user_list(s.get("users_banned", []))),
    "exclusive": ("ExclusiveUsers.ini", lambda s: render_user_list(s.get("users_exclusive", []))),
    "economy": ("EconomyOverride.json", lambda s: render_economy_json(s)),
    "gameusersettings": ("GameUserSettings.ini", lambda s: render_gameusersettings_ini(s)),
    "server_settings": ("ServerSettings.ini", lambda s: render_server_settings_ini(s)),
    "raid_times": ("RaidTimes.json", lambda s: render_raid_times_json(s)),
    "notifications": ("Notifications.json", lambda s: render_notifications_json(s)),
    "input": ("Input.ini", lambda s: render_input_ini(s)),
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
    if file_key in ("admins", "banned", "exclusive"):
        key_map = {"admins": "users_admins", "banned": "users_banned", "exclusive": "users_exclusive"}
        settings[key_map[file_key]] = parse_user_list_text(text)
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


# ---------- SCHEMA METADATA ----------
@api_router.get("/settings/schema")
async def get_settings_schema():
    """Expose category metadata for frontend dynamic rendering."""
    return {
        "categories": [
            {"key": "srv_general", "labelKey": "cat_srv_general", "icon": "ShieldCheck", "renderer": "dynamic", "exportKey": "server_settings", "section": "server"},
            {"key": "srv_world", "labelKey": "cat_srv_world", "icon": "Globe", "renderer": "dynamic", "exportKey": "server_settings", "section": "server"},
            {"key": "srv_respawn", "labelKey": "cat_srv_respawn", "icon": "RefreshCw", "renderer": "dynamic", "exportKey": "server_settings", "section": "server"},
            {"key": "srv_vehicles", "labelKey": "cat_srv_vehicles", "icon": "Car", "renderer": "dynamic", "exportKey": "server_settings", "section": "server"},
            {"key": "srv_damage", "labelKey": "cat_srv_damage", "icon": "Swords", "renderer": "dynamic", "exportKey": "server_settings", "section": "server"},
            {"key": "srv_features", "labelKey": "cat_srv_features", "icon": "Sparkles", "renderer": "dynamic", "exportKey": "server_settings", "section": "server"},
            {"key": "users_admins", "labelKey": "cat_users_admins", "icon": "ShieldUser", "renderer": "user_list", "exportKey": "admins", "commonFlags": ["godmode", "moderator", "ghost"], "section": "users"},
            {"key": "users_banned", "labelKey": "cat_users_banned", "icon": "UserX", "renderer": "user_list", "exportKey": "banned", "commonFlags": ["permanent"], "section": "users"},
            {"key": "users_exclusive", "labelKey": "cat_users_exclusive", "icon": "UserCheck", "renderer": "user_list", "exportKey": "exclusive", "commonFlags": ["vip"], "section": "users"},
            {"key": "economy_override", "labelKey": "cat_economy_override", "icon": "Banknote", "renderer": "dynamic", "exportKey": "economy", "section": "economy"},
            {"key": "economy_traders", "labelKey": "cat_economy_traders", "icon": "Store", "renderer": "traders", "exportKey": "economy", "section": "economy"},
            {"key": "raid_times", "labelKey": "cat_raid_times", "icon": "CalendarClock", "renderer": "raid_times", "exportKey": "raid_times", "section": "advanced"},
            {"key": "notifications", "labelKey": "cat_notifications", "icon": "Bell", "renderer": "notifications", "exportKey": "notifications", "section": "advanced"},
            {"key": "client_game", "labelKey": "cat_client_game", "icon": "Gamepad2", "renderer": "dynamic", "exportKey": "gameusersettings", "section": "client"},
            {"key": "client_mouse", "labelKey": "cat_client_mouse", "icon": "Mouse", "renderer": "dynamic", "exportKey": "gameusersettings", "section": "client"},
            {"key": "client_video", "labelKey": "cat_client_video", "icon": "Monitor", "renderer": "dynamic", "exportKey": "gameusersettings", "section": "client"},
            {"key": "client_graphics", "labelKey": "cat_client_graphics", "icon": "Layers", "renderer": "dynamic", "exportKey": "gameusersettings", "section": "client"},
            {"key": "client_sound", "labelKey": "cat_client_sound", "icon": "Volume2", "renderer": "dynamic", "exportKey": "gameusersettings", "section": "client"},
            {"key": "input", "labelKey": "cat_input", "icon": "Keyboard", "renderer": "input", "exportKey": "input", "section": "advanced"},
            {"key": "custom_ini", "labelKey": "cat_custom_ini", "icon": "FileCode", "renderer": "dynamic", "exportKey": None, "section": "advanced"},
        ],
        "sections": [
            {"key": "server", "labelKey": "sec_server"},
            {"key": "users", "labelKey": "sec_users"},
            {"key": "economy", "labelKey": "sec_economy"},
            {"key": "advanced", "labelKey": "sec_advanced"},
            {"key": "client", "labelKey": "sec_client"},
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
