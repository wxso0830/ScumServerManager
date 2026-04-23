"""
Read-only helper for SCUM's game database (SQLite).

SCUM stores ALL live persistent data in `{folder}/SCUM/Saved/SaveFiles/SCUM.db`:
  * `user_profile`         — player fame points, name, steam id, squad membership
  * `vehicle_entity`       — every spawned vehicle with owner steam id
  * `base_element`         — squad flags / base elements
  * `squad`, `squad_member`— squad data

The log files don't contain current totals — only deltas. To show a player's
fame / vehicle / flag counts in the UI we have to query this DB directly.

Safe behaviour:
  - Always opens in read-only URI mode (no possibility of corrupting the live DB)
  - Uses short connection timeouts so a locked DB (server actively writing) never
    freezes the manager; returns best-effort data and moves on.
  - All column / table names are guarded with try/except so future SCUM patches
    that rename things don't kill the Players view.
"""
from __future__ import annotations
from pathlib import Path
from typing import Any, Dict, List, Optional
import logging
import sqlite3

logger = logging.getLogger("scum_db")

# Each element: (sql, param_builder). First query that returns rows wins.
# This lets us support column names that have changed across SCUM patches.
_FAME_QUERIES = [
    "SELECT user_id, name, fame_points FROM user_profile",
    "SELECT user_id, name, fame FROM user_profile",
    "SELECT user_id, name, fame_points FROM UserProfile",
]

_VEHICLE_OWNER_QUERIES = [
    # owner_user_profile_id references user_profile.id
    """SELECT up.user_id AS sid, COUNT(v.id) AS cnt
       FROM vehicle_entity v
       JOIN user_profile up ON up.id = v.owner_user_profile_id
       GROUP BY up.user_id""",
    """SELECT up.user_id AS sid, COUNT(v.id) AS cnt
       FROM vehicle_entity v
       JOIN user_profile up ON up.id = v.owner_id
       GROUP BY up.user_id""",
    """SELECT owner_user_id AS sid, COUNT(*) AS cnt
       FROM vehicle_entity
       GROUP BY owner_user_id""",
]

_VEHICLE_LOCKED_QUERIES = [
    # "Locked" = player put a personal padlock on the vehicle. SCUM stores
    # this on the vehicle itself (is_locked flag or a lock_code != 0).
    """SELECT up.user_id AS sid, COUNT(v.id) AS cnt
       FROM vehicle_entity v
       JOIN user_profile up ON up.id = v.owner_user_profile_id
       WHERE v.is_locked = 1
       GROUP BY up.user_id""",
    """SELECT up.user_id AS sid, COUNT(v.id) AS cnt
       FROM vehicle_entity v
       JOIN user_profile up ON up.id = v.owner_user_profile_id
       WHERE v.lock_code IS NOT NULL AND v.lock_code != ''
       GROUP BY up.user_id""",
]

_VEHICLE_SQUAD_QUERIES = [
    # Vehicles owned by anyone in the player's squad
    """SELECT up.user_id AS sid, COUNT(v.id) AS cnt
       FROM vehicle_entity v
       JOIN user_profile owner ON owner.id = v.owner_user_profile_id
       JOIN squad_member sm_owner ON sm_owner.user_profile_id = owner.id
       JOIN squad_member sm_query ON sm_query.squad_id = sm_owner.squad_id
       JOIN user_profile up ON up.id = sm_query.user_profile_id
       GROUP BY up.user_id""",
]

_FLAG_QUERIES = [
    # Squad flags: each squad flag belongs to a squad; count by squad members
    """SELECT up.user_id AS sid, COUNT(DISTINCT be.id) AS cnt
       FROM base_element be
       JOIN squad s ON s.id = be.squad_id
       JOIN squad_member sm ON sm.squad_id = s.id
       JOIN user_profile up ON up.id = sm.user_profile_id
       WHERE be.is_flag = 1 OR be.type = 'Flag' OR be.class_name LIKE '%Flag%'
       GROUP BY up.user_id""",
    # Per-user flag base element
    """SELECT up.user_id AS sid, COUNT(be.id) AS cnt
       FROM base_element be
       JOIN user_profile up ON up.id = be.owner_user_profile_id
       WHERE be.class_name LIKE '%Flag%'
       GROUP BY up.user_id""",
]

_SQUAD_QUERIES = [
    """SELECT up.user_id AS sid, s.name AS squad_name, s.id AS squad_id
       FROM squad_member sm
       JOIN squad s ON s.id = sm.squad_id
       JOIN user_profile up ON up.id = sm.user_profile_id""",
]

# --- Player wallet (bank cash + gold) -------------------------------------
# SCUM admin commands "set cash <n>" and "set gold <n>" write to user_profile.
# Column names have rotated across patches: try the common variants in order.
# First query whose first column actually exists wins.
_MONEY_QUERIES = [
    "SELECT user_id AS sid, account_balance AS amt FROM user_profile",
    "SELECT user_id AS sid, bank_account_balance AS amt FROM user_profile",
    "SELECT user_id AS sid, money AS amt FROM user_profile",
    "SELECT user_id AS sid, cash AS amt FROM user_profile",
    "SELECT user_id AS sid, currency AS amt FROM user_profile",
]

_GOLD_QUERIES = [
    "SELECT user_id AS sid, gold_balance AS amt FROM user_profile",
    "SELECT user_id AS sid, account_gold AS amt FROM user_profile",
    "SELECT user_id AS sid, gold AS amt FROM user_profile",
    "SELECT user_id AS sid, premium_currency AS amt FROM user_profile",
]

# --- Total play time -------------------------------------------------------
# SCUM tracks session time on the user_profile row. Column name varies.
_PLAYTIME_QUERIES = [
    "SELECT user_id AS sid, time_played AS secs FROM user_profile",
    "SELECT user_id AS sid, play_time AS secs FROM user_profile",
    "SELECT user_id AS sid, total_play_time AS secs FROM user_profile",
    "SELECT user_id AS sid, playtime_seconds AS secs FROM user_profile",
    "SELECT user_id AS sid, total_play_time_seconds AS secs FROM user_profile",
]

_VEHICLE_ENTITY_SNAPSHOT_QUERIES = [
    # Full vehicle roster with per-row owner steam id — used by the "claim"
    # detector to diff between polls and synthesize `vehicle_claim` events.
    """SELECT v.id AS vid, v.class_name AS klass, up.user_id AS owner_sid,
              up.name AS owner_name
       FROM vehicle_entity v
       LEFT JOIN user_profile up ON up.id = v.owner_user_profile_id""",
    """SELECT v.id AS vid, v.class_name AS klass, up.user_id AS owner_sid,
              up.name AS owner_name
       FROM vehicle_entity v
       LEFT JOIN user_profile up ON up.id = v.owner_id""",
]


def _open_ro(db_path: Path) -> Optional[sqlite3.Connection]:
    """Open SCUM.db in read-only mode. Returns None if the file doesn't exist
    or cannot be opened (locked / missing). Never raises to the caller."""
    if not db_path.exists():
        return None
    try:
        uri = f"file:{db_path.as_posix()}?mode=ro&immutable=0"
        conn = sqlite3.connect(uri, uri=True, timeout=2.0, check_same_thread=False)
        conn.row_factory = sqlite3.Row
        return conn
    except sqlite3.Error as e:
        logger.info("scum_db: cannot open %s: %s", db_path, e)
        return None


def _try_queries(conn: sqlite3.Connection, queries: List[str]) -> List[sqlite3.Row]:
    """Try each SQL in order; return the first non-error result.
    SCUM patches rename tables — this survives that."""
    for sql in queries:
        try:
            return list(conn.execute(sql))
        except sqlite3.Error:
            continue
    return []


def read_player_stats(folder_path: str) -> Dict[str, Dict[str, Any]]:
    """Return a {steam_id: {fame, vehicle_count, squad_vehicle_count, flag_count,
    squad_name, squad_id}} dict for every player currently in SCUM.db.

    Runs entirely on the calling thread (use `asyncio.to_thread` when calling
    from FastAPI). Completes in ~20-50ms even on a large save.
    """
    db_path = Path(folder_path) / "SCUM" / "Saved" / "SaveFiles" / "SCUM.db"
    conn = _open_ro(db_path)
    if conn is None:
        return {}

    stats: Dict[str, Dict[str, Any]] = {}
    try:
        # Fame + base record
        for row in _try_queries(conn, _FAME_QUERIES):
            sid = str(row["user_id"]) if row["user_id"] is not None else None
            if not sid:
                continue
            stats.setdefault(sid, {
                "fame": 0.0, "vehicle_count": 0, "squad_vehicle_count": 0,
                "flag_count": 0, "squad_name": None, "squad_id": None,
                "db_name": None,
                "money": None, "gold": None, "play_time_seconds": None,
            })
            stats[sid]["fame"] = float(row[2] or 0)
            stats[sid]["db_name"] = row["name"]

        # Vehicles owned directly
        for row in _try_queries(conn, _VEHICLE_OWNER_QUERIES):
            sid = str(row["sid"]) if row["sid"] is not None else None
            if not sid:
                continue
            stats.setdefault(sid, _empty_stat())
            stats[sid]["vehicle_count"] = int(row["cnt"] or 0)

        # Locked vehicles (personal padlock) — subset of owned
        for row in _try_queries(conn, _VEHICLE_LOCKED_QUERIES):
            sid = str(row["sid"]) if row["sid"] is not None else None
            if not sid:
                continue
            stats.setdefault(sid, _empty_stat())
            stats[sid]["locked_vehicle_count"] = int(row["cnt"] or 0)

        # Vehicles owned by anyone in the player's squad (includes self-owned)
        for row in _try_queries(conn, _VEHICLE_SQUAD_QUERIES):
            sid = str(row["sid"]) if row["sid"] is not None else None
            if not sid:
                continue
            stats.setdefault(sid, _empty_stat())
            stats[sid]["squad_vehicle_count"] = int(row["cnt"] or 0)

        # Flags
        for row in _try_queries(conn, _FLAG_QUERIES):
            sid = str(row["sid"]) if row["sid"] is not None else None
            if not sid:
                continue
            stats.setdefault(sid, _empty_stat())
            stats[sid]["flag_count"] = int(row["cnt"] or 0)

        # Squad info
        for row in _try_queries(conn, _SQUAD_QUERIES):
            sid = str(row["sid"]) if row["sid"] is not None else None
            if not sid:
                continue
            stats.setdefault(sid, _empty_stat())
            stats[sid]["squad_name"] = row["squad_name"]
            stats[sid]["squad_id"] = row["squad_id"]

        # Bank cash / money — tolerant to SCUM patch column renames
        for row in _try_queries(conn, _MONEY_QUERIES):
            sid = str(row["sid"]) if row["sid"] is not None else None
            if not sid:
                continue
            stats.setdefault(sid, _empty_stat())
            try:
                stats[sid]["money"] = int(row["amt"] or 0)
            except (ValueError, TypeError):
                stats[sid]["money"] = 0

        # Gold — tolerant to SCUM patch column renames
        for row in _try_queries(conn, _GOLD_QUERIES):
            sid = str(row["sid"]) if row["sid"] is not None else None
            if not sid:
                continue
            stats.setdefault(sid, _empty_stat())
            try:
                stats[sid]["gold"] = int(row["amt"] or 0)
            except (ValueError, TypeError):
                stats[sid]["gold"] = 0

        # Total play time (in seconds) — optional, may be missing
        for row in _try_queries(conn, _PLAYTIME_QUERIES):
            sid = str(row["sid"]) if row["sid"] is not None else None
            if not sid:
                continue
            stats.setdefault(sid, _empty_stat())
            try:
                stats[sid]["play_time_seconds"] = int(row["secs"] or 0)
            except (ValueError, TypeError):
                stats[sid]["play_time_seconds"] = 0

    finally:
        conn.close()

    return stats


def _empty_stat() -> Dict[str, Any]:
    return {
        "fame": 0.0, "vehicle_count": 0, "squad_vehicle_count": 0,
        "locked_vehicle_count": 0,
        "flag_count": 0, "squad_name": None, "squad_id": None, "db_name": None,
        "money": None, "gold": None, "play_time_seconds": None,
    }


def db_exists(folder_path: str) -> bool:
    return (Path(folder_path) / "SCUM" / "Saved" / "SaveFiles" / "SCUM.db").exists()


def read_vehicle_ownership(folder_path: str) -> Dict[int, Dict[str, Any]]:
    """Return {vehicle_id: {owner_sid, owner_name, klass}} snapshot from SCUM.db.

    Used by the "vehicle claim" detector to diff between consecutive polls:
    if a vehicle's owner_sid changed from None/other to someone, we emit a
    synthetic `vehicle_claim` event. SCUM does NOT write claim events to its
    own logs (it's a pure DB mutation), so this is the only way to track it.
    """
    db_path = Path(folder_path) / "SCUM" / "Saved" / "SaveFiles" / "SCUM.db"
    conn = _open_ro(db_path)
    if conn is None:
        return {}
    out: Dict[int, Dict[str, Any]] = {}
    try:
        for row in _try_queries(conn, _VEHICLE_ENTITY_SNAPSHOT_QUERIES):
            vid = row["vid"]
            if vid is None:
                continue
            out[int(vid)] = {
                "owner_sid": str(row["owner_sid"]) if row["owner_sid"] else None,
                "owner_name": row["owner_name"],
                "klass": row["klass"],
            }
    finally:
        conn.close()
    return out
