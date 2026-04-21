import React, { useEffect, useMemo, useState } from "react";
import {
  Users, Search, RefreshCw, UserCircle2, Shield, Clock, Swords, Coins, Trophy,
  Flag, Car, X, Info, Activity,
} from "lucide-react";
import { useI18n } from "../providers/I18nProvider";
import { endpoints } from "../lib/api";

const fmtFull = (iso) => {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    return d.toLocaleString([], { year: "numeric", month: "short", day: "2-digit", hour: "2-digit", minute: "2-digit" });
  } catch { return iso; }
};

const relative = (iso) => {
  if (!iso) return "—";
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
};

export const PlayersView = ({ servers = [] }) => {
  const { t } = useI18n();
  const [serverId, setServerId] = useState(servers[0]?.id || "");
  const [tab, setTab] = useState("online"); // online | all — default to online so admins see who's live first
  const [search, setSearch] = useState("");
  const [data, setData] = useState({ players: [], count: 0, online_count: 0 });
  const [loading, setLoading] = useState(false);
  const [detail, setDetail] = useState(null);

  useEffect(() => {
    if (servers.length && !servers.find((s) => s.id === serverId)) setServerId(servers[0]?.id || "");
  }, [servers, serverId]);

  const load = async () => {
    if (!serverId) return;
    setLoading(true);
    try {
      // Always fetch the FULL roster (no `online=` filter) so both tab counts
      // stay accurate when switching between "Online" and "All Players".
      // The tab itself only changes what we render, not what we fetch.
      const params = {};
      if (search) params.search = search;
      const r = await endpoints.listPlayers(serverId, params);
      setData(r);
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [serverId, search]);

  useEffect(() => {
    const t = setInterval(() => { load(); }, 15000);
    return () => clearInterval(t);
    // eslint-disable-next-line
  }, [serverId, search]);

  const activeServer = useMemo(() => servers.find((s) => s.id === serverId), [servers, serverId]);

  // Client-side tab filter — keeps `data.count` and `data.online_count` stable across tab switches.
  const visiblePlayers = useMemo(
    () => (tab === "online" ? (data.players || []).filter((p) => p.is_online) : (data.players || [])),
    [data.players, tab],
  );

  const openDetail = async (player) => {
    try {
      const r = await endpoints.getPlayer(serverId, player.steam_id, 50);
      setDetail(r);
    } catch (_) { /* ignore */ }
  };

  if (!servers.length) {
    return (
      <div className="flex-1 flex items-center justify-center bg-bg" data-testid="players-view-empty">
        <div className="text-center text-dim text-sm">Add a server first.</div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-bg" data-testid="players-view">
      {/* Header */}
      <div className="bg-bg-deep border-b border-brand px-6 py-4 flex items-center gap-4">
        <Users size={18} className="text-accent-brand" />
        <div>
          <div className="label-accent">{t("nav_players")}</div>
          <div className="heading-stencil text-lg">{activeServer?.name || "—"}</div>
        </div>
        <div className="flex-1" />

        <select
          value={serverId}
          onChange={(e) => setServerId(e.target.value)}
          className="bg-surface border border-strong px-3 py-1.5 text-xs font-mono uppercase tracking-wider text-brand"
          data-testid="players-server-select"
          style={{ appearance: "none" }}
        >
          {servers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>

        <div className="relative">
          <Search size={11} className="absolute left-2 top-1/2 -translate-y-1/2 text-dim" />
          <input
            className="input-field pl-7 text-xs w-56"
            placeholder="Name or SteamID..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            data-testid="players-search"
          />
        </div>

        <button className="icon-btn" onClick={load} title="Refresh" data-testid="players-refresh-btn">
          <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
        </button>
      </div>

      {/* Tabs */}
      <div className="bg-surface border-b border-brand px-6 flex items-stretch">
        <button
          onClick={() => setTab("online")}
          data-testid="players-tab-online"
          className={`nav-tab flex items-center gap-2 ${tab === "online" ? "active" : ""}`}
        >
          <span className="status-led running" /> {t("players_online_tab")}
          <span className="ml-1 text-dim">· {data.online_count}</span>
        </button>
        <button
          onClick={() => setTab("all")}
          data-testid="players-tab-all"
          className={`nav-tab flex items-center gap-2 ${tab === "all" ? "active" : ""}`}
        >
          <UserCircle2 size={13} /> {t("players_all_tab")}
          <span className="ml-1 text-dim">· {data.count}</span>
        </button>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-y-auto scrollbar-thin bg-bg-deep">
        {visiblePlayers.length === 0 ? (
          <div className="p-12 text-center">
            <Users size={40} className="mx-auto text-dim mb-4" />
            <h3 className="heading-stencil text-lg mb-2">{t("players_none_title")}</h3>
            <p className="text-xs text-dim max-w-md mx-auto leading-relaxed">{t("players_none_hint")}</p>
          </div>
        ) : (
          <table className="w-full text-xs font-mono">
            <thead className="bg-bg border-b-2 border-brand sticky top-0">
              <tr className="text-left">
                <th className="label-overline px-4 py-3">{t("col_status")}</th>
                <th className="label-overline px-4 py-3">{t("col_player")}</th>
                <th className="label-overline px-4 py-3">Steam ID</th>
                <th className="label-overline px-4 py-3">{t("col_squad")}</th>
                <th className="label-overline px-4 py-3 text-right">{t("col_fame")}</th>
                <th className="label-overline px-4 py-3">{t("col_last_seen")}</th>
                <th className="label-overline px-4 py-3 text-right">{t("col_kills")}</th>
                <th className="label-overline px-4 py-3 text-right">{t("col_trade")}</th>
                <th className="label-overline px-4 py-3 text-right">{t("col_flags")}</th>
                <th className="label-overline px-4 py-3 text-right" title={t("col_vehicles_self_tip")}>{t("col_vehicles_self")}</th>
                <th className="label-overline px-4 py-3 text-right" title={t("col_vehicles_squad_tip")}>{t("col_vehicles_squad")}</th>
              </tr>
            </thead>
            <tbody>
              {visiblePlayers.map((p) => (
                <tr
                  key={p.steam_id}
                  onClick={() => openDetail(p)}
                  data-testid={`player-row-${p.steam_id}`}
                  className="border-b border-brand hover:bg-surface-2 cursor-pointer transition-colors"
                >
                  <td className="px-4 py-3">
                    {p.is_online ? (
                      <span className="flex items-center gap-2 text-success">
                        <span className="status-led running" />
                        <span className="text-[10px] uppercase tracking-widest">ONLINE</span>
                      </span>
                    ) : (
                      <span className="flex items-center gap-2 text-dim">
                        <span className="status-led stopped" />
                        <span className="text-[10px] uppercase tracking-widest">OFFLINE</span>
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span className="text-brand">{p.name}</span>
                      {p.is_admin_invoker && (
                        <span className="flex items-center gap-1 px-1.5 py-0.5 border border-accent-brand text-accent-brand text-[9px] uppercase tracking-widest">
                          <Shield size={8} /> {t("admin_player")}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-dim">{p.steam_id}</td>
                  <td className="px-4 py-3 text-dim">{p.squad_name || "—"}</td>
                  <td className="px-4 py-3 text-right">
                    <span className={p.fame > 0 ? "text-warning" : "text-dim"}>
                      {p.fame != null ? Number(p.fame).toLocaleString(undefined, { maximumFractionDigits: 1 }) : "—"}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div>{fmtFull(p.last_seen)}</div>
                    <div className="text-[10px] text-muted">{relative(p.last_seen)}</div>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span className="text-brand">{p.kills}</span>
                    <span className="text-dim"> / {p.deaths}</span>
                  </td>
                  <td className="px-4 py-3 text-right text-warning">
                    {p.trade_amount ? p.trade_amount.toLocaleString() : "—"}
                  </td>
                  <td className="px-4 py-3 text-right text-muted">{p.flag_count ?? "—"}</td>
                  <td className="px-4 py-3 text-right text-muted">{p.vehicle_count ?? "—"}</td>
                  <td className="px-4 py-3 text-right text-muted">
                    {p.squad_vehicle_count != null && p.squad_vehicle_count !== p.vehicle_count
                      ? p.squad_vehicle_count
                      : (p.squad_vehicle_count ?? "—")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Info strip: SCUM.db live read status */}
      <div className="bg-surface border-t border-brand px-6 py-2 flex items-center gap-2 text-[10px] text-dim font-mono uppercase tracking-widest">
        <Info size={11} className="text-accent-brand" />
        <span>{t("players_db_source")}</span>
      </div>

      {detail && <PlayerDetailModal detail={detail} onClose={() => setDetail(null)} t={t} />}
    </div>
  );
};

/* ---------- Detail modal ---------- */

const DetailStat = ({ icon: Icon, label, value, color }) => (
  <div className="border border-brand bg-bg-deep px-4 py-3">
    <div className="flex items-center gap-2 mb-1">
      <Icon size={11} style={{ color: color || "var(--text-dim)" }} />
      <span className="label-overline">{label}</span>
    </div>
    <div className="font-mono text-lg" style={{ color: color || "var(--text)" }}>{value}</div>
  </div>
);

const PlayerDetailModal = ({ detail, onClose, t }) => {
  const p = detail.player;
  const recent = detail.recent_events || [];
  return (
    <div
      className="fixed inset-0 z-[80] bg-bg-deep/90 backdrop-blur-md flex items-center justify-center p-4"
      onClick={onClose}
      data-testid="player-detail-modal"
    >
      <div
        className="panel w-full max-w-3xl corner-brackets-full"
        onClick={(e) => e.stopPropagation()}
        style={{ background: "var(--surface)", maxHeight: "90vh", display: "flex", flexDirection: "column" }}
      >
        <span className="cbr-tr" />
        <span className="cbr-bl" />

        <div className="px-5 py-3 border-b border-brand flex items-center gap-3">
          <div
            className="h-10 w-10 flex items-center justify-center border border-accent-brand bg-accent-soft"
            style={{ clipPath: "polygon(6px 0, 100% 0, calc(100% - 6px) 100%, 0 100%)" }}
          >
            <UserCircle2 size={20} className="text-accent-brand" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="heading-stencil text-base">{p.name}</span>
              {p.is_admin_invoker && (
                <span className="flex items-center gap-1 px-1.5 py-0.5 border border-accent-brand text-accent-brand text-[9px] uppercase tracking-widest">
                  <Shield size={9} /> {t("admin_player")}
                </span>
              )}
              {p.is_online ? (
                <span className="flex items-center gap-1 px-1.5 py-0.5 border border-success text-success text-[9px] uppercase tracking-widest">
                  <span className="status-led running" /> ONLINE
                </span>
              ) : null}
            </div>
            <div className="font-mono text-[11px] text-dim mt-1">{p.steam_id}</div>
          </div>
          <button onClick={onClose} className="icon-btn" data-testid="player-detail-close">
            <X size={14} />
          </button>
        </div>

        <div className="px-5 py-4 grid grid-cols-2 md:grid-cols-4 gap-3">
          <DetailStat icon={Clock} label={t("col_first_seen")} value={fmtFull(p.first_seen)} />
          <DetailStat icon={Clock} label={t("col_last_seen")} value={fmtFull(p.last_seen)} color="var(--accent)" />
          <DetailStat icon={Activity} label={t("col_events")} value={p.total_events} />
          <DetailStat icon={Swords} label={t("col_kills")} value={`${p.kills} / ${p.deaths}`} color={p.kills > p.deaths ? "var(--success)" : "var(--text)"} />
          <DetailStat icon={Coins} label={t("col_trade")} value={p.trade_amount ? p.trade_amount.toLocaleString() : "0"} color="var(--warning)" />
          <DetailStat icon={Trophy} label={t("fame_change")} value={`${p.fame_delta >= 0 ? "+" : ""}${p.fame_delta}`} color={p.fame_delta >= 0 ? "var(--success)" : "var(--danger)"} />
          <DetailStat icon={Flag} label={t("col_flags")} value={p.flag_count ?? "—"} />
          <DetailStat icon={Car} label={t("col_vehicles")} value={p.vehicle_count ?? "—"} />
        </div>

        <div className="px-5 pb-2 border-t border-brand pt-3">
          <div className="label-accent mb-2">{t("recent_events")} · {recent.length}</div>
        </div>
        <div className="flex-1 overflow-y-auto scrollbar-thin px-5 pb-5">
          {recent.length === 0 ? (
            <div className="text-center py-6 text-dim text-xs">No events recorded.</div>
          ) : recent.map((ev) => (
            <div key={ev.id} className="border-b border-brand py-2 flex items-start gap-3 font-mono text-xs">
              <span className="text-muted text-[10px] tracking-widest pt-0.5 w-32 shrink-0">
                {new Date(ev.ts).toLocaleString([], { month: "short", day: "2-digit", hour: "2-digit", minute: "2-digit" })}
              </span>
              <span className="text-accent-brand w-16 shrink-0 uppercase">{ev.type}</span>
              <span className="text-brand flex-1">
                {ev.command || ev.message || ev.item_code || ev.action || ev.weapon || ev.raw?.slice(0, 100) || ""}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
