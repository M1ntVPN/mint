import {
  Power,
  LayoutGrid,
  Settings as SettingsIcon,
  ScrollText,
} from "lucide-react";
import { cn } from "../utils/cn";
import type { PageKey } from "./Sidebar";

// `tunneling` is intentionally absent: per-app routing requires the
// `disallowedApplications` builder on Android's VpnService and is wired
// through tauri-plugin-mintvpn's `start_vpn` args, but we do NOT expose
// the rules-editor UI on Android because (a) the desktop UI assumes an
// IP/CIDR + process-name model that doesn't translate to Android (where
// the unit is the package name, not a route), and (b) the user
// explicitly asked to hide this tab on mobile. Desktop sidebar still
// shows it via `Sidebar.tsx`.
const NAV: { key: PageKey; label: string; icon: React.ComponentType<{ size?: number }> }[] = [
  { key: "home", label: "Главная", icon: Power },
  { key: "profiles", label: "Профили", icon: LayoutGrid },
  { key: "settings", label: "Настройки", icon: SettingsIcon },
  { key: "logs", label: "Логи", icon: ScrollText },
];

interface Props {
  page: PageKey;
  setPage: (p: PageKey) => void;
}

export function MobileNav({ page, setPage }: Props) {
  return (
    <nav
      className="shrink-0 border-t border-white/[0.06] bg-ink-900/80 backdrop-blur-xl"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <ul className="flex items-stretch justify-around px-1 py-1.5">
        {NAV.map(({ key, label, icon: Icon }) => {
          const active = page === key;
          return (
            <li key={key} className="flex-1">
              <button
                type="button"
                onClick={() => setPage(key)}
                className={cn(
                  "w-full flex flex-col items-center justify-center gap-0.5 py-1.5 rounded-xl transition-colors",
                  active
                    ? "text-white bg-gradient-to-b from-[rgba(var(--accent-rgb),0.15)] to-[rgba(var(--accent-rgb),0.05)]"
                    : "text-white/55 hover:text-white/85 active:bg-white/[0.04]"
                )}
              >
                <Icon size={20} />
                <span className="text-[10.5px] leading-none mt-0.5">{label}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
