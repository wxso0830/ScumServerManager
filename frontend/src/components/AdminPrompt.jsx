import React from "react";
import { ShieldAlert, X, Terminal } from "lucide-react";
import { useI18n } from "../providers/I18nProvider";

export const AdminPrompt = ({ onAccept, onDecline }) => {
  const { t } = useI18n();
  return (
    <div className="fixed inset-0 z-50 bg-bg-deep/95 backdrop-blur-md flex items-center justify-center p-4 overflow-hidden" data-testid="admin-prompt">
      <div className="boot-scan" />
      <div
        className="absolute inset-0 opacity-[0.08] pointer-events-none"
        style={{
          backgroundImage:
            "repeating-linear-gradient(45deg, var(--accent) 0 6px, transparent 6px 60px)",
        }}
      />

      <div className="relative w-full max-w-xl panel corner-brackets-full" style={{ background: "var(--surface)" }}>
        <span className="cbr-tr" />
        <span className="cbr-bl" />

        <div className="flex items-center justify-between px-4 py-3 border-b border-brand bg-bg-deep">
          <div className="flex items-center gap-2">
            <Terminal size={14} className="text-accent-brand" />
            <span className="font-mono text-[11px] uppercase tracking-[0.3em] text-accent-brand">
              {t("admin_prompt_title")}<span className="cursor-blink"></span>
            </span>
          </div>
          <button onClick={onDecline} className="icon-btn" data-testid="admin-prompt-close" aria-label="close">
            <X size={15} />
          </button>
        </div>

        <div className="px-6 py-8 flex gap-5 items-start">
          <div className="h-16 w-16 flex items-center justify-center shrink-0 border-2 border-accent-brand bg-accent-soft relative">
            <ShieldAlert size={30} className="text-accent-brand" />
          </div>
          <div>
            <div className="label-accent mb-2">PRIVILEGE ESCALATION REQUIRED</div>
            <p className="text-base leading-relaxed text-brand">
              {t("admin_prompt_body")}
            </p>
            <p className="mt-3 font-mono text-[11px] text-muted uppercase tracking-widest">
              LGSS Managers → SCUM Server Control
            </p>
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 px-4 py-3 border-t border-brand bg-bg-deep">
          <button onClick={onDecline} className="btn-ghost" data-testid="admin-prompt-no">
            {t("no")}
          </button>
          <button onClick={onAccept} className="btn-primary" data-testid="admin-prompt-yes">
            {t("yes")}
          </button>
        </div>
      </div>
    </div>
  );
};
