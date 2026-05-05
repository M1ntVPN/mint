import { motion, AnimatePresence } from "framer-motion";
import { Edit2, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { cn } from "../utils/cn";

interface Props {
  open: boolean;
  title: string;
  initialName: string;
  initialDescription?: string;
  namePlaceholder?: string;
  descriptionPlaceholder?: string;
  onSave: (name: string, description: string) => void;
  onClose: () => void;
}

export function EditDetailsDialog({
  open,
  title,
  initialName,
  initialDescription,
  namePlaceholder = "Название",
  descriptionPlaceholder = "Короткая заметка — видна в списке под названием",
  onSave,
  onClose,
}: Props) {
  const [name, setName] = useState(initialName);
  const [description, setDescription] = useState(initialDescription ?? "");
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setName(initialName);
    setDescription(initialDescription ?? "");
    const t = window.setTimeout(() => {
      nameRef.current?.focus();
      nameRef.current?.select();
    }, 80);
    return () => window.clearTimeout(t);
  }, [open, initialName, initialDescription]);

  const submit = () => {
    const n = name.trim();
    if (!n) return;
    onSave(n, description.trim());
    onClose();
  };

  const nameChanged = name.trim() !== initialName.trim();
  const descChanged = description.trim() !== (initialDescription ?? "").trim();
  const canSave = !!name.trim() && (nameChanged || descChanged);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[120] flex items-center justify-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onMouseDown={(e) => {
            e.stopPropagation();
          }}
          onClick={(e) => {
            e.stopPropagation();
            if (e.target === e.currentTarget) onClose();
          }}
        >
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
          <motion.div
            initial={{ opacity: 0, y: 14, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 14, scale: 0.97 }}
            transition={{ duration: 0.22 }}
            onClick={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
            className="relative w-[440px] max-w-[92vw] rounded-2xl bg-ink-900/95 border border-white/10 p-5 shadow-2xl"
          >
            <div className="flex items-center gap-2 mb-4">
              <div className="w-8 h-8 rounded-lg bg-accent-soft border border-accent-soft grid place-items-center">
                <Edit2 size={15} className="text-accent-300" />
              </div>
              <div className="text-[15px] font-semibold text-white/95 truncate">
                {title}
              </div>
              <button
                onClick={onClose}
                className="ml-auto w-7 h-7 rounded-md hover:bg-white/5 grid place-items-center text-white/45 hover:text-white/90"
              >
                <X size={14} />
              </button>
            </div>

            <label className="text-[12px] text-white/55 mb-1 block">
              Имя
            </label>
            <input
              ref={nameRef}
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  submit();
                }
                if (e.key === "Escape") onClose();
              }}
              placeholder={namePlaceholder}
              className="w-full h-10 px-3 rounded-lg bg-white/[0.04] border border-white/10 outline-none text-[14px] text-white/90 placeholder:text-white/30 focus:border-[rgba(var(--accent-rgb),0.4)] transition"
            />

            <label className="text-[12px] text-white/55 mt-4 mb-1 block">
              Описание
              <span className="text-white/30 text-[11px] ml-1">
                — необязательно
              </span>
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault();
                  submit();
                }
                if (e.key === "Escape") onClose();
              }}
              placeholder={descriptionPlaceholder}
              rows={3}
              className="w-full px-3 py-2 rounded-lg bg-white/[0.04] border border-white/10 outline-none text-[13.5px] text-white/85 placeholder:text-white/30 focus:border-[rgba(var(--accent-rgb),0.4)] transition resize-none leading-relaxed"
            />

            <div className="flex items-center justify-between gap-2 mt-5">
              <button
                onClick={submit}
                disabled={!canSave}
                className={cn(
                  "h-10 px-4 rounded-lg text-[13.5px] font-medium transition",
                  !canSave
                    ? "bg-white/[0.05] text-white/45 cursor-not-allowed"
                    : "bg-accent-grad text-white shadow-accent-glow hover:brightness-110"
                )}
              >
                Сохранить
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
