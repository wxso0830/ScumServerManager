import React, { useEffect, useState } from "react";
import { X, Download, CheckCircle2, AlertCircle, RefreshCw, Rocket, Package } from "lucide-react";
import { toast } from "sonner";
import { useI18n } from "../providers/I18nProvider";

/**
 * ManagerUpdateModal — auto-updater UI (GitHub Releases).
 *
 * States: idle -> checking -> uptodate | available -> downloading -> ready
 * Quiet-error states: treat "latest.yml 404", "HTTP response not OK",
 * offline errors as "up-to-date" so the admin doesn't see scary GitHub
 * diagnostics while a release is still being uploaded.
 */
export const ManagerUpdateModal = ({ open, onClose }) => {
  const { t, lang } = useI18n();
  const [state, setState] = useState("idle");
  const [info, setInfo] = useState({ currentVersion: "", latestVersion: "" });
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!window?.lgss?.onUpdateEvent) return undefined;
    const off = window.lgss.onUpdateEvent((payload) => {
      if (payload.type === "available")        setState("available");
      else if (payload.type === "not-available") setState("uptodate");
      else if (payload.type === "progress")    setProgress(Math.round(payload.progress?.percent || 0));
      else if (payload.type === "downloaded")  setState("ready");
      else if (payload.type === "error")       { setState("error"); setError(payload.message); }
    });
    return off;
  }, []);

  useEffect(() => {
    if (!open) return;
    (async () => {
      setError(null); setProgress(0); setState("checking");
      if (!window?.lgss?.checkForUpdates) {
        // Browser / dev fallback
        const v = window?.lgss?.getVersion ? await window.lgss.getVersion() : "1.0.3";
        setInfo({ currentVersion: v, latestVersion: v });
        setState("uptodate");
        return;
      }
      const result = await window.lgss.checkForUpdates();
      setInfo({
        currentVersion: result.currentVersion || "?",
        latestVersion: result.latestVersion || result.currentVersion || "?",
      });
      // `result.quiet` is the main-process hint that the error was a
      // known-benign one (release still uploading, offline, etc.). We treat
      // it exactly like "up to date" so the admin doesn't see noise.
      if (!result.ok)                          { setState("error"); setError(result.error); }
      else if (result.updateAvailable)         setState("available");
      else                                     setState("uptodate");
    })();
  }, [open]);

  if (!open) return null;

  const startDownload = async () => {
    setState("downloading"); setProgress(0);
    const r = await window.lgss.downloadUpdate();
    if (!r?.ok) {
      if (r?.quiet) {
        // Release asset was withdrawn between check and download — treat as uptodate.
        setState("uptodate");
        setError(null);
      } else {
        setState("error");
        setError(r?.error || "download failed");
      }
    }
  };

  const installNow = async () => {
    toast(lang === "tr" ? "Yeniden başlatılıyor…" : "Restarting…");
    await window.lgss.installUpdate();
  };

  // Versions in a compact side-by-side card — much cleaner than two raw lines.
  const VersionCard = () => {
    const newer = info.latestVersion && info.latestVersion !== info.currentVersion && state === "available";
    return (
      <div className="grid grid-cols-2 gap-px bg-brand rounded overflow-hidden">
        <div className="bg-bg-deep px-4 py-3">
          <div className="label-overline mb-1">{lang === "tr" ? "Yüklü" : "Installed"}</div>
          <div className="font-mono text-base text-brand">v{info.currentVersion || "?"}</div>
        </div>
        <div className={`px-4 py-3 ${newer ? "bg-accent-soft" : "bg-bg-deep"}`}>
          <div className="label-overline mb-1">{lang === "tr" ? "En Son" : "Latest"}</div>
          <div className={`font-mono text-base ${newer ? "text-accent-brand" : "text-brand"}`}>
            v{info.latestVersion || "?"}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" data-testid="manager-update-modal">
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-[560px] max-w-[94vw] border border-accent-brand bg-bg-deep shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-brand bg-bg">
          <div className="flex items-center gap-3">
            <div className={`h-9 w-9 flex items-center justify-center border border-accent-brand ${state === "available" ? "update-btn-pulse" : ""}`}>
              <Package size={18} className="text-accent-brand" />
            </div>
            <div>
              <div className="label-accent leading-none">LGSS MANAGER</div>
              <h3 className="heading-stencil text-base mt-1">
                {lang === "tr" ? "GÜNCELLEME KONTROLÜ" : "UPDATE CHECK"}
              </h3>
            </div>
          </div>
          <button onClick={onClose} className="icon-btn" data-testid="update-modal-close"><X size={16} /></button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-5">
          <VersionCard />

          {state === "checking" && (
            <StatusBlock
              icon={RefreshCw}
              spin
              title={lang === "tr" ? "Kontrol ediliyor…" : "Checking for updates…"}
              subtitle={lang === "tr" ? "GitHub Releases sorgulanıyor" : "Querying GitHub Releases"}
            />
          )}

          {state === "uptodate" && (
            <StatusBlock
              icon={CheckCircle2}
              tone="ok"
              title={lang === "tr" ? "Uygulama güncel" : "You're up to date"}
              subtitle={lang === "tr"
                ? "Yeni bir sürüm yayınlandığında bu buton yanıp sönmeye başlayacak."
                : "This button will start pulsing when a new release is published."}
            />
          )}

          {state === "available" && (
            <>
              <StatusBlock
                icon={Rocket}
                tone="accent"
                title={lang === "tr" ? `v${info.latestVersion} indirmeye hazır` : `v${info.latestVersion} ready to download`}
                subtitle={lang === "tr"
                  ? "İndirme arka planda çalışır, tamamlanınca yeniden başlatabilirsiniz."
                  : "Download runs in the background; restart when it completes."}
              />
              <button
                onClick={startDownload}
                className="btn-primary w-full py-3 flex items-center justify-center gap-2 update-btn-pulse"
                data-testid="update-download-btn"
              >
                <Download size={15} />
                {lang === "tr" ? "GÜNCELLEMEYİ İNDİR" : "DOWNLOAD UPDATE"}
              </button>
            </>
          )}

          {state === "downloading" && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <div className="font-mono text-[11px] uppercase tracking-widest text-dim">
                  {lang === "tr" ? "İNDİRİLİYOR" : "DOWNLOADING"}
                </div>
                <div className="font-mono text-sm text-brand">{progress}%</div>
              </div>
              <div className="h-2.5 w-full bg-bg border border-brand relative overflow-hidden">
                <div
                  className="absolute left-0 top-0 h-full transition-all duration-200"
                  style={{ width: `${progress}%`, background: "var(--accent)" }}
                />
              </div>
              <p className="text-[10px] text-dim mt-2">
                {lang === "tr"
                  ? "İndirme sırasında manager'ı kullanmaya devam edebilirsiniz."
                  : "You can keep using the manager while it downloads."}
              </p>
            </div>
          )}

          {state === "ready" && (
            <>
              <StatusBlock
                icon={CheckCircle2}
                tone="ok"
                title={lang === "tr" ? "İndirme tamamlandı" : "Download complete"}
                subtitle={lang === "tr"
                  ? "Manager yeniden başlatılınca güncelleme otomatik yüklenir."
                  : "The manager will restart and install the update automatically."}
              />
              <button
                onClick={installNow}
                className="btn-primary w-full py-3 flex items-center justify-center gap-2 update-btn-pulse"
                data-testid="update-install-btn"
              >
                <Rocket size={15} />
                {lang === "tr" ? "YENİDEN BAŞLAT & YÜKLE" : "RESTART & INSTALL"}
              </button>
            </>
          )}

          {state === "error" && (
            <StatusBlock
              icon={AlertCircle}
              tone="danger"
              title={lang === "tr" ? "Güncelleme kontrolü başarısız" : "Update check failed"}
              subtitle={error || (lang === "tr" ? "Bağlantı veya sunucu hatası." : "Connection or server error.")}
            />
          )}
        </div>
      </div>
    </div>
  );
};

const StatusBlock = ({ icon: Icon, title, subtitle, tone, spin }) => {
  const color =
    tone === "ok" ? "var(--success)"
    : tone === "danger" ? "var(--danger)"
    : tone === "accent" ? "var(--accent)"
    : "var(--text-muted)";
  return (
    <div className="flex items-start gap-3 p-4 border border-brand bg-bg/60">
      <Icon size={20} className={`shrink-0 ${spin ? "animate-spin" : ""}`} style={{ color }} />
      <div>
        <div className="heading-stencil text-sm" style={{ color }}>{title}</div>
        {subtitle && <div className="text-[11px] text-dim mt-1 leading-relaxed">{subtitle}</div>}
      </div>
    </div>
  );
};
