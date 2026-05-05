import { useTheme } from "../theme";
import { isMobile } from "../utils/platform";
import { WorldMap } from "./WorldMap";
import bgWorldmap from "../assets/bg-worldmap.png";
import bgNeon from "../assets/bg-neon.png";

// Source PNGs are 1280×720 (neon) and 1488×704 (worldmap) — ~720p.
// On a typical Android phone (e.g. 1080×2400 logical pixels at DPR ~2.75)
// `object-cover` upscales these ~4× in each dimension which surfaces hard
// blocky aliasing ("мыльная пиксельная" was the user's exact complaint on
// 0.3.4-android). Until we ship higher-resolution sources, we apply a
// Gaussian blur on mobile so the upscaling artefacts dissolve into a
// soft ambient wash that matches the desktop intent. We also pin
// `image-rendering` to `auto` to override any platform-default that
// might fall back to nearest-neighbour upscaling on Android WebView.
const MOBILE_BG_FILTER =
  "blur(6px) saturate(1.08) brightness(1.02)" as const;

export function AppBackground() {
  const { background } = useTheme();

  if (background === "minimal") {
    return null;
  }

  if (background === "worldmap") {
    const onMobile = isMobile();
    return (
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <img
          src={bgWorldmap}
          alt=""
          aria-hidden
          draggable={false}
          className="w-full h-full object-cover select-none opacity-[0.65]"
          style={{
            imageRendering: "auto",
            filter: onMobile ? MOBILE_BG_FILTER : undefined,
            // The blur sweeps the visible content inward by ~6px on each
            // side, so we counter-scale the image slightly so the edges
            // don't fade to background colour mid-screen on mobile.
            transform: onMobile ? "scale(1.06)" : undefined,
            transformOrigin: "center",
          }}
        />
        <div className="absolute inset-0 bg-gradient-to-b from-ink-950/25 via-transparent to-ink-950/55" />
        <div
          className="absolute inset-0"
          style={{
            background:
              "radial-gradient(circle at 50% 38%, rgba(var(--accent-rgb), 0.10), transparent 55%)",
          }}
        />
      </div>
    );
  }

  if (background === "neon") {
    const onMobile = isMobile();
    return (
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <img
          src={bgNeon}
          alt=""
          aria-hidden
          draggable={false}
          className="w-full h-full object-cover select-none opacity-[0.85]"
          style={{
            imageRendering: "auto",
            filter: onMobile ? MOBILE_BG_FILTER : undefined,
            transform: onMobile ? "scale(1.06)" : undefined,
            transformOrigin: "center",
          }}
        />
        <div className="absolute inset-0 bg-gradient-to-b from-ink-950/15 via-transparent to-ink-950/55" />
      </div>
    );
  }

  if (background === "aurora") {
    return (
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div
          className="absolute -top-40 -left-32 w-[640px] h-[640px] rounded-full blur-[140px] aurora-drift-a"
          style={{
            background:
              "radial-gradient(circle, rgba(var(--accent-rgb), 0.40), transparent 65%)",
          }}
        />
        <div
          className="absolute top-1/4 -right-40 w-[560px] h-[560px] rounded-full blur-[140px] aurora-drift-b"
          style={{
            background:
              "radial-gradient(circle, rgba(236, 72, 153, 0.28), transparent 65%)",
          }}
        />
        <div
          className="absolute -bottom-40 left-1/4 w-[700px] h-[700px] rounded-full blur-[160px] aurora-drift-c"
          style={{
            background:
              "radial-gradient(circle, rgba(16, 185, 129, 0.22), transparent 65%)",
          }}
        />
      </div>
    );
  }

  if (background === "mesh") {
    return (
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div
          className="absolute inset-0"
          style={{
            background:
              "radial-gradient(at 20% 18%, rgba(139, 92, 246, 0.32), transparent 45%), radial-gradient(at 82% 28%, rgba(236, 72, 153, 0.22), transparent 50%), radial-gradient(at 30% 88%, rgba(16, 185, 129, 0.18), transparent 55%), radial-gradient(at 88% 80%, rgba(56, 189, 248, 0.18), transparent 55%)",
          }}
        />
        <div
          className="absolute inset-0 opacity-[0.35]"
          style={{
            backgroundImage:
              "linear-gradient(rgba(255,255,255,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.05) 1px, transparent 1px)",
            backgroundSize: "48px 48px",
          }}
        />
      </div>
    );
  }

  if (background === "cosmos") {
    return (
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div
          className="absolute inset-0"
          style={{
            backgroundImage:
              "radial-gradient(circle at 50% 50%, rgba(139,92,246,0.35), transparent 55%), radial-gradient(ellipse at 20% 80%, rgba(56,189,248,0.18), transparent 60%), radial-gradient(ellipse at 80% 20%, rgba(236,72,153,0.18), transparent 60%)",
          }}
        />
        <div
          className="absolute inset-0"
          style={{
            backgroundImage:
              "radial-gradient(rgba(255,255,255,0.5) 0.8px, transparent 1px), radial-gradient(rgba(196,181,253,0.4) 0.8px, transparent 1px), radial-gradient(rgba(255,255,255,0.3) 0.6px, transparent 1px)",
            backgroundSize: "120px 120px, 200px 200px, 80px 80px",
            backgroundPosition: "0 0, 60px 90px, 30px 50px",
            opacity: 0.85,
          }}
        />
      </div>
    );
  }

  return (
    <>
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <WorldMap className="w-full h-full" />
      </div>
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -top-40 -left-32 w-[520px] h-[520px] rounded-full bg-[rgba(var(--accent-rgb),0.20)] blur-[120px]" />
        <div className="absolute top-1/3 -right-40 w-[480px] h-[480px] rounded-full bg-[rgba(var(--accent-rgb),0.15)] blur-[120px]" />
        <div className="absolute -bottom-40 left-1/3 w-[600px] h-[600px] rounded-full bg-emerald-600/10 blur-[140px]" />
      </div>
    </>
  );
}

export function BackgroundPreview({
  variant,
  className = "",
}: {
  variant: import("../theme").BackgroundKey;
  className?: string;
}) {
  const tileBase = {
    backgroundColor: "#07060d",
    boxShadow:
      "inset 0 0 0 1px rgba(255,255,255,0.05), inset 0 1px 0 rgba(255,255,255,0.06)",
  } as const;
  if (variant === "worldmap") {
    return (
      <div
        className={`overflow-hidden ${className}`}
        style={tileBase}
      >
        <img
          src={bgWorldmap}
          alt=""
          aria-hidden
          draggable={false}
          className="absolute inset-0 w-full h-full object-cover opacity-95"
        />
        <div
          className="absolute inset-0"
          style={{
            background:
              "linear-gradient(180deg, rgba(56,189,248,0.10), transparent 35%, rgba(7,6,13,0.55))",
          }}
        />
        <div
          className="absolute -top-3 -right-3 w-12 h-12 rounded-full blur-2xl pointer-events-none"
          style={{
            background:
              "radial-gradient(circle, rgba(var(--accent-rgb),0.45), transparent 70%)",
          }}
        />
      </div>
    );
  }
  if (variant === "neon") {
    return (
      <div
        className={`overflow-hidden ${className}`}
        style={tileBase}
      >
        <img
          src={bgNeon}
          alt=""
          aria-hidden
          draggable={false}
          className="absolute inset-0 w-full h-full object-cover"
          style={{ filter: "saturate(1.15) brightness(1.05)" }}
        />
        <div
          className="absolute -top-2 -left-3 w-12 h-12 rounded-full blur-2xl pointer-events-none"
          style={{
            background:
              "radial-gradient(circle, rgba(var(--accent-rgb),0.45), transparent 70%)",
          }}
        />
      </div>
    );
  }
  if (variant === "aurora") {
    return (
      <div
        className={`overflow-hidden ${className}`}
        style={tileBase}
      >
        <div
          className="absolute -top-5 -left-5 w-20 h-20 rounded-full blur-2xl"
          style={{
            background:
              "radial-gradient(circle, rgba(var(--accent-rgb),0.85), transparent 70%)",
          }}
        />
        <div
          className="absolute -bottom-5 -right-5 w-16 h-16 rounded-full blur-2xl"
          style={{
            background:
              "radial-gradient(circle, rgba(236,72,153,0.7), transparent 70%)",
          }}
        />
        <div
          className="absolute bottom-2 left-1/3 w-12 h-12 rounded-full blur-2xl"
          style={{
            background:
              "radial-gradient(circle, rgba(16,185,129,0.55), transparent 70%)",
          }}
        />
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background:
              "linear-gradient(115deg, transparent 38%, rgba(255,255,255,0.06) 50%, transparent 62%)",
          }}
        />
      </div>
    );
  }
  if (variant === "mesh") {
    return (
      <div
        className={`overflow-hidden ${className}`}
        style={{
          ...tileBase,
          backgroundImage:
            "radial-gradient(at 20% 18%, rgba(139, 92, 246, 0.75), transparent 45%), radial-gradient(at 82% 28%, rgba(236, 72, 153, 0.55), transparent 50%), radial-gradient(at 30% 88%, rgba(16, 185, 129, 0.5), transparent 55%), radial-gradient(at 88% 80%, rgba(56, 189, 248, 0.5), transparent 55%)",
        }}
      />
    );
  }
  if (variant === "cosmos") {
    return (
      <div
        className={`overflow-hidden ${className}`}
        style={{
          ...tileBase,
          backgroundImage:
            "radial-gradient(circle at 50% 45%, rgba(139,92,246,0.7), transparent 55%), radial-gradient(circle at 18% 82%, rgba(56,189,248,0.45), transparent 60%), radial-gradient(rgba(255,255,255,0.95) 0.7px, transparent 1px), radial-gradient(rgba(196,181,253,0.7) 0.7px, transparent 1px)",
          backgroundSize: "100% 100%, 100% 100%, 14px 14px, 22px 22px",
          backgroundPosition: "0 0, 0 0, 0 0, 6px 8px",
        }}
      />
    );
  }
  if (variant === "minimal") {
    return (
      <div
        className={`overflow-hidden ${className} grain`}
        style={tileBase}
      >
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background:
              "radial-gradient(circle at 70% 30%, rgba(var(--accent-rgb),0.18), transparent 65%)",
          }}
        />
      </div>
    );
  }
  return (
    <div
      className={`overflow-hidden ${className}`}
      style={tileBase}
    >
      <div
        className="absolute -top-4 -left-4 w-16 h-16 rounded-full blur-2xl"
        style={{ background: "radial-gradient(circle, rgba(124,58,237,0.7), transparent 70%)" }}
      />
      <div
        className="absolute top-2 right-0 w-12 h-12 rounded-full blur-2xl"
        style={{ background: "radial-gradient(circle, rgba(192,38,211,0.6), transparent 70%)" }}
      />
      <div
        className="absolute -bottom-2 left-1/2 w-14 h-14 rounded-full blur-2xl"
        style={{ background: "radial-gradient(circle, rgba(16,185,129,0.45), transparent 70%)" }}
      />
      <div
        className="absolute inset-0 opacity-60"
        style={{
          backgroundImage:
            "radial-gradient(circle at 30% 35%, rgba(196,181,253,0.55) 1px, transparent 1.5px), radial-gradient(circle at 60% 55%, rgba(196,181,253,0.55) 1px, transparent 1.5px), radial-gradient(circle at 75% 35%, rgba(196,181,253,0.55) 1px, transparent 1.5px)",
          backgroundSize: "12px 12px",
        }}
      />
      <div
        className="absolute inset-0 opacity-40"
        style={{
          backgroundImage:
            "radial-gradient(circle at 50% 50%, rgba(255,255,255,0.0) 60%, rgba(7,6,13,0.55) 100%)",
        }}
      />
    </div>
  );
}
