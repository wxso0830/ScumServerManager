import React, { useEffect, useState } from "react";
import { Save, AlertTriangle, Network, Wifi, Search, Plug } from "lucide-react";
import { endpoints } from "../lib/api";
import { toast } from "sonner";
import { useI18n } from "../providers/I18nProvider";
import { NetworkSetupPanel } from "./NetworkSetupPanel";

/**
 * NetworkPortsPanel — SCUM 3-port layout.
 *
 * SCUM uses exactly THREE consecutive ports:
 *   - Game Port  (e.g. 7777)        ← admin sets this; -port flag
 *   - Query Port (game_port + 1)    ← Steam A2S browser query
 *   - Steam Port (game_port + 2)    ← ★ THIS is what players paste in Direct Connect
 *
 * Multi-server convention: bump game_port by 3 each. e.g. S1 7777/7778/7779,
 * S2 7780/7781/7782, S3 7783/7784/7785. Manager auto-derives Query and Steam.
 *
 * Query port is editable (rare custom setups need it) but defaults to +1 and
 * follows game_port automatically. Steam/Connect is purely computed; read-only.
 */
export const NetworkPortsPanel = ({ server, onSaved }) => {
  const { t } = useI18n();
  const [gamePort, setGamePort] = useState(server.game_port ?? 7777);
  const [queryPort, setQueryPort] = useState(
    server.query_port ?? (server.game_port ?? 7777) + 1,
  );
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    setGamePort(server.game_port ?? 7777);
    setQueryPort(server.query_port ?? (server.game_port ?? 7777) + 1);
    setDirty(false);
  }, [server.id, server.game_port, server.query_port]);

  const handleGamePortChange = (e) => {
    const v = e.target.value;
    setGamePort(v);
    // Auto-follow query port when it's still at the SCUM default (game_port + 1).
    // If admin has manually customized it (different offset), leave it alone.
    const oldGP = Number(gamePort);
    if (Number(queryPort) === oldGP + 1) {
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
  const gp = Number(gamePort) || 0;
  const qp = Number(queryPort) || 0;
  const steamPort = gp + 2;

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

      {/* ----- 3 stacked rows: Game / Query / Steam ----- */}
      <div className="border border-brand">
        {/* Row 1: GAME PORT (editable) */}
        <div className="grid grid-cols-12 gap-3 items-center px-4 py-3 border-b border-brand">
          <div className="col-span-12 md:col-span-4 flex items-center gap-2">
            <Plug size={14} className="text-accent-brand" />
            <div>
              <div className="label-overline text-brand">GAME PORT</div>
              <div className="font-mono text-[10px] text-dim mt-0.5">-port · UDP</div>
            </div>
          </div>
          <div className="col-span-7 md:col-span-5">
            <input
              type="number" min="1024" max="65533"
              value={gamePort}
              onChange={handleGamePortChange}
              className="w-full bg-bg border border-brand px-3 py-2 font-display text-lg text-brand focus:outline-none focus:border-accent-brand"
              data-testid="input-game-port"
            />
          </div>
          <div className="col-span-5 md:col-span-3 flex md:justify-end">
            <span className="px-2 py-1 text-[10px] font-mono uppercase tracking-widest" style={{ color: "var(--accent)", border: "1px solid var(--accent)", background: "color-mix(in srgb, var(--accent) 12%, transparent)" }}>
              MAIN
            </span>
          </div>
        </div>

        {/* Row 2: QUERY PORT (editable, default = game+1) */}
        <div className="grid grid-cols-12 gap-3 items-center px-4 py-3 border-b border-brand bg-bg-deep/40">
          <div className="col-span-12 md:col-span-4 flex items-center gap-2">
            <Search size={14} className="text-success" style={{ color: "var(--success)" }} />
            <div>
              <div className="label-overline text-brand">QUERY PORT</div>
              <div className="font-mono text-[10px] text-dim mt-0.5">-QueryPort · UDP · Steam A2S</div>
            </div>
          </div>
          <div className="col-span-7 md:col-span-5">
            <input
              type="number" min="1024" max="65534"
              value={queryPort}
              onChange={handleQueryPortChange}
              className="w-full bg-bg border border-brand px-3 py-2 font-display text-lg text-brand focus:outline-none focus:border-accent-brand"
              data-testid="input-query-port"
            />
          </div>
          <div className="col-span-5 md:col-span-3 flex md:justify-end">
            <span className="px-2 py-1 text-[10px] font-mono uppercase tracking-widest" style={{ color: "var(--success)", border: "1px solid var(--success)", background: "color-mix(in srgb, var(--success) 12%, transparent)" }}>
              auto: GAME +1
            </span>
          </div>
        </div>

        {/* Row 3: STEAM PORT (auto, readonly, highlighted as CONNECT) */}
        <div className="grid grid-cols-12 gap-3 items-center px-4 py-3 bg-accent-soft/20">
          <div className="col-span-12 md:col-span-4 flex items-center gap-2">
            <Wifi size={14} style={{ color: "var(--accent)" }} />
            <div>
              <div className="label-overline" style={{ color: "var(--accent)" }}>STEAM PORT</div>
              <div className="font-mono text-[10px] text-dim mt-0.5">Direct Connect · UDP</div>
            </div>
          </div>
          <div className="col-span-7 md:col-span-5">
            <input
              type="number"
              value={steamPort}
              readOnly
              disabled
              className="w-full bg-bg border-2 px-3 py-2 font-display text-lg cursor-not-allowed"
              style={{ borderColor: "var(--accent)", color: "var(--accent)" }}
              data-testid="input-steam-port"
            />
          </div>
          <div className="col-span-5 md:col-span-3 flex md:justify-end">
            <span className="px-2 py-1 text-[10px] font-mono uppercase tracking-widest font-bold animate-pulse" style={{ color: "var(--accent)", border: "1px solid var(--accent)", background: "color-mix(in srgb, var(--accent) 20%, transparent)" }}>
              ★ CONNECT
            </span>
          </div>
        </div>
      </div>

      {/* Player connect IP hint */}
      <div className="border border-dashed border-accent-brand/40 bg-accent-soft/20 px-3 py-2 flex items-start gap-2">
        <Network size={13} className="text-accent-brand shrink-0 mt-0.5" />
        <div className="font-mono text-[10px] text-dim leading-relaxed">
          <div>
            <span className="text-muted uppercase tracking-widest">{t("ports_player_address")}: </span>
            <span className="text-accent-brand font-display text-sm">PUBLIC_IP:{steamPort}</span>
          </div>
          <div className="mt-1 opacity-80">
            {t("ports_hint_line1_prefix")} <span className="text-accent-brand">IP:{steamPort}</span> {t("ports_hint_line1_suffix")}
            {" "}{t("ports_hint_line2_prefix")} <span className="text-accent-brand">UDP {gp}-{steamPort}</span>.
            {" "}{t("ports_hint_line3")}
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

      {/* v1.0.37 — Firewall / Network Setup wizard */}
      <NetworkSetupPanel server={server} />
    </div>
  );
};
