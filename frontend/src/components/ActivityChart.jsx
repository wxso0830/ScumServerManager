import React, { useEffect, useMemo, useState } from "react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Area, AreaChart } from "recharts";
import { Users, Cpu, TrendingUp } from "lucide-react";
import { endpoints } from "../lib/api";
import { useI18n } from "../providers/I18nProvider";

// Compact time label: HH:MM for samples <24h, DD.MM for older.
const fmtTick = (iso, spanHours) => {
  if (!iso) return "";
  const d = new Date(iso);
  if (spanHours > 24) {
    return `${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}`;
  }
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
};

const fmtFullTs = (iso) => {
  if (!iso) return "";
  const d = new Date(iso);
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  return `${dd}.${mm} ${hh}:${mi}`;
};

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="border border-brand bg-bg-deep px-3 py-2 text-[11px] font-mono">
      <div className="text-accent-brand mb-1">{fmtFullTs(label)}</div>
      {payload.map((p) => (
        <div key={p.dataKey} style={{ color: p.color }}>
          {p.name}: <span className="text-brand">{p.value ?? "—"}</span>
        </div>
      ))}
    </div>
  );
};

export const ActivityChart = ({ serverId, maxPlayers = 64 }) => {
  const { t } = useI18n();
  const [hours, setHours] = useState(24);
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const r = await endpoints.serverActivity(serverId, hours);
        if (!alive) return;
        setData(r.samples || []);
      } catch { /* ignore */ }
      finally { if (alive) setLoading(false); }
    };
    load();
    const iv = setInterval(load, 60_000);  // refresh every minute
    return () => { alive = false; clearInterval(iv); };
  }, [serverId, hours]);

  const stats = useMemo(() => {
    if (!data.length) return { peak: 0, avg: 0, peakAt: null };
    let peak = 0, peakAt = null, sum = 0, n = 0;
    for (const d of data) {
      const p = d.players;
      if (typeof p === "number") {
        sum += p; n += 1;
        if (p > peak) { peak = p; peakAt = d.ts; }
      }
    }
    return { peak, avg: n ? (sum / n) : 0, peakAt };
  }, [data]);

  return (
    <div className="border-t border-brand pt-3 mt-3" data-testid={`activity-chart-${serverId}`}>
      <div className="flex items-center gap-3 mb-2">
        <TrendingUp size={13} className="text-accent-brand" />
        <span className="label-accent">{t("activity_chart") || "AKTİVİTE GRAFİĞİ"}</span>
        <div className="ml-auto flex gap-1">
          {[
            { label: "24H", h: 24 },
            { label: "7G",  h: 24 * 7 },
            { label: "30G", h: 24 * 30 },
          ].map((opt) => (
            <button
              key={opt.h}
              onClick={() => setHours(opt.h)}
              className={`px-2 py-0.5 text-[10px] border font-mono tracking-widest transition-colors ${
                hours === opt.h
                  ? "border-accent-brand text-accent-brand bg-accent-soft"
                  : "border-brand text-dim hover:text-brand"
              }`}
              data-testid={`activity-range-${opt.h}h`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Peak / avg info */}
      {data.length > 0 && (
        <div className="flex gap-4 text-[10px] font-mono text-dim mb-2 uppercase tracking-widest">
          <span>
            {t("peak") || "PEAK"}:{" "}
            <span className="text-warning">
              {stats.peak}/{maxPlayers}
            </span>
            {stats.peakAt && <span className="text-muted ml-1">@ {fmtFullTs(stats.peakAt)}</span>}
          </span>
          <span>
            {t("avg") || "ORT"}:{" "}
            <span className="text-brand">{stats.avg.toFixed(1)}</span>
          </span>
          <span className="text-muted ml-auto">{data.length} örnek</span>
        </div>
      )}

      <div className="w-full h-[140px] bg-bg-deep border border-brand">
        {loading ? (
          <div className="h-full flex items-center justify-center text-dim text-xs font-mono">
            {t("loading") || "Yükleniyor..."}
          </div>
        ) : data.length === 0 ? (
          <div className="h-full flex items-center justify-center text-dim text-xs font-mono text-center px-4">
            {t("activity_chart_empty") || "Sunucu çalışırken her 5 dakikada bir örnek kaydedilir.\nİlk veriler birkaç dakika içinde görünecek."}
          </div>
        ) : (
          <ResponsiveContainer>
            <AreaChart data={data} margin={{ top: 8, right: 12, left: -18, bottom: 0 }}>
              <defs>
                <linearGradient id={`pg-${serverId}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="var(--accent)" stopOpacity={0.35} />
                  <stop offset="95%" stopColor="var(--accent)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="2 4" stroke="var(--border)" />
              <XAxis
                dataKey="ts"
                tick={{ fontSize: 9, fill: "var(--text-dim)", fontFamily: "monospace" }}
                tickFormatter={(v) => fmtTick(v, hours)}
                minTickGap={40}
                axisLine={{ stroke: "var(--border)" }}
                tickLine={false}
              />
              <YAxis
                domain={[0, maxPlayers]}
                tick={{ fontSize: 9, fill: "var(--text-dim)", fontFamily: "monospace" }}
                axisLine={{ stroke: "var(--border)" }}
                tickLine={false}
                width={28}
              />
              <Tooltip content={<CustomTooltip />} />
              <Area
                type="monotone"
                dataKey="players"
                name={t("col_player") || "Oyuncu"}
                stroke="var(--accent)"
                strokeWidth={2}
                fill={`url(#pg-${serverId})`}
                isAnimationActive={false}
                dot={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
};
