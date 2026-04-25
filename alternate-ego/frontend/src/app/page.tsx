"use client";

import { useRouter } from "next/navigation";

export default function LandingPage() {
  const router = useRouter();

  const handleContinue = () => {
    router.push("/upload");
  };

  return (
    <div className="landing-wrapper">
      {/* ── HERO VIDEO — full screen, click to go to /upload ── */}
      <section className="hero-section" id="hero" onClick={handleContinue}>
        <video
          className="hero-video"
          src="/hero-video.mp4"
          autoPlay
          loop
          muted
          playsInline
        />
        {/* Click hint at bottom */}
        <div className="click-hint">
          <div className="click-hint-pulse" />
          <span>Click anywhere to continue</span>
        </div>
      </section>
    </div>
  );
}
