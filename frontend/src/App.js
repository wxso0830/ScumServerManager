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
  const [appVersion, setAppVersion] = useState({ current: "1.0.0", latest: "1.0.0", update_available: false });
  const [view, setView] = useState("dashboard"); // dashboard | configs | logs
  const [updateModalOpen, setUpdateModalOpen] = useState(false);

  const load = useCallback(async () => {
    const [adminRes, setupRes, serverList, schemaRes, versionRes] = await Promise.all([
      endpoints.adminCheck().catch(() => ({ is_admin: false })),
      endpoints.getSetup(),
      endpoints.listServers(),
      endpoints.getSchema().catch(() => null),
      endpoints.getAppVersion().catch(() => ({ current: "1.0.0", latest: "1.0.0", update_available: false })),
    ]);
    setIsAdmin(adminRes.is_admin);
    setSetup(setupRes);
    setServers(serverList);
    setSchema(schemaRes);
    setAppVersion(versionRes);
    if (!setupRes.is_admin_confirmed) {
      setPhase("admin");
    } else if (!setupRes.completed) {
      setPhase("setup");
    } else {
      setPhase("workspace");
      if (serverList.length > 0) setActiveId(serverList[0].id);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

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
