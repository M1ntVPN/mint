import { motion, AnimatePresence } from "framer-motion";
import { AlertTriangle, X } from "lucide-react";
import { ConnectButton } from "./ConnectButton";
import { StatsCards } from "./StatsCards";
import { ServersList } from "./ServersList";
import { EmptyServersCard } from "./EmptyServersCard";
import { useServers, type SavedServer } from "../store/servers";
import type { ConnState, Server } from "../types";


interface Props {
  state: ConnState;
  toggle: () => void;
  uptime: number;
  ping: number;
  down: number;
  up: number;
  selectedId: string | null;
  setSelectedId: (id: string) => void;
  connectError?: string | null;
  dismissConnectError?: () => void;
}

function toListServer(s: SavedServer): Server {
  return {
    id: s.id,
    name: s.name,
    country: s.country ?? "—",
    flag: s.flag ?? "🌐",
    ping: s.ping ?? 0,
    load: s.load ?? 0,
    city: s.city,
    protocol: s.protocol,
    premium: false,
  };
}

export function Dashboard(props: Props) {
  const savedServers = useServers((st) => st.servers);
  const listServers = savedServers.map(toListServer);
  const selectedServer = props.selectedId
    ? savedServers.find((s) => s.id === props.selectedId)
    : undefined;
  return (
    <div className="relative h-full overflow-hidden flex flex-col">
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(circle at 55% 32%, rgba(var(--accent-rgb),0.18), transparent 45%), radial-gradient(circle at 50% 90%, rgba(16,185,129,0.10), transparent 60%)",
        }}
      />

      <div className="relative shrink-0">
        <div className="px-8 pt-8 pb-4 flex flex-col items-center max-[720px]:px-4 max-[720px]:pt-5 max-[720px]:pb-3">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.35, ease: "easeOut" }}
            className="relative"
          >
            <ConnectButton
              state={props.state}
              onClick={props.toggle}
              serverName={selectedServer?.name}
              serverCountry={selectedServer?.country}
              serverFlag={selectedServer?.flag}
            />
          </motion.div>
          <AnimatePresence>
            {props.connectError && (
              <motion.div
                key="connect-error"
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                className="mt-4 max-w-[520px] w-full px-3.5 py-2.5 rounded-xl bg-rose-500/10 border border-rose-400/30 text-rose-200 text-[12.5px] flex items-start gap-2"
              >
                <AlertTriangle size={14} className="shrink-0 mt-[2px]" />
                <div className="flex-1 leading-snug">{props.connectError}</div>
                <button
                  onClick={props.dismissConnectError}
                  className="text-rose-200/70 hover:text-rose-100 shrink-0"
                >
                  <X size={14} />
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <div className="px-6 space-y-3 pb-3 max-[720px]:px-3 max-[720px]:pb-2">
          <StatsCards
            state={props.state}
            uptime={props.uptime}
            ping={props.ping}
            down={props.down}
            up={props.up}
          />
        </div>
      </div>

      <div className="relative flex-1 min-h-0 px-6 pb-6 flex max-[720px]:px-3 max-[720px]:pb-3">
        {listServers.length === 0 ? (
          <EmptyServersCard />
        ) : (
          <ServersList
            servers={listServers}
            selectedId={props.selectedId}
            onSelect={props.setSelectedId}
          />
        )}
      </div>
    </div>
  );
}
