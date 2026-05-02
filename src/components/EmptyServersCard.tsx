import { useState } from "react";
import { motion } from "framer-motion";
import { Plus, Link2 } from "lucide-react";
import { AddServerDialog } from "./AddServerDialog";
import { useTheme } from "../theme";

export function EmptyServersCard() {
  const [open, setOpen] = useState<null | "uri" | "subscription">(null);
  const { iconVariant } = useTheme();
  const brandSrc = iconVariant === "leaf" ? "/mint-leaf.png" : "/mint-shield.png";
  return (
    <>
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="w-full h-full rounded-2xl bg-gradient-to-b from-white/[0.04] to-white/[0.015] border border-white/[0.07] p-6 flex flex-col items-center justify-center text-center"
      >
        <img
          src={brandSrc}
          alt="Mint"
          draggable={false}
          className="w-14 h-14 object-contain pointer-events-none select-none mb-3"
        />
        <div className="text-[15px] font-semibold text-white">Список серверов пуст</div>
        <div className="mt-4 flex items-center gap-2">
          <button
            onClick={() => setOpen("uri")}
            className="flex items-center gap-1.5 h-9 px-3.5 rounded-lg bg-accent-grad text-white text-[12.5px] font-semibold shadow-accent-glow"
          >
            <Plus size={14} />
            Добавить сервер
          </button>
          <button
            onClick={() => setOpen("subscription")}
            className="flex items-center gap-1.5 h-9 px-3.5 rounded-lg bg-white/[0.05] border border-white/[0.08] text-white/85 text-[12.5px] font-medium hover:bg-white/[0.08] transition-colors"
          >
            <Link2 size={14} />
            Подписка по ссылке
          </button>
        </div>
      </motion.div>
      <AddServerDialog
        open={open !== null}
        onClose={() => setOpen(null)}
        initialTab={open ?? undefined}
      />
    </>
  );
}
