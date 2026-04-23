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
import { AutomationEditor } from "./AutomationEditor";
import { DiscordSettings } from "./DiscordSettings";
import { DiscordBotSettings } from "./DiscordBotSettings";
import { ConfirmModal } from "./ConfirmModal";
import { ImportExportModal } from "./ImportExportModal";
import { NetworkPortsPanel } from "./NetworkPortsPanel";
import { useI18n } from "../providers/I18nProvider";
import { endpoints, api } from "../lib/api";

const STATUS_META = {
  Running:   { label: "server_status_running",   color: "var(--success)" },
  Starting:  { label: "server_status_starting",  color: "var(--warning)" },
  Stopped:   { label: "server_status_stopped",   color: "var(--text-muted)" },
  Updating:  { label: "server_status_updating",  color: "var(--warning)" },
  Installing:{ label: "installing",              color: "var(--accent)" },
};

const SECTION_ICONS = {
  essentials: "Zap",
  gameplay: "Gamepad",
  world: "Globe",
  economy: "Banknote",
  security: "Shield",
  users: "Users",
  advanced: "Wrench",
  automation: "Clock",
  discord: "MessageSquare",
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

export const ServerDashboard = ({
  server,
  servers = [],
  schema,
  onChange,
  onDelete,
  onBack,
  onSelectServer,
}) => {
  const { t } = useI18n();
  const [activeSection, setActiveSection] = useState(schema?.sections?.[0]?.key || "essentials");
  const [openMap, setOpenMap] = useState({});
  const [draft, setDraft] = useState(server.settings || {});
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);
  const [newName, setNewName] = useState(server.name);
  const [confirmDelOpen, setConfirmDelOpen] = useState(false);
  const [importExportOpen, setImportExportOpen] = useState(false);
  const [autosaveSec, setAutosaveSec] = useState(() => {
    const v = parseInt(localStorage.getItem("lgss.autosave_sec") || "0", 10);
    return Number.isFinite(v) ? v : 0;
  });
  const [lastAutoSavedAt, setLastAutoSavedAt] = useState(null);

  const draftKey = `lgss.draft.${server.id}`;

  // Load: restore draft from localStorage if it differs from server settings
  useEffect(() => {
    try {
      const cached = localStorage.getItem(draftKey);
      if (cached) {
        const parsed = JSON.parse(cached);
        if (JSON.stringify(parsed) !== JSON.stringify(server.settings || {})) {
          setDraft(parsed);
          setDirty(true);
          toast(t("draft_restored"));
          return;
        }
      }
    } catch (_) {}
    setDraft(server.settings || {});
    setDirty(false);
    setNewName(server.name);
    // eslint-disable-next-line
  }, [server.id]);

  // Persist draft to localStorage on any change (so view-switch doesn't lose it)
  useEffect(() => {
    if (dirty) {
      try { localStorage.setItem(draftKey, JSON.stringify(draft)); } catch (_) {}
    }
    // eslint-disable-next-line
  }, [draft, dirty]);

  // Persist autosave choice
  useEffect(() => {
    localStorage.setItem("lgss.autosave_sec", String(autosaveSec));
  }, [autosaveSec]);

  useEffect(() => {
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

  const statusMeta = STATUS_META[server.status] || STATUS_META.Stopped;
  const isRunning = server.status === "Running";
  const isStarting = server.status === "Starting";
  const processAlive = isRunning || isStarting;

  const maxPlayers = useMemo(() => draft.srv_general?.["scum.MaxPlayers"] ?? 64, [draft]);

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
      try { localStorage.removeItem(draftKey); } catch (_) {}
      toast.success(t("toast_settings_saved"));
    } finally { setBusy(false); }
  };

  // Auto-save: re-run every `autosaveSec` while dirty
  useEffect(() => {
    if (!autosaveSec || !dirty || busy) return;
    const id = setInterval(async () => {
      if (!dirty || busy) return;
      try {
        const updated = await endpoints.updateSettings(server.id, draft);
        onChange(updated);
        setDirty(false);
        setLastAutoSavedAt(new Date());
        try { localStorage.removeItem(draftKey); } catch (_) {}
        toast.success(t("autosave_saved"));
      } catch (_) { /* ignore */ }
    }, autosaveSec * 1000);
    return () => clearInterval(id);
    // eslint-disable-next-line
  }, [autosaveSec, dirty, busy, draft, server.id]);

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
      setTimeout(async () => {
        try {
          const done = await api.post(`/servers/${server.id}/update/complete`);
          onChange(done.data);
        } catch (_) {}
      }, 1500);
    } finally { setBusy(false); }
  };

  const handleInstall = async () => {
    setBusy(true);
    toast(t("installing"));
    try {
      if (window?.lgss?.installServer) {
        await window.lgss.installServer({ folderPath: server.folder_path, appId: "3792580" });
      }
      const updated = await endpoints.installServer(server.id);
      // Seed Notifications.json template post-install
      const seeded = await endpoints.postInstall(updated.id).catch(() => updated);
      onChange(seeded);
      toast.success(t("install_complete"));
    } finally { setBusy(false); }
  };

  const handleSaveConfig = async () => {
    setBusy(true);
    try {
      const plan = await endpoints.saveConfig(server.id);
      if (window?.lgss?.writeConfigFiles) {
        await window.lgss.writeConfigFiles(plan);
      }
      if (plan.wrote_to_disk) {
        toast.success(`${plan.written_count}/${plan.count} ${t("files_written")} → ${plan.config_dir}`);
      } else if (plan.errors?.length) {
        toast.error(plan.errors[0].error || "Write failed");
      } else {
        toast.success(t("config_written", { path: plan.config_dir }));
      }
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
      case "notifications_kind": {
        // Show only entries of this category's kind; write back with the kind
        // tag preserved + entries of other kinds untouched. This keeps both
        // restart and update notifications inside a single Notifications.json
        // file (SCUM only reads one) while splitting the UI by purpose.
        const all = value || [];
        const myKind = cat.notificationKind || "restart";
        const mine = all.filter((n) => (n?.kind || "restart") === myKind);
        const others = all.filter((n) => (n?.kind || "restart") !== myKind);
        return (
          <NotificationsEditor
            entries={mine}
            kind={myKind}
            onChange={(list) => {
              const tagged = list.map((n) => ({ ...n, kind: myKind }));
              setCategory(sourceKey, [...others, ...tagged]);
            }}
            testId={`editor-${cat.key}`}
          />
        );
      }
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
      case "automation":
        return <AutomationEditor server={server} onChange={onChange} />;
      case "automation_restart":
        return <AutomationEditor server={server} onChange={onChange} mode="restart" />;
      case "automation_update":
        return <AutomationEditor server={server} onChange={onChange} mode="update" />;
      case "discord":
        return <DiscordSettings server={server} />;
      case "discord_bot":
        return <DiscordBotSettings server={server} onChange={onChange} />;
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
    <div className="flex-1 flex flex-col overflow-hidden bg-bg" data-testid="server-dashboard">
      {!server.installed && (
        <InstallGate server={server} onBack={onBack} onInstall={handleInstall} busy={busy} t={t} />
      )}
      {server.installed && (
      <>
      {/* Command breadcrumb + actions */}
      <div className="bg-bg-deep border-b border-brand px-6 py-4">
        <div className="flex items-center gap-3 mb-3 text-xs font-mono uppercase tracking-widest">
          <button
            onClick={onBack}
            className="text-dim hover:text-accent-brand transition-colors flex items-center gap-1.5"
            data-testid="back-to-dashboard-btn"
          >
            <Icons.ChevronLeft size={14} /> {t("back_to_dashboard")}
          </button>
          <span className="text-muted">/</span>
          <span className="text-accent-brand">{t("nav_configs")}</span>
          <span className="text-muted">/</span>

          <div className="relative">
            <select
              value={server.id}
              onChange={(e) => onSelectServer?.(e.target.value)}
              data-testid="server-switcher"
              className="bg-surface border border-strong px-3 py-1.5 text-xs font-mono uppercase tracking-wider text-brand cursor-pointer hover:border-accent-brand transition-colors"
              style={{ appearance: "none", paddingRight: "28px" }}
            >
              {servers.map((s) => (
                <option key={s.id} value={s.id} disabled={!s.installed}>
                  {s.name}{!s.installed ? " · (not installed)" : ""}
                </option>
              ))}
            </select>
            <Icons.ChevronDown size={12} className="absolute right-2 top-1/2 -translate-y-1/2 text-dim pointer-events-none" />
          </div>
        </div>

        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-4 min-w-0">
            <div
              className="h-14 w-14 flex items-center justify-center border border-accent-brand relative flex-shrink-0"
              style={{
                background: "var(--accent-soft)",
                clipPath: "polygon(8px 0, 100% 0, calc(100% - 8px) 100%, 0 100%)",
              }}
            >
              <Icons.Server size={22} className="text-accent-brand" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-3 mb-1">
                <h1 className="heading-stencil text-xl text-brand truncate" data-testid="server-title">
                  {server.name}
                </h1>
                <button
                  className="icon-btn"
                  onClick={() => setRenameOpen(true)}
                  data-testid="rename-server-btn"
                  title={t("rename_server")}
                >
                  <Icons.Pencil size={13} />
                </button>
                <div
                  className="flex items-center gap-1.5 px-2 py-0.5 border font-mono uppercase text-[10px] tracking-widest"
                  style={{ color: statusMeta.color, borderColor: statusMeta.color, background: "rgba(0,0,0,0.4)" }}
                  data-testid="server-status-badge"
                >
                  <span className="status-led" style={{ background: statusMeta.color }} />
                  {t(statusMeta.label)}
                </div>
              </div>
              <div className="font-mono text-[11px] text-dim truncate" title={server.folder_path}>
                {server.folder_path}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-shrink-0">
            <div className="text-right px-3 py-1 border border-brand bg-surface">
              <div className="label-overline">{t("players")}</div>
              <div className="font-mono text-sm text-brand">0 / {maxPlayers}</div>
            </div>
            {!server.installed && (
              <button className="btn-primary flex items-center gap-2" onClick={handleInstall} disabled={busy} data-testid="server-install-button">
                <Icons.Download size={13} /> {t("install_server")}
              </button>
            )}
            {server.installed && !processAlive && (
              <button className="btn-primary flex items-center gap-2" onClick={handleStart} disabled={busy} data-testid="server-start-button">
                <Icons.Play size={13} /> {t("start")}
              </button>
            )}
            {isStarting && (
              <button
                className="btn-primary flex items-center gap-2"
                disabled
                data-testid="server-starting-indicator"
                style={{ background: "var(--warning)", color: "var(--bg-deep)" }}
                title={t("server_warming_up")}
              >
                <Icons.Activity size={13} className="animate-pulse" /> {t("server_status_starting")}
              </button>
            )}
            {isRunning && (
              <button className="btn-secondary flex items-center gap-2" onClick={async () => { setBusy(true); try { const u = await endpoints.restartServer(server.id); onChange(u); toast.success(t("restart")); } catch(e){ toast.error(String(e.response?.data?.detail||e.message)); } finally { setBusy(false); } }} disabled={busy} data-testid="server-restart-button" title={t("restart")}>
                <Icons.RotateCw size={13} />
              </button>
            )}
            {(isRunning || isStarting) && (
              <button className="btn-danger flex items-center gap-2" onClick={handleStop} disabled={busy} data-testid="server-stop-button">
                <Icons.Square size={13} /> {t("stop")}
              </button>
            )}
            {server.installed && (
              <button
                className={`btn-secondary flex items-center gap-2 ${server.update_available ? "update-pulse" : ""}`}
                onClick={handleUpdate}
                disabled={busy || processAlive}
                data-testid="server-update-button"
                title={server.update_available ? t("update_available_label") : t("update_server")}
              >
                <Icons.RefreshCw size={13} />
              </button>
            )}
            <button className="btn-secondary flex items-center gap-2" onClick={() => setImportExportOpen(true)} data-testid="open-import-export-btn" title={t("import_export")}>
              <Icons.FileUp size={13} /> {t("import_export")}
            </button>
            <button className="btn-secondary flex items-center gap-2" onClick={handleSaveConfig} disabled={busy} data-testid="save-config-files-btn" title={t("write_config_files")}>
              <Icons.FileCog size={13} />
            </button>
            <button className="btn-primary flex items-center gap-2" onClick={handleSave} disabled={!dirty || busy} data-testid="save-settings-btn">
              <Icons.Save size={13} /> {t("save_settings")}
              {dirty && (
                <span className="font-mono text-[9px] uppercase tracking-widest px-1.5 py-0.5 border border-warning text-warning ml-1">
                  {t("unsaved_badge")}
                </span>
              )}
            </button>

            {/* Auto-save dropdown */}
            <div className="flex items-center gap-1.5 border border-strong px-2 py-1" title={t("autosave")} data-testid="autosave-wrap">
              <Icons.Clock size={12} className={autosaveSec ? "text-accent-brand" : "text-dim"} />
              <span className="label-overline">{t("autosave")}</span>
              <select
                value={autosaveSec}
                onChange={(e) => setAutosaveSec(parseInt(e.target.value, 10))}
                data-testid="autosave-select"
                className="bg-transparent font-mono text-[11px] uppercase tracking-widest text-brand focus:outline-none"
                style={{ appearance: "none", paddingRight: "8px" }}
              >
                <option value="0">{t("autosave_off")}</option>
                <option value="5">5s</option>
                <option value="10">10s</option>
                <option value="15">15s</option>
                <option value="30">30s</option>
              </select>
            </div>
            <button className="icon-btn" onClick={() => setConfirmDelOpen(true)} title={t("delete_server")} data-testid="delete-server-btn">
              <Icons.Trash2 size={15} />
            </button>
          </div>
        </div>
      </div>

      {/* Section tabs */}
      <div className="bg-surface border-b border-brand px-6 flex items-center gap-1 overflow-x-auto scrollbar-thin">
        {sections.map((sec) => {
          const SecIcon = Icons[SECTION_ICONS[sec.key]] || Icons.Square;
          const active = activeSection === sec.key;
          return (
            <button
              key={sec.key}
              onClick={() => setActiveSection(sec.key)}
              data-testid={`section-tab-${sec.key}`}
              className={`nav-tab flex items-center gap-2 ${active ? "active" : ""}`}
            >
              <SecIcon size={13} />
              <span>{t(sec.labelKey)}</span>
            </button>
          );
        })}
      </div>

      <div className="flex-1 overflow-y-auto scrollbar-thin p-6 bg-bg">
        {visibleCategories.map((cat) => {
          const Icon = Icons[cat.icon] || Icons.Settings;
          const badge = cat.exportKey ? cat.exportKey.toUpperCase() : null;
          return (
            <Collapsible
              key={cat.key}
              testId={`panel-${cat.key}`}
              title={t(cat.labelKey)}
              icon={<Icon size={15} className="text-accent-brand" />}
              open={!!openMap[cat.key]}
              onToggle={() => setOpenMap((m) => ({ ...m, [cat.key]: !m[cat.key] }))}
              badge={badge}
            >
              {renderCategoryBody(cat)}
              {/* Injected: show SCUM CLI network port editor at the bottom of
                  the Performance category (section=essentials). */}
              {cat.key === "essentials_performance" && (
                <NetworkPortsPanel server={server} onSaved={(updated) => onChange(updated)} />
              )}
            </Collapsible>
          );
        })}
        {visibleCategories.length === 0 && (
          <div className="text-center text-dim text-sm py-12 font-mono uppercase tracking-widest">{t("loading")}</div>
        )}
      </div>
      </>
      )}

      <ImportExportModal
        open={importExportOpen}
        onClose={() => setImportExportOpen(false)}
        server={server}
        onImported={(updated) => { onChange(updated); setDraft(updated.settings || {}); setDirty(false); }}
      />

      {renameOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setRenameOpen(false)}>
          <div className="panel w-full max-w-md corner-brackets" onClick={(e) => e.stopPropagation()} style={{ background: "var(--surface)" }}>
            <div className="px-5 py-3 border-b border-brand heading-stencil text-sm">{t("rename_server")}</div>
            <div className="px-5 py-5">
              <label className="label-accent block mb-2">{t("server_name")}</label>
              <input autoFocus value={newName} onChange={(e) => setNewName(e.target.value)} className="input-field" data-testid="rename-input" />
            </div>
            <div className="px-5 py-3 border-t border-brand flex justify-end gap-2">
              <button className="btn-ghost" onClick={() => setRenameOpen(false)}>{t("cancel")}</button>
              <button className="btn-primary" onClick={handleRename} data-testid="rename-confirm-btn">{t("save")}</button>
            </div>
          </div>
        </div>
      )}

      <ConfirmModal
        open={confirmDelOpen}
        title={t("confirm_delete_title")}
        body={t("confirm_delete_body", { name: server.name })}
        confirmLabel={t("confirm_yes_delete")}
        cancelLabel={t("cancel")}
        onCancel={() => setConfirmDelOpen(false)}
        onConfirm={() => { setConfirmDelOpen(false); try { localStorage.removeItem(draftKey); } catch (_) {} onDelete(server.id); }}
        testId="delete-server-modal"
      />

      <style>{`
        @keyframes update-pulse-border {
          0%, 100% { border-color: var(--accent); box-shadow: 0 0 0 0 rgba(255,140,0,0); }
          50%      { border-color: var(--accent-hover); box-shadow: 0 0 14px 2px rgba(255,140,0,0.35); }
        }
        .update-pulse {
          border-color: var(--accent) !important;
          color: var(--accent) !important;
          animation: update-pulse-border 1.4s ease-in-out infinite;
        }
      `}</style>
    </div>
  );
};

const InstallGate = ({ server, onBack, onInstall, busy, t }) => (
  <div className="flex-1 flex items-center justify-center p-8 bg-bg-deep" data-testid="install-gate">
    <div className="relative w-full max-w-xl panel corner-brackets-full" style={{ background: "var(--surface)" }}>
      <span className="cbr-tr" />
      <span className="cbr-bl" />
      <div className="px-5 py-3 border-b border-brand flex items-center gap-2 bg-bg-deep">
        <Icons.Lock size={14} className="text-accent-brand" />
        <span className="font-mono text-[11px] uppercase tracking-[0.3em] text-accent-brand">
          {t("install_required_title")}
        </span>
      </div>
      <div className="px-6 py-8 flex gap-5 items-start">
        <div className="h-16 w-16 flex items-center justify-center shrink-0 border-2 border-accent-brand bg-accent-soft">
          <Icons.Download size={28} className="text-accent-brand" />
        </div>
        <div>
          <h2 className="heading-stencil text-lg mb-2">{server.name}</h2>
          <p className="text-sm leading-relaxed text-brand">{t("install_required_body")}</p>
          <p className="mt-3 font-mono text-[11px] text-muted break-all">{server.folder_path}</p>
        </div>
      </div>
      <div className="flex items-center justify-end gap-3 px-4 py-3 border-t border-brand bg-bg-deep">
        <button onClick={onBack} className="btn-ghost" data-testid="install-gate-back">
          {t("go_back")}
        </button>
        <button onClick={onInstall} disabled={busy} className="btn-primary flex items-center gap-2" data-testid="install-gate-install">
          <Icons.Download size={13} /> {t("install_server")}
        </button>
      </div>
    </div>
  </div>
);
