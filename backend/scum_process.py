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
                   app_id: str = SCUM_APP_ID, on_complete=None,
                   run_first_boot: bool = True) -> None:
    """Start SteamCMD in a background thread. Updates REGISTRY[server_id] with
    percent and recent log lines. If on_complete is provided, it's called with
    (success: bool, build_id: Optional[str], log_tail: str).

    If `run_first_boot=True` (default) AND the download succeeds AND we're on
    Windows, the runner then launches SCUMServer.exe briefly to let Unreal
    generate the default `Saved/Config/WindowsServer/*.ini` files, then stops
    it. This is essential — SCUM does not ship those configs and will overwrite
    manager-written files on its first real run.
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

            # Kill any leftover SteamCMD helper processes that may linger
            # (steamservice.exe, steam client helpers). Prevents orphan procs
            # and makes the installer console actually close on Windows.
            if _is_windows():
                for img in ("steamcmd.exe", "steamservice.exe", "steamerrorreporter.exe"):
                    try:
                        subprocess.run(
                            ["taskkill", "/F", "/IM", img, "/T"],
                            capture_output=True, timeout=5,
                            creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
                        )
                    except Exception:
                        pass

            # --- FIRST BOOT ----------------------------------------------------
            # SCUM only writes Saved/Config/WindowsServer/*.ini on first boot,
            # so immediately launch SCUMServer.exe for ~30-90s to generate them,
            # then kill it. Without this, nothing the manager writes survives
            # the real first boot the user performs later.
            first_boot_result: Dict[str, Any] = {}
            if ok and run_first_boot and _is_windows():
                REGISTRY[server_id]["install"]["phase"] = "first_boot"
                REGISTRY[server_id]["install"]["percent"] = 100.0
                REGISTRY[server_id]["install"]["log_tail"] = (
                    "\n".join(log_lines[-20:]) +
                    "\n\n[LGSS] SteamCMD complete. Booting SCUMServer once to generate default config files..."
                )
                try:
                    first_boot_result = first_boot(
                        server_id=server_id,
                        folder_path=folder_path,
                        timeout_sec=180,
                    )
                    note = (
                        f"[LGSS] First boot OK — generated: {', '.join(first_boot_result.get('files_found', []))} "
                        f"(in {first_boot_result.get('duration_sec', 0)}s)"
                        if first_boot_result.get("ok")
                        else f"[LGSS] First boot WARN: {first_boot_result.get('error', 'unknown')}"
                    )
                    REGISTRY[server_id]["install"]["log_tail"] = (
                        REGISTRY[server_id]["install"]["log_tail"] + "\n" + note
                    )
                except Exception as e:
                    log.exception("first_boot during install failed")
                    REGISTRY[server_id]["install"]["log_tail"] += f"\n[LGSS] First boot EXCEPTION: {e}"

            REGISTRY[server_id]["install"].update({
                "running": False,
                "percent": 100.0 if ok else REGISTRY[server_id]["install"].get("percent", 0.0),
                "phase": "complete" if ok else "error",
                "error": None if ok else f"SteamCMD exited with code {rc}",
                "finished_at": time.time(),
                "first_boot": first_boot_result or None,
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


def _a2s_info_alive(host: str, port: int, timeout: float = 1.2) -> bool:
    """Return True if a Steam A2S_INFO query gets a valid reply on (host, port).
    Used to detect the exact moment a SCUM dedicated server finishes its Unreal
    level-stream warm-up and starts answering Steam browser queries. Much more
    accurate than a "wait N seconds" heuristic.
    """
    return _a2s_info_query(host, port, timeout) is not None


def _a2s_info_query(host: str, port: int, timeout: float = 1.2) -> Optional[Dict[str, Any]]:
    """Send an A2S_INFO request and return a parsed dict, or None on failure.

    Parsed fields: players (byte), max_players (byte), bots (byte),
    server_name, map_name, game_name. SCUM's reply uses the Source
    layout (header 'I'), but we only rely on the first byte-sized player
    counters so the parser is deliberately lenient.
    """
    import socket
    packet = b"\xff\xff\xff\xffTSource Engine Query\x00"
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as sock:
            sock.settimeout(timeout)
            sock.sendto(packet, (host, port))
            data, _ = sock.recvfrom(4096)
    except (OSError, socket.timeout):
        return None
    if len(data) < 6 or data[:5] != b"\xff\xff\xff\xffI":
        return None
    try:
        i = 5                           # skip header + type byte
        i += 1                          # protocol byte
        def _cstr(off: int) -> (str, int):
            end = data.index(b"\x00", off)
            return data[off:end].decode("utf-8", errors="replace"), end + 1
        server_name, i = _cstr(i)
        map_name, i = _cstr(i)
        _folder, i = _cstr(i)           # folder
        game_name, i = _cstr(i)
        i += 2                          # app id (short)
        players = data[i]; i += 1
        max_players = data[i]; i += 1
        bots = data[i]; i += 1
        return {
            "players": int(players),
            "max_players": int(max_players),
            "bots": int(bots),
            "server_name": server_name,
            "map_name": map_name,
            "game_name": game_name,
        }
    except (IndexError, ValueError, UnicodeDecodeError):
        # Malformed packet — just report alive=True with unknown counts.
        return {"players": -1, "max_players": -1, "bots": 0}


def a2s_player_query(host: str, port: int, timeout: float = 1.2) -> list:
    """A2S_PLAYER challenge-response. Returns list of {name, score, duration_s}.
    Used by the Discord /online slash command and any "who is on" UI. Steam
    requires a 2-step challenge exchange; we do that inline and ignore bot
    entries SCUM never reports anyway.
    """
    import socket
    import struct
    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    sock.settimeout(timeout)
    try:
        sock.sendto(b"\xff\xff\xff\xffU\xff\xff\xff\xff", (host, port))
        data, _ = sock.recvfrom(4096)
        if len(data) < 9 or data[4:5] != b"A":
            return []
        challenge = data[5:9]
        sock.sendto(b"\xff\xff\xff\xffU" + challenge, (host, port))
        data, _ = sock.recvfrom(8192)
    except (OSError, socket.timeout):
        return []
    finally:
        sock.close()

    if len(data) < 6 or data[4:5] != b"D":
        return []
    count = data[5]
    i = 6
    out = []
    try:
        for _ in range(count):
            i += 1
            end = data.index(b"\x00", i)
            name = data[i:end].decode("utf-8", errors="replace")
            i = end + 1
            score = struct.unpack_from("<i", data, i)[0]; i += 4
            duration = struct.unpack_from("<f", data, i)[0]; i += 4
            out.append({"name": name, "score": int(score), "duration_s": int(duration)})
    except (IndexError, struct.error, ValueError):
        pass
    return out



def start_server(server_id: str, folder_path: str, port: int = 7779,
                 query_port: int = 7780, max_players: int = 64) -> int:
    """Spawn SCUMServer.exe with -log (opens its own console window showing
    live server log). Returns PID. Raises if already running or exe missing.

    The process is spawned with HIGH priority and Unreal fast-path flags so
    the ~2-3 minute SCUM boot is trimmed where possible without losing the
    in-console log stream the admin watches."""
    if not _is_windows():
        raise RuntimeError("SCUMServer.exe requires Windows.")

    # Already running?
    rec = REGISTRY.get(server_id, {}).get("process")
    if rec and _pid_alive(rec.get("pid")):
        return rec["pid"]

    exe = _scum_exe(folder_path)
    if not exe.exists():
        raise FileNotFoundError(f"SCUMServer.exe not found at {exe}")

    # -log / -stdout  : keep the visible console with colored warnings
    # -NoVerifyGC     : skip Unreal's garbage-collector sanity pass on boot (~5-15s saving)
    # -nocrashreports : skip CrashReportClient warm-up (~3-8s saving on first boot)
    # -nosound        : dedicated server has no audio device; skip SoundCue warmup
    # NOTE: -FORCELOGFLUSH is REMOVED because it forces fsync on every single log
    #       line — on SCUM's very chatty LogQuadTree/LogStreaming output that costs
    #       10-40 seconds of pure I/O during boot. We rely on Unreal's default
    #       periodic flush which is still live enough for the admin to read.
    args = [
        str(exe),
        "-log",
        "-stdout",
        "-NoVerifyGC",
        "-nocrashreports",
        "-nosound",
        f"-port={port}",
        f"-QueryPort={query_port}",
        f"-MaxPlayers={max_players}",
    ]
    log.info("Starting SCUM: %s", " ".join(args))

    # CREATE_NEW_CONSOLE       = 0x00000010  — own visible console window
    # HIGH_PRIORITY_CLASS      = 0x00000080  — OS scheduler gives SCUM extra CPU
    CREATE_NEW_CONSOLE = 0x00000010
    HIGH_PRIORITY_CLASS = 0x00000080
    proc = subprocess.Popen(
        args,
        cwd=str(exe.parent),
        creationflags=CREATE_NEW_CONSOLE | HIGH_PRIORITY_CLASS,
        close_fds=True,
        # inherit stdio so the new console can display the log; do NOT redirect
    )
    with _LOCK:
        REGISTRY.setdefault(server_id, {})
        REGISTRY[server_id]["process"] = {
            "pid": proc.pid,
            "started_at": time.time(),
            "online_at": None,            # set by _watch_ready when A2S replies
            "folder_path": folder_path,
            "port": port,
            "query_port": query_port,
            "max_players": max_players,
            "ready": False,
        }

    # Kick off a readiness watcher so callers can tell "starting" from "online"
    _spawn_ready_watcher(server_id, query_port)
    return proc.pid


def _spawn_ready_watcher(server_id: str, query_port: int) -> None:
    """Background thread: detect the moment SCUM is actually playable.

    The watcher tries **three independent signals** in parallel (whichever
    triggers first wins). This is crucial because Windows Firewall / SCUM bind
    order sometimes blocks the UDP A2S query — if we relied only on A2S_INFO
    the UI would be stuck at "BAŞLATILIYOR" forever.

    Signals:
      1. Steam A2S_INFO ack on (127.0.0.1, query_port) — the ideal path.
      2. Log file heuristic — once the SCUM `Saved/Logs/SCUM.log` or
         `SaveFiles/Logs/*.log` contains a "LogSCUM: Global Stats" line at
         least 3 times, the world is loaded and the tick loop is running.
      3. Hard time fallback — after 300 seconds we flip to ready anyway so
         the UI doesn't strand at warm-up.
    """
    def _watch():
        start_ts = time.time()
        deadline = start_ts + 600  # hard cap: 10 minutes
        hard_fallback = start_ts + 300   # flip to ready after 5min no matter what
        rec = REGISTRY.get(server_id, {}).get("process") or {}
        folder_path = rec.get("folder_path", "")
        # Collect candidate log file paths the ready-signal may appear in
        log_candidates = [
            Path(folder_path) / "SCUM" / "Saved" / "Logs" / "SCUM.log",
            Path(folder_path) / "SCUM" / "Saved" / "Logs" / "SCUMServer.log",
        ]

        def _log_tick_heartbeat_seen() -> bool:
            """Return True if we see 3+ 'Global Stats' ticks in the SCUM log —
            the tick loop only runs after the world is fully loaded."""
            for p in log_candidates:
                try:
                    if not p.exists():
                        continue
                    # Tail last 64KB — that's ~1000 recent lines, enough
                    with p.open("rb") as f:
                        f.seek(0, 2)
                        size = f.tell()
                        f.seek(max(0, size - 64 * 1024))
                        tail = f.read().decode("utf-8", errors="replace")
                    if tail.count("LogSCUM: Global Stats") >= 3:
                        return True
                except Exception:
                    continue
            return False

        def _mark_ready(reason: str) -> None:
            with _LOCK:
                rec_now = REGISTRY.get(server_id, {}).get("process")
                if rec_now and not rec_now.get("ready"):
                    rec_now["ready"] = True
                    rec_now["online_at"] = time.time()
                    rec_now["ready_reason"] = reason
                    log.info("SCUM %s READY via %s after %.1fs",
                             server_id, reason, time.time() - start_ts)

        while time.time() < deadline:
            rec_now = REGISTRY.get(server_id, {}).get("process")
            if not rec_now or not _pid_alive(rec_now.get("pid")):
                return
            if rec_now.get("ready"):
                return
            # Signal #1: A2S query
            if _a2s_info_alive("127.0.0.1", query_port, timeout=1.2):
                _mark_ready("a2s_info")
                return
            # Signal #2: log heartbeat
            if _log_tick_heartbeat_seen():
                _mark_ready("log_heartbeat")
                return
            # Signal #3: hard fallback
            if time.time() > hard_fallback:
                _mark_ready("timeout_fallback")
                return
            time.sleep(3.0)

    th = threading.Thread(target=_watch, name=f"ready-{server_id}", daemon=True)
    th.start()


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


# -----------------------------------------------------------------------------
# First-boot config generation
# -----------------------------------------------------------------------------
def first_boot(server_id: str, folder_path: str,
               port: int = 7779, query_port: int = 7780, max_players: int = 64,
               timeout_sec: int = 120, settle_sec: int = 5) -> Dict[str, Any]:
    """Run SCUMServer.exe once so Unreal generates the default config files,
    then stop it cleanly.

    SCUM ships without `Saved/Config/WindowsServer/*.ini`; those files are
    written the FIRST time the server boots. Until they exist on disk,
    anything the manager writes is overwritten on first real boot. So after
    SteamCMD install we do this controlled boot.

    Returns:
        { ok, duration_sec, files_found: [...], error: str|None,
          config_dir: str }
    """
    result = {
        "ok": False,
        "duration_sec": 0,
        "files_found": [],
        "error": None,
        "config_dir": str(Path(folder_path) / "SCUM" / "Saved" / "Config" / "WindowsServer"),
    }
    if not _is_windows():
        result["error"] = "first_boot requires Windows (SCUMServer.exe)"
        return result

    # Stop any prior instance for this server_id so we don't collide
    try:
        stop_server(server_id)
    except Exception:
        pass

    exe = _scum_exe(folder_path)
    if not exe.exists():
        result["error"] = f"SCUMServer.exe not found at {exe}"
        return result

    config_dir = Path(result["config_dir"])
    # Target files SCUM writes on first boot (ServerSettings.ini is the canonical proof)
    target_files = [
        "ServerSettings.ini",
        "GameUserSettings.ini",
    ]

    start_ts = time.time()
    args = [
        str(exe),
        "-log",
        "-stdout",
        "-FORCELOGFLUSH",
        "-ForceLogFlush",
        f"-port={port}",
        f"-QueryPort={query_port}",
        f"-MaxPlayers={max_players}",
    ]
    log.info("first_boot: launching %s", " ".join(args))

    CREATE_NO_WINDOW = 0x08000000
    try:
        proc = subprocess.Popen(
            args,
            cwd=str(exe.parent),
            # Hidden: this is a one-shot config-generation boot, no UI needed.
            creationflags=CREATE_NO_WINDOW,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            close_fds=True,
        )
    except Exception as e:
        result["error"] = f"Failed to launch SCUMServer.exe: {e}"
        return result

    with _LOCK:
        REGISTRY.setdefault(server_id, {})
        REGISTRY[server_id]["first_boot"] = {
            "pid": proc.pid,
            "started_at": start_ts,
            "phase": "booting",
        }

    # Poll for the canonical ServerSettings.ini. SCUM writes it within ~30-60s.
    deadline = start_ts + timeout_sec
    seen_settings = False
    while time.time() < deadline:
        if proc.poll() is not None:
            # process exited on its own before producing files
            break
        if (config_dir / "ServerSettings.ini").exists():
            seen_settings = True
            break
        time.sleep(1.0)

    # Give SCUM a few extra seconds to also write GameUserSettings, Economy, etc.
    if seen_settings:
        time.sleep(max(1, settle_sec))

    # Snapshot what we actually got on disk
    found: list[str] = []
    if config_dir.exists():
        for name in target_files:
            if (config_dir / name).exists():
                found.append(name)
        # Also list any other .ini/.json the game happened to produce
        for p in config_dir.glob("*"):
            if p.name not in found and p.is_file():
                found.append(p.name)

    # Kill SCUM tree
    try:
        p = psutil.Process(proc.pid)
        for child in p.children(recursive=True):
            _safe_kill(child)
        _safe_kill(p)
    except psutil.NoSuchProcess:
        pass
    except Exception:
        log.exception("first_boot stop failed")

    # Belt-and-suspenders: taskkill by image in case a rogue child outlived us
    for img in ("SCUMServer.exe", "SCUMServer-Win64-Shipping.exe", "CrashReportClient.exe"):
        try:
            subprocess.run(
                ["taskkill", "/F", "/IM", img, "/T"],
                capture_output=True, timeout=5,
                creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
            )
        except Exception:
            pass

    with _LOCK:
        REGISTRY.get(server_id, {}).pop("first_boot", None)

    duration = int(time.time() - start_ts)
    result.update({
        "ok": seen_settings,
        "duration_sec": duration,
        "files_found": found,
        "error": None if seen_settings else "ServerSettings.ini was not generated before timeout",
    })
    return result


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
    # Ready means the server answered its Steam A2S_INFO query. "Warmup uptime"
    # tracks the boot phase, "online uptime" is what admins actually care about.
    ready = bool(rec.get("ready"))
    online_at = rec.get("online_at") if running else None
    online_uptime = int(now - online_at) if online_at else 0
    phase = "online" if ready else ("starting" if running else "stopped")

    # --- Live player count via A2S_INFO --------------------------------------
    # We query the Steam browser endpoint once per metrics call (cheap UDP
    # round-trip, ~1ms loopback). Only meaningful when server is ready. A
    # small TTL cache avoids spamming the socket if /metrics is polled
    # aggressively by multiple UI tabs.
    players = None
    max_players_live = None
    query_port = rec.get("query_port")
    if ready and query_port:
        cache_key = f"a2s_{server_id}"
        cached = _METRICS_CACHE.get(cache_key) or {}
        if now - cached.get("ts", 0) < 4.0:
            players = cached.get("players")
            max_players_live = cached.get("max_players")
        else:
            info = _a2s_info_query("127.0.0.1", int(query_port), timeout=1.0)
            if info and info.get("players", -1) >= 0:
                players = info["players"]
                max_players_live = info.get("max_players") or None
                _METRICS_CACHE[cache_key] = {
                    "ts": now,
                    "players": players,
                    "max_players": max_players_live,
                }

    return {
        "running": running,
        "ready": ready,
        "phase": phase,
        "pid": pid if running else None,
        "started_at": (time.strftime("%Y-%m-%dT%H:%M:%S", time.localtime(started_at))
                       if started_at else None),
        "online_at": (time.strftime("%Y-%m-%dT%H:%M:%S", time.localtime(online_at))
                      if online_at else None),
        "uptime_seconds": uptime,                 # since process spawn (warm-up + online)
        "online_uptime_seconds": online_uptime,   # since A2S_INFO reply (true play time)
        "cpu_percent": cpu_percent,
        "memory_mb": memory_mb,
        "installed_size_gb": size_gb,
        "last_updated_iso": last_updated_iso,
        "scum_exe_exists": scum_exists,
        "players": players,                       # None = unknown, int = live count
        "max_players_live": max_players_live,
    }


def invalidate_disk_cache(folder_path: str) -> None:
    _METRICS_CACHE.pop(f"disk_{folder_path}", None)
