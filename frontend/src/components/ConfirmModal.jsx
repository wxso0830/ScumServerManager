import React from "react";
import { AlertTriangle, X } from "lucide-react";
import { useI18n } from "../providers/I18nProvider";

/**
 * Custom tactical confirm modal. Replaces window.confirm (which is blocked
 * inside the iframe preview).
 */
export const ConfirmModal = ({
  open,
  title,
  body,
  confirmLabel,
  cancelLabel,
  onConfirm,
  onCancel,
  destructive = true,
  testId = "confirm-modal",
}) => {
  const { t } = useI18n();
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-[80] bg-bg-deep/90 backdrop-blur-md flex items-center justify-center p-4"
      onClick={onCancel}
      data-testid={testId}
    >
      <div
        className="relative w-full max-w-md panel corner-brackets-full"
        onClick={(e) => e.stopPropagation()}
        style={{ background: "var(--surface)" }}
      >
        <span className="cbr-tr" />
        <span className="cbr-bl" />

        <div className="flex items-center justify-between px-4 py-3 border-b border-brand bg-bg-deep">
          <div className="flex items-center gap-2">
            <AlertTriangle size={14} className={destructive ? "text-danger" : "text-accent-brand"} />
            <span className="heading-stencil text-sm">{title}</span>
          </div>
          <button onClick={onCancel} className="icon-btn" data-testid={`${testId}-close`}>
            <X size={14} />
          </button>
        </div>

        <div className="px-5 py-6">
          <p className="text-sm text-brand leading-relaxed">{body}</p>
        </div>

        <div className="px-4 py-3 border-t border-brand bg-bg-deep flex justify-end gap-2">
          <button
            className="btn-ghost"
            onClick={onCancel}
            data-testid={`${testId}-cancel`}
          >
            {cancelLabel || t("cancel")}
          </button>
          <button
            className={destructive ? "btn-danger" : "btn-primary"}
            onClick={onConfirm}
            data-testid={`${testId}-confirm`}
          >
            {confirmLabel || t("confirm")}
          </button>
        </div>
      </div>
    </div>
  );
};
