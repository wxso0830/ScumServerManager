import React from "react";
import { Plus, Crosshair } from "lucide-react";
import { useI18n } from "../providers/I18nProvider";

export const EmptyWorkspace = ({ onAdd }) => {
  const { t } = useI18n();
  return (
    <div className="flex-1 flex items-center justify-center relative overflow-hidden theme-bg" data-testid="empty-workspace">
      <div className="absolute inset-0 bg-bg/80" />
      <div className="relative z-10 text-center px-6 max-w-xl">
        <div className="mx-auto h-14 w-14 flex items-center justify-center rounded-sm border border-primary-brand bg-primary-soft mb-5">
          <Crosshair size={24} className="text-primary-brand" />
        </div>
        <h1 className="text-3xl font-bold text-brand tracking-tight">{t("empty_workspace_title")}</h1>
        <p className="mt-3 text-sm text-dim leading-relaxed">{t("empty_workspace_body")}</p>
        <button onClick={onAdd} data-testid="empty-add-server-button" className="tactical-btn mt-6 inline-flex items-center gap-2">
          <Plus size={16} /> {t("add_server")}
        </button>
      </div>
    </div>
  );
};
