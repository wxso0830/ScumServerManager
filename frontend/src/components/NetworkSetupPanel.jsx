import React, { useEffect, useState, useCallback } from "react";
import {
  ShieldCheck,
  ShieldAlert,
  Shield,
  Loader2,
  Globe,
  ArrowDown,
  ArrowUp,
  RefreshCw,
  Wand2,
  XCircle,
  CheckCircle2,
  AlertTriangle,
  Activity,
} from "lucide-react";
import { endpoints } from "../lib/api";
import { toast } from "sonner";

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
 * Design notes:
 *   • Checklist style matches NetworkPortsPanel rows (same border-brand /
 *     mono labels / 12-col grid).
 *   • Each "Network Setup" checkbox maps 1-to-1 to a critical firewall
 *     rule; the green tick lights up only when netsh confirms the rule
 *     exists AND is enabled.
 *   • The "Verify Port Availability" step combines A2S_INFO ping +
 *     Steam master server reachability — those are the two signals that
 *     actually predict in-game browser visibility.
 */
export const NetworkSetupPanel = ({ server }) => {
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
        toast.success("Firewall kuralları başarıyla uygulandı.");
      } else if (s.needs_admin) {
        toast.error(
          "Yönetici (Administrator) yetkisi gerekli. Manager'ı kapatıp 'Yönetici olarak çalıştır' ile yeniden açın.",
          { duration: 8000 },
        );
      } else {
        toast.warning(`Bazı kurallar uygulanamadı: ${s.failed?.length || 0} hata.`);
      }
    } catch (e) {
      toast.error(e.response?.data?.detail || e.message);
    } finally {
      setApplying(false);
    }
  };

  const handleRemove = async () => {
    if (!window.confirm("Bu sunucu için tüm LGSS firewall kurallarını silmek istediğinize emin misiniz?")) return;
    setRemoving(true);
    try {
      await endpoints.firewallRemove(server.id);
      toast.success("Firewall kuralları silindi.");
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
      // Surface the most actionable hint as a toast
      const h = d.hints?.[0];
      if (h === "all_good") {
        toast.success("Tüm kontroller OK — sunucu görünür olmalı.");
      } else if (h === "admin_required") {
        toast.error("Firewall için admin yetkisi gerekli.");
      } else if (h === "apply_firewall") {
        toast.warning("Firewall kuralları eksik — 'Otomatik Yapılandır' ile düzelt.");
      } else if (h === "master_blocked") {
        toast.error("Steam master sunucusuna ulaşılamıyor — outbound traffic engelleniyor.");
      } else if (h === "a2s_unreachable") {
        toast.warning("Sunucu çalışıyor ama A2S sorgusu cevap vermiyor.");
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
  const verifiedOk = verified && diag.firewall?.ok && diag.master_server?.ok;

  const checklist = [
    {
      key: "auto_configure",
      label: "Windows Firewall Otomatik Yapılandırma",
      ok: status?.ok === true,
      desc: status?.ok ? "Tüm kurallar aktif" : (status?.needs_admin ? "Admin gerekli" : "Eksik / uygulanmamış"),
    },
    {
      key: "open_ports",
      label: "SCUM Portları Açık (UDP)",
      ok: allInboundOk && allOutboundOk,
      desc: `${status?.game_port || "-"}-${(status?.game_port || 0) + 2} + ${status?.query_port || "-"}`,
    },
    {
      key: "inbound",
      label: "Inbound Kuralları",
      ok: allInboundOk,
      desc: hasInbound ? `${ruleByDir("in").filter(r => r.ok).length}/${ruleByDir("in").length} aktif` : "Eksik",
    },
    {
      key: "outbound",
      label: "Outbound Kuralları (Server List görünürlük)",
      ok: allOutboundOk,
      desc: hasOutbound ? `${ruleByDir("out").filter(r => r.ok).length}/${ruleByDir("out").length} aktif` : "Eksik (görünürlük bozuk!)",
    },
    {
      key: "verify",
      label: "Port Erişilebilirliği Doğrulandı",
      ok: verifiedOk,
      desc: !verified ? "Henüz doğrulanmadı" : (verifiedOk ? "Steam master OK · A2S OK" : "Sorun tespit edildi"),
    },
  ];

  return (
    <div className="space-y-4 pt-2" data-testid="network-setup-panel">
      <div className="flex items-center gap-2 border-b border-brand pb-2">
        <Shield size={13} className="text-accent-brand" />
        <span className="label-accent">NETWORK SETUP · FIREWALL OTOMASYONU</span>
      </div>

      {/* Admin-required warning */}
      {status && status.platform === "Windows" && !status.is_admin && !status.ok && (
        <div className="flex items-start gap-2 text-[11px] font-mono border border-warning/40 bg-warning/5 px-3 py-2" style={{ color: "var(--warning)" }}>
          <ShieldAlert size={14} className="shrink-0 mt-0.5" />
          <div>
            <div className="font-bold uppercase tracking-widest mb-0.5">Yönetici Yetkisi Gerekli</div>
            <div className="opacity-90">Windows Firewall kurallarını oluşturabilmek için Manager'ı <b>Yönetici olarak çalıştır</b> seçeneğiyle açmalısın. Bu işlem güvenlik duvarını KAPATMAZ — sadece SCUM için gerekli portları açar.</div>
          </div>
        </div>
      )}

      {/* Non-Windows hint */}
      {status && status.platform && status.platform !== "Windows" && (
        <div className="flex items-center gap-2 text-[11px] font-mono border border-brand bg-bg-deep/40 px-3 py-2 text-muted">
          <Globe size={13} />
          <span>Bu özellik sadece Windows üzerinde aktiftir. (Şu anki: {status.platform})</span>
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
                {item.ok ? "OK" : "EKSİK"}
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
            <span className="label-overline text-brand">VISIBILITY DIAGNOSTIC</span>
          </div>
          <div className="grid grid-cols-3 gap-3 font-mono text-[10px]">
            <DiagBox
              label="A2S Local"
              ok={diag.a2s.alive}
              skipped={!diag.a2s.checked}
              detail={diag.a2s.info?.server_name || (diag.a2s.checked ? "Cevap yok" : "Sunucu kapalı")}
            />
            <DiagBox
              label="Steam Master"
              ok={diag.master_server.ok}
              detail={diag.master_server.ok ? `${diag.master_server.latency_ms}ms` : (diag.master_server.error || "Bağlanamadı")}
            />
            <DiagBox
              label="Firewall"
              ok={diag.firewall.ok}
              detail={`${diag.firewall.applied?.length || 0}/${diag.firewall.rules?.length || 0} kural`}
            />
          </div>
          {diag.hints?.includes("master_blocked") && (
            <div className="flex items-start gap-2 text-[11px] font-mono border border-warning/40 bg-warning/5 px-3 py-2 mt-2" style={{ color: "var(--warning)" }}>
              <AlertTriangle size={13} className="shrink-0 mt-0.5" />
              <div>
                Steam master sunucusuna outbound UDP bağlantısı engelleniyor. Bu, sunucunun in-game listesinde <b>aralıklı</b> görünmesine yol açar. Outbound firewall kurallarını uygulamak (aşağıdaki "Otomatik Yapılandır" butonu) bunu büyük ihtimalle düzeltir.
              </div>
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
          {applying ? "Uygulanıyor..." : "Otomatik Yapılandır"}
        </button>
        <button
          onClick={handleVerify}
          disabled={verifying || loading}
          className="btn-secondary px-3 py-2 flex items-center gap-2"
          data-testid="firewall-verify-btn"
        >
          {verifying ? <Loader2 size={13} className="animate-spin" /> : <Activity size={13} />}
          Doğrula
        </button>
        <button
          onClick={load}
          disabled={loading}
          className="btn-secondary px-3 py-2 flex items-center gap-2"
          data-testid="firewall-refresh-btn"
        >
          <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
          Yenile
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
            Kuralları Sil
          </button>
        )}
      </div>

      {/* Always-visible hint about the philosophy */}
      <div className="border border-dashed border-accent-brand/40 bg-accent-soft/20 px-3 py-2 flex items-start gap-2">
        <ShieldCheck size={13} className="text-accent-brand shrink-0 mt-0.5" />
        <div className="font-mono text-[10px] text-dim leading-relaxed">
          <div className="text-muted uppercase tracking-widest mb-1">NEDEN BU PANELİ KULLANMALISIN?</div>
          <div>
            Bazı rehberler Windows Firewall'ı kapatmanı söyler — bu <span className="text-warning" style={{ color: "var(--warning)" }}>güvenlik açığıdır</span>. Bu panel firewall'ı <b>açık tutarak</b> sadece SCUM'un ihtiyacı olan UDP portlarını + outbound trafiği whitelist'ler. Bonus: outbound kuralları olmadan sunucu listesinde sık kaybolma problemi de çözülür.
          </div>
        </div>
      </div>
    </div>
  );
};

const DiagBox = ({ label, ok, skipped, detail }) => {
  const color = skipped ? "var(--muted)" : (ok ? "var(--success)" : "var(--warning)");
  return (
    <div
      className="px-2 py-2 flex flex-col items-start gap-0.5"
      style={{ border: `1px solid ${color}`, background: `color-mix(in srgb, ${color} 8%, transparent)` }}
    >
      <div className="flex items-center gap-1 text-[9px] uppercase tracking-widest" style={{ color }}>
        {skipped ? <Loader2 size={10} /> : ok ? <CheckCircle2 size={10} /> : <XCircle size={10} />}
        {label}
      </div>
      <div className="text-[10px] text-brand truncate w-full">{detail}</div>
    </div>
  );
};
