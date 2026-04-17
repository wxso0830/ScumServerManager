import React from "react";
import { ChevronDown } from "lucide-react";

export const Collapsible = ({ title, icon, open, onToggle, children, testId, badge }) => {
  return (
    <div className="panel mb-3 overflow-hidden" data-testid={testId}>
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-surface-2 transition-colors"
        data-testid={`${testId}-toggle`}
      >
        <div className="flex items-center gap-3">
          {icon}
          <span className="text-sm font-semibold tracking-wide text-brand uppercase">{title}</span>
          {badge && <span className="label-overline text-primary-brand">{badge}</span>}
        </div>
        <ChevronDown
          size={16}
          className="transition-transform duration-200"
          style={{ transform: open ? "rotate(180deg)" : "rotate(0)" }}
        />
      </button>
      {open && (
        <div className="px-4 py-5 border-t border-brand bg-bg">
          {children}
        </div>
      )}
    </div>
  );
};
