import React from "react";
import { ChevronDown } from "lucide-react";

export const Collapsible = ({ title, icon, open, onToggle, children, testId, badge }) => {
  return (
    <div className="panel mb-3 overflow-hidden corner-brackets" data-testid={testId}>
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-surface-2 transition-colors"
        data-testid={`${testId}-toggle`}
      >
        <div className="flex items-center gap-3">
          {icon}
          <span className="heading-stencil text-sm">{title}</span>
          {badge && <span className="label-accent">{badge}</span>}
        </div>
        <ChevronDown
          size={16}
          className="transition-transform duration-200 text-dim"
          style={{ transform: open ? "rotate(180deg)" : "rotate(0)" }}
        />
      </button>
      {open && (
        <div className="px-4 py-5 border-t border-brand bg-bg-deep">
          {children}
        </div>
      )}
    </div>
  );
};
