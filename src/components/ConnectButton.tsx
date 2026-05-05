import { motion, AnimatePresence, useMotionValue, animate } from "framer-motion";
import { Loader2, Power, Zap } from "lucide-react";
import { useEffect, useRef } from "react";
import { cn } from "../utils/cn";
import { Flag } from "./Flag";
import type { ConnState } from "../types";

interface Props {
  state: ConnState;
  onClick: () => void;
  serverName?: string;
  serverCountry?: string;
  serverFlag?: string;
}

const OUTER_BASE_DPS = 360 / 28;
const INNER_BASE_DPS = -360 / 14;
const CONNECTED_OUTER_DPS = 0;
const CONNECTED_INNER_DPS = -360 / 3.2;

const INTRO_OUTER_DPS = OUTER_BASE_DPS * 2.8;
const INTRO_INNER_DPS = INNER_BASE_DPS * 2.8;
const INTRO_SETTLE_MS = 1800;

export function ConnectButton({ state, onClick, serverName, serverCountry, serverFlag }: Props) {
  const isOn = state === "connected";
  const isConnecting = state === "connecting";
  const isDisconnecting = state === "disconnecting";

  const label =
    state === "connected" ? "Подключено" :
    state === "connecting" ? "Подключение…" :
    state === "disconnecting" ? "Отключение…" :
    "Не подключено";

  const sub =
    state === "connecting" ? "Устанавливаем туннель" :
    state === "disconnecting" ? "Закрываем сессию" :
    state === "connected" ? null :
    "Нажмите чтобы подключиться";

  const outerAngle = useMotionValue(0);
  const innerAngle = useMotionValue(0);
  const outerSpeed = useMotionValue(0);
  const innerSpeed = useMotionValue(0);

  const didIntroRef = useRef(false);
  useEffect(() => {
    if (didIntroRef.current) return;
    didIntroRef.current = true;
    if (!isOn && !isConnecting && !isDisconnecting) {
      outerSpeed.set(INTRO_OUTER_DPS);
      innerSpeed.set(INTRO_INNER_DPS);
    }
  }, []);

  useEffect(() => {
    const target =
      isOn
        ? { o: CONNECTED_OUTER_DPS, i: CONNECTED_INNER_DPS }
        : isConnecting
          ? { o: OUTER_BASE_DPS * 1.5, i: INNER_BASE_DPS * 1.5 }
          : isDisconnecting
            ? { o: OUTER_BASE_DPS * 0.4, i: INNER_BASE_DPS * 0.4 }
            : { o: 0, i: 0 };

    const duration =
      isConnecting ? 0.6 :
      isDisconnecting ? 0.9 :
      isOn ? 0.4 :
      INTRO_SETTLE_MS / 1000;

    const ease =
      isOn || isConnecting ? "easeOut" :
      isDisconnecting ? "easeInOut" :
      "easeOut";

    const a = animate(outerSpeed, target.o, { duration, ease });
    const b = animate(innerSpeed, target.i, { duration, ease });
    return () => {
      a.stop();
      b.stop();
    };
  }, [state, isOn, isConnecting, isDisconnecting, outerSpeed, innerSpeed]);

  const rafRef = useRef<number | null>(null);
  const lastTRef = useRef<number | null>(null);
  useEffect(() => {
    const loop = (t: number) => {
      const last = lastTRef.current;
      lastTRef.current = t;
      if (last != null) {
        const dt = Math.min((t - last) / 1000, 0.05);
        const os = outerSpeed.get();
        const is = innerSpeed.get();
        if (Math.abs(os) > 0.01) outerAngle.set(outerAngle.get() + os * dt);
        if (Math.abs(is) > 0.01) innerAngle.set(innerAngle.get() + is * dt);
      }
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      lastTRef.current = null;
    };
  }, [outerAngle, innerAngle, outerSpeed, innerSpeed]);

  return (
    <div className="flex flex-col items-center gap-5 max-[720px]:gap-3.5">
      <div className="relative w-[200px] h-[200px] grid place-items-center max-[720px]:w-[160px] max-[720px]:h-[160px]">
        {!isOn && (
          <motion.div
            style={{ rotate: outerAngle }}
            className={cn(
              "absolute inset-0 rounded-full",
              "opacity-60"
            )}
          >
            <div
              className="w-full h-full rounded-full"
              style={{
                background: isConnecting || isDisconnecting
                  ? "conic-gradient(from 0deg, transparent, rgba(var(--accent-rgb),0.55), transparent 35%, rgba(var(--accent-rgb),0.25) 60%, transparent 80%)"
                  : "conic-gradient(from 0deg, transparent, rgba(var(--accent-rgb),0.32), transparent 50%, rgba(var(--accent-rgb),0.15) 75%, transparent 90%)",
                mask: "radial-gradient(circle, transparent 60%, #000 62%, #000 70%, transparent 72%)",
                WebkitMask:
                  "radial-gradient(circle, transparent 60%, #000 62%, #000 70%, transparent 72%)",
                transition: "background 600ms ease",
              }}
            />
          </motion.div>
        )}

        <motion.svg
          style={{ rotate: innerAngle }}
          className="absolute inset-2"
          viewBox="0 0 100 100"
        >
          <circle
            cx="50"
            cy="50"
            r="46"
            fill="none"
            stroke={isOn ? "rgba(167,243,208,0.98)" : "rgba(var(--accent-rgb),0.78)"}
            strokeWidth={isOn ? 1.6 : 1.0}
            strokeDasharray={isOn ? "3.5 5" : "2.4 5.2"}
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
            className="dash-flow"
            style={{
              animationPlayState:
                isOn || isConnecting || isDisconnecting ? "running" : "paused",
              filter: isOn
                ? "drop-shadow(0 0 5px rgba(52,211,153,0.6))"
                : "drop-shadow(0 0 3px rgba(var(--accent-rgb),0.45))",
            }}
          />
        </motion.svg>

        <motion.button
          onClick={onClick}
          whileTap={{ scale: 0.94 }}
          whileHover={{ scale: 1.03 }}
          transition={{ type: "spring", stiffness: 320, damping: 22 }}
          className={cn(
            "relative w-[150px] h-[150px] rounded-full grid place-items-center transition-colors duration-500 max-[720px]:w-[124px] max-[720px]:h-[124px]",
            "bg-gradient-to-br",
            isOn
              ? "from-emerald-300 via-emerald-500 to-emerald-700 mint-pulse"
              : isConnecting
                ? "bg-accent-grad-pulse accent-pulse"
                : isDisconnecting
                  ? "bg-accent-grad-pulse idle-breathe"
                  : "from-ink-600 via-ink-700 to-ink-800 idle-breathe border border-white/10"
          )}
        >
          <div
            className="absolute inset-0 rounded-full pointer-events-none"
            style={{
              background:
                "radial-gradient(circle at 30% 25%, rgba(255,255,255,0.45), transparent 45%)",
            }}
          />
          <div className="absolute inset-[10%] rounded-full ring-1 ring-white/15 pointer-events-none" />

          <AnimatePresence mode="wait">
            {isConnecting || isDisconnecting ? (
              <motion.div
                key="loading"
                initial={{ opacity: 0, scale: 0.7 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.7 }}
                transition={{ duration: 0.2 }}
              >
                <Loader2
                  size={56}
                  className="text-white animate-spin drop-shadow-[0_4px_18px_rgba(0,0,0,0.4)]"
                />
              </motion.div>
            ) : isOn ? (
              <motion.div
                key="zap"
                initial={{ opacity: 0, scale: 0.6, rotate: -10 }}
                animate={{ opacity: 1, scale: 1, rotate: 0 }}
                exit={{ opacity: 0, scale: 0.6 }}
                transition={{ type: "spring", stiffness: 300, damping: 18 }}
              >
                <Zap
                  size={64}
                  strokeWidth={2.2}
                  className="text-white fill-white drop-shadow-[0_4px_18px_rgba(0,0,0,0.45)]"
                />
              </motion.div>
            ) : (
              <motion.div
                key="power"
                initial={{ opacity: 0, scale: 0.6 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.6 }}
                transition={{ duration: 0.2 }}
              >
                <Power
                  size={56}
                  className="text-white/85 drop-shadow-[0_4px_18px_rgba(0,0,0,0.4)]"
                />
              </motion.div>
            )}
          </AnimatePresence>
        </motion.button>
      </div>

      <div className="text-center">
        <motion.div
          key={label}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          className={cn(
            "text-[18px] font-semibold tracking-tight",
            isOn ? "text-emerald-300" :
            isConnecting ? "text-accent-300" :
            isDisconnecting ? "text-accent-300" :
            "text-white/85"
          )}
        >
          {label}
        </motion.div>
        {isOn && serverName ? (
          <motion.div
            key="server-info"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.3 }}
            className="flex items-center justify-center gap-2 mt-1"
          >
            <Flag flag={serverFlag} country={serverCountry} size={18} />
            <span className="text-[13px] text-white/55">{serverName}</span>
          </motion.div>
        ) : sub ? (
          <motion.div
            key={sub}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.3 }}
            className="text-[13px] text-white/45 mt-0.5"
          >
            {sub}
          </motion.div>
        ) : null}
      </div>
    </div>
  );
}
