import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronRight } from "lucide-react";
import { cn } from "../utils/cn";

let openId: string | null = null;
const subs = new Set<(id: string | null) => void>();
function setOpen(id: string | null) {
  openId = id;
  subs.forEach((fn) => fn(id));
}

export type DropdownOption = {
  value: string;
  label?: string;
};

export function Dropdown({
  value,
  options,
  onChange,
  align = "right",
  minWidth = 140,
  className,
}: {
  value: string;
  options: (string | DropdownOption)[];
  onChange: (v: string) => void;
  align?: "left" | "right";
  minWidth?: number;
  className?: string;
}) {
  const id = useId();
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const [open, setLocal] = useState(false);
  const [coords, setCoords] = useState<{ top: number; left: number; width: number } | null>(null);

  useEffect(() => {
    const sub = (currentlyOpen: string | null) => setLocal(currentlyOpen === id);
    subs.add(sub);
    return () => {
      subs.delete(sub);
    };
  }, [id]);

  useLayoutEffect(() => {
    if (!open || !triggerRef.current) return;
    const r = triggerRef.current.getBoundingClientRect();
    const panelWidth = Math.max(r.width, minWidth);
    const left = align === "right" ? r.right - panelWidth : r.left;
    setCoords({
      top: r.bottom + 6,
      left,
      width: panelWidth,
    });
  }, [open, align, minWidth]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      const t = e.target as Node;
      if (
        triggerRef.current &&
        !triggerRef.current.contains(t) &&
        panelRef.current &&
        !panelRef.current.contains(t)
      ) {
        if (openId === id) setOpen(null);
      }
    };
    const esc = (e: KeyboardEvent) => {
      if (e.key === "Escape" && openId === id) setOpen(null);
    };
    const onScroll = () => {
      if (openId === id) setOpen(null);
    };
    document.addEventListener("mousedown", handler);
    document.addEventListener("keydown", esc);
    document.addEventListener("scroll", onScroll, true);
    return () => {
      document.removeEventListener("mousedown", handler);
      document.removeEventListener("keydown", esc);
      document.removeEventListener("scroll", onScroll, true);
    };
  }, [open, id]);

  const opts: DropdownOption[] = options.map((o) =>
    typeof o === "string" ? { value: o } : o
  );
  const current = opts.find((o) => o.value === value);

  return (
    <div className={cn("relative", className)}>
      <button
        ref={triggerRef}
        onClick={() => setOpen(openId === id ? null : id)}
        className="flex items-center gap-2 h-9 px-3 rounded-lg bg-white/[0.05] border border-white/[0.06] text-[13.5px] text-white/85 hover:bg-white/[0.08] transition justify-between"
        style={{ minWidth }}
      >
        <span className="truncate">{current?.label ?? current?.value ?? value}</span>
        <ChevronRight
          size={11}
          className={cn("transition shrink-0", open ? "rotate-90" : "rotate-0")}
        />
      </button>
      {typeof document !== "undefined" &&
        createPortal(
          <AnimatePresence>
            {open && coords && (
              <motion.div
                ref={panelRef}
                initial={{ opacity: 0, y: -4, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -4, scale: 0.97 }}
                transition={{ duration: 0.12 }}
                className="fixed z-[1000] rounded-lg bg-ink-900/95 border border-white/[0.08] shadow-[0_24px_48px_-12px_rgba(0,0,0,0.85)] backdrop-blur-xl p-1"
                style={{
                  top: coords.top,
                  left: coords.left,
                  minWidth: coords.width,
                }}
              >
                {opts.map((o) => (
                  <button
                    key={o.value}
                    onClick={() => {
                      onChange(o.value);
                      setOpen(null);
                    }}
                    className={cn(
                      "w-full text-left px-2.5 h-8 rounded-md text-[13.5px] flex items-center transition",
                      o.value === value
                        ? "text-white"
                        : "text-white/75 hover:bg-white/[0.05]"
                    )}
                    style={
                      o.value === value
                        ? { backgroundColor: "rgba(var(--accent-rgb), 0.20)" }
                        : undefined
                    }
                  >
                    {o.label ?? o.value}
                  </button>
                ))}
              </motion.div>
            )}
          </AnimatePresence>,
          document.body
        )}
    </div>
  );
}
