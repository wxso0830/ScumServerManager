import React from "react";
import {
  Play, Square, Download, RefreshCw, Settings, Trash2, Users, Cpu, Activity, Server as ServerIcon,
} from "lucide-react";
import { useI18n } from "../providers/I18nProvider";

const STATUS_META = {
  Running:   { cls: "running",    label: "server_status_running",    color: "var(--success)" },
  Stopped:   { cls: "stopped",    label: "server_status_stopped",    color: "var(--text-muted)" },
  Updating:  { cls: "updating",   label: "server_status_updating",   color: "var(--warning)" },
  Installing:{ cls: "installing", label: "installing",               color: "var(--accent)" },
};

export const ServerCard = ({ server, onOpen, onStart, onStop, onUpdate, onInstall, onDelete, busy }) => {
  const { t } = useI18n();
  const status = STATUS_META[server.status] || STATUS_META.Stopped;
  const isRunning = server.status === "Running";
  const maxPlayers = server.settings?.srv_general?.["scum.MaxPlayers"] ?? 64;

  return (
    <div
      className="server-card group"
      data-testid={`server-card-${server.folder_name}`}
    >
      {/* Header row */}
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

      {/* Vitals grid */}
      <div className="grid grid-cols-3 gap-2 mb-5">
        <div className="border border-brand bg-bg-deep px-3 py-2.5">
          <div className="flex items-center gap-1.5 mb-1">
            <Users size={11} className="text-muted" />
            <span className="label-overline">{t("players")}</span>
          </div>
          <div className="font-mono text-sm text-brand">0/{maxPlayers}</div>
        </div>
        <div className="border border-brand bg-bg-deep px-3 py-2.5">
          <div className="flex items-center gap-1.5 mb-1">
            <Cpu size={11} className="text-muted" />
            <span className="label-overline">CPU</span>
          </div>
          <div className="font-mono text-sm text-brand">{isRunning ? "12%" : "—"}</div>
        </div>
        <div className="border border-brand bg-bg-deep px-3 py-2.5">
          <div className="flex items-center gap-1.5 mb-1">
            <Activity size={11} className="text-muted" />
            <span className="label-overline">{t("uptime")}</span>
          </div>
          <div className="font-mono text-sm text-brand">{isRunning ? "00:14" : "—"}</div>
        </div>
      </div>

      {/* Path */}
      <div className="border-t border-brand pt-3 mb-4">
        <div className="label-overline mb-1">{t("server_files_path")}</div>
        <div className="font-mono text-[11px] text-dim truncate" title={server.folder_path}>
          {server.folder_path}
        </div>
      </div>

      {/* Action Grid */}
      <div className="flex gap-2">
        {!server.installed && (
          <button
            className="btn-primary flex-1 flex items-center justify-center gap-2"
            onClick={(e) => { e.stopPropagation(); onInstall?.(server); }}
            disabled={busy}
            data-testid={`card-install-${server.folder_name}`}
          >
            <Download size={13} /> {t("install_server")}
          </button>
        )}

        {server.installed && !isRunning && (
          <button
            className="btn-primary flex-1 flex items-center justify-center gap-2"
            onClick={(e) => { e.stopPropagation(); onStart?.(server); }}
            disabled={busy}
            data-testid={`card-start-${server.folder_name}`}
          >
            <Play size={13} /> {t("start")}
          </button>
        )}

        {isRunning && (
          <button
            className="btn-danger flex-1 flex items-center justify-center gap-2"
            onClick={(e) => { e.stopPropagation(); onStop?.(server); }}
            disabled={busy}
            data-testid={`card-stop-${server.folder_name}`}
          >
            <Square size={13} /> {t("stop")}
          </button>
        )}

        {server.installed && (
          <button
            className="btn-secondary flex items-center justify-center gap-2 px-3"
            onClick={(e) => { e.stopPropagation(); onUpdate?.(server); }}
            disabled={busy || isRunning}
            title={t("update_server")}
            data-testid={`card-update-${server.folder_name}`}
          >
            <RefreshCw size={13} />
          </button>
        )}

        <button
          className="btn-secondary flex items-center justify-center gap-2 px-3"
          onClick={(e) => { e.stopPropagation(); onOpen?.(server); }}
          data-testid={`card-open-${server.folder_name}`}
          title={t("nav_configs")}
        >
          <Settings size={13} />
        </button>
      </div>
    </div>
  );
};
