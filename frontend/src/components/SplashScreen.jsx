import React, { useEffect, useRef } from "react";
import { useI18n } from "../providers/I18nProvider";

// SCUM Ranger-inspired startup splash. CSS-only animations, single onDone timer.
export const SplashScreen = ({ onDone, duration = 2400 }) => {
  const { t } = useI18n();
  const calledRef = useRef(false);

  useEffect(() => {
    const id = setTimeout(() => {
      if (!calledRef.current) {
        calledRef.current = true;
        onDone?.();
      }
    }, duration);
    return () => clearTimeout(id);
  }, [duration, onDone]);

  const bootLines = [
    "LGSS :: initializing...",
    "scanning disks...",
    "mounting LGSSManagers volume...",
    "loading ServerSettings.ini schema...",
    "spinning up ranger...",
    "ready.",
  ];

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center overflow-hidden" style={{ background: "var(--bg)" }} data-testid="splash-screen">
      {/* Background grid */}
      <div className="absolute inset-0 grid-lines" />

      {/* Speed lines */}
      <div className="absolute inset-0">
        {[...Array(14)].map((_, i) => (
          <div key={i} className="speed-line" style={{ top: `${10 + i * 6}%`, animationDelay: `${i * 0.08}s` }} />
        ))}
      </div>

      {/* Ranger silhouette (animated) */}
      <div className="relative">
        <svg width="260" height="140" viewBox="0 0 260 140" className="ranger-svg">
          <defs>
            <linearGradient id="glow" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="var(--primary)" stopOpacity="0" />
              <stop offset="100%" stopColor="var(--primary)" stopOpacity="1" />
            </linearGradient>
          </defs>
          {/* speed glow trail */}
          <rect x="0" y="58" width="160" height="4" fill="url(#glow)" opacity="0.7">
            <animate attributeName="x" values="-80;0" dur="0.6s" repeatCount="indefinite" />
          </rect>
          {/* body (stylized Ranger vehicle) */}
          <g transform="translate(60,20)" stroke="var(--primary)" fill="var(--surface)" strokeWidth="2">
            <polygon points="0,60 18,30 90,25 130,35 150,55 150,72 0,72" strokeLinejoin="round" />
            <rect x="25" y="35" width="55" height="20" rx="2" />
            <rect x="95" y="38" width="35" height="15" rx="2" />
            <circle cx="28" cy="75" r="10" fill="var(--bg)" />
            <circle cx="28" cy="75" r="4" fill="var(--primary)" />
            <circle cx="118" cy="75" r="10" fill="var(--bg)" />
            <circle cx="118" cy="75" r="4" fill="var(--primary)" />
            {/* exhaust */}
            <polygon points="-8,55 -30,58 -30,66 -8,68" fill="var(--primary)" opacity="0.7">
              <animate attributeName="opacity" values="0.3;1;0.3" dur="0.4s" repeatCount="indefinite" />
            </polygon>
          </g>
        </svg>
      </div>

      {/* HUD */}
      <div className="absolute bottom-16 left-1/2 -translate-x-1/2 w-[520px] max-w-[85%]">
        <div className="flex items-center justify-between mb-3">
          <div className="font-mono text-sm tracking-[0.2em] text-primary-brand">LGSS MANAGERS</div>
          <div className="font-mono text-xs text-dim">v1.0.0 · {t("loading")}</div>
        </div>
        <div className="h-[2px] bg-surface-2 overflow-hidden rounded-sm">
          <div className="h-full bg-primary-brand" style={{ animation: `splash-bar ${duration}ms cubic-bezier(.2,.7,.3,1) forwards` }} />
        </div>
        <div className="mt-4 font-mono text-[11px] text-dim space-y-1 h-28 overflow-hidden">
          {bootLines.map((line, i) => (
            <div key={i} className="opacity-0 animate-bootline" style={{ animationDelay: `${150 + i * 320}ms` }}>
              <span className="text-primary-brand">{">"}</span> {line}
            </div>
          ))}
        </div>
      </div>

      <style>{`
        @keyframes splash-bar { from { width: 0; } to { width: 100%; } }
        @keyframes bootline-in { from { opacity: 0; transform: translateX(-8px); } to { opacity: 1; transform: translateX(0); } }
        .animate-bootline { animation: bootline-in 260ms ease-out both; animation-fill-mode: forwards; }
        .ranger-svg { filter: drop-shadow(0 0 20px var(--primary-soft)); }
        @keyframes ranger-bob {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-3px); }
        }
        .ranger-svg { animation: ranger-bob 0.5s ease-in-out infinite; }
        @keyframes speed-line-fly {
          from { transform: translateX(-20%); opacity: 0; }
          20% { opacity: 1; }
          to { transform: translateX(120vw); opacity: 0; }
        }
        .speed-line {
          position: absolute;
          height: 1px;
          width: 120px;
          background: linear-gradient(90deg, transparent, var(--primary), transparent);
          opacity: 0.4;
          animation: speed-line-fly 1.1s linear infinite;
        }
      `}</style>
    </div>
  );
};
