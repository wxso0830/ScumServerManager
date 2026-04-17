import React, { useState } from "react";
import { Palette, Languages, Gift, Power, RotateCcw, Check, Play, RefreshCw, Download, Wrench } from "lucide-react";
import { useTheme } from "../providers/ThemeProvider";
import { useI18n } from "../providers/I18nProvider";
import { endpoints } from "../lib/api";
import { toast } from "sonner";

const themeLabels = {
  tactical: "theme_tactical",
  ghost: "theme_ghost",
  jungle: "theme_jungle",
  wastelander: "theme_wastelander",
};

const Popover = ({ open, onClose, children }) => {
  if (!open) return null;
  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <div className="absolute right-0 top-full mt-2 z-50 w-56 panel bg-surface shadow-xl" style={{ background: "var(--surface)" }}>
        {children}
      </div>
    </>
  );
};

export const TopBar = ({ isAdmin, servers = [], managerUpdateAvailable = false, onResetSetup, onServersChanged, onManagerUpdate }) => {
  const { theme, setTheme, themes } = useTheme();
  const { lang, setLang, t } = useI18n();
  const [themeOpen, setThemeOpen] = useState(false);
  const [langOpen, setLangOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const handleStartAll = async () => {
    if (busy) return;
    setBusy(true);
    const stopped = servers.filter((s) => s.status !== "Running");
    toast.success(`${t("starting_all")} · ${stopped.length}`);
    for (const s of stopped) {
      try { await endpoints.startServer(s.id); } catch (_) {}
    }
    onServersChanged?.();
    setBusy(false);
  };

  const handleUpdateAll = async () => {
    if (busy) return;
    setBusy(true);
    toast(`${t("updating_all")} · ${servers.length}`);
    for (const s of servers) {
      try { await endpoints.updateServer(s.id); } catch (_) {}
    }
    onServersChanged?.();
    toast.success(t("toast_update_done"));
    setBusy(false);
  };

  return (
    <header className="h-16 bg-surface border-b border-brand flex items-center px-4 shrink-0 relative" data-testid="top-bar">
      {/* Brand */}
      <div className="flex items-center gap-3 pr-4 border-r border-brand h-full">
        <div className="h-10 w-10 flex items-center justify-center rounded-sm relative" style={{ background: "linear-gradient(135deg, var(--primary), var(--primary-active))" }}>
          <Power size={18} style={{ color: "#0a0a0a" }} />
          <div className="absolute inset-0 border border-white/10 rounded-sm pointer-events-none" />
        </div>
        <div className="leading-none">
          <div className="font-mono text-[10px] tracking-[0.22em] text-dim">LEGENDARY GAMING</div>
          <div className="font-bold text-base tracking-wider text-brand mt-0.5" style={{ letterSpacing: "0.08em" }}>
            SCUM SERVER MANAGER
          </div>
        </div>
      </div>

      {/* Status column */}
      <div className="flex-1 flex items-center justify-center gap-8">
        <div className="text-center px-2 border-r border-brand">
          <div className="label-overline">{t("version")}</div>
          <div className="font-mono text-sm text-brand">1.0.0</div>
        </div>
        <div className="text-center">
          <div className="label-overline">{t("auto_backup")}</div>
          <div className="font-mono text-sm text-success">{t("ready")}</div>
        </div>
        <div className="text-center">
          <div className="label-overline">{t("discord_bot")}</div>
          <div className="font-mono text-sm text-warning">{t("disabled")}</div>
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2">
        <button
          className="tactical-btn flex items-center gap-2 text-xs"
          onClick={handleStartAll}
          disabled={busy || servers.length === 0}
          data-testid="start-all-btn"
          title={t("start_all")}
        >
          <Play size={14} /> {t("start_all")}
        </button>
        <button
          className="ghost-btn flex items-center gap-2 text-xs"
          onClick={handleUpdateAll}
          disabled={busy || servers.length === 0}
          data-testid="update-all-servers-btn"
          title={t("update_all_servers")}
        >
          <Download size={14} /> {t("update_all_servers")}
        </button>

        <div className="w-px h-6 bg-brand mx-1" />

        <button
          className={`ghost-btn flex items-center gap-2 text-xs relative ${managerUpdateAvailable ? "manager-update-pulse" : ""}`}
          onClick={onManagerUpdate}
          data-testid="manager-update-btn"
          title={managerUpdateAvailable ? t("manager_update_available") : t("manager_check_update")}
        >
          <Wrench size={14} /> {t("manager_update")}
          {managerUpdateAvailable && <span className="absolute -top-1 -right-1 h-2 w-2 rounded-full bg-primary-brand" />}
        </button>

        <div className="w-px h-6 bg-brand mx-1" />

        <div className="flex items-center gap-1 px-2 py-1 rounded-sm border border-brand bg-surface-2" data-testid="admin-badge">
          <span className={`h-2 w-2 rounded-sm ${isAdmin ? "bg-success" : "bg-warning"} status-dot-anim`} />
          <span className="label-overline">{isAdmin ? t("admin_confirmed") : t("admin_not_confirmed")}</span>
        </div>

        <div className="relative">
          <button className="icon-btn" onClick={() => { setThemeOpen((v) => !v); setLangOpen(false); }} data-testid="theme-picker-btn">
            <Palette size={18} />
          </button>
          <Popover open={themeOpen} onClose={() => setThemeOpen(false)}>
            <div className="p-1">
              <div className="label-overline px-3 py-2">{t("theme")}</div>
              {themes.map((tKey) => (
                <button key={tKey} onClick={() => { setTheme(tKey); setThemeOpen(false); }} data-testid={`theme-option-${tKey}`}
                  className="w-full flex items-center justify-between px-3 py-2 text-sm hover:bg-surface-2 transition-colors">
                  <span className="text-brand">{t(themeLabels[tKey])}</span>
                  {theme === tKey && <Check size={14} className="text-primary-brand" />}
                </button>
              ))}
            </div>
          </Popover>
        </div>

        <div className="relative">
          <button className="icon-btn" onClick={() => { setLangOpen((v) => !v); setThemeOpen(false); }} data-testid="lang-picker-btn">
            <Languages size={18} />
          </button>
          <Popover open={langOpen} onClose={() => setLangOpen(false)}>
            <div className="p-1">
              <div className="label-overline px-3 py-2">{t("language")}</div>
              {[["en", "English"], ["tr", "Türkçe"]].map(([code, label]) => (
                <button key={code} onClick={() => { setLang(code); setLangOpen(false); }} data-testid={`lang-option-${code}`}
                  className="w-full flex items-center justify-between px-3 py-2 text-sm hover:bg-surface-2 transition-colors">
                  <span className="text-brand">{label}</span>
                  {lang === code && <Check size={14} className="text-primary-brand" />}
                </button>
              ))}
            </div>
          </Popover>
        </div>

        <button className="icon-btn" title="Reset Setup" onClick={async () => { await endpoints.resetSetup(); onResetSetup?.(); }} data-testid="reset-setup-btn">
          <RotateCcw size={16} />
        </button>
      </div>

      <style>{`
        @keyframes mgr-pulse-border {
          0%, 100% { box-shadow: 0 0 0 0 rgba(var(--primary-rgb, 0, 122, 255), 0), inset 0 0 0 1px var(--primary); border-color: var(--primary); }
          50% { box-shadow: 0 0 0 6px rgba(var(--primary-rgb, 0, 122, 255), 0.15), inset 0 0 0 1px var(--primary); border-color: var(--primary); }
        }
        .manager-update-pulse {
          border-color: var(--primary) !important;
          color: var(--primary) !important;
          animation: mgr-pulse-border 1.2s ease-in-out infinite;
        }
      `}</style>
    </header>
  );
};
