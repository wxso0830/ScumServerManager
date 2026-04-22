import React, { useEffect, useState } from "react";
import { Bot, Power, Key, CheckCircle2, AlertCircle, Info, ExternalLink, Copy } from "lucide-react";
import { toast } from "sonner";
import { useI18n } from "../providers/I18nProvider";
import { endpoints } from "../lib/api";

/**
 * DiscordBotSettings — token + enable toggle for the manager's Discord bot.
 * The bot is started server-side the moment the admin flips "Enabled" with a
 * valid token, and its live status (connected? which user? how many guilds?)
 * is polled every 5s so the admin sees immediate feedback.
 */
export const DiscordBotSettings = () => {
  const { t } = useI18n();
  const [cfg, setCfg] = useState({ enabled: false, token_set: false, token_preview: "", status: {} });
  const [token, setToken] = useState("");
  const [saving, setSaving] = useState(false);
  const [showToken, setShowToken] = useState(false);

  const load = async () => {
    try {
      const r = await endpoints.getDiscordBot();
      setCfg(r);
    } catch (e) {
      toast.error(e.response?.data?.detail || e.message);
    }
  };

  useEffect(() => { load(); }, []);

  // Poll status every 5s so the "Connected" light updates quickly after toggle
  useEffect(() => {
    const i = setInterval(async () => {
      try {
        const s = await endpoints.getDiscordBotStatus();
        setCfg((c) => ({ ...c, status: s }));
      } catch {}
    }, 5000);
    return () => clearInterval(i);
  }, []);

  const handleSave = async (partial) => {
    setSaving(true);
    try {
      const r = await endpoints.updateDiscordBot(partial);
      setCfg(r);
      setToken(""); // clear field after save
      toast.success(t("toast_settings_saved"));
    } catch (e) {
      toast.error(e.response?.data?.detail || e.message);
    } finally { setSaving(false); }
  };

  const status = cfg.status || {};
  const connected = !!status.connected;
  const running = !!status.running;

  return (
    <div className="space-y-5" data-testid="discord-bot-settings">
      {/* Status panel */}
      <div className="panel corner-brackets">
        <div className="px-4 py-3 border-b border-brand flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Bot size={15} className="text-accent-brand" />
            <span className="heading-stencil text-sm">{t("discord_bot_title")}</span>
          </div>
          <div className="flex items-center gap-2">
            <span
              className="status-led inline-block"
              style={{ background: connected ? "var(--success)" : running ? "var(--warning)" : "var(--text-muted)" }}
            />
            <span className="font-mono text-[10px] uppercase tracking-widest"
              style={{ color: connected ? "var(--success)" : running ? "var(--warning)" : "var(--text-muted)" }}
            >
              {connected ? t("discord_bot_connected")
                : running ? t("discord_bot_connecting")
                : t("discord_bot_offline")}
            </span>
          </div>
        </div>

        <div className="p-5 space-y-4">
          <p className="text-xs text-dim flex items-start gap-2">
            <Info size={12} className="mt-0.5 shrink-0 text-accent-brand" />
            {t("discord_bot_hint")}
          </p>

          {status.error && (
            <div className="flex items-center gap-2 px-3 py-2 border border-danger bg-danger/10 text-[11px] text-danger font-mono" data-testid="discord-bot-error">
              <AlertCircle size={12} />
              <span>
                {status.error === "login_failed" ? t("discord_bot_login_failed") : status.error}
              </span>
            </div>
          )}

          {connected && status.user && (
            <div className="grid grid-cols-2 gap-3">
              <div className="border border-brand bg-bg-deep px-4 py-3">
                <div className="label-overline mb-1">{t("discord_bot_user")}</div>
                <div className="font-mono text-xs text-brand truncate">{status.user}</div>
              </div>
              <div className="border border-brand bg-bg-deep px-4 py-3">
                <div className="label-overline mb-1">{t("discord_bot_guilds")}</div>
                <div className="font-mono text-xs text-brand">{status.guild_count ?? 0}</div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Token panel */}
      <div className="panel corner-brackets">
        <div className="px-4 py-3 border-b border-brand flex items-center gap-3">
          <Key size={15} className="text-accent-brand" />
          <span className="heading-stencil text-sm">{t("discord_bot_token_title")}</span>
        </div>

        <div className="p-5 space-y-4">
          <div>
            <label className="label-accent block mb-2">{t("discord_bot_token_label")}</label>
            <div className="flex gap-2">
              <input
                type={showToken ? "text" : "password"}
                className="input-field flex-1 font-mono"
                placeholder={cfg.token_set ? cfg.token_preview || "••••••••" : "Paste bot token here…"}
                value={token}
                onChange={(e) => setToken(e.target.value)}
                data-testid="discord-bot-token-input"
                autoComplete="off"
              />
              <button
                className="btn-secondary text-xs"
                onClick={() => setShowToken((v) => !v)}
                type="button"
                data-testid="discord-bot-token-toggle"
              >
                {showToken ? "Hide" : "Show"}
              </button>
            </div>
            <p className="text-[10px] text-dim mt-1 flex items-center gap-1">
              <ExternalLink size={9} />
              <a
                href="https://discord.com/developers/applications"
                target="_blank"
                rel="noopener noreferrer"
                className="underline hover:text-accent-brand"
              >
                {t("discord_bot_token_where")}
              </a>
            </p>
          </div>

          <div className="flex items-center justify-between gap-3 pt-1">
            <label className="flex items-center gap-2 cursor-pointer select-none" data-testid="discord-bot-enabled-toggle">
              <input
                type="checkbox"
                checked={!!cfg.enabled}
                onChange={(e) => handleSave({ enabled: e.target.checked })}
                disabled={saving || (!cfg.token_set && !token)}
                className="w-4 h-4 accent-[var(--accent)]"
              />
              <span className="text-sm text-brand">{t("discord_bot_enabled")}</span>
            </label>

            <button
              className="btn-primary flex items-center gap-2 text-xs"
              onClick={() => handleSave({ token: token || undefined, enabled: true })}
              disabled={saving || !token}
              data-testid="discord-bot-save-btn"
            >
              <Power size={12} />
              {cfg.token_set ? t("discord_bot_update_token") : t("discord_bot_save_start")}
            </button>
          </div>
        </div>
      </div>

      {/* Slash command reference */}
      <div className="panel">
        <div className="px-4 py-3 border-b border-brand flex items-center gap-3">
          <CheckCircle2 size={15} className="text-accent-brand" />
          <span className="heading-stencil text-sm">{t("discord_bot_commands")}</span>
        </div>
        <div className="p-5 space-y-2 text-xs">
          <div className="flex items-center gap-3 font-mono">
            <span className="text-accent-brand">/online</span>
            <span className="text-dim">{t("discord_bot_cmd_online")}</span>
          </div>
          <p className="text-[10px] text-dim pt-2 border-t border-brand/50">
            {t("discord_bot_presence_hint")}
          </p>
        </div>
      </div>
    </div>
  );
};
