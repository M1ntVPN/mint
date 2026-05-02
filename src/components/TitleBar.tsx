import { Minus, Square, X } from "lucide-react";

export function TitleBar() {
  const inTauri = !!(window as unknown as { __TAURI_INTERNALS__?: unknown })
    .__TAURI_INTERNALS__;

  const withWindow = (fn: (w: {
    minimize: () => Promise<void>;
    toggleMaximize: () => Promise<void>;
    close: () => Promise<void>;
  }) => Promise<void>) => async () => {
    if (!inTauri) return;
    try {
      const mod = await import("@tauri-apps/api/window");
      await fn(mod.getCurrentWindow());
    } catch (e) {
      console.warn("[mint] window control failed", e);
    }
  };

  return (
    <div
      data-tauri-drag-region
      className="h-9 flex items-center justify-end px-2 border-b border-white/[0.04] bg-ink-900/60 backdrop-blur-xl no-select select-none relative"
    >
      <div data-tauri-drag-region className="absolute inset-0" />

      <div className="relative flex items-center gap-0.5">
        <WindowButton
          onClick={withWindow((w) => w.minimize())}
          title="Свернуть"
          disabled={!inTauri}
        >
          <Minus size={13} />
        </WindowButton>
        <WindowButton
          onClick={withWindow((w) => w.toggleMaximize())}
          title="Развернуть"
          disabled={!inTauri}
        >
          <Square size={11} />
        </WindowButton>
        <WindowButton
          onClick={withWindow((w) => w.close())}
          title="Закрыть"
          danger
          disabled={!inTauri}
        >
          <X size={13} />
        </WindowButton>
      </div>
    </div>
  );
}

function WindowButton({
  onClick,
  title,
  danger,
  disabled,
  children,
}: {
  onClick: () => void;
  title: string;
  danger?: boolean;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      disabled={disabled}
      className={
        "w-9 h-7 rounded-md grid place-items-center text-white/55 transition " +
        (disabled
          ? "opacity-40 cursor-default"
          : danger
            ? "hover:text-white hover:bg-rose-500/80"
            : "hover:text-white hover:bg-white/[0.06]")
      }
    >
      {children}
    </button>
  );
}
