import React, { useEffect, useState } from "react";
import { Send, Save, Info, Webhook } from "lucide-react";
import { toast } from "sonner";
import { useI18n } from "../providers/I18nProvider";
import { endpoints } from "../lib/api";

const FIELDS = [
  ["admin", "discord_admin_channel", "🛠"],
  ["chat", "discord_chat_channel", "💬"],
  ["login", "discord_login_channel", "🔐"],
  ["kill", "discord_kill_channel", "💀"],
  ["economy", "discord_economy_channel", "💰"],
  ["violation", "discord_violation_channel", "🚨"],
  ["fame", "discord_fame_channel", "🏆"],
  ["raid", "discord_raid_channel", "⚔"],
];

export const DiscordSettings = ({ server }) => {
  const { t } = useI18n();
  const [config, setConfig] = useState({});
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    endpoints.getDiscord(server.id).then((c) => { if (alive) setConfig(c || {}); });
    return () => { alive = false; };
  }, [server.id]);

  const setField = (k, v) => { setConfig((c) => ({ ...c, [k]: v })); setDirty(true); };

  const handleSave = async () => {
    setBusy(true);
    try {
      const saved = await endpoints.setDiscord(server.id, config);
      setConfig(saved);
      setDirty(false);
      toast.success(t("toast_settings_saved"));
    } catch (e) { toast.error(String(e.response?.data?.detail || e.message)); }
    finally { setBusy(false); }
  };

  const handleTest = async (eventType) => {
    const url = (config[eventType] || "").trim();
    if (!url || !url.startsWith("https://discord")) {
      toast.error("Enter a valid Discord webhook URL first");
      return;
    }
    try {
      const r = await endpoints.testDiscord(server.id, eventType, url);
      if (r.sent) toast.success(t("webhook_sent"));
      else toast.error(t("webhook_failed"));
    } catch (e) { toast.error(String(e.response?.data?.detail || e.message)); }
  };

  return (
    <div className="space-y-4" data-testid="discord-settings">
      <div className="panel corner-brackets">
        <div className="px-4 py-3 border-b border-brand flex items-center gap-3">
          <Webhook size={15} className="text-accent-brand" />
          <span className="heading-stencil text-sm">{t("discord_integration")}</span>
        </div>
        <div className="p-5 space-y-4">
          <p className="text-xs text-dim flex items-start gap-2">
            <Info size={12} className="text-accent-brand shrink-0 mt-0.5" />
            {t("discord_webhook_hint")}
          </p>

          {FIELDS.map(([key, labelKey, emoji]) => (
            <div key={key}>
              <label className="label-overline block mb-1.5">{emoji} {t(labelKey)}</label>
              <div className="flex gap-2">
                <input
                  className="input-field flex-1"
                  placeholder="https://discord.com/api/webhooks/..."
                  value={config[key] || ""}
                  onChange={(e) => setField(key, e.target.value)}
                  data-testid={`discord-${key}-input`}
                />
                <button
                  className="btn-secondary flex items-center gap-2 px-3"
                  onClick={() => handleTest(key)}
                  data-testid={`discord-${key}-test`}
                >
                  <Send size={11} /> {t("test_webhook")}
                </button>
              </div>
            </div>
          ))}

          <div>
            <label className="label-overline block mb-1.5">{t("discord_mention_role")}</label>
            <input
              className="input-field"
              placeholder="123456789012345678"
              value={config.mention_role_id || ""}
              onChange={(e) => setField("mention_role_id", e.target.value)}
              data-testid="discord-mention-role-input"
            />
          </div>

          <div className="flex justify-end pt-2">
            <button
              className="btn-primary flex items-center gap-2"
              onClick={handleSave}
              disabled={!dirty || busy}
              data-testid="discord-save-btn"
            >
              <Save size={13} /> {t("save")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
