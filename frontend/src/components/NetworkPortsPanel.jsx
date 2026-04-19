import React, { useEffect, useState } from "react";
import { Network, Save, AlertTriangle } from "lucide-react";
import { endpoints } from "../lib/api";
import { toast } from "sonner";

/**
 * NetworkPortsPanel — inline editor for SCUMServer.exe CLI args:
 *   - Game Port (-port, default 7779)
 *   - Query Port (-QueryPort, default 7780)
 * Max Players lives in Essentials > Access & Capacity (scum.MaxPlayers).
 */
export const NetworkPortsPanel = ({ server, onSaved }) => {
  const [gamePort, setGamePort] = useState(server.game_port ?? 7779);
  const [queryPort, setQueryPort] = useState(server.query_port ?? 7780);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    setGamePort(server.game_port ?? 7779);
    setQueryPort(server.query_port ?? 7780);
    setDirty(false);
  }, [server.id, server.game_port, server.query_port]);

  const change = (setter) => (e) => { setter(e.target.value); setDirty(true); };

  const handleSave = async () => {
    setSaving(true);
    try {
      const updated = await endpoints.updateServerPorts(server.id, {
        game_port: Number(gamePort),
        query_port: Number(queryPort),
      });
      onSaved?.(updated);
      setDirty(false);
      toast.success("Portlar kaydedildi");
    } catch (e) {
      toast.error(e.response?.data?.detail || e.message);
    } finally {
      setSaving(false);
    }
  };

  const isRunning = server.status === "Running";

  return (
    <div className="space-y-4 pt-2" data-testid="network-ports-panel">
      <div className="flex items-center gap-2 border-b border-brand pb-2">
        <Network size={13} className="text-accent-brand" />
        <span className="label-accent">SUNUCU AĞ PORTLARI</span>
      </div>

      {isRunning && (
        <div className="flex items-center gap-2 text-[11px] font-mono border border-warning/40 bg-warning/5 px-3 py-2" style={{ color: "var(--warning)" }}>
          <AlertTriangle size={13} />
          <span>Sunucu çalışıyor. Port değişikliği sunucuyu yeniden başlatana kadar aktif olmaz.</span>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="label-overline block mb-1.5">Oyun Portu (Game Port)</label>
          <input
            type="number" min="1024" max="65535"
            value={gamePort}
            onChange={change(setGamePort)}
            className="w-full bg-bg border border-brand px-3 py-2 font-mono text-sm text-brand focus:outline-none focus:border-accent-brand"
            data-testid="input-game-port"
          />
          <p className="font-mono text-[10px] text-dim mt-1">Default 7779 · Oyuncular bu UDP portundan bağlanır</p>
        </div>

        <div>
          <label className="label-overline block mb-1.5">Query Portu</label>
          <input
            type="number" min="1024" max="65535"
            value={queryPort}
            onChange={change(setQueryPort)}
            className="w-full bg-bg border border-brand px-3 py-2 font-mono text-sm text-brand focus:outline-none focus:border-accent-brand"
            data-testid="input-query-port"
          />
          <p className="font-mono text-[10px] text-dim mt-1">Default 7780 · Steam sunucu listesi için</p>
        </div>
      </div>

      <div className="flex items-center justify-between border-t border-brand pt-3">
        <div className="font-mono text-[10px] text-dim truncate pr-3">
          <span className="text-muted">CLI: </span>
          <span className="text-brand">-port={gamePort} -QueryPort={queryPort}</span>
        </div>
        <button
          onClick={handleSave}
          disabled={saving || !dirty}
          className="btn-primary px-4 py-2 flex items-center gap-2 shrink-0"
          data-testid="save-ports-btn"
        >
          <Save size={13} /> {saving ? "Kaydediliyor..." : "Portları Kaydet"}
        </button>
      </div>
    </div>
  );
};
