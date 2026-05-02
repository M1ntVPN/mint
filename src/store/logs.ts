import { create } from "zustand";

export interface LogEntry {
  t: string;
  lvl: string;
  src: string;
  msg: string;
}

const MAX_ENTRIES = 5000;

interface LogsState {
  entries: LogEntry[];
  push: (e: LogEntry) => void;
  clear: () => void;
}

export const useLogs = create<LogsState>((set) => ({
  entries: [],
  push: (entry) =>
    set((state) => {
      const next = [entry, ...state.entries];
      return { entries: next.length > MAX_ENTRIES ? next.slice(0, MAX_ENTRIES) : next };
    }),
  clear: () => set({ entries: [] }),
}));

export function parseEngineLine(raw: string): LogEntry {
  const t = new Date().toISOString().slice(11, 23);
  const stripped = raw.replace(/\u001b\[[0-9;]*m/g, "").trimEnd();

  const lvlMatch = stripped.match(/\b(INFO|WARN|WARNING|ERROR|FATAL|DEBUG|TRACE)\b/);
  let lvl = lvlMatch ? lvlMatch[1].toUpperCase() : "INFO";
  if (lvl === "WARNING") lvl = "WARN";
  if (lvl === "FATAL") lvl = "ERROR";
  if (lvl === "TRACE") lvl = "DEBUG";

  let src = "core";
  const mod1 = stripped.match(/\s([a-zA-Z][\w/-]*)\s*:\s/);
  const mod2 = stripped.match(/\[([a-zA-Z][\w/-]*)\]/);
  if (mod1) src = mod1[1];
  else if (mod2) src = mod2[1];

  let msg = stripped;
  if (lvlMatch) {
    const idx = stripped.indexOf(lvlMatch[0]);
    msg = stripped.slice(idx + lvlMatch[0].length).replace(/^[\s:[\]]+/, "").trim();
  }
  if (!msg) msg = stripped;

  return { t, lvl, src, msg };
}
