import React, { useState, useEffect } from "react";
import { X, Save } from "lucide-react";
import { endpoints } from "../lib/api";
import { useI18n } from "../providers/I18nProvider";
import { toast } from "sonner";

/**
 * ServerPortsModal — lets the user edit:
 *   - Game Port (default 7779)
 *   - Query Port (default 7780)
 *   - Max Players
 * These are passed to SCUMServer.exe as CLI flags on START.
 */
export const ServerPortsModal = ({ open, server, onClose, onSaved }) => {
  const { t } = useI18n();
  const [gamePort, setGamePort] = useState(7779);
  const [queryPort, setQueryPort] = useState(7780);
  const [maxPlayers, setMaxPlayers] = useState(64);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (server) {
      setGamePort(server.game_port ?? 7779);
      setQueryPort(server.query_port ?? 7780);
      setMaxPlayers(server.max_players ?? 64);
    }
  }, [server]);

  if (!open || !server) return null;

  const handleSave = async () => {
    setSaving(true);
    try {
      const updated = await endpoints.updateServerPorts(server.id, {
        game_port: Number(gamePort),
        query_port: Number(queryPort),
        max_players: Number(maxPlayers),
      });
      onSaved?.(updated);
      toast.success(t("save_success") || "Kaydedildi");
      onClose();
    } catch (e) {
      toast.error(e.response?.data?.detail || e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" data-testid="ports-modal">
      <div className="absolute inset-0 bg-black/70" onClick={onClose} />
      <div className="relative w-[480px] max-w-[92vw] border border-accent-brand bg-bg-deep shadow-2xl">
        <div className="flex items-center justify-between px-5 py-3 border-b border-brand bg-bg">
          <div>
            <div className="label-accent leading-none">SUNUCU PORTLARI</div>
            <h3 className="heading-stencil text-base mt-1">{server.name}</h3>
          </div>
          <button onClick={onClose} className="icon-btn" data-testid="ports-modal-close">
            <X size={16} />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div>
            <label className="label-overline block mb-1.5">Oyun Portu (Game Port)</label>
            <input
              type="number" min="1024" max="65535"
              value={gamePort}
              onChange={(e) => setGamePort(e.target.value)}
              className="w-full bg-bg border border-brand px-3 py-2 font-mono text-sm text-brand focus:outline-none focus:border-accent-brand"
              data-testid="input-game-port"
            />
            <p className="font-mono text-[10px] text-dim mt-1">Varsayılan: 7779 · Oyuncular bu port üzerinden bağlanır (UDP)</p>
          </div>

          <div>
            <label className="label-overline block mb-1.5">Query Portu</label>
            <input
              type="number" min="1024" max="65535"
              value={queryPort}
              onChange={(e) => setQueryPort(e.target.value)}
              className="w-full bg-bg border border-brand px-3 py-2 font-mono text-sm text-brand focus:outline-none focus:border-accent-brand"
              data-testid="input-query-port"
            />
            <p className="font-mono text-[10px] text-dim mt-1">Varsayılan: 7780 · Steam listesi için (UDP)</p>
          </div>

          <div>
            <label className="label-overline block mb-1.5">Maksimum Oyuncu</label>
            <input
              type="number" min="1" max="128"
              value={maxPlayers}
              onChange={(e) => setMaxPlayers(e.target.value)}
              className="w-full bg-bg border border-brand px-3 py-2 font-mono text-sm text-brand focus:outline-none focus:border-accent-brand"
              data-testid="input-max-players"
            />
            <p className="font-mono text-[10px] text-dim mt-1">1 - 128 arası</p>
          </div>

          <div className="border-t border-brand pt-3 flex items-center justify-between text-[10px] font-mono text-dim">
            <span>Değişiklikler bir sonraki BAŞLAT işleminde uygulanır.</span>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-brand bg-bg">
          <button onClick={onClose} className="btn-secondary px-4 py-2" data-testid="ports-modal-cancel">
            İptal
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="btn-primary px-4 py-2 flex items-center gap-2"
            data-testid="ports-modal-save"
          >
            <Save size={13} /> {saving ? "Kaydediliyor..." : "Kaydet"}
          </button>
        </div>
      </div>
    </div>
  );
};
