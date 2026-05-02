import { useState } from "react";

type Props = {
  flag?: string;
  country?: string;
  size?: number;
  className?: string;
  rounded?: boolean;
};

const TWEMOJI_BASE =
  "https://cdn.jsdelivr.net/gh/jdecked/twemoji@latest/assets/svg/";

function emojiToCodepoints(emoji: string): string {
  const codes: string[] = [];
  for (const ch of emoji) {
    const cp = ch.codePointAt(0);
    if (cp == null) continue;
    if (cp === 0xfe0f) continue;
    codes.push(cp.toString(16));
  }
  return codes.join("-");
}

function fallbackLetters(country?: string): string {
  if (!country) return "??";
  const words = country.trim().split(/\s+/);
  const w = words[0] ?? country;
  return w.slice(0, 2).toUpperCase();
}

export function Flag({
  flag,
  country,
  size = 20,
  className = "",
  rounded = true,
}: Props) {
  const [errored, setErrored] = useState(false);

  const code = flag ? emojiToCodepoints(flag) : "";

  if (!flag || !code || errored) {
    return (
      <span
        className={`inline-grid place-items-center font-semibold tracking-tight bg-white/[0.06] border border-white/10 text-white/70 ${className}`}
        style={{
          width: size,
          height: Math.round(size * 0.72),
          fontSize: Math.round(size * 0.42),
          borderRadius: rounded ? Math.round(size * 0.18) : 0,
          letterSpacing: "0.02em",
        }}
        aria-label={country}
      >
        {fallbackLetters(country)}
      </span>
    );
  }

  return (
    <span
      className={`relative inline-flex items-center justify-center shrink-0 ${className}`}
      style={{
        width: size,
        height: size,
      }}
      aria-label={country}
    >
      <img
        src={`${TWEMOJI_BASE}${code}.svg`}
        alt={country ?? flag}
        draggable={false}
        onError={() => setErrored(true)}
        style={{
          width: size,
          height: "auto",
          display: "block",
          userSelect: "none",
          pointerEvents: "none",
          filter: "drop-shadow(0 1px 2px rgba(0,0,0,0.4))",
          borderRadius: rounded ? Math.round(size * 0.16) : 0,
        }}
      />
    </span>
  );
}
