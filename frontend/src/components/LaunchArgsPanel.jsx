import React, { useEffect, useState } from "react";
import { Terminal, Save, AlertTriangle, Info } from "lucide-react";
import { endpoints } from "../lib/api";
import { toast } from "sonner";

/**
 * LaunchArgsPanel — admin-supplied SCUMServer.exe extra command-line args.
 *
 * Stored verbatim, shlex-split at start time, appended AFTER the manager's
 * default flags (`-log -stdout -port=... -QueryPort=... -MaxPlayers=...`).
 * Used for mod ids, custom Unreal flags, ini overrides, etc.
 */
export const LaunchArgsPanel = ({ server, onSaved }) => {
  const [val, setVal] = useState(server.launch_args || "");
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    setVal(server.launch_args || "");
    setDirty(false);
  }, [server.id, server.launch_args]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const updated = await endpoints.updateServerLaunchArgs(server.id, val);
      onSaved?.(updated);
      setDirty(false);
      toast.success("Başlatma seçenekleri kaydedildi");
    } catch (e) {
      toast.error(e.response?.data?.detail || e.message);
    } finally {
      setSaving(false);
    }
  };

  const isRunning = server.status === "Running" || server.status === "Starting";
  const gp = server.game_port ?? 7777;
  const qp = server.query_port ?? 7778;
  const mp = server.max_players ?? 64;

  return (
    <div className="space-y-4 pt-2" data-testid="launch-args-panel">
      <div className="flex items-center gap-2 border-b border-brand pb-2">
        <Terminal size={13} className="text-accent-brand" />
        <span className="label-accent">BAŞLATMA SEÇENEKLERİ</span>
      </div>

      <p className="font-mono text-[11px] text-dim leading-relaxed">
        Gelişmiş kullanıcılar başlatma seçeneklerinde değişiklikler yapabilir. Buraya
        yazdığınız argümanlar SCUMServer.exe&apos;ye <span className="text-brand">-log</span>{" "}
        ile birlikte aktarılır. Mod yüklemek, özel bayraklar veya .ini geçersiz kılmaları
        için kullanılır.
      </p>

      {isRunning && (
        <div className="flex items-center gap-2 text-[11px] font-mono border border-warning/40 bg-warning/5 px-3 py-2" style={{ color: "var(--warning)" }}>
          <AlertTriangle size={13} />
          <span>Sunucu çalışıyor. Değişiklik bir sonraki başlatmada etkili olur.</span>
        </div>
      )}

      <div>
        <textarea
          value={val}
          onChange={(e) => { setVal(e.target.value); setDirty(true); }}
          rows={4}
          maxLength={2000}
          placeholder="-mod=workshopId -CustomFlag=value"
          className="w-full bg-bg border border-brand px-3 py-2 font-mono text-sm text-brand focus:outline-none focus:border-accent-brand resize-y"
          data-testid="input-launch-args"
        />
        <div className="flex items-center justify-between mt-1">
          <p className="font-mono text-[10px] text-dim">
            Boşlukla ayrılmış argümanlar · Tırnak içindeki değerler tek argüman olarak işlenir
          </p>
          <span className="font-mono text-[10px] text-muted">{val.length}/2000</span>
        </div>
      </div>

      {/* Live preview of the full command line */}
      <div className="border border-brand bg-bg-deep px-3 py-2">
        <div className="flex items-center gap-2 mb-1">
          <Info size={11} className="text-accent-brand" />
          <span className="label-overline">Tam Komut</span>
        </div>
        <div className="font-mono text-[11px] text-dim leading-relaxed break-all">
          <span className="text-brand">SCUMServer.exe</span>{" "}
          -log -stdout -NoVerifyGC -nocrashreports -nosound{" "}
          -port={gp} -QueryPort={qp} -MaxPlayers={mp}
          {val.trim() && (
            <>
              {" "}
              <span className="text-accent-brand">{val.trim()}</span>
            </>
          )}
        </div>
      </div>

      <div className="flex justify-end border-t border-brand pt-3">
        <button
          onClick={handleSave}
          disabled={saving || !dirty}
          className="btn-primary px-4 py-2 flex items-center gap-2 shrink-0"
          data-testid="save-launch-args-btn"
        >
          <Save size={13} /> {saving ? "Kaydediliyor..." : "Kaydet"}
        </button>
      </div>
    </div>
  );
};
