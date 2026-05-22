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

            # SteamCMD frequently fails the first run on existing installs with
            # "Error! App 'X' state is 0x6 after update job" (state 0x6 =
            # STATE_UPDATE_REQUIRED, exit code 8). This is a well-known Steam
            # bug: the depot manifest disagrees with the local state on the
            # first pass, then resolves itself after one extra cycle.
            # We auto-retry up to 3 times, blanking the existing 'appmanifest'
            # state file between attempts so SteamCMD can't trip on a stale
            # one. Without retry, every update on a server installed by an
            # older manager version fails until the user manually re-runs it
            # — exactly the bug the admin reported (2026-02 v1.0.13).
            MAX_TRIES = 3
            rc = 1
            for attempt in range(1, MAX_TRIES + 1):
                if attempt > 1:
                    log_lines.append(f"[LGSS] SteamCMD attempt {attempt}/{MAX_TRIES} — clearing stale appmanifest...")
                    REGISTRY[server_id]["install"]["log_tail"] = "\n".join(log_lines[-40:])
                    # Remove the appmanifest so SteamCMD re-syncs from scratch
                    try:
                        manifest_dir = Path(folder_path) / "steamapps"
                        if manifest_dir.exists():
                            for f in manifest_dir.glob(f"appmanifest_{app_id}.acf*"):
                                try:
                                    f.unlink()
                                except Exception:
                                    pass
                    except Exception:
                        pass
                    time.sleep(2.0)

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
                if rc == 0:
                    break  # success — stop retrying
                # Specifically retry on state 0x6 / state 0x202 / generic
                # non-zero exits. Code 8 is the legendary Steam "depot mismatch"
                # that needs one extra spin.
                log.warning("SteamCMD attempt %d failed with exit code %d, retrying...", attempt, rc)
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


# In-memory cache for the login-log player count probe so we don't re-parse
# multi-MB files on every metrics tick. TTL ~10s.
_LOGIN_COUNT_CACHE: Dict[str, Dict[str, Any]] = {}


def _count_online_from_login_log(folder_path: Optional[str]) -> Optional[int]:
    """Best-effort online-player count from SCUM's login_*.log files.

    SCUM rotates the login log every 5 minutes. We:
      1. Find every login_*.log under Saved/SaveFiles/Logs and
         Saved/Logs (location varies between SCUM versions).
      2. Walk newest → oldest, accumulating (steam_id → state) where state is
         'in' (joined) or 'out' (left). Most recent record wins per steam_id.
      3. Return count of steam_ids currently 'in' that we saw in the last 24h.

    Returns None if we couldn't read any log (caller falls back to whatever
    A2S returned). Cached for 10s so it's cheap to call from the per-server
    metrics loop.
    """
    if not folder_path:
        return None
    cache_key = f"login_online_{folder_path}"
    cached = _LOGIN_COUNT_CACHE.get(cache_key) or {}
    if time.time() - cached.get("ts", 0) < 10.0:
        return cached.get("count")
    candidates: list[Path] = []
    base = Path(folder_path) / "SCUM" / "Saved"
    for sub in ("SaveFiles/Logs", "Logs"):
        d = base / sub
        if d.exists():
            try:
                candidates.extend(sorted(d.glob("login_*.log"), key=lambda p: p.stat().st_mtime, reverse=True))
            except Exception:
                pass
    if not candidates:
        _LOGIN_COUNT_CACHE[cache_key] = {"ts": time.time(), "count": None}
        return None
    # Use only the last 4 files (~20 minutes of activity) — older sessions
    # almost certainly disconnected by now, including them just produces
    # spurious "left" actions that subtract from current count.
    candidates = candidates[:4]
    # state[steam_id] = (timestamp, "in"/"out")
    state: Dict[str, tuple] = {}
    sid_rx = re.compile(r"'([0-9]{17})[^']*'\s+(logged in|connected|logged out|disconnected)", re.IGNORECASE)
    ts_rx = re.compile(r"^(\d{4}\.\d{2}\.\d{2}-\d{2}\.\d{2}\.\d{2})")
    for p in reversed(candidates):  # oldest first so newer overrides
        try:
            with p.open("rb") as f:
                f.seek(0, 2)
                sz = f.tell()
                f.seek(max(0, sz - 256 * 1024))  # last 256KB
                raw = f.read()
            # SCUM logs are UTF-16-LE with BOM. _decode_scum_log_bytes handles it.
            text = _decode_scum_log_bytes(raw) if "_decode_scum_log_bytes" in globals() else raw.decode("utf-16-le", errors="replace")
            for line in text.splitlines():
                ts_m = ts_rx.match(line.strip())
                sid_m = sid_rx.search(line)
                if not sid_m:
                    continue
                sid = sid_m.group(1)
                action = sid_m.group(2).lower()
                in_state = "in" if "logged in" in action or "connected" in action else "out"
                ts_key = ts_m.group(1) if ts_m else line[:32]
                # Newer entry wins because we walk files oldest→newest and
                # within each file top→bottom is also oldest→newest.
                state[sid] = (ts_key, in_state)
        except Exception:
            continue
    online = sum(1 for v in state.values() if v[1] == "in")
    _LOGIN_COUNT_CACHE[cache_key] = {"ts": time.time(), "count": online}
    return online


def _decode_scum_log_bytes(raw: bytes) -> str:
    """SCUM log files are UTF-16-LE with optional BOM. Strip BOM if present."""
    if raw[:2] == b"\xff\xfe":
        raw = raw[2:]
    try:
        return raw.decode("utf-16-le", errors="replace")
    except Exception:
        return raw.decode("utf-8", errors="replace")




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



def _firewall_rule_base(server_id: str) -> str:
    """Stable rule-base name for a server. We tag every netsh rule with this
    prefix so the manager can find/remove/audit them later. v1.0.37: bumped
    suffix so older rules without outbound coverage get rebuilt on next start."""
    return f"LGSS-SCUM-{server_id[:8]}"


def _firewall_rule_specs(server_id: str, exe: Path, game_port: int, query_port: int) -> list[dict]:
    """Return the full canonical list of firewall rules this manager owns for
    a server. Each entry is a dict with:
      - name      : the rule name (also used as primary key for delete/check)
      - direction : "in" | "out"
      - protocol  : "UDP" | "TCP" | "ANY"
      - port      : human-friendly description (e.g. "7777-7779")
      - args      : netsh argv suffix used to (re)create the rule
      - critical  : whether failure to add this rule will cripple visibility
                    in the Steam server browser (used to decide if we
                    surface a hard warning in the UI vs a soft notice).

    v1.0.37 changes (server list visibility fix):
      * Added matching OUTBOUND rules — the Steam master server protocol
        relies on the dedicated server initiating outbound UDP traffic to
        hl2master.steampowered.com:27011 + various sender ports. Hosts with
        an outbound-deny firewall policy (Win 11 Pro / Enterprise default
        for "Public" profile) were silently delisting from the browser.
      * Added profile=any — without this, netsh defaults to domain+private
        but home users are usually on the "Public" network profile and the
        rule wasn't applied to their actual active profile.
      * Added explicit -EXE-OUT rule pointing at SCUMServer.exe so any
        Steam P2P/auxiliary outbound traffic (NAT punch, master heartbeat)
        is unconditionally allowed regardless of port.
    """
    rb = _firewall_rule_base(server_id)
    udp_range = f"{game_port}-{game_port + 2}"
    specs: list[dict] = []

    # ---- INBOUND ----
    specs.append({
        "name": f"{rb}-UDP-game-IN", "direction": "in", "protocol": "UDP", "port": udp_range,
        "critical": True,
        "args": ["dir=in", "action=allow", "protocol=UDP", f"localport={udp_range}",
                 "profile=any", "enable=yes"],
    })
    specs.append({
        "name": f"{rb}-TCP-game-IN", "direction": "in", "protocol": "TCP", "port": udp_range,
        "critical": False,
        "args": ["dir=in", "action=allow", "protocol=TCP", f"localport={udp_range}",
                 "profile=any", "enable=yes"],
    })
    specs.append({
        "name": f"{rb}-UDP-query-IN", "direction": "in", "protocol": "UDP", "port": str(query_port),
        "critical": True,
        "args": ["dir=in", "action=allow", "protocol=UDP", f"localport={query_port}",
                 "profile=any", "enable=yes"],
    })
    specs.append({
        "name": f"{rb}-TCP-query-IN", "direction": "in", "protocol": "TCP", "port": str(query_port),
        "critical": False,
        "args": ["dir=in", "action=allow", "protocol=TCP", f"localport={query_port}",
                 "profile=any", "enable=yes"],
    })
    specs.append({
        "name": f"{rb}-EXE-IN", "direction": "in", "protocol": "ANY", "port": "*",
        "critical": True,
        "args": ["dir=in", "action=allow", f"program={exe}", "profile=any", "enable=yes"],
    })

    # ---- OUTBOUND (v1.0.37 — required for Steam master server visibility) ----
    specs.append({
        "name": f"{rb}-UDP-game-OUT", "direction": "out", "protocol": "UDP", "port": udp_range,
        "critical": True,
        "args": ["dir=out", "action=allow", "protocol=UDP", f"localport={udp_range}",
                 "profile=any", "enable=yes"],
    })
    specs.append({
        "name": f"{rb}-UDP-query-OUT", "direction": "out", "protocol": "UDP", "port": str(query_port),
        "critical": True,
        "args": ["dir=out", "action=allow", "protocol=UDP", f"localport={query_port}",
                 "profile=any", "enable=yes"],
    })
    specs.append({
        "name": f"{rb}-EXE-OUT", "direction": "out", "protocol": "ANY", "port": "*",
        "critical": True,
        "args": ["dir=out", "action=allow", f"program={exe}", "profile=any", "enable=yes"],
    })
    return specs


def _netsh_run(args: list[str], timeout: float = 8.0) -> tuple[int, str, str]:
    """Run `netsh advfirewall firewall <args>` and return (rc, stdout, stderr).
    Used both to add/delete rules and to query their existence."""
    try:
        proc = subprocess.run(
            ["netsh", "advfirewall", "firewall", *args],
            creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
            capture_output=True,
            timeout=timeout,
            text=True,
        )
        return proc.returncode, (proc.stdout or ""), (proc.stderr or "")
    except Exception as e:
        log.debug("netsh %s failed: %s", args[:3], e)
        return -1, "", str(e)


def _ensure_firewall_rules(server_id: str, exe: Path, game_port: int, query_port: int) -> None:
    """Idempotently (re)create all LGSS firewall rules for a server.

    This is the legacy entry point called at start_server(). It mirrors
    apply_firewall_rules() but swallows errors so a restricted environment
    can't block boot. Use apply_firewall_rules() when the caller needs to
    know whether each rule actually got created (e.g. wizard UI).
    """
    if not _is_windows():
        return
    try:
        apply_firewall_rules(server_id, exe, game_port, query_port)
    except Exception as e:
        log.warning("Firewall ensure skipped for %s: %s", server_id, e)


def apply_firewall_rules(server_id: str, exe: Path, game_port: int, query_port: int) -> dict:
    """Apply the full LGSS firewall ruleset for a server and report per-rule
    success. Returns a dict suitable for the UI:

      {
        "ok": bool,                # every CRITICAL rule applied successfully
        "needs_admin": bool,       # at least one add failed with "access denied"
        "applied": [name, ...],    # rules now in effect
        "failed":  [{name, error}, ...],
        "rules":   [               # full inventory with state (for the checklist UI)
            {name, direction, protocol, port, critical, ok}
        ],
      }

    Each rule is deleted-by-name first so re-running this is idempotent and
    auto-heals a partial install. The `needs_admin` flag is set when netsh
    returns rc=1 with "elevation" / "5" / "access is denied" in stderr — the
    UI uses it to surface the "Run as Administrator" hint.
    """
    if not _is_windows():
        return {"ok": False, "needs_admin": False, "applied": [], "failed": [],
                "rules": [], "platform": "non-windows"}

    specs = _firewall_rule_specs(server_id, exe, game_port, query_port)
    applied: list[str] = []
    failed: list[dict] = []
    needs_admin = False
    inventory: list[dict] = []

    for spec in specs:
        name = spec["name"]
        # Idempotency: blow away any same-named rule first (silently ignores
        # "no rule found" via rc != 0 — we don't care). Then add fresh.
        _netsh_run(["delete", "rule", f"name={name}"])
        rc, _stdout, stderr = _netsh_run(
            ["add", "rule", f"name={name}", *spec["args"]]
        )
        ok = (rc == 0)
        if ok:
            applied.append(name)
        else:
            failed.append({"name": name, "error": (stderr or "rc=" + str(rc)).strip()[:200]})
            low = stderr.lower()
            if "elev" in low or "access is denied" in low or "denied" in low or "5" in low:
                needs_admin = True
        inventory.append({
            "name": name,
            "direction": spec["direction"],
            "protocol": spec["protocol"],
            "port": spec["port"],
            "critical": spec["critical"],
            "ok": ok,
        })

    critical_ok = all(r["ok"] for r in inventory if r["critical"])
    result = {
        "ok": critical_ok and not failed,
        "needs_admin": needs_admin,
        "applied": applied,
        "failed": failed,
        "rules": inventory,
    }
    log.info("Firewall apply for %s: ok=%s needs_admin=%s failed=%d",
             server_id, result["ok"], needs_admin, len(failed))
    return result


def check_firewall_rules(server_id: str, exe: Path, game_port: int, query_port: int) -> dict:
    """Inspect Windows Firewall and report whether each LGSS rule for this
    server currently exists & is enabled. Read-only — does NOT mutate.

    Returns the same shape as apply_firewall_rules() but with `applied`
    listing rules that exist & are enabled, and `failed` listing rules
    that are missing or disabled. `needs_admin` is False here since this
    is a read-only operation.
    """
    if not _is_windows():
        return {"ok": False, "needs_admin": False, "applied": [], "failed": [],
                "rules": [], "platform": "non-windows"}
    specs = _firewall_rule_specs(server_id, exe, game_port, query_port)
    inventory: list[dict] = []
    applied: list[str] = []
    failed: list[dict] = []

    for spec in specs:
        name = spec["name"]
        rc, stdout, _stderr = _netsh_run(["show", "rule", f"name={name}"])
        # netsh prints "No rules match the specified criteria." when missing.
        exists = (rc == 0) and ("Enabled:" in stdout) and ("No rules match" not in stdout)
        enabled = exists and re.search(r"Enabled:\s*Yes", stdout) is not None
        ok = exists and enabled
        if ok:
            applied.append(name)
        else:
            failed.append({"name": name, "error": "missing" if not exists else "disabled"})
        inventory.append({
            "name": name,
            "direction": spec["direction"],
            "protocol": spec["protocol"],
            "port": spec["port"],
            "critical": spec["critical"],
            "ok": ok,
        })

    critical_ok = all(r["ok"] for r in inventory if r["critical"])
    return {
        "ok": critical_ok,
        "needs_admin": False,
        "applied": applied,
        "failed": failed,
        "rules": inventory,
    }


def remove_firewall_rules(server_id: str) -> dict:
    """Delete every LGSS-tagged rule for a server. Used when the admin
    deletes a server profile or explicitly clicks "Remove firewall rules"
    in the network setup wizard.
    """
    if not _is_windows():
        # Non-windows is treated as a successful no-op so the UI can call this
        # endpoint unconditionally without having to special-case the platform.
        return {"ok": True, "removed": [], "platform": "non-windows"}
    rb = _firewall_rule_base(server_id)
    # We can't enumerate easily by prefix with netsh, so we delete every
    # well-known suffix. Unknown rules are simply ignored (rc != 0).
    suffixes = [
        # v1.0.37 names
        "UDP-game-IN", "TCP-game-IN", "UDP-query-IN", "TCP-query-IN", "EXE-IN",
        "UDP-game-OUT", "UDP-query-OUT", "EXE-OUT",
        # Legacy v1.0.36 names (pre outbound) — clean them up too
        "UDP-game", "TCP-game", "UDP-query", "TCP-query", "EXE",
    ]
    removed: list[str] = []
    for suf in suffixes:
        name = f"{rb}-{suf}"
        rc, _stdout, _stderr = _netsh_run(["delete", "rule", f"name={name}"])
        if rc == 0:
            removed.append(name)
    log.info("Firewall rules removed for %s: %d", server_id, len(removed))
    return {"ok": True, "removed": removed}


def check_master_server_reachable(timeout: float = 2.0) -> dict:
    """Check whether the host can reach the Steam master server. SCUM uses
    Valve's master server to advertise itself; if outbound traffic to
    hl2master.steampowered.com is blocked, the server won't show up in the
    in-game browser even when all local rules are correct.

    Returns:
      {
        "ok": bool,
        "host": str,
        "port": int,
        "latency_ms": int | None,
        "error": str | None,
      }
    """
    import socket
    host = "hl2master.steampowered.com"
    port = 27011  # Steam master server UDP port
    t0 = time.time()
    try:
        # We can't TCP-connect (master is UDP-only) so we just resolve the
        # hostname AND send a tiny UDP probe and see if the OS lets us
        # transmit. A blocking outbound firewall surfaces as either OSError
        # ECONNREFUSED or a silent drop — we treat any send() success as
        # "outbound is at least not policy-blocked at L7".
        addr = socket.gethostbyname(host)
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as s:
            s.settimeout(timeout)
            # Steam Master Server Query Protocol — list servers request.
            # Region 0xff = "world", filter "\\appid\\513710" = SCUM.
            payload = b"1\xff0.0.0.0:0\x00\\appid\\513710\x00"
            s.sendto(payload, (addr, port))
            try:
                s.recvfrom(4096)  # Best-effort — many networks drop the reply
            except socket.timeout:
                pass  # Send succeeded → outbound is allowed; reply timeout is normal
        latency = int((time.time() - t0) * 1000)
        return {"ok": True, "host": host, "port": port, "latency_ms": latency, "error": None}
    except (socket.gaierror, OSError) as e:
        return {"ok": False, "host": host, "port": port, "latency_ms": None, "error": str(e)}


def is_process_elevated() -> bool:
    """Return True if the current process is running with Administrator
    privileges on Windows. Used so the UI can pre-warn the admin that
    netsh add rule will fail before they click 'Apply'."""
    if not _is_windows():
        return False
    try:
        import ctypes
        return bool(ctypes.windll.shell32.IsUserAnAdmin())
    except Exception:
        return False


def start_server(server_id: str, folder_path: str, port: int = 7779,
                 query_port: int = 7780, max_players: int = 64,
                 extra_args: Optional[str] = None) -> int:
    """Spawn SCUMServer.exe with -log (opens its own console window showing
    live server log). Returns PID. Raises if already running or exe missing.

    `extra_args` is an arbitrary command-line string the admin types in the
    "Başlatma Seçenekleri" panel (mod ids, custom flags, ini overrides, etc).
    It's split with shlex and appended AFTER the default SCUM flags so admin
    overrides win when SCUM resolves duplicates.

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
    #
    # NETWORK / VISIBILITY flags — these are why the server actually shows up
    # in Steam's "Internet" server browser. Without them admins saw an empty
    # listing even though their firewall rules were correct:
    #
    # -port=N          : Game port (UDP). SCUM also auto-binds N+1 (Query) and
    #                    N+2 (Steam) on top of this.
    # -QueryPort=N     : Steam A2S_INFO + master-server query port. MUST be set
    #                    explicitly; SCUM does NOT default to game_port + 1 on
    #                    all builds and silently registers with the master at
    #                    port 0 when this is missing → server is "invisible".
    # -SteamServerPort=N: The port Steam's lobby/connect peer uses. Belt-and-
    #                    -braces — some Unreal builds key off this instead of
    #                    -QueryPort when registering with steamcommunity.com.
    # -MULTIHOME=0.0.0.0: Bind on ALL local interfaces. Defaults to 0.0.0.0
    #                    already but many home Windows boxes with multiple NICs
    #                    (VPN/Hyper-V virtual adapters) silently bind to only
    #                    the first one which is then unreachable from the WAN.
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
        f"-SteamServerPort={query_port}",
        "-MULTIHOME=0.0.0.0",
        f"-MaxPlayers={max_players}",
    ]
    # Append admin-supplied custom flags last so they take precedence when
    # SCUM/Unreal resolves duplicates (later -port=... wins, etc).
    if extra_args:
        try:
            import shlex
            # POSIX mode here is correct on Windows too: shlex strips quotes,
            # giving us proper tokens (e.g. -ServerName="My Cool Server"
            # becomes a single argv slot `-ServerName=My Cool Server`).
            # subprocess.Popen on Windows then re-quotes via list2cmdline so
            # SCUMServer.exe sees the original argument intact.
            tokens = shlex.split(extra_args)
            args.extend(t for t in tokens if t)
        except Exception as e:
            log.warning("Could not parse extra_args %r (skipping): %s", extra_args, e)
    log.info("Starting SCUM: %s", " ".join(args))

    # Ensure Windows Firewall has inbound UDP rules for SCUM's 3-port range
    # (port, port+1, port+2) AND the Steam query port. Without this, Windows
    # Defender silently drops incoming UDP and the server doesn't show up in
    # the Steam browser (the symptom the admin reported: only 7777/7778 were
    # being opened by Windows' first-run "Allow access" popup, NOT 7779 which
    # is the actual connect port — game_port+2). We add the rules idempotently
    # via `netsh advfirewall firewall add rule` and ignore errors so a
    # restricted environment doesn't block startup.
    _ensure_firewall_rules(server_id, exe, port, query_port)

    # CREATE_NEW_CONSOLE       = 0x00000010  — own visible console window
    # CREATE_NEW_PROCESS_GROUP = 0x00000200  — required for GenerateConsoleCtrlEvent
    # HIGH_PRIORITY_CLASS      = 0x00000080  — OS scheduler gives SCUM extra CPU
    # We attach CREATE_NEW_PROCESS_GROUP so stop_server() can post a real
    # CTRL+C to SCUM's console — that's the only stop signal which triggers
    # SCUM's graceful save-and-shutdown path. Without it, TerminateProcess
    # cuts the EXE mid-tick and the next start rewinds the world to the last
    # auto-save (admins reported losing 3-5 minutes of player progress every
    # auto-restart).
    CREATE_NEW_CONSOLE = 0x00000010
    CREATE_NEW_PROCESS_GROUP = 0x00000200
    HIGH_PRIORITY_CLASS = 0x00000080
    proc = subprocess.Popen(
        args,
        cwd=str(exe.parent),
        creationflags=CREATE_NEW_CONSOLE | CREATE_NEW_PROCESS_GROUP | HIGH_PRIORITY_CLASS,
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
            """Return True if SCUM's log shows clear evidence the world is loaded
            and the tick loop is running. We accept ANY of these signals
            (whichever shows up first wins):

              * 1+ 'LogSCUM: Global Stats' line — emitted once the world tick
                begins (i.e. server can accept players).
              * 2+ 'LogQuadTree:' lines — spatial index is being populated as
                actors spawn into the world (the yellow coordinate spam the
                admin sees right when the server becomes joinable).
              * 1+ 'LogBattlEye: Server: Initialized' (BattlEye listener up).

            The previous threshold of "3+ Global Stats" was too conservative
            and caused servers to stay STARTING for ~30s longer than needed —
            especially when Windows Firewall was blocking the A2S query so
            this log probe was the only fallback signal.
            """
            for p in log_candidates:
                try:
                    if not p.exists():
                        continue
                    # Tail last 96KB (~1500 recent lines)
                    with p.open("rb") as f:
                        f.seek(0, 2)
                        size = f.tell()
                        f.seek(max(0, size - 96 * 1024))
                        tail = f.read().decode("utf-8", errors="replace")
                    if "LogSCUM: Global Stats" in tail:
                        return True
                    if tail.count("LogQuadTree:") >= 2:
                        return True
                    if "LogBattlEye: Server: Initialized" in tail:
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
            time.sleep(2.0)

    th = threading.Thread(target=_watch, name=f"ready-{server_id}", daemon=True)
    th.start()


def _send_real_ctrl_c(pid: int) -> bool:
    """Send a TRUE Windows console CTRL_C_EVENT to SCUM so it performs a
    proper world-save shutdown.

    Why not CTRL_BREAK?
        SCUM's console handler treats CTRL_BREAK as "force exit, NO-SAVE"
        (the cyan banner in the console literally says "NO-SAVE") and
        treats CTRL_C as "save world to SaveFiles, then exit cleanly".
        We MUST send CTRL_C, not CTRL_BREAK, or every restart rolls the
        world back to the last autosave.

    Why is this tricky?
        GenerateConsoleCtrlEvent(CTRL_C_EVENT, pid) ONLY works when caller
        and target share the same console. Our backend process doesn't —
        SCUM is on its own console window (CREATE_NEW_CONSOLE).

        The proven Windows technique (used by ARK Server Manager, RuntPM,
        etc.) is:
          1. SetConsoleCtrlHandler(NULL, TRUE)   — disable our own CTRL+C
                                                    handler so we don't die
          2. FreeConsole()                       — detach from our console
                                                    (no-op if PyInstaller
                                                    windowed bundle)
          3. AttachConsole(scum_pid)             — attach to SCUM's console
          4. GenerateConsoleCtrlEvent(0, 0)      — 0=CTRL_C, 0=broadcast to
                                                    all processes attached
                                                    to current console = SCUM
          5. FreeConsole()                       — detach from SCUM
          6. SetConsoleCtrlHandler(NULL, FALSE)  — re-enable our handler

    Returns True if the CTRL+C was successfully posted (SCUM may still
    take 10-30s to flush SaveFiles and exit afterwards).
    """
    if not _is_windows():
        return False
    try:
        import ctypes
        kernel32 = ctypes.windll.kernel32
        ATTACH_PARENT_PROCESS = -1
        CTRL_C_EVENT = 0

        # Step 1: disable our own CTRL+C handler so the broadcast in step 4
        # doesn't kill the manager backend itself.
        kernel32.SetConsoleCtrlHandler(None, True)

        attached = False
        sent = False
        try:
            # Step 2: detach from current console (manager's own).
            # Ignored if we don't have one (PyInstaller windowed bundle).
            kernel32.FreeConsole()

            # Step 3: attach to SCUM's console (the visible server window).
            # AttachConsole returns 0 on failure; common failure is "already
            # attached" which we can ignore for the purposes of step 4.
            if kernel32.AttachConsole(pid):
                attached = True
            else:
                err = ctypes.get_last_error()
                log.warning("AttachConsole(pid=%s) failed, err=%s — falling back to broadcast", pid, err)
                # Even if AttachConsole fails, GenerateConsoleCtrlEvent with
                # dwProcessGroupId=pid will try to deliver across groups.
                ok = kernel32.GenerateConsoleCtrlEvent(CTRL_C_EVENT, pid)
                sent = bool(ok)
                if not sent:
                    log.warning("Cross-group CTRL_C broadcast also failed pid=%s", pid)

            if attached:
                # Step 4: broadcast CTRL+C to every process on SCUM's console
                # (which is just SCUM itself). dwProcessGroupId=0 = broadcast.
                ok = kernel32.GenerateConsoleCtrlEvent(CTRL_C_EVENT, 0)
                sent = bool(ok)
                if sent:
                    log.info("Sent REAL CTRL_C to SCUM pid=%s — world save in progress", pid)
                else:
                    err = ctypes.get_last_error()
                    log.warning("GenerateConsoleCtrlEvent(CTRL_C) failed err=%s", err)
        finally:
            # Step 5: detach from SCUM's console
            if attached:
                try:
                    kernel32.FreeConsole()
                except Exception:
                    pass
            # Try to re-attach to our original console if we had one
            try:
                kernel32.AttachConsole(ATTACH_PARENT_PROCESS)
            except Exception:
                pass
            # Step 6: re-enable our own CTRL+C handler
            kernel32.SetConsoleCtrlHandler(None, False)

        return sent
    except Exception as e:
        log.warning("CTRL_C send failed: %s", e)
        return False


# Legacy alias — some older call sites in stop_server() still reference this.
# Routes through the real CTRL_C implementation for the proper world-save.
def _send_ctrl_break(pid: int) -> bool:
    return _send_real_ctrl_c(pid)


def stop_server(server_id: str, graceful_timeout: float = 30.0) -> bool:
    """Stop SCUMServer.exe gracefully so the world is saved.

    Sequence:
      1. Send a REAL CTRL_C_EVENT (via AttachConsole) to SCUM's console →
         SCUM's console handler flushes SaveFiles and shuts down cleanly.
         (CTRL_BREAK is NOT used — SCUM treats it as "NO-SAVE force exit".)
      2. Wait up to `graceful_timeout` seconds for the EXE to exit on its own.
      3. If still alive after the deadline (rare — SCUM typically saves in
         5-15s on small servers, up to 30s on busy ones), fall back to
         TerminateProcess on the whole tree.

    Pass `graceful_timeout=0` to skip the graceful save entirely and go
    straight to TerminateProcess (used for "instant kill" on crashed/hung
    processes).

    Returns True if a running process was stopped.
    """
    rec = REGISTRY.get(server_id, {}).get("process")
    pid = rec.get("pid") if rec else None
    if not pid or not _pid_alive(pid):
        with _LOCK:
            if rec:
                REGISTRY[server_id].pop("process", None)
        return False

    graceful_ok = False
    if graceful_timeout > 0:
        try:
            # Step 1: graceful save via REAL CTRL_C (not CTRL_BREAK!)
            if _send_real_ctrl_c(pid):
                # Step 2: wait for SCUM to finish saving
                t_start = time.time()
                while time.time() - t_start < graceful_timeout:
                    if not _pid_alive(pid):
                        graceful_ok = True
                        log.info(
                            "SCUM %s exited gracefully in %.1fs (world saved)",
                            server_id, time.time() - t_start,
                        )
                        break
                    time.sleep(0.5)
                if not graceful_ok:
                    log.warning(
                        "SCUM %s did not exit within %.0fs after CTRL_C — forcing kill",
                        server_id, graceful_timeout,
                    )
        except Exception as e:
            log.warning("Graceful stop failed: %s — falling back to kill", e)
    else:
        log.info("SCUM %s instant-kill requested (graceful_timeout=0)", server_id)

    # Step 3: force-kill anything that's left (children too)
    if not graceful_ok:
        try:
            p = psutil.Process(pid)
            for child in p.children(recursive=True):
                _safe_kill(child)
            _safe_kill(p)
        except psutil.NoSuchProcess:
            pass
        except Exception:
            log.exception("stop_server force-kill failed")

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
    query_port = rec.get("query_port")

    # --- Self-healing readiness check ---------------------------------------
    # If the background watcher thread was lost (backend restart, thread died,
    # etc.) the server process keeps running but `ready` is stuck at False —
    # so the UI strands at "STARTING" forever and player count never updates.
    # Every metrics call, if we're running-but-not-ready, probe TWO signals:
    #   1. UDP A2S_INFO on loopback (fast, but blocked by Windows Firewall on
    #      first boot before the user clicks "Allow access").
    #   2. SCUM log heartbeat (file-based, immune to firewall — flips ready
    #      the instant we see "Global Stats" / "LogQuadTree" / "BattlEye
    #      Initialized" in the tail of Saved/Logs/SCUM.log).
    # Either signal succeeding is enough.
    if running and not ready and query_port:
        probe_cache_key = f"ready_probe_{server_id}"
        last_probe = _METRICS_CACHE.get(probe_cache_key, {}).get("ts", 0)
        if now - last_probe > 5.0:
            _METRICS_CACHE[probe_cache_key] = {"ts": now}
            heal_reason = None
            # Try A2S first — cheapest path
            probe_info = _a2s_info_query("127.0.0.1", int(query_port), timeout=1.0)
            if probe_info is not None:
                heal_reason = "metrics_self_heal_a2s"
            else:
                # Fall back to log heartbeat (works even when firewall blocks UDP)
                fpath = rec.get("folder_path") or folder_path
                if fpath:
                    candidates = [
                        Path(fpath) / "SCUM" / "Saved" / "Logs" / "SCUM.log",
                        Path(fpath) / "SCUM" / "Saved" / "Logs" / "SCUMServer.log",
                    ]
                    for cp in candidates:
                        try:
                            if not cp.exists():
                                continue
                            with cp.open("rb") as f:
                                f.seek(0, 2)
                                sz = f.tell()
                                f.seek(max(0, sz - 96 * 1024))
                                tail = f.read().decode("utf-8", errors="replace")
                            if ("LogSCUM: Global Stats" in tail
                                or tail.count("LogQuadTree:") >= 2
                                or "LogBattlEye: Server: Initialized" in tail):
                                heal_reason = "metrics_self_heal_log"
                                break
                        except Exception:
                            continue
            if heal_reason:
                with _LOCK:
                    rec_now = REGISTRY.get(server_id, {}).get("process")
                    if rec_now and not rec_now.get("ready"):
                        rec_now["ready"] = True
                        rec_now["online_at"] = now
                        rec_now["ready_reason"] = heal_reason
                        log.info("SCUM %s READY via %s", server_id, heal_reason)
                ready = True
                rec = REGISTRY.get(server_id, {}).get("process") or rec

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

    # --- Fallback player count via login log ---------------------------------
    # If A2S is firewalled (Windows Defender doesn't auto-allow the query port
    # on first run), `players` stays None and the UI shows "0/64" even though
    # players are joined and playing. Read the tail of the latest login_*.log
    # file and count (joined - left) for the last 24h to derive an approximate
    # online count. Robust against the firewall edge case the admin reported.
    if ready and (players is None or players == 0):
        try:
            log_player_count = _count_online_from_login_log(rec.get("folder_path") or folder_path)
            if log_player_count is not None and log_player_count > 0:
                players = log_player_count
        except Exception as e:
            log.debug("login-log player fallback failed: %s", e)

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
