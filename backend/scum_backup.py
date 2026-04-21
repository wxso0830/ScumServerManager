"""
SCUM save-file backup system.

Strategy:
  * SOURCE: {folder_path}/SCUM/Saved/SaveFiles/   — contains SCUM.db + sub dirs
  * TARGET: {manager_path}/Backups/{server_folder}/backup_<iso>_<type>.zip

  * Backups are created as ZIP archives (ZIP_DEFLATED level 6) — a full SCUM
    save is usually 50-300 MB and compresses to 30-60% of that.

  * Types: 'manual' (admin clicks), 'auto' (scheduler), 'crash' (detector).

  * Reading SaveFiles while the server is running is SAFE:
      - SCUM.db is SQLite with WAL. Copying the main file alone can yield a
        torn read; we handle this by preferring the online copy mechanism
        (sqlite3 backup API) when the DB is accessible, and falling back to
        a plain file copy if not. Everything else in SaveFiles is append-only
        binary blobs that tolerate a byte-level copy.

  * Restore: extracts the zip over SaveFiles/. ONLY allowed when the server
    process is not running (enforced at the API layer).

Nothing here touches the manager's own MongoDB or any other system state.
"""
from __future__ import annotations
from dataclasses import dataclass
from pathlib import Path
from typing import List, Optional, Dict, Any
from datetime import datetime, timezone
import hashlib
import logging
import os
import shutil
import sqlite3
import tempfile
import threading
import zipfile

log = logging.getLogger("scum_backup")

BACKUP_TYPES = ("manual", "auto", "crash", "pre_restore")


# ------------------------------------------------------------------ helpers --
def _save_dir(folder_path: str) -> Path:
    return Path(folder_path) / "SCUM" / "Saved" / "SaveFiles"


def _backup_dir(manager_path: str, server_folder: str) -> Path:
    d = Path(manager_path) / "Backups" / server_folder
    d.mkdir(parents=True, exist_ok=True)
    return d


def _scum_db_path(folder_path: str) -> Path:
    return _save_dir(folder_path) / "SCUM.db"


def _backup_scum_db_online(src: Path, dst: Path) -> bool:
    """Use sqlite3's online backup API to copy SCUM.db atomically while the
    server is still writing to it. Returns True on success."""
    try:
        src_conn = sqlite3.connect(f"file:{src.as_posix()}?mode=ro", uri=True, timeout=3.0)
        dst_conn = sqlite3.connect(str(dst), timeout=3.0)
        with dst_conn:
            src_conn.backup(dst_conn)
        src_conn.close()
        dst_conn.close()
        return True
    except sqlite3.Error as e:
        log.info("sqlite online backup failed, will fall back to file copy: %s", e)
        return False


# --------------------------------------------------------------------- API --
@dataclass
class BackupInfo:
    id: str                 # stable id derived from filename
    filename: str
    path: str
    backup_type: str
    created_at: str         # ISO 8601
    size_bytes: int
    size_mb: float
    server_id: str
    scum_db_ok: bool        # True if SCUM.db was captured

    @staticmethod
    def from_path(p: Path, server_id: str) -> "BackupInfo":
        stat = p.stat()
        name = p.name
        # Filename format: backup_20260421_120155_manual.zip
        btype = "manual"
        for t in BACKUP_TYPES:
            if f"_{t}" in name:
                btype = t
                break
        return BackupInfo(
            id=hashlib.md5(name.encode()).hexdigest()[:12],
            filename=name,
            path=str(p),
            backup_type=btype,
            created_at=datetime.fromtimestamp(stat.st_mtime, tz=timezone.utc).isoformat(),
            size_bytes=stat.st_size,
            size_mb=round(stat.st_size / (1024 * 1024), 2),
            server_id=server_id,
            scum_db_ok=True,
        )

    def to_dict(self) -> Dict[str, Any]:
        return {
            "id": self.id,
            "filename": self.filename,
            "backup_type": self.backup_type,
            "created_at": self.created_at,
            "size_bytes": self.size_bytes,
            "size_mb": self.size_mb,
            "server_id": self.server_id,
            "scum_db_ok": self.scum_db_ok,
        }


# Synchronise per-server so two scheduler ticks can't both start a backup
_LOCKS: Dict[str, threading.Lock] = {}


def _lock_for(server_id: str) -> threading.Lock:
    lk = _LOCKS.get(server_id)
    if lk is None:
        lk = threading.Lock()
        _LOCKS[server_id] = lk
    return lk


def create_backup(
    *,
    server_id: str,
    folder_path: str,
    manager_path: str,
    server_folder: str,
    backup_type: str = "manual",
) -> Dict[str, Any]:
    """Create a ZIP backup of the server's SaveFiles. Non-blocking on SCUM.db."""
    src = _save_dir(folder_path)
    if not src.exists():
        return {"ok": False, "error": f"SaveFiles not found: {src}"}

    if backup_type not in BACKUP_TYPES:
        backup_type = "manual"

    ts = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    out_dir = _backup_dir(manager_path, server_folder)
    out_path = out_dir / f"backup_{ts}_{backup_type}.zip"

    with _lock_for(server_id):
        # Always re-check after acquiring — another thread may have created it
        if out_path.exists():
            return {"ok": True, "info": BackupInfo.from_path(out_path, server_id).to_dict(),
                    "note": "already-exists"}

        # 1) Snapshot SCUM.db via sqlite online backup to a temp file
        scum_db = _scum_db_path(folder_path)
        db_snapshot: Optional[Path] = None
        scum_db_ok = True
        if scum_db.exists():
            tmp_db = Path(tempfile.mkdtemp()) / "SCUM.db"
            if _backup_scum_db_online(scum_db, tmp_db):
                db_snapshot = tmp_db
            else:
                scum_db_ok = False  # fall back to raw file copy below

        # 2) Stream the whole SaveFiles dir into a zip
        try:
            total = 0
            with zipfile.ZipFile(out_path, "w", zipfile.ZIP_DEFLATED, compresslevel=6) as zf:
                for root, _, files in os.walk(src):
                    for fname in files:
                        abs_path = Path(root) / fname
                        try:
                            rel = abs_path.relative_to(src)
                        except ValueError:
                            continue
                        # Replace SCUM.db with the online-backup snapshot when available
                        if db_snapshot and abs_path.name == "SCUM.db" and abs_path.parent == src:
                            zf.write(str(db_snapshot), arcname=str(rel))
                        else:
                            try:
                                zf.write(str(abs_path), arcname=str(rel))
                            except (OSError, PermissionError) as e:
                                log.info("skipping locked file %s: %s", abs_path, e)
                        try:
                            total += abs_path.stat().st_size
                        except OSError:
                            pass
        except Exception as e:
            log.exception("create_backup zip failed")
            # Clean up partial zip
            try:
                out_path.unlink(missing_ok=True)
            except Exception:
                pass
            return {"ok": False, "error": f"zip failed: {e}"}
        finally:
            if db_snapshot and db_snapshot.exists():
                try:
                    shutil.rmtree(db_snapshot.parent, ignore_errors=True)
                except Exception:
                    pass

        info = BackupInfo.from_path(out_path, server_id)
        info.scum_db_ok = scum_db_ok
        log.info("Backup created: %s (%.1fMB, %s)", out_path.name, info.size_mb, backup_type)
        return {"ok": True, "info": info.to_dict()}


def list_backups(*, server_id: str, manager_path: str, server_folder: str) -> List[Dict[str, Any]]:
    d = _backup_dir(manager_path, server_folder)
    out: List[Dict[str, Any]] = []
    for p in sorted(d.glob("backup_*.zip"), key=lambda x: x.stat().st_mtime, reverse=True):
        out.append(BackupInfo.from_path(p, server_id).to_dict())
    return out


def find_backup(*, manager_path: str, server_folder: str, backup_id: str) -> Optional[Path]:
    d = _backup_dir(manager_path, server_folder)
    for p in d.glob("backup_*.zip"):
        if hashlib.md5(p.name.encode()).hexdigest()[:12] == backup_id:
            return p
    return None


def delete_backup(*, manager_path: str, server_folder: str, backup_id: str) -> bool:
    p = find_backup(manager_path=manager_path, server_folder=server_folder, backup_id=backup_id)
    if p is None:
        return False
    try:
        p.unlink()
        return True
    except OSError:
        return False


def restore_backup(
    *,
    server_id: str,
    folder_path: str,
    manager_path: str,
    server_folder: str,
    backup_id: str,
) -> Dict[str, Any]:
    """Replace the current SaveFiles directory with the content of the given
    backup ZIP. MUST be called only when the SCUM server process for this
    server is NOT running (enforced in the API layer, not here)."""
    zip_path = find_backup(
        manager_path=manager_path, server_folder=server_folder, backup_id=backup_id,
    )
    if zip_path is None or not zip_path.exists():
        return {"ok": False, "error": "backup not found"}

    src = _save_dir(folder_path)
    src.mkdir(parents=True, exist_ok=True)

    # Safety net: snapshot current state as pre_restore backup so the admin
    # can undo the restore if the wrong file was picked.
    safety = create_backup(
        server_id=server_id, folder_path=folder_path,
        manager_path=manager_path, server_folder=server_folder,
        backup_type="pre_restore",
    )

    try:
        # Wipe SaveFiles contents (keep the folder itself — some server tools
        # watch the folder handle). Then extract.
        for item in src.iterdir():
            if item.is_dir():
                shutil.rmtree(item, ignore_errors=True)
            else:
                try:
                    item.unlink()
                except OSError:
                    pass
        with zipfile.ZipFile(zip_path, "r") as zf:
            zf.extractall(str(src))
    except Exception as e:
        log.exception("restore failed")
        return {"ok": False, "error": f"extract failed: {e}", "safety_backup": safety.get("info")}

    log.info("Restored backup %s → %s", zip_path.name, src)
    return {"ok": True, "restored": zip_path.name, "safety_backup": safety.get("info")}


def prune_old_backups(*, manager_path: str, server_folder: str, keep_count: int = 30) -> int:
    """Delete everything older than the most recent `keep_count` backups,
    EXCEPT never delete 'manual' or 'pre_restore' backups (admins explicitly
    created those). Returns count deleted."""
    d = _backup_dir(manager_path, server_folder)
    pruneable = []
    for p in d.glob("backup_*.zip"):
        name = p.name
        is_protected = any(f"_{t}" in name for t in ("manual", "pre_restore"))
        if is_protected:
            continue
        pruneable.append(p)
    pruneable.sort(key=lambda x: x.stat().st_mtime, reverse=True)
    to_delete = pruneable[keep_count:]
    n = 0
    for p in to_delete:
        try:
            p.unlink()
            n += 1
        except OSError:
            continue
    return n
