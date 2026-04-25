import { lazy, Suspense } from "react";
import logo from "@/assets/logo.png";
import bg from "@/assets/bg-landing.jpg";
import brain from "@/assets/ai-brain.png";
import manTwin from "@/assets/indian-man-twin.jpg";
import womanTwin from "@/assets/indian-woman-twin.jpg";
import boyAi from "@/assets/boy-ai.jpg";
const ThreeBackground = lazy(() => import("@/components/ThreeBackground"));
import MorphHero from "@/components/MorphHero";
import FlipCard from "@/components/FlipCard";
import { Brain, Mic, Sparkles, ShieldCheck, ArrowRight, Zap, Eye, Cpu, Lock } from "lucide-react";

const pillars = [
  {
    icon: <Brain />,
    tagline: "Pillar 01",
    title: "RAG-Powered Personality",
    description: "A retrieval brain that thinks, recalls and replies in your voice — grounded in your own data.",
    details: [
      "Topic-based chunking + 768-dim embeddings",
      "Pure-Python cosine similarity vector store",
      "Local LLM generates first-person replies",
      "Every answer cites the source memory",
    ],
    accent: "primary" as const,
    image: brain,
  },
  {
    icon: <Mic />,
    tagline: "Pillar 02",
    title: "Voice Cloning Engine",
    description: "Speak once. Your twin learns the rhythm, accent and emotion of your voice — forever.",
    details: [
      "5-question deep voice interview",
      "Coqui XTTS v2 clones tone & cadence",
      "faster-whisper speech-to-text on CPU",
      "Edge-TTS fallback for instant playback",
    ],
    accent: "secondary" as const,
    image: womanTwin,
  },
  {
    icon: <Eye />,
    tagline: "Pillar 03",
    title: "Emotion-Aware Avatar",
    description: "A living face that mirrors your moods — neutral, happy, sad, angry — synced in real time.",
    details: [
      "4 emotion captures via face-api.js",
      "Real-time browser expression validation",
      "AI-generated mood-synced cartoon avatars",
      "Live mood detection on every reply",
    ],
    accent: "accent" as const,
    image: manTwin,
  },
  {
    icon: <Cpu />,
    tagline: "Pillar 04",
    title: "Social MCP Automation",
    description: "Slash-command your way through the internet — your twin posts, scrapes and acts on your behalf.",
    details: [
      "/linkedin and /twitter slash commands",
      "Public profile scraping with BeautifulSoup",
      "Data exports parsed into long-term memory",
      "Privacy-first auto-deletion of raw files",
    ],
    accent: "primary" as const,
    image: boyAi,
  },
];

const stack = [
  "FastAPI", "Next.js 14", "Ollama", "llama3.1:8b", "nomic-embed-text",
  "Coqui XTTS v2", "faster-whisper", "face-api.js", "TailwindCSS",
  "SQLite", "Fernet Encryption", "BeautifulSoup", "TensorFlow.js",
];

const phases = [
  { n: "01", t: "Imprint", d: "Drop your name, socials and data export. We index every byte into a private vector memory." },
  { n: "02", t: "Perceive", d: "Capture four emotion frames. Computer vision validates each expression in your browser." },
  { n: "03", t: "Embody", d: "Answer five soul-deep questions. Your voice is cloned, your story becomes structure." },
  { n: "04", t: "Converge", d: "Meet your twin. It thinks with RAG, speaks in your voice, and reacts with your face." },
];

const Index = () => {
  return (
    <div className="relative min-h-screen overflow-x-hidden">
      {/* Fixed background image with overlay - whole site */}
      <div className="fixed inset-0 -z-20">
        <img src={bg} alt="Mountain lake landscape background" className="h-full w-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-b from-background/70 via-background/65 to-background/85" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,hsl(270_95%_25%/0.35),transparent_60%)]" />
      </div>
      <Suspense fallback={null}>
        <ThreeBackground />
      </Suspense>

      {/* NAV */}
      <nav className="sticky top-0 z-50 w-full">
        <div className="container mx-auto px-6 py-4">
          <div className="glass rounded-2xl px-5 py-3 flex items-center justify-between">
            <a href="#top" className="flex items-center gap-3 group">
              <img src={logo} alt="Alternate Ego logo" className="h-10 w-10 rounded-xl group-hover:rotate-12 transition-transform" />
              <div className="leading-tight">
                <p className="font-display font-bold text-lg text-foreground">Alternate Ego</p>
                <p className="font-mono text-[10px] uppercase tracking-[0.25em] text-primary-glow">Your Digital Twin</p>
              </div>
            </a>
            <div className="hidden md:flex items-center gap-7 text-sm font-medium text-muted-foreground">
              <a href="#definition" className="hover:text-foreground transition">What</a>
              <a href="#pillars" className="hover:text-foreground transition">Pillars</a>
              <a href="#flow" className="hover:text-foreground transition">Flow</a>
              <a href="#stack" className="hover:text-foreground transition">Stack</a>
            </div>
            <a href="http://localhost:3000" className="glass-strong rounded-xl px-4 py-2 text-sm font-semibold text-foreground hover:scale-105 transition-transform flex items-center gap-2">
              Launch <ArrowRight className="h-4 w-4" />
            </a>
          </div>
        </div>
      </nav>

      <main id="top" className="relative">
        {/* HERO */}
        <section className="container mx-auto px-6 pt-12 pb-24">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <div className="space-y-8 animate-fade-in-up">
              <span className="inline-flex items-center gap-2 glass rounded-full px-4 py-2 text-xs font-mono uppercase tracking-[0.25em] text-primary-glow">
                <Sparkles className="h-3 w-3" /> Your AI-powered digital twin
              </span>
              <h1 className="font-display font-extrabold text-5xl md:text-7xl leading-[1.05] tracking-tight">
                Meet the <span className="text-gradient">version of you</span> that never sleeps.
              </h1>
              <p className="text-lg text-muted-foreground max-w-xl leading-relaxed">
                Alternate Ego replicates your voice, memories, mannerisms and mood into a hyper-real digital twin —
                trained on your story, grounded in your data, and entirely yours.
              </p>
              <div className="flex flex-wrap gap-4">
                <a href="http://localhost:3000" className="group relative inline-flex items-center gap-2 rounded-2xl bg-gradient-to-r from-primary via-accent to-secondary px-7 py-4 font-semibold text-primary-foreground glow hover:scale-[1.03] transition-transform">
                  <Zap className="h-4 w-4" /> Build my twin
                  <span className="absolute inset-0 rounded-2xl bg-white/20 opacity-0 group-hover:opacity-100 transition-opacity" />
                </a>
                <a href="#pillars" className="glass-strong rounded-2xl px-7 py-4 font-semibold text-foreground hover:bg-white/10 transition-colors">
                  Explore pillars
                </a>
              </div>
              <div className="flex gap-8 pt-4">
                {[
                  { k: "100%", v: "Local & private" },
                  { k: "5", v: "Voice questions" },
                  { k: "4", v: "Core pillars" },
                ].map((s) => (
                  <div key={s.v}>
                    <p className="font-display text-3xl font-bold text-gradient">{s.k}</p>
                    <p className="text-xs text-muted-foreground uppercase tracking-wider mt-1">{s.v}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="animate-scale-in">
              <MorphHero />
            </div>
          </div>
        </section>

        {/* MARQUEE */}
        <section className="border-y border-white/5 py-6 overflow-hidden glass">
          <div className="flex gap-12 animate-marquee whitespace-nowrap font-mono text-sm uppercase tracking-[0.3em] text-muted-foreground">
            {[...stack, ...stack].map((s, i) => (
              <span key={i} className="flex items-center gap-12">
                {s} <span className="text-primary-glow">◆</span>
              </span>
            ))}
          </div>
        </section>

        {/* DEFINITION */}
        <section id="definition" className="container mx-auto px-6 py-24">
          <div className="max-w-4xl mx-auto text-center mb-16 animate-fade-in-up">
            <p className="font-mono text-xs uppercase tracking-[0.3em] text-primary-glow mb-4">Definition</p>
            <h2 className="font-display text-4xl md:text-6xl font-bold mb-6">
              What <span className="text-gradient">is</span> Alternate Ego?
            </h2>
            <p className="text-lg text-muted-foreground leading-relaxed">
              A hyper-realistic digital twin platform that fuses retrieval-augmented memory, voice cloning and computer
              vision into one coherent persona. It listens like you, remembers like you, sounds like you and reacts like
              you — built on a fully local stack so your identity stays where it belongs: with you.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-6">
            {[
              { icon: <Brain className="h-6 w-6" />, t: "Thinks like you", d: "RAG retrieval over your own memories, stories and writings — every reply traces back to a source." },
              { icon: <Mic className="h-6 w-6" />, t: "Sounds like you", d: "A cloned voice trained on five deep interview answers — same tone, same pauses, same warmth." },
              { icon: <ShieldCheck className="h-6 w-6" />, t: "Stays with you", d: "Encrypted at rest, processed locally, raw uploads auto-deleted. Only embeddings remain." },
            ].map((c, i) => (
              <div key={i} className="glass-strong rounded-3xl p-7 hover:-translate-y-2 transition-transform duration-500 grain relative overflow-hidden">
                <div className="h-12 w-12 rounded-2xl bg-gradient-to-br from-primary to-accent flex items-center justify-center text-primary-foreground mb-5">{c.icon}</div>
                <h3 className="font-display text-xl font-bold mb-2">{c.t}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{c.d}</p>
              </div>
            ))}
          </div>
        </section>

        {/* OBJECTIVE */}
        <section className="container mx-auto px-6 py-24">
          <div className="glass-strong rounded-[2.5rem] p-10 md:p-16 grain relative overflow-hidden">
            <div className="absolute -top-40 -right-40 h-96 w-96 rounded-full bg-primary/30 blur-3xl" />
            <div className="absolute -bottom-40 -left-40 h-96 w-96 rounded-full bg-accent/20 blur-3xl" />
            <div className="relative grid lg:grid-cols-2 gap-12 items-center">
              <div>
                <p className="font-mono text-xs uppercase tracking-[0.3em] text-primary-glow mb-4">Our Objective</p>
                <h2 className="font-display text-4xl md:text-5xl font-bold mb-6 leading-tight">
                  Build a digital twin that is <span className="text-gradient">truly yours</span>.
                </h2>
                <ul className="space-y-4 text-foreground/90">
                  {[
                    "Create an AI clone from your name, social signal, photos and voice.",
                    "Run the entire pipeline locally — no data ever leaves the device.",
                    "Preserve personality, emotion and mannerism across every interaction.",
                    "Put encryption, auto-deletion and full data control in the user's hands.",
                  ].map((line, i) => (
                    <li key={i} className="flex gap-3">
                      <span className="mt-1.5 h-2 w-2 rounded-full bg-gradient-to-r from-primary to-accent shrink-0" />
                      <span>{line}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <img src={brain} alt="AI neural brain" loading="lazy" className="w-full max-w-md mx-auto animate-float drop-shadow-[0_0_60px_hsl(var(--primary)/0.5)]" />
            </div>
          </div>
        </section>

        {/* PILLARS - flip cards */}
        <section id="pillars" className="container mx-auto px-6 py-24">
          <div className="text-center mb-14">
            <p className="font-mono text-xs uppercase tracking-[0.3em] text-primary-glow mb-4">The Four Pillars</p>
            <h2 className="font-display text-4xl md:text-6xl font-bold mb-4">
              Tap to <span className="text-gradient">unfold</span> each pillar
            </h2>
            <p className="text-muted-foreground max-w-2xl mx-auto">
              Four engines, one consciousness. Click any card to flip it and see what powers your twin underneath.
            </p>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {pillars.map((p) => <FlipCard key={p.title} {...p} />)}
          </div>
        </section>

        {/* SPECIAL FEATURES */}
        <section className="container mx-auto px-6 py-24">
          <div className="text-center mb-14">
            <p className="font-mono text-xs uppercase tracking-[0.3em] text-primary-glow mb-4">Special Features</p>
            <h2 className="font-display text-4xl md:text-6xl font-bold">
              What makes it <span className="text-gradient">different</span>
            </h2>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[
              { icon: <Brain />, t: "Topic-aware Chunking", d: "Splits your data by meaning — not by character count — so the twin understands context." },
              { icon: <Sparkles />, t: "Source Citations", d: "Every reply ships with a 📚 citation trail back to the original memory chunk." },
              { icon: <Mic />, t: "9-Question Soul Interview", d: "Background, values, stories, goals, advice — captured as RAG-ready transcripts." },
              { icon: <Eye />, t: "In-Browser CV Validation", d: "face-api.js verifies each emotion frame before it ever reaches the server." },
              { icon: <Cpu />, t: "Slash-Command Layer", d: "/linkedin and /twitter commands let your twin act, not just talk." },
              { icon: <Lock />, t: "Auto-Delete Pipeline", d: "Raw uploads are encrypted, parsed, then wiped. Only vectors live on." },
            ].map((f, i) => (
              <div key={i} className="glass rounded-3xl p-6 hover:bg-white/5 hover:scale-[1.02] transition-all duration-300 group">
                <div className="h-11 w-11 rounded-xl bg-gradient-to-br from-primary/40 to-accent/40 flex items-center justify-center text-primary-glow mb-4 group-hover:rotate-6 transition-transform">{f.icon}</div>
                <h3 className="font-display text-lg font-bold mb-2">{f.t}</h3>
                <p className="text-sm text-muted-foreground">{f.d}</p>
              </div>
            ))}
          </div>
        </section>

        {/* FLOW */}
        <section id="flow" className="container mx-auto px-6 py-24">
          <div className="text-center mb-14">
            <p className="font-mono text-xs uppercase tracking-[0.3em] text-primary-glow mb-4">User Flow</p>
            <h2 className="font-display text-4xl md:text-6xl font-bold">
              From human to <span className="text-gradient">hyper-twin</span>
            </h2>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-5">
            {phases.map((p, i) => (
              <div key={p.n} className="glass-strong rounded-3xl p-7 relative overflow-hidden hover:-translate-y-2 transition-transform duration-500">
                <div className="absolute -top-6 -right-6 font-display text-7xl font-extrabold text-white/5">{p.n}</div>
                <p className="font-mono text-xs text-primary-glow mb-3">STEP {p.n}</p>
                <h3 className="font-display text-2xl font-bold mb-3">{p.t}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{p.d}</p>
                {i < phases.length - 1 && (
                  <ArrowRight className="hidden lg:block absolute -right-3 top-1/2 -translate-y-1/2 h-5 w-5 text-primary-glow" />
                )}
              </div>
            ))}
          </div>
        </section>

        {/* STACK */}
        <section id="stack" className="container mx-auto px-6 py-24">
          <div className="glass-strong rounded-[2.5rem] p-10 md:p-14 grain relative overflow-hidden">
            <div className="text-center mb-10">
              <p className="font-mono text-xs uppercase tracking-[0.3em] text-primary-glow mb-4">Tech Stack</p>
              <h2 className="font-display text-4xl md:text-5xl font-bold">Built on a <span className="text-gradient">local-first</span> stack</h2>
            </div>
            <div className="flex flex-wrap justify-center gap-3">
              {stack.map((s) => (
                <span key={s} className="glass rounded-full px-5 py-2.5 font-mono text-sm text-foreground/90 hover:bg-primary/20 hover:scale-110 transition-all cursor-default">
                  {s}
                </span>
              ))}
            </div>
          </div>
        </section>

        {/* CTA */}
        <section id="cta" className="container mx-auto px-6 py-24">
          <div className="glass-strong rounded-[2.5rem] p-12 md:p-20 text-center relative overflow-hidden grain">
            <div className="absolute inset-0 bg-gradient-to-br from-primary/20 via-transparent to-accent/20" />
            <div className="relative">
              <h2 className="font-display text-4xl md:text-6xl font-bold mb-6">
                Ready to meet <span className="text-gradient">your other self?</span>
              </h2>
              <p className="text-lg text-muted-foreground max-w-2xl mx-auto mb-10">
                Spin up your twin in minutes. Everything runs locally — your data never leaves your machine.
              </p>
              <a href="http://localhost:3000" className="inline-flex items-center gap-3 rounded-2xl bg-gradient-to-r from-primary via-accent to-secondary px-10 py-5 font-display font-bold text-lg text-primary-foreground glow hover:scale-105 transition-transform">
                Begin imprint <ArrowRight className="h-5 w-5" />
              </a>
            </div>
          </div>
        </section>

        {/* FOOTER */}
        <footer className="container mx-auto px-6 py-10">
          <div className="glass rounded-2xl px-6 py-5 flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <img src={logo} alt="" className="h-8 w-8 rounded-lg" />
              <p className="font-mono text-xs uppercase tracking-[0.25em] text-muted-foreground">
                Alternate Ego · Local-first by design
              </p>
            </div>
            <p className="text-xs text-muted-foreground">Encrypted. Private. Yours.</p>
          </div>
        </footer>
      </main>
    </div>
  );
};

export default Index;
