import { AnimatePresence, motion } from "framer-motion";
import { AlertTriangle } from "lucide-react";
import { useEffect } from "react";
import { cn } from "../utils/cn";

type Props = {
  open: boolean;
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = "Подтвердить",
  cancelLabel = "Отмена",
  destructive,
  onConfirm,
  onCancel,
}: Props) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
      if (e.key === "Enter") onConfirm();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onCancel, onConfirm]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[100] flex items-center justify-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
        >
          <motion.div
            className="absolute inset-0 bg-black/55 backdrop-blur-sm"
            onClick={onCancel}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          />

          <motion.div
            initial={{ opacity: 0, scale: 0.94, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 4 }}
            transition={{ type: "spring", stiffness: 380, damping: 30 }}
            className={cn(
              "relative w-[380px] max-w-[92vw] rounded-2xl p-5",
              "bg-gradient-to-b from-ink-800/95 to-ink-900/95",
              "border border-white/[0.08] shadow-[0_30px_80px_-20px_rgba(0,0,0,0.85)]"
            )}
          >
            <div className="flex items-start gap-3.5">
              <div
                className={cn(
                  "w-10 h-10 rounded-xl grid place-items-center shrink-0",
                  destructive
                    ? "bg-rose-500/15 border border-rose-400/25 text-rose-300"
                    : "bg-accent-soft border border-accent-soft text-accent-300"
                )}
              >
                <AlertTriangle size={18} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[14.5px] font-semibold text-white">
                  {title}
                </div>
                {description && (
                  <div className="text-[13.5px] text-white/55 mt-1 leading-relaxed">
                    {description}
                  </div>
                )}
              </div>
            </div>

            <div className="mt-5 flex items-center justify-between gap-2">
              <motion.button
                whileTap={{ scale: 0.97 }}
                onClick={onConfirm}
                className={cn(
                  "h-9 px-4 rounded-lg text-[13.5px] font-medium text-white border transition",
                  destructive
                    ? "bg-gradient-to-r from-rose-500 to-rose-600 hover:brightness-110 border-rose-400/40 shadow-[0_8px_24px_-8px_rgba(244,63,94,0.7)]"
                    : "bg-accent-grad shadow-accent-glow hover:brightness-110 border-accent-soft"
                )}
              >
                {confirmLabel}
              </motion.button>
              <motion.button
                whileTap={{ scale: 0.97 }}
                onClick={onCancel}
                className="h-9 px-4 rounded-lg text-[13.5px] font-medium text-white/75 bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.06] transition"
              >
                {cancelLabel}
              </motion.button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
