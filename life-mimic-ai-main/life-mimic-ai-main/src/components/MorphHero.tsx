import { useEffect, useState } from "react";
import manReal from "@/assets/man-real.jpg";
import manAvatar from "@/assets/man-avatar.jpg";
import womanReal from "@/assets/woman-real.jpg";
import womanAvatar from "@/assets/woman-avatar.jpg";

type Phase = "human" | "scan" | "avatar";

const sequence = [
  { real: manReal, avatar: manAvatar, label: "Aarav", accent: "from-cyan-400 via-primary-glow to-accent" },
  { real: womanReal, avatar: womanAvatar, label: "Priya", accent: "from-pink-400 via-accent to-primary-glow" },
];

const PHASE_DURATIONS: Record<Phase, number> = {
  human: 1800,
  scan: 1400,
  avatar: 2000,
};

const MorphHero = () => {
  const [idx, setIdx] = useState(0);
  const [phase, setPhase] = useState<Phase>("human");

  useEffect(() => {
    const t = setTimeout(() => {
      if (phase === "human") setPhase("scan");
      else if (phase === "scan") setPhase("avatar");
      else {
        setPhase("human");
        setIdx((i) => (i + 1) % sequence.length);
      }
    }, PHASE_DURATIONS[phase]);
    return () => clearTimeout(t);
  }, [phase, idx]);

  const current = sequence[idx];
  const showHuman = phase !== "avatar";
  const showAvatar = phase === "avatar";

  return (
    <div className="relative h-[480px] md:h-[600px] w-full">
      <div className={`absolute inset-0 rounded-[2rem] bg-gradient-to-br ${current.accent} blur-3xl opacity-50 transition-all duration-1000 animate-pulse-glow`} />

      <div className="relative h-full w-full glass-strong rounded-[2rem] overflow-hidden grain">
        {/* HUMAN PHOTO */}
        <img
          src={current.real}
          alt={`${current.label} - human portrait`}
          className={`absolute inset-0 h-full w-full object-cover transition-all duration-1000 ${
            showHuman ? "opacity-100 scale-100" : "opacity-0 scale-105"
          }`}
        />

        {/* CARTOON AVATAR */}
        <img
          src={current.avatar}
          alt={`${current.label} - AI cartoon avatar`}
          className={`absolute inset-0 h-full w-full object-cover transition-all duration-1000 ${
            showAvatar ? "opacity-100 scale-100" : "opacity-0 scale-110"
          }`}
        />

        {/* ROBOTIC SCAN OVERLAY */}
        <div className={`absolute inset-0 pointer-events-none transition-opacity duration-500 ${
          phase === "scan" ? "opacity-100" : "opacity-0"
        }`}>
          {/* HUD grid */}
          <div className="absolute inset-0" style={{
            backgroundImage: "linear-gradient(hsl(var(--primary-glow)/.18) 1px, transparent 1px), linear-gradient(90deg, hsl(var(--primary-glow)/.18) 1px, transparent 1px)",
            backgroundSize: "32px 32px",
          }} />
          {/* Scan line sweeping top to bottom */}
          <div className="absolute inset-x-0 h-1 bg-primary-glow shadow-[0_0_40px_12px_hsl(var(--primary-glow)/0.9)] animate-[scan_1.4s_ease-in-out_forwards]" />
          {/* Corner brackets */}
          {[
            "top-4 left-4 border-t-2 border-l-2",
            "top-4 right-4 border-t-2 border-r-2",
            "bottom-4 left-4 border-b-2 border-l-2",
            "bottom-4 right-4 border-b-2 border-r-2",
          ].map((c, i) => (
            <div key={i} className={`absolute h-10 w-10 border-primary-glow ${c}`} />
          ))}
          {/* HUD text */}
          <div className="absolute top-6 left-1/2 -translate-x-1/2 font-mono text-[10px] uppercase tracking-[0.4em] text-primary-glow animate-pulse">
            ◉ Scanning · Synthesizing
          </div>
          <div className="absolute bottom-20 left-1/2 -translate-x-1/2 font-mono text-[10px] text-primary-glow/80 animate-pulse">
            [ neural_imprint ▸ {current.label.toLowerCase()}.twin ]
          </div>
        </div>

        {/* Particles overlay during scan/avatar */}
        <div className={`absolute inset-0 pointer-events-none transition-opacity duration-700 ${
          phase !== "human" ? "opacity-60" : "opacity-0"
        }`}
          style={{
            backgroundImage: "radial-gradient(circle at 20% 30%, hsl(var(--primary-glow)/.4) 0, transparent 2px), radial-gradient(circle at 70% 60%, hsl(var(--accent)/.4) 0, transparent 2px), radial-gradient(circle at 40% 80%, hsl(var(--secondary)/.4) 0, transparent 2px)",
            backgroundSize: "120px 120px, 90px 90px, 150px 150px",
          }}
        />

        {/* Bottom label */}
        <div className="absolute bottom-0 inset-x-0 p-6 bg-gradient-to-t from-background/95 via-background/50 to-transparent">
          <p className="font-mono text-xs uppercase tracking-[0.3em] text-primary-glow mb-1">
            {phase === "human" && "◉ Live Capture"}
            {phase === "scan" && "◉ AI Synthesizing…"}
            {phase === "avatar" && "◉ Twin Online"}
          </p>
          <p className="font-display text-xl md:text-2xl text-foreground">
            {phase === "avatar" ? `${current.label} → Digital Twin` : `${current.label} → Human`}
          </p>
        </div>

        {/* Indicator dots */}
        <div className="absolute top-6 left-6 flex gap-2">
          {sequence.map((_, i) => (
            <span key={i} className={`h-1.5 rounded-full transition-all ${i === idx ? "w-8 bg-primary-glow" : "w-1.5 bg-white/30"}`} />
          ))}
        </div>
      </div>

      <style>{`
        @keyframes scan {
          0% { top: 0; opacity: 0; }
          15% { opacity: 1; }
          85% { opacity: 1; }
          100% { top: 100%; opacity: 0; }
        }
      `}</style>
    </div>
  );
};

export default MorphHero;
