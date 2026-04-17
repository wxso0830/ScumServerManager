import React, { useState } from "react";
import { Trash2, Plus } from "lucide-react";
import { useI18n } from "../providers/I18nProvider";

const MappingList = ({ entries = [], onChange, label, testId }) => {
  const [text, setText] = useState("");
  const add = () => {
    if (!text.trim()) return;
    onChange([...entries, text.trim()]);
    setText("");
  };
  const remove = (idx) => onChange(entries.filter((_, i) => i !== idx));
  return (
    <div className="panel p-3 space-y-2" data-testid={testId}>
      <div className="flex items-center justify-between">
        <label className="label-overline">{label} · {entries.length}</label>
      </div>
      <div className="flex gap-2">
        <input className="input-field font-mono text-xs" value={text} onChange={(e) => setText(e.target.value)} placeholder='(AxisName="...",Scale=1.0,Key=W)' />
        <button className="tactical-btn flex items-center gap-2 shrink-0" onClick={add}><Plus size={14} /></button>
      </div>
      <div className="max-h-[360px] overflow-y-auto scrollbar-thin border border-brand">
        {entries.map((m, idx) => (
          <div key={idx} className="flex items-center gap-2 px-2 py-1 border-b border-brand hover:bg-surface-2/50">
            <code className="flex-1 text-xs font-mono text-brand truncate">{m}</code>
            <button className="icon-btn text-danger" onClick={() => remove(idx)}><Trash2 size={12} /></button>
          </div>
        ))}
      </div>
    </div>
  );
};

export const InputEditor = ({ axis = [], action = [], onChange, testId = "input-editor" }) => {
  const { t } = useI18n();
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4" data-testid={testId}>
      <MappingList entries={axis} onChange={(v) => onChange({ axis: v, action })} label={t("input_axis")} testId={`${testId}-axis`} />
      <MappingList entries={action} onChange={(v) => onChange({ axis, action: v })} label={t("input_action")} testId={`${testId}-action`} />
    </div>
  );
};
