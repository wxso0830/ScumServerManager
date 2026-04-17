import React, { useState } from "react";
import { Eye, EyeOff, Info } from "lucide-react";
import { Toggle } from "./Toggle";
import { Slider } from "./Slider";

const InfoTip = ({ text }) => {
  const [open, setOpen] = useState(false);
  if (!text) return null;
  return (
    <span className="relative inline-flex">
      <button
        type="button"
        className="icon-btn"
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        aria-label="info"
      >
        <Info size={13} className="text-dim hover:text-primary-brand transition-colors" />
      </button>
      {open && (
        <span
          className="absolute left-1/2 -translate-x-1/2 bottom-full mb-2 z-30 w-64 px-3 py-2 text-xs leading-relaxed rounded-sm pointer-events-none"
          style={{ background: "var(--surface-2)", border: "1px solid var(--border-strong)", color: "var(--text)" }}
        >
          {text}
        </span>
      )}
    </span>
  );
};

export const Field = ({ field, value, onChange, testId }) => {
  const [show, setShow] = useState(false);
  const desc = field.desc || field.description;

  const LabelRow = (
    <div className="flex items-center gap-1 mb-2">
      <label className="text-sm text-brand">{field.label}</label>
      {desc && <InfoTip text={desc} />}
    </div>
  );

  if (field.type === "toggle") {
    return (
      <div className="flex items-center justify-between py-2">
        <div className="flex items-center gap-1">
          <label className="text-sm text-brand">{field.label}</label>
          {desc && <InfoTip text={desc} />}
        </div>
        <Toggle checked={!!value} onChange={onChange} testId={testId} />
      </div>
    );
  }

  if (field.type === "slider") {
    return (
      <div className="py-2">
        {LabelRow}
        <Slider value={typeof value === "number" ? value : parseFloat(value) || 0} min={field.min} max={field.max} step={field.step} onChange={onChange} testId={testId} />
      </div>
    );
  }

  if (field.type === "textarea") {
    return (
      <div className="py-2">
        {LabelRow}
        <textarea
          rows={field.rows || 3}
          value={value ?? ""}
          onChange={(e) => onChange(e.target.value)}
          data-testid={testId}
          className="input-field font-mono text-xs resize-y"
        />
      </div>
    );
  }

  if (field.type === "password") {
    return (
      <div className="py-2">
        {LabelRow}
        <div className="relative">
          <input
            type={show ? "text" : "password"}
            value={value ?? ""}
            onChange={(e) => onChange(e.target.value)}
            data-testid={testId}
            className="input-field font-mono pr-10"
          />
          <button type="button" onClick={() => setShow((s) => !s)} className="absolute right-2 top-1/2 -translate-y-1/2 icon-btn">
            {show ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        </div>
      </div>
    );
  }

  if (field.type === "number") {
    return (
      <div className="py-2">
        {LabelRow}
        <input
          type="number"
          min={field.min}
          max={field.max}
          step={field.step || 1}
          value={value ?? 0}
          onChange={(e) => onChange(e.target.value === "" ? "" : Number(e.target.value))}
          data-testid={testId}
          className="input-field font-mono"
        />
      </div>
    );
  }

  return (
    <div className="py-2">
      {LabelRow}
      <input
        type="text"
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
        placeholder={field.placeholder}
        data-testid={testId}
        className="input-field"
      />
    </div>
  );
};
