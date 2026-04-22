import React, { useMemo, useState } from "react";
import { Plus, Trash2, Clock, RefreshCw, CheckCircle2, AlertCircle, Sparkles, FileJson, Info, Archive } from "lucide-react";
import { toast } from "sonner";
import { useI18n } from "../providers/I18nProvider";
import { endpoints } from "../lib/api";

const isValidTime = (s) => /^\d{2}:\d{2}$/.test(s || "") && (() => {
  const [h, m] = s.split(":").map(Number);
  return h >= 0 && h < 24 && m >= 0 && m < 60;
})();

const TimeSlot = ({ value, onChange, onRemove, idx }) => (
  <div className="flex items-center gap-2" data-testid={`restart-time-slot-${idx}`}>
    <Clock size={13} className="text-accent-brand" />
    <input
      type="time"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="input-field max-w-[140px]"
      data-testid={`restart-time-input-${idx}`}
    />
    <button className="icon-btn" onClick={onRemove} title="Remove" data-testid={`restart-time-remove-${idx}`}>
      <Trash2 size={14} />
    </button>
  </div>
);

export const AutomationEditor = ({ server, onChange }) => {
  const { t } = useI18n();
  const automation = server.automation || {};
  const [draft, setDraft] = useState({
    enabled: !!automation.enabled,
    restart_times: [...(automation.restart_times || [])],
    pre_warning_minutes: [...(automation.pre_warning_minutes || [15, 10, 5, 4, 3, 2, 1])],
    final_message_duration: automation.final_message_duration ?? 10,
    auto_update_enabled: !!automation.auto_update_enabled,
    update_check_interval_min: automation.update_check_interval_min ?? 360,
    bilingual: automation.bilingual ?? true,
  });
  const [preRaw, setPreRaw] = useState(draft.pre_warning_minutes.join(", "));
  const [busy, setBusy] = useState(false);
  const [checking, setChecking] = useState(false);
  const [steamInfo, setSteamInfo] = useState({ latest_build_id: "—", checked_at: null });
  const [showPreview, setShowPreview] = useState(false);

  const dirty = useMemo(() => JSON.stringify(automation) !== JSON.stringify(draft), [automation, draft]);

  const setField = (k, v) => setDraft((d) => ({ ...d, [k]: v }));

  const addTime = () => setField("restart_times", [...draft.restart_times, "06:00"]);
  const removeTime = (i) => setField("restart_times", draft.restart_times.filter((_, j) => j !== i));
  const updateTime = (i, v) => setField("restart_times", draft.restart_times.map((t, j) => (j === i ? v : t)));

  const clearTimes = () => setField("restart_times", []);

  const applyTemplate = (kind) => {
    if (kind === "every6h") setField("restart_times", ["00:00", "06:00", "12:00", "18:00"]);
    if (kind === "twiceDaily") setField("restart_times", ["06:00", "18:00"]);
  };

  const commitPreWarnings = () => {
    const parts = preRaw
      .split(/[,\s]+/)
      .map((x) => parseInt(x, 10))
      .filter((n) => Number.isFinite(n) && n > 0 && n <= 120);
    const uniq = [...new Set(parts)].sort((a, b) => b - a);
    setField("pre_warning_minutes", uniq);
    return uniq;
  };

  const handleSave = async () => {
    setBusy(true);
    try {
      const pre = commitPreWarnings();
      const payload = { ...draft, pre_warning_minutes: pre };
      const updated = await endpoints.updateAutomation(server.id, payload);
      onChange?.(updated);
      toast.success(t("toast_settings_saved"));
    } catch (e) {
      toast.error(String(e.response?.data?.detail || e.message));
    } finally { setBusy(false); }
  };

  const handleGenerate = async () => {
    setBusy(true);
    try {
      // Save automation first (so backend uses the latest values)
      const pre = commitPreWarnings();
      await endpoints.updateAutomation(server.id, { ...draft, pre_warning_minutes: pre });
      const updated = await endpoints.generateNotifications(server.id);
      onChange?.(updated);
      const count = (updated.settings?.notifications || []).length;
      toast.success(t("notifications_generated", { count }));
      setShowPreview(true);
    } catch (e) {
      toast.error(String(e.response?.data?.detail || e.message));
    } finally { setBusy(false); }
  };

  const handleCheckUpdate = async () => {
    setChecking(true);
    try {
      const info = await endpoints.steamCheckUpdate();
      setSteamInfo(info);
      toast.success(
        `${t("latest_build")}: ${info.latest_build_id.slice(0, 20)}`
      );
    } catch (e) {
      toast.error(String(e.response?.data?.detail || e.message));
    } finally { setChecking(false); }
  };

  const preview = server.settings?.notifications || [];

  const invalidTimes = draft.restart_times.filter((x) => !isValidTime(x));

  return (
    <div className="space-y-6" data-testid="automation-editor">
      {/* ===== Restart Schedule ===== */}
      <div className="panel corner-brackets">
        <div className="px-4 py-3 border-b border-brand flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Clock size={15} className="text-accent-brand" />
            <span className="heading-stencil text-sm">{t("restart_schedule")}</span>
          </div>
          <label className="flex items-center gap-2 cursor-pointer select-none" data-testid="automation-enabled-toggle">
            <input
              type="checkbox"
              checked={draft.enabled}
              onChange={(e) => setField("enabled", e.target.checked)}
              className="w-4 h-4 accent-[var(--accent)]"
            />
            <span className="text-sm text-brand">{t("automation_enabled")}</span>
          </label>
        </div>

        <div className="p-5 space-y-5">
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="label-accent">{t("restart_times")}</label>
              <div className="flex items-center gap-2">
                <button className="btn-ghost text-[10px]" onClick={() => applyTemplate("twiceDaily")} data-testid="template-twice-daily-btn">
                  <Sparkles size={11} className="inline mr-1" />
                  {t("apply_template_twice_daily")}
                </button>
                <button className="btn-ghost text-[10px]" onClick={() => applyTemplate("every6h")} data-testid="template-every-6h-btn">
                  <Sparkles size={11} className="inline mr-1" />
                  {t("apply_template_daily_6h")}
                </button>
                {draft.restart_times.length > 0 && (
                  <button className="btn-ghost text-[10px]" onClick={clearTimes} data-testid="clear-restart-times-btn">
                    {t("clear_restart_times")}
                  </button>
                )}
              </div>
            </div>
            <p className="text-xs text-dim mb-3">{t("restart_times_hint")}</p>
            <div className="flex flex-wrap gap-3">
              {draft.restart_times.map((val, idx) => (
                <TimeSlot
                  key={idx}
                  value={val}
                  onChange={(v) => updateTime(idx, v)}
                  onRemove={() => removeTime(idx)}
                  idx={idx}
                />
              ))}
              <button className="btn-secondary flex items-center gap-2" onClick={addTime} data-testid="add-restart-time-btn">
                <Plus size={13} /> {t("add_time_slot")}
              </button>
            </div>
            {invalidTimes.length > 0 && (
              <div className="mt-2 flex items-center gap-1 text-xs text-danger">
                <AlertCircle size={12} /> Invalid time(s): {invalidTimes.join(", ")}
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div>
              <label className="label-accent block mb-2">{t("pre_warning_minutes")}</label>
              <input
                className="input-field"
                value={preRaw}
                onChange={(e) => setPreRaw(e.target.value)}
                onBlur={commitPreWarnings}
                data-testid="pre-warning-input"
                placeholder="15, 10, 5, 4, 3, 2, 1"
              />
              <p className="text-xs text-dim mt-1">{t("pre_warning_hint")}</p>
            </div>

            <div>
              <label className="label-accent block mb-2">{t("final_message_duration")}</label>
              <input
                type="number"
                min={1}
                max={60}
                className="input-field"
                value={draft.final_message_duration}
                onChange={(e) => setField("final_message_duration", Math.max(1, parseInt(e.target.value || 10, 10)))}
                data-testid="final-duration-input"
              />
            </div>
          </div>

          <label className="flex items-center gap-2 cursor-pointer select-none" data-testid="bilingual-toggle">
            <input
              type="checkbox"
              checked={draft.bilingual}
              onChange={(e) => setField("bilingual", e.target.checked)}
              className="w-4 h-4 accent-[var(--accent)]"
            />
            <span className="text-sm text-brand">{t("bilingual_messages")}</span>
            <span className="text-xs text-dim">· {t("bilingual_hint")}</span>
          </label>
        </div>
      </div>

      {/* ===== Update Monitor ===== */}
      <div className="panel corner-brackets">
        <div className="px-4 py-3 border-b border-brand flex items-center justify-between">
          <div className="flex items-center gap-3">
            <RefreshCw size={15} className="text-accent-brand" />
            <span className="heading-stencil text-sm">{t("update_monitor")}</span>
          </div>
          <label className="flex items-center gap-2 cursor-pointer select-none" data-testid="auto-update-toggle">
            <input
              type="checkbox"
              checked={draft.auto_update_enabled}
              onChange={(e) => setField("auto_update_enabled", e.target.checked)}
              className="w-4 h-4 accent-[var(--accent)]"
            />
            <span className="text-sm text-brand">{t("auto_update_enabled")}</span>
          </label>
        </div>

        <div className="p-5 space-y-5">
          <p className="text-xs text-dim flex items-start gap-2">
            <Info size={12} className="mt-0.5 shrink-0 text-accent-brand" />
            {t("auto_update_hint")}
          </p>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="label-accent block mb-2">{t("update_check_interval")}</label>
              <input
                type="number"
                min={5}
                max={1440}
                className="input-field"
                value={draft.update_check_interval_min}
                onChange={(e) => setField("update_check_interval_min", Math.max(5, parseInt(e.target.value || 360, 10)))}
                data-testid="update-check-interval-input"
              />
              <p className="text-xs text-dim mt-1">{t("update_check_interval_hint")}</p>
            </div>

            <div className="md:col-span-2 grid grid-cols-2 gap-3">
              <div className="border border-brand bg-bg-deep px-4 py-3">
                <div className="label-overline mb-1">{t("server_build")}</div>
                <div className="font-mono text-xs text-brand truncate" title={server.installed_build_id || "—"}>
                  {server.installed_build_id || "—"}
                </div>
              </div>
              <div className="border border-brand bg-bg-deep px-4 py-3">
                <div className="label-overline mb-1">{t("latest_build")}</div>
                <div className="font-mono text-xs text-brand truncate" title={steamInfo.latest_build_id}>
                  {steamInfo.latest_build_id}
                </div>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              className="btn-secondary flex items-center gap-2"
              onClick={handleCheckUpdate}
              disabled={checking}
              data-testid="check-update-now-btn"
            >
              <RefreshCw size={13} className={checking ? "animate-spin" : ""} />
              {t("check_now")}
            </button>

            {server.update_available ? (
              <span className="flex items-center gap-2 px-3 py-1.5 border border-accent-brand text-accent-brand font-mono text-[11px] uppercase tracking-widest">
                <span className="status-led" style={{ background: "var(--accent)" }} />
                {t("update_available_label")}
              </span>
            ) : server.installed ? (
              <span className="flex items-center gap-2 text-success font-mono text-[11px] uppercase tracking-widest">
                <CheckCircle2 size={13} /> {t("up_to_date")}
              </span>
            ) : null}

            {steamInfo.checked_at && (
              <span className="font-mono text-[10px] text-dim uppercase tracking-widest">
                {t("last_check")}: {new Date(steamInfo.checked_at).toLocaleString()}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* ===== Actions ===== */}
      <div className="flex items-center justify-end gap-3">
        <button
          className="btn-secondary flex items-center gap-2"
          onClick={handleGenerate}
          disabled={busy || draft.restart_times.length === 0}
          data-testid="generate-notifications-btn"
          title={draft.restart_times.length === 0 ? "Add at least one restart time" : ""}
        >
          <FileJson size={13} /> {t("generate_notifications")}
        </button>
        <button
          className="btn-primary flex items-center gap-2"
          onClick={handleSave}
          disabled={!dirty || busy}
          data-testid="save-automation-btn"
        >
          {t("save")}
        </button>
      </div>

      {/* ===== Preview ===== */}
      {preview.length > 0 && (
        <div className="panel">
          <div className="px-4 py-3 border-b border-brand flex items-center justify-between">
            <div className="flex items-center gap-3">
              <FileJson size={15} className="text-accent-brand" />
              <span className="heading-stencil text-sm">{t("preview_notifications")} · Notifications.json</span>
              <span className="label-accent">({preview.length})</span>
            </div>
            <button className="btn-ghost text-[10px]" onClick={() => setShowPreview((v) => !v)} data-testid="toggle-preview-btn">
              {showPreview ? "HIDE" : "SHOW"}
            </button>
          </div>
          {showPreview && (
            <pre className="px-4 py-3 text-[11px] font-mono text-dim leading-relaxed max-h-96 overflow-auto bg-bg-deep border-t border-brand">
{JSON.stringify({ Notifications: preview }, null, 2)}
            </pre>
          )}
        </div>
      )}
    </div>
  );
};
