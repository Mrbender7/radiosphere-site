import { cn } from "@/lib/utils";
import { useEffect, useMemo, useState } from "react";

interface AudioVisualizerProps {
  size?: "small" | "medium" | "large";
  active?: boolean;
  className?: string;
}

const sizeConfig = {
  small: { bars: 30, height: 32, gap: 2, barWidth: 6 },
  medium: { bars: 30, height: 48, gap: 2, barWidth: 6 },
  large: { bars: 30, height: 80, gap: 3, barWidth: 8 },
};

const barAnimations = [
  { duration: "0.45s", delay: "0s" },
  { duration: "0.55s", delay: "0.1s" },
  { duration: "0.4s", delay: "0.2s" },
  { duration: "0.6s", delay: "0.05s" },
  { duration: "0.5s", delay: "0.15s" },
  { duration: "0.65s", delay: "0.08s" },
  { duration: "0.42s", delay: "0.22s" },
  { duration: "0.58s", delay: "0.12s" },
  { duration: "0.48s", delay: "0.18s" },
];

export function AudioVisualizer({ size = "small", active = true, className }: AudioVisualizerProps) {
  const { bars, height, gap, barWidth } = sizeConfig[size];
  const [isMobile, setIsMobile] = useState(false);
  const visibleBars = isMobile ? 5 : bars;
  const totalWidth = visibleBars * barWidth + (visibleBars - 1) * gap;

  useEffect(() => {
    const query = window.matchMedia("(max-width: 639px)");
    const updateMobileState = () => setIsMobile(query.matches);

    updateMobileState();
    query.addEventListener("change", updateMobileState);

    return () => query.removeEventListener("change", updateMobileState);
  }, []);

  // Deterministic baseline so SSG HTML matches the first client render
  // byte-for-byte (no Math.random in render path → no React #418/#423).
  const baseAnimations = useMemo(
    () => Array.from({ length: visibleBars }, (_, i) => {
      const base = barAnimations[i % barAnimations.length];
      // Stable pseudo-variation based on index only.
      const minScale = (0.18 + ((i * 37) % 30) / 100).toFixed(2);
      return { duration: base.duration, delay: base.delay, minScale };
    }),
    [visibleBars]
  );

  // After mount, sprinkle real Math.random variance — this only runs on the
  // client, well after hydration, so it cannot cause a mismatch.
  const [instanceAnimations, setInstanceAnimations] = useState(baseAnimations);
  useEffect(() => {
    setInstanceAnimations(
      Array.from({ length: visibleBars }, (_, i) => {
        const base = barAnimations[i % barAnimations.length];
        const variance = Math.random() * 0.28 - 0.14;
        const duration = `${Math.max(0.28, parseFloat(base.duration) + variance).toFixed(2)}s`;
        const delay = `${(Math.random() * 0.36).toFixed(2)}s`;
        const minScale = (0.12 + Math.random() * 0.36).toFixed(2);
        return { duration, delay, minScale };
      })
    );
  }, [visibleBars]);

  return (
    <div className={cn("flex items-end justify-center", className)} style={{ height, width: totalWidth, gap }}>
      {Array.from({ length: visibleBars }).map((_, i) => {
        const anim = instanceAnimations[i] ?? baseAnimations[i];
        return (
        <span
          key={i}
          className="rounded-full transition-transform duration-200"
          style={{
            width: barWidth,
            height: "100%",
            background: "linear-gradient(to top, hsl(var(--primary)), hsl(var(--primary-glow)))",
            animation: active ? `equalizer-bar ${anim.duration} ease-in-out ${anim.delay} infinite alternate` : "none",
            opacity: active ? 1 : 0.55,
            transform: active ? undefined : "scaleY(0.12)",
            transformOrigin: "bottom",
            ["--bar-min-scale" as string]: anim.minScale,
          }}
        />
        );
      })}
      <style>{`
        @keyframes equalizer-bar {
          0% { transform: scaleY(var(--bar-min-scale)); }
          100% { transform: scaleY(1); }
        }
      `}</style>
    </div>
  );
}
