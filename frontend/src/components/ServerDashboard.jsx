import React, { useEffect, useMemo, useState } from "react";
import * as Icons from "lucide-react";
import { toast } from "sonner";
import { Collapsible } from "./Collapsible";
import { Field } from "./Field";
import { UserList } from "./UserList";
import { SETTINGS_SCHEMA } from "../lib/settingsSchema";
import { useI18n } from "../providers/I18nProvider";
import { endpoints, api } from "../lib/api";

const STATUS_STYLES = {
  Running: { color: "var(--success)", bg: "rgba(56,142,60,0.12)" },
  Stopped: { color: "var(--text-dim)", bg: "var(--surface-2)" },
  Updating: { color: "var(--warning)", bg: "rgba(251,192,45,0.12)" },
};

export const ServerDashboard = ({ server, onChange, onDelete }) => {
  const { t } = useI18n();
  const [openMap, setOpenMap] = useState(() => Object.fromEntries(SETTINGS_SCHEMA.map((c, i) => [c.key, i < 2])));
  const [draft, setDraft] = useState(server.settings || {});
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);
  const [newName, setNewName] = useState(server.name);

  useEffect(() => {
    setDraft(server.settings || {});
    setDirty(false);
    setNewName(server.name);
  }, [server.id, server.settings, server.name]);

  const statusStyle = STATUS_STYLES[server.status] || STATUS_STYLES.Stopped;
  const isRunning = server.status === "Running";

  const updateField = (catKey, fieldKey, value) => {
    setDraft((d) => ({ ...d, [catKey]: { ...(d[catKey] || {}), [fieldKey]: value } }));
    setDirty(true);
  };

  const handleSave = async () => {
    setBusy(true);
    try {
      const updated = await endpoints.updateSettings(server.id, draft);
      onChange(updated);
      setDirty(false);
      toast.success(t("toast_settings_saved"));
    } finally { setBusy(false); }
  };

  const handleStart = async () => {
    setBusy(true);
    try {
      const updated = await endpoints.startServer(server.id);
      onChange(updated);
      toast.success(t("toast_server_started"));
    } finally { setBusy(false); }
  };

  const handleStop = async () => {
    setBusy(true);
    try {
      const updated = await endpoints.stopServer(server.id);
      onChange(updated);
      toast(t("toast_server_stopped"));
    } finally { setBusy(false); }
  };

  const handleRename = async () => {
    if (!newName.trim() || newName === server.name) { setRenameOpen(false); return; }
    const updated = await endpoints.renameServer(server.id, newName.trim());
    onChange(updated);
    setRenameOpen(false);
  };

  const renderedPanels = useMemo(() => SETTINGS_SCHEMA.map((cat) => {
    const Icon = Icons[cat.icon] || Icons.Settings;
    const badge = cat.exportKey ? cat.exportKey.toUpperCase() : null;
    return (
      <Collapsible
        key={cat.key}
        testId={`panel-${cat.key}`}
        title={t(cat.labelKey)}
        icon={<Icon size={16} className="text-primary-brand" />}
        open={!!openMap[cat.key]}
        onToggle={() => setOpenMap((m) => ({ ...m, [cat.key]: !m[cat.key] }))}
        badge={badge}
      >
        {cat.renderer === "user_list" ? (
          <UserList
            users={draft[cat.key] || []}
            onChange={(list) => { setDraft((d) => ({ ...d, [cat.key]: list })); setDirty(true); }}
            commonFlags={cat.commonFlags || []}
            exportKey={cat.exportKey}
            serverId={server.id}
            testIdPrefix={`${cat.key}`}
          />
        ) : (
          <>
            {cat.exportKey && (
              <div className="flex justify-end mb-3 gap-2">
                <button
                  className="ghost-btn text-xs flex items-center gap-2"
                  onClick={async () => {
                    const res = await api.get(`/servers/${server.id}/export/${cat.exportKey}`);
                    const blob = new Blob([res.data.content], { type: "text/plain" });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement("a");
                    a.href = url;
                    a.download = res.data.filename;
                    a.click();
                    URL.revokeObjectURL(url);
                    toast.success(res.data.filename);
                  }}
                  data-testid={`export-${cat.key}`}
                >
                  <Icons.Download size={14} /> {t("export_file")}
                </button>
              </div>
            )}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6">
              {cat.fields.map((f) => (
                <Field
                  key={f.key}
                  field={f}
                  value={(draft[cat.key] || {})[f.key]}
                  onChange={(v) => updateField(cat.key, f.key, v)}
                  testId={`field-${cat.key}-${f.key}`}
                />
              ))}
            </div>
          </>
        )}
      </Collapsible>
    );
  }), [draft, openMap, t, server.id]);

  return (
    <div className="flex-1 flex flex-col overflow-hidden" data-testid="server-dashboard">
      <div className="bg-surface border-b border-brand px-5 py-4 flex items-center gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-semibold text-brand truncate" data-testid="server-title">{server.name}</h2>
            <span className="px-2 py-0.5 text-[11px] font-mono uppercase tracking-wider rounded-sm border" style={{ color: statusStyle.color, background: statusStyle.bg, borderColor: statusStyle.color }}>
              {t(`server_status_${server.status.toLowerCase()}`)}
            </span>
            <button className="icon-btn" onClick={() => setRenameOpen(true)} data-testid="rename-server-btn" title={t("rename_server")}>
              <Icons.Pencil size={14} />
            </button>
          </div>
          <div className="font-mono text-[11px] text-dim mt-1 truncate">{server.folder_path}</div>
        </div>

        <div className="flex items-center gap-2">
          <div className="text-right pr-3 border-r border-brand">
            <div className="label-overline">{t("players")}</div>
            <div className="font-mono text-sm text-brand">0 / {(draft.administration?.MaxPlayers) ?? 64}</div>
          </div>
          {!isRunning ? (
            <button className="tactical-btn flex items-center gap-2" onClick={handleStart} disabled={busy} data-testid="server-start-button">
              <Icons.Play size={14} /> {t("start")}
            </button>
          ) : (
            <button className="tactical-btn flex items-center gap-2" onClick={handleStop} disabled={busy} data-testid="server-stop-button" style={{ background: "var(--danger)" }}>
              <Icons.Square size={14} /> {t("stop")}
            </button>
          )}
          <button className="ghost-btn flex items-center gap-2" onClick={handleSave} disabled={!dirty || busy} data-testid="save-settings-btn">
            <Icons.Save size={14} /> {t("save_settings")}
          </button>
          <button className="icon-btn" onClick={() => { if (window.confirm(t("delete_server_confirm"))) onDelete(server.id); }} title={t("delete_server")} data-testid="delete-server-btn">
            <Icons.Trash2 size={16} />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto scrollbar-thin p-5">
        {renderedPanels}
      </div>

      {renameOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" onClick={() => setRenameOpen(false)}>
          <div className="panel w-full max-w-md" onClick={(e) => e.stopPropagation()} style={{ background: "var(--surface)" }}>
            <div className="px-4 py-3 border-b border-brand font-mono uppercase text-xs tracking-wider">{t("rename_server")}</div>
            <div className="px-4 py-4">
              <label className="label-overline block mb-2">{t("server_name")}</label>
              <input autoFocus value={newName} onChange={(e) => setNewName(e.target.value)} className="input-field" data-testid="rename-input" />
            </div>
            <div className="px-4 py-3 border-t border-brand flex justify-end gap-2">
              <button className="ghost-btn" onClick={() => setRenameOpen(false)}>{t("cancel")}</button>
              <button className="tactical-btn" onClick={handleRename} data-testid="rename-confirm-btn">{t("save")}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
