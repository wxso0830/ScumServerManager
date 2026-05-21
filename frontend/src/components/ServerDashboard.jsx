import React, { useEffect, useMemo, useState } from "react";
import * as Icons from "lucide-react";
import { toast } from "sonner";
import { DynamicFields } from "./DynamicFields";
import { UserList } from "./UserList";
import { RaidTimesEditor } from "./RaidTimesEditor";
import { NotificationsEditor } from "./NotificationsEditor";
import { TradersEditor } from "./TradersEditor";
import { InputEditor } from "./InputEditor";
import { AutomationEditor } from "./AutomationEditor";
import { DiscordSettings } from "./DiscordSettings";
import { ConfirmModal } from "./ConfirmModal";
import { ImportExportModal } from "./ImportExportModal";
import { NetworkPortsPanel } from "./NetworkPortsPanel";
import { LaunchArgsPanel } from "./LaunchArgsPanel";
import { BetaSettingsPanel } from "./BetaSettingsPanel";
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
  // Active CATEGORY within the current section (the second-level "tab strip"
  // the user requested, Chrome-style: clicking a category tab expands its
  // editor below; the editor panel visually merges with the active tab.
  // Previously every category in the section rendered as a vertical
  // collapsible list — bulky and hard to scan.
  const [activeCategory, setActiveCategory] = useState(null);
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

  // (Removed in v1.0.19) The old layout pre-opened the first Collapsible of
  // each section on schema load. We now use a single active-category tab
  // per section, which the activeSection effect below selects automatically.

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

  // When section changes (or first load) snap activeCategory to the first
  // available one so the panel below always has content.
  useEffect(() => {
    if (visibleCategories.length === 0) return;
    if (!activeCategory || !visibleCategories.some((c) => c.key === activeCategory)) {
      setActiveCategory(visibleCategories[0].key);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSection, schema]);

  const activeCat = visibleCategories.find((c) => c.key === activeCategory) || visibleCategories[0];

  const renderCategoryBody = (cat) => {
    const sourceKey = cat.sourceKey || cat.key;
    const value = draft[sourceKey];
    switch (cat.renderer) {
      case "user_list": {
        // v1.0.25: Per-category hints help admins understand which file
        // does what (and why admins can sometimes bypass bans).
        const hintMap = {
          users_admins: t("user_list_hint_admins"),
          users_server_admins: t("user_list_hint_server_admins"),
          users_banned: t("user_list_hint_banned"),
          users_whitelisted: t("user_list_hint_whitelisted"),
          users_exclusive: t("user_list_hint_exclusive"),
          users_silenced: t("user_list_hint_silenced"),
        };
        return (
          <UserList
            users={value || []}
            onChange={(list) => setCategory(sourceKey, list)}
            exportKey={cat.exportKey}
            serverId={server.id}
            testIdPrefix={cat.key}
            hint={hintMap[cat.key]}
          />
        );
      }
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
      case "launch_args":
        return <LaunchArgsPanel server={server} onSaved={(updated) => onChange(updated)} />;
      case "beta_settings":
        return (
          <BetaSettingsPanel
            value={value || {}}
            onChange={(next) => setCategory(sourceKey, next)}
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

          {/* Open the selected server's folder in OS file explorer.
              Useful when admins need to grab the .ini, browse Saved\Logs, etc. */}
          <button
            type="button"
            onClick={async () => {
              try {
                await endpoints.openServerFolder(server.id);
              } catch (e) {
                const msg = e?.response?.data?.detail || e?.message || "Folder open failed";
                toast.error(String(msg));
              }
            }}
            className="icon-btn"
            data-testid="open-server-folder-btn"
            title={t("open_server_folder")}
            disabled={!server.installed}
          >
            <Icons.FolderOpen size={14} />
          </button>
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

            {/* Auto-save dropdown — custom popover (the native <select>
                renders a tiny white OS-painted menu that breaks the dark
                theme; this matches our other controls). */}
            <AutosaveSwitcher value={autosaveSec} onChange={setAutosaveSec} t={t} />
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

      <div className="flex-1 overflow-y-auto scrollbar-thin bg-bg">
        {visibleCategories.length === 0 && (
          <div className="text-center text-dim text-sm py-12 font-mono uppercase tracking-widest">{t("loading")}</div>
        )}

        {visibleCategories.length > 0 && (
          <div className="px-6 pt-6">
            {/* Category tabs — Chrome-style: each tab is a rounded-top button
                that visually merges into the content panel below when active.
                Inactive tabs sit on a thin baseline; the active one has no
                bottom border so it "flows" into the panel. */}
            <div className="flex items-end gap-1 flex-wrap relative" style={{ marginBottom: "-1px", zIndex: 2 }}>
              {visibleCategories.map((cat) => {
                const Icon = Icons[cat.icon] || Icons.Settings;
                const active = activeCat?.key === cat.key;
                return (
                  <button
                    key={cat.key}
                    onClick={() => setActiveCategory(cat.key)}
                    data-testid={`category-tab-${cat.key}`}
                    className={`group flex items-center gap-2 px-4 py-2.5 text-[11px] font-display uppercase tracking-wider transition-all border ${
                      active
                        ? "bg-surface text-brand border-brand border-b-transparent rounded-t-md relative shadow-[0_-2px_0_var(--accent)_inset]"
                        : "bg-bg/50 text-dim border-transparent hover:text-brand hover:bg-surface/40"
                    }`}
                    style={active ? { borderBottom: "1px solid var(--surface)" } : {}}
                  >
                    <Icon size={13} className={active ? "text-accent-brand" : "opacity-70"} />
                    <span>{t(cat.labelKey)}</span>
                  </button>
                );
              })}
            </div>

            {/* Active category content panel — merges visually with tab */}
            {activeCat && (
              <div
                key={activeCat.key}
                className="bg-surface border border-brand rounded-md rounded-tl-none p-6 relative"
                data-testid={`panel-${activeCat.key}`}
                style={{ animation: "fadeIn 180ms ease-out" }}
              >
                <div className="flex items-center justify-between mb-4 pb-3 border-b border-brand">
                  <div className="flex items-center gap-2">
                    {(() => {
                      const I = Icons[activeCat.icon] || Icons.Settings;
                      return <I size={16} className="text-accent-brand" />;
                    })()}
                    <h3 className="heading-stencil text-base">{t(activeCat.labelKey)}</h3>
                  </div>
                  {activeCat.exportKey && (() => {
                    // Map our internal exportKey back to the real SCUM filename
                    // so the badge in the top-right shows "AdminUsers.ini" /
                    // "EconomyOverride.json" instead of the raw key.
                    const FILENAMES = {
                      admins: "AdminUsers.ini",
                      banned: "BannedUsers.ini",
                      exclusive: "ExclusiveUsers.ini",
                      silenced: "SilencedUsers.ini",
                      whitelisted: "WhitelistedUsers.ini",
                      server_admins: "ServerSettingsAdminUsers.ini",
                      economy: "EconomyOverride.json",
                      raid_times: "RaidTimes.json",
                      notifications: "Notifications.json",
                      server_settings: "ServerSettings.ini",
                      gameusersettings: "GameUserSettings.ini",
                      input: "Input.ini",
                    };
                    return (
                      <span className="font-mono text-[10px] text-dim uppercase tracking-widest">
                        {FILENAMES[activeCat.exportKey] || activeCat.exportKey}
                      </span>
                    );
                  })()}
                </div>
                {renderCategoryBody(activeCat)}
                {/* NetworkPorts UI stays on the Performance category since it
                    governs the CLI -port/-QueryPort flags. The "Launch
                    Arguments" category is now its own first-class category
                    (between Performance and Wipe) — see /api/settings/schema. */}
                {activeCat.key === "essentials_performance" && (
                  <NetworkPortsPanel server={server} onSaved={(updated) => onChange(updated)} />
                )}
              </div>
            )}
          </div>
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

// Custom auto-save interval picker — replaces the native <select> which
// renders an OS-default white popup that clashes with the dark theme.
// Click toggles a tiny menu; selecting an option closes it.
const AutosaveSwitcher = ({ value, onChange, t }) => {
  const [open, setOpen] = useState(false);
  const ref = React.useRef(null);
  // Click-outside close: register on the document, scoped to this widget's
  // ref so it never interferes with the rest of the dashboard.
  useEffect(() => {
    if (!open) return undefined;
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const options = [
    { v: 0,  label: t("autosave_off") },
    { v: 5,  label: "5s" },
    { v: 10, label: "10s" },
    { v: 15, label: "15s" },
    { v: 30, label: "30s" },
  ];
  const current = options.find((o) => o.v === value) || options[0];

  return (
    <div ref={ref} className="relative" data-testid="autosave-wrap">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`flex items-center gap-2 border px-3 py-1.5 transition-colors ${
          value ? "border-accent-brand bg-accent-soft" : "border-strong hover:border-brand"
        }`}
        title={t("autosave")}
        data-testid="autosave-trigger"
      >
        <Icons.Clock size={12} className={value ? "text-accent-brand" : "text-dim"} />
        <span className="label-overline">{t("autosave")}</span>
        <span className={`font-mono text-[11px] uppercase tracking-widest ml-1 ${value ? "text-accent-brand" : "text-brand"}`}>
          {current.label}
        </span>
        <Icons.ChevronDown
          size={11}
          className="text-dim transition-transform"
          style={{ transform: open ? "rotate(180deg)" : "rotate(0)" }}
        />
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 z-50 min-w-[140px] bg-surface border border-accent-brand shadow-2xl corner-brackets">
          {options.map((opt) => (
            <button
              key={opt.v}
              type="button"
              onClick={() => { onChange(opt.v); setOpen(false); }}
              className={`w-full flex items-center justify-between px-3 py-2 text-left font-mono text-[11px] uppercase tracking-widest transition-colors hover:bg-surface-2 ${
                opt.v === value ? "text-accent-brand" : "text-brand"
              }`}
              data-testid={`autosave-option-${opt.v}`}
            >
              <span>{opt.label}</span>
              {opt.v === value && <Icons.Check size={11} className="text-accent-brand" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
