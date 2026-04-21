"""
Real SCUM dedicated-server process & SteamCMD lifecycle management.

Everything here is WINDOWS-FIRST (SCUMServer.exe is Windows-only) but the
helpers are guarded so importing on Linux/macOS (dev env, CI) does not crash.

Public API:
    ensure_steamcmd(manager_path)            -> str   # path to steamcmd.exe
    install_server(server_id, ...)           -> progress stored in REGISTRY
    start_server(server_id, ...)             -> PID (or raises)
    stop_server(server_id)                   -> bool
    get_metrics(server_id)                   -> dict (cpu/ram/uptime/disk/...)
    get_install_progress(server_id)          -> dict
"""
from __future__ import annotations

import io
import os
import re
import sys
import time
import json
import shutil
import signal
import zipfile
import logging
import platform
import subprocess
import threading
import urllib.request
from pathlib import Path
from typing import Optional, Dict, Any

import psutil

log = logging.getLogger(__name__)

STEAMCMD_URL = "https://steamcdn-a.akamaihd.net/client/installer/steamcmd.zip"
SCUM_APP_ID = "3792580"

# ---- In-memory registry ------------------------------------------------------
# Tracks running install jobs and running SCUM processes by server_id.
REGISTRY: Dict[str, Dict[str, Any]] = {}
_LOCK = threading.Lock()

# Metrics cache (disk usage etc. is expensive; TTL 30s)
_METRICS_CACHE: Dict[str, Dict[str, Any]] = {}
_METRICS_TTL_SEC = 30


def _is_windows() -> bool:
    return platform.system() == "Windows"


# -----------------------------------------------------------------------------
# SteamCMD auto-install
# -----------------------------------------------------------------------------
def ensure_steamcmd(manager_path: str) -> str:
    """Return absolute path to steamcmd.exe. Download/unzip to
    <manager_path>/steamcmd/ on first use."""
    if not _is_windows():
        # For Linux/dev, we just return the word 'steamcmd' (must be in PATH).
        return "steamcmd"

    base = Path(manager_path) / "steamcmd"
    exe = base / "steamcmd.exe"
    if exe.exists():
        return str(exe)

    base.mkdir(parents=True, exist_ok=True)
    zip_path = base / "steamcmd.zip"
    log.info("Downloading SteamCMD to %s", zip_path)
    urllib.request.urlretrieve(STEAMCMD_URL, zip_path)
    with zipfile.ZipFile(zip_path) as zf:
        zf.extractall(base)
    zip_path.unlink(missing_ok=True)
    if not exe.exists():
        raise RuntimeError("SteamCMD extraction failed: steamcmd.exe not found")
    return str(exe)


# -----------------------------------------------------------------------------
# Install (download via SteamCMD)
# -----------------------------------------------------------------------------
_PROGRESS_RE = re.compile(r"progress:\s*([\d.]+)\s*\(([\d.,]+)\s*/\s*([\d.,]+)\)", re.I)


def install_server(server_id: str, folder_path: str, manager_path: str,
                   app_id: str = SCUM_APP_ID, on_complete=None) -> None:
    """Start SteamCMD in a background thread. Updates REGISTRY[server_id] with
    percent and recent log lines. If on_complete is provided, it's called with
    (success: bool, build_id: Optional[str], log_tail: str).
    """
    with _LOCK:
        REGISTRY.setdefault(server_id, {})
        REGISTRY[server_id]["install"] = {
            "running": True,
            "percent": 0.0,
            "phase": "starting",
            "log_tail": "",
            "error": None,
            "started_at": time.time(),
        }

    def _runner():
        log_lines: list[str] = []
        try:
            Path(folder_path).mkdir(parents=True, exist_ok=True)
            steamcmd = ensure_steamcmd(manager_path)
            cmd = [
                steamcmd,
                "+force_install_dir", folder_path,
                "+login", "anonymous",
                "+app_update", str(app_id), "validate",
                "+quit",
            ]
            log.info("SteamCMD cmd: %s", " ".join(cmd))
            REGISTRY[server_id]["install"]["phase"] = "downloading"

            proc = subprocess.Popen(
                cmd,
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                text=True,
                encoding="utf-8",
                errors="replace",
                bufsize=1,
                creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0) if _is_windows() else 0,
            )

            for line in proc.stdout:  # type: ignore[union-attr]
                line = line.rstrip()
                if not line:
                    continue
                log_lines.append(line)
                if len(log_lines) > 200:
                    log_lines = log_lines[-200:]
                m = _PROGRESS_RE.search(line)
                if m:
                    try:
                        pct = float(m.group(1))
                        REGISTRY[server_id]["install"]["percent"] = pct
                    except ValueError:
                        pass
                # also scan for "Success!" / "Error!" hints
                low = line.lower()
                if "success! app '" in low:
                    REGISTRY[server_id]["install"]["percent"] = 100.0
                    REGISTRY[server_id]["install"]["phase"] = "finalizing"
                REGISTRY[server_id]["install"]["log_tail"] = "\n".join(log_lines[-40:])

            rc = proc.wait()
            ok = rc == 0
            REGISTRY[server_id]["install"].update({
                "running": False,
                "percent": 100.0 if ok else REGISTRY[server_id]["install"].get("percent", 0.0),
                "phase": "complete" if ok else "error",
                "error": None if ok else f"SteamCMD exited with code {rc}",
                "finished_at": time.time(),
            })
            build_id = None
            if ok:
                build_id = f"build-{int(time.time())}"
            if on_complete:
                try:
                    on_complete(ok, build_id, "\n".join(log_lines[-40:]))
                except Exception:
                    log.exception("on_complete callback failed")
        except Exception as e:
            log.exception("install_server failed")
            REGISTRY[server_id]["install"].update({
                "running": False,
                "phase": "error",
                "error": str(e),
                "finished_at": time.time(),
            })
            if on_complete:
                try:
                    on_complete(False, None, "\n".join(log_lines[-40:]) + f"\n{e}")
                except Exception:
                    pass

    t = threading.Thread(target=_runner, name=f"install-{server_id}", daemon=True)
    t.start()


def get_install_progress(server_id: str) -> Dict[str, Any]:
    with _LOCK:
        data = REGISTRY.get(server_id, {}).get("install")
    return data or {"running": False, "percent": 0.0, "phase": "idle", "log_tail": ""}


# -----------------------------------------------------------------------------
# SCUMServer.exe start/stop
# -----------------------------------------------------------------------------
def _scum_exe(folder_path: str) -> Path:
    return Path(folder_path) / "SCUM" / "Binaries" / "Win64" / "SCUMServer.exe"


def start_server(server_id: str, folder_path: str, port: int = 7779,
                 query_port: int = 7780, max_players: int = 64) -> int:
    """Spawn SCUMServer.exe with -log (opens its own console window showing
    live server log). Returns PID. Raises if already running or exe missing."""
    if not _is_windows():
        raise RuntimeError("SCUMServer.exe requires Windows.")

    # Already running?
    rec = REGISTRY.get(server_id, {}).get("process")
    if rec and _pid_alive(rec.get("pid")):
        return rec["pid"]

    exe = _scum_exe(folder_path)
    if not exe.exists():
        raise FileNotFoundError(f"SCUMServer.exe not found at {exe}")

    args = [
        str(exe),
        "-log",
        "-stdout",            # force Unreal log to the console window
        "-FORCELOGFLUSH",     # write each line immediately (no buffering)
        "-ForceLogFlush",     # alternate casing that some UE builds require
        f"-port={port}",
        f"-QueryPort={query_port}",
        f"-MaxPlayers={max_players}",
    ]
    log.info("Starting SCUM: %s", " ".join(args))

    # CREATE_NEW_CONSOLE = 0x00000010
    # Opens SCUMServer.exe in its OWN visible console window, so the `-log`
    # flag actually streams server output that the admin can read live.
    CREATE_NEW_CONSOLE = 0x00000010
    proc = subprocess.Popen(
        args,
        cwd=str(exe.parent),
        creationflags=CREATE_NEW_CONSOLE,
        close_fds=True,
        # inherit stdio so the new console can display the log; do NOT redirect
    )
    with _LOCK:
        REGISTRY.setdefault(server_id, {})
        REGISTRY[server_id]["process"] = {
            "pid": proc.pid,
            "started_at": time.time(),
            "folder_path": folder_path,
            "port": port,
            "query_port": query_port,
            "max_players": max_players,
        }
    return proc.pid


def stop_server(server_id: str) -> bool:
    """Terminate SCUMServer.exe for this server_id. Returns True if it was
    running (and is now stopped)."""
    rec = REGISTRY.get(server_id, {}).get("process")
    pid = rec.get("pid") if rec else None
    if not pid or not _pid_alive(pid):
        with _LOCK:
            if rec:
                REGISTRY[server_id].pop("process", None)
        return False

    try:
        p = psutil.Process(pid)
        # Kill whole tree (SCUMServer may spawn children)
        for child in p.children(recursive=True):
            _safe_kill(child)
        _safe_kill(p)
    except psutil.NoSuchProcess:
        pass
    except Exception:
        log.exception("stop_server kill failed")

    with _LOCK:
        REGISTRY.get(server_id, {}).pop("process", None)
    return True


def _safe_kill(p: psutil.Process) -> None:
    try:
        p.terminate()
        p.wait(timeout=8)
    except psutil.TimeoutExpired:
        try:
            p.kill()
        except Exception:
            pass
    except Exception:
        pass


def _pid_alive(pid: Optional[int]) -> bool:
    if not pid:
        return False
    try:
        p = psutil.Process(pid)
        return p.is_running() and p.status() != psutil.STATUS_ZOMBIE
    except Exception:
        return False


# -----------------------------------------------------------------------------
# Metrics (CPU / RAM / Uptime / Disk / Last updated)
# -----------------------------------------------------------------------------
def _folder_stats(folder_path: str) -> Dict[str, Any]:
    """Return {size_bytes, last_mtime} for folder_path. Cheap-ish because
    we prune obvious junk and use os.scandir."""
    size = 0
    last_mtime = 0.0
    p = Path(folder_path)
    if not p.exists():
        return {"size_bytes": 0, "last_mtime": 0}

    # iterative walk using scandir (much faster than os.walk on Windows)
    stack = [p]
    while stack:
        cur = stack.pop()
        try:
            with os.scandir(cur) as it:
                for entry in it:
                    try:
                        if entry.is_dir(follow_symlinks=False):
                            stack.append(Path(entry.path))
                        else:
                            st = entry.stat(follow_symlinks=False)
                            size += st.st_size
                            if st.st_mtime > last_mtime:
                                last_mtime = st.st_mtime
                    except (PermissionError, OSError):
                        continue
        except (PermissionError, OSError):
            continue
    return {"size_bytes": size, "last_mtime": last_mtime}


def get_metrics(server_id: str, folder_path: Optional[str] = None) -> Dict[str, Any]:
    """Return live metrics for this server:
       - running (bool)
       - pid, started_at, uptime_seconds
       - cpu_percent, memory_mb
       - installed_size_gb, last_updated_iso
       - scum_exe_exists
    """
    now = time.time()

    rec = REGISTRY.get(server_id, {}).get("process") or {}
    pid = rec.get("pid")
    running = _pid_alive(pid)
    started_at = rec.get("started_at") if running else None
    fpath = folder_path or rec.get("folder_path")

    cpu_percent = 0.0
    memory_mb = 0.0
    if running:
        try:
            p = psutil.Process(pid)
            # Non-blocking; cpu_percent needs a prior call to be meaningful,
            # so we store a value on the proc object via cache dict
            cache_key = f"_cpu_{pid}"
            last = _METRICS_CACHE.get(cache_key, {}).get("ts", 0)
            if now - last < 0.6:
                p.cpu_percent(None)
            cpu_percent = round(p.cpu_percent(interval=None), 1)
            memory_mb = round(p.memory_info().rss / (1024 * 1024), 1)
            _METRICS_CACHE[cache_key] = {"ts": now}
        except Exception:
            pass

    # Disk stats (cached per folder, 30s TTL)
    size_gb = 0.0
    last_updated_iso = None
    scum_exists = False
    if fpath:
        cache = _METRICS_CACHE.get(f"disk_{fpath}")
        if cache and now - cache["ts"] < _METRICS_TTL_SEC:
            size_gb = cache["size_gb"]
            last_updated_iso = cache["last_updated_iso"]
        else:
            stats = _folder_stats(fpath)
            size_gb = round(stats["size_bytes"] / (1024**3), 2)
            last_updated_iso = (
                time.strftime("%Y-%m-%dT%H:%M:%S", time.localtime(stats["last_mtime"]))
                if stats["last_mtime"] else None
            )
            _METRICS_CACHE[f"disk_{fpath}"] = {
                "ts": now,
                "size_gb": size_gb,
                "last_updated_iso": last_updated_iso,
            }
        scum_exists = _scum_exe(fpath).exists()

    uptime = int(now - started_at) if started_at else 0

    return {
        "running": running,
        "pid": pid if running else None,
        "started_at": (time.strftime("%Y-%m-%dT%H:%M:%S", time.localtime(started_at))
                       if started_at else None),
        "uptime_seconds": uptime,
        "cpu_percent": cpu_percent,
        "memory_mb": memory_mb,
        "installed_size_gb": size_gb,
        "last_updated_iso": last_updated_iso,
        "scum_exe_exists": scum_exists,
    }


def invalidate_disk_cache(folder_path: str) -> None:
    _METRICS_CACHE.pop(f"disk_{folder_path}", None)
