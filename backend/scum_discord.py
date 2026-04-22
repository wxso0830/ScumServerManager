"""
SCUM-Manager Discord bot.

Design goals:
- Token is user-provided at runtime through the UI; we must be able to start
  and stop the bot dynamically without restarting the FastAPI process.
- Coexist with the existing FastAPI/uvicorn event loop — the bot runs as an
  asyncio task on the same loop (no threads, no extra process). discord.py 2.x
  is async-native so this is the recommended pattern.
- Presence (bot status bar): "X SCUM · Y oyuncu", refreshed every 30s.
- **Status channel** (primary feature): if the admin configures a channel id,
  the bot posts ONE embed per SCUM server into that channel and EDITS the
  same message every 60s. Embed mimics the style the user requested — server
  name, player counter, uptime, and a live online-player list with per-player
  session duration + squad name (when available).
- Player duration comes straight from A2S_PLAYER's `duration_s` field, which
  Source engine resets on reconnect — so "player leaves → timer resets,
  rejoins → starts at 0" happens for free.

Public coroutines:
    start_bot(token, get_state_fn, *, status_channel_id=None,
              message_id_store=None, initial_message_ids=None)
    stop_bot()
    get_status()
"""
from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timezone
from typing import Any, Awaitable, Callable, Dict, List, Optional

import discord
from discord import app_commands

log = logging.getLogger("scum_discord")

# --- module-level runtime -----------------------------------------------------
_client: Optional["ManagerBot"] = None
_runner: Optional[asyncio.Task] = None
_presence_task: Optional[asyncio.Task] = None
_status_task: Optional[asyncio.Task] = None
_state_fn: Optional[Callable[[], Dict[str, Any]]] = None
_status_channel_id: Optional[str] = None
_message_ids: Dict[str, str] = {}        # folder_name -> discord message id
_msg_id_store: Optional[Callable[[str, str], Awaitable[None]]] = None
_last_status: Dict[str, Any] = {
    "running": False,
    "connected": False,
    "user": None,
    "guild_count": 0,
    "error": None,
}

STATUS_REFRESH_SEC = 60


def _fmt_duration(seconds: int) -> str:
    """Human-friendly duration. 0 → '0m', 123 → '2m', 3720 → '1h 2m',
    90000 → '1d 1h'. Kept short so embed lines stay readable."""
    if seconds is None or seconds < 0:
        return "—"
    s = int(seconds)
    d, rem = divmod(s, 86400)
    h, rem = divmod(rem, 3600)
    m, _ = divmod(rem, 60)
    if d:
        return f"{d}d {h}h"
    if h:
        return f"{h}h {m}m"
    return f"{m}m"


def _fmt_uptime_long(seconds: int) -> str:
    """Palworld-style uptime: '14d 7h 58m' (always three units when any is set)."""
    s = int(seconds or 0)
    d, rem = divmod(s, 86400)
    h, rem = divmod(rem, 3600)
    m, _ = divmod(rem, 60)
    return f"{d}D {h}H {m}M"


def _build_server_embed(srv: Dict[str, Any]) -> discord.Embed:
    """One embed per SCUM server, refreshed every 60s. Matches the compact
    'server card' style the user referenced — player counter, uptime, and a
    live player list with session duration + squad."""
    ready = bool(srv.get("ready"))
    name = srv.get("name") or srv.get("folder_name") or "SCUM Server"
    max_p = srv.get("max_players") or 64
    players = srv.get("players") or []
    color = 0x3BA55C if ready else 0x57606F  # green when live, neutral otherwise

    embed = discord.Embed(
        title=name,
        color=color,
        timestamp=datetime.now(timezone.utc),
    )

    # Top-row stats
    embed.add_field(
        name="\U0001F465 Players",
        value=f"`{len(players)}/{max_p}`",
        inline=True,
    )
    embed.add_field(
        name="\u231B Uptime",
        value=f"`{_fmt_uptime_long(srv.get('uptime_s'))}`" if ready else "`—`",
        inline=True,
    )
    embed.add_field(
        name="\U0001F4E1 Status",
        value=":green_circle: Online" if ready else ":black_circle: Offline",
        inline=True,
    )

    # Online players list — one line per player with duration + optional squad
    if ready and players:
        lines: List[str] = []
        # Sort by duration descending so long-session veterans bubble up
        for p in sorted(players, key=lambda x: x.get("duration_s", 0), reverse=True):
            dur = _fmt_duration(p.get("duration_s"))
            squad = p.get("squad")
            squad_tag = f" · `[{squad}]`" if squad else ""
            nm = discord.utils.escape_markdown(p.get("name") or "?")
            lines.append(f"• **{nm}** — `{dur}`{squad_tag}")
        # Discord field values cap at 1024 chars; split into multiple fields.
        chunk: List[str] = []
        chunk_len = 0
        chunks: List[str] = []
        for line in lines:
            if chunk_len + len(line) + 1 > 1000:
                chunks.append("\n".join(chunk)); chunk = []; chunk_len = 0
            chunk.append(line); chunk_len += len(line) + 1
        if chunk:
            chunks.append("\n".join(chunk))
        for i, c in enumerate(chunks):
            embed.add_field(
                name=("\U0001F465 Online Players" if i == 0 else "\u200b"),
                value=c,
                inline=False,
            )
    elif ready:
        embed.add_field(
            name="\U0001F465 Online Players",
            value=":x: No players online",
            inline=False,
        )
    else:
        embed.add_field(
            name="\U0001F465 Online Players",
            value="*Server is offline*",
            inline=False,
        )

    embed.set_footer(text="Auto-refresh every 60s")
    return embed


class ManagerBot(discord.Client):
    """Minimal bot: slash commands + presence + status-channel loop."""

    def __init__(self):
        intents = discord.Intents.default()
        super().__init__(intents=intents)
        self.tree = app_commands.CommandTree(self)

    async def setup_hook(self) -> None:
        # /online is kept as a bonus — useful for channels where the static
        # embed isn't set up or when an admin wants an ad-hoc dump.
        @self.tree.command(name="online", description="Show who is online on every SCUM server")
        async def online_cmd(interaction: discord.Interaction):
            state = _state_fn() if _state_fn else {}
            servers = state.get("servers") or []
            if not servers:
                await interaction.response.send_message(
                    "No servers configured.", ephemeral=True,
                )
                return
            embeds = [_build_server_embed(s) for s in servers][:10]
            await interaction.response.send_message(embeds=embeds, ephemeral=True)

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
    """Update the bot's Playing status every ~30s."""
    await asyncio.sleep(3)
    while _client is not None and not _client.is_closed():
        try:
            state = _state_fn() if _state_fn else {}
            servers = state.get("servers") or []
            running = [s for s in servers if s.get("status") == "Running"]
            total = sum(len(s.get("players") or []) for s in servers)
            await _client.change_presence(
                activity=discord.Game(name=f"{len(running)} SCUM · {total} oyuncu")
            )
        except Exception as e:
            log.info("presence update failed: %s", e)
        await asyncio.sleep(30)


async def _status_channel_loop():
    """Post or edit the server-status embed in the configured channel every
    STATUS_REFRESH_SEC. One embed per SCUM server — the bot remembers each
    message id and edits in place so history isn't spammed."""
    await asyncio.sleep(6)  # let on_ready complete
    while _client is not None and not _client.is_closed():
        try:
            if _status_channel_id:
                channel = await _resolve_channel(int(_status_channel_id))
                if channel is not None:
                    state = _state_fn() or {}
                    for srv in state.get("servers", []):
                        fname = srv.get("folder_name") or srv.get("id")
                        if not fname:
                            continue
                        embed = _build_server_embed(srv)
                        msg_id = _message_ids.get(fname)
                        sent: Optional[discord.Message] = None
                        if msg_id:
                            try:
                                msg = await channel.fetch_message(int(msg_id))
                                await msg.edit(embed=embed)
                                sent = msg
                            except (discord.NotFound, discord.HTTPException):
                                # Message was deleted or channel changed
                                sent = None
                        if sent is None:
                            try:
                                sent = await channel.send(embed=embed)
                            except discord.HTTPException as e:
                                log.info("status send failed for %s: %s", fname, e)
                                continue
                        new_id = str(sent.id)
                        if _message_ids.get(fname) != new_id:
                            _message_ids[fname] = new_id
                            if _msg_id_store:
                                try:
                                    await _msg_id_store(fname, new_id)
                                except Exception as e:
                                    log.info("msg_id persist failed: %s", e)
        except Exception as e:
            log.info("status channel loop iteration failed: %s", e)
        await asyncio.sleep(STATUS_REFRESH_SEC)


async def _resolve_channel(channel_id: int) -> Optional[discord.abc.Messageable]:
    """Return the channel by id, fetching from REST if the cache is empty."""
    ch = _client.get_channel(channel_id) if _client else None
    if ch is not None:
        return ch
    try:
        return await _client.fetch_channel(channel_id)
    except (discord.NotFound, discord.Forbidden, discord.HTTPException) as e:
        log.info("fetch_channel(%s) failed: %s", channel_id, e)
        return None


async def start_bot(
    token: str,
    get_state_fn: Callable[[], Dict[str, Any]],
    *,
    status_channel_id: Optional[str] = None,
    message_id_store: Optional[Callable[[str, str], Awaitable[None]]] = None,
    initial_message_ids: Optional[Dict[str, str]] = None,
) -> Dict[str, Any]:
    """Launch the bot if not already running. Idempotent — returns current
    status dict; never raises for bad tokens, caller inspects `error` instead.

    Args:
        token: Discord bot token.
        get_state_fn: Sync callable returning the manager state dict.
        status_channel_id: Optional channel id; when set the bot keeps an
            always-up-to-date server embed posted there.
        message_id_store: Async callable(folder, msg_id) used to persist the
            id of each posted embed so restarts don't double-post.
        initial_message_ids: {folder_name: msg_id} from previous runs.
    """
    global _client, _runner, _presence_task, _status_task
    global _state_fn, _status_channel_id, _message_ids, _msg_id_store
    if not token or not token.strip():
        return {**_last_status, "error": "empty_token"}
    if _client is not None and not _client.is_closed():
        return _last_status

    _state_fn = get_state_fn
    _status_channel_id = (status_channel_id or "").strip() or None
    _message_ids = dict(initial_message_ids or {})
    _msg_id_store = message_id_store
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
    _status_task = asyncio.create_task(_status_channel_loop(), name="scum-discord-status")
    return _last_status


async def stop_bot() -> Dict[str, Any]:
    """Cleanly disconnect the bot if running."""
    global _client, _runner, _presence_task, _status_task
    if _client is None:
        return _last_status
    try:
        if not _client.is_closed():
            await _client.close()
    except Exception:
        log.exception("stop_bot close failed")
    for task in (_status_task, _presence_task, _runner):
        if task and not task.done():
            task.cancel()
    _client = None
    _runner = None
    _presence_task = None
    _status_task = None
    _last_status["running"] = False
    _last_status["connected"] = False
    return _last_status


def get_status() -> Dict[str, Any]:
    return {
        **_last_status,
        "running": _client is not None and not _client.is_closed(),
    }
