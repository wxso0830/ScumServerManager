import React, { useState } from "react";
import {
  Palette, Languages, Check, Wrench, ShieldCheck, ShieldAlert,
  RotateCcw, Activity, Server, HardDrive, Terminal, LayoutDashboard, SlidersHorizontal, ScrollText, Users, Archive,
  Globe, X,
} from "lucide-react";
import { useTheme } from "../providers/ThemeProvider";
import { useI18n, LANG_META } from "../providers/I18nProvider";
import { endpoints } from "../lib/api";
import { ConfirmModal } from "./ConfirmModal";

const themeLabels = {
  bunker: "theme_bunker",
  "neon-grid": "theme_neon-grid",
  carbon: "theme_carbon",
  toxic: "theme_toxic",
  inferno: "theme_inferno",
  "arctic-storm": "theme_arctic-storm",
  royal: "theme_royal",
  synthwave: "theme_synthwave",
};

// 3-color swatches: [accent, surface, text] — quick visual preview.
const themeSwatches = {
  bunker:         ["#E65100", "#1E1E1E", "#F5F5F5"],
  "neon-grid":    ["#FF2DD1", "#14072A", "#F5E9FF"],
  carbon:         ["#FFB627", "#161618", "#ECECEE"],
  toxic:          ["#B6FF00", "#0B1A0E", "#E8FFD4"],
  inferno:        ["#FF3B1F", "#1B0908", "#FFE5DD"],
  "arctic-storm": ["#7DD3FC", "#0B1626", "#F0F8FF"],
  royal:          ["#D4AF37", "#141414", "#F5ECCC"],
  synthwave:      ["#FF4FB8", "#1B073D", "#FBE5FF"],
};

const Popover = ({ open, onClose, children }) => {
  if (!open) return null;
  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <div className="absolute right-0 top-full mt-1 z-[60] w-64 panel bg-surface shadow-2xl corner-brackets">
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
            className="h-12 w-12 relative overflow-hidden flex items-center justify-center bg-bg-deep"
            style={{
              clipPath: "polygon(10% 0, 100% 0, 90% 100%, 0 100%)",
              border: "1px solid var(--accent)",
            }}
          >
            <img
              src={`${process.env.PUBLIC_URL || ""}/icon.png`}
              alt="LGSS"
              className="h-full w-full object-cover"
              draggable="false"
              onError={(e) => {
                // In packaged Electron, file:///icon.png resolves to disk
                // root and 404s. Fall back to a relative path which works
                // when index.html is loaded via file:// from the build dir.
                if (!e.currentTarget.dataset.fallback) {
                  e.currentTarget.dataset.fallback = "1";
                  e.currentTarget.src = "./icon.png";
                }
              }}
            />
          </div>
          <div className="leading-none">
            <div className="font-mono text-[9px] tracking-[0.3em] text-muted">LEGENDARY GAMING</div>
            <div className="heading-stencil text-[15px] text-brand mt-1" style={{ letterSpacing: "0.12em" }}>
              SCUM SERVER MANAGER
            </div>
            <div className="font-mono text-[9px] tracking-[0.22em] text-accent-brand mt-1">
              v1.0.20
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
            className={`relative flex items-center gap-2 px-3 py-2 border font-mono text-[11px] uppercase tracking-widest transition-all ${
              managerUpdateAvailable
                ? "border-accent-brand text-accent-brand update-btn-pulse"
                : "border-brand text-dim hover:text-brand hover:border-accent-brand/60"
            }`}
            onClick={onManagerUpdate}
            data-testid="manager-update-btn"
            title={managerUpdateAvailable ? t("manager_update_available") : t("manager_check_update")}
          >
            <Wrench size={13} className={managerUpdateAvailable ? "animate-spin-slow" : ""} />
            {managerUpdateAvailable ? t("manager_update_available_short") : t("manager_update")}
            {managerUpdateAvailable && (
              <span className="absolute -top-1 -right-1 h-2.5 w-2.5 rounded-full bg-accent-brand update-dot-pulse" />
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
            {/* Center modal — same UX as the language picker for consistency
                and so the list never gets clipped against the viewport edge. */}
            {themeOpen && (
              <div className="fixed inset-0 z-[100] flex items-center justify-center" data-testid="theme-modal">
                <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setThemeOpen(false)} />
                <div className="relative bg-surface border border-accent-brand shadow-2xl w-[360px] max-w-[92vw] max-h-[80vh] overflow-y-auto scrollbar-thin corner-brackets">
                  <div className="label-accent px-4 py-3 border-b border-brand sticky top-0 bg-surface flex items-center justify-between">
                    <span>{t("theme")}</span>
                    <button onClick={() => setThemeOpen(false)} className="text-dim hover:text-brand" data-testid="theme-modal-close">
                      <X size={14} />
                    </button>
                  </div>
                  <div className="p-1">
                    {themes.map((tKey) => {
                      const sw = themeSwatches[tKey] || ["#888", "#222", "#eee"];
                      const active = theme === tKey;
                      return (
                        <button
                          key={tKey}
                          onClick={() => { setTheme(tKey); setThemeOpen(false); }}
                          data-testid={`theme-option-${tKey}`}
                          className={`w-full flex items-center justify-between px-4 py-3 text-sm hover:bg-surface-2 transition-colors font-display uppercase tracking-wider text-xs ${active ? "bg-accent-soft" : ""}`}
                        >
                          <span className="flex items-center gap-3">
                            {/* Mini color preview — accent / surface / text */}
                            <span className="flex items-center gap-0 border border-strong" style={{ height: 18 }}>
                              <span style={{ width: 12, height: 18, background: sw[0] }} />
                              <span style={{ width: 12, height: 18, background: sw[1] }} />
                              <span style={{ width: 12, height: 18, background: sw[2] }} />
                            </span>
                            <span className="text-brand">{t(themeLabels[tKey]) || tKey.toUpperCase()}</span>
                          </span>
                          {active && <Check size={14} className="text-accent-brand flex-shrink-0" />}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}
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
            {/* Center modal — earlier popover-style dropdown was getting
                clipped against the top of the viewport when the user had
                the manager near the top edge of their monitor. A modal is
                fully position-independent of the trigger button. */}
            {langOpen && (
              <div className="fixed inset-0 z-[100] flex items-center justify-center" data-testid="lang-modal">
                <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setLangOpen(false)} />
                <div className="relative bg-surface border border-accent-brand shadow-2xl w-[320px] max-w-[92vw] max-h-[80vh] overflow-y-auto scrollbar-thin corner-brackets">
                  <div className="label-accent px-4 py-3 border-b border-brand sticky top-0 bg-surface flex items-center justify-between">
                    <span>{t("language")}</span>
                    <button onClick={() => setLangOpen(false)} className="text-dim hover:text-brand" data-testid="lang-modal-close">
                      <X size={14} />
                    </button>
                  </div>
                  <div className="p-1">
                    {Object.entries(LANG_META).map(([code, meta]) => (
                      <button
                        key={code}
                        onClick={() => { setLang(code); setLangOpen(false); }}
                        data-testid={`lang-option-${code}`}
                        className={`w-full flex items-center justify-between px-4 py-3 text-sm hover:bg-surface-2 transition-colors font-display uppercase tracking-wider text-xs ${lang === code ? "bg-accent-soft" : ""}`}
                      >
                        <span className="flex items-center gap-3">
                          <span className="font-mono text-[11px] text-dim w-7">{code.toUpperCase()}</span>
                          <span className="text-base leading-none">{meta.flag}</span>
                          <span className="text-brand normal-case">{meta.label}</span>
                        </span>
                        {lang === code && <Check size={14} className="text-accent-brand flex-shrink-0" />}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Discord — inline SVG of the Discord clyde mark.
              Drawn with `currentColor` so it inherits the icon-btn text color
              (matches theme/lang/reset icons next to it). The Discord logo is
              originally a filled monochrome mark, so unlike most lucide icons
              we fill instead of stroke — but a single color keeps it visually
              consistent with the other line-art icons in the toolbar. */}
          <button
            className="icon-btn"
            title={t("open_discord")}
            onClick={() => window.open("https://discord.gg/ZBzTRNbTy3", "_blank", "noopener,noreferrer")}
            data-testid="topbar-discord-btn"
          >
            <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
              <path d="M20.317 4.37a19.79 19.79 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" />
            </svg>
          </button>

          {/* Feedback — Legendary Hub portal. Globe lucide icon, sized to
              match the other toolbar icons. We use the line-art Globe instead
              of a filled image so it stays in the same visual register as
              the Palette / Languages / RotateCcw icons. */}
          <button
            className="icon-btn"
            title={t("feedback")}
            onClick={() => window.open("https://legendaryhub.vip/", "_blank", "noopener,noreferrer")}
            data-testid="topbar-feedback-btn"
          >
            <Globe size={17} />
          </button>

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
