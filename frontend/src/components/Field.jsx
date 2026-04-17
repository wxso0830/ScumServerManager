import React, { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { Toggle } from "./Toggle";
import { Slider } from "./Slider";

export const Field = ({ field, value, onChange, testId }) => {
  const [show, setShow] = useState(false);

  if (field.type === "toggle") {
    return (
      <div className="flex items-center justify-between py-2">
        <label className="text-sm text-brand">{field.label}</label>
        <Toggle checked={!!value} onChange={onChange} testId={testId} />
      </div>
    );
  }

  if (field.type === "slider") {
    return (
      <div className="py-2">
        <label className="text-sm text-brand block mb-2">{field.label}</label>
        <Slider value={typeof value === "number" ? value : parseFloat(value) || 0} min={field.min} max={field.max} step={field.step} onChange={onChange} testId={testId} />
      </div>
    );
  }

  if (field.type === "textarea") {
    return (
      <div className="py-2">
        <label className="text-sm text-brand block mb-2">{field.label}</label>
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
        <label className="text-sm text-brand block mb-2">{field.label}</label>
        <div className="relative">
          <input
            type={show ? "text" : "password"}
            value={value ?? ""}
            onChange={(e) => onChange(e.target.value)}
            data-testid={testId}
            className="input-field font-mono pr-10"
          />
          <button
            type="button"
            onClick={() => setShow((s) => !s)}
            className="absolute right-2 top-1/2 -translate-y-1/2 icon-btn"
            data-testid={`${testId}-toggle-visibility`}
          >
            {show ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        </div>
      </div>
    );
  }

  if (field.type === "number") {
    return (
      <div className="py-2">
        <label className="text-sm text-brand block mb-2">{field.label}</label>
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
      <label className="text-sm text-brand block mb-2">{field.label}</label>
      <input
        type="text"
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
        data-testid={testId}
        className="input-field"
      />
    </div>
  );
};
