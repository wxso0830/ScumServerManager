import React, { useState } from "react";
import { Trash2, UserPlus, Download, Upload, Copy, Check } from "lucide-react";
import { toast } from "sonner";
import { useI18n } from "../providers/I18nProvider";
import { endpoints, api } from "../lib/api";

export const UserList = ({ users = [], onChange, commonFlags = [], exportKey, serverId, testIdPrefix }) => {
  const { t } = useI18n();
  const [newId, setNewId] = useState("");
  const [newFlags, setNewFlags] = useState("");
  const [importOpen, setImportOpen] = useState(false);
  const [importText, setImportText] = useState("");
  const [copied, setCopied] = useState(false);

  const addUser = () => {
    const sid = newId.trim();
    if (!sid) return;
    const flags = newFlags.split(",").map((f) => f.trim()).filter(Boolean);
    onChange([...users, { steam_id: sid, flags, note: "" }]);
    setNewId("");
    setNewFlags("");
  };

  const updateUser = (idx, patch) => {
    onChange(users.map((u, i) => (i === idx ? { ...u, ...patch } : u)));
  };

  const removeUser = (idx) => onChange(users.filter((_, i) => i !== idx));

  const exportFile = async () => {
    if (!serverId || !exportKey) return;
    const res = await api.get(`/servers/${serverId}/export/${exportKey}`);
    const { filename, content } = res.data;
    const blob = new Blob([content], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(filename);
  };

  const copyContent = async () => {
    if (!serverId || !exportKey) return;
    const res = await api.get(`/servers/${serverId}/export/${exportKey}`);
    await navigator.clipboard.writeText(res.data.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const doImport = async () => {
    if (!serverId || !exportKey) return;
    await api.post(`/servers/${serverId}/import/${exportKey}`, { content: importText });
    const fresh = await endpoints.getServer(serverId);
    const keyMap = { admins: "users_admins", banned: "users_banned", exclusive: "users_exclusive" };
    onChange(fresh.settings[keyMap[exportKey]] || []);
    setImportOpen(false);
    setImportText("");
    toast.success(t("import_file"));
  };

  return (
    <div className="space-y-3" data-testid={`${testIdPrefix}-userlist`}>
      <div className="flex flex-wrap items-end gap-2 panel p-3">
        <div className="flex-1 min-w-[180px]">
          <label className="label-overline block mb-1">{t("steam_id")}</label>
          <input className="input-field font-mono" value={newId} onChange={(e) => setNewId(e.target.value)} placeholder="7656119XXXXXXXXXX" data-testid={`${testIdPrefix}-new-steamid`} />
        </div>
        <div className="flex-1 min-w-[180px]">
          <label className="label-overline block mb-1">{t("flags")}</label>
          <input className="input-field font-mono text-xs" value={newFlags} onChange={(e) => setNewFlags(e.target.value)} placeholder={commonFlags.join(", ")} data-testid={`${testIdPrefix}-new-flags`} />
        </div>
        <button className="tactical-btn flex items-center gap-2 shrink-0" onClick={addUser} data-testid={`${testIdPrefix}-add-btn`}>
          <UserPlus size={14} /> {t("add_user")}
        </button>
        <div className="flex gap-2 shrink-0">
          <button className="ghost-btn flex items-center gap-2 text-xs" onClick={exportFile} data-testid={`${testIdPrefix}-export-btn`}>
            <Download size={14} /> {t("export_file")}
          </button>
          <button className="ghost-btn flex items-center gap-2 text-xs" onClick={copyContent}>
            {copied ? <Check size={14} /> : <Copy size={14} />} {copied ? t("copied") : t("copy")}
          </button>
          <button className="ghost-btn flex items-center gap-2 text-xs" onClick={() => setImportOpen((v) => !v)} data-testid={`${testIdPrefix}-import-btn`}>
            <Upload size={14} /> {t("import_file")}
          </button>
        </div>
      </div>

      {importOpen && (
        <div className="panel p-3">
          <textarea
            rows={6}
            className="input-field font-mono text-xs"
            placeholder={t("paste_here")}
            value={importText}
            onChange={(e) => setImportText(e.target.value)}
            data-testid={`${testIdPrefix}-import-textarea`}
          />
          <div className="flex justify-end mt-2 gap-2">
            <button className="ghost-btn" onClick={() => setImportOpen(false)}>{t("cancel")}</button>
            <button className="tactical-btn" onClick={doImport} data-testid={`${testIdPrefix}-import-confirm`}>{t("import_file")}</button>
          </div>
        </div>
      )}

      {users.length === 0 ? (
        <div className="panel p-6 text-center text-sm text-dim">{t("no_users")}</div>
      ) : (
        <div className="panel overflow-hidden">
          <div className="grid grid-cols-[1.4fr_1.2fr_1fr_auto] gap-0 text-xs font-mono uppercase tracking-wider text-dim border-b border-brand bg-surface-2">
            <div className="px-3 py-2">{t("steam_id")}</div>
            <div className="px-3 py-2">{t("flags")}</div>
            <div className="px-3 py-2">{t("note")}</div>
            <div className="px-3 py-2 w-10" />
          </div>
          {users.map((u, idx) => (
            <div key={idx} className="grid grid-cols-[1.4fr_1.2fr_1fr_auto] gap-0 border-b border-brand hover:bg-surface-2/50">
              <input
                className="bg-transparent px-3 py-2 font-mono text-sm border-r border-brand outline-none focus:bg-primary-soft"
                value={u.steam_id}
                onChange={(e) => updateUser(idx, { steam_id: e.target.value })}
                data-testid={`${testIdPrefix}-row-${idx}-steamid`}
              />
              <input
                className="bg-transparent px-3 py-2 font-mono text-xs border-r border-brand outline-none focus:bg-primary-soft"
                value={(u.flags || []).join(",")}
                onChange={(e) => updateUser(idx, { flags: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) })}
                placeholder={commonFlags.join(",")}
                data-testid={`${testIdPrefix}-row-${idx}-flags`}
              />
              <input
                className="bg-transparent px-3 py-2 text-sm border-r border-brand outline-none focus:bg-primary-soft"
                value={u.note || ""}
                onChange={(e) => updateUser(idx, { note: e.target.value })}
              />
              <button className="px-3 text-danger hover:bg-surface-2" onClick={() => removeUser(idx)} data-testid={`${testIdPrefix}-row-${idx}-remove`}>
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
