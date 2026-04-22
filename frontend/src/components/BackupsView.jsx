import React, { useEffect, useMemo, useState } from "react";
import { Archive, Download, RefreshCw, Save, Trash2, Upload, AlertTriangle, Clock, HardDrive, Timer, Info } from "lucide-react";
import { toast } from "sonner";
import { endpoints, API } from "../lib/api";
import { useI18n } from "../providers/I18nProvider";


const TYPE_META = {
  manual:      { label: "backup_type_manual",      color: "var(--info)" },
  auto:        { label: "backup_type_auto",        color: "var(--text-dim)" },
  crash:       { label: "backup_type_crash",       color: "var(--danger)" },
  pre_restore: { label: "backup_type_pre_restore", color: "var(--warning)" },
};


const fmtTs = (iso) => {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    return d.toLocaleString(undefined, { dateStyle: "short", timeStyle: "medium" });
  } catch { return iso; }
};


/**
 * DiskUsageStrip — at-a-glance "how much disk are my backups eating?" bar.
 *
 * Breaks the total size into THREE stacked segments by type:
 *  - manual + pre_restore → PROTECTED (can't be auto-pruned)
 *  - auto                 → PRUNEABLE (will be trimmed to keep-count)
 *  - crash                → emergency captures (kept around)
 *
 * Color bands switch from green → yellow → red as total grows to give a
 * visual "hey, review old backups" cue without needing a hard quota check
 * (the actual disk quota varies per host and belongs in host-side tooling).
 */
const DiskUsageStrip = ({ data, t }) => {
  const seg = useMemo(() => {
    const sums = { protected: 0, prune: 0, crash: 0 };
    let protectedCount = 0, pruneCount = 0, crashCount = 0;
    for (const b of data.backups || []) {
      if (b.backup_type === "manual" || b.backup_type === "pre_restore") {
        sums.protected += b.size_bytes;
        protectedCount += 1;
      } else if (b.backup_type === "crash") {
        sums.crash += b.size_bytes;
        crashCount += 1;
      } else {
        sums.prune += b.size_bytes;
        pruneCount += 1;
      }
    }
    return { sums, protectedCount, pruneCount, crashCount };
  }, [data.backups]);

  const totalMb = data.total_size_mb || 0;
  // Soft thresholds (MB) — purely visual cues
  const tier = totalMb < 2000 ? "green" : totalMb < 10000 ? "yellow" : "red";
  const tierColor = tier === "green" ? "var(--success)" : tier === "yellow" ? "var(--warning)" : "var(--danger)";

  const total = seg.sums.protected + seg.sums.prune + seg.sums.crash;
  const pct = (n) => (total === 0 ? 0 : (n / total) * 100);

  return (
    <div
      className="bg-surface border-b border-brand px-6 py-2.5"
      data-testid="backups-disk-strip"
    >
      <div className="flex items-center gap-3 mb-1.5">
        <span className="label-overline text-info">{t("disk_usage")}</span>
        <span className="font-mono text-xs" style={{ color: tierColor }}>
          {totalMb.toFixed(1)} MB
        </span>
        <div className="flex-1" />
        <div className="flex items-center gap-3 text-[10px] font-mono uppercase tracking-widest">
          <span style={{ color: "var(--info)" }}>
            ● {seg.protectedCount} {t("disk_protected")}
          </span>
          {seg.crashCount > 0 && (
            <span style={{ color: "var(--danger)" }}>
              ● {seg.crashCount} {t("disk_crash")}
            </span>
          )}
          <span className="text-dim">● {seg.pruneCount} {t("disk_pruneable")}</span>
        </div>
      </div>
      <div className="flex h-1.5 w-full overflow-hidden border border-brand" data-testid="backups-disk-bar">
        {seg.sums.protected > 0 && (
          <div
            className="h-full"
            style={{ width: `${pct(seg.sums.protected)}%`, background: "var(--info)" }}
            title={`${t("disk_protected")}: ${(seg.sums.protected / (1024 * 1024)).toFixed(1)} MB`}
          />
        )}
        {seg.sums.crash > 0 && (
          <div
            className="h-full"
            style={{ width: `${pct(seg.sums.crash)}%`, background: "var(--danger)" }}
            title={`${t("disk_crash")}: ${(seg.sums.crash / (1024 * 1024)).toFixed(1)} MB`}
          />
        )}
        {seg.sums.prune > 0 && (
          <div
            className="h-full"
            style={{ width: `${pct(seg.sums.prune)}%`, background: "var(--text-dim)", opacity: 0.55 }}
            title={`${t("disk_pruneable")}: ${(seg.sums.prune / (1024 * 1024)).toFixed(1)} MB`}
          />
        )}
        {total === 0 && (
          <div className="h-full w-full" style={{ background: "transparent" }} />
        )}
      </div>
    </div>
  );
};

/**
 * AutoSavePanel — inline auto-save settings on the Backups page. Writes to
 * the server's automation object (backup_enabled / backup_interval_min /
 * backup_keep_count) via the existing PUT /automation endpoint. Uses local
 * draft + explicit "Save" button so a mistyped interval doesn't immediately
 * reconfigure the scheduler.
 */
const AutoSavePanel = ({ server }) => {
  const { t } = useI18n();
  const automation = server.automation || {};
  const [enabled, setEnabled] = useState(automation.backup_enabled ?? true);
  const [interval, setIntervalMin] = useState(automation.backup_interval_min ?? 120);
  const [keep, setKeep] = useState(automation.backup_keep_count ?? 30);
  const [saving, setSaving] = useState(false);

  const dirty =
    enabled !== (automation.backup_enabled ?? true) ||
    interval !== (automation.backup_interval_min ?? 120) ||
    keep !== (automation.backup_keep_count ?? 30);

  const handleSave = async () => {
    setSaving(true);
    try {
      await endpoints.updateAutomation(server.id, {
        backup_enabled: enabled,
        backup_interval_min: interval,
        backup_keep_count: keep,
      });
      toast.success(t("toast_settings_saved"));
    } catch (e) {
      toast.error(e.response?.data?.detail || e.message);
    } finally { setSaving(false); }
  };

  return (
    <div className="bg-surface border-b border-brand px-6 py-4" data-testid="auto-save-panel">
      <div className="flex items-center gap-3 mb-3">
        <Timer size={14} className="text-accent-brand" />
        <span className="heading-stencil text-sm">{t("auto_backup_title")}</span>
        <label className="flex items-center gap-2 ml-auto cursor-pointer select-none" data-testid="auto-backup-toggle">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => setEnabled(e.target.checked)}
            className="w-4 h-4 accent-[var(--accent)]"
          />
          <span className="text-xs text-brand">{t("auto_backup_enabled")}</span>
        </label>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
        <div>
          <label className="label-overline block mb-1">{t("auto_backup_interval")}</label>
          <input
            type="number"
            min={1}
            max={1440}
            className="input-field text-xs"
            value={interval}
            onChange={(e) => setIntervalMin(Math.max(1, parseInt(e.target.value || 120, 10)))}
            data-testid="auto-backup-interval-input"
          />
        </div>
        <div>
          <label className="label-overline block mb-1">{t("auto_backup_keep")}</label>
          <input
            type="number"
            min={3}
            max={500}
            className="input-field text-xs"
            value={keep}
            onChange={(e) => setKeep(Math.max(3, parseInt(e.target.value || 30, 10)))}
            data-testid="auto-backup-keep-input"
          />
        </div>
        <div className="flex justify-end">
          <button
            className="btn-primary text-xs"
            onClick={handleSave}
            disabled={!dirty || saving}
            data-testid="auto-backup-save-btn"
          >
            {saving ? t("backup_creating") : t("save")}
          </button>
        </div>
      </div>
      <p className="text-[10px] text-dim flex items-start gap-1.5 mt-2">
        <Info size={10} className="mt-0.5 shrink-0 text-accent-brand" />
        {t("auto_backup_hint")}
      </p>
    </div>
  );
};



export const BackupsView = ({ servers = [] }) => {
  const { t } = useI18n();
  const [serverId, setServerId] = useState(servers[0]?.id || "");
  const [data, setData] = useState({ count: 0, total_size_mb: 0, backups: [] });
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(null);       // action in progress: "create" | "restore:<id>" | "delete:<id>"
  const [confirm, setConfirm] = useState(null); // {action, backup}

  useEffect(() => {
    if (servers.length && !servers.find((s) => s.id === serverId)) {
      setServerId(servers[0]?.id || "");
    }
  }, [servers, serverId]);

  const activeServer = useMemo(() => servers.find((s) => s.id === serverId), [servers, serverId]);
  const isRunning = activeServer?.status === "Running" || activeServer?.status === "Starting";

  const load = async () => {
    if (!serverId) return;
    setLoading(true);
    try {
      const r = await endpoints.listBackups(serverId);
      setData(r);
    } catch (e) {
      toast.error(e.response?.data?.detail || e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [serverId]);

  // Auto-refresh while a backup is in progress (shows newly-created entries
  // without requiring a manual reload).
  useEffect(() => {
    if (!busy) return;
    const t = setInterval(load, 3000);
    return () => clearInterval(t);
    // eslint-disable-next-line
  }, [busy]);

  const handleCreate = async () => {
    setBusy("create");
    toast(t("backup_creating"));
    try {
      const r = await endpoints.createBackup(serverId, "manual");
      toast.success(`${t("backup_created")} · ${r.info?.size_mb ?? 0} MB`);
      await load();
    } catch (e) {
      toast.error(e.response?.data?.detail || e.message);
    } finally { setBusy(null); }
  };

  const handleRestore = async (b) => {
    setBusy(`restore:${b.id}`);
    toast(t("backup_restoring"));
    try {
      await endpoints.restoreBackup(serverId, b.id);
      toast.success(t("backup_restored"));
      await load();
    } catch (e) {
      toast.error(e.response?.data?.detail || e.message);
    } finally { setBusy(null); setConfirm(null); }
  };

  const handleDelete = async (b) => {
    setBusy(`delete:${b.id}`);
    try {
      await endpoints.deleteBackup(serverId, b.id);
      toast.success(t("backup_deleted"));
      await load();
    } catch (e) {
      toast.error(e.response?.data?.detail || e.message);
    } finally { setBusy(null); setConfirm(null); }
  };

  if (!servers.length) {
    return (
      <div className="flex-1 p-12 text-center">
        <Archive size={48} className="mx-auto text-dim mb-4" />
        <h3 className="heading-stencil text-xl mb-2">{t("no_servers_yet")}</h3>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col bg-bg-deep overflow-hidden">
      {/* Top bar */}
      <div className="bg-surface border-b border-brand px-6 py-4 flex items-center gap-3 flex-wrap">
        <h2 className="heading-stencil text-lg flex items-center gap-2">
          <Archive size={16} className="text-accent-brand" />
          {t("nav_backups")}
        </h2>
        <select
          className="input-field text-xs"
          value={serverId}
          onChange={(e) => setServerId(e.target.value)}
          data-testid="backups-server-select"
        >
          {servers.map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>
        <div className="text-[10px] font-mono uppercase tracking-widest text-dim">
          <HardDrive size={11} className="inline mr-1" />
          {data.count} {t("backups_count")} · {data.total_size_mb} MB
        </div>
        <div className="flex-1" />
        <button
          className="btn-primary flex items-center gap-2"
          onClick={handleCreate}
          disabled={busy === "create"}
          data-testid="backup-create-btn"
        >
          <Save size={13} />
          {busy === "create" ? t("backup_creating") : t("backup_create_now")}
        </button>
        <button className="icon-btn" onClick={load} title={t("refresh_now")} data-testid="backups-refresh-btn">
          <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
        </button>
      </div>

      {/* Disk usage strip — visualizes how much space backups consume + how
          many are protected from auto-prune. Gives admin an at-a-glance read
          on "am I about to run out of disk?" */}
      <DiskUsageStrip data={data} t={t} />

      {/* Auto-Save settings panel — admin configures silent background snapshot
          interval. The scheduler reads this and snapshots SaveFiles using the
          SQLite online-backup API, so players never feel a freeze. */}
      {activeServer && (
        <AutoSavePanel
          key={activeServer.id}
          server={activeServer}
        />
      )}

      {/* Running-state warning strip */}
      {isRunning && (
        <div
          className="bg-surface border-b border-warning px-6 py-2 flex items-center gap-2 text-[11px] font-mono text-warning"
          data-testid="backups-running-warning"
        >
          <AlertTriangle size={12} />
          <span>{t("backups_running_warning")}</span>
        </div>
      )}

      {/* Table */}
      <div className="flex-1 overflow-y-auto scrollbar-thin">
        {data.backups.length === 0 ? (
          <div className="p-12 text-center">
            <Archive size={40} className="mx-auto text-dim mb-4" />
            <h3 className="heading-stencil text-lg mb-2">{t("backups_empty_title")}</h3>
            <p className="text-xs text-dim max-w-md mx-auto leading-relaxed">{t("backups_empty_hint")}</p>
          </div>
        ) : (
          <table className="w-full text-xs font-mono" data-testid="backups-table">
            <thead className="bg-bg border-b-2 border-brand sticky top-0">
              <tr className="text-left">
                <th className="label-overline px-4 py-3">{t("backup_col_created")}</th>
                <th className="label-overline px-4 py-3">{t("backup_col_type")}</th>
                <th className="label-overline px-4 py-3">{t("backup_col_filename")}</th>
                <th className="label-overline px-4 py-3 text-right">{t("backup_col_size")}</th>
                <th className="label-overline px-4 py-3 text-right">{t("backup_col_actions")}</th>
              </tr>
            </thead>
            <tbody>
              {data.backups.map((b) => {
                const meta = TYPE_META[b.backup_type] || TYPE_META.manual;
                return (
                  <tr key={b.id} className="border-b border-brand hover:bg-surface-2 transition-colors" data-testid={`backup-row-${b.id}`}>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <Clock size={10} className="inline mr-1.5 text-dim" />
                      {fmtTs(b.created_at)}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className="px-2 py-0.5 border text-[10px] uppercase tracking-widest"
                        style={{ color: meta.color, borderColor: meta.color, background: `${meta.color}14` }}
                      >
                        {t(meta.label)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-dim truncate max-w-md" title={b.filename}>{b.filename}</td>
                    <td className="px-4 py-3 text-right text-brand">{b.size_mb.toFixed(1)} MB</td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center gap-1.5 justify-end">
                        <a
                          href={endpoints.downloadBackupUrl(serverId, b.id)}
                          className="icon-btn"
                          title={t("backup_download")}
                          data-testid={`backup-download-${b.id}`}
                        >
                          <Download size={12} />
                        </a>
                        <button
                          className="icon-btn"
                          onClick={() => setConfirm({ action: "restore", backup: b })}
                          disabled={isRunning || busy !== null}
                          title={isRunning ? t("backups_running_warning") : t("backup_restore")}
                          data-testid={`backup-restore-${b.id}`}
                          style={{ color: "var(--warning)" }}
                        >
                          <Upload size={12} />
                        </button>
                        <button
                          className="icon-btn"
                          onClick={() => setConfirm({ action: "delete", backup: b })}
                          disabled={busy !== null}
                          title={t("backup_delete")}
                          data-testid={`backup-delete-${b.id}`}
                          style={{ color: "var(--danger)" }}
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Confirm dialog */}
      {confirm && (
        <div
          className="fixed inset-0 bg-black/70 flex items-center justify-center z-50"
          onClick={() => !busy && setConfirm(null)}
          data-testid="backup-confirm-overlay"
        >
          <div
            className="bg-surface border-2 border-brand p-6 max-w-md"
            onClick={(e) => e.stopPropagation()}
            style={{ borderColor: confirm.action === "restore" ? "var(--warning)" : "var(--danger)" }}
          >
            <h3 className="heading-stencil text-lg mb-3 flex items-center gap-2">
              <AlertTriangle size={16} style={{ color: confirm.action === "restore" ? "var(--warning)" : "var(--danger)" }} />
              {confirm.action === "restore" ? t("backup_confirm_restore_title") : t("backup_confirm_delete_title")}
            </h3>
            <p className="text-xs text-dim mb-4 leading-relaxed">
              {confirm.action === "restore" ? t("backup_confirm_restore_body") : t("backup_confirm_delete_body")}
            </p>
            <div className="bg-bg p-3 mb-4 font-mono text-[11px] border border-brand">
              <div className="text-brand">{confirm.backup.filename}</div>
              <div className="text-dim mt-1">
                {fmtTs(confirm.backup.created_at)} · {confirm.backup.size_mb.toFixed(1)} MB
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <button className="btn-secondary" onClick={() => setConfirm(null)} disabled={busy !== null}>
                {t("cancel")}
              </button>
              <button
                className={confirm.action === "restore" ? "btn-primary" : "btn-danger"}
                onClick={() => (confirm.action === "restore" ? handleRestore(confirm.backup) : handleDelete(confirm.backup))}
                disabled={busy !== null}
                data-testid="backup-confirm-go"
              >
                {busy ? t("backup_working") : t("backup_confirm_go")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
