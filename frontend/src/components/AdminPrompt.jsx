import React from "react";
import { ShieldAlert, X } from "lucide-react";
import { useI18n } from "../providers/I18nProvider";

export const AdminPrompt = ({ onAccept, onDecline }) => {
  const { t } = useI18n();
  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4" data-testid="admin-prompt">
      <div className="relative w-full max-w-xl panel" style={{ background: "var(--surface)" }}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-brand">
          <div className="flex items-center gap-2">
            <div className="h-2 w-2 rounded-sm pulse-brand bg-primary-brand" />
            <h2 className="text-sm font-semibold uppercase tracking-wider text-brand font-mono">
              {t("admin_prompt_title")}
            </h2>
          </div>
          <button onClick={onDecline} className="icon-btn" data-testid="admin-prompt-close" aria-label="close">
            <X size={16} />
          </button>
        </div>

        <div className="px-6 py-8 flex gap-5 items-start">
          <div className="h-14 w-14 rounded-sm flex items-center justify-center shrink-0 border border-brand bg-primary-soft">
            <ShieldAlert size={28} className="text-primary-brand" />
          </div>
          <div>
            <p className="text-base leading-relaxed text-brand">
              {t("admin_prompt_body")}
            </p>
            <p className="mt-3 text-xs text-dim font-mono uppercase tracking-wide">
              LGSS Managers → SCUM Server Control
            </p>
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 px-4 py-3 border-t border-brand bg-bg">
          <button onClick={onDecline} className="ghost-btn" data-testid="admin-prompt-no">
            {t("no")}
          </button>
          <button onClick={onAccept} className="tactical-btn" data-testid="admin-prompt-yes">
            {t("yes")}
          </button>
        </div>
      </div>
    </div>
  );
};
