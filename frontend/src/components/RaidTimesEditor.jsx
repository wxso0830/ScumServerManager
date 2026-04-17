import React from "react";
import { Trash2, Plus } from "lucide-react";
import { useI18n } from "../providers/I18nProvider";

export const RaidTimesEditor = ({ entries = [], onChange, testId = "raid-times" }) => {
  const { t } = useI18n();
  const add = () => onChange([...entries, { day: "Weekdays", time: "18:00-22:00", "start-announcement-time": "30", "end-announcement-time": "30" }]);
  const update = (idx, patch) => onChange(entries.map((e, i) => (i === idx ? { ...e, ...patch } : e)));
  const remove = (idx) => onChange(entries.filter((_, i) => i !== idx));

  return (
    <div className="space-y-3" data-testid={testId}>
      <div className="flex justify-end">
        <button className="tactical-btn flex items-center gap-2" onClick={add} data-testid={`${testId}-add`}>
          <Plus size={14} /> {t("add_raid_window")}
        </button>
      </div>
      {entries.length === 0 ? (
        <div className="panel p-6 text-center text-sm text-dim">{t("no_raid_times")}</div>
      ) : (
        <div className="panel overflow-hidden">
          <div className="grid grid-cols-[1.2fr_1fr_0.8fr_0.8fr_auto] text-xs font-mono uppercase tracking-wider text-dim border-b border-brand bg-surface-2">
            <div className="px-3 py-2">{t("day")}</div>
            <div className="px-3 py-2">{t("time_range")}</div>
            <div className="px-3 py-2">{t("start_announcement")}</div>
            <div className="px-3 py-2">{t("end_announcement")}</div>
            <div className="px-3 py-2 w-10" />
          </div>
          {entries.map((e, idx) => (
            <div key={idx} className="grid grid-cols-[1.2fr_1fr_0.8fr_0.8fr_auto] border-b border-brand hover:bg-surface-2/50">
              <input className="bg-transparent px-3 py-2 font-mono text-sm border-r border-brand outline-none focus:bg-primary-soft" value={e.day || ""} onChange={(ev) => update(idx, { day: ev.target.value })} placeholder="Monday,Wednesday,Friday" data-testid={`${testId}-row-${idx}-day`} />
              <input className="bg-transparent px-3 py-2 font-mono text-sm border-r border-brand outline-none focus:bg-primary-soft" value={e.time || ""} onChange={(ev) => update(idx, { time: ev.target.value })} placeholder="18:00-22:00" data-testid={`${testId}-row-${idx}-time`} />
              <input className="bg-transparent px-3 py-2 font-mono text-sm border-r border-brand outline-none focus:bg-primary-soft" value={e["start-announcement-time"] || ""} onChange={(ev) => update(idx, { "start-announcement-time": ev.target.value })} />
              <input className="bg-transparent px-3 py-2 font-mono text-sm border-r border-brand outline-none focus:bg-primary-soft" value={e["end-announcement-time"] || ""} onChange={(ev) => update(idx, { "end-announcement-time": ev.target.value })} />
              <button className="px-3 text-danger hover:bg-surface-2" onClick={() => remove(idx)} data-testid={`${testId}-row-${idx}-remove`}>
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
