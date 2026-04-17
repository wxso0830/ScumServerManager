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
    return {
        "administration": {
            "ServerName": "SCUM LGSS Server",
            "ServerDescription": "A fresh survival experience powered by LGSS Managers.",
            "ServerPassword": "",
            "AdminPassword": "",
            "ServerPort": 7042,
            "ServerQueryPort": 7043,
            "MaxPlayers": 64,
            "ReservedSlots": 0,
            "WelcomeMessage": "Welcome to the wasteland.",
        },
        "world": {
            "StartingHour": 8,
            "TimeOfDayMultiplier": 1.0,
            "NightTimeMultiplier": 1.0,
            "WeatherRainMultiplier": 1.0,
            "TemperatureMultiplier": 1.0,
            "RespectLocalTimeForSunrise": False,
        },
        "economy": {
            "TradersEnabled": True,
            "TraderFundsMultiplier": 1.0,
            "TraderRestockIntervalHours": 24,
            "FameOnKill": 50,
            "FameOnDeath": -25,
            "CurrencyBalanceLimit": 1000000,
        },
        "loot": {
            "LootMultiplier": 1.0,
            "ItemSpawningMultiplier": 1.0,
            "WeaponLootMultiplier": 1.0,
            "AmmoLootMultiplier": 1.0,
            "MedicineLootMultiplier": 1.0,
            "FoodLootMultiplier": 1.0,
            "ClothingLootMultiplier": 1.0,
        },
        "vehicles": {
            "VehiclesEnabled": True,
            "VehicleSpawnMultiplier": 1.0,
            "VehicleDurabilityMultiplier": 1.0,
            "FuelConsumptionMultiplier": 1.0,
            "AllowVehicleStealing": True,
        },
        "raid_protection": {
            "BaseRaidingEnabled": True,
            "BaseRaidTimesStart": "18:00",
            "BaseRaidTimesEnd": "23:00",
            "BaseDamageMultiplier": 1.0,
            "LockpickingEnabled": True,
        },
        "squads": {
            "SquadsEnabled": True,
            "SquadMaxSize": 8,
            "AllowSquadChat": True,
            "FriendlyFire": False,
        },
        "weapons": {
            "WeaponDurabilityMultiplier": 1.0,
            "AmmoDamageMultiplier": 1.0,
            "RecoilMultiplier": 1.0,
            "SwayMultiplier": 1.0,
        },
        "zombies_puppets": {
            "PuppetsEnabled": True,
            "PuppetSpawnMultiplier": 1.0,
            "PuppetDamageMultiplier": 1.0,
            "PuppetSenseMultiplier": 1.0,
            "PuppetsRunAtNight": True,
        },
        "players": {
            "PlayerDamageMultiplier": 1.0,
            "StaminaMultiplier": 1.0,
            "HungerMultiplier": 1.0,
            "ThirstMultiplier": 1.0,
            "StartingFameOnRespawn": 0,
            "AllowCharacterCreation": True,
        },
        "network": {
            "EnableBattlEye": True,
            "EnableRcon": False,
            "RconPort": 8888,
            "RconPassword": "",
            "EnableAutomaticBackups": True,
            "BackupIntervalMinutes": 60,
            "BackupsToKeep": 10,
        },
        "custom_ini": {
            "ExtraServerSettings": "",
            "ExtraGameSettings": "",
            "ExtraEngineSettings": "",
        },
        "users_admins": [
            {"steam_id": "76561199169074640", "flags": [], "note": ""},
            {"steam_id": "76561199064932818", "flags": ["godmode"], "note": ""},
        ],
        "users_banned": [],
        "users_exclusive": [],
        "economy_override": {
            "economy-reset-time-hours": "-1.0",
            "prices-randomization-time-hours": "-1.0",
            "tradeable-rotation-time-ingame-hours-min": "1.0",
            "tradeable-rotation-time-ingame-hours-max": "1.0",
            "tradeable-rotation-time-of-day-min": "1.0",
            "tradeable-rotation-time-of-day-max": "1.0",
            "fully-restock-tradeable-hours": "0.1",
            "trader-funds-change-rate-per-hour-multiplier": "0.5",
            "prices-subject-to-player-count": "1",
            "gold-price-subject-to-global-multiplier": "1",
            "gold-base-price": "-1",
            "gold-sale-price-modifier": "-1.0",
            "gold-price-change-percentage-step": "-1.0",
            "gold-price-change-per-step": "-1.0",
            "economy-logging": "1",
            "traders-unlimited-funds": "1",
            "traders-unlimited-stock": "1",
            "global-only-after-player-sale-tradeable-availability-enabled": "1",
            "tradeable-rotation-enabled": "1",
            "enable-fame-point-requirement": "1",
        },
        "client_game": {
            "scum.Language": 0,
            "scum.NudityCensoring": True,
            "scum.PINCensoring": False,
            "scum.ShowSimpleTooltipOnHover": True,
            "scum.ShowAdditionalItemInfoWithoutHover": True,
            "scum.EnableDeena": True,
            "scum.AutoStartFirstDeenaTask": True,
            "scum.SurvivalTipLevel": 1,
            "scum.ShowAnnouncementMessages": True,
            "scum.ShowMusicPlayerDisplay": False,
            "scum.EnableAirplaneFlightAssist": False,
            "scum.NametagMode": 0,
            "scum.AimDownSightsMode": False,
            "scum.AutomaticParachuteOpening": True,
        },
        "client_mouse": {
            "scum.InvertMouseY": False,
            "scum.InvertAirplaneMouseY": False,
            "scum.MouseSensitivityFP": 50,
            "scum.MouseSensitivityTP": 50,
            "scum.MouseSensitivityDTS": 50,
            "scum.MouseSensitivityScope": 50,
            "scum.MouseSensitivityLockpicking": 50,
            "scum.MouseSensitivityBombDefusal": 50,
            "scum.MouseSensitivityATM": 50,
            "scum.MouseSensitivityDrone": 50,
            "scum.MouseSensitivityPhone": 50,
        },
        "client_video": {
            "scum.Gamma": 2.4,
            "scum.FirstPersonFOV": 70.0,
            "scum.ThirdPersonFOV": 70.0,
            "scum.FirstPersonDrivingFOV": 70.0,
            "scum.ThirdPersonDrivingFOV": 70.0,
            "scum.CameraBobbingIntensity": 0,
        },
        "client_graphics": {
            "scum.RenderScale": 1.0,
            "scum.DLSSSuperResolution": 0,
            "scum.DLSSFrameGeneration": 0,
            "scum.Reflex": 1,
            "scum.FSR": 0,
            "scum.ShadowQuality": 2,
            "scum.PostProcessingQuality": 2,
            "scum.EffectsQuality": 2,
            "scum.TextureQuality": 2,
            "scum.TextureMemory": 2,
            "scum.ViewDistance": 0,
            "scum.FoliageQuality": 2,
            "scum.FogQuality": 2,
            "scum.MotionBlur": 1,
            "scum.ShadowPrecision": 2,
            "scum.ShadowResolution": 2,
            "scum.FilmGrain": False,
            "scum.CloudsQuality": 2,
        },
        "client_sound": {
            "scum.MasterVolume": 100,
            "scum.MusicVolume": 50,
            "scum.EffectsVolume": 100,
            "scum.UIVolume": 100,
            "scum.VoiceChatVolume": 100,
            "scum.VoicelineVolume": 100,
            "scum.SpeakerConfiguration": 0,
            "scum.RadioMode": 0,
            "scum.PushToTalk": True,
            "scum.Enable3DAudio": False,
            "scum.CardiophobiaMode": False,
        },
    }


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


# ---------- SCUM FILE EXPORT HELPERS ----------
def _export_user_list(entries: List[Dict[str, Any]]) -> str:
    """Render entries back to AdminUsers.ini/BannedUsers.ini/ExclusiveUsers.ini format."""
    lines = []
    for e in entries:
        sid = str(e.get("steam_id", "")).strip()
        if not sid:
            continue
        flags = [f for f in e.get("flags", []) if f]
        if flags:
            lines.append(f"{sid}[{','.join(flags)}]")
        else:
            lines.append(sid)
    return "\n".join(lines) + ("\n" if lines else "")


def _parse_user_list(text: str) -> List[Dict[str, Any]]:
    entries: List[Dict[str, Any]] = []
    for raw in text.splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or line.startswith(";"):
            continue
        flags: List[str] = []
        sid = line
        if "[" in line and line.endswith("]"):
            sid, rest = line.split("[", 1)
            rest = rest[:-1]
            flags = [f.strip() for f in rest.split(",") if f.strip()]
        entries.append({"steam_id": sid.strip(), "flags": flags, "note": ""})
    return entries


@api_router.get("/servers/{server_id}/export/{file_key}")
async def export_server_file(server_id: str, file_key: str):
    doc = await db.servers.find_one({"id": server_id}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Server not found")
    settings = doc.get("settings", {})
    filename_map = {
        "admins": ("AdminUsers.ini", "users_admins"),
        "banned": ("BannedUsers.ini", "users_banned"),
        "exclusive": ("ExclusiveUsers.ini", "users_exclusive"),
    }
    if file_key in filename_map:
        filename, key = filename_map[file_key]
        content = _export_user_list(settings.get(key, []))
        return {"filename": filename, "content": content}
    if file_key == "economy":
        import json as _json
        content = _json.dumps({"economy-override": settings.get("economy_override", {})}, indent=2)
        return {"filename": "EconomyOverride.json", "content": content}
    if file_key == "gameusersettings":
        sections = {
            "Game": settings.get("client_game", {}),
            "Mouse": settings.get("client_mouse", {}),
            "Video": settings.get("client_video", {}),
            "Graphics": settings.get("client_graphics", {}),
            "Sound": settings.get("client_sound", {}),
        }
        lines: List[str] = []
        for section, kv in sections.items():
            lines.append(f"[{section}]")
            for k, v in kv.items():
                if isinstance(v, bool):
                    v_str = "True" if v else "False"
                elif isinstance(v, float):
                    v_str = f"{v:.6f}"
                else:
                    v_str = str(v)
                lines.append(f"{k}={v_str}")
            lines.append("")
        return {"filename": "GameUserSettings.ini", "content": "\n".join(lines)}
    raise HTTPException(status_code=400, detail="Unknown file_key")


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
        settings[key_map[file_key]] = _parse_user_list(text)
    elif file_key == "economy":
        import json as _json
        data = _json.loads(text)
        overrides = data.get("economy-override", data)
        settings["economy_override"] = {k: v for k, v in overrides.items() if not isinstance(v, (dict, list))}
    else:
        raise HTTPException(status_code=400, detail="Unknown file_key")
    await db.servers.update_one({"id": server_id}, {"$set": {"settings": settings}})
    doc["settings"] = settings
    return ServerProfile(**doc)


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
