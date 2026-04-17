import React from "react";
import { Trash2, Plus } from "lucide-react";
import { useI18n } from "../providers/I18nProvider";

export const NotificationsEditor = ({ entries = [], onChange, testId = "notifications" }) => {
  const { t } = useI18n();
  const add = () => onChange([...entries, { message: "Welcome to the server!", "interval-minutes": 30 }]);
  const update = (idx, patch) => onChange(entries.map((e, i) => (i === idx ? { ...e, ...patch } : e)));
  const remove = (idx) => onChange(entries.filter((_, i) => i !== idx));
  return (
    <div className="space-y-3" data-testid={testId}>
      <div className="flex justify-end">
        <button className="tactical-btn flex items-center gap-2" onClick={add} data-testid={`${testId}-add`}>
          <Plus size={14} /> {t("add_notification")}
        </button>
      </div>
      {entries.length === 0 ? (
        <div className="panel p-6 text-center text-sm text-dim">{t("no_notifications")}</div>
      ) : (
        <div className="space-y-2">
          {entries.map((e, idx) => (
            <div key={idx} className="panel p-3 space-y-2">
              <div className="flex items-start gap-3">
                <div className="flex-1">
                  <label className="label-overline block mb-1">{t("notification_message")}</label>
                  <textarea rows={2} className="input-field font-mono text-xs" value={e.message || ""} onChange={(ev) => update(idx, { message: ev.target.value })} data-testid={`${testId}-row-${idx}-message`} />
                </div>
                <div className="w-40">
                  <label className="label-overline block mb-1">{t("notification_interval")}</label>
                  <input type="number" className="input-field font-mono" value={e["interval-minutes"] || 0} onChange={(ev) => update(idx, { "interval-minutes": Number(ev.target.value) })} />
                </div>
                <button className="icon-btn mt-6 text-danger" onClick={() => remove(idx)} data-testid={`${testId}-row-${idx}-remove`}>
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
