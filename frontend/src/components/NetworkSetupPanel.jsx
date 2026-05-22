import React, { useEffect, useState, useCallback } from "react";
import {
  ShieldCheck,
  ShieldAlert,
  Shield,
  Loader2,
  Globe,
  RefreshCw,
  Wand2,
  XCircle,
  CheckCircle2,
  AlertTriangle,
  Activity,
} from "lucide-react";
import { endpoints } from "../lib/api";
import { toast } from "sonner";
import { useI18n } from "../providers/I18nProvider";

/**
 * NetworkSetupPanel — v1.0.37
 *
 * Drop-in "Network Setup" wizard. Lets the admin auto-configure Windows
 * Firewall rules WITHOUT having to disable the firewall (the previous
 * workflow most users were stuck on). Also runs a one-click visibility
 * diagnostic so we can answer the recurring "why does my server only show
 * up sometimes in the in-game browser?" question.
 *
 * Backend endpoints (added in v1.0.37):
 *   GET    /api/servers/{id}/firewall/status        — read-only check
 *   POST   /api/servers/{id}/firewall/apply         — create/repair rules
 *   DELETE /api/servers/{id}/firewall               — wipe rules
 *   GET    /api/servers/{id}/diagnostics/visibility — combined report
 *
 * v1.0.37b: All copy moved into the i18n dictionary (default English).
 * Turkish labels live under the `tr` section in I18nProvider.jsx; other
 * languages fall back to English automatically via t()'s fallback chain.
 */
export const NetworkSetupPanel = ({ server }) => {
  const { t } = useI18n();
  const [loading, setLoading] = useState(true);
  const [applying, setApplying] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [status, setStatus] = useState(null);  // { ok, needs_admin, rules:[], ... }
  const [diag, setDiag] = useState(null);      // visibility diagnostic result

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const s = await endpoints.firewallStatus(server.id);
      setStatus(s);
    } catch (e) {
      toast.error(e.response?.data?.detail || e.message);
    } finally {
      setLoading(false);
    }
  }, [server.id]);

  useEffect(() => { load(); }, [load]);

  const handleApply = async () => {
    setApplying(true);
    try {
      const s = await endpoints.firewallApply(server.id);
      setStatus(s);
      if (s.ok) {
        toast.success(t("netsetup_toast_applied"));
      } else if (s.needs_admin) {
        toast.error(t("netsetup_toast_admin_required"), { duration: 8000 });
      } else {
        toast.warning(t("netsetup_toast_partial", { count: s.failed?.length || 0 }));
      }
    } catch (e) {
      toast.error(e.response?.data?.detail || e.message);
    } finally {
      setApplying(false);
    }
  };

  const handleRemove = async () => {
    if (!window.confirm(t("netsetup_confirm_remove"))) return;
    setRemoving(true);
    try {
      await endpoints.firewallRemove(server.id);
      toast.success(t("netsetup_toast_removed"));
      await load();
    } catch (e) {
      toast.error(e.response?.data?.detail || e.message);
    } finally {
      setRemoving(false);
    }
  };

  const handleVerify = async () => {
    setVerifying(true);
    try {
      const d = await endpoints.visibilityDiagnostic(server.id);
      setDiag(d);
      setStatus(prev => ({ ...(prev || {}), ...(d.firewall || {}) }));
      const h = d.hints?.[0];
      if (h === "all_good") {
        toast.success(t("netsetup_toast_verify_ok"));
      } else if (h === "admin_required") {
        toast.error(t("netsetup_toast_verify_admin"));
      } else if (h === "apply_firewall") {
        toast.warning(t("netsetup_toast_verify_apply"));
      } else if (h === "master_blocked") {
        toast.error(t("netsetup_toast_verify_master"));
      } else if (h === "a2s_unreachable") {
        toast.warning(t("netsetup_toast_verify_a2s"));
      }
    } catch (e) {
      toast.error(e.response?.data?.detail || e.message);
    } finally {
      setVerifying(false);
    }
  };

  // Aggregate status into the 5-item checklist the user asked for
  const rules = status?.rules || [];
  const ruleByDir = (dir) => rules.filter(r => r.direction === dir);
  const hasInbound = ruleByDir("in").some(r => r.critical && r.ok);
  const hasOutbound = ruleByDir("out").some(r => r.critical && r.ok);
  const allInboundOk = ruleByDir("in").filter(r => r.critical).every(r => r.ok);
  const allOutboundOk = ruleByDir("out").filter(r => r.critical).every(r => r.ok);
  const verified = diag != null;
  // v1.0.37e: do NOT factor master_server into the verify result. Its hostname
  // check is a known false-positive (legacy master server, deprecated for
  // modern Steamworks). Only firewall + (running ? a2s) determines OK.
  const verifiedOk = verified
    && diag.firewall?.ok
    && (!diag.a2s?.checked || diag.a2s?.alive);

  const ruleCountIn = ruleByDir("in").filter(r => r.ok).length;
  const ruleTotalIn = ruleByDir("in").length;
  const ruleCountOut = ruleByDir("out").filter(r => r.ok).length;
  const ruleTotalOut = ruleByDir("out").length;

  const checklist = [
    {
      key: "auto_configure",
      label: t("netsetup_check_auto"),
      ok: status?.ok === true,
      desc: status?.ok
        ? t("netsetup_state_all_active")
        : (status?.needs_admin ? t("netsetup_state_admin_needed") : t("netsetup_state_missing")),
    },
    {
      key: "open_ports",
      label: t("netsetup_check_ports"),
      ok: allInboundOk && allOutboundOk,
      desc: `${status?.game_port || "-"}-${(status?.game_port || 0) + 2} + ${status?.query_port || "-"}`,
    },
    {
      key: "inbound",
      label: t("netsetup_check_inbound"),
      ok: allInboundOk,
      desc: hasInbound
        ? t("netsetup_state_rules_active", { ok: ruleCountIn, total: ruleTotalIn })
        : t("netsetup_state_rules_short"),
    },
    {
      key: "outbound",
      label: t("netsetup_check_outbound"),
      ok: allOutboundOk,
      desc: hasOutbound
        ? t("netsetup_state_rules_active", { ok: ruleCountOut, total: ruleTotalOut })
        : t("netsetup_state_outbound_missing"),
    },
    {
      key: "verify",
      label: t("netsetup_check_verify"),
      ok: verifiedOk,
      desc: !verified
        ? t("netsetup_state_not_verified")
        : (verifiedOk ? t("netsetup_state_verified_ok") : t("netsetup_state_verified_fail")),
    },
  ];

  return (
    <div className="space-y-4 pt-2" data-testid="network-setup-panel">
      <div className="flex items-center gap-2 border-b border-brand pb-2">
        <Shield size={13} className="text-accent-brand" />
        <span className="label-accent">{t("netsetup_title")}</span>
      </div>

      {/* Admin-required warning */}
      {status && status.platform === "Windows" && !status.is_admin && !status.ok && (
        <div className="flex items-start gap-2 text-[11px] font-mono border border-warning/40 bg-warning/5 px-3 py-2" style={{ color: "var(--warning)" }}>
          <ShieldAlert size={14} className="shrink-0 mt-0.5" />
          <div>
            <div className="font-bold uppercase tracking-widest mb-0.5">{t("netsetup_admin_required_title")}</div>
            <div className="opacity-90">{t("netsetup_admin_required_body")}</div>
          </div>
        </div>
      )}

      {/* Non-Windows hint */}
      {status && status.platform && status.platform !== "Windows" && (
        <div className="flex items-center gap-2 text-[11px] font-mono border border-brand bg-bg-deep/40 px-3 py-2 text-muted">
          <Globe size={13} />
          <span>{t("netsetup_non_windows_hint", { platform: status.platform })}</span>
        </div>
      )}

      {/* 5-item checklist */}
      <div className="border border-brand">
        {checklist.map((item, idx) => (
          <div
            key={item.key}
            className={`grid grid-cols-12 gap-3 items-center px-4 py-3 ${idx < checklist.length - 1 ? "border-b border-brand" : ""} ${idx % 2 === 1 ? "bg-bg-deep/40" : ""}`}
            data-testid={`firewall-check-${item.key}`}
          >
            <div className="col-span-1 flex justify-center">
              {loading ? (
                <Loader2 size={16} className="animate-spin text-muted" />
              ) : item.ok ? (
                <CheckCircle2 size={16} style={{ color: "var(--success)" }} />
              ) : (
                <XCircle size={16} style={{ color: "var(--warning)" }} />
              )}
            </div>
            <div className="col-span-11 md:col-span-7">
              <div className="font-mono text-[12px] uppercase tracking-wider text-brand">{item.label}</div>
              <div className="font-mono text-[10px] text-dim mt-0.5">{item.desc}</div>
            </div>
            <div className="hidden md:flex md:col-span-4 justify-end">
              <span
                className="px-2 py-1 text-[10px] font-mono uppercase tracking-widest"
                style={{
                  color: item.ok ? "var(--success)" : "var(--warning)",
                  border: `1px solid ${item.ok ? "var(--success)" : "var(--warning)"}`,
                  background: `color-mix(in srgb, ${item.ok ? "var(--success)" : "var(--warning)"} 12%, transparent)`,
                }}
              >
                {item.ok ? t("netsetup_badge_ok") : t("netsetup_badge_missing")}
              </span>
            </div>
          </div>
        ))}
      </div>

      {/* Diagnostic detail panel — appears AFTER verify */}
      {diag && (
        <div className="border border-accent-brand/40 bg-accent-soft/20 p-3 space-y-2" data-testid="visibility-diagnostic-result">
          <div className="flex items-center gap-2">
            <Activity size={13} className="text-accent-brand" />
            <span className="label-overline text-brand">{t("netsetup_diag_title")}</span>
          </div>
          <div className="grid grid-cols-3 gap-3 font-mono text-[10px]">
            <DiagBox
              label={t("netsetup_diag_a2s_label")}
              ok={diag.a2s.alive}
              skipped={!diag.a2s.checked}
              detail={diag.a2s.info?.server_name || (diag.a2s.checked ? t("netsetup_diag_a2s_no_reply") : t("netsetup_diag_a2s_offline"))}
            />
            <DiagBox
              label={t("netsetup_diag_master_label")}
              ok={diag.master_server.ok}
              informational
              detail={diag.master_server.ok
                ? t("netsetup_diag_master_latency", { ms: diag.master_server.latency_ms })
                : (diag.master_server.error || t("netsetup_diag_master_failed"))}
            />
            <DiagBox
              label={t("netsetup_diag_firewall_label")}
              ok={diag.firewall.ok}
              detail={t("netsetup_diag_firewall_rules", {
                ok: diag.firewall.applied?.length || 0,
                total: diag.firewall.rules?.length || 0,
              })}
            />
          </div>
          {diag.hints?.includes("master_blocked") && (
            <div className="flex items-start gap-2 text-[11px] font-mono border border-warning/40 bg-warning/5 px-3 py-2 mt-2" style={{ color: "var(--warning)" }}>
              <AlertTriangle size={13} className="shrink-0 mt-0.5" />
              <div>{t("netsetup_master_blocked_warn")}</div>
            </div>
          )}
        </div>
      )}

      {/* Action buttons */}
      <div className="flex flex-wrap items-center gap-2 border-t border-brand pt-3">
        <button
          onClick={handleApply}
          disabled={applying || loading || (status?.platform && status.platform !== "Windows")}
          className="btn-primary px-4 py-2 flex items-center gap-2"
          data-testid="firewall-apply-btn"
        >
          {applying ? <Loader2 size={13} className="animate-spin" /> : <Wand2 size={13} />}
          {applying ? t("netsetup_btn_applying") : t("netsetup_btn_apply")}
        </button>
        <button
          onClick={handleVerify}
          disabled={verifying || loading}
          className="btn-secondary px-3 py-2 flex items-center gap-2"
          data-testid="firewall-verify-btn"
        >
          {verifying ? <Loader2 size={13} className="animate-spin" /> : <Activity size={13} />}
          {t("netsetup_btn_verify")}
        </button>
        <button
          onClick={load}
          disabled={loading}
          className="btn-secondary px-3 py-2 flex items-center gap-2"
          data-testid="firewall-refresh-btn"
        >
          <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
          {t("netsetup_btn_refresh")}
        </button>
        <div className="flex-1" />
        {status?.applied?.length > 0 && (
          <button
            onClick={handleRemove}
            disabled={removing}
            className="btn-ghost px-3 py-2 flex items-center gap-2 text-[11px]"
            style={{ color: "var(--warning)" }}
            data-testid="firewall-remove-btn"
          >
            {removing ? <Loader2 size={13} className="animate-spin" /> : <XCircle size={13} />}
            {t("netsetup_btn_remove")}
          </button>
        )}
      </div>

      {/* Always-visible hint about the philosophy */}
      <div className="border border-dashed border-accent-brand/40 bg-accent-soft/20 px-3 py-2 flex items-start gap-2">
        <ShieldCheck size={13} className="text-accent-brand shrink-0 mt-0.5" />
        <div className="font-mono text-[10px] text-dim leading-relaxed">
          <div className="text-muted uppercase tracking-widest mb-1">{t("netsetup_why_title")}</div>
          <div>{t("netsetup_why_body")}</div>
        </div>
      </div>
    </div>
  );
};

const DiagBox = ({ label, ok, skipped, informational, detail }) => {
  // `informational` makes a failed check render gray/muted instead of red,
  // used for diagnostics that are noisy false-positives (e.g. Steam Master
  // hostname check — the legacy master server is deprecated for modern
  // Steamworks games so a failure here is usually meaningless).
  let color;
  if (skipped) color = "var(--muted)";
  else if (ok) color = "var(--success)";
  else if (informational) color = "var(--muted)";
  else color = "var(--warning)";
  return (
    <div
      className="px-2 py-2 flex flex-col items-start gap-0.5"
      style={{ border: `1px solid ${color}`, background: `color-mix(in srgb, ${color} 8%, transparent)` }}
    >
      <div className="flex items-center gap-1 text-[9px] uppercase tracking-widest" style={{ color }}>
        {skipped || (informational && !ok) ? <Loader2 size={10} /> : ok ? <CheckCircle2 size={10} /> : <XCircle size={10} />}
        {label}
      </div>
      <div className="text-[10px] text-brand truncate w-full">{detail}</div>
    </div>
  );
};
