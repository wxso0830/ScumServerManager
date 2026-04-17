import React from "react";

export const Slider = ({ value, min = 0, max = 10, step = 0.1, onChange, testId }) => {
  return (
    <div className="flex items-center gap-3">
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value ?? 0}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        data-testid={testId}
        className="flex-1 lgss-slider"
      />
      <span className="font-mono text-sm text-brand w-16 text-right tabular-nums">
        {typeof value === "number" ? value.toFixed(2) : "0.00"}
      </span>
      <style>{`
        .lgss-slider { appearance: none; height: 4px; background: var(--border-strong); border-radius: 2px; outline: none; }
        .lgss-slider::-webkit-slider-thumb { appearance: none; width: 14px; height: 14px; background: var(--primary); border-radius: 2px; cursor: pointer; border: none; }
        .lgss-slider::-moz-range-thumb { width: 14px; height: 14px; background: var(--primary); border-radius: 2px; cursor: pointer; border: none; }
      `}</style>
    </div>
  );
};
