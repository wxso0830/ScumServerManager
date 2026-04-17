import React, { useMemo, useState } from "react";
import { Store } from "lucide-react";
import { useI18n } from "../providers/I18nProvider";

export const TradersEditor = ({ traders = {}, onChange, testId = "traders" }) => {
  const { t } = useI18n();
  const traderNames = Object.keys(traders);
  const [activeTrader, setActiveTrader] = useState(traderNames[0] || "");
  const [query, setQuery] = useState("");

  const items = traders[activeTrader] || [];
  const filtered = useMemo(() => {
    if (!query.trim()) return items;
    const q = query.toLowerCase();
    return items.filter((it) => String(it["tradeable-code"] || "").toLowerCase().includes(q));
  }, [items, query]);

  if (traderNames.length === 0) {
    return <div className="panel p-6 text-center text-sm text-dim">No traders defined. Import EconomyOverride.json.</div>;
  }

  const updateItem = (trader, itemIdx, field, value) => {
    const next = { ...traders };
    next[trader] = next[trader].map((it, i) => (i === itemIdx ? { ...it, [field]: value } : it));
    onChange(next);
  };

  return (
    <div className="space-y-3" data-testid={testId}>
      <div className="flex flex-wrap gap-1 border-b border-brand pb-2">
        {traderNames.map((name) => (
          <button
            key={name}
            onClick={() => setActiveTrader(name)}
            className="px-2.5 py-1 text-xs font-mono rounded-sm border transition-colors"
            style={{
              borderColor: activeTrader === name ? "var(--primary)" : "var(--border)",
              color: activeTrader === name ? "var(--text)" : "var(--text-dim)",
              background: activeTrader === name ? "var(--primary-soft)" : "transparent",
            }}
            data-testid={`${testId}-trader-${name}`}
          >
            <Store size={11} className="inline mr-1" /> {name} <span className="text-dim">· {traders[name].length}</span>
          </button>
        ))}
      </div>

      <input
        className="input-field"
        placeholder={`${t("search")} ${t("tradeable_code").toLowerCase()}...`}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        data-testid={`${testId}-search`}
      />
      <div className="label-overline">{t("showing")} {filtered.length} {t("of")} {items.length}</div>

      <div className="panel overflow-hidden max-h-[520px] overflow-y-auto scrollbar-thin">
        <div className="grid grid-cols-[2fr_1fr_1fr_1fr_1fr] text-xs font-mono uppercase tracking-wider text-dim border-b border-brand bg-surface-2 sticky top-0">
          <div className="px-3 py-2">{t("tradeable_code")}</div>
          <div className="px-3 py-2">{t("purchase_price")}</div>
          <div className="px-3 py-2">{t("sell_price")}</div>
          <div className="px-3 py-2">Fame Req</div>
          <div className="px-3 py-2">After Sale</div>
        </div>
        {filtered.map((it, idx) => {
          const realIdx = items.indexOf(it);
          return (
            <div key={idx} className="grid grid-cols-[2fr_1fr_1fr_1fr_1fr] border-b border-brand hover:bg-surface-2/50">
              <div className="px-3 py-2 font-mono text-xs text-brand truncate" title={it["tradeable-code"]}>{it["tradeable-code"]}</div>
              <input className="bg-transparent px-3 py-2 font-mono text-xs border-l border-brand outline-none focus:bg-primary-soft" value={it["base-purchase-price"] ?? ""} onChange={(ev) => updateItem(activeTrader, realIdx, "base-purchase-price", ev.target.value)} />
              <input className="bg-transparent px-3 py-2 font-mono text-xs border-l border-brand outline-none focus:bg-primary-soft" value={it["base-sell-price"] ?? ""} onChange={(ev) => updateItem(activeTrader, realIdx, "base-sell-price", ev.target.value)} />
              <input className="bg-transparent px-3 py-2 font-mono text-xs border-l border-brand outline-none focus:bg-primary-soft" value={it["required-famepoints"] ?? ""} onChange={(ev) => updateItem(activeTrader, realIdx, "required-famepoints", ev.target.value)} />
              <input className="bg-transparent px-3 py-2 font-mono text-xs border-l border-brand outline-none focus:bg-primary-soft" value={it["available-after-sale-only"] ?? ""} onChange={(ev) => updateItem(activeTrader, realIdx, "available-after-sale-only", ev.target.value)} />
            </div>
          );
        })}
      </div>
    </div>
  );
};
