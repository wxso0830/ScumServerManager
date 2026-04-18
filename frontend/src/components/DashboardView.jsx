import React, { useMemo, useState } from "react";
import { Plus, ShieldAlert, Server, Play, Square, Activity, RefreshCw, RotateCcw, Download } from "lucide-react";
import { useI18n } from "../providers/I18nProvider";
import { toast } from "sonner";
import { ServerCard } from "./ServerCard";
import { ConfirmModal } from "./ConfirmModal";
import { InstallProgressModal } from "./InstallProgressModal";
import { endpoints, api } from "../lib/api";

export const DashboardView = ({ servers, managerPath, onAdd, onOpen, onChange, onDelete, onRefresh }) => {
  const { t } = useI18n();
  const [confirmDel, setConfirmDel] = useState(null);
  const [checking, setChecking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [installTarget, setInstallTarget] = useState(null);

  const running = useMemo(() => servers.filter((s) => s.status === "Running").length, [servers]);
  const stopped = useMemo(() => servers.filter((s) => s.status !== "Running").length, [servers]);

  const handleInstall = async (server) => {
    try {
      // Kick off install (backend spawns SteamCMD in background thread)
      const updated = await endpoints.installServer(server.id);
      onChange(updated);
      setInstallTarget(updated);    // open modal — it polls progress
    } catch (e) { toast.error(String(e.message || e)); }
  };

  const handleInstallDone = async (success) => {
    try {
      if (success && installTarget) {
        // Refresh server doc (backend updates installed=true on completion)
        const fresh = await endpoints.getServer(installTarget.id);
        try { await endpoints.postInstall(fresh.id); } catch (_) {}
        onChange(fresh);
        toast.success(t("install_complete"));
      } else if (installTarget) {
        const fresh = await endpoints.getServer(installTarget.id);
        onChange(fresh);
        toast.error("Kurulum başarısız oldu. Log'u kontrol edin.");
      }
    } catch {}
  };

  const handleStart = async (server) => {
    try {
      const updated = await endpoints.startServer(server.id);
      onChange(updated);
      toast.success(t("toast_server_started"));
    } catch (e) { toast.error(String(e.message || e)); }
  };

  const handleStop = async (server) => {
    try {
      const updated = await endpoints.stopServer(server.id);
      onChange(updated);
      toast(t("toast_server_stopped"));
    } catch (e) { toast.error(String(e.message || e)); }
  };

  const handleUpdate = async (server) => {
    try {
      const updated = await endpoints.updateServer(server.id);
      onChange(updated);
      toast.success(t("update_server"));
      setTimeout(async () => {
        try {
          const done = await api.post(`/servers/${server.id}/update/complete`);
          onChange(done.data);
        } catch (_) {}
      }, 1500);
    } catch (e) { toast.error(String(e.message || e)); }
  };

  const requestDelete = (id) => {
    const server = servers.find((s) => s.id === id);
    if (server) setConfirmDel(server);
  };

  const handleCheckUpdate = async () => {
    setChecking(true);
    try {
      const info = await endpoints.steamCheckUpdate();
      toast.success(`${t("latest_build")}: ${info.latest_build_id.slice(0, 20)}`);
      onRefresh?.();
    } catch (e) { toast.error(String(e.message || e)); }
    finally { setChecking(false); }
  };

  const handleStartAll = async () => {
    if (busy) return;
    setBusy(true);
    const stoppedList = servers.filter((s) => s.status !== "Running" && s.installed);
    toast.success(`${t("starting_all")} · ${stoppedList.length}`);
    for (const s of stoppedList) { try { await endpoints.startServer(s.id); } catch (_) {} }
    onRefresh?.(); setBusy(false);
  };

  const handleRestartAll = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const r = await endpoints.restartAllServers();
      toast.success(`${t("restart_all")} · ${r.restarted}`);
      onRefresh?.();
    } finally { setBusy(false); }
  };

  const handleStopAll = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const r = await endpoints.stopAllServers();
      toast(`${t("stop_all")} · ${r.stopped}`);
      onRefresh?.();
    } finally { setBusy(false); }
  };

  const handleUpdateAll = async () => {
    if (busy) return;
    setBusy(true);
    toast(`${t("updating_all")} · ${servers.length}`);
    for (const s of servers) { try { await endpoints.updateServer(s.id); } catch (_) {} }
    onRefresh?.();
    toast.success(t("toast_update_done"));
    setBusy(false);
  };

  return (
    <div className="flex-1 overflow-y-auto scrollbar-thin bg-bg relative" data-testid="dashboard-view">
      <div className="boot-scan" />

      {/* Hero Command Bar */}
      <div className="relative border-b border-brand bg-bg-deep overflow-hidden">
        <div
          className="absolute inset-0 opacity-[0.04] pointer-events-none"
          style={{
            backgroundImage:
              "linear-gradient(var(--border-strong) 1px, transparent 1px), linear-gradient(90deg, var(--border-strong) 1px, transparent 1px)",
            backgroundSize: "32px 32px",
          }}
        />
        <div className="relative px-8 py-8 flex items-end justify-between gap-6">
          <div>
            <div className="label-accent mb-2">{t("nav_fleet")}</div>
            <h1 className="heading-stencil text-3xl lg:text-4xl">
              {t("nav_dashboard")}
            </h1>
            <p className="text-dim text-sm mt-2 max-w-lg">
              {t("deploy_subtitle")}
            </p>
            {servers.length > 0 && (
              <div className="mt-4 flex items-center gap-2 flex-wrap" data-testid="dashboard-global-actions">
                <button className="btn-primary flex items-center gap-2" onClick={handleStartAll} disabled={busy || servers.length === 0} data-testid="start-all-btn">
                  <Play size={13} /> {t("start_all")}
                </button>
                <button className="btn-secondary flex items-center gap-2" onClick={handleRestartAll} disabled={busy || servers.length === 0} data-testid="restart-all-btn">
                  <RotateCcw size={13} /> {t("restart_all")}
                </button>
                <button className="btn-danger flex items-center gap-2" onClick={handleStopAll} disabled={busy || running === 0} data-testid="stop-all-btn">
                  <Square size={13} /> {t("stop_all")}
                </button>
                <button className="btn-secondary flex items-center gap-2" onClick={handleUpdateAll} disabled={busy || servers.length === 0} data-testid="update-all-servers-btn">
                  <Download size={13} /> {t("update_all_servers")}
                </button>
                <div className="w-px h-7 bg-brand mx-1" />
                <button
                  onClick={handleCheckUpdate}
                  disabled={checking}
                  className="btn-ghost flex items-center gap-2"
                  data-testid="dashboard-check-update-btn"
                >
                  <RefreshCw size={12} className={checking ? "animate-spin" : ""} />
                  {t("check_now")}
                </button>
              </div>
            )}
          </div>

          {/* Big stat tiles */}
          <div className="flex items-stretch gap-3">
            <StatTile icon={Server} label={t("fleet_total")} value={servers.length} accent />
            <StatTile icon={Play} label={t("fleet_online")} value={running} color="var(--success)" />
            <StatTile icon={Square} label={t("fleet_offline")} value={stopped} color="var(--text-muted)" />
            <button
              onClick={onAdd}
              data-testid="deploy-new-server-btn"
              className="flex flex-col items-stretch min-w-[180px] border border-accent-brand bg-accent-soft hover:bg-accent-brand hover:text-bg-deep transition-colors group"
            >
              <div className="px-4 pt-3 flex items-center gap-2">
                <Plus size={16} className="text-accent-brand group-hover:text-bg-deep" />
                <span className="label-accent group-hover:text-bg-deep">{t("deploy_subtitle")}</span>
              </div>
              <div className="px-4 pb-3 pt-1 heading-stencil text-sm group-hover:text-bg-deep">
                {t("deploy_new_server")}
              </div>
            </button>
          </div>
        </div>
      </div>

      {/* Admin warning banner */}
      {!managerPath && (
        <div className="mx-8 mt-6 p-4 border border-danger flex items-center gap-3 bg-danger/5" style={{ borderColor: "var(--danger)" }}>
          <ShieldAlert size={18} className="text-danger" />
          <span className="text-danger font-mono text-xs uppercase tracking-wider">
            Workspace not configured · complete disk selection first
          </span>
        </div>
      )}

      {/* Server grid */}
      {servers.length === 0 ? (
        <EmptyFleet onAdd={onAdd} t={t} />
      ) : (
        <div className="p-8">
          <div className="flex items-center gap-3 mb-5">
            <Activity size={14} className="text-accent-brand" />
            <div className="label-accent">{t("action_grid")}</div>
            <div className="flex-1 h-px bg-brand" />
            <div className="font-mono text-[11px] text-dim">
              {servers.length} UNIT{servers.length !== 1 ? "S" : ""}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
            {servers.map((s) => (
              <ServerCard
                key={s.id}
                server={s}
                onOpen={onOpen}
                onStart={handleStart}
                onStop={handleStop}
                onUpdate={handleUpdate}
                onInstall={handleInstall}
                onDelete={requestDelete}
              />
            ))}
          </div>
        </div>
      )}

      <ConfirmModal
        open={!!confirmDel}
        title={t("confirm_delete_title")}
        body={t("confirm_delete_body", { name: confirmDel?.name || "" })}
        confirmLabel={t("confirm_yes_delete")}
        cancelLabel={t("cancel")}
        onCancel={() => setConfirmDel(null)}
        onConfirm={() => { const id = confirmDel?.id; setConfirmDel(null); if (id) onDelete(id); }}
        testId="dashboard-delete-modal"
      />

      <InstallProgressModal
        open={!!installTarget}
        server={installTarget}
        onClose={() => setInstallTarget(null)}
        onDone={handleInstallDone}
      />
    </div>
  );
};

const StatTile = ({ icon: Icon, label, value, color, accent }) => (
  <div
    className="border border-brand bg-bg min-w-[140px] px-4 py-3 relative"
    style={accent ? { borderColor: "var(--accent)", background: "var(--accent-soft)" } : undefined}
  >
    <div className="flex items-center gap-2 mb-1">
      <Icon size={12} style={{ color: accent ? "var(--accent)" : color || "var(--text-dim)" }} />
      <span className="label-overline" style={accent ? { color: "var(--accent)" } : undefined}>{label}</span>
    </div>
    <div className="font-mono text-2xl text-brand" style={{ color: accent ? "var(--accent)" : color || "var(--text)" }}>
      {String(value).padStart(2, "0")}
    </div>
  </div>
);

const EmptyFleet = ({ onAdd, t }) => (
  <div className="p-16 flex items-center justify-center" data-testid="empty-fleet">
    <div className="text-center max-w-lg">
      <div
        className="mx-auto h-24 w-24 flex items-center justify-center border-2 border-accent-brand mb-6 relative corner-brackets-full"
        style={{ background: "var(--accent-soft)" }}
      >
        <span className="cbr-tr" />
        <span className="cbr-bl" />
        <Server size={36} className="text-accent-brand" />
      </div>
      <div className="label-accent mb-2">{t("empty_workspace_title").toUpperCase()}</div>
      <h2 className="heading-stencil text-2xl mb-3">{t("empty_workspace_title")}</h2>
      <p className="text-dim text-sm leading-relaxed mb-8">{t("no_servers_subtitle")}</p>
      <button onClick={onAdd} data-testid="empty-add-server-button" className="btn-primary inline-flex items-center gap-2">
        <Plus size={14} /> {t("deploy_first_server")}
      </button>
    </div>
  </div>
);
