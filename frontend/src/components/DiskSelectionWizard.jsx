import React, { useEffect, useState } from "react";
import { HardDrive, Check, AlertCircle, Loader2, ArrowRight, Terminal } from "lucide-react";
import { useI18n } from "../providers/I18nProvider";
import { endpoints } from "../lib/api";

const DiskBar = ({ disk, required }) => {
  const { t } = useI18n();
  const usedPct = disk.percent_used;
  const reqPct = Math.min((required / disk.total_gb) * 100, Math.max(0, 100 - usedPct));
  return (
    <div className="w-full">
      <div className="flex h-2.5 w-full overflow-hidden border border-brand bg-bg-deep">
        <div style={{ width: `${usedPct}%`, background: "var(--border-strong)" }} title={`Used ${disk.used_gb} GB`} />
        <div style={{ width: `${reqPct}%`, background: "var(--accent)", opacity: disk.eligible ? 0.9 : 0.3 }} title={`SCUM Allocation ${required} GB`} />
      </div>
      <div className="flex justify-between mt-1.5 font-mono text-[10px] uppercase tracking-widest text-dim">
        <span>{disk.used_gb} / {disk.total_gb} GB</span>
        <span>{disk.free_gb} GB {t("free")}</span>
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
    <div className="fixed inset-0 z-40 bg-bg-deep flex items-center justify-center p-6 overflow-hidden" data-testid="disk-wizard">
      <div className="boot-scan" />
      {/* Grid texture */}
      <div
        className="absolute inset-0 opacity-[0.06] pointer-events-none"
        style={{
          backgroundImage:
            "linear-gradient(var(--border-strong) 1px, transparent 1px), linear-gradient(90deg, var(--border-strong) 1px, transparent 1px)",
          backgroundSize: "48px 48px",
        }}
      />

      <div className="relative w-full max-w-3xl panel corner-brackets-full" style={{ background: "var(--surface)" }}>
        <span className="cbr-tr" />
        <span className="cbr-bl" />

        {/* Boot terminal header */}
        <div className="px-6 py-3 border-b border-brand flex items-center gap-3 bg-bg-deep">
          <Terminal size={16} className="text-accent-brand" />
          <div className="font-mono text-[11px] uppercase tracking-[0.3em] text-accent-brand">
            {t("initializing")}<span className="cursor-blink"></span>
          </div>
          <div className="flex-1" />
          <div className="font-mono text-[10px] uppercase tracking-widest text-muted">STEP 01 / 01</div>
        </div>

        <div className="px-6 py-5 border-b border-brand">
          <div className="label-accent mb-2">{t("setup_title")}</div>
          <h1 className="heading-stencil text-2xl mb-2">{t("setup_step_disk")}</h1>
          <p className="text-sm text-dim max-w-2xl">{t("setup_disk_subtitle")}</p>
          <p className="font-mono text-[11px] text-muted uppercase tracking-widest mt-3">
            {t("disk_picker_info", { gb: required })} · {t("required_space")}: <span className="text-accent-brand">~{required} GB</span>
          </p>
        </div>

        <div className="px-6 py-5 max-h-[48vh] overflow-auto scrollbar-thin">
          {loading ? (
            <div className="flex items-center justify-center py-12 text-dim font-mono uppercase tracking-widest text-xs">
              <Loader2 className="animate-spin mr-2" size={16} /> {t("loading")}
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
                    className="w-full text-left px-4 py-3 flex items-center gap-4 transition-colors border"
                    style={{
                      borderColor: active ? "var(--accent)" : "var(--border)",
                      background: active ? "var(--accent-soft)" : "var(--bg-deep)",
                      cursor: disabled ? "not-allowed" : "pointer",
                      opacity: disabled ? 0.5 : 1,
                    }}
                  >
                    <div
                      className="h-10 w-10 flex items-center justify-center border shrink-0"
                      style={{
                        borderColor: active ? "var(--accent)" : "var(--border-strong)",
                        background: "var(--surface)",
                      }}
                    >
                      <HardDrive size={16} className={active ? "text-accent-brand" : "text-dim"} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-3 mb-1.5">
                        <span className="font-mono text-sm text-brand uppercase tracking-wider">{d.label}</span>
                        <span className="label-overline">{d.fstype}</span>
                        {d.eligible ? (
                          <span className="font-mono text-[10px] uppercase tracking-widest text-success flex items-center gap-1">
                            <Check size={11} /> {t("eligible")}
                          </span>
                        ) : (
                          <span className="font-mono text-[10px] uppercase tracking-widest text-danger flex items-center gap-1">
                            <AlertCircle size={11} /> {t("not_enough_space")}
                          </span>
                        )}
                      </div>
                      <DiskBar disk={d} required={required} />
                    </div>
                    {active && <Check size={18} className="text-accent-brand shrink-0" />}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="px-6 py-4 border-t border-brand flex items-center justify-between bg-bg-deep">
          <div className="text-[11px] text-dim font-mono uppercase tracking-widest truncate max-w-md">
            {selected && (
              <>→ {selected.replace(/\/$/, "")}{selected.includes("\\") || /^[A-Z]:/.test(selected) ? "\\" : "/"}<span className="text-accent-brand">LGSSManagers</span></>
            )}
          </div>
          <button
            onClick={handleConfirm}
            disabled={!selected || saving}
            className="btn-primary flex items-center gap-2"
            data-testid="disk-wizard-confirm"
          >
            {saving ? <Loader2 className="animate-spin" size={14} /> : <ArrowRight size={14} />}
            {t("continue")}
          </button>
        </div>
      </div>
    </div>
  );
};
