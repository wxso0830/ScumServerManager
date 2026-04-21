import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ScrollText, Upload, FolderSearch, Trash2, Search, RefreshCw, Users, Filter,
  Wrench, MessageCircle, LogIn, Swords, Coins, AlertTriangle, Trophy, ShieldCheck, FileText,
} from "lucide-react";
import { toast } from "sonner";
import { useI18n } from "../providers/I18nProvider";
import { endpoints } from "../lib/api";

const TYPE_META = {
  admin:     { icon: Wrench, color: "var(--accent)",        labelKey: "event_type_admin" },
  chat:      { icon: MessageCircle, color: "var(--info)",   labelKey: "event_type_chat" },
  login:     { icon: LogIn, color: "var(--success)",        labelKey: "event_type_login" },
  kill:      { icon: Swords, color: "var(--danger)",        labelKey: "event_type_kill" },
  economy:   { icon: Coins, color: "var(--warning)",        labelKey: "event_type_economy" },
  violation: { icon: AlertTriangle, color: "var(--danger)", labelKey: "event_type_violation" },
  fame:      { icon: Trophy, color: "#9B59B6",              labelKey: "event_type_fame" },
  raid:      { icon: ShieldCheck, color: "#607D8B",         labelKey: "event_type_raid" },
  generic:   { icon: FileText, color: "var(--text-dim)",    labelKey: "event_type_generic" },
};

const fmtTs = (iso) => {
  try {
    const d = new Date(iso);
    return d.toLocaleString([], { month: "short", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" });
  } catch { return iso; }
};

const EventRow = ({ ev }) => {
  const meta = TYPE_META[ev.type] || TYPE_META.generic;
  const Icon = meta.icon;

  const renderBody = () => {
    switch (ev.type) {
      case "admin":
        return (
          <>
            <span className="text-brand font-semibold">{ev.player_name || "system"}</span>
            <span className="text-muted"> ran </span>
            <span className="font-mono text-accent-brand">{ev.command}</span>
            {ev.args && <span className="font-mono text-dim"> {ev.args}</span>}
          </>
        );
      case "chat":
        return (
          <>
            <span className="text-muted">[{ev.channel}] </span>
            <span className="text-brand font-semibold">{ev.player_name}</span>
            <span className="text-muted">: </span>
            <span className="text-brand">{ev.message}</span>
          </>
        );
      case "login":
        return (
          <>
            <span className="text-brand font-semibold">{ev.player_name}</span>
            <span className="text-muted"> {ev.action?.replace("_", " ")}</span>
          </>
        );
      case "kill":
        return (
          <>
            <span className="text-brand font-semibold">{ev.killer_name}</span>
            <span className="text-muted"> killed </span>
            <span className="text-brand font-semibold">{ev.victim_name}</span>
            <span className="text-muted"> with </span>
            <span className="font-mono text-accent-brand">{ev.weapon}</span>
            <span className="text-muted"> · {Math.round(ev.distance_m || 0)}m</span>
          </>
        );
      case "economy":
        return (
          <>
            <span className="text-brand font-semibold">{ev.player_name}</span>
            <span className="text-muted"> {ev.action} </span>
            <span className="font-mono text-accent-brand">{ev.quantity}× {ev.item_code}</span>
            <span className="text-muted"> for </span>
            <span className="text-warning">{ev.amount}</span>
            <span className="text-muted"> @ {ev.trader}</span>
          </>
        );
      case "violation":
      case "fame":
        return <span className="text-brand">{ev.player_name} — {ev.description || (ev.delta != null ? `${ev.delta >= 0 ? "+" : ""}${ev.delta} fame` : "")}</span>;
      default:
        return <span className="text-dim font-mono text-xs">{ev.raw}</span>;
    }
  };

  return (
    <div className="px-4 py-2 border-b border-brand hover:bg-surface-2 transition-colors flex items-start gap-3 font-mono text-xs">
      <span className="text-muted text-[10px] tracking-widest pt-0.5 w-32 shrink-0">{fmtTs(ev.ts)}</span>
      <span className="shrink-0 pt-0.5" style={{ color: meta.color }}>
        <Icon size={13} />
      </span>
      <div className="flex-1 min-w-0 leading-relaxed">{renderBody()}</div>
    </div>
  );
};


/**
 * LiveDot — compact heartbeat indicator showing auto-refresh freshness.
 * Pulses green for ~2s after each successful poll, grey otherwise. Lets the
 * user confirm at a glance that the Logs page is actively syncing, without
 * depending on toasts or relying on visual event changes.
 */
const LiveDot = ({ lastRefreshAt, loading }) => {
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((n) => (n + 1) % 1e6), 500);
    return () => clearInterval(id);
  }, []);
  if (!lastRefreshAt) {
    return (
      <span className="text-[10px] font-mono text-dim uppercase tracking-widest opacity-70 hidden sm:inline">
        LIVE · —
      </span>
    );
  }
  const sec = Math.max(0, Math.floor((Date.now() - lastRefreshAt) / 1000));
  const isPulsing = loading || sec < 2;
  return (
    <span
      className="text-[10px] font-mono uppercase tracking-widest shrink-0 hidden sm:flex items-center gap-1.5"
      title={`Last refresh ${sec}s ago — auto-refreshes every 10s`}
      data-testid="logs-live-indicator"
    >
      <span
        className="inline-block w-1.5 h-1.5 rounded-full"
        style={{
          background: isPulsing ? "var(--success)" : "var(--text-dim)",
          boxShadow: isPulsing ? "0 0 6px var(--success)" : "none",
          transition: "background 200ms, box-shadow 200ms",
        }}
      />
      <span style={{ color: isPulsing ? "var(--success)" : "var(--text-dim)" }}>
        LIVE · {sec}s
      </span>
    </span>
  );
};


export const LogsView = ({ servers = [] }) => {
  const { t } = useI18n();
  const [serverId, setServerId] = useState(servers[0]?.id || "");
  const [typeFilter, setTypeFilter] = useState("");
  const [chatChannel, setChatChannel] = useState(""); // "" | Global | Local | Squad | Admin
  const [playerFilter, setPlayerFilter] = useState("");
  const [events, setEvents] = useState([]);
  const [stats, setStats] = useState({ by_type: {}, top_players: [], total: 0 });
  const [loading, setLoading] = useState(false);
  const fileRef = useRef(null);

  useEffect(() => {
    if (servers.length && !servers.find((s) => s.id === serverId)) {
      setServerId(servers[0]?.id || "");
    }
  }, [servers, serverId]);

  // Reset chat sub-filter whenever the user leaves the chat category
  useEffect(() => {
    if (typeFilter !== "chat") setChatChannel("");
  }, [typeFilter]);

  const [lastRefreshAt, setLastRefreshAt] = useState(null);

  // `scan` flag toggles an active log-folder scan before the query. We only do
  // that on visible/auto refreshes (not on filter-change navigations), so
  // clicking between categories stays instantaneous. Every 10s the user sees
  // the freshest possible data — no need to switch tabs or click Refresh.
  const load = async ({ scan = false } = {}) => {
    if (!serverId) return;
    setLoading(true);
    try {
      if (scan) {
        // Fire-and-forget: we don't block the fetch on it. If scan produces
        // new events, the very-next poll (10s later) will pick them up, but
        // in practice the scan completes within 1-2s so the same fetch sees
        // them already.
        endpoints.scanLogs(serverId, 20).catch(() => {});
      }
      const params = { limit: 300 };
      if (typeFilter) params.type = typeFilter;
      if (playerFilter) params.player = playerFilter;
      const [evs, st] = await Promise.all([
        endpoints.listEvents(serverId, params),
        endpoints.eventStats(serverId, 0),
      ]);
      setEvents(evs.events || []);
      setStats(st);
      setLastRefreshAt(Date.now());
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [serverId, typeFilter, playerFilter]);

  // Auto-refresh every 10s — AND actively rescan the log folder on each tick
  // so new chat lines / admin commands surface without requiring the user
  // to switch filters or press the manual Refresh button.
  useEffect(() => {
    const t = setInterval(() => { load({ scan: true }); }, 10000);
    return () => clearInterval(t);
    // eslint-disable-next-line
  }, [serverId, typeFilter, playerFilter]);

  const handleUpload = async (file) => {
    if (!file || !serverId) return;
    try {
      const r = await endpoints.importLog(serverId, file);
      toast.success(`${r.log_type}: ${r.stored} new events (${r.parsed} parsed)`);
      load();
    } catch (e) { toast.error(String(e.response?.data?.detail || e.message)); }
  };

  const handleScan = async () => {
    if (!serverId) return;
    try {
      const r = await endpoints.scanLogs(serverId, 20);
      if (r.error) toast.error(r.error);
      else toast.success(`Scanned ${r.scanned} files · ${r.stored} new events`);
      load();
    } catch (e) { toast.error(String(e.response?.data?.detail || e.message)); }
  };

  const handleClear = async () => {
    if (!serverId) return;
    if (!window.confirm("Clear all events for this server?")) return;
    const r = await endpoints.clearEvents(serverId);
    toast(`Deleted ${r.deleted}`);
    load();
  };

  const activeServer = useMemo(() => servers.find((s) => s.id === serverId), [servers, serverId]);

  // Chat channel counts (Global/Local/Squad/Admin) computed from the current event set.
  // These are client-side because the backend stats API does not aggregate by chat channel.
  const chatChannelCounts = useMemo(() => {
    const acc = { Global: 0, Local: 0, Squad: 0, Admin: 0 };
    for (const ev of events) {
      if (ev.type === "chat" && ev.channel && acc[ev.channel] !== undefined) {
        acc[ev.channel] += 1;
      }
    }
    return acc;
  }, [events]);

  // Final render list: apply chat channel filter on top of the server-filtered events.
  const visibleEvents = useMemo(() => {
    if (typeFilter !== "chat" || !chatChannel) return events;
    return events.filter((ev) => ev.type === "chat" && ev.channel === chatChannel);
  }, [events, typeFilter, chatChannel]);

  if (!servers.length) {
    return (
      <div className="flex-1 flex items-center justify-center bg-bg" data-testid="logs-view-empty">
        <div className="text-center text-dim text-sm">Add a server first to see its event feed.</div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-bg" data-testid="logs-view">
      {/* Header */}
      <div className="bg-bg-deep border-b border-brand px-6 py-4 flex items-center gap-4">
        <ScrollText size={18} className="text-accent-brand" />
        <div>
          <div className="label-accent">{t("nav_logs")}</div>
          <div className="heading-stencil text-lg">{activeServer?.name || "—"}</div>
        </div>

        <div className="flex-1" />

        <select
          value={serverId}
          onChange={(e) => setServerId(e.target.value)}
          className="bg-surface border border-strong px-3 py-1.5 text-xs font-mono uppercase tracking-wider text-brand"
          data-testid="logs-server-select"
          style={{ appearance: "none" }}
        >
          {servers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>

        <input ref={fileRef} type="file" className="hidden" accept=".log,.txt" onChange={(e) => handleUpload(e.target.files?.[0])} data-testid="logs-upload-input" />
        <button className="btn-secondary flex items-center gap-2" onClick={() => fileRef.current?.click()} data-testid="logs-upload-btn">
          <Upload size={13} /> {t("upload_log_file")}
        </button>
        <button className="btn-secondary flex items-center gap-2" onClick={handleScan} data-testid="logs-scan-btn">
          <FolderSearch size={13} /> {t("scan_logs_folder")}
        </button>
        <LiveDot lastRefreshAt={lastRefreshAt} loading={loading} />
        <button className="icon-btn" onClick={() => load({ scan: true })} title={t("refresh_now")} data-testid="logs-refresh-btn">
          <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
        </button>
        <button className="icon-btn" onClick={handleClear} title={t("clear_events")} data-testid="logs-clear-btn">
          <Trash2 size={14} />
        </button>
      </div>

      {/* Stats strip */}
      <div className="bg-bg border-b border-brand px-6 py-3 flex items-center gap-3 overflow-x-auto scrollbar-thin">
        <button
          onClick={() => setTypeFilter("")}
          className="px-2.5 py-1 text-[10px] font-mono uppercase tracking-widest border transition-colors whitespace-nowrap"
          style={{
            borderColor: !typeFilter ? "var(--accent)" : "var(--border)",
            color: !typeFilter ? "var(--accent)" : "var(--text-dim)",
          }}
          data-testid="logs-filter-all"
        >
          {t("all_events")} · {stats.total}
        </button>
        {Object.entries(TYPE_META).filter(([k]) => k !== "generic").map(([k, meta]) => {
          const Icon = meta.icon;
          const count = stats.by_type[k] || 0;
          return (
            <button
              key={k}
              onClick={() => setTypeFilter(k)}
              data-testid={`logs-filter-${k}`}
              className="px-2.5 py-1 text-[10px] font-mono uppercase tracking-widest border transition-colors whitespace-nowrap flex items-center gap-1.5"
              style={{
                borderColor: typeFilter === k ? meta.color : "var(--border)",
                color: typeFilter === k ? meta.color : "var(--text-dim)",
                background: typeFilter === k ? `${meta.color}14` : "transparent",
              }}
            >
              <Icon size={10} /> {t(meta.labelKey)} · {count}
            </button>
          );
        })}

        <div className="flex-1" />

        <div className="relative">
          <Search size={11} className="absolute left-2 top-1/2 -translate-y-1/2 text-dim" />
          <input
            className="input-field pl-7 text-xs w-56"
            placeholder={t("filter_by_player")}
            value={playerFilter}
            onChange={(e) => setPlayerFilter(e.target.value)}
            data-testid="logs-player-filter"
          />
        </div>
      </div>

      {/* Chat channel sub-filter — only visible when the Chat category is active */}
      {typeFilter === "chat" && (
        <div
          className="bg-bg-deep border-b border-brand px-6 py-2 flex items-center gap-2 overflow-x-auto scrollbar-thin"
          data-testid="logs-chat-subfilter"
        >
          <span className="label-overline text-info shrink-0">
            <MessageCircle size={11} className="inline mr-1.5" />
            {t("chat_channel_filter")}
          </span>
          <button
            onClick={() => setChatChannel("")}
            data-testid="logs-chat-channel-all"
            className="px-2.5 py-1 text-[10px] font-mono uppercase tracking-widest border transition-colors whitespace-nowrap"
            style={{
              borderColor: !chatChannel ? "var(--info)" : "var(--border)",
              color: !chatChannel ? "var(--info)" : "var(--text-dim)",
              background: !chatChannel ? "rgba(0,201,255,0.08)" : "transparent",
            }}
          >
            {t("all_events")} · {events.filter((e) => e.type === "chat").length}
          </button>
          {[
            { key: "Global", tkey: "chat_channel_global", color: "#FFD166" },
            { key: "Local",  tkey: "chat_channel_local",  color: "#00C9FF" },
            { key: "Squad",  tkey: "chat_channel_squad",  color: "#22D36F" },
            { key: "Admin",  tkey: "chat_channel_admin",  color: "var(--accent)" },
          ].map(({ key, tkey, color }) => {
            const active = chatChannel === key;
            return (
              <button
                key={key}
                onClick={() => setChatChannel(key)}
                data-testid={`logs-chat-channel-${key.toLowerCase()}`}
                className="px-2.5 py-1 text-[10px] font-mono uppercase tracking-widest border transition-colors whitespace-nowrap"
                style={{
                  borderColor: active ? color : "var(--border)",
                  color: active ? color : "var(--text-dim)",
                  background: active ? `${color}14` : "transparent",
                }}
              >
                {t(tkey)} · {chatChannelCounts[key] || 0}
              </button>
            );
          })}
        </div>
      )}

      {/* Event feed */}
      <div className="flex-1 overflow-y-auto scrollbar-thin bg-bg-deep">
        {visibleEvents.length === 0 && (
          <div className="p-12 text-center">
            <ScrollText size={40} className="mx-auto text-dim mb-4" />
            <h3 className="heading-stencil text-lg mb-2">{t("logs_empty_title")}</h3>
            <p className="text-xs text-dim max-w-md mx-auto leading-relaxed">{t("logs_empty_subtitle")}</p>
            <button className="btn-primary mt-5" onClick={() => fileRef.current?.click()} data-testid="logs-upload-hero-btn">
              <Upload size={13} className="inline mr-2" /> {t("upload_log_file")}
            </button>
          </div>
        )}
        {visibleEvents.map((ev) => <EventRow key={ev.id} ev={ev} />)}
      </div>

      {/* Top players sidebar — small overlay at bottom */}
      {stats.top_players?.length > 0 && (
        <div className="bg-surface border-t border-brand px-6 py-3 flex items-center gap-6 text-xs overflow-x-auto scrollbar-thin">
          <div className="flex items-center gap-2 text-dim shrink-0">
            <Users size={12} className="text-accent-brand" />
            <span className="label-overline">{t("top_players")}</span>
          </div>
          {stats.top_players.map((p, i) => (
            <div key={p.name} className="flex items-center gap-2 whitespace-nowrap" data-testid={`top-player-${i}`}>
              <span className="font-mono text-[10px] text-accent-brand">#{i + 1}</span>
              <span className="text-brand">{p.name}</span>
              <span className="text-dim">· {p.count}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
