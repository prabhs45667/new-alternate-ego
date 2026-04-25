import { useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

interface FlipCardProps {
  icon: ReactNode;
  title: string;
  tagline: string;
  description: string;
  details: string[];
  accent: "primary" | "secondary" | "accent";
  image?: string;
}

const accentMap = {
  primary: "from-primary/30 to-primary-glow/10",
  secondary: "from-secondary/30 to-primary/10",
  accent: "from-accent/30 to-secondary/10",
};

const FlipCard = ({ icon, title, tagline, description, details, accent, image }: FlipCardProps) => {
  const [flipped, setFlipped] = useState(false);
  return (
    <button
      type="button"
      onClick={() => setFlipped((f) => !f)}
      className="perspective group h-80 w-full text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded-3xl"
      aria-label={`Flip card: ${title}`}
    >
      <div
        className={cn(
          "relative h-full w-full preserve-3d transition-transform duration-700 ease-out",
          flipped && "rotate-y-180"
        )}
      >
        {/* FRONT */}
        <div className={cn(
          "absolute inset-0 backface-hidden glass-strong rounded-3xl p-7 flex flex-col justify-between overflow-hidden grain",
          "bg-gradient-to-br", accentMap[accent]
        )}>
          {image && (
            <img
              src={image}
              alt=""
              className="absolute inset-0 h-full w-full object-cover opacity-15 group-hover:opacity-25 transition-opacity duration-500"
            />
          )}
          <div className="relative z-10 flex items-start justify-between">
            <div className="h-14 w-14 rounded-2xl glass flex items-center justify-center text-primary-glow text-2xl group-hover:scale-110 transition-transform">
              {icon}
            </div>
            <span className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">Tap to flip</span>
          </div>
          <div className="relative z-10 space-y-2">
            <p className="text-xs font-mono uppercase tracking-[0.2em] text-primary-glow">{tagline}</p>
            <h3 className="text-2xl font-display font-bold text-foreground">{title}</h3>
            <p className="text-sm text-muted-foreground line-clamp-2">{description}</p>
          </div>
        </div>

        {/* BACK */}
        <div className="absolute inset-0 backface-hidden rotate-y-180 glass-strong rounded-3xl p-7 flex flex-col justify-between overflow-hidden">
          <div className="absolute -top-20 -right-20 h-64 w-64 rounded-full bg-primary/30 blur-3xl" />
          <div className="absolute -bottom-20 -left-20 h-64 w-64 rounded-full bg-accent/30 blur-3xl" />
          <div className="relative z-10">
            <h3 className="text-xl font-display font-bold text-gradient mb-4">{title}</h3>
            <ul className="space-y-2.5">
              {details.map((d, i) => (
                <li key={i} className="flex gap-2 text-sm text-foreground/90">
                  <span className="text-primary-glow mt-0.5">▸</span>
                  <span>{d}</span>
                </li>
              ))}
            </ul>
          </div>
          <span className="relative z-10 text-[10px] font-mono uppercase tracking-widest text-muted-foreground">Tap to flip back</span>
        </div>
      </div>
    </button>
  );
};

export default FlipCard;
