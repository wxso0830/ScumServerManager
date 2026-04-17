import React, { useMemo, useState } from "react";
import { Field } from "./Field";
import { humanizeKey, detectFieldType } from "../lib/settingsSchema";
import { useI18n } from "../providers/I18nProvider";

/**
 * Renders a flat dict of key->value as a grid of Field components.
 * Auto-detects type per value. Includes a search box at the top when there are many fields.
 */
export const DynamicFields = ({ values = {}, onFieldChange, testIdPrefix }) => {
  const { t } = useI18n();
  const [query, setQuery] = useState("");

  const entries = useMemo(() => Object.entries(values), [values]);
  const filtered = useMemo(() => {
    if (!query.trim()) return entries;
    const q = query.toLowerCase();
    return entries.filter(([k]) => k.toLowerCase().includes(q) || humanizeKey(k).toLowerCase().includes(q));
  }, [entries, query]);

  return (
    <div>
      {entries.length > 8 && (
        <div className="mb-4">
          <input
            className="input-field"
            placeholder={`${t("search")}...`}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            data-testid={`${testIdPrefix}-search`}
          />
          <div className="label-overline mt-1">{t("showing")} {filtered.length} {t("of")} {entries.length}</div>
        </div>
      )}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6">
        {filtered.map(([k, v]) => {
          const meta = detectFieldType(v, k);
          const field = { key: k, label: humanizeKey(k), ...meta };
          return (
            <Field
              key={k}
              field={field}
              value={v}
              onChange={(nv) => onFieldChange(k, nv)}
              testId={`${testIdPrefix}-${k}`}
            />
          );
        })}
      </div>
    </div>
  );
};
