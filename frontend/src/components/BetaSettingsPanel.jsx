import React, { useMemo, useState } from "react";
import { FlaskConical, AlertTriangle, Plus, Trash2 } from "lucide-react";
import { useI18n } from "../providers/I18nProvider";

/**
 * BetaSettingsPanel — exposes community-known / undocumented SCUM settings.
 *
 * These keys are NOT in the official `ServerSettings.ini` documentation but
 * have been reported by the SCUM admin community to work (or to have worked in
 * earlier game versions). LGSS will validate each one on real servers; any
 * that turn out to be no-ops will be pruned in a future release.
 *
 * The list is intentionally small and curated. Admins who know of additional
 * unofficial keys can add them as ad-hoc rows at the bottom of the panel —
 * those custom rows are written to ServerSettings.ini under [ScumBeta] just
 * like the curated entries.
 */

// Curated catalog. `type` controls the input widget:
//   "bool"   → toggle (writes True/False)
//   "float"  → numeric input with step (multiplier semantics)
//   "int"    → integer input
//   "string" → free text
// `defaultValue` becomes the staged value when the admin first enables the row.
const CATALOG = [
  {
    key: "scum.VehiclePartsDamageMultiplier",
    labelKey: "beta_vehicle_parts_damage",
    descriptionKey: "beta_vehicle_parts_damage_desc",
    type: "float",
    defaultValue: 1.0,
    min: 0.0,
    max: 10.0,
    step: 0.05,
  },
  {
    key: "scum.VehicleEngineDamageMultiplier",
    labelKey: "beta_vehicle_engine_damage",
    descriptionKey: "beta_vehicle_engine_damage_desc",
    type: "float",
    defaultValue: 1.0,
    min: 0.0,
    max: 10.0,
    step: 0.05,
  },
  {
    key: "scum.VehicleCollisionDamageMultiplier",
    labelKey: "beta_vehicle_collision_damage",
    descriptionKey: "beta_vehicle_collision_damage_desc",
    type: "float",
    defaultValue: 1.0,
    min: 0.0,
    max: 10.0,
    step: 0.05,
  },
  {
    key: "scum.LootRespawnTimeMultiplier",
    labelKey: "beta_loot_respawn_time",
    descriptionKey: "beta_loot_respawn_time_desc",
    type: "float",
    defaultValue: 1.0,
    min: 0.1,
    max: 10.0,
    step: 0.1,
  },
  {
    key: "scum.AnimalRespawnTimeMultiplier",
    labelKey: "beta_animal_respawn_time",
    descriptionKey: "beta_animal_respawn_time_desc",
    type: "float",
    defaultValue: 1.0,
    min: 0.1,
    max: 10.0,
    step: 0.1,
  },
  {
    key: "scum.ItemDurabilityMultiplier",
    labelKey: "beta_item_durability",
    descriptionKey: "beta_item_durability_desc",
    type: "float",
    defaultValue: 1.0,
    min: 0.1,
    max: 10.0,
    step: 0.05,
  },
  {
    key: "scum.GodModeForAdmins",
    labelKey: "beta_god_mode_admins",
    descriptionKey: "beta_god_mode_admins_desc",
    type: "bool",
    defaultValue: false,
  },
  {
    key: "scum.AllowFlyingForAdmins",
    labelKey: "beta_allow_flying_admins",
    descriptionKey: "beta_allow_flying_admins_desc",
    type: "bool",
    defaultValue: false,
  },
];

export const BetaSettingsPanel = ({ value = {}, onChange }) => {
  const { t } = useI18n();
  const [customRows, setCustomRows] = useState(() => {
    // Surface any user-added keys that aren't in the curated catalog as
    // editable custom rows on first render.
    const known = new Set(CATALOG.map((c) => c.key));
    return Object.keys(value || {})
      .filter((k) => !known.has(k))
      .map((k) => ({ key: k, ...value[k] }));
  });

  const data = useMemo(() => value || {}, [value]);

  const setRow = (key, patch) => {
    const current = data[key] || { enabled: false, value: null };
    const next = { ...data, [key]: { ...current, ...patch } };
    onChange?.(next);
  };

  const addCustomRow = () => {
    setCustomRows((rows) => [...rows, { key: "", enabled: true, value: "" }]);
  };

  const updateCustomRow = (idx, patch) => {
    setCustomRows((rows) => {
      const next = rows.map((r, i) => (i === idx ? { ...r, ...patch } : r));
      // Mirror into the parent dict — but only if the key is non-empty.
      const merged = { ...data };
      // Clear any rows we previously synced under the old key for this idx.
      // Simple strategy: rebuild the custom slice from `next`.
      const knownKeys = new Set(CATALOG.map((c) => c.key));
      const cleaned = Object.fromEntries(
        Object.entries(merged).filter(([k]) => knownKeys.has(k))
      );
      for (const r of next) {
        if (r.key && r.key.trim()) {
          cleaned[r.key.trim()] = { enabled: !!r.enabled, value: r.value };
        }
      }
      onChange?.(cleaned);
      return next;
    });
  };

  const removeCustomRow = (idx) => {
    setCustomRows((rows) => {
      const next = rows.filter((_, i) => i !== idx);
      const knownKeys = new Set(CATALOG.map((c) => c.key));
      const cleaned = Object.fromEntries(
        Object.entries(data).filter(([k]) => knownKeys.has(k))
      );
      for (const r of next) {
        if (r.key && r.key.trim()) {
          cleaned[r.key.trim()] = { enabled: !!r.enabled, value: r.value };
        }
      }
      onChange?.(cleaned);
      return next;
    });
  };

  return (
    <div className="space-y-4" data-testid="beta-settings-panel">
      {/* Big red warning banner — admins must understand these are unverified */}
      <div
        className="border-2 p-4 flex items-start gap-3"
        style={{ borderColor: "var(--danger)", background: "rgba(255, 67, 67, 0.07)" }}
        data-testid="beta-warning-banner"
      >
        <AlertTriangle size={22} className="shrink-0 mt-0.5" style={{ color: "var(--danger)" }} />
        <div className="flex-1">
          <div className="heading-stencil text-sm mb-1.5" style={{ color: "var(--danger)" }}>
            {t("beta_warning_title")}
          </div>
          <p className="text-xs text-brand leading-relaxed">{t("beta_warning_body")}</p>
        </div>
      </div>

      {/* Curated catalog */}
      <div className="panel corner-brackets">
        <div className="px-4 py-3 border-b border-brand flex items-center gap-2">
          <FlaskConical size={14} className="text-accent-brand" />
          <span className="heading-stencil text-sm">{t("beta_curated_title")}</span>
          <span className="ml-auto text-[10px] text-dim uppercase tracking-widest">
            {CATALOG.length} {t("beta_settings_count")}
          </span>
        </div>
        <div className="divide-y divide-[var(--border)]">
          {CATALOG.map((c) => {
            const row = data[c.key] || { enabled: false, value: c.defaultValue };
            return (
              <div key={c.key} className="grid grid-cols-1 md:grid-cols-[1fr_180px] gap-3 px-4 py-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <label className="flex items-center gap-2 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={!!row.enabled}
                        onChange={(e) =>
                          setRow(c.key, {
                            enabled: e.target.checked,
                            value: row.value ?? c.defaultValue,
                          })
                        }
                        className="checkbox-accent"
                        data-testid={`beta-toggle-${c.key}`}
                      />
                      <span className="label-accent">{t(c.labelKey)}</span>
                    </label>
                  </div>
                  <p className="text-[11px] text-dim mt-1 leading-relaxed">{t(c.descriptionKey)}</p>
                  <code className="text-[10px] text-muted font-mono">{c.key}</code>
                </div>
                <div className="flex items-center justify-end">
                  {c.type === "bool" ? (
                    <select
                      className="input-field text-xs"
                      value={String(row.value ?? c.defaultValue)}
                      onChange={(e) =>
                        setRow(c.key, { enabled: row.enabled, value: e.target.value === "true" })
                      }
                      disabled={!row.enabled}
                      data-testid={`beta-input-${c.key}`}
                    >
                      <option value="true">True</option>
                      <option value="false">False</option>
                    </select>
                  ) : (
                    <input
                      type="number"
                      className="input-field text-xs font-mono"
                      value={row.value ?? c.defaultValue}
                      min={c.min}
                      max={c.max}
                      step={c.step ?? 1}
                      onChange={(e) =>
                        setRow(c.key, {
                          enabled: row.enabled,
                          value: c.type === "int" ? parseInt(e.target.value, 10) : parseFloat(e.target.value),
                        })
                      }
                      disabled={!row.enabled}
                      data-testid={`beta-input-${c.key}`}
                    />
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Ad-hoc custom rows for keys not in the catalog */}
      <div className="panel">
        <div className="px-4 py-3 border-b border-brand flex items-center gap-2">
          <Plus size={14} className="text-accent-brand" />
          <span className="heading-stencil text-sm">{t("beta_custom_rows_title")}</span>
          <button
            type="button"
            className="ml-auto ghost-btn flex items-center gap-1 text-xs"
            onClick={addCustomRow}
            data-testid="beta-add-custom-row"
          >
            <Plus size={12} /> {t("beta_add_row")}
          </button>
        </div>
        {customRows.length === 0 ? (
          <div className="p-4 text-center text-xs text-dim">{t("beta_no_custom_rows")}</div>
        ) : (
          <div className="divide-y divide-[var(--border)]">
            {customRows.map((row, idx) => (
              <div key={idx} className="grid grid-cols-[auto_1fr_140px_auto] gap-2 items-center px-4 py-2.5">
                <input
                  type="checkbox"
                  checked={!!row.enabled}
                  onChange={(e) => updateCustomRow(idx, { enabled: e.target.checked })}
                  className="checkbox-accent"
                />
                <input
                  type="text"
                  className="input-field text-xs font-mono"
                  placeholder="scum.YourCustomSetting"
                  value={row.key}
                  onChange={(e) => updateCustomRow(idx, { key: e.target.value })}
                  data-testid={`beta-custom-key-${idx}`}
                />
                <input
                  type="text"
                  className="input-field text-xs font-mono"
                  placeholder="value"
                  value={row.value ?? ""}
                  onChange={(e) => updateCustomRow(idx, { value: e.target.value })}
                  data-testid={`beta-custom-value-${idx}`}
                />
                <button
                  type="button"
                  className="icon-btn text-danger"
                  onClick={() => removeCustomRow(idx)}
                  title={t("remove")}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
