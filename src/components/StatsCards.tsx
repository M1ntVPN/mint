import { motion, type Variants } from "framer-motion";
import { Timer, Wifi, ArrowDownToLine, ArrowUpFromLine } from "lucide-react";
import type { ConnState } from "../types";

interface Props {
  state: ConnState;
  uptime: number;
  ping: number;
  down: number;
  up: number;
}

function fmtTime(s: number) {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}

function fmtBytes(b: number) {
  if (b < 1024) return `${b.toFixed(0)}B/s`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)}KiB/s`;
  return `${(b / 1024 / 1024).toFixed(2)}MiB/s`;
}

const container: Variants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: {
      delayChildren: 0.06,
      staggerChildren: 0.07,
    },
  },
};

const card: Variants = {
  hidden: {
    opacity: 0,
    y: 18,
    scale: 0.92,
    filter: "blur(6px)",
  },
  show: {
    opacity: 1,
    y: 0,
    scale: 1,
    filter: "blur(0px)",
    transition: {
      type: "spring",
      stiffness: 210,
      damping: 22,
      mass: 0.55,
    },
  },
};



export function StatsCards({ state, uptime, ping, down, up }: Props) {
  const items = [
    {
      icon: Timer,
      label: "Время",
      value: state === "connected" ? fmtTime(uptime) : "00:00:00",
      color: "text-accent-300",
      glow: "from-[rgba(var(--accent-rgb),0.25)]",
    },
    {
      icon: Wifi,
      label: "Пинг",
      value: state === "connected" && ping > 0 ? `${ping} ms` : "0 ms",
      color: "text-sky-300",
      glow: "from-sky-400/25",
    },
    {
      icon: ArrowDownToLine,
      label: "Загрузка",
      value: state === "connected" ? fmtBytes(down) : "0B/s",
      color: "text-emerald-300",
      glow: "from-emerald-400/25",
    },
    {
      icon: ArrowUpFromLine,
      label: "Отдача",
      value: state === "connected" ? fmtBytes(up) : "0B/s",
      color: "text-amber-300",
      glow: "from-amber-400/25",
    },
  ];

  return (
    <motion.div
      className="grid grid-cols-4 gap-2.5 max-[720px]:grid-cols-2 max-[720px]:gap-2"
      variants={container}
      initial="hidden"
      animate="show"
    >
      {items.map((it) => {
        const Icon = it.icon;
        return (
          <motion.div
            key={it.label}
            variants={card}
            className="glass rounded-xl px-3.5 py-2.5 select-none relative overflow-hidden max-[720px]:px-3 max-[720px]:py-2"
          >
            <div
              className={
                "absolute -top-8 -left-8 w-24 h-24 rounded-full blur-2xl pointer-events-none bg-gradient-to-br to-transparent " +
                it.glow
              }
            />
            <div className="relative flex items-center gap-2 text-[12.5px] text-white/55 mb-1.5">
              <span className="inline-flex items-center justify-center w-[18px] h-[18px] shrink-0">
                <Icon
                  size={18}
                  className={it.color}
                  strokeWidth={2}
                  absoluteStrokeWidth
                />
              </span>
              <span>{it.label}</span>
            </div>
            <div
              className="relative text-[15px] font-mono font-normal text-white/95 tracking-tight"
              style={{ fontVariantNumeric: "tabular-nums" }}
            >
              {it.value}
            </div>
          </motion.div>
        );
      })}
    </motion.div>
  );
}
