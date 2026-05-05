import { motion, AnimatePresence } from "framer-motion";
import { FolderPlus, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useFolders } from "../store/folders";
import { cn } from "../utils/cn";

interface Props {
  open: boolean;
  onClose: () => void;
  onCreated?: (id: string) => void;
}

export function CreateFolderDialog({ open, onClose, onCreated }: Props) {
  const create = useFolders((s) => s.create);
  const [name, setName] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setName("");
      const t = window.setTimeout(() => inputRef.current?.focus(), 80);
      return () => window.clearTimeout(t);
    }
  }, [open]);

  const submit = () => {
    const id = create(name);
    onCreated?.(id);
    onClose();
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            onClose();
          }}
        >
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
          <motion.div
            initial={{ opacity: 0, y: 14, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 14, scale: 0.97 }}
            transition={{ duration: 0.22 }}
            onClick={(e) => e.stopPropagation()}
            className="relative w-[420px] rounded-2xl bg-ink-900/95 border border-white/10 p-5 shadow-2xl"
          >
            <div className="flex items-center gap-2 mb-4">
              <div className="w-8 h-8 rounded-lg bg-accent-soft border-accent-soft border grid place-items-center">
                <FolderPlus size={15} className="text-accent-300" />
              </div>
              <div className="text-[15px] font-semibold text-white/95">
                Новая папка
              </div>
              <button
                onClick={onClose}
                className="ml-auto w-7 h-7 rounded-md hover:bg-white/5 grid place-items-center text-white/45 hover:text-white/90"
              >
                <X size={14} />
              </button>
            </div>

            <label className="text-[12px] text-white/55 mb-1 block">
              Название
            </label>
            <input
              ref={inputRef}
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") submit();
                if (e.key === "Escape") onClose();
              }}
              placeholder="Например: Стриминг"
              className="w-full h-10 px-3 rounded-lg bg-white/[0.04] border border-white/10 outline-none text-[14px] text-white/90 placeholder:text-white/30 focus:border-[rgba(var(--accent-rgb),0.4)] transition"
            />

            <div className="flex items-center justify-between gap-2 mt-5">
              <button
                onClick={submit}
                disabled={!name.trim()}
                className={cn(
                  "h-10 px-4 rounded-lg text-white text-[13.5px] font-medium transition",
                  !name.trim()
                    ? "bg-white/[0.05] text-white/45 cursor-not-allowed"
                    : "bg-accent-grad shadow-accent-glow hover:brightness-110"
                )}
              >
                Создать
              </button>
              <button
                onClick={onClose}
                className="h-10 px-4 rounded-lg border border-white/10 bg-white/[0.04] text-[13.5px] text-white/85 hover:bg-white/[0.07] transition"
              >
                Отмена
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
