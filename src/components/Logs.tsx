import { motion } from "framer-motion";
import { Trash2, Download, Filter, Check } from "lucide-react";
import { PageHeader } from "./Profiles";
import { useMemo, useState } from "react";
import { cn } from "../utils/cn";
import { Dropdown } from "./Dropdown";
import { useLogs } from "../store/logs";

const LEVELS = ["ALL", "INFO", "WARN", "ERROR", "DEBUG"] as const;

const colors: Record<string, string> = {
  INFO: "text-sky-300 bg-sky-300/10 border-sky-300/20",
  WARN: "text-amber-300 bg-amber-300/10 border-amber-300/20",
  ERROR: "text-rose-300 bg-rose-300/10 border-rose-300/20",
  DEBUG: "text-violet-300 bg-violet-300/10 border-violet-300/20",
};

export function LogsPage() {
  const [filter, setFilter] = useState<(typeof LEVELS)[number]>("ALL");
  const [source, setSource] = useState<string>("all");
  const [justExported, setJustExported] = useState(false);

  const entries = useLogs((s) => s.entries);
  const clearEntries = useLogs((s) => s.clear);

  const sources = useMemo(
    () => ["all", ...Array.from(new Set(entries.map((e) => e.src)))],
    [entries]
  );

  const filtered = entries.filter(
    (l) =>
      (filter === "ALL" || l.lvl === filter) && (source === "all" || l.src === source)
  );

  const exportLogs = () => {
    const txt = filtered
      .map((l) => `${l.t}  ${l.lvl.padEnd(5)}  [${l.src}]  ${l.msg}`)
      .join("\n");
    const blob = new Blob([txt], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `mint-logs-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.log`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    setJustExported(true);
    setTimeout(() => setJustExported(false), 1500);
  };

  return (
    <div className="p-6 h-full flex flex-col overflow-hidden">
      <PageHeader title="Логи" subtitle="Поток событий приложения и демона" />

      <div className="flex items-center gap-2 mt-5 mb-3">
        <div className="flex items-center gap-1 p-1 rounded-xl bg-white/[0.04] border border-white/[0.06]">
          {LEVELS.map((l) => (
            <button
              key={l}
              onClick={() => setFilter(l)}
              className={cn(
                "relative px-3 h-7 rounded-lg text-[12.5px] font-medium transition select-none",
                filter === l ? "text-white" : "text-white/50 hover:text-white"
              )}
            >
              {filter === l && (
                <motion.div
                  layoutId="logFilter"
                  className="absolute inset-0 rounded-lg bg-accent-soft border border-accent-soft"
                  transition={{ type: "spring", stiffness: 360, damping: 30 }}
                />
              )}
              <span className="relative">{l}</span>
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1.5 ml-auto">
          <div className="flex items-center gap-1.5">
            <Filter size={12} className="text-white/50" />
            <Dropdown
              value={source}
              options={sources.map((s) => ({
                value: s,
                label: s === "all" ? "Все источники" : `[${s}]`,
              }))}
              onChange={setSource}
              minWidth={150}
            />
          </div>
          <button
            onClick={exportLogs}
            className="flex items-center gap-1.5 h-9 px-3 rounded-lg bg-white/[0.04] border border-white/[0.06] text-[13px] text-white/75 hover:text-white hover:bg-white/[0.07] transition"
          >
            {justExported ? <Check size={12} /> : <Download size={12} />}
            {justExported ? "Готово" : "Экспорт"}
          </button>
          <button
            onClick={clearEntries}
            className="flex items-center gap-1.5 h-9 px-3 rounded-lg bg-rose-500/10 border border-rose-400/25 text-[13px] text-rose-300 hover:bg-rose-500/20 transition"
          >
            <Trash2 size={12} /> Очистить
          </button>
        </div>
      </div>

      <div className="grad-border flex-1 p-3 overflow-hidden">
        <div
          data-allow-select
          className="h-full overflow-y-auto scroll-thin font-mono text-[13px] leading-6 cursor-text selectable-text"
        >
          {filtered.length === 0 ? (
            <div className="h-full grid place-items-center text-white/35 text-[13px] text-center px-6">
              {entries.length === 0
                ? "Подключитесь к серверу — здесь появятся события движка"
                : "Под выбранные фильтры нет записей"}
            </div>
          ) : (
            filtered.map((l, i) => (
              <motion.div
                key={`${l.t}-${i}`}
                initial={{ opacity: 0, x: -6 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.18 }}
                className="grid grid-cols-[120px_72px_72px_1fr] gap-3 px-2 py-1.5 rounded hover:bg-white/[0.03] items-center"
              >
                <span className="text-white/30 leading-none self-center">{l.t}</span>
                <span
                  className={cn(
                    "inline-flex items-center justify-center text-[10.5px] uppercase font-bold tracking-wider rounded-md border px-1.5 h-[18px] w-fit self-center",
                    colors[l.lvl] ?? colors.INFO
                  )}
                  style={{ lineHeight: "16px" }}
                >
                  {l.lvl}
                </span>
                <span className="text-accent leading-none self-center">[{l.src}]</span>
                <span className="text-white/85 leading-snug self-center break-all">{l.msg}</span>
              </motion.div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
