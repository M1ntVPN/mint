import { createContext, useContext, useEffect, useState } from "react";

export type IconVariant = "shield" | "leaf";
export type BackgroundKey =
  | "default"
  | "worldmap"
  | "neon"
  | "aurora"
  | "mesh"
  | "cosmos"
  | "minimal";
export type AccentKey =
  | "violet"
  | "indigo"
  | "sky"
  | "teal"
  | "emerald"
  | "lime"
  | "amber"
  | "orange"
  | "rose"
  | "pink";

export const ACCENTS: Record<
  AccentKey,
  { label: string; swatch: string; vars: Record<string, string> }
> = {
  violet: {
    label: "Фиолетовый",
    swatch: "#8b5cf6",
    vars: {
      "--accent-300": "#c4b5fd",
      "--accent-400": "#a78bfa",
      "--accent-500": "#8b5cf6",
      "--accent-600": "#7c3aed",
      "--accent-rgb": "139, 92, 246",
      "--accent-from": "#8b5cf6",
      "--accent-to": "#c026d3",
    },
  },
  indigo: {
    label: "Индиго",
    swatch: "#6366f1",
    vars: {
      "--accent-300": "#a5b4fc",
      "--accent-400": "#818cf8",
      "--accent-500": "#6366f1",
      "--accent-600": "#4f46e5",
      "--accent-rgb": "99, 102, 241",
      "--accent-from": "#6366f1",
      "--accent-to": "#8b5cf6",
    },
  },
  sky: {
    label: "Голубой",
    swatch: "#0ea5e9",
    vars: {
      "--accent-300": "#7dd3fc",
      "--accent-400": "#38bdf8",
      "--accent-500": "#0ea5e9",
      "--accent-600": "#0284c7",
      "--accent-rgb": "14, 165, 233",
      "--accent-from": "#0ea5e9",
      "--accent-to": "#22d3ee",
    },
  },
  teal: {
    label: "Бирюзовый",
    swatch: "#14b8a6",
    vars: {
      "--accent-300": "#5eead4",
      "--accent-400": "#2dd4bf",
      "--accent-500": "#14b8a6",
      "--accent-600": "#0d9488",
      "--accent-rgb": "20, 184, 166",
      "--accent-from": "#14b8a6",
      "--accent-to": "#06b6d4",
    },
  },
  emerald: {
    label: "Изумрудный",
    swatch: "#10b981",
    vars: {
      "--accent-300": "#6ee7b7",
      "--accent-400": "#34d399",
      "--accent-500": "#10b981",
      "--accent-600": "#059669",
      "--accent-rgb": "16, 185, 129",
      "--accent-from": "#10b981",
      "--accent-to": "#06b6d4",
    },
  },
  lime: {
    label: "Лайм",
    swatch: "#84cc16",
    vars: {
      "--accent-300": "#bef264",
      "--accent-400": "#a3e635",
      "--accent-500": "#84cc16",
      "--accent-600": "#65a30d",
      "--accent-rgb": "132, 204, 22",
      "--accent-from": "#84cc16",
      "--accent-to": "#10b981",
    },
  },
  amber: {
    label: "Янтарный",
    swatch: "#f59e0b",
    vars: {
      "--accent-300": "#fcd34d",
      "--accent-400": "#fbbf24",
      "--accent-500": "#f59e0b",
      "--accent-600": "#d97706",
      "--accent-rgb": "245, 158, 11",
      "--accent-from": "#f59e0b",
      "--accent-to": "#f97316",
    },
  },
  orange: {
    label: "Оранжевый",
    swatch: "#f97316",
    vars: {
      "--accent-300": "#fdba74",
      "--accent-400": "#fb923c",
      "--accent-500": "#f97316",
      "--accent-600": "#ea580c",
      "--accent-rgb": "249, 115, 22",
      "--accent-from": "#f97316",
      "--accent-to": "#ef4444",
    },
  },
  rose: {
    label: "Розовый",
    swatch: "#f43f5e",
    vars: {
      "--accent-300": "#fda4af",
      "--accent-400": "#fb7185",
      "--accent-500": "#f43f5e",
      "--accent-600": "#e11d48",
      "--accent-rgb": "244, 63, 94",
      "--accent-from": "#f43f5e",
      "--accent-to": "#f97316",
    },
  },
  pink: {
    label: "Пинк",
    swatch: "#ec4899",
    vars: {
      "--accent-300": "#f9a8d4",
      "--accent-400": "#f472b6",
      "--accent-500": "#ec4899",
      "--accent-600": "#db2777",
      "--accent-rgb": "236, 72, 153",
      "--accent-from": "#ec4899",
      "--accent-to": "#a855f7",
    },
  },
};

type ThemeCtx = {
  accent: AccentKey;
  setAccent: (a: AccentKey) => void;
  iconVariant: IconVariant;
  setIconVariant: (v: IconVariant) => void;
  background: BackgroundKey;
  setBackground: (b: BackgroundKey) => void;
};

const Ctx = createContext<ThemeCtx | null>(null);

const KEY_ACCENT = "mint.theme.accent";
const KEY_ICON = "mint.theme.icon";
const KEY_BG = "mint.theme.background";

const BG_KEYS: BackgroundKey[] = [
  "default",
  "worldmap",
  "neon",
  "aurora",
  "mesh",
  "cosmos",
  "minimal",
];

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [accent, setAccentState] = useState<AccentKey>(() => {
    if (typeof window === "undefined") return "violet";
    return (localStorage.getItem(KEY_ACCENT) as AccentKey) || "violet";
  });
  const [iconVariant, setIconVariantState] = useState<IconVariant>(() => {
    if (typeof window === "undefined") return "shield";
    const v = localStorage.getItem(KEY_ICON);
    return v === "leaf" ? "leaf" : "shield";
  });
  const [background, setBackgroundState] = useState<BackgroundKey>(() => {
    if (typeof window === "undefined") return "default";
    const v = localStorage.getItem(KEY_BG);
    return BG_KEYS.includes(v as BackgroundKey)
      ? (v as BackgroundKey)
      : "default";
  });

  useEffect(() => {
    const root = document.documentElement;
    root.dataset.theme = "dark";
    root.classList.remove("theme-light");
    try {
      localStorage.removeItem("mint.theme.mode");
    } catch {
    }
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    const a = ACCENTS[accent];
    Object.entries(a.vars).forEach(([k, v]) => root.style.setProperty(k, v));
    root.dataset.accent = accent;
  }, [accent]);

  const setAccent = (a: AccentKey) => {
    localStorage.setItem(KEY_ACCENT, a);
    setAccentState(a);
  };
  const setBackground = (b: BackgroundKey) => {
    localStorage.setItem(KEY_BG, b);
    setBackgroundState(b);
  };
  const setIconVariant = (v: IconVariant) => {
    localStorage.setItem(KEY_ICON, v);
    setIconVariantState(v);
    void (async () => {
      try {
        const { invoke } = await import("@tauri-apps/api/core");
        await invoke("set_window_icon", { variant: v });
      } catch {
      }
    })();
  };

  useEffect(() => {
    void (async () => {
      try {
        const { invoke } = await import("@tauri-apps/api/core");
        await invoke("set_window_icon", { variant: iconVariant });
      } catch {
      }
    })();
  }, []);

  return (
    <Ctx.Provider
      value={{
        accent,
        setAccent,
        iconVariant,
        setIconVariant,
        background,
        setBackground,
      }}
    >
      {children}
    </Ctx.Provider>
  );
}

export function useTheme(): ThemeCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error("useTheme must be used within ThemeProvider");
  return c;
}
