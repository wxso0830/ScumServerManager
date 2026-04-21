import React, { useEffect, useRef, useState } from "react";
import { X, Download, CheckCircle2, AlertTriangle } from "lucide-react";
import { endpoints } from "../lib/api";
import { useI18n } from "../providers/I18nProvider";

/**
 * InstallProgressModal
 * Polls /install/progress every 1.2s while visible. Auto-closes on 'complete'.
 * Props:
 *  - open: boolean
 *  - server: {id, name, folder_path}
 *  - onClose: () => void
 *  - onDone: (success:boolean) => void   // parent refetches server state
 */
export const InstallProgressModal = ({ open, server, onClose, onDone }) => {
  const { t } = useI18n();
  const [state, setState] = useState({ percent: 0, phase: "starting", running: true, log_tail: "", error: null });
  const logRef = useRef(null);

  useEffect(() => {
    if (!open || !server) return;
    let alive = true;
    const poll = async () => {
      try {
        const s = await endpoints.installProgress(server.id);
        if (!alive) return;
        setState(s);
        if (!s.running) {
          onDone?.(s.phase === "complete");
          // leave modal open briefly so user sees 100% / error
        }
      } catch {}
    };
    poll();
    const id = setInterval(poll, 1200);
    return () => { alive = false; clearInterval(id); };
  }, [open, server?.id, onDone]);

  // auto-scroll log tail
  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [state.log_tail]);

  if (!open || !server) return null;

  const finished = !state.running;
  const success = state.phase === "complete";
  const hasError = !!state.error;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" data-testid="install-progress-modal">
      <div className="absolute inset-0 bg-black/70" onClick={finished ? onClose : undefined} />
      <div className="relative w-[640px] max-w-[92vw] border border-accent-brand bg-bg-deep shadow-2xl">
        <div className="flex items-center justify-between px-5 py-3 border-b border-brand bg-bg">
          <div className="flex items-center gap-2">
            <Download size={15} className="text-accent-brand" />
            <div>
              <div className="label-accent leading-none">{t("install_server") || "INSTALL"}</div>
              <h3 className="heading-stencil text-base mt-1">{server.name}</h3>
            </div>
          </div>
          <button
            onClick={onClose}
            className="icon-btn"
            disabled={!finished}
            style={!finished ? { opacity: 0.3, cursor: "not-allowed" } : undefined}
            data-testid="install-modal-close-btn"
            title={finished ? "Kapat" : "Kurulum devam ederken kapatılamaz"}
          >
            <X size={16} />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {/* Progress bar */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <div className="font-mono text-[11px] text-dim uppercase tracking-[0.22em]">
                {t(`install_phase_${state.phase || "starting"}`)?.startsWith("install_phase_")
                  ? (state.phase?.toUpperCase() || "INITIALIZING")
                  : t(`install_phase_${state.phase || "starting"}`)}
              </div>
              <div className="font-mono text-sm text-brand">
                {state.percent?.toFixed(1) ?? "0.0"}%
              </div>
            </div>
            <div className="h-2 w-full bg-bg border border-brand relative overflow-hidden">
              <div
                className="absolute left-0 top-0 h-full transition-all duration-300"
                style={{
                  width: `${Math.min(100, state.percent || 0)}%`,
                  background: success ? "var(--success)" : hasError ? "var(--danger)" : "var(--accent)",
                }}
              />
            </div>
            {state.phase === "first_boot" && (
              <div className="mt-2 font-mono text-[10px] text-dim leading-relaxed">
                {t("first_boot_generating")}
              </div>
            )}
          </div>

          {/* Status line */}
          {finished && success && (
            <div className="flex items-center gap-2 text-sm" style={{ color: "var(--success)" }}>
              <CheckCircle2 size={16} />
              <span>Kurulum tamamlandı — sunucu başlatılmaya hazır.</span>
            </div>
          )}
          {finished && hasError && (
            <div className="flex items-center gap-2 text-sm" style={{ color: "var(--danger)" }}>
              <AlertTriangle size={16} />
              <span className="break-all">{state.error}</span>
            </div>
          )}

          {/* Log tail */}
          <div>
            <div className="label-overline mb-1.5">SteamCMD Log</div>
            <pre
              ref={logRef}
              className="font-mono text-[10px] leading-relaxed text-dim bg-black/40 border border-brand p-3 h-[240px] overflow-y-auto scrollbar-thin whitespace-pre-wrap"
              data-testid="install-log-tail"
            >
              {state.log_tail || "Bekleniyor..."}
            </pre>
          </div>
        </div>
      </div>
    </div>
  );
};
