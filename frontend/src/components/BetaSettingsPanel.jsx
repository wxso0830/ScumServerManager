import React, { useMemo } from "react";
import { AlertTriangle } from "lucide-react";
import { Field } from "./Field";
import { useI18n } from "../providers/I18nProvider";

/**
 * BetaSettingsPanel — exposes community-known / undocumented SCUM keys.
 *
 * Visually IDENTICAL to the default settings panels (DynamicFields style),
 * with one extra UI element: a compact red warning strip at the top that
 * names the panel "BETA · UNOFFICIAL". No per-row checkbox toggles — the
 * "enabled" state is inferred from the value:
 *
 *   value === default  →  not written to ServerSettings.ini
 *   value !== default  →  written under the [ScumBeta] section
 *
 * This matches how the official panels behave (admins just set values; the
 * INI file always contains whatever they configured) while still avoiding
 * polluting the file with no-op default rows for unverified keys.
 */

const CATALOG = [
  { key: "scum.VehiclePartsDamageMultiplier",      labelKey: "beta_vehicle_parts_damage",      descKey: "beta_vehicle_parts_damage_desc",      type: "float", defaultValue: 1.0, min: 0.0,  max: 10.0, step: 0.05 },
  { key: "scum.VehicleEngineDamageMultiplier",     labelKey: "beta_vehicle_engine_damage",     descKey: "beta_vehicle_engine_damage_desc",     type: "float", defaultValue: 1.0, min: 0.0,  max: 10.0, step: 0.05 },
  { key: "scum.VehicleCollisionDamageMultiplier",  labelKey: "beta_vehicle_collision_damage",  descKey: "beta_vehicle_collision_damage_desc",  type: "float", defaultValue: 1.0, min: 0.0,  max: 10.0, step: 0.05 },
  { key: "scum.LootRespawnTimeMultiplier",         labelKey: "beta_loot_respawn_time",         descKey: "beta_loot_respawn_time_desc",         type: "float", defaultValue: 1.0, min: 0.1,  max: 10.0, step: 0.1  },
  { key: "scum.AnimalRespawnTimeMultiplier",       labelKey: "beta_animal_respawn_time",       descKey: "beta_animal_respawn_time_desc",       type: "float", defaultValue: 1.0, min: 0.1,  max: 10.0, step: 0.1  },
  { key: "scum.ItemDurabilityMultiplier",          labelKey: "beta_item_durability",           descKey: "beta_item_durability_desc",           type: "float", defaultValue: 1.0, min: 0.1,  max: 10.0, step: 0.05 },
  { key: "scum.GodModeForAdmins",                  labelKey: "beta_god_mode_admins",           descKey: "beta_god_mode_admins_desc",           type: "toggle", defaultValue: false },
  { key: "scum.AllowFlyingForAdmins",              labelKey: "beta_allow_flying_admins",       descKey: "beta_allow_flying_admins_desc",       type: "toggle", defaultValue: false },
];

export const BetaSettingsPanel = ({ value = {}, onChange }) => {
  const { t } = useI18n();

  // The on-disk shape we persist is { key: { enabled: bool, value: any } }
  // so the backend can decide what to write. Toward the UI we present plain
  // values; the parent's `value` dict is the source of truth.
  const getValue = (entry) => {
    const stored = (value || {})[entry.key];
    if (stored && typeof stored === "object" && "value" in stored) {
      return stored.value ?? entry.defaultValue;
    }
    return entry.defaultValue;
  };

  const setValue = (entry, nv) => {
    const next = { ...(value || {}) };
    const isDefault = nv === entry.defaultValue;
    if (isDefault) {
      // User reverted to default → drop the entry entirely so it's not
      // written to the INI file. Keeps [ScumBeta] tidy.
      delete next[entry.key];
    } else {
      next[entry.key] = { enabled: true, value: nv };
    }
    onChange?.(next);
  };

  const touchedCount = useMemo(() => {
    return CATALOG.filter((c) => getValue(c) !== c.defaultValue).length;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return (
    <div data-testid="beta-settings-panel">
      {/* Compact warning strip — matches the visual weight of the panel
          header in other settings tabs (single line + tooltip-style note). */}
      <div
        className="flex items-start gap-2 mb-4 px-3 py-2 border"
        style={{ borderColor: "var(--danger)", background: "rgba(255, 67, 67, 0.06)" }}
        data-testid="beta-warning-banner"
      >
        <AlertTriangle size={14} className="shrink-0 mt-0.5" style={{ color: "var(--danger)" }} />
        <div className="flex-1 text-xs">
          <span className="font-mono uppercase tracking-widest mr-2" style={{ color: "var(--danger)" }}>
            {t("beta_warning_title")}
          </span>
          <span className="text-dim">{t("beta_warning_body")}</span>
        </div>
        {touchedCount > 0 && (
          <span className="shrink-0 px-2 py-0.5 border text-[10px] font-mono uppercase tracking-widest"
                style={{ borderColor: "var(--danger)", color: "var(--danger)" }}>
            {touchedCount} {t("beta_modified")}
          </span>
        )}
      </div>

      {/* Same grid as DynamicFields — 2 columns md, 3 columns xl */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-x-6 gap-y-1">
        {CATALOG.map((entry) => {
          const v = getValue(entry);
          const field = {
            key: entry.key,
            label: t(entry.labelKey),
            desc: t(entry.descKey),
            type: entry.type,
            min: entry.min,
            max: entry.max,
            step: entry.step,
          };
          return (
            <Field
              key={entry.key}
              field={field}
              value={v}
              onChange={(nv) => setValue(entry, nv)}
              testId={`field-beta-${entry.key}`}
            />
          );
        })}
      </div>
    </div>
  );
};
