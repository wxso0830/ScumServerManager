import React, { useEffect, useMemo, useState } from "react";
import { Terminal, Save, AlertTriangle, Info, Cpu } from "lucide-react";
import { endpoints } from "../lib/api";
import { toast } from "sonner";
import { useI18n } from "../providers/I18nProvider";

/**
 * LaunchArgsPanel — ARK Server Manager-style launch options editor.
 *
 * Replaces the old free-text textarea with a curated grid of checkboxes for
 * SCUM/Unreal-specific performance flags. Power users can still drop into a
 * "raw extra args" textarea at the bottom for anything not covered by the
 * presets (mod IDs, custom Unreal flags, ini overrides).
 *
 * Storage model: on save we serialize each enabled preset to its CLI flag and
 * concatenate the raw extras at the end — exactly what `start_server()`
 * shlex-splits and appends after the default arg list.
 */

// SCUM / Unreal Engine launch options that actually have measurable effect on
// dedicated server performance / behavior. NOT exposing graphics flags (no
// rendering on dedicated) — those are noted as "client-only" and excluded.
// Sources: SCUM developer comments, Unreal Engine docs, ARK SM presets adapted.
const PRESETS = [
  // ----- Performance -----
  { key: "USEALLAVAILABLECORES", flag: "-USEALLAVAILABLECORES",
    label: "Use All Available Cores",
    desc: "Force Unreal to schedule across every CPU core (default may cap at 6).",
    group: "performance" },
  { key: "norhithread", flag: "-norhithread",
    label: "Disable RHI Thread",
    desc: "Saves ~120MB RAM by collapsing rendering hardware interface (no GPU on server anyway).",
    group: "performance" },
  { key: "nosteam", flag: "-nosteam",
    label: "Skip Steam Init Probe",
    desc: "Skip Steam runtime init checks. Faster boot but breaks Steam matchmaking — only use for LAN.",
    group: "performance" },
  { key: "NoVerifyGC", flag: "-NoVerifyGC",
    label: "Disable GC Verification (boot)",
    desc: "Skip Unreal garbage collector sanity pass on startup. ~5-15s faster boot, slightly less safe.",
    group: "performance", defaultOn: true },
  { key: "nocrashreports", flag: "-nocrashreports",
    label: "Disable Crash Reporter",
    desc: "Skip CrashReportClient warm-up. Saves ~3-8s on first boot.",
    group: "performance", defaultOn: true },
  { key: "nosound", flag: "-nosound",
    label: "Disable Audio Subsystem",
    desc: "Dedicated server has no audio device. Skips SoundCue warmup.",
    group: "performance", defaultOn: true },

  // ----- Logging -----
  { key: "log", flag: "-log",
    label: "Show Server Console",
    desc: "Open a separate console window with the live colored server log.",
    group: "logging", defaultOn: true },
  { key: "stdout", flag: "-stdout",
    label: "Forward Log to stdout",
    desc: "Pipe SCUM's log to stdout (in addition to file).",
    group: "logging", defaultOn: true },
  { key: "VERBOSE", flag: "-VERBOSE",
    label: "Verbose Logging",
    desc: "Increase log detail. Useful for debugging crashes, but produces large log files.",
    group: "logging" },
  { key: "FORCELOGFLUSH", flag: "-FORCELOGFLUSH",
    label: "Force Log Flush",
    desc: "fsync every log line. Helps with crash dumps but costs 10-40s boot time on SCUM's chatty output.",
    group: "logging" },

  // ----- Anti-Cheat / Network -----
  { key: "NOBATTLEYE", flag: "-NOBATTLEYE",
    label: "Disable BattlEye",
    desc: "Boot without BattlEye anti-cheat. Use for whitelist-only / mod-test servers.",
    group: "anticheat" },
  { key: "noeac", flag: "-noeac",
    label: "Disable Easy Anti-Cheat",
    desc: "Disable EAC. Faster boot. Only safe on private/whitelist servers.",
    group: "anticheat" },
  { key: "MULTIHOME", flag: "-MULTIHOME=0.0.0.0",
    label: "Bind All Interfaces",
    desc: "Listen on every network interface (default is auto-detect, can pick wrong NIC).",
    group: "network" },
  { key: "NetServerMaxTickRate", flag: "-NetServerMaxTickRate=30",
    label: "Net Tick Rate 30",
    desc: "Cap network update rate at 30Hz. Lowers bandwidth, slightly more rubberbanding.",
    group: "network" },

  // ----- Memory / Limits -----
  { key: "ONETHREAD", flag: "-ONETHREAD",
    label: "Single-Thread Mode",
    desc: "Force single-thread execution. Debug only — significantly slower.",
    group: "memory" },
  { key: "AllowSoftwareRendering", flag: "-AllowSoftwareRendering",
    label: "Allow Software Rendering",
    desc: "Permit software-mode renderer. Required on some VPS hosts without GPU drivers.",
    group: "memory" },
  { key: "Insecure", flag: "-Insecure",
    label: "Disable VAC",
    desc: "Disable Valve Anti-Cheat. Stops VAC bans but blocks server from official browser.",
    group: "anticheat" },
];

const GROUP_LABELS = {
  performance: { tr: "Performans", en: "Performance", icon: "⚡" },
  logging:     { tr: "Günlükleme", en: "Logging",     icon: "📝" },
  anticheat:   { tr: "Anti-Cheat", en: "Anti-Cheat",  icon: "🛡" },
  network:     { tr: "Ağ",         en: "Network",     icon: "🌐" },
  memory:      { tr: "Bellek",     en: "Memory",      icon: "🧠" },
};

/** Parse a saved launch_args string into enabled-preset set + leftover raw text. */
function parseLaunchArgs(raw) {
  const enabled = new Set();
  const tokens = (raw || "").trim().split(/\s+/).filter(Boolean);
  const leftover = [];
  for (const tok of tokens) {
    const match = PRESETS.find((p) => {
      // Compare ignoring leading dash and value portion (-NetServerMaxTickRate=30)
      const stripped = (s) => s.replace(/^-+/, "").split("=")[0].toLowerCase();
      return stripped(p.flag) === stripped(tok);
    });
    if (match) enabled.add(match.key);
    else leftover.push(tok);
  }
  return { enabled, extra: leftover.join(" ") };
}

/** Serialize back to a single CLI string. */
function serializeLaunchArgs(enabledSet, extra) {
  const parts = [];
  for (const p of PRESETS) {
    if (enabledSet.has(p.key)) parts.push(p.flag);
  }
  if (extra && extra.trim()) parts.push(extra.trim());
  return parts.join(" ");
}

export const LaunchArgsPanel = ({ server, onSaved }) => {
  const { t, lang } = useI18n();
  const initial = useMemo(() => parseLaunchArgs(server.launch_args || ""), [server.id, server.launch_args]);
  const [enabled, setEnabled] = useState(initial.enabled);
  const [extra, setExtra] = useState(initial.extra);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    setEnabled(initial.enabled);
    setExtra(initial.extra);
    setDirty(false);
  }, [server.id, server.launch_args]);

  const toggle = (key) => {
    setEnabled((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
    setDirty(true);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const serialized = serializeLaunchArgs(enabled, extra);
      const updated = await endpoints.updateServerLaunchArgs(server.id, serialized);
      onSaved?.(updated);
      setDirty(false);
      toast.success(t("en_panel_launch_args_saved"));
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

  // Group presets by category
  const grouped = useMemo(() => {
    const map = {};
    for (const p of PRESETS) {
      (map[p.group] ||= []).push(p);
    }
    return map;
  }, []);

  // Live serialized preview
  const previewExtra = serializeLaunchArgs(enabled, extra);

  return (
    <div className="space-y-4" data-testid="launch-args-panel">
      <p className="font-mono text-[11px] text-dim leading-relaxed">
        {t("launch_options_intro") || "Sunucu başlatılırken SCUMServer.exe'ye geçilecek ek bayraklar. Manager'ın varsayılan bayraklarından (-port, -QueryPort, -MaxPlayers) sonra eklenir."}
      </p>

      {isRunning && (
        <div className="flex items-center gap-2 text-[11px] font-mono border border-warning/40 bg-warning/5 px-3 py-2" style={{ color: "var(--warning)" }}>
          <AlertTriangle size={13} />
          <span>{t("en_panel_launch_args_running_warn") || "Değişiklikler bir sonraki yeniden başlatmada uygulanır."}</span>
        </div>
      )}

      {/* Grouped preset checkboxes — Chrome-tab style sections */}
      {Object.entries(grouped).map(([groupKey, presets]) => {
        const grpLabel = GROUP_LABELS[groupKey];
        return (
          <div key={groupKey} className="border border-brand">
            <div className="bg-bg-deep px-3 py-2 border-b border-brand flex items-center gap-2">
              <span className="text-base">{grpLabel.icon}</span>
              <span className="label-accent">{grpLabel[lang] || grpLabel.en}</span>
              <span className="ml-auto font-mono text-[9px] text-dim">
                {presets.filter((p) => enabled.has(p.key)).length}/{presets.length}
              </span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-1 p-3">
              {presets.map((p) => {
                const on = enabled.has(p.key);
                return (
                  <label
                    key={p.key}
                    className={`flex items-start gap-2.5 p-2 cursor-pointer transition-colors text-[11px] ${
                      on ? "bg-accent-soft border-l-2 border-accent-brand" : "hover:bg-surface-2 border-l-2 border-transparent"
                    }`}
                    data-testid={`launch-preset-${p.key}`}
                  >
                    <input
                      type="checkbox"
                      checked={on}
                      onChange={() => toggle(p.key)}
                      className="mt-0.5 shrink-0 accent-current"
                      style={{ accentColor: "var(--accent)" }}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="font-display text-[11px] text-brand leading-tight flex items-center gap-2">
                        <span className="truncate">{p.label}</span>
                        {p.defaultOn && (
                          <span className="px-1 py-0.5 text-[8px] uppercase tracking-widest border border-dim text-dim opacity-70">
                            default
                          </span>
                        )}
                      </div>
                      <div className="font-mono text-[10px] text-dim leading-snug mt-0.5">{p.desc}</div>
                      <div className="font-mono text-[9px] text-muted mt-0.5 opacity-60">{p.flag}</div>
                    </div>
                  </label>
                );
              })}
            </div>
          </div>
        );
      })}

      {/* Custom user-supplied launch flags — ALWAYS visible at the bottom
          per admin request. Mod IDs, custom Unreal flags, anything not in the
          checkbox presets above goes here. Space-separated, no validation. */}
      <div className="border border-accent-brand/40 bg-accent-soft/10">
        <div className="px-3 py-2 bg-bg-deep border-b border-accent-brand/40 flex items-center gap-2">
          <Cpu size={13} className="text-accent-brand" />
          <span className="label-overline text-accent-brand">{t("launch_options_custom") || "Özel Başlatma Seçenekleri"}</span>
          {extra && extra.trim() && (
            <span className="ml-auto font-mono text-[9px] text-accent-brand">
              {extra.trim().split(/\s+/).length} flag
            </span>
          )}
        </div>
        <div className="p-3">
          <textarea
            value={extra}
            onChange={(e) => { setExtra(e.target.value); setDirty(true); }}
            rows={3}
            maxLength={1500}
            placeholder="-mod=workshopId -ServerAdminPassword=xxx -CustomFlag=value"
            className="w-full bg-bg border border-brand px-3 py-2 font-mono text-sm text-brand focus:outline-none focus:border-accent-brand resize-y"
            data-testid="input-launch-args-extra"
          />
          <p className="font-mono text-[10px] text-dim mt-1 leading-relaxed">
            {t("launch_options_extra_hint") || "Yukarıdaki checkbox'larda olmayan herhangi bir bayrak. Boşlukla ayrılır."}
            {" · "}
            <span className="text-muted">Örn: <code className="text-accent-brand">-NetworkVersionOverride=1</code></span>
          </p>
        </div>
      </div>

      {/* Live preview of the full command line */}
      <div className="border border-brand bg-bg-deep px-3 py-2">
        <div className="flex items-center gap-2 mb-1">
          <Info size={11} className="text-accent-brand" />
          <span className="label-overline">{t("en_panel_launch_args_preview") || "Önizleme"}</span>
        </div>
        <div className="font-mono text-[11px] leading-relaxed break-all">
          <span className="text-brand">SCUMServer.exe</span>{" "}
          <span className="text-dim">-port={gp} -QueryPort={qp} -MaxPlayers={mp}</span>
          {previewExtra && (
            <>
              {" "}
              <span className="text-accent-brand">{previewExtra}</span>
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
          <Save size={13} /> {saving ? t("en_panel_launch_args_saving") : t("en_panel_launch_args_save")}
        </button>
      </div>
    </div>
  );
};
