import React, { useMemo, useState } from "react";
import {
  Store, Search, Plus, Trash2, Image as ImageIcon, Copy, RefreshCw, X,
  Swords, Shield, Apple, Heart, Hammer, Car, Wrench, Shirt, Package, Dice3,
} from "lucide-react";
import { useI18n } from "../providers/I18nProvider";

/* ---------- helpers ---------- */

// "A_0_Armory" -> { sector: "A_0", type: "Armory" }
const parseTraderName = (name) => {
  const m = /^([A-Z])_(\d+)_(.+)$/.exec(name || "");
  if (m) return { sector: `${m[1]}_${m[2]}`, type: m[3] };
  return { sector: "Other", type: name };
};

const TYPE_ICONS = {
  Armory: Swords,
  Trader: Package,
  Mechanic: Wrench,
  BoatShop: Car,
  Saloon: Apple,
  Hospital: Heart,
  Barber: Shirt,
};

// Item code prefix -> category
const CATEGORY_RULES = [
  { rx: /^Weapon_/i, key: "weapon", label: "Weapons", icon: Swords },
  { rx: /^(Armor_|Helmet_|Vest_|Backpack_|Tactical_Vest)/i, key: "armor", label: "Armor", icon: Shield },
  { rx: /^(Ammo_|Magazine_|Mag_|Ammobox_)/i, key: "ammo", label: "Ammo", icon: Dice3 },
  { rx: /^(Food_|Drink_|Cooked_|Raw_|Meat_|Fruit_|Vegetable_|Canned_)/i, key: "food", label: "Food & Drink", icon: Apple },
  { rx: /^(Medical_|Bandage_|Morphine_|Antibiotic|Painkiller)/i, key: "medical", label: "Medical", icon: Heart },
  { rx: /^(Building_|Blueprint_|BaseBuilding_|Wall_|Floor_|Door_|Gate_|Foundation_)/i, key: "building", label: "Base Building", icon: Hammer },
  { rx: /^(Vehicle_|Car_|Boat_|Motorcycle_|Bike_|Tire_|Engine_|Battery_)/i, key: "vehicle", label: "Vehicles & Parts", icon: Car },
  { rx: /^(Tool_|Utility_|Lockpick_|Crowbar_|Hammer_|Knife_)/i, key: "tool", label: "Tools", icon: Wrench },
  { rx: /^(Cloth_|Shirt_|Pants_|Boots_|Jacket_|Hat_|Glove_|Sock_)/i, key: "clothing", label: "Clothing", icon: Shirt },
];

const categoryFor = (code) => {
  for (const r of CATEGORY_RULES) if (r.rx.test(code || "")) return r;
  return { key: "other", label: "Other", icon: Package };
};

const emptyItem = () => ({
  "tradeable-code": "",
  "base-purchase-price": "0",
  "base-sell-price": "0",
  "delta-price": "-1.0",
  "can-be-purchased": "default",
  "required-famepoints": "-1",
  "available-after-sale-only": "default",
  image_url: "",
});

/* ---------- component ---------- */

export const TradersEditor = ({ traders = {}, onChange, testId = "traders" }) => {
  const { t } = useI18n();
  const traderNames = Object.keys(traders);

  // group by sector
  const bySector = useMemo(() => {
    const map = {};
    for (const n of traderNames) {
      const { sector } = parseTraderName(n);
      (map[sector] = map[sector] || []).push(n);
    }
    return map;
  }, [traderNames]);
  const sectors = Object.keys(bySector).sort();

  const [activeSector, setActiveSector] = useState(sectors[0] || "");
  const [activeTrader, setActiveTrader] = useState(bySector[sectors[0]]?.[0] || "");
  const [typeFilter, setTypeFilter] = useState("");      // filter within sector
  const [categoryFilter, setCategoryFilter] = useState(""); // filter within trader's items
  const [query, setQuery] = useState("");
  const [selectedIdx, setSelectedIdx] = useState(null);
  const [copyOpen, setCopyOpen] = useState(false);

  const items = traders[activeTrader] || [];
  const categorized = useMemo(() => items.map((it, idx) => ({ it, idx, cat: categoryFor(it["tradeable-code"]) })), [items]);
  const availableCategories = useMemo(
    () => Array.from(new Set(categorized.map((x) => x.cat.key))),
    [categorized]
  );
  const filtered = useMemo(() => {
    let list = categorized;
    if (categoryFilter) list = list.filter((x) => x.cat.key === categoryFilter);
    if (query.trim()) {
      const q = query.toLowerCase();
      list = list.filter((x) => String(x.it["tradeable-code"] || "").toLowerCase().includes(q));
    }
    return list;
  }, [categorized, categoryFilter, query]);

  if (traderNames.length === 0) {
    return (
      <div className="panel p-8 text-center text-sm text-dim" data-testid={testId}>
        No traders defined. Import EconomyOverride.json to populate.
      </div>
    );
  }

  const tradersInSector = (bySector[activeSector] || []).filter((n) => {
    if (!typeFilter) return true;
    return parseTraderName(n).type === typeFilter;
  });

  const typesInSector = Array.from(new Set((bySector[activeSector] || []).map((n) => parseTraderName(n).type)));

  const updateItem = (idx, patch) => {
    const next = { ...traders };
    next[activeTrader] = (next[activeTrader] || []).map((it, i) => (i === idx ? { ...it, ...patch } : it));
    onChange(next);
  };

  const addItem = () => {
    const next = { ...traders };
    next[activeTrader] = [...(next[activeTrader] || []), emptyItem()];
    onChange(next);
    setSelectedIdx(next[activeTrader].length - 1);
  };

  const removeItem = (idx) => {
    const next = { ...traders };
    next[activeTrader] = (next[activeTrader] || []).filter((_, i) => i !== idx);
    onChange(next);
    setSelectedIdx(null);
  };

  const copyFrom = (srcTrader) => {
    const src = traders[srcTrader] || [];
    const next = { ...traders };
    const existing = new Set((next[activeTrader] || []).map((x) => x["tradeable-code"]));
    const added = src.filter((x) => !existing.has(x["tradeable-code"]));
    next[activeTrader] = [...(next[activeTrader] || []), ...added.map((x) => ({ ...x }))];
    onChange(next);
    setCopyOpen(false);
  };

  const selected = selectedIdx != null ? items[selectedIdx] : null;

  const switchSector = (s) => {
    setActiveSector(s);
    setTypeFilter("");
    const first = bySector[s]?.[0];
    if (first) setActiveTrader(first);
    setSelectedIdx(null);
  };

  return (
    <div className="space-y-4" data-testid={testId}>
      {/* Sector + type filters */}
      <div className="panel">
        <div className="px-4 py-3 border-b border-brand flex items-center gap-3">
          <Store size={14} className="text-accent-brand" />
          <span className="heading-stencil text-sm">Sectors</span>
          <div className="flex-1" />
          <span className="font-mono text-[10px] uppercase tracking-widest text-dim">
            {sectors.length} SECTORS · {traderNames.length} TRADERS
          </span>
        </div>
        <div className="p-3 flex flex-wrap gap-2">
          {sectors.map((s) => (
            <button
              key={s}
              onClick={() => switchSector(s)}
              data-testid={`${testId}-sector-${s}`}
              className="px-3 py-1.5 font-mono text-xs uppercase tracking-widest border transition-colors"
              style={{
                borderColor: activeSector === s ? "var(--accent)" : "var(--border-strong)",
                color: activeSector === s ? "var(--accent)" : "var(--text-dim)",
                background: activeSector === s ? "var(--accent-soft)" : "transparent",
              }}
            >
              SECTOR {s}
              <span className="ml-2 opacity-60">· {bySector[s].length}</span>
            </button>
          ))}
        </div>
        {typesInSector.length > 1 && (
          <div className="px-3 pb-3 flex flex-wrap gap-2 border-t border-brand pt-3">
            <button
              onClick={() => setTypeFilter("")}
              className="px-2.5 py-1 text-[10px] font-mono uppercase tracking-widest border transition-colors"
              style={{
                borderColor: !typeFilter ? "var(--accent)" : "var(--border)",
                color: !typeFilter ? "var(--accent)" : "var(--text-dim)",
              }}
            >
              ALL
            </button>
            {typesInSector.map((tp) => {
              const Icon = TYPE_ICONS[tp] || Store;
              return (
                <button
                  key={tp}
                  onClick={() => setTypeFilter(tp)}
                  data-testid={`${testId}-type-${tp}`}
                  className="px-2.5 py-1 text-[10px] font-mono uppercase tracking-widest border transition-colors flex items-center gap-1.5"
                  style={{
                    borderColor: typeFilter === tp ? "var(--accent)" : "var(--border)",
                    color: typeFilter === tp ? "var(--accent)" : "var(--text-dim)",
                  }}
                >
                  <Icon size={10} /> {tp}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Trader list */}
      <div className="grid grid-cols-[260px_1fr_320px] gap-4 min-h-[520px]">
        <div className="panel flex flex-col min-h-0">
          <div className="px-3 py-2 border-b border-brand label-accent">Traders in {activeSector}</div>
          <div className="flex-1 overflow-y-auto scrollbar-thin">
            {tradersInSector.length === 0 && (
              <div className="p-4 text-xs text-dim">No traders match this filter.</div>
            )}
            {tradersInSector.map((name) => {
              const { type } = parseTraderName(name);
              const Icon = TYPE_ICONS[type] || Store;
              const active = activeTrader === name;
              const count = (traders[name] || []).length;
              return (
                <button
                  key={name}
                  onClick={() => { setActiveTrader(name); setSelectedIdx(null); setCategoryFilter(""); }}
                  data-testid={`${testId}-trader-${name}`}
                  className="w-full text-left px-3 py-2.5 border-b border-brand hover:bg-surface-2 transition-colors flex items-center gap-3"
                  style={{
                    borderLeft: active ? "2px solid var(--accent)" : "2px solid transparent",
                    background: active ? "var(--accent-soft)" : "transparent",
                  }}
                >
                  <Icon size={14} className={active ? "text-accent-brand" : "text-dim"} />
                  <div className="flex-1 min-w-0">
                    <div className="font-mono text-xs text-brand truncate uppercase tracking-widest">{type}</div>
                    <div className="font-mono text-[10px] text-muted truncate">{name}</div>
                  </div>
                  <span className="font-mono text-[10px] text-dim">{count}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Items list */}
        <div className="panel flex flex-col min-h-0">
          <div className="px-3 py-2 border-b border-brand flex items-center gap-2">
            <div className="label-accent flex-1 truncate">{activeTrader} · {items.length} items</div>
            <button className="btn-ghost text-[10px] flex items-center gap-1" onClick={() => setCopyOpen(true)} data-testid={`${testId}-copy-btn`}>
              <Copy size={11} /> COPY FROM...
            </button>
            <button className="btn-secondary text-[10px] flex items-center gap-1" onClick={addItem} data-testid={`${testId}-add-item-btn`}>
              <Plus size={11} /> ADD
            </button>
          </div>

          <div className="px-3 py-2 border-b border-brand flex items-center gap-2">
            <div className="relative flex-1">
              <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-dim" />
              <input
                className="input-field pl-7 text-xs"
                placeholder={`${t("search")} tradeable-code...`}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                data-testid={`${testId}-search`}
              />
            </div>
          </div>

          {availableCategories.length > 0 && (
            <div className="px-3 py-2 border-b border-brand flex items-center gap-1.5 overflow-x-auto scrollbar-thin">
              <button
                onClick={() => setCategoryFilter("")}
                className="px-2 py-0.5 text-[10px] font-mono uppercase tracking-widest border transition-colors whitespace-nowrap"
                style={{
                  borderColor: !categoryFilter ? "var(--accent)" : "var(--border)",
                  color: !categoryFilter ? "var(--accent)" : "var(--text-dim)",
                }}
              >
                ALL · {categorized.length}
              </button>
              {CATEGORY_RULES.filter((r) => availableCategories.includes(r.key)).map((r) => {
                const count = categorized.filter((x) => x.cat.key === r.key).length;
                const CatIcon = r.icon;
                return (
                  <button
                    key={r.key}
                    onClick={() => setCategoryFilter(r.key)}
                    data-testid={`${testId}-cat-${r.key}`}
                    className="px-2 py-0.5 text-[10px] font-mono uppercase tracking-widest border transition-colors whitespace-nowrap flex items-center gap-1"
                    style={{
                      borderColor: categoryFilter === r.key ? "var(--accent)" : "var(--border)",
                      color: categoryFilter === r.key ? "var(--accent)" : "var(--text-dim)",
                    }}
                  >
                    <CatIcon size={9} /> {r.label} · {count}
                  </button>
                );
              })}
              {availableCategories.includes("other") && (
                <button
                  onClick={() => setCategoryFilter("other")}
                  className="px-2 py-0.5 text-[10px] font-mono uppercase tracking-widest border transition-colors whitespace-nowrap flex items-center gap-1"
                  style={{
                    borderColor: categoryFilter === "other" ? "var(--accent)" : "var(--border)",
                    color: categoryFilter === "other" ? "var(--accent)" : "var(--text-dim)",
                  }}
                >
                  <Package size={9} /> Other · {categorized.filter((x) => x.cat.key === "other").length}
                </button>
              )}
            </div>
          )}

          <div className="flex-1 overflow-y-auto scrollbar-thin">
            {filtered.length === 0 && (
              <div className="p-6 text-center text-xs text-dim">No items match.</div>
            )}
            {filtered.map(({ it, idx, cat }) => {
              const CatIcon = cat.icon;
              const active = selectedIdx === idx;
              return (
                <button
                  key={idx}
                  onClick={() => setSelectedIdx(idx)}
                  data-testid={`${testId}-item-${idx}`}
                  className="w-full text-left px-3 py-2.5 border-b border-brand hover:bg-surface-2 transition-colors flex items-center gap-3"
                  style={{
                    borderLeft: active ? "2px solid var(--accent)" : "2px solid transparent",
                    background: active ? "var(--accent-soft)" : "transparent",
                  }}
                >
                  <div className="h-10 w-10 flex items-center justify-center bg-bg-deep border border-strong shrink-0 overflow-hidden">
                    {it.image_url ? (
                      <img
                        src={it.image_url}
                        alt=""
                        className="max-h-full max-w-full object-contain"
                        onError={(e) => { e.currentTarget.style.display = "none"; }}
                      />
                    ) : (
                      <CatIcon size={14} className="text-dim" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-mono text-xs text-brand truncate">{it["tradeable-code"] || "(new item)"}</div>
                    <div className="flex items-center gap-2 mt-0.5 font-mono text-[10px]">
                      <span className="text-accent-brand">BUY {it["base-purchase-price"]}</span>
                      <span className="text-dim">·</span>
                      <span className="text-success">SELL {it["base-sell-price"]}</span>
                      <span className="text-muted ml-auto">{cat.label}</span>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Detail panel */}
        <div className="panel flex flex-col min-h-0">
          {selected ? (
            <ItemDetail
              item={selected}
              onChange={(patch) => updateItem(selectedIdx, patch)}
              onDelete={() => removeItem(selectedIdx)}
              testIdPrefix={testId}
            />
          ) : (
            <div className="p-6 text-center text-xs text-dim">
              Select an item to edit details.
            </div>
          )}
        </div>
      </div>

      {/* Copy from modal */}
      {copyOpen && (
        <div className="fixed inset-0 z-[70] bg-bg-deep/90 backdrop-blur-md flex items-center justify-center p-4" onClick={() => setCopyOpen(false)}>
          <div className="panel w-full max-w-lg corner-brackets" onClick={(e) => e.stopPropagation()} style={{ background: "var(--surface)" }}>
            <div className="px-4 py-3 border-b border-brand flex items-center justify-between">
              <span className="heading-stencil text-sm">Copy Items From</span>
              <button className="icon-btn" onClick={() => setCopyOpen(false)}>
                <X size={14} />
              </button>
            </div>
            <div className="max-h-[60vh] overflow-y-auto scrollbar-thin">
              {traderNames.filter((n) => n !== activeTrader).map((n) => (
                <button
                  key={n}
                  onClick={() => copyFrom(n)}
                  data-testid={`${testId}-copy-src-${n}`}
                  className="w-full text-left px-4 py-2.5 border-b border-brand hover:bg-surface-2 transition-colors flex items-center justify-between"
                >
                  <span className="font-mono text-xs text-brand">{n}</span>
                  <span className="font-mono text-[10px] text-dim">{(traders[n] || []).length} items</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

/* ---------- Item detail panel ---------- */

const LabeledInput = ({ label, hint, value, onChange, testId, type = "text" }) => (
  <div>
    <label className="label-overline block mb-1">{label}</label>
    <input
      type={type}
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value)}
      className="input-field"
      data-testid={testId}
    />
    {hint && <p className="text-[10px] text-muted mt-1">{hint}</p>}
  </div>
);

const ItemDetail = ({ item, onChange, onDelete, testIdPrefix }) => {
  const cat = categoryFor(item["tradeable-code"]);
  const CatIcon = cat.icon;
  return (
    <div className="flex flex-col h-full" data-testid={`${testIdPrefix}-detail`}>
      <div className="px-4 py-3 border-b border-brand flex items-center gap-2">
        <CatIcon size={13} className="text-accent-brand" />
        <span className="label-accent flex-1">{cat.label}</span>
        <button
          className="icon-btn text-danger"
          onClick={onDelete}
          title="Delete"
          data-testid={`${testIdPrefix}-detail-delete`}
        >
          <Trash2 size={14} />
        </button>
      </div>
      <div className="p-4 space-y-3 overflow-y-auto scrollbar-thin">
        {/* Image preview + URL */}
        <div>
          <label className="label-overline block mb-1">Image URL (optional, user-provided)</label>
          <div className="flex gap-2">
            <div className="h-16 w-16 flex items-center justify-center bg-bg-deep border border-strong shrink-0 overflow-hidden">
              {item.image_url ? (
                <img
                  src={item.image_url}
                  alt=""
                  className="max-h-full max-w-full object-contain"
                  onError={(e) => { e.currentTarget.style.display = "none"; }}
                />
              ) : (
                <ImageIcon size={18} className="text-dim" />
              )}
            </div>
            <input
              className="input-field flex-1"
              placeholder="https://..."
              value={item.image_url || ""}
              onChange={(e) => onChange({ image_url: e.target.value })}
              data-testid={`${testIdPrefix}-detail-image-url`}
            />
          </div>
          <p className="text-[10px] text-muted mt-1">
            Paste your own image URL. This field is for the manager UI only and is NOT written to EconomyOverride.json.
          </p>
        </div>

        <LabeledInput
          label="Tradeable Code"
          value={item["tradeable-code"]}
          onChange={(v) => onChange({ "tradeable-code": v })}
          testId={`${testIdPrefix}-detail-code`}
        />
        <div className="grid grid-cols-2 gap-3">
          <LabeledInput
            label="Buy Price"
            value={item["base-purchase-price"]}
            onChange={(v) => onChange({ "base-purchase-price": v })}
            testId={`${testIdPrefix}-detail-buy`}
          />
          <LabeledInput
            label="Sell Price"
            value={item["base-sell-price"]}
            onChange={(v) => onChange({ "base-sell-price": v })}
            testId={`${testIdPrefix}-detail-sell`}
          />
          <LabeledInput
            label="Delta Price"
            hint="-1 = default"
            value={item["delta-price"]}
            onChange={(v) => onChange({ "delta-price": v })}
            testId={`${testIdPrefix}-detail-delta`}
          />
          <LabeledInput
            label="Required Fame"
            hint="-1 = none"
            value={item["required-famepoints"]}
            onChange={(v) => onChange({ "required-famepoints": v })}
            testId={`${testIdPrefix}-detail-fame`}
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <LabeledInput
            label="Can Be Purchased"
            hint="default / true / false"
            value={item["can-be-purchased"]}
            onChange={(v) => onChange({ "can-be-purchased": v })}
            testId={`${testIdPrefix}-detail-canbuy`}
          />
          <LabeledInput
            label="Available After Sale Only"
            hint="default / true / false"
            value={item["available-after-sale-only"]}
            onChange={(v) => onChange({ "available-after-sale-only": v })}
            testId={`${testIdPrefix}-detail-aftersale`}
          />
        </div>
      </div>
    </div>
  );
};
