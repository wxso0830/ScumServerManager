import React, { useEffect, useMemo, useState } from "react";
import * as Icons from "lucide-react";
import { toast } from "sonner";
import { Collapsible } from "./Collapsible";
import { DynamicFields } from "./DynamicFields";
import { UserList } from "./UserList";
import { RaidTimesEditor } from "./RaidTimesEditor";
import { NotificationsEditor } from "./NotificationsEditor";
import { TradersEditor } from "./TradersEditor";
import { InputEditor } from "./InputEditor";
import { useI18n } from "../providers/I18nProvider";
import { endpoints, api } from "../lib/api";

const STATUS_STYLES = {
  Running: { color: "var(--success)", bg: "rgba(56,142,60,0.12)" },
  Stopped: { color: "var(--text-dim)", bg: "var(--surface-2)" },
  Updating: { color: "var(--warning)", bg: "rgba(251,192,45,0.12)" },
};

const SECTION_ICONS = {
  essentials: "Zap",
  gameplay: "Gamepad",
  world: "Globe",
  economy: "Banknote",
  security: "Shield",
  users: "Users",
  advanced: "Wrench",
  client: "Monitor",
};

const downloadFile = (filename, content) => {
  const blob = new Blob([content], { type: "text/plain" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
};

export const ServerDashboard = ({ server, schema, onChange, onDelete }) => {
  const { t } = useI18n();
  const [activeSection, setActiveSection] = useState(schema?.sections?.[0]?.key || "server");
  const [openMap, setOpenMap] = useState({});
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

  useEffect(() => {
    // Initialize openMap — first panel per section open
    if (!schema?.categories) return;
    const map = {};
    const seenSections = new Set();
    for (const cat of schema.categories) {
      if (!seenSections.has(cat.section)) {
        map[cat.key] = true;
        seenSections.add(cat.section);
      }
    }
    setOpenMap(map);
  }, [schema]);

  const statusStyle = STATUS_STYLES[server.status] || STATUS_STYLES.Stopped;
  const isRunning = server.status === "Running";

  const maxPlayers = useMemo(() => {
    return draft.srv_general?.["scum.MaxPlayers"] ?? 64;
  }, [draft]);

  const setCategory = (key, value) => {
    setDraft((d) => ({ ...d, [key]: value }));
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

  const handleUpdate = async () => {
    setBusy(true);
    try {
      const updated = await endpoints.updateServer(server.id);
      onChange(updated);
      toast.success(t("update_server"));
      // Simulate completion after 1.5s in web preview
      setTimeout(async () => {
        try {
          const done = await api.post(`/servers/${server.id}/update/complete`);
          onChange(done.data);
        } catch (_) {}
      }, 1500);
    } finally { setBusy(false); }
  };

  const handleRename = async () => {
    if (!newName.trim() || newName === server.name) { setRenameOpen(false); return; }
    const updated = await endpoints.renameServer(server.id, newName.trim());
    onChange(updated);
    setRenameOpen(false);
  };

  const handleExport = async (exportKey) => {
    if (!exportKey) return;
    const res = await endpoints.exportFile(server.id, exportKey);
    downloadFile(res.filename, res.content);
    toast.success(res.filename);
  };

  const sections = schema?.sections || [];
  const visibleCategories = (schema?.categories || []).filter((c) => c.section === activeSection);

  const renderCategoryBody = (cat) => {
    const sourceKey = cat.sourceKey || cat.key;
    const value = draft[sourceKey];
    switch (cat.renderer) {
      case "user_list":
        return (
          <UserList
            users={value || []}
            onChange={(list) => setCategory(sourceKey, list)}
            commonFlags={cat.commonFlags || []}
            exportKey={cat.exportKey}
            serverId={server.id}
            testIdPrefix={cat.key}
          />
        );
      case "raid_times":
        return <RaidTimesEditor entries={value || []} onChange={(list) => setCategory(sourceKey, list)} testId={`editor-${cat.key}`} />;
      case "notifications":
        return <NotificationsEditor entries={value || []} onChange={(list) => setCategory(sourceKey, list)} testId={`editor-${cat.key}`} />;
      case "traders":
        return <TradersEditor traders={value || {}} onChange={(obj) => setCategory(sourceKey, obj)} testId={`editor-${cat.key}`} />;
      case "input":
        return (
          <InputEditor
            axis={draft.input_axis || []}
            action={draft.input_action || []}
            onChange={({ axis, action }) => {
              setDraft((d) => ({ ...d, input_axis: axis, input_action: action }));
              setDirty(true);
            }}
            testId={`editor-${cat.key}`}
          />
        );
      case "dynamic":
      default:
        return (
          <DynamicFields
            values={value || {}}
            fieldKeys={cat.fieldKeys}
            onFieldChange={(k, v) => setCategory(sourceKey, { ...(value || {}), [k]: v })}
            testIdPrefix={`field-${cat.key}`}
          />
        );
    }
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden" data-testid="server-dashboard">
      {/* Profile header */}
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
            <div className="font-mono text-sm text-brand">0 / {maxPlayers}</div>
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
          <button className="ghost-btn flex items-center gap-2" onClick={handleUpdate} disabled={busy || isRunning} data-testid="server-update-button" title={t("update_server")}>
            <Icons.Download size={14} /> {t("update_server")}
          </button>
          <button className="ghost-btn flex items-center gap-2" onClick={handleSave} disabled={!dirty || busy} data-testid="save-settings-btn">
            <Icons.Save size={14} /> {t("save_settings")}
          </button>
          <button className="icon-btn" onClick={() => { if (window.confirm(t("delete_server_confirm"))) onDelete(server.id); }} title={t("delete_server")} data-testid="delete-server-btn">
            <Icons.Trash2 size={16} />
          </button>
        </div>
      </div>

      {/* Section tabs */}
      <div className="bg-surface-2 border-b border-brand px-5 py-1 flex items-center gap-1 overflow-x-auto scrollbar-thin">
        {sections.map((sec) => {
          const SecIcon = Icons[SECTION_ICONS[sec.key]] || Icons.Square;
          const active = activeSection === sec.key;
          return (
            <button
              key={sec.key}
              onClick={() => setActiveSection(sec.key)}
              data-testid={`section-tab-${sec.key}`}
              className="flex items-center gap-2 px-4 py-2.5 text-sm transition-colors whitespace-nowrap"
              style={{
                color: active ? "var(--text)" : "var(--text-dim)",
                borderBottom: active ? "2px solid var(--primary)" : "2px solid transparent",
                marginBottom: "-1px",
              }}
            >
              <SecIcon size={14} />
              <span className="font-mono uppercase tracking-wider text-xs">{t(sec.labelKey)}</span>
            </button>
          );
        })}
      </div>

      <div className="flex-1 overflow-y-auto scrollbar-thin p-5">
        {visibleCategories.map((cat) => {
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
              {cat.exportKey && cat.renderer !== "user_list" && (
                <div className="flex justify-end mb-3 gap-2">
                  <button className="ghost-btn text-xs flex items-center gap-2" onClick={() => handleExport(cat.exportKey)} data-testid={`export-${cat.key}`}>
                    <Icons.Download size={14} /> {t("export_file")}
                  </button>
                </div>
              )}
              {renderCategoryBody(cat)}
            </Collapsible>
          );
        })}
        {visibleCategories.length === 0 && (
          <div className="text-center text-dim text-sm py-12">{t("loading")}</div>
        )}
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
