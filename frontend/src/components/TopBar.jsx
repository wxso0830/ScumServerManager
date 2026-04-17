import React, { useState } from "react";
import { Palette, Languages, Gift, ExternalLink, Power, RotateCcw, Check } from "lucide-react";
import { useTheme } from "../providers/ThemeProvider";
import { useI18n } from "../providers/I18nProvider";
import { endpoints } from "../lib/api";

const themeLabels = {
  wasteland: "theme_wasteland",
  cyber_neon: "theme_cyber_neon",
  obsidian: "theme_obsidian",
  amber_crt: "theme_amber_crt",
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

export const TopBar = ({ isAdmin, onResetSetup }) => {
  const { theme, setTheme, themes } = useTheme();
  const { lang, setLang, t } = useI18n();
  const [themeOpen, setThemeOpen] = useState(false);
  const [langOpen, setLangOpen] = useState(false);

  return (
    <header className="h-14 bg-surface border-b border-brand flex items-center px-4 shrink-0" data-testid="top-bar">
      <div className="flex items-center gap-3 pr-4 border-r border-brand h-full">
        <div className="h-8 w-8 flex items-center justify-center rounded-sm border border-primary-brand bg-primary-soft">
          <Power size={14} className="text-primary-brand" />
        </div>
        <div>
          <div className="text-sm font-bold tracking-wider text-brand font-mono leading-none">LGSS</div>
          <div className="label-overline leading-none mt-0.5">{t("subtitle")}</div>
        </div>
      </div>

      <div className="flex-1 flex items-center justify-center gap-8">
        <div className="text-center">
          <div className="label-overline">{t("version")}</div>
          <div className="font-mono text-sm text-brand">1.0.0</div>
        </div>
        <div className="text-center">
          <div className="label-overline">{t("auto_backup")}</div>
          <div className="font-mono text-sm text-success">{t("ready")}</div>
        </div>
        <div className="text-center">
          <div className="label-overline">{t("auto_update")}</div>
          <div className="font-mono text-sm text-dim">{t("unknown")}</div>
        </div>
        <div className="text-center">
          <div className="label-overline">{t("discord_bot")}</div>
          <div className="font-mono text-sm text-warning">{t("disabled")}</div>
        </div>
      </div>

      <div className="flex items-center gap-2">
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
                <button
                  key={tKey}
                  onClick={() => { setTheme(tKey); setThemeOpen(false); }}
                  data-testid={`theme-option-${tKey}`}
                  className="w-full flex items-center justify-between px-3 py-2 text-sm hover:bg-surface-2 transition-colors"
                >
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
              {[["tr", "Türkçe"], ["en", "English"]].map(([code, label]) => (
                <button
                  key={code}
                  onClick={() => { setLang(code); setLangOpen(false); }}
                  data-testid={`lang-option-${code}`}
                  className="w-full flex items-center justify-between px-3 py-2 text-sm hover:bg-surface-2 transition-colors"
                >
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

        <a href="#donate" className="ghost-btn flex items-center gap-2 text-sm" data-testid="donate-btn">
          <Gift size={14} /> {t("donate")} <ExternalLink size={12} />
        </a>
      </div>
    </header>
  );
};
