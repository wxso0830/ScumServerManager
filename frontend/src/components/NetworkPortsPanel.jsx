import React, { useEffect, useState } from "react";
import { Save, AlertTriangle, Network } from "lucide-react";
import { endpoints } from "../lib/api";
import { toast } from "sonner";
import { useI18n } from "../providers/I18nProvider";

/**
 * NetworkPortsPanel — explicit 4-port view modelled after PingPerfect's panel.
 *
 * SCUM dedicated server uses FOUR ports total:
 *  - 1 QUERY port (isolated, for Steam A2S_INFO — kept OUTSIDE the game range)
 *  - 3 GAME ports (consecutive: port, port+1, port+2; players connect to port+2)
 *
 * Default scheme: game_port = 7777 → game range 7777/7778/7779, query_port = 7780.
 * (Old manager default put query inside the game range which technically
 * conflicts on the wire; v1.0.22 moves it to game_port + 3 outside the range.)
 *
 * Both inputs are editable. The 3 game ports are shown as a single editable
 * "start of range" field + two read-only +1 / +2 badges so the admin sees the
 * full picture without typing them individually.
 */
export const NetworkPortsPanel = ({ server, onSaved }) => {
  const { t } = useI18n();
  const [gamePort, setGamePort] = useState(server.game_port ?? 7777);
  const [queryPort, setQueryPort] = useState(
    server.query_port ?? (server.game_port ?? 7777) + 3,
  );
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    setGamePort(server.game_port ?? 7777);
    setQueryPort(server.query_port ?? (server.game_port ?? 7777) + 3);
    setDirty(false);
  }, [server.id, server.game_port, server.query_port]);

  const handleGamePortChange = (e) => {
    const v = e.target.value;
    setGamePort(v);
    // Auto-follow query port ONLY when it was at the "standard" offset
    // (game_port + 3, outside the 3-port range). Once admin customizes
    // query manually, leave it alone.
    const oldGP = Number(gamePort);
    if (Number(queryPort) === oldGP + 3) {
      setQueryPort(Number(v) + 3);
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
  const gp = Number(gamePort) || 0;
  const qp = Number(queryPort) || 0;
  // Detect overlap between query and game range — flag it but don't block save
  const overlap = qp >= gp && qp <= gp + 2;

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

      {/* 4-port summary — stacked rows (PingPerfect-style). Query first since
          it's the one that gets queried by Steam to even list the server. */}
      <div className="border border-brand">
        {/* ----- Row 1: Query Port (single, isolated) ----- */}
        <div className="grid grid-cols-12 gap-3 items-center px-4 py-3 border-b border-brand bg-bg-deep">
          <div className="col-span-12 md:col-span-3">
            <div className="label-overline text-brand">QUERY PORT</div>
            <div className="font-mono text-[10px] text-dim mt-0.5">1 port · UDP · A2S_INFO</div>
          </div>
          <div className="col-span-12 md:col-span-5">
            <input
              type="number" min="1024" max="65535"
              value={queryPort}
              onChange={handleQueryPortChange}
              className="w-full bg-bg border border-brand px-3 py-2 font-display text-lg text-brand focus:outline-none focus:border-accent-brand"
              data-testid="input-query-port"
            />
          </div>
          <div className="col-span-12 md:col-span-4 flex md:justify-end">
            <span className="px-2 py-1 text-[10px] font-mono uppercase tracking-widest" style={{ color: "var(--success)", border: "1px solid var(--success)", background: "color-mix(in srgb, var(--success) 12%, transparent)" }}>
              {t("ports_query_label") || "Steam Browser"}
            </span>
          </div>
        </div>

        {/* ----- Row 2: Game Port (3 consecutive) ----- */}
        <div className="grid grid-cols-12 gap-3 items-center px-4 py-3">
          <div className="col-span-12 md:col-span-3">
            <div className="label-overline text-brand">GAME PORT</div>
            <div className="font-mono text-[10px] text-dim mt-0.5">3 ports · UDP · ardışık</div>
          </div>
          <div className="col-span-12 md:col-span-5 flex items-center gap-2">
            <input
              type="number" min="1024" max="65532"
              value={gamePort}
              onChange={handleGamePortChange}
              className="w-32 bg-bg border border-brand px-3 py-2 font-display text-lg text-brand focus:outline-none focus:border-accent-brand"
              data-testid="input-game-port"
            />
            <span className="text-dim font-mono">·</span>
            <span className="px-2 py-1.5 bg-bg border border-strong font-display text-base text-dim cursor-not-allowed" title="game_port + 1">
              {gp + 1}
            </span>
            <span className="text-dim font-mono">·</span>
            <span
              className="px-2 py-1.5 border font-display text-base"
              style={{ borderColor: "var(--accent)", color: "var(--accent)", background: "color-mix(in srgb, var(--accent) 10%, transparent)" }}
              title="game_port + 2 — bağlantı portu"
            >
              {gp + 2}
            </span>
          </div>
          <div className="col-span-12 md:col-span-4 flex md:justify-end">
            <span className="px-2 py-1 text-[10px] font-mono uppercase tracking-widest" style={{ color: "var(--accent)", border: "1px solid var(--accent)", background: "color-mix(in srgb, var(--accent) 12%, transparent)" }}>
              CONNECT → {gp + 2}
            </span>
          </div>
        </div>
      </div>

      {overlap && (
        <div className="flex items-center gap-2 text-[11px] font-mono border border-warning/50 bg-warning/10 px-3 py-2" style={{ color: "var(--warning)" }}>
          <AlertTriangle size={13} />
          <span>
            Query port ({qp}) game range ({gp}-{gp + 2}) içinde — çakışabilir. Önerilen: {gp + 3} veya tamamen ayrı (örn. 27015).
          </span>
        </div>
      )}

      {/* Player connect hint */}
      <div className="border border-dashed border-accent-brand/40 bg-accent-soft/20 px-3 py-2 flex items-start gap-2">
        <Network size={13} className="text-accent-brand shrink-0 mt-0.5" />
        <div className="font-mono text-[10px] text-dim leading-relaxed">
          <div>
            <span className="text-muted uppercase tracking-widest">CONNECT IP: </span>
            <span className="text-accent-brand font-display text-sm">PUBLIC_IP:{gp + 2}</span>
            <span className="opacity-60"> · oyuncular SCUM Direct Connect bölümüne yapıştırır</span>
          </div>
          <div className="mt-1 opacity-80">
            Manager başlatırken Windows Firewall'da otomatik açar:{" "}
            <span className="text-accent-brand">UDP {gp}-{gp + 2}</span> + <span className="text-accent-brand">UDP/TCP {qp}</span>.
            Ev kullanıcısıysan router'da da bu portları forward etmen gerekir.
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between border-t border-brand pt-3">
        <div className="font-mono text-[10px] text-dim truncate pr-3">
          <span className="text-muted">CLI: </span>
          <span className="text-brand">-port={gp} -QueryPort={qp}</span>
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
