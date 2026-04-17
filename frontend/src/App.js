import React, { useCallback, useEffect, useState } from "react";
import { Toaster, toast } from "sonner";
import "./App.css";
import { ThemeProvider } from "./providers/ThemeProvider";
import { I18nProvider, useI18n } from "./providers/I18nProvider";
import { AdminPrompt } from "./components/AdminPrompt";
import { DiskSelectionWizard } from "./components/DiskSelectionWizard";
import { TopBar } from "./components/TopBar";
import { Sidebar } from "./components/Sidebar";
import { EmptyWorkspace } from "./components/EmptyWorkspace";
import { ServerDashboard } from "./components/ServerDashboard";
import { SplashScreen } from "./components/SplashScreen";
import { endpoints } from "./lib/api";

const Shell = () => {
  const { t } = useI18n();
  const [phase, setPhase] = useState("splash"); // splash | loading | admin | setup | workspace | declined
  const [isAdmin, setIsAdmin] = useState(false);
  const [setup, setSetup] = useState(null);
  const [servers, setServers] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [schema, setSchema] = useState(null);
  const [appVersion, setAppVersion] = useState({ current: "1.0.0", latest: "1.0.0", update_available: false });

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

  useEffect(() => {
    if (phase !== "splash") load();
  }, [load, phase]);

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
    const s = await endpoints.createServer({});
    setServers((arr) => [...arr, s]);
    setActiveId(s.id);
    toast.success(t("toast_server_created"));
  };

  const handleDelete = async (id) => {
    await endpoints.deleteServer(id);
    setServers((arr) => arr.filter((s) => s.id !== id));
    if (activeId === id) {
      const remaining = servers.filter((s) => s.id !== id);
      setActiveId(remaining[0]?.id || null);
    }
    toast(t("toast_server_deleted"));
  };

  const handleServerChange = (updated) => {
    setServers((arr) => arr.map((s) => (s.id === updated.id ? updated : s)));
  };

  const handleResetSetup = async () => {
    setServers([]);
    setActiveId(null);
    await load();
  };

  const handleManagerUpdate = async () => {
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

  if (phase === "splash") {
    return <SplashScreen onDone={() => setPhase("loading")} />;
  }

  if (phase === "loading") {
    return <div className="h-full w-full flex items-center justify-center text-dim font-mono text-sm">{t("loading")}</div>;
  }

  if (phase === "declined") {
    return (
      <div className="h-full w-full flex flex-col items-center justify-center p-8 text-center theme-bg" data-testid="declined-screen">
        <div className="absolute inset-0 bg-bg/90" />
        <div className="relative z-10">
          <h1 className="text-2xl font-bold text-brand">{t("close")}</h1>
          <p className="text-dim text-sm mt-2 max-w-md">{t("admin_prompt_body")}</p>
          <button className="tactical-btn mt-5" onClick={() => setPhase("admin")} data-testid="retry-admin-btn">
            {t("admin_prompt_title")}
          </button>
        </div>
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
    <div className="h-full w-full flex flex-col">
      <TopBar
        isAdmin={isAdmin}
        servers={servers}
        managerUpdateAvailable={appVersion.update_available}
        onResetSetup={handleResetSetup}
        onServersChanged={refreshServers}
        onManagerUpdate={handleManagerUpdate}
      />
      <div className="flex-1 flex overflow-hidden">
        <Sidebar servers={servers} activeId={activeId} onSelect={setActiveId} onAdd={handleAddServer} managerPath={setup?.manager_path} />
        {active ? (
          <ServerDashboard server={active} schema={schema} onChange={handleServerChange} onDelete={handleDelete} />
        ) : (
          <EmptyWorkspace onAdd={handleAddServer} />
        )}
      </div>
    </div>
  );
};

export default function App() {
  return (
    <ThemeProvider>
      <I18nProvider>
        <div className="App">
          <Shell />
          <Toaster theme="dark" position="bottom-right" richColors />
        </div>
      </I18nProvider>
    </ThemeProvider>
  );
}
