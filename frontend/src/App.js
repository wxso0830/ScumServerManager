import React, { useCallback, useEffect, useState } from "react";
import { Toaster, toast } from "sonner";
import "./App.css";
import { ThemeProvider } from "./providers/ThemeProvider";
import { I18nProvider, useI18n } from "./providers/I18nProvider";
import { AdminPrompt } from "./components/AdminPrompt";
import { DiskSelectionWizard } from "./components/DiskSelectionWizard";
import { TopBar } from "./components/TopBar";
import { DashboardView } from "./components/DashboardView";
import { ServerDashboard } from "./components/ServerDashboard";
import { LogsView } from "./components/LogsView";
import { PlayersView } from "./components/PlayersView";
import { BackupsView } from "./components/BackupsView";
import { ManagerUpdateModal } from "./components/ManagerUpdateModal";
import { endpoints } from "./lib/api";

const Shell = () => {
  const { t } = useI18n();
  const [phase, setPhase] = useState("loading"); // loading | admin | setup | workspace | declined
  const [isAdmin, setIsAdmin] = useState(false);
  const [setup, setSetup] = useState(null);
  const [servers, setServers] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [schema, setSchema] = useState(null);
  const [appVersion, setAppVersion] = useState({ current: "1.0.37", latest: "1.0.37", update_available: false });
  const [view, setView] = useState("dashboard"); // dashboard | configs | logs
  const [updateModalOpen, setUpdateModalOpen] = useState(false);
  // v1.0.37d — DB offline banner state. Set when /api/setup returns a 503 with
  // {code: "MONGO_OFFLINE"}. UI shows a sticky banner with copy-paste fix
  // instructions instead of crashing the React tree with "Uncaught runtime error".
  const [dbOffline, setDbOffline] = useState(false);

  const load = useCallback(async () => {
    // Wrap every initial call with a .catch so a single 503 (MongoDB offline)
    // doesn't reject the whole Promise.all and crash the React error overlay.
    const safe = (p, fallback) => p.catch((err) => {
      const code = err?.response?.data?.code;
      const status = err?.response?.status;
      if (code === "MONGO_OFFLINE" || status === 503) setDbOffline(true);
      return fallback;
    });
    const [adminRes, setupRes, serverList, schemaRes, versionRes] = await Promise.all([
      safe(endpoints.adminCheck(), { is_admin: false }),
      safe(endpoints.getSetup(), null),
      safe(endpoints.listServers(), []),
      safe(endpoints.getSchema(), null),
      safe(endpoints.getAppVersion(), { current: "1.0.37", latest: "1.0.37", update_available: false }),
    ]);
    setIsAdmin(adminRes.is_admin);
    setSetup(setupRes);
    setServers(serverList);
    setSchema(schemaRes);
    setAppVersion(versionRes);
    if (!setupRes) {
      // DB offline — keep the UI mounted but skip phase transitions so the
      // banner is what the admin sees first.
      setPhase("workspace");
    } else if (!setupRes.is_admin_confirmed) {
      setPhase("admin");
    } else if (!setupRes.completed) {
      setPhase("setup");
    } else {
      setPhase("workspace");
      if (serverList.length > 0) setActiveId(serverList[0].id);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Periodic server-list refresh so the status badge (Starting → Running,
  // Stopped → Running, etc.) updates without the admin having to press
  // F5/CTRL+R. We tighten the poll to 3s when ANY server is in a transient
  // state (Starting/Updating/Installing), otherwise 10s is plenty.
  useEffect(() => {
    if (phase !== "workspace") return undefined;
    const hasTransient = servers.some((s) =>
      ["Starting", "Updating", "Installing"].includes(s.status),
    );
    const period = hasTransient ? 3000 : 10000;
    const id = setInterval(async () => {
      try {
        const list = await endpoints.listServers();
        setServers(list);
      } catch {}
    }, period);
    return () => clearInterval(id);
  }, [phase, servers]);

  // Silent background auto-updater polling (Electron only). Flips the top-bar
  // "Manager Update" button into its flashing state when GitHub has a new
  // release. No modal/toast — user decides when to click.
  useEffect(() => {
    if (!window?.lgss?.onUpdatePoll) return undefined;
    const off = window.lgss.onUpdatePoll((payload) => {
      setAppVersion((v) => ({
        ...v,
        current: payload.currentVersion || v.current,
        latest: payload.latestVersion || v.latest,
        update_available: !!payload.updateAvailable,
      }));
    });
    return off;
  }, []);

  const handleAdminAccept = async () => {
    const s = await endpoints.updateSetup({ is_admin_confirmed: true });
    setSetup(s);
    setPhase(s.completed ? "workspace" : "setup");
  };

  const handleAdminDecline = () => { setPhase("declined"); };

  const handleSetupComplete = async () => {
    const s = await endpoints.getSetup();
    setSetup(s);
    setPhase("workspace");
    toast.success(t("toast_setup_complete"));
  };

  const handleAddServer = async () => {
    try {
      const s = await endpoints.createServer({});
      setServers((arr) => [...arr, s]);
      setActiveId(s.id);
      toast.success(t("toast_server_created"));
    } catch (e) {
      toast.error(String(e.response?.data?.detail || e.message || e));
    }
  };

  const handleDelete = async (id) => {
    await endpoints.deleteServer(id);
    setServers((arr) => arr.filter((s) => s.id !== id));
    if (activeId === id) {
      const remaining = servers.filter((s) => s.id !== id);
      const nextId = remaining[0]?.id || null;
      setActiveId(nextId);
      if (!nextId) setView("dashboard");
    }
    toast(t("toast_server_deleted"));
  };

  const handleServerChange = (updated) => {
    setServers((arr) => arr.map((s) => (s.id === updated.id ? updated : s)));
  };

  const handleResetSetup = async () => {
    setServers([]);
    setActiveId(null);
    setView("dashboard");
    await load();
  };

  const handleManagerUpdate = async () => {
    // If we're running inside Electron packaged build, open the auto-updater
    // modal which uses GitHub Releases via electron-updater. In browser/dev,
    // fall back to the legacy backend-polled manager update endpoint.
    if (window?.lgss?.checkForUpdates) {
      setUpdateModalOpen(true);
      return;
    }
    if (!appVersion.update_available) {
      toast(t("manager_no_update"));
      return;
    }
    await endpoints.applyManagerUpdate();
    toast.success(t("manager_update_applied"));
    const v = await endpoints.getAppVersion();
    setAppVersion(v);
  };

  const refreshServers = async () => {
    const list = await endpoints.listServers();
    setServers(list);
  };

  const handleOpenServer = (server) => {
    if (!server.installed) {
      toast.error(t("install_required_title"));
      return;
    }
    setActiveId(server.id);
    setView("configs");
  };

  const handleNavigate = (key) => {
    if (key === "configs") {
      const target = servers.find((s) => s.id === activeId && s.installed) || servers.find((s) => s.installed);
      if (!target) {
        toast.error(t("install_required_title"));
        return;
      }
      setActiveId(target.id);
    }
    setView(key);
  };

  if (phase === "loading") {
    return (
      <div className="h-full w-full flex items-center justify-center bg-bg-deep">
        <div className="text-center">
          <div className="font-mono text-[11px] uppercase tracking-[0.3em] text-accent-brand mb-2">
            {t("initializing")}
          </div>
          <div className="text-dim text-xs font-mono">{t("loading")}</div>
        </div>
      </div>
    );
  }

  if (phase === "declined") {
    return (
      <div className="h-full w-full flex flex-col items-center justify-center p-8 text-center bg-bg-deep" data-testid="declined-screen">
        <h1 className="heading-stencil text-2xl">{t("close")}</h1>
        <p className="text-dim text-sm mt-3 max-w-md">{t("admin_prompt_body")}</p>
        <button className="btn-primary mt-6" onClick={() => setPhase("admin")} data-testid="retry-admin-btn">
          {t("admin_prompt_title")}
        </button>
      </div>
    );
  }

  if (phase === "admin") {
    return <AdminPrompt onAccept={handleAdminAccept} onDecline={handleAdminDecline} />;
  }

  if (phase === "setup") {
    return <DiskSelectionWizard onComplete={handleSetupComplete} />;
  }

  const active = servers.find((s) => s.id === activeId);

  return (
    <div className="h-full w-full flex flex-col bg-bg">
      <TopBar
        isAdmin={isAdmin}
        servers={servers}
        managerUpdateAvailable={appVersion.update_available}
        managerPath={setup?.manager_path}
        currentView={view}
        onNavigate={handleNavigate}
        onResetSetup={handleResetSetup}
        onManagerUpdate={handleManagerUpdate}
      />

      {dbOffline && <DbOfflineBanner onRetry={async () => { setDbOffline(false); await load(); }} />}

      <div className="flex-1 flex overflow-hidden">
        {view === "dashboard" && (
          <DashboardView
            servers={servers}
            managerPath={setup?.manager_path}
            onAdd={handleAddServer}
            onOpen={handleOpenServer}
            onChange={handleServerChange}
            onDelete={handleDelete}
            onRefresh={refreshServers}
          />
        )}

        {view === "configs" && (
          active ? (
            <ServerDashboard
              server={active}
              servers={servers}
              schema={schema}
              onChange={handleServerChange}
              onDelete={handleDelete}
              onBack={() => setView("dashboard")}
              onSelectServer={(id) => setActiveId(id)}
            />
          ) : (
            <NoServerSelected t={t} onGoDashboard={() => setView("dashboard")} />
          )
        )}

        {view === "logs" && <LogsView servers={servers} />}
        {view === "players" && <PlayersView servers={servers} />}
        {view === "backups" && <BackupsView servers={servers} />}
      </div>

      <ManagerUpdateModal open={updateModalOpen} onClose={() => setUpdateModalOpen(false)} />
    </div>
  );
};

const NoServerSelected = ({ t, onGoDashboard }) => (
  <div className="flex-1 flex items-center justify-center bg-bg" data-testid="no-server-selected">
    <div className="text-center">
      <h2 className="heading-stencil text-xl mb-4">{t("command_select_server")}</h2>
      <button className="btn-primary" onClick={onGoDashboard}>
        {t("back_to_dashboard")}
      </button>
    </div>
  </div>
);

// v1.0.37d — Sticky banner shown when /api/setup returns 503 MONGO_OFFLINE.
// Replaces the previous "Uncaught runtime error" red overlay with a
// copy-paste actionable hint so the admin can start mongod and recover.
const DbOfflineBanner = ({ onRetry }) => (
  <div
    className="border-b-2 border-warning bg-warning/5 px-4 py-2.5 flex items-center gap-3 font-mono text-[11px]"
    style={{ color: "var(--warning)", borderColor: "var(--warning)", background: "color-mix(in srgb, var(--warning) 8%, transparent)" }}
    data-testid="db-offline-banner"
  >
    <span className="text-base">⚠</span>
    <div className="flex-1 leading-tight">
      <div className="font-bold uppercase tracking-widest">Database Unreachable</div>
      <div className="opacity-90 mt-0.5">
        The local MongoDB service is not running. Open <b>services.msc</b> →
        start <b>MongoDB Server</b>, or run{" "}
        <code className="px-1 bg-bg-deep border border-warning/40">net start MongoDB</code>{" "}
        in an admin PowerShell, then click Retry.
      </div>
    </div>
    <button onClick={onRetry} className="btn-secondary px-3 py-1.5 text-[10px]" data-testid="db-offline-retry-btn">
      Retry
    </button>
  </div>
);

export default function App() {
  return (
    <ThemeProvider>
      <I18nProvider>
        <div className="App">
          <Shell />
          <Toaster
            theme="dark"
            position="bottom-right"
            toastOptions={{
              style: {
                background: "var(--surface)",
                border: "1px solid var(--border-strong)",
                color: "var(--text)",
                borderRadius: 0,
                fontFamily: "var(--font-display)",
                letterSpacing: "0.04em",
              },
            }}
          />
        </div>
      </I18nProvider>
    </ThemeProvider>
  );
}
