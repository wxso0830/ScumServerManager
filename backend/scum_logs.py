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
        "command": verb,
        "args": args,
        "raw": body,
    }


def parse_chat_line(ts_iso: str, body: str) -> Optional[Dict[str, Any]]:
    # '76561199...:WXSO(1)' 'Global' 'hello world'
    m = re.match(
        r"'(?P<who>[^']+)'\s+'(?P<channel>Global|Squad|Local|Admin|Whisper|Team)'\s+'(?P<msg>.*)'\s*$",
        body,
    )
    if not m:
        return None
    w = _WHO_RX.search(m.group("who"))
    return {
        "type": "chat",
        "ts": ts_iso,
        "channel": m.group("channel"),
        "steam_id": w.group(1) if w else None,
        "player_name": w.group(2) if w else None,
        "entity_id": int(w.group(3)) if w else None,
        "message": m.group("msg"),
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
    # Format observed in real servers:
    #   Killer: NAME (STEAM_ID) -> Victim: NAME (STEAM_ID) | Weapon: X | Distance: 42.3m
    # SCUM's own format varies across patches; we try the most common variants.
    m = re.search(
        r"Killer:\s*(?P<kn>[^\(]+)\((?P<ks>\d{17})\).*?Victim:\s*(?P<vn>[^\(]+)\((?P<vs>\d{17})\).*?Weapon:\s*(?P<w>[^\s|]+).*?Distance:\s*(?P<d>[0-9.]+)",
        body,
        flags=re.IGNORECASE,
    )
    if not m:
        return None
    return {
        "type": "kill",
        "ts": ts_iso,
        "killer_name": m.group("kn").strip(),
        "killer_steam_id": m.group("ks"),
        "victim_name": m.group("vn").strip(),
        "victim_steam_id": m.group("vs"),
        "weapon": m.group("w"),
        "distance_m": float(m.group("d")),
        "raw": body,
    }


_TRADE_MAIN_RX = re.compile(
    r"\[Trade\]\s+Tradeable\s+\(([^(]+)\s*\(x(\d+)\)\)\s+"
    r"(?P<action>purchased|sold)\s+by\s+(?P<name>[^(]+)\((?P<sid>\d{17})\)\s+"
    r"(?:for|to)\s+(?P<amt>\d+)\s+money\s+(?:from|to)\s+trader\s+(?P<trader>\S+)",
    flags=re.IGNORECASE,
)


def parse_economy_line(ts_iso: str, body: str) -> Optional[Dict[str, Any]]:
    if not body.startswith("[Trade]"):
        return None
    # Skip the before/after balance companion lines (only emit the main transaction line).
    if body.startswith("[Trade] Before ") or body.startswith("[Trade] After "):
        return {"_skip": True}  # sentinel: don't fall back to generic
    m = _TRADE_MAIN_RX.search(body)
    if not m:
        return None
    item = m.group(1).strip()
    trader = m.group("trader").rstrip(",.")
    return {
        "type": "economy",
        "ts": ts_iso,
        "action": m.group("action").lower(),
        "item_code": item,
        "quantity": int(m.group(2)),
        "amount": int(m.group("amt")),
        "currency": "money",
        "trader": trader,
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
    m = re.search(r"(?P<name>[^(]+)\((?P<sid>\d{17})\).*?(?:gained|lost|awarded|deducted)\s+(?P<amt>-?\d+)\s+fame", body, flags=re.IGNORECASE)
    if not m:
        return None
    return {
        "type": "fame",
        "ts": ts_iso,
        "player_name": m.group("name").strip(),
        "steam_id": m.group("sid"),
        "delta": int(m.group("amt")),
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
        ev["id"] = _event_id(server_id, ev["source_file"], ts_iso, body)
        events.append(ev)
    return events


def parse_log_file(path: str | Path, *, server_id: str = "") -> Tuple[str, List[Dict[str, Any]]]:
    text = read_log_file(path)
    log_type = detect_log_type(str(path))
    return log_type, parse_log_text(text, log_type, filename=str(path), server_id=server_id)
