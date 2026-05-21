import React, { useEffect, useState } from "react";
import { Network, Save, AlertTriangle } from "lucide-react";
import { endpoints } from "../lib/api";
import { toast } from "sonner";
import { useI18n } from "../providers/I18nProvider";

/**
 * NetworkPortsPanel — inline editor for SCUMServer.exe CLI args:
 *   - Game Port (-port, default 7779)
 *   - Query Port (-QueryPort, default 7780)
 * Max Players lives in Essentials > Access & Capacity (scum.MaxPlayers).
 */
export const NetworkPortsPanel = ({ server, onSaved }) => {
  const { t } = useI18n();
  const [gamePort, setGamePort] = useState(server.game_port ?? 7777);
  // Query port is editable but defaults to game_port + 1 (SCUM convention).
  // Most admins should leave it alone, but PingPerfect-style hosts give a
  // standalone query port (e.g. 11442 with game 11582) so we no longer lock it.
  const [queryPort, setQueryPort] = useState(server.query_port ?? (server.game_port ?? 7777) + 1);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    setGamePort(server.game_port ?? 7777);
    setQueryPort(server.query_port ?? (server.game_port ?? 7777) + 1);
    setDirty(false);
  }, [server.id, server.game_port, server.query_port]);

  // Convenience: when the admin types a new game port, auto-shift the query
  // port unless they've already customized it (i.e. it was game_port+1).
  const handleGamePortChange = (e) => {
    const v = e.target.value;
    setGamePort(v);
    const oldGP = Number(gamePort);
    const oldQP = Number(queryPort);
    // Only auto-track when query was the standard "+1" of the previous game port.
    if (oldQP === oldGP + 1) {
      setQueryPort(Number(v) + 1);
    }
    setDirty(true);
  };

  const handleQueryPortChange = (e) => {
    setQueryPort(e.target.value);
    setDirty(true);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const updated = await endpoints.updateServerPorts(server.id, {
        game_port: Number(gamePort),
        query_port: Number(queryPort),
      });
      onSaved?.(updated);
      setDirty(false);
      toast.success(t("ports_saved"));
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
        <span className="label-accent">{t("ports_title")}</span>
      </div>

      {isRunning && (
        <div className="flex items-center gap-2 text-[11px] font-mono border border-warning/40 bg-warning/5 px-3 py-2" style={{ color: "var(--warning)" }}>
          <AlertTriangle size={13} />
          <span>{t("ports_running_warn")}</span>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="label-overline block mb-1.5">{t("ports_game_label")}</label>
          <input
            type="number" min="1024" max="65532"
            value={gamePort}
            onChange={handleGamePortChange}
            className="w-full bg-bg border border-brand px-3 py-2 font-mono text-sm text-brand focus:outline-none focus:border-accent-brand"
            data-testid="input-game-port"
          />
          <p className="font-mono text-[10px] text-dim mt-1">
            {t("ports_game_hint")} · SCUM uses 3 ports: {gamePort}, {Number(gamePort) + 1}, {Number(gamePort) + 2}
          </p>
        </div>

        <div>
          <label className="label-overline block mb-1.5">{t("ports_query_label")}</label>
          <input
            type="number" min="1024" max="65535"
            value={queryPort}
            onChange={handleQueryPortChange}
            className="w-full bg-bg border border-brand px-3 py-2 font-mono text-sm text-brand focus:outline-none focus:border-accent-brand"
            data-testid="input-query-port"
          />
          <p className="font-mono text-[10px] text-dim mt-1">
            {t("ports_query_hint") || `Steam server browser query port (default: game_port + 1)`}
          </p>
        </div>
      </div>

      {/* Connect port hint — players use game_port + 2 in SCUM's Direct Connect. */}
      <div className="border border-dashed border-accent-brand/40 bg-accent-soft/20 px-3 py-2 flex items-start gap-2">
        <Network size={13} className="text-accent-brand shrink-0 mt-0.5" />
        <div className="font-mono text-[10px] text-dim leading-relaxed">
          <div>
            <span className="text-muted uppercase tracking-widest">CONNECT PORT: </span>
            <span className="text-brand font-display text-sm">{Number(gamePort) + 2}</span>
            <span className="opacity-60"> (game_port + 2)</span>
          </div>
          <div className="mt-0.5 opacity-80">
            Players paste <span className="text-accent-brand">PUBLIC_IP:{Number(gamePort) + 2}</span> in SCUM's Direct Connect.
            Manager auto-opens UDP <span className="text-accent-brand">{gamePort}-{Number(gamePort) + 2}</span> + query <span className="text-accent-brand">{queryPort}</span> in Windows Firewall on start.
          </div>
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
          <Save size={13} /> {saving ? t("saving_dotted") : t("save_ports")}
        </button>
      </div>
    </div>
  );
};
