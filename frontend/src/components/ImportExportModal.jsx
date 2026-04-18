import React, { useMemo, useRef, useState } from "react";
import { X, FileUp, Download, CheckCircle2, AlertCircle, Paperclip, Play, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useI18n } from "../providers/I18nProvider";
import { endpoints } from "../lib/api";

const FILES = [
  { key: "server_settings", filename: "ServerSettings.ini" },
  { key: "gameusersettings", filename: "GameUserSettings.ini" },
  { key: "economy", filename: "EconomyOverride.json" },
  { key: "raid_times", filename: "RaidTimes.json" },
  { key: "notifications", filename: "Notifications.json" },
  { key: "input", filename: "Input.ini" },
  { key: "admins", filename: "AdminUsers.ini" },
  { key: "server_admins", filename: "ServerSettingsAdminUsers.ini" },
  { key: "banned", filename: "BannedUsers.ini" },
  { key: "whitelisted", filename: "WhitelistedUsers.ini" },
  { key: "exclusive", filename: "ExclusiveUsers.ini" },
  { key: "silenced", filename: "SilencedUsers.ini" },
];

export const ImportExportModal = ({ open, onClose, server, onImported }) => {
  const { t } = useI18n();
  const [selections, setSelections] = useState({});  // file_key -> File
  const [results, setResults] = useState({});        // file_key -> { ok, error }
  const [busy, setBusy] = useState(false);

  const setFile = (key, file) => {
    setSelections((s) => {
      const next = { ...s };
      if (file) next[key] = file;
      else delete next[key];
      return next;
    });
    setResults((r) => { const { [key]: _, ...rest } = r; return rest; });
  };

  const runImport = async () => {
    const entries = Object.entries(selections).map(([file_key, file]) => ({ file_key, file }));
    if (entries.length === 0) {
      toast.error(t("choose_file"));
      return;
    }
    setBusy(true);
    try {
      const r = await endpoints.importBulk(server.id, entries);
      const map = {};
      for (const row of r.results) map[row.file_key] = { ok: row.ok, error: row.error };
      setResults(map);
      toast.success(t("import_summary", { ok: r.imported, err: r.errored }));
      if (r.imported > 0 && r.server) onImported?.(r.server);
    } catch (e) {
      toast.error(String(e.response?.data?.detail || e.message));
    } finally { setBusy(false); }
  };

  const handleExport = async (file_key, filename) => {
    try {
      const res = await endpoints.exportFile(server.id, file_key);
      const blob = new Blob([res.content], { type: "text/plain" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = res.filename || filename;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) { toast.error(String(e.response?.data?.detail || e.message)); }
  };

  const selCount = Object.keys(selections).length;

  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-[80] bg-bg-deep/90 backdrop-blur-md flex items-center justify-center p-4"
      onClick={onClose}
      data-testid="import-export-modal"
    >
      <div
        className="panel w-full max-w-4xl corner-brackets-full"
        onClick={(e) => e.stopPropagation()}
        style={{ background: "var(--surface)", maxHeight: "90vh", display: "flex", flexDirection: "column" }}
      >
        <span className="cbr-tr" />
        <span className="cbr-bl" />

        <div className="px-5 py-3 border-b border-brand flex items-center gap-3">
          <FileUp size={15} className="text-accent-brand" />
          <span className="heading-stencil text-sm flex-1">{t("import_export_title")}</span>
          <button onClick={onClose} className="icon-btn" data-testid="import-export-close">
            <X size={14} />
          </button>
        </div>

        <div className="px-5 py-3 border-b border-brand text-xs text-dim leading-relaxed">
          {t("import_export_hint")}
        </div>

        <div className="flex-1 overflow-y-auto scrollbar-thin">
          <table className="w-full text-xs font-mono">
            <thead className="bg-bg-deep border-b-2 border-brand sticky top-0">
              <tr className="text-left">
                <th className="label-overline px-4 py-3">{t("file_col_name")}</th>
                <th className="label-overline px-4 py-3">{t("file_col_import")}</th>
                <th className="label-overline px-4 py-3">{t("file_col_status")}</th>
                <th className="label-overline px-4 py-3 text-right">{t("file_col_export")}</th>
              </tr>
            </thead>
            <tbody>
              {FILES.map((f) => (
                <Row
                  key={f.key}
                  file={f}
                  chosen={selections[f.key]}
                  result={results[f.key]}
                  onChoose={(file) => setFile(f.key, file)}
                  onExport={() => handleExport(f.key, f.filename)}
                  t={t}
                />
              ))}
            </tbody>
          </table>
        </div>

        <div className="px-5 py-3 border-t border-brand bg-bg-deep flex items-center justify-end gap-3">
          <span className="font-mono text-[10px] text-dim uppercase tracking-widest mr-auto">
            {selCount} file{selCount !== 1 ? "s" : ""} selected
          </span>
          <button className="btn-ghost" onClick={onClose}>{t("cancel")}</button>
          <button
            className="btn-primary flex items-center gap-2"
            onClick={runImport}
            disabled={busy || selCount === 0}
            data-testid="import-run-btn"
          >
            <Play size={13} /> {t("run_import")}
          </button>
        </div>
      </div>
    </div>
  );
};

const Row = ({ file, chosen, result, onChoose, onExport, t }) => {
  const ref = useRef(null);
  return (
    <tr className="border-b border-brand hover:bg-surface-2 transition-colors">
      <td className="px-4 py-2.5 text-brand">{file.filename}</td>
      <td className="px-4 py-2.5">
        <input
          ref={ref}
          type="file"
          className="hidden"
          onChange={(e) => onChoose(e.target.files?.[0] || null)}
          data-testid={`import-input-${file.key}`}
        />
        {!chosen ? (
          <button className="btn-ghost text-[10px] flex items-center gap-1" onClick={() => ref.current?.click()} data-testid={`import-choose-${file.key}`}>
            <Paperclip size={10} /> {t("choose_file")}
          </button>
        ) : (
          <div className="flex items-center gap-2">
            <span className="text-accent-brand truncate max-w-[220px]" title={chosen.name}>{chosen.name}</span>
            <button
              className="icon-btn"
              onClick={() => { if (ref.current) ref.current.value = ""; onChoose(null); }}
              title={t("clear_selection")}
              data-testid={`import-clear-${file.key}`}
            >
              <Trash2 size={12} />
            </button>
          </div>
        )}
      </td>
      <td className="px-4 py-2.5">
        {!result && !chosen && <span className="text-muted">—</span>}
        {!result && chosen && <span className="text-dim">{t("row_status_ready")}</span>}
        {result?.ok && (
          <span className="flex items-center gap-1 text-success">
            <CheckCircle2 size={11} /> {t("row_status_ok")}
          </span>
        )}
        {result?.error && (
          <span className="flex items-start gap-1 text-danger" data-testid={`import-error-${file.key}`}>
            <AlertCircle size={11} className="mt-0.5 shrink-0" />
            <span className="max-w-[420px]">{result.error}</span>
          </span>
        )}
      </td>
      <td className="px-4 py-2.5 text-right">
        <button
          className="btn-ghost text-[10px] flex items-center gap-1 ml-auto"
          onClick={onExport}
          data-testid={`export-${file.key}`}
        >
          <Download size={10} /> {t("file_col_export")}
        </button>
      </td>
    </tr>
  );
};
