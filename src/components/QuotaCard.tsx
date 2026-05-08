import { motion } from "framer-motion";
import { Gauge } from "lucide-react";
import { useSubscriptions } from "../store/subscriptions";

function formatBytes(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return "0 B";
  const units = ["B", "КБ", "МБ", "ГБ", "ТБ"];
  let v = n;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  const fixed = v >= 100 ? v.toFixed(0) : v >= 10 ? v.toFixed(1) : v.toFixed(2);
  return `${fixed} ${units[i]}`;
}

function formatExpiry(unixSec: number): string {
  const d = new Date(unixSec * 1000);
  return d.toLocaleDateString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

export function QuotaCard() {
  const subs = useSubscriptions((s) => s.list);

  const withQuota = subs.filter(
    (s) => typeof s.totalBytes === "number" && (s.totalBytes ?? 0) > 0
  );
  if (withQuota.length === 0) return null;

  const total = withQuota.reduce((acc, s) => acc + (s.totalBytes ?? 0), 0);
  const used = withQuota.reduce(
    (acc, s) => acc + (s.uploadBytes ?? 0) + (s.downloadBytes ?? 0),
    0
  );
  const remaining = Math.max(0, total - used);
  const pct = total > 0 ? Math.min(100, (used / total) * 100) : 0;

  const earliestExpiry = withQuota
    .map((s) => s.expiresAt)
    .filter((x): x is number => typeof x === "number" && x > 0)
    .sort((a, b) => a - b)[0];

  const label =
    withQuota.length === 1
      ? withQuota[0].name
      : `Подписок: ${withQuota.length}`;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.25, ease: "easeOut" }}
      className="rounded-2xl bg-gradient-to-b from-white/[0.04] to-white/[0.015] border border-white/[0.07] p-4"
    >
      <div className="flex items-center justify-between gap-3 mb-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-8 h-8 grid place-items-center rounded-lg bg-accent-soft border border-accent-soft text-accent shrink-0">
            <Gauge size={14} />
          </div>
          <div className="flex flex-col min-w-0">
            <span className="text-[13.5px] font-semibold text-white truncate">
              {label}
            </span>
            <span
              className="text-[11.5px] text-white/45"
              title={`Использовано ${formatBytes(used)} из ${formatBytes(total)}`}
            >
              {formatBytes(remaining)} / {formatBytes(total)}
              {earliestExpiry ? ` · до ${formatExpiry(earliestExpiry)}` : ""}
            </span>
          </div>
        </div>
        <span className="text-[13px] font-mono font-semibold text-white/85 shrink-0 tabular-nums">
          {pct.toFixed(pct >= 10 ? 0 : 1)}%
        </span>
      </div>
      <div className="relative h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.6, ease: "easeOut" }}
          className="absolute inset-y-0 left-0 rounded-full bg-accent-grad"
        />
      </div>
    </motion.div>
  );
}
