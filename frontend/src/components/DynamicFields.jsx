import React, { useMemo, useState } from "react";
import { Field } from "./Field";
import { humanizeKey, detectFieldType } from "../lib/settingsSchema";
import { getFieldMeta } from "../lib/fieldMeta";
import { useI18n } from "../providers/I18nProvider";

/**
 * Renders a dict of key->value as a grid of Field components.
 * Uses FIELD_META for translated labels + descriptions, falls back to humanizeKey.
 * Accepts a `fieldKeys` filter to render only specific keys.
 */
export const DynamicFields = ({ values = {}, fieldKeys, onFieldChange, testIdPrefix }) => {
  const { t, lang } = useI18n();
  const [query, setQuery] = useState("");

  const entries = useMemo(() => {
    const all = Object.entries(values);
    if (fieldKeys && fieldKeys.length > 0) {
      const order = new Map(fieldKeys.map((k, i) => [k, i]));
      return all
        .filter(([k]) => order.has(k))
        .sort((a, b) => order.get(a[0]) - order.get(b[0]));
    }
    return all;
  }, [values, fieldKeys]);

  const filtered = useMemo(() => {
    if (!query.trim()) return entries;
    const q = query.toLowerCase();
    return entries.filter(([k]) => {
      const meta = getFieldMeta(k, lang);
      const label = meta?.label || humanizeKey(k);
      return k.toLowerCase().includes(q) || label.toLowerCase().includes(q);
    });
  }, [entries, query, lang]);

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
          const meta = getFieldMeta(k, lang);
          const typeMeta = detectFieldType(v, k);
          const field = {
            key: k,
            label: meta?.label || humanizeKey(k),
            desc: meta?.desc,
            ...typeMeta,
          };
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
