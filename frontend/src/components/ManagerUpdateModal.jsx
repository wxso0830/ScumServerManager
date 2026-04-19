import React, { useEffect, useState } from "react";
import { X, Download, CheckCircle2, AlertCircle, RefreshCw } from "lucide-react";
import { toast } from "sonner";

/**
 * ManagerUpdateModal — uses Electron auto-updater (GitHub Releases).
 *
 * States: idle -> checking -> up-to-date | available -> downloading -> ready
 *
 * When Electron is not present (browser / dev), falls back to a short info message.
 */
export const ManagerUpdateModal = ({ open, onClose }) => {
  const [state, setState] = useState("idle");      // idle|checking|uptodate|available|downloading|ready|error
  const [info, setInfo] = useState(null);          // {currentVersion, latestVersion}
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState(null);

  // Subscribe to update events from main process
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

  // Kick off the check as soon as the modal opens
  useEffect(() => {
    if (!open) return;
    (async () => {
      setError(null); setProgress(0); setState("checking");
      if (!window?.lgss?.checkForUpdates) {
        // Browser / dev fallback
        setState("uptodate");
        const v = window?.lgss?.getVersion ? await window.lgss.getVersion() : "1.0.0";
        setInfo({ currentVersion: v, latestVersion: v });
        return;
      }
      const result = await window.lgss.checkForUpdates();
      setInfo({ currentVersion: result.currentVersion, latestVersion: result.latestVersion });
      if (!result.ok)                          { setState("error"); setError(result.error); }
      else if (result.updateAvailable)         setState("available");
      else                                     setState("uptodate");
    })();
  }, [open]);

  if (!open) return null;

  const startDownload = async () => {
    setState("downloading"); setProgress(0);
    const r = await window.lgss.downloadUpdate();
    if (!r?.ok) { setState("error"); setError(r?.error || "download failed"); }
  };

  const installNow = async () => {
    toast("Yeniden baslatiliyor...");
    await window.lgss.installUpdate();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" data-testid="manager-update-modal">
      <div className="absolute inset-0 bg-black/70" onClick={onClose} />
      <div className="relative w-[520px] max-w-[92vw] border border-accent-brand bg-bg-deep shadow-2xl">
        <div className="flex items-center justify-between px-5 py-3 border-b border-brand bg-bg">
          <div>
            <div className="label-accent leading-none">MANAGER</div>
            <h3 className="heading-stencil text-base mt-1">GÜNCELLEME KONTROLÜ</h3>
          </div>
          <button onClick={onClose} className="icon-btn" data-testid="update-modal-close"><X size={16} /></button>
        </div>

        <div className="p-5 space-y-4">
          <div className="font-mono text-[11px] text-dim">
            <div>Yüklü sürüm: <span className="text-brand">{info?.currentVersion || "?"}</span></div>
            {info?.latestVersion && info.latestVersion !== info.currentVersion && (
              <div>Yeni sürüm: <span className="text-accent-brand">{info.latestVersion}</span></div>
            )}
          </div>

          {state === "checking" && (
            <Row icon={RefreshCw} spin>GitHub'dan son sürüm kontrol ediliyor...</Row>
          )}
          {state === "uptodate" && (
            <Row icon={CheckCircle2} ok>Uygulama güncel.</Row>
          )}
          {state === "available" && (
            <>
              <Row icon={Download} accent>
                Yeni sürüm <b>{info?.latestVersion}</b> indirilebilir.
              </Row>
              <button onClick={startDownload} className="btn-primary w-full py-2 flex items-center justify-center gap-2" data-testid="update-download-btn">
                <Download size={14} /> Güncellemeyi İndir
              </button>
            </>
          )}
          {state === "downloading" && (
            <>
              <div className="font-mono text-[11px] text-dim mb-1.5 flex items-center justify-between">
                <span>İndiriliyor...</span>
                <span className="text-brand">{progress}%</span>
              </div>
              <div className="h-2 w-full bg-bg border border-brand relative overflow-hidden">
                <div className="absolute left-0 top-0 h-full transition-all" style={{ width: `${progress}%`, background: "var(--accent)" }} />
              </div>
            </>
          )}
          {state === "ready" && (
            <>
              <Row icon={CheckCircle2} ok>
                İndirme tamamlandı. Uygulama yeniden başlatılıp güncellenecek.
              </Row>
              <button onClick={installNow} className="btn-primary w-full py-2 flex items-center justify-center gap-2" data-testid="update-install-btn">
                Yeniden Başlat & Yükle
              </button>
            </>
          )}
          {state === "error" && (
            <Row icon={AlertCircle} danger>
              {error || "Güncelleme kontrolü sırasında hata."}
              <div className="font-mono text-[10px] text-dim mt-1">
                GitHub Releases publish yapılmamış olabilir veya bağlantı hatası.
              </div>
            </Row>
          )}
        </div>
      </div>
    </div>
  );
};

const Row = ({ icon: Icon, children, ok, danger, accent, spin }) => {
  const color = ok ? "var(--success)" : danger ? "var(--danger)" : accent ? "var(--accent)" : "var(--text-muted)";
  return (
    <div className="flex items-start gap-2 text-sm" style={{ color }}>
      <Icon size={15} className={`mt-0.5 shrink-0 ${spin ? "animate-spin" : ""}`} />
      <div className="leading-snug">{children}</div>
    </div>
  );
};
