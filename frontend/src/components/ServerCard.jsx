import React, { useEffect, useState } from "react";
import {
  Play, Square, Download, RefreshCw, RotateCw, ChevronsUp, Settings, Trash2, Users, Cpu, Activity,
  Server as ServerIcon, HardDrive, Clock, Network,
} from "lucide-react";
import { useI18n } from "../providers/I18nProvider";
import { endpoints } from "../lib/api";

const STATUS_META = {
  Running:   { cls: "running",    label: "server_status_running",    color: "var(--success)" },
  Starting:  { cls: "starting",   label: "server_status_starting",   color: "var(--warning)" },
  Stopped:   { cls: "stopped",    label: "server_status_stopped",    color: "var(--text-muted)" },
  Updating:  { cls: "updating",   label: "server_status_updating",   color: "var(--warning)" },
  Installing:{ cls: "installing", label: "installing",               color: "var(--accent)" },
};

// Format seconds -> H:MM:SS  (or MM:SS if <1h)
const fmtUptime = (sec) => {
  if (!sec || sec < 0) return "—";
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  const pad = (n) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
};

const fmtGb = (gb) => {
  if (gb == null) return "—";
  if (gb < 1) return `${Math.round(gb * 1024)} MB`;
  return `${gb.toFixed(1)} GB`;
};

const fmtDate = (iso) => {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    return d.toLocaleString("tr-TR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
  } catch { return iso; }
};

export const ServerCard = ({ server, onOpen, onStart, onStop, onUpdate, onInstall, onDelete, onChange, busy }) => {
  const { t } = useI18n();
  const status = STATUS_META[server.status] || STATUS_META.Stopped;
  const isRunning = server.status === "Running";
  const isStarting = server.status === "Starting";
  const processAlive = isRunning || isStarting;  // SCUM.exe is already up
  const gamePort = server.game_port ?? 7779;
  const queryPort = server.query_port ?? 7780;

  const [metrics, setMetrics] = useState(null);
  // Read max_players from the saved INI values (scum.MaxPlayers). Falls back
  // to the legacy `max_players` field or 64 if neither exists.
  const maxPlayers = Number(
    server.settings?.srv_general?.["scum.MaxPlayers"] ??
    server.max_players ?? 64
  );

  // Poll live metrics every 5s (also immediately on mount / status change)
  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const m = await endpoints.serverMetrics(server.id);
        if (alive) setMetrics(m);
      } catch {}
    };
    load();
    const interval = setInterval(load, processAlive ? 5000 : 15000);
    return () => { alive = false; clearInterval(interval); };
  }, [server.id, processAlive, server.installed]);

  return (
    <div className="server-card group" data-testid={`server-card-${server.folder_name}`}>
      {/* Header */}
      <div className="flex items-start justify-between gap-3 mb-5">
        <div className="flex items-center gap-3 min-w-0">
          <div
            className="h-11 w-11 flex items-center justify-center border border-strong bg-surface-2 relative"
            style={{ clipPath: "polygon(6px 0, 100% 0, calc(100% - 6px) 100%, 0 100%)" }}
          >
            <ServerIcon size={18} className="text-accent-brand" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="status-led inline-block" style={{ background: status.color }} />
              <span className="font-mono text-[10px] uppercase tracking-[0.22em]" style={{ color: status.color }}>
                {t(status.label)}
              </span>
            </div>
            <h3 className="heading-stencil text-base mt-1 truncate" data-testid={`server-card-name-${server.folder_name}`}>
              {server.name}
            </h3>
            <div className="font-mono text-[10px] text-muted uppercase tracking-widest mt-0.5">
              {server.folder_name} · APPID 3792580
            </div>
          </div>
        </div>

        <button
          className="icon-btn"
          title={t("delete_server")}
          data-testid={`card-delete-${server.folder_name}`}
          onClick={(e) => { e.stopPropagation(); onDelete?.(server.id); }}
        >
          <Trash2 size={15} />
        </button>
      </div>

      {/* Vitals row 1 — players / CPU / uptime */}
      <div className="grid grid-cols-3 gap-2 mb-2">
        <MetricTile
          icon={Users}
          label={t("players")}
          value={
            metrics?.ready && typeof metrics?.players === "number"
              ? `${metrics.players}/${metrics.max_players_live || maxPlayers}`
              : `0/${maxPlayers}`
          }
          testId={`metric-players-${server.folder_name}`}
        />
        <MetricTile
          icon={Cpu}
          label="CPU"
          value={metrics?.running ? `${metrics.cpu_percent.toFixed(0)}%` : "—"}
          testId={`metric-cpu-${server.folder_name}`}
        />
        <MetricTile
          icon={Activity}
          label={t("uptime")}
          value={
            metrics?.ready
              ? fmtUptime(metrics.online_uptime_seconds)
              : metrics?.running
                ? t("server_warming_up")
                : "—"
          }
          testId={`metric-uptime-${server.folder_name}`}
        />
      </div>

      {/* Vitals row 2 — RAM / disk / last update */}
      <div className="grid grid-cols-3 gap-2 mb-5">
        <MetricTile
          icon={Activity}
          label="RAM"
          value={metrics?.running && metrics.memory_mb ? `${Math.round(metrics.memory_mb)} MB` : "—"}
          testId={`metric-ram-${server.folder_name}`}
        />
        <MetricTile
          icon={HardDrive}
          label={t("disk") || "DISK"}
          value={metrics?.installed_size_gb ? fmtGb(metrics.installed_size_gb) : "—"}
          testId={`metric-disk-${server.folder_name}`}
        />
        <MetricTile
          icon={Clock}
          label={t("last_update") || "LAST UPDATE"}
          value={fmtDate(metrics?.last_updated_iso)}
          small
          testId={`metric-lastupdate-${server.folder_name}`}
        />
      </div>

      {/* Path & Ports */}
      <div className="border-t border-brand pt-3 mb-4 space-y-2">
        <div>
          <div className="label-overline mb-1">{t("server_files_path")}</div>
          <div className="font-mono text-[11px] text-dim truncate" title={server.folder_path}>
            {server.folder_path}
          </div>
        </div>
        <div className="flex items-center gap-3 font-mono text-[11px]">
          <Network size={11} className="text-muted" />
          <span className="text-muted">PORT</span>
          <span className="text-brand">{gamePort}</span>
          <span className="text-muted">·</span>
          <span className="text-muted">QUERY</span>
          <span className="text-brand">{queryPort}</span>
          <span className="text-muted ml-auto text-[10px]">Ayarlar → Temel</span>
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-2">
        {!server.installed && (
          <button
            className="btn-primary flex-1 flex items-center justify-center gap-2"
            onClick={(e) => { e.stopPropagation(); onInstall?.(server); }}
            disabled={busy || server.status === "Installing"}
            data-testid={`card-install-${server.folder_name}`}
          >
            <Download size={13} /> {server.status === "Installing" ? t("installing") : t("install_server")}
          </button>
        )}

        {server.installed && !processAlive && (
          <button
            className="btn-primary flex-1 flex items-center justify-center gap-2"
            onClick={(e) => { e.stopPropagation(); onStart?.(server); }}
            disabled={busy}
            data-testid={`card-start-${server.folder_name}`}
          >
            <Play size={13} /> {t("start")}
          </button>
        )}

        {isStarting && (
          <button
            className="btn-primary flex-1 flex items-center justify-center gap-2"
            disabled
            data-testid={`card-starting-${server.folder_name}`}
            style={{ background: "var(--warning)", color: "var(--bg-deep)" }}
          >
            <Activity size={13} className="animate-pulse" /> {t("server_status_starting")}
          </button>
        )}

        {(isRunning || isStarting) && (
          <button
            className="btn-danger flex-1 flex items-center justify-center gap-2"
            onClick={(e) => { e.stopPropagation(); onStop?.(server); }}
            disabled={busy}
            data-testid={`card-stop-${server.folder_name}`}
          >
            <Square size={13} /> {t("stop")}
          </button>
        )}

        {(isRunning || isStarting) && (
          <button
            className="btn-secondary flex items-center justify-center gap-2 px-3"
            onClick={async (e) => {
              e.stopPropagation();
              try {
                const updated = await endpoints.restartServer(server.id);
                onChange?.(updated);
              } catch (err) {
                // non-fatal; parent toast will surface backend failures on next poll
              }
            }}
            disabled={busy}
            title={t("restart")}
            data-testid={`card-restart-${server.folder_name}`}
          >
            <RotateCw size={13} />
          </button>
        )}

        {server.installed && (
          <button
            className={`btn-secondary flex items-center justify-center gap-2 px-3 ${server.update_available ? "update-pulse" : ""}`}
            onClick={(e) => { e.stopPropagation(); onUpdate?.(server); }}
            disabled={busy || processAlive}
            title={t("card_btn_update")}
            data-testid={`card-update-${server.folder_name}`}
          >
            <ChevronsUp size={15} strokeWidth={2.5} />
          </button>
        )}

        <button
          className="btn-secondary flex items-center justify-center gap-2 px-3"
          onClick={(e) => { e.stopPropagation(); onOpen?.(server); }}
          data-testid={`card-open-${server.folder_name}`}
          title={t("nav_configs")}
          disabled={!server.installed}
          style={!server.installed ? { opacity: 0.35, cursor: "not-allowed" } : undefined}
        >
          <Settings size={13} />
        </button>
      </div>
    </div>
  );
};

const MetricTile = ({ icon: Icon, label, value, small, testId }) => (
  <div className="border border-brand bg-bg-deep px-3 py-2.5" data-testid={testId}>
    <div className="flex items-center gap-1.5 mb-1">
      <Icon size={11} className="text-muted" />
      <span className="label-overline">{label}</span>
    </div>
    <div className={`font-mono ${small ? "text-[10px]" : "text-sm"} text-brand truncate`} title={String(value)}>
      {value}
    </div>
  </div>
);
