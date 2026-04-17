import React from "react";

export const Toggle = ({ checked, onChange, disabled, testId }) => {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      data-testid={testId}
      className="relative inline-flex h-6 w-11 items-center border rounded-sm transition-colors"
      style={{
        background: checked ? "var(--primary)" : "var(--surface-2)",
        borderColor: checked ? "var(--primary)" : "var(--border)",
        opacity: disabled ? 0.4 : 1,
        cursor: disabled ? "not-allowed" : "pointer",
      }}
    >
      <span
        className="inline-block h-4 w-4 transform rounded-sm transition-transform"
        style={{
          background: checked ? "#0a0a0a" : "var(--text-dim)",
          transform: checked ? "translateX(22px)" : "translateX(4px)",
        }}
      />
    </button>
  );
};
