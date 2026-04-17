import React, { useEffect, useRef } from "react";
import { useI18n } from "../providers/I18nProvider";

const RANGER_IMG = "https://customer-assets.emergentagent.com/job_scum-admin-panel-1/artifacts/7qsj0kqv_image.png";

// Realistic SCUM Ranger acceleration splash.
// - Road scrolls beneath
// - Vehicle bounces/shakes on tires
// - Speed lines accelerate
// - Motion blur trail
// - Dust/exhaust particles
// - Stage-gated boot lines
export const SplashScreen = ({ onDone, duration = 3200 }) => {
  const { t } = useI18n();
  const calledRef = useRef(false);

  useEffect(() => {
    const id = setTimeout(() => {
      if (!calledRef.current) { calledRef.current = true; onDone?.(); }
    }, duration);
    return () => clearTimeout(id);
  }, [duration, onDone]);

  const bootLines = [
    "[ LGSS ] :: boot sequence initiated",
    "mounting disks · scanning LGSSManagers volume",
    "parsing ServerSettings.ini · EconomyOverride.json",
    "loading 325 parameters · 28 traders · 40 input bindings",
    "igniting ranger · pressing gas",
    "ready :: all systems nominal",
  ];

  return (
    <div className="fixed inset-0 z-[100] overflow-hidden" data-testid="splash-screen" style={{ background: "radial-gradient(ellipse at bottom, #16110D 0%, #0A0806 70%)" }}>
      {/* Sky vignette */}
      <div className="absolute inset-x-0 top-0 h-1/3" style={{ background: "linear-gradient(to bottom, rgba(60,50,40,0.4), transparent)" }} />

      {/* Animated road with perspective */}
      <div className="absolute inset-x-0 bottom-0 h-[55%] overflow-hidden" style={{ perspective: "800px" }}>
        <div className="road-surface">
          <div className="road-lane" />
          <div className="road-lane road-lane-2" />
        </div>
      </div>

      {/* Horizontal speed lines */}
      <div className="absolute inset-0 pointer-events-none">
        {Array.from({ length: 22 }).map((_, i) => (
          <div key={i} className="speed-streak" style={{
            top: `${10 + (i * 73) % 80}%`,
            width: `${80 + Math.random() * 240}px`,
            animationDelay: `${(i * 0.09) % 1.4}s`,
            animationDuration: `${0.7 + Math.random() * 0.6}s`,
            opacity: 0.18 + Math.random() * 0.35,
          }} />
        ))}
      </div>

      {/* Dust particles */}
      <div className="absolute inset-x-0 bottom-[22%] h-[20%] pointer-events-none">
        {Array.from({ length: 14 }).map((_, i) => (
          <span key={i} className="dust" style={{
            left: `${35 + (i * 17) % 45}%`,
            width: `${4 + Math.random() * 7}px`,
            height: `${4 + Math.random() * 7}px`,
            animationDelay: `${(i * 0.11) % 1}s`,
            animationDuration: `${0.9 + Math.random() * 0.5}s`,
          }} />
        ))}
      </div>

      {/* Ranger vehicle */}
      <div className="ranger-wrap">
        {/* Motion blur trail behind vehicle */}
        <div className="motion-trail" />
        <img src={RANGER_IMG} alt="SCUM Ranger" className="ranger-img" draggable={false} />
        <div className="ranger-shadow" />
      </div>

      {/* SCUM-style grunge brand corner */}
      <div className="absolute top-6 left-8">
        <div className="brand-mark">
          <div className="brand-top">LEGENDARY GAMING</div>
          <div className="brand-big">SCUM</div>
          <div className="brand-sub">SERVER MANAGER · v1.0.0</div>
        </div>
      </div>

      {/* HUD at bottom */}
      <div className="absolute bottom-10 left-1/2 -translate-x-1/2 w-[620px] max-w-[90%]">
        <div className="flex items-center justify-between mb-2 font-mono text-[11px] tracking-[0.18em] uppercase">
          <span style={{ color: "#E63946" }}>SYSTEM BOOT</span>
          <span className="text-white/40">{t("loading")}</span>
        </div>
        <div className="h-[3px] bg-white/10 overflow-hidden rounded-sm">
          <div className="h-full" style={{ background: "linear-gradient(90deg, #E63946, #F59E0B)", animation: `splash-bar ${duration}ms cubic-bezier(.25,.8,.25,1) forwards` }} />
        </div>
        <div className="mt-4 font-mono text-[11px] leading-relaxed text-white/60 h-24 overflow-hidden">
          {bootLines.map((line, i) => (
            <div key={i} className="boot-line" style={{ animationDelay: `${150 + i * (duration - 400) / bootLines.length}ms` }}>
              <span style={{ color: "#E63946" }}>▸</span> {line}
            </div>
          ))}
        </div>
      </div>

      <style>{`
        @keyframes splash-bar { from { width: 0; } to { width: 100%; } }
        @keyframes boot-in { from { opacity: 0; transform: translateX(-6px); } to { opacity: 1; transform: translateX(0); } }
        .boot-line { opacity: 0; animation: boot-in 300ms ease-out forwards; }

        /* Brand */
        .brand-mark { color: #F5E9E3; }
        .brand-top { font-family: 'JetBrains Mono', monospace; font-size: 10px; letter-spacing: 0.35em; color: rgba(245,233,227,0.55); }
        .brand-big { font-family: 'IBM Plex Sans', sans-serif; font-weight: 900; font-size: 44px; line-height: 1; letter-spacing: 0.02em; color: #F5E9E3; text-shadow: 2px 2px 0 #E63946; margin-top: 4px; }
        .brand-sub { font-family: 'JetBrains Mono', monospace; font-size: 10px; letter-spacing: 0.28em; color: rgba(245,233,227,0.55); margin-top: 6px; }

        /* Road scrolling */
        .road-surface {
          position: absolute; inset: 0;
          background: repeating-linear-gradient(to bottom, rgba(30,25,20,0.95) 0px, rgba(45,38,30,0.95) 4px, rgba(30,25,20,0.95) 8px);
          transform: rotateX(58deg); transform-origin: center bottom;
        }
        .road-lane, .road-lane-2 {
          position: absolute; left: 50%; top: 0; width: 8px; height: 40px;
          background: rgba(255,240,200,0.7);
          animation: lane-fly 0.22s linear infinite;
          border-radius: 2px;
        }
        .road-lane-2 { top: 80px; animation-delay: 0.11s; }
        @keyframes lane-fly { from { transform: translate(-50%, 0) scale(1); opacity: 0; } 20% { opacity: 1; } to { transform: translate(-50%, 600px) scale(2.6); opacity: 0; } }

        /* Ranger */
        .ranger-wrap {
          position: absolute; left: 50%; top: 47%;
          transform: translate(-50%, -50%);
          animation: ranger-rumble 0.08s linear infinite alternate, ranger-zoom-in 0.8s cubic-bezier(.15,.7,.3,1) both;
        }
        @keyframes ranger-rumble {
          from { transform: translate(-50%, -50%) translateY(0) rotate(-0.3deg); }
          to { transform: translate(-50%, calc(-50% - 2px)) translateY(0) rotate(0.3deg); }
        }
        @keyframes ranger-zoom-in {
          from { opacity: 0; filter: blur(6px); transform: translate(-50%, -50%) scale(0.75); }
          to { opacity: 1; filter: blur(0); transform: translate(-50%, -50%) scale(1); }
        }
        .ranger-img { width: 560px; max-width: 58vw; height: auto; display: block; filter: drop-shadow(0 24px 30px rgba(0,0,0,0.7)) drop-shadow(0 0 30px rgba(230,57,70,0.2)); }
        .ranger-shadow { position: absolute; left: 50%; bottom: -8px; transform: translateX(-50%); width: 70%; height: 18px; background: radial-gradient(ellipse at center, rgba(0,0,0,0.7) 0%, transparent 70%); filter: blur(8px); }
        .motion-trail {
          position: absolute; right: calc(100% - 40px); top: 50%; transform: translateY(-50%);
          width: 260px; height: 140px;
          background: radial-gradient(ellipse at right center, rgba(230,57,70,0.14), transparent 65%);
          filter: blur(12px);
          animation: trail-pulse 0.22s ease-in-out infinite alternate;
        }
        @keyframes trail-pulse { from { opacity: 0.55; width: 240px; } to { opacity: 0.9; width: 280px; } }

        /* Speed streaks */
        .speed-streak {
          position: absolute; left: 100%;
          height: 1px;
          background: linear-gradient(90deg, transparent, rgba(255,230,200,0.7), transparent);
          animation: streak-fly linear infinite;
          pointer-events: none;
        }
        @keyframes streak-fly {
          from { transform: translateX(0); }
          to { transform: translateX(calc(-110vw - 200px)); }
        }

        /* Dust */
        .dust {
          position: absolute; bottom: 12%;
          background: radial-gradient(circle, rgba(180,160,130,0.5) 0%, transparent 70%);
          border-radius: 50%;
          animation: dust-puff ease-out infinite;
          filter: blur(1px);
        }
        @keyframes dust-puff {
          0% { transform: translate(0, 0) scale(0.6); opacity: 0.8; }
          100% { transform: translate(-200px, -30px) scale(2.4); opacity: 0; }
        }
      `}</style>
    </div>
  );
};
