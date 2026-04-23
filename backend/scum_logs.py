"""SCUM server log parsing.

SCUM writes logs to `SCUM/Saved/SaveFiles/Logs/` in **UTF-16 LE with BOM**.
Each file has a single "Game version: ..." header line followed by event lines.
Event lines share a common prefix:  `YYYY.MM.DD-HH.MM.SS: <content>`

File types this module understands:
    admin_*.log        — admin command invocations (teleport, spawnitem, ban, kick, ...)
    chat_*.log         — in-game chat (Global / Squad / Local)
    login_*.log        — player connect / disconnect
    kill_*.log         — PvP and PvE kills (weapon + distance + coords)
    economy_*.log      — trader transactions (buy / sell / balances)
    violations_*.log   — anti-cheat detections
    famepoints_*.log   — fame point gains / losses
    raid_*.log         — raid time windows start/stop
    armor_absorption_*.log, chest_ownership_*.log — rarely used, parsed as generic

Each parser returns a list of `Event` dicts ready to be stored in MongoDB or broadcast
to a WebSocket stream. All parsers are pure functions; they do NO I/O so they can be
reused by the live file watcher, the bulk importer, and pytest.
"""
from __future__ import annotations

import hashlib
import json
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

# ----- encoding helpers ---------------------------------------------------

def _decode_scum_log_bytes(raw: bytes) -> str:
    """SCUM logs are UTF-16 LE with BOM. Decode robustly."""
    if raw[:2] in (b"\xff\xfe", b"\xfe\xff"):
        return raw.decode("utf-16", errors="replace")
    # Heuristic: every other byte is null
    if len(raw) > 4 and raw[1] == 0 and raw[3] == 0:
        return raw.decode("utf-16-le", errors="replace")
    return raw.decode("utf-8", errors="replace")


def read_log_file(path: str | Path) -> str:
    return _decode_scum_log_bytes(Path(path).read_bytes())


# ----- common primitives --------------------------------------------------

# '2026.01.04-13.41.43: <rest>'
_LINE_RX = re.compile(r"^(\d{4}\.\d{2}\.\d{2}-\d{2}\.\d{2}\.\d{2}):\s*(.*)$")

# '76561199169074640:WXSO(1)'
_WHO_RX = re.compile(r"(\d{17}):([^\s'\"]+?)\((\d+)\)")


def _parse_ts(ts: str) -> Optional[str]:
    try:
        dt = datetime.strptime(ts, "%Y.%m.%d-%H.%M.%S").replace(tzinfo=timezone.utc)
        return dt.isoformat()
    except ValueError:
        return None


def _event_id(*parts: Any) -> str:
    """Deterministic id so replaying a log doesn't create duplicates in Mongo."""
    s = "|".join(str(p) for p in parts)
    return hashlib.sha1(s.encode("utf-8")).hexdigest()[:24]


# ----- individual parsers -------------------------------------------------

def parse_admin_line(ts_iso: str, body: str) -> Optional[Dict[str, Any]]:
    # SCUM's real admin log format is:
    #   '76561199...:Gabriel(10)' '#Command args...'
    # The legacy "Command: '...'" format still appears in some mods.
    # Try modern hash-prefix format first.
    m = re.match(r"'(?P<who>[^']+)'\s+'#(?P<cmd>[^']*)'", body)
    if not m:
        m = re.match(r"'(?P<who>[^']+)'\s+Command:\s+'(?P<cmd>[^']+)'", body)
    if not m:
        return None
    who = m.group("who")
    cmd_full = m.group("cmd").strip()
    parts = cmd_full.split(None, 1)
    verb = parts[0].lower() if parts else ""
    args = parts[1] if len(parts) > 1 else ""
    w = _WHO_RX.search(who)
    return {
        "type": "admin",
        "ts": ts_iso,
        "steam_id": w.group(1) if w else None,
        "player_name": w.group(2) if w else None,
        "entity_id": int(w.group(3)) if w else None,
        "command": verb or "?",
        "args": args,
        "raw": body,
    }


def parse_chat_line(ts_iso: str, body: str) -> Optional[Dict[str, Any]]:
    # Real SCUM server chat log format (primary):
    #   '76561199...:Gabriel(10)' 'Local: hello testing'
    # Legacy/alternate format we still support:
    #   '76561199...:Gabriel(10)' 'Local' 'hello testing'
    channel = None
    msg = None
    who = None

    # Primary: 'who' 'Channel: message'
    m = re.match(
        r"'(?P<who>[^']+)'\s+'(?P<channel>Global|Squad|Local|Admin|Whisper|Team)\s*:\s*(?P<msg>.*)'\s*$",
        body,
    )
    if m:
        who = m.group("who")
        channel = m.group("channel")
        msg = m.group("msg")
    else:
        # Legacy: 'who' 'Channel' 'message'
        m = re.match(
            r"'(?P<who>[^']+)'\s+'(?P<channel>Global|Squad|Local|Admin|Whisper|Team)'\s+'(?P<msg>.*)'\s*$",
            body,
        )
        if not m:
            return None
        who = m.group("who")
        channel = m.group("channel")
        msg = m.group("msg")

    w = _WHO_RX.search(who)
    return {
        "type": "chat",
        "ts": ts_iso,
        "channel": channel,
        "steam_id": w.group(1) if w else None,
        "player_name": w.group(2) if w else None,
        "entity_id": int(w.group(3)) if w else None,
        "message": msg,
        "raw": body,
    }


def parse_login_line(ts_iso: str, body: str) -> Optional[Dict[str, Any]]:
    # '76561199...:WXSO(1)' logged in at: X=... Y=... Z=...
    m = re.match(
        r"'(?P<who>[^']+)'\s+(?P<action>logged in|logged out|disconnected|connected)\b(?P<rest>.*)$",
        body,
        flags=re.IGNORECASE,
    )
    if not m:
        return None
    w = _WHO_RX.search(m.group("who"))
    return {
        "type": "login",
        "ts": ts_iso,
        "action": m.group("action").lower().replace(" ", "_"),
        "steam_id": w.group(1) if w else None,
        "player_name": w.group(2) if w else None,
        "entity_id": int(w.group(3)) if w else None,
        "raw": body,
    }


def parse_kill_line(ts_iso: str, body: str) -> Optional[Dict[str, Any]]:
    """Parse SCUM kill_*.log entries. Format is:
        Died: VICTIM (STEAM_ID), Killer: KILLER (STEAM_ID) Weapon: X [Projectile]
        S[KillerLoc: A,B,C VictimLoc: A,B,C, Distance: 42.12 m] C[...]

    The server emits TWO lines per kill: a human-readable one (the one we want)
    and a JSON companion. We ignore the JSON line (handled by early-return) but
    keep it as `raw` if the regex misses.
    """
    # Skip the JSON companion line — it starts with '{"Killer":'
    if body.lstrip().startswith("{"):
        return {"_skip": True}

    # Real format: "Died: NAME (SID), Killer: NAME (SID) Weapon: W [TAG]
    #               S[... Distance: 1.91 m] C[... Distance: 2.07 m]"
    # The C[...] block (client-side) has the most reliable "effective" distance
    # after lag compensation; prefer it, fall back to S[...] (server-side).
    m = re.search(
        r"Died:\s*(?P<vn>[^(]+)\((?P<vs>\d{17})\),\s*"
        r"Killer:\s*(?P<kn>[^(]+)\((?P<ks>\d{17})\)\s+"
        r"Weapon:\s*(?P<w>Weapon_\S+|\S+?)(?:\s*\[[^\]]*\])?\s+"
        r"S\[[^\]]*?Distance:\s*(?P<sd>[0-9.]+)\s*m\]",
        body,
    )
    cd = None
    if m:
        cm = re.search(r"C\[[^\]]*?Distance:\s*([0-9.]+)\s*m\]", body)
        if cm:
            cd = cm.group(1)
    if not m:
        # Legacy variant "Killer: ... Victim: ..." kept as fallback for old servers
        legacy = re.search(
            r"Killer:\s*(?P<kn>[^\(]+)\((?P<ks>\d{17})\).*?"
            r"Victim:\s*(?P<vn>[^\(]+)\((?P<vs>\d{17})\).*?"
            r"Weapon:\s*(?P<w>\S+).*?Distance:\s*(?P<d>[0-9.]+)",
            body, flags=re.IGNORECASE,
        )
        if not legacy:
            return None
        return {
            "type": "kill", "ts": ts_iso,
            "killer_name": legacy.group("kn").strip(),
            "killer_steam_id": legacy.group("ks"),
            "victim_name": legacy.group("vn").strip(),
            "victim_steam_id": legacy.group("vs"),
            "weapon": _clean_weapon(legacy.group("w")),
            "distance_m": float(legacy.group("d")),
            "raw": body,
        }

    dist_str = cd or m.group("sd")
    return {
        "type": "kill",
        "ts": ts_iso,
        "killer_name": m.group("kn").strip(),
        "killer_steam_id": m.group("ks"),
        "victim_name": m.group("vn").strip(),
        "victim_steam_id": m.group("vs"),
        "weapon": _clean_weapon(m.group("w")),
        "distance_m": float(dist_str) if dist_str else None,
        "raw": body,
    }


def _clean_weapon(w: str) -> str:
    """Turn 'Weapon_M82A1_Black_C [Projectile]' into 'M82A1 Black' for display."""
    s = (w or "").strip().rstrip(",")
    # Strip the trailing "[Projectile]" / "[Melee]" tag
    s = re.sub(r"\s*\[[^\]]*\]\s*$", "", s)
    # Strip Weapon_ prefix and _C suffix, replace underscores
    s = re.sub(r"^Weapon_", "", s)
    s = re.sub(r"_C$", "", s)
    s = s.replace("_", " ").strip()
    return s or "Unknown"


_TRADE_MAIN_RX = re.compile(
    r"\[Trade\]\s+Tradeable\s+\(([^(]+)\s*\(x(\d+)\)\)\s+"
    r"(?P<action>purchased|sold)\s+by\s+(?P<name>[^(]+)\((?P<sid>\d{17})\)\s+"
    r"(?:for|to)\s+(?P<amt>\d+)\s+money\s+(?:from|to)\s+trader\s+(?P<trader>\S+)",
    flags=re.IGNORECASE,
)

# Modern SCUM 1.2+ trade line. Item has no "(xN)" wrapper and uses
# health/uses stats instead. Example:
#   [Trade] Tradeable (Boar_Skinned (health: 100.00, uses: 1)) sold by WXSO(76561199169074640)
#   for 293 (293 + 0 worth of contained items) to trader Z_3_Saloon, old amount in store is 3, new amount is 4
_TRADE_MODERN_RX = re.compile(
    r"\[Trade\]\s+Tradeable\s+\((?P<item>[A-Za-z0-9_]+)\s*\([^)]*\)\)\s+"
    r"(?P<action>purchased|sold)\s+by\s+(?P<name>[^(]+)\((?P<sid>\d{17})\)\s+"
    r"(?:for|to)\s+(?P<amt>\d+)\s+"
    r"(?:\([^)]*\)\s+)?"
    r"(?:from|to)\s+trader\s+(?P<trader>[A-Za-z0-9_]+)",
    flags=re.IGNORECASE,
)

# "[Trade] Before ... player NAME(SID) had C cash, B account balance and G gold and trader had F funds."
# "[Trade] After ...  player NAME(SID) has  C cash, B account balance and G gold and trader has  F funds."
# Emits a `balance_snapshot` event so the UI can show live cash/bank/gold
# without querying SCUM.db.
_TRADE_BALANCE_RX = re.compile(
    r"\[Trade\]\s+(?P<phase>Before|After)\b.*?"
    r"player\s+(?P<name>[^(]+)\((?P<sid>\d{17})\)\s+"
    r"(?:had|has)\s+(?P<cash>-?\d+)\s+cash\s*,\s*"
    r"(?P<bal>-?\d+)\s+account\s+balance\s+and\s+(?P<gold>-?\d+)\s+gold\s+"
    r"and\s+trader\s+(?:had|has)\s+(?P<funds>-?\d+)\s+funds",
    flags=re.IGNORECASE,
)

# "[Bank] NAME(ID:SID)(Account Number:N) purchased Gold card (free renewal: no), new account balance is X credits, at X=... Y=... Z=..."
# "[Bank] NAME(ID:SID)(Account Number:N) deposited N money, new account balance is X credits..."
_BANK_RX = re.compile(
    r"\[Bank\]\s+(?P<name>[^(]+)\(ID:(?P<sid>\d{17})\)"
    r"(?:\(Account\s+Number:(?P<acct>\d+)\))?\s+"
    r"(?P<action>[a-z][a-z ]+?)\s+"
    r"(?P<detail>.*?),?\s+new\s+account\s+balance\s+is\s+(?P<bal>-?\d+)\s+credits",
    flags=re.IGNORECASE,
)


def parse_economy_line(ts_iso: str, body: str) -> Optional[Dict[str, Any]]:
    # --- [Bank] lines (Gold card purchase, deposit, withdrawal, etc.) ---
    if body.startswith("[Bank]"):
        bm = _BANK_RX.search(body)
        if bm:
            return {
                "type": "bank",
                "ts": ts_iso,
                "action": bm.group("action").strip().lower(),
                "detail": (bm.group("detail") or "").strip().rstrip(","),
                "account_balance": int(bm.group("bal")),
                "account_number": bm.group("acct"),
                "player_name": bm.group("name").strip(),
                "steam_id": bm.group("sid"),
                "raw": body,
            }
        # Unknown [Bank] format — fall through to generic so the raw text is kept.
        return None

    if not body.startswith("[Trade]"):
        return None

    # Parse Before/After balance snapshots — gives us live cash/bank/gold
    # per player with zero SCUM.db reads.
    if body.startswith("[Trade] Before ") or body.startswith("[Trade] After "):
        bm = _TRADE_BALANCE_RX.search(body)
        if bm:
            return {
                "type": "balance_snapshot",
                "ts": ts_iso,
                "phase": bm.group("phase").lower(),
                "cash": int(bm.group("cash")),
                "account_balance": int(bm.group("bal")),
                "gold": int(bm.group("gold")),
                "trader_funds": int(bm.group("funds")),
                "player_name": bm.group("name").strip(),
                "steam_id": bm.group("sid"),
                "raw": body,
            }
        # If it didn't match the balance line regex, skip entirely — these
        # are companion lines and shouldn't be stored as generic.
        return {"_skip": True}

    # Try modern SCUM 1.2+ format first; fall back to legacy "money" format.
    m_mod = _TRADE_MODERN_RX.search(body)
    if m_mod:
        g = m_mod.groupdict()
        return {
            "type": "economy",
            "ts": ts_iso,
            "action": g["action"].lower(),
            "item_code": g["item"].strip(),
            "quantity": 1,  # modern log encodes stack via "uses", not count
            "amount": int(g["amt"]),
            "currency": "money",
            "trader": g["trader"].rstrip(",."),
            "player_name": g["name"].strip(),
            "steam_id": g["sid"],
            "raw": body,
        }
    m = _TRADE_MAIN_RX.search(body)
    if not m:
        return None
    return {
        "type": "economy",
        "ts": ts_iso,
        "action": m.group("action").lower(),
        "item_code": m.group(1).strip(),
        "quantity": int(m.group(2)),
        "amount": int(m.group("amt")),
        "currency": "money",
        "trader": m.group("trader").rstrip(",."),
        "player_name": m.group("name").strip(),
        "steam_id": m.group("sid"),
        "raw": body,
    }


def parse_violations_line(ts_iso: str, body: str) -> Optional[Dict[str, Any]]:
    w = _WHO_RX.search(body)
    return {
        "type": "violation",
        "ts": ts_iso,
        "steam_id": w.group(1) if w else None,
        "player_name": w.group(2) if w else None,
        "entity_id": int(w.group(3)) if w else None,
        "description": body,
        "raw": body,
    }


def parse_fame_line(ts_iso: str, body: str) -> Optional[Dict[str, Any]]:
    """Parse SCUM fame/famepoints log. Multiple formats exist across patches:

    Modern (1.x):  "'SID:Name(ID)' gained '5.00' fame for 'Surviving'"
    Alt (older):   "Name (SID) gained 5 fame"
    JSON-style:    '{"PlayerName":"X","UserId":"SID","FamePoints":5.00,"Reason":"..."}'
    """
    # --- JSON variant ---
    if body.lstrip().startswith("{"):
        try:
            obj = json.loads(body)
            sid = obj.get("UserId") or obj.get("SteamId") or obj.get("steam_id")
            if not sid:
                return None
            return {
                "type": "fame", "ts": ts_iso,
                "player_name": obj.get("PlayerName") or obj.get("ProfileName") or obj.get("name"),
                "steam_id": str(sid),
                "delta": float(obj.get("FamePoints") or obj.get("Delta") or obj.get("Points") or 0),
                "reason": obj.get("Reason") or obj.get("Description"),
                "raw": body,
            }
        except Exception:
            pass

    # --- Modern: 'SID:Name(ID)' gained/lost 'N.NN' fame for 'Reason' ---
    m = re.search(
        r"'(?P<sid>\d{17}):(?P<name>[^(]+)\(\d+\)'\s+"
        r"(?P<act>gained|lost|awarded|deducted|received)\s+'?(?P<amt>-?[0-9.]+)'?\s+"
        r"(?:fame\s*(?:points?)?|points?)\s+"
        r"(?:for\s+'(?P<reason>[^']+)')?",
        body, flags=re.IGNORECASE,
    )
    if m:
        amt = float(m.group("amt"))
        if m.group("act").lower() in ("lost", "deducted"):
            amt = -abs(amt)
        return {
            "type": "fame", "ts": ts_iso,
            "player_name": m.group("name").strip(),
            "steam_id": m.group("sid"),
            "delta": amt,
            "reason": (m.group("reason") or "").strip() or None,
            "raw": body,
        }

    # --- Legacy: Name (SID) gained 5 fame ---
    m = re.search(
        r"(?P<name>[^(]+)\((?P<sid>\d{17})\).*?"
        r"(?P<act>gained|lost|awarded|deducted|received)\s+(?P<amt>-?[0-9.]+)\s+fame",
        body, flags=re.IGNORECASE,
    )
    if not m:
        return None
    amt = float(m.group("amt"))
    if m.group("act").lower() in ("lost", "deducted"):
        amt = -abs(amt)
    return {
        "type": "fame", "ts": ts_iso,
        "player_name": m.group("name").strip(),
        "steam_id": m.group("sid"),
        "delta": amt,
        "raw": body,
    }


def parse_vehicle_destruction_line(ts_iso: str, body: str) -> Optional[Dict[str, Any]]:
    """Parse vehicle_destruction_*.log lines. Real SCUM format (1.2+):

        [Destroyed] Rager_ES. VehicleId: 70028. Owner: N/A. Location: X=... Y=... Z=...
        [Entity destroyed] Kinglet_Mariner_ES. VehicleId: 70704. Owner: N/A. Location: ...

    Older/alt variant with explicit Killer is also handled:

        [VehicleDestroyed] Vehicle: BP_LandVehicle_X_C (VehicleId=...), Owner: SID (N), DestroyedBy: SID (N), Reason: X

    The newer format doesn't include a destroyer (most kills are environmental
    damage / entity timeout), so we populate what's available.
    """
    if body.lstrip().startswith("{"):
        return {"_skip": True}

    # --- NEW FORMAT (1.2+) ---
    # [Destroyed] Rager_ES. VehicleId: 70028. Owner: N/A. Location: X=1 Y=2 Z=3
    m = re.match(
        r"\[(?P<kind>Destroyed|Entity destroyed|VehicleDestroyed)\]\s+"
        r"(?P<klass>[A-Za-z0-9_]+)\.\s*"
        r"VehicleId:\s*(?P<vid>\d+)\.\s*"
        r"Owner:\s*(?P<owner>[^.]+?)\.\s*"
        r"Location:\s*X=(?P<x>-?[0-9.]+)\s+Y=(?P<y>-?[0-9.]+)\s+Z=(?P<z>-?[0-9.]+)",
        body,
    )
    if m:
        owner_raw = m.group("owner").strip()
        # Owner can be "N/A", "76561199... (Gabriel)", or just "Gabriel"
        owner_sid: Optional[str] = None
        owner_name: Optional[str] = None
        if owner_raw and owner_raw.upper() != "N/A":
            sidm = re.search(r"(\d{17})\s*(?:\(([^)]+)\))?", owner_raw)
            if sidm:
                owner_sid = sidm.group(1)
                owner_name = (sidm.group(2) or "").strip() or None
            else:
                owner_name = owner_raw
        klass = m.group("klass")
        pretty = re.sub(r"^BP_(?:Land|Sea|Air)?Vehicle_", "", klass)
        pretty = re.sub(r"_C$", "", pretty).replace("_", " ").strip() or klass
        entity_only = m.group("kind").lower().startswith("entity")
        return {
            "type": "vehicle_destruction",
            "ts": ts_iso,
            "vehicle_class": klass,
            "vehicle_pretty": pretty,
            "vehicle_id": int(m.group("vid")),
            "owner_steam_id": owner_sid,
            "owner_name": owner_name,
            "killer_steam_id": None,
            "killer_name": None,
            "reason": "EntityTimeout" if entity_only else "Destroyed",
            "location": {"x": float(m.group("x")), "y": float(m.group("y")), "z": float(m.group("z"))},
            "steam_id": owner_sid,
            "player_name": owner_name,
            "raw": body,
        }

    # --- OLDER / ALT FORMAT with explicit Killer ---
    vm = re.search(r"Vehicle:\s*([A-Za-z0-9_]+)", body)
    veh_class = vm.group(1) if vm else None

    def _pair(tag: str) -> Tuple[Optional[str], Optional[str]]:
        mm = re.search(
            rf"{tag}:\s*(?:(\d{{17}})\s*\(([^)]+)\)|([^\s(]+)\s*\((\d{{17}})\))",
            body, flags=re.IGNORECASE,
        )
        if not mm:
            return (None, None)
        if mm.group(1):
            return (mm.group(1), mm.group(2).strip())
        return (mm.group(4), mm.group(3).strip())

    owner_sid, owner_name = _pair("Owner")
    killer_sid, killer_name = _pair("(?:DestroyedBy|Destroyer|Killer)")

    reason = None
    rm = re.search(r"Reason:\s*([A-Za-z_]+)", body)
    if rm:
        reason = rm.group(1)

    if not veh_class and not owner_sid and not killer_sid:
        return None

    pretty = None
    if veh_class:
        pretty = re.sub(r"^BP_(?:Land|Sea|Air)?Vehicle_", "", veh_class)
        pretty = re.sub(r"_C$", "", pretty).replace("_", " ").strip()

    return {
        "type": "vehicle_destruction",
        "ts": ts_iso,
        "vehicle_class": veh_class,
        "vehicle_pretty": pretty or veh_class,
        "owner_steam_id": owner_sid,
        "owner_name": owner_name,
        "killer_steam_id": killer_sid,
        "killer_name": killer_name,
        "reason": reason,
        "steam_id": owner_sid,
        "player_name": owner_name,
        "raw": body,
    }


def parse_generic_line(ts_iso: str, body: str, log_type: str) -> Dict[str, Any]:
    w = _WHO_RX.search(body)
    return {
        "type": log_type,
        "ts": ts_iso,
        "steam_id": w.group(1) if w else None,
        "player_name": w.group(2) if w else None,
        "entity_id": int(w.group(3)) if w else None,
        "raw": body,
    }


# ----- dispatch -----------------------------------------------------------

LOG_TYPE_ORDER = [
    "admin", "chat", "login", "kill", "economy", "violation", "fame", "raid",
    "armor_absorption", "chest_ownership", "event_kill", "quest", "lockpicking",
    "destruction", "vehicle_destruction", "mine_trigger", "generic",
]


def detect_log_type(filename: str) -> str:
    base = Path(filename).name.lower()
    # strip trailing _YYYYMMDDHHMMSS.log
    base = re.sub(r"_\d{14}\.log$", "", base)
    base = re.sub(r"\.log$", "", base)
    mapping = {
        "admin": "admin",
        "chat": "chat",
        "login": "login",
        "kill": "kill",
        "economy": "economy",
        "violations": "violation",
        "famepoints": "fame",
        "fame": "fame",
        "raid_protection": "raid",
        "raid": "raid",
        "armor_absorption": "armor_absorption",
        "chest_ownership": "chest_ownership",
        "event_kill": "event_kill",
        "quest": "quest",
        "lockpicking": "lockpicking",
        "destruction": "destruction",
        "vehicle_destruction": "vehicle_destruction",
        "mine_trigger": "mine_trigger",
    }
    return mapping.get(base, "generic")


def _parser_for(log_type: str):
    return {
        "admin": parse_admin_line,
        "chat": parse_chat_line,
        "login": parse_login_line,
        "kill": parse_kill_line,
        "economy": parse_economy_line,
        "violation": parse_violations_line,
        "fame": parse_fame_line,
        "vehicle_destruction": parse_vehicle_destruction_line,
    }.get(log_type)


def parse_log_text(text: str, log_type: str, *, filename: str = "", server_id: str = "") -> List[Dict[str, Any]]:
    """Parse a full log file's text content. Skips the 'Game version' header and blank lines."""
    parser = _parser_for(log_type)
    events: List[Dict[str, Any]] = []
    for raw_line in text.splitlines():
        line = raw_line.strip().lstrip("\ufeff")
        if not line:
            continue
        m = _LINE_RX.match(line)
        if not m:
            continue
        ts_str, body = m.group(1), m.group(2)
        if body.startswith("Game version"):
            continue
        ts_iso = _parse_ts(ts_str) or datetime.now(timezone.utc).isoformat()
        ev: Optional[Dict[str, Any]] = None
        if parser:
            try:
                ev = parser(ts_iso, body)
            except Exception:
                ev = None
        if ev is not None and ev.get("_skip"):
            continue
        if ev is None:
            ev = parse_generic_line(ts_iso, body, log_type)
        ev["server_id"] = server_id
        ev["source_file"] = Path(filename).name if filename else ""
        # Deterministic id: server + timestamp + full body text.
        # We intentionally DROP source_file from the hash input — SCUM rotates log
        # files and can re-write the same login snapshot into a new file name,
        # which previously produced duplicate events (and duplicate Discord pings).
        ev["id"] = _event_id(server_id, ts_iso, body)
        events.append(ev)
    return events


def parse_log_file(path: str | Path, *, server_id: str = "") -> Tuple[str, List[Dict[str, Any]]]:
    text = read_log_file(path)
    log_type = detect_log_type(str(path))
    return log_type, parse_log_text(text, log_type, filename=str(path), server_id=server_id)
