"""
SCUM-Manager Discord bot.

Design goals:
- Token is user-provided at runtime through the UI; we must be able to start
  and stop the bot dynamically without restarting the FastAPI process.
- Coexist with the existing FastAPI/uvicorn event loop — the bot runs as an
  asyncio task on the same loop (no threads, no extra process). discord.py 2.x
  is async-native so this is the recommended pattern.
- Presence (bot status) reflects the live manager state: "N servers · M online".
- /online slash command lists every player on every managed server, read from
  SCUM.db (already tracked by scum_db). No RCON required.

Public coroutines:
    start_bot(token, get_state_fn)     # start if not running
    stop_bot()                         # graceful close
    refresh_presence()                 # forces a presence update immediately
    get_status()                       # dict for UI (connected/guilds/users)
"""
from __future__ import annotations

import asyncio
import logging
from typing import Any, Callable, Dict, List, Optional

import discord
from discord import app_commands

log = logging.getLogger("scum_discord")

# --- module-level runtime -----------------------------------------------------
_client: Optional["ManagerBot"] = None
_runner: Optional[asyncio.Task] = None
_presence_task: Optional[asyncio.Task] = None
_state_fn: Optional[Callable[[], Dict[str, Any]]] = None
_last_status: Dict[str, Any] = {
    "running": False,
    "connected": False,
    "user": None,
    "guild_count": 0,
    "error": None,
}


class ManagerBot(discord.Client):
    """Minimal bot: syncs slash commands on ready, updates presence every 30s."""

    def __init__(self):
        intents = discord.Intents.default()
        # We don't need privileged intents — presence + slash commands only.
        super().__init__(intents=intents)
        self.tree = app_commands.CommandTree(self)

    async def setup_hook(self) -> None:
        # Register slash commands once; /online is the primary one the user asked for.
        @self.tree.command(name="online", description="Show who is online on every SCUM server")
        async def online_cmd(interaction: discord.Interaction):
            state = _state_fn() if _state_fn else {}
            servers: List[Dict[str, Any]] = state.get("servers") or []
            if not servers:
                await interaction.response.send_message(
                    "No servers are configured in the manager.", ephemeral=True,
                )
                return

            lines: List[str] = []
            total_players = 0
            for s in servers:
                name = s.get("name") or s.get("folder_name") or "Unknown"
                players = s.get("players") or []
                total_players += len(players)
                if s.get("status") != "Running" or not s.get("ready"):
                    lines.append(f"**{name}** — :black_circle: offline")
                    continue
                if players:
                    tag_list = ", ".join(p["name"] for p in players[:30])
                    more = f" (+{len(players)-30})" if len(players) > 30 else ""
                    lines.append(
                        f"**{name}** — :green_circle: {len(players)}/{s.get('max_players', '?')} · {tag_list}{more}"
                    )
                else:
                    lines.append(f"**{name}** — :green_circle: 0 players online")

            embed = discord.Embed(
                title=f"SCUM — {total_players} player{'s' if total_players != 1 else ''} online",
                description="\n".join(lines)[:4000],
                color=0xE94560,
            )
            await interaction.response.send_message(embed=embed)

        # Sync globally; may take up to 1h on first publish but typical discord.py
        # guild-scoped sync would require the guild id list at start, which we
        # don't have. Global is fine here.
        try:
            await self.tree.sync()
        except Exception as e:
            log.info("slash-command sync skipped: %s", e)

    async def on_ready(self) -> None:
        _last_status["connected"] = True
        _last_status["user"] = f"{self.user.name}#{self.user.discriminator}" if self.user else None
        _last_status["guild_count"] = len(self.guilds)
        log.info("Discord bot ready as %s (guilds=%d)", self.user, len(self.guilds))


async def _presence_loop():
    """Update the bot's Playing status every ~30s. Shows the LOCAL manager
    server count (per user's preference) and total live player count."""
    await asyncio.sleep(3)  # give on_ready a beat
    while _client is not None and not _client.is_closed():
        try:
            state = _state_fn() if _state_fn else {}
            servers: List[Dict[str, Any]] = state.get("servers") or []
            running = [s for s in servers if s.get("status") == "Running"]
            total = sum(len(s.get("players") or []) for s in servers)
            # "2 SCUM · 14 oyuncu" — short enough to fit Discord status (128c).
            name = f"{len(running)} SCUM · {total} oyuncu"
            await _client.change_presence(activity=discord.Game(name=name))
        except Exception as e:
            log.info("presence update failed: %s", e)
        await asyncio.sleep(30)


async def start_bot(token: str, get_state_fn: Callable[[], Dict[str, Any]]) -> Dict[str, Any]:
    """Launch the bot if not already running. Idempotent — returns current
    status dict; never raises for bad tokens, caller inspects `error` instead."""
    global _client, _runner, _presence_task, _state_fn
    if not token or not token.strip():
        return {**_last_status, "error": "empty_token"}
    if _client is not None and not _client.is_closed():
        # Already running — ignore new start requests.
        return _last_status

    _state_fn = get_state_fn
    _client = ManagerBot()
    _last_status.update({"running": True, "connected": False, "error": None})

    async def _run():
        try:
            await _client.start(token.strip())
        except discord.LoginFailure:
            _last_status["error"] = "login_failed"
            log.warning("Discord login failed (bad token)")
        except Exception as e:
            _last_status["error"] = f"{type(e).__name__}: {e}"
            log.exception("Discord bot crashed")
        finally:
            _last_status["running"] = False
            _last_status["connected"] = False

    _runner = asyncio.create_task(_run(), name="scum-discord-bot")
    _presence_task = asyncio.create_task(_presence_loop(), name="scum-discord-presence")
    return _last_status


async def stop_bot() -> Dict[str, Any]:
    """Cleanly disconnect the bot if running."""
    global _client, _runner, _presence_task
    if _client is None:
        return _last_status
    try:
        if not _client.is_closed():
            await _client.close()
    except Exception:
        log.exception("stop_bot close failed")
    # Cancel background tasks
    for task in (_presence_task, _runner):
        if task and not task.done():
            task.cancel()
    _client = None
    _runner = None
    _presence_task = None
    _last_status["running"] = False
    _last_status["connected"] = False
    return _last_status


def get_status() -> Dict[str, Any]:
    return {
        **_last_status,
        "running": _client is not None and not _client.is_closed(),
    }
