import React, { useState } from "react";
import {
  Palette, Languages, Check, Wrench, ShieldCheck, ShieldAlert,
  RotateCcw, Activity, Server, HardDrive, Terminal, LayoutDashboard, SlidersHorizontal, ScrollText, Users, Archive,
} from "lucide-react";
import { useTheme } from "../providers/ThemeProvider";
import { useI18n } from "../providers/I18nProvider";
import { endpoints } from "../lib/api";
import { ConfirmModal } from "./ConfirmModal";

const themeLabels = {
  blacksite: "theme_blacksite",
  bunker: "theme_bunker",
  ghost: "theme_ghost",
  wastelander: "theme_wastelander",
};

const Popover = ({ open, onClose, children }) => {
  if (!open) return null;
  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <div className="absolute right-0 top-full mt-1 z-50 w-60 panel bg-surface shadow-2xl corner-brackets">
        {children}
      </div>
    </>
  );
};

export const TopBar = ({
  isAdmin,
  servers = [],
  managerUpdateAvailable = false,
  managerPath,
  currentView = "dashboard",
  onNavigate,
  onResetSetup,
  onManagerUpdate,
}) => {
  const { theme, setTheme, themes } = useTheme();
  const { lang, setLang, t } = useI18n();
  const [themeOpen, setThemeOpen] = useState(false);
  const [langOpen, setLangOpen] = useState(false);
  // Reset is a 2-step destructive action: first show the "what will happen"
  // warning, then a final "are you sure" with a 3s countdown-style gate so
  // users can't double-click through both.
  const [resetStep, setResetStep] = useState(0);          // 0=closed, 1=first, 2=final

  const running = servers.filter((s) => s.status === "Running").length;
  const total = servers.length;

  const navItems = [
    { key: "dashboard", label: t("nav_dashboard"), icon: LayoutDashboard },
    { key: "configs", label: t("nav_configs"), icon: SlidersHorizontal },
    { key: "players", label: t("nav_players"), icon: Users },
    { key: "logs", label: t("nav_logs"), icon: ScrollText },
    { key: "backups", label: t("nav_backups"), icon: Archive },
  ];

  return (
    <header className="relative z-30" data-testid="top-bar">
      {/* ======= PRIMARY NAV ======= */}
      <div className="h-[72px] bg-bg-deep border-b-2 border-brand flex items-stretch px-5 relative">
        {/* Brand */}
        <div className="flex items-center gap-3 pr-6 mr-6 border-r border-brand">
          <div
            className="h-12 w-12 relative flex items-center justify-center"
            style={{
              background: "linear-gradient(135deg, var(--accent) 0%, var(--accent-hover) 100%)",
              clipPath: "polygon(10% 0, 100% 0, 90% 100%, 0 100%)",
            }}
          >
            <Terminal size={20} style={{ color: "#0A0A0C" }} strokeWidth={2.5} />
          </div>
          <div className="leading-none">
            <div className="font-mono text-[9px] tracking-[0.3em] text-muted">LEGENDARY GAMING</div>
            <div className="heading-stencil text-[15px] text-brand mt-1" style={{ letterSpacing: "0.12em" }}>
              SCUM SERVER MANAGER
            </div>
            <div className="font-mono text-[9px] tracking-[0.22em] text-accent-brand mt-1">
              v1.0.0
            </div>
          </div>
        </div>

        {/* Center Navigation */}
        <nav className="flex items-stretch" data-testid="top-nav">
          {navItems.map((n) => {
            const Icon = n.icon;
            const active = currentView === n.key;
            return (
              <button
                key={n.key}
                onClick={() => onNavigate?.(n.key)}
                data-testid={`nav-${n.key}-btn`}
                className={`nav-tab flex items-center gap-2.5 ${active ? "active" : ""}`}
              >
                <Icon size={14} />
                <span>{n.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="flex-1" />

        {/* Right Actions */}
        <div className="flex items-center gap-2">
          <button
            className={`btn-ghost flex items-center gap-2 relative ${managerUpdateAvailable ? "text-accent-brand" : ""}`}
            onClick={onManagerUpdate}
            data-testid="manager-update-btn"
            title={managerUpdateAvailable ? t("manager_update_available") : t("manager_check_update")}
          >
            <Wrench size={13} /> {t("manager_update")}
            {managerUpdateAvailable && (
              <span className="absolute -top-0.5 -right-0.5 h-2 w-2 bg-accent-brand pulse-ring" />
            )}
          </button>

          <div className="relative">
            <button
              className="icon-btn"
              onClick={() => { setThemeOpen((v) => !v); setLangOpen(false); }}
              data-testid="theme-picker-btn"
              title={t("theme")}
            >
              <Palette size={17} />
            </button>
            <Popover open={themeOpen} onClose={() => setThemeOpen(false)}>
              <div className="p-1">
                <div className="label-accent px-3 py-2">{t("theme")}</div>
                {themes.map((tKey) => (
                  <button
                    key={tKey}
                    onClick={() => { setTheme(tKey); setThemeOpen(false); }}
                    data-testid={`theme-option-${tKey}`}
                    className="w-full flex items-center justify-between px-3 py-2 text-sm hover:bg-surface-2 transition-colors font-display uppercase tracking-wider text-xs"
                  >
                    <span className="text-brand">{t(themeLabels[tKey])}</span>
                    {theme === tKey && <Check size={14} className="text-accent-brand" />}
                  </button>
                ))}
              </div>
            </Popover>
          </div>

          <div className="relative">
            <button
              className="icon-btn"
              onClick={() => { setLangOpen((v) => !v); setThemeOpen(false); }}
              data-testid="lang-picker-btn"
              title={t("language")}
            >
              <Languages size={17} />
            </button>
            <Popover open={langOpen} onClose={() => setLangOpen(false)}>
              <div className="p-1">
                <div className="label-accent px-3 py-2">{t("language")}</div>
                {[["en", "English"], ["tr", "Türkçe"]].map(([code, label]) => (
                  <button
                    key={code}
                    onClick={() => { setLang(code); setLangOpen(false); }}
                    data-testid={`lang-option-${code}`}
                    className="w-full flex items-center justify-between px-3 py-2 text-sm hover:bg-surface-2 transition-colors font-display uppercase tracking-wider text-xs"
                  >
                    <span className="text-brand">{label}</span>
                    {lang === code && <Check size={14} className="text-accent-brand" />}
                  </button>
                ))}
              </div>
            </Popover>
          </div>

          <button
            className="icon-btn"
            title={t("reset_setup_btn_title")}
            onClick={() => setResetStep(1)}
            data-testid="reset-setup-btn"
          >
            <RotateCcw size={16} />
          </button>
        </div>
      </div>

      {/* 2-step confirmation for the destructive Reset Setup action */}
      <ConfirmModal
        open={resetStep === 1}
        title={t("reset_setup_title")}
        body={t("reset_setup_body_1")}
        confirmLabel={t("reset_setup_continue")}
        cancelLabel={t("cancel") || "İptal"}
        onConfirm={() => setResetStep(2)}
        onCancel={() => setResetStep(0)}
        destructive={true}
        testId="reset-setup-confirm-1"
      />
      <ConfirmModal
        open={resetStep === 2}
        title={t("reset_setup_final_title")}
        body={t("reset_setup_body_2")}
        confirmLabel={t("reset_setup_confirm_final")}
        cancelLabel={t("cancel") || "İptal"}
        onConfirm={async () => {
          setResetStep(0);
          try {
            await endpoints.resetSetup();
            onResetSetup?.();
          } catch {}
        }}
        onCancel={() => setResetStep(0)}
        destructive={true}
        testId="reset-setup-confirm-2"
      />

      {/* ======= STATUS RIBBON (tactical HUD) ======= */}
      <div className="h-9 bg-bg border-b border-brand flex items-center px-5 gap-6 font-mono text-[11px] text-dim" data-testid="status-ribbon">
        <div className="flex items-center gap-2">
          <span className="status-led running" />
          <span className="text-muted uppercase tracking-widest">{t("network_live")}</span>
        </div>

        <div className="flex items-center gap-2">
          <HardDrive size={12} className="text-accent-brand" />
          <span className="text-muted uppercase tracking-widest">{t("disk_connected")}:</span>
          <span className="text-brand truncate max-w-[280px]" title={managerPath}>
            {managerPath || "—"}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <Server size={12} className="text-accent-brand" />
          <span className="text-muted uppercase tracking-widest">{t("fleet_total")}:</span>
          <span className="text-brand">{running}/{total}</span>
        </div>

        <div className="flex items-center gap-2">
          <Activity size={12} className="text-accent-brand" />
          <span className="text-muted uppercase tracking-widest">{t("system_status")}:</span>
          <span className="text-success">{t("ops_ready")}</span>
        </div>

        <div className="flex-1" />

        <div className="flex items-center gap-2 px-2 py-0.5 border border-strong" data-testid="admin-badge">
          {isAdmin ? (
            <ShieldCheck size={12} className="text-success" />
          ) : (
            <ShieldAlert size={12} className="text-warning" />
          )}
          <span className="uppercase tracking-widest text-[10px]">
            {isAdmin ? t("admin_confirmed") : t("admin_not_confirmed")}
          </span>
        </div>
      </div>
    </header>
  );
};
