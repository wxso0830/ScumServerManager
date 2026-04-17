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
