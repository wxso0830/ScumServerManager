import React, { useEffect, useState } from "react";
import { HardDrive, Check, AlertCircle, Loader2, ArrowRight } from "lucide-react";
import { useI18n } from "../providers/I18nProvider";
import { endpoints } from "../lib/api";

const DiskBar = ({ disk, required }) => {
  const usedPct = disk.percent_used;
  const reqPct = Math.min((required / disk.total_gb) * 100, 100 - usedPct);
  return (
    <div className="w-full">
      <div className="flex h-3 w-full overflow-hidden rounded-sm border border-brand bg-surface-2">
        <div style={{ width: `${usedPct}%`, background: "var(--border-strong)" }} title={`Used ${disk.used_gb} GB`} />
        <div style={{ width: `${reqPct}%`, background: "var(--primary)", opacity: disk.eligible ? 0.85 : 0.3 }} title={`SCUM Allocation ${required} GB`} />
      </div>
      <div className="flex justify-between mt-1.5 font-mono text-[11px] text-dim">
        <span>{disk.used_gb} / {disk.total_gb} GB</span>
        <span>{disk.free_gb} GB {useI18n().t("free")}</span>
      </div>
    </div>
  );
};

export const DiskSelectionWizard = ({ onComplete }) => {
  const { t } = useI18n();
  const [disks, setDisks] = useState([]);
  const [required, setRequired] = useState(30);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const [d, r] = await Promise.all([endpoints.listDisks(), endpoints.getRequirements()]);
        setDisks(d);
        setRequired(r.required_gb_per_server);
        const first = d.find((x) => x.eligible) || d[0];
        if (first) setSelected(first.mountpoint);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const handleConfirm = async () => {
    if (!selected) return;
    setSaving(true);
    try {
      const disk = disks.find((x) => x.mountpoint === selected);
      const sep = disk.device.includes("\\") || /^[A-Z]:/.test(disk.device) ? "\\" : "/";
      const base = disk.mountpoint.endsWith(sep) ? disk.mountpoint.slice(0, -1) : disk.mountpoint;
      const managerPath = `${base}${sep}LGSSManagers`;
      await endpoints.updateSetup({
        selected_disk: disk.mountpoint,
        manager_path: managerPath,
        completed: true,
      });
      onComplete({ managerPath });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-40 theme-bg flex items-center justify-center p-6" data-testid="disk-wizard">
      <div className="absolute inset-0 bg-bg/85" />
      <div className="relative w-full max-w-3xl panel bg-glass shadow-2xl">
        <div className="px-6 py-4 border-b border-brand flex items-center justify-between">
          <div>
            <div className="label-overline">{t("setup_title")} · STEP 1 / 1</div>
            <h1 className="text-xl font-semibold text-brand mt-1">{t("setup_step_disk")}</h1>
          </div>
          <div className="text-right">
            <div className="label-overline">{t("required_space")}</div>
            <div className="font-mono text-lg text-primary-brand">~{required} GB</div>
          </div>
        </div>

        <div className="px-6 py-4 border-b border-brand text-sm text-dim">
          {t("setup_disk_subtitle")} <span className="font-mono text-xs ml-2 text-dim">{t("disk_picker_info", { gb: required })}</span>
        </div>

        <div className="px-6 py-5 max-h-[50vh] overflow-auto scrollbar-thin">
          {loading ? (
            <div className="flex items-center justify-center py-12 text-dim">
              <Loader2 className="animate-spin mr-2" size={18} /> {t("loading")}
            </div>
          ) : (
            <div className="space-y-2">
              {disks.map((d, idx) => {
                const active = selected === d.mountpoint;
                const disabled = !d.eligible;
                return (
                  <button
                    key={d.mountpoint}
                    onClick={() => !disabled && setSelected(d.mountpoint)}
                    disabled={disabled}
                    data-testid={`disk-option-${idx}`}
                    className="w-full text-left panel px-4 py-3 flex items-center gap-4 hover:border-primary-brand transition-colors"
                    style={{
                      borderColor: active ? "var(--primary)" : "var(--border)",
                      background: active ? "var(--primary-soft)" : "var(--surface)",
                      cursor: disabled ? "not-allowed" : "pointer",
                      opacity: disabled ? 0.55 : 1,
                    }}
                  >
                    <div className="h-10 w-10 flex items-center justify-center rounded-sm border border-brand shrink-0" style={{ background: "var(--surface-2)" }}>
                      <HardDrive size={18} className={active ? "text-primary-brand" : "text-dim"} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-mono text-sm text-brand">{d.label}</span>
                        <span className="label-overline">{d.fstype}</span>
                        {d.eligible ? (
                          <span className="label-overline text-success flex items-center gap-1"><Check size={12} /> {t("eligible")}</span>
                        ) : (
                          <span className="label-overline text-danger flex items-center gap-1"><AlertCircle size={12} /> {t("not_enough_space")}</span>
                        )}
                      </div>
                      <DiskBar disk={d} required={required} />
                    </div>
                    {active && <Check size={20} className="text-primary-brand shrink-0" />}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="px-6 py-4 border-t border-brand flex items-center justify-between">
          <div className="text-xs text-dim font-mono">
            {selected && `→ ${selected.replace(/\/$/, "")}${selected.includes("\\") || /^[A-Z]:/.test(selected) ? "\\" : "/"}LGSSManagers`}
          </div>
          <button
            onClick={handleConfirm}
            disabled={!selected || saving}
            className="tactical-btn flex items-center gap-2"
            data-testid="disk-wizard-confirm"
          >
            {saving ? <Loader2 className="animate-spin" size={16} /> : <ArrowRight size={16} />}
            {t("continue")}
          </button>
        </div>
      </div>
    </div>
  );
};
