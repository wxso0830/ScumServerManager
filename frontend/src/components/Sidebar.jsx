import React from "react";
import { Plus, Server, Circle } from "lucide-react";
import { useI18n } from "../providers/I18nProvider";

const statusColor = { Running: "text-success", Stopped: "text-dim", Updating: "text-warning" };

export const Sidebar = ({ servers, activeId, onSelect, onAdd, managerPath }) => {
  const { t } = useI18n();
  return (
    <aside className="w-64 shrink-0 bg-surface border-r border-brand flex flex-col" data-testid="sidebar">
      <div className="p-3 border-b border-brand">
        <button
          onClick={onAdd}
          data-testid="add-server-profile-button"
          className="w-full flex items-center justify-center gap-2 h-12 border-2 border-dashed border-brand hover:border-primary-brand hover:bg-primary-soft transition-colors rounded-sm group"
          title={t("add_server")}
        >
          <Plus size={20} className="text-primary-brand group-hover:scale-110 transition-transform" />
          <span className="text-sm font-semibold uppercase tracking-wider text-brand">{t("add_server")}</span>
        </button>
      </div>

      <div className="flex-1 overflow-y-auto scrollbar-thin p-2">
        {servers.length === 0 && (
          <div className="text-center py-8 px-3">
            <Server size={20} className="mx-auto text-dim mb-2" />
            <p className="text-xs text-dim leading-relaxed">{t("empty_workspace_body")}</p>
          </div>
        )}
        {servers.map((s) => {
          const active = s.id === activeId;
          return (
            <button
              key={s.id}
              onClick={() => onSelect(s.id)}
              data-testid={`server-tab-${s.folder_name}`}
              className="w-full text-left px-3 py-2.5 mb-1 transition-colors flex items-center gap-2 rounded-sm border-l-2"
              style={{
                borderLeftColor: active ? "var(--primary)" : "transparent",
                background: active ? "var(--primary-soft)" : "transparent",
                color: active ? "var(--text)" : "var(--text-dim)",
              }}
            >
              <Circle size={8} className={statusColor[s.status] || "text-dim"} fill="currentColor" />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate">{s.name}</div>
                <div className="font-mono text-[10px] text-dim uppercase">{s.folder_name} · {s.status}</div>
              </div>
            </button>
          );
        })}
      </div>

      {managerPath && (
        <div className="px-3 py-2 border-t border-brand bg-bg">
          <div className="label-overline mb-0.5">{t("installation_path")}</div>
          <div className="font-mono text-[11px] text-dim truncate" title={managerPath}>{managerPath}</div>
        </div>
      )}
    </aside>
  );
};
