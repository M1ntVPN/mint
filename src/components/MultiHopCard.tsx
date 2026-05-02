import { motion, AnimatePresence } from "framer-motion";
import { ArrowRight, Layers, Info } from "lucide-react";
import { Dropdown } from "./Dropdown";
import { useMultiHop } from "../store/multihop";
import { useServers, type SavedServer } from "../store/servers";
import { Flag } from "./Flag";
import { cn } from "../utils/cn";

const CHAIN_PROTOS = new Set(["vless", "vmess", "trojan", "shadowsocks", "hiddify"]);

export function MultiHopCard() {
  const { enabled, entryId, exitId, setEnabled, setEntry, setExit } = useMultiHop();
  const servers = useServers((s) => s.servers);

  const eligible = servers.filter((s) => CHAIN_PROTOS.has(s.protocol));

  const entry = servers.find((s) => s.id === entryId) ?? null;
  const exit = servers.find((s) => s.id === exitId) ?? null;

  return (
    <motion.div
      layout
      transition={{ type: "spring", stiffness: 380, damping: 32 }}
      className="rounded-2xl bg-gradient-to-b from-white/[0.04] to-white/[0.015] border border-white/[0.07] p-4"
    >
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 grid place-items-center rounded-xl bg-accent-soft border border-accent-soft text-accent shrink-0">
          <Layers size={16} />
        </div>
        <div className="flex flex-col min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-[14px] font-semibold text-white">Multi-hop</span>
            <span className="text-[10px] uppercase font-semibold tracking-wider px-1.5 py-0.5 rounded-md bg-amber-300/10 text-amber-300 border border-amber-300/20">
              beta
            </span>
          </div>
          <span className="text-[12px] text-white/55">
            Цепочка из двух серверов: трафик идёт через <i>entry</i> → <i>exit</i> → интернет
          </span>
        </div>
        <Toggle on={enabled} onChange={setEnabled} />
      </div>

      <AnimatePresence initial={false}>
        {enabled && (
          <motion.div
            key="picker"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.25 }}
            className="overflow-hidden"
          >
            <div className="grid grid-cols-[1fr_auto_1fr] grid-rows-[auto_auto_auto] gap-x-3 gap-y-1.5 mt-4">
              <PickerLabel>Entry — точка входа</PickerLabel>
              <div />
              <PickerLabel>Exit — точка выхода</PickerLabel>

              <PickerInput
                value={entryId}
                exclude={exitId ?? undefined}
                eligible={eligible}
                onChange={setEntry}
              />
              <div className="grid place-items-center text-white/45 self-center">
                <ArrowRight size={16} />
              </div>
              <PickerInput
                value={exitId}
                exclude={entryId ?? undefined}
                eligible={eligible}
                onChange={setExit}
              />

              <PickerResolved resolved={entry} />
              <div />
              <PickerResolved resolved={exit} />
            </div>

            <div className="mt-3 flex items-start gap-2 rounded-lg bg-amber-300/[0.07] border border-amber-300/20 p-2.5 text-[12px] text-amber-200/90 leading-relaxed">
              <Info size={13} className="mt-0.5 shrink-0" />
              <span>
                Multi-hop замедляет соединение и увеличивает пинг (двойной overhead).
                Используйте для конфиденциальности, а не скорости. Доступно для VLESS / VMess /
                Trojan / Shadowsocks. WireGuard и OpenVPN — недоступны.
              </span>
            </div>

            {entry && exit && entry.id !== exit.id && (
              <div className="mt-3 flex items-center gap-2 text-[12.5px] text-white/65 px-1">
                <span>Маршрут:</span>
                <Flag flag={entry.flag ?? "🌐"} country={entry.country} size={18} />
                <span className="text-white/85 font-medium">{entry.name}</span>
                <ArrowRight size={11} className="text-white/35" />
                <Flag flag={exit.flag ?? "🌐"} country={exit.country} size={18} />
                <span className="text-white/85 font-medium">{exit.name}</span>
                <ArrowRight size={11} className="text-white/35" />
                <span className="text-white/55">интернет</span>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function PickerLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-[11.5px] uppercase tracking-wider text-white/45 font-semibold leading-none">
      {children}
    </span>
  );
}

function PickerInput({
  value,
  eligible,
  exclude,
  onChange,
}: {
  value: string | null;
  eligible: SavedServer[];
  exclude?: string;
  onChange: (id: string | null) => void;
}) {
  const opts = eligible
    .filter((s) => s.id !== exclude)
    .map((s) => ({
      value: s.id,
      label: `${s.flag ?? "🌐"} ${s.name}`,
    }));
  return (
    <div className="min-w-0">
      <Dropdown
        value={value ?? ""}
        options={opts.length === 0 ? [{ value: "", label: "Нет подходящих серверов" }] : opts}
        onChange={(v) => onChange(v || null)}
        align="left"
        minWidth={220}
        className="w-full"
      />
    </div>
  );
}

function PickerResolved({ resolved }: { resolved: SavedServer | null }) {
  return (
    <span className="text-[11px] text-white/40 truncate min-h-[14px]">
      {resolved ? `${resolved.protocol.toUpperCase()} · ${resolved.city ?? "—"}` : ""}
    </span>
  );
}

function Toggle({
  on,
  onChange,
}: {
  on: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      onClick={() => onChange(!on)}
      className={cn(
        "relative w-11 h-6 rounded-full transition shrink-0",
        on ? "bg-accent-grad" : "bg-white/[0.08]"
      )}
    >
      <motion.span
        layout
        transition={{ type: "spring", stiffness: 480, damping: 32 }}
        className={cn(
          "absolute top-0.5 w-5 h-5 rounded-full bg-white shadow",
          on ? "right-0" : "left-0"
        )}
      />
    </button>
  );
}
