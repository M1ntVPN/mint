import { create } from "zustand";

export interface LogEntry {
  t: string;
  lvl: string;
  src: string;
  msg: string;
}

const MAX_ENTRIES = 5000;

interface LogsState {
  entries: LogEntry[];
  push: (e: LogEntry) => void;
  clear: () => void;
}

export const useLogs = create<LogsState>((set) => ({
  entries: [],
  push: (entry) =>
    set((state) => {
      const next = [entry, ...state.entries];
      return { entries: next.length > MAX_ENTRIES ? next.slice(0, MAX_ENTRIES) : next };
    }),
  clear: () => set({ entries: [] }),
}));

// sing-box logs every individual TCP write/read failure on TUN inbound at
// ERROR level — including connection resets from the *remote* peer mid-flow
// (think: a server closing keepalive sockets, RKN injecting TCP RSTs into
// VLESS-Reality flows, mobile NAT rebinding, normal HTTP/1.1 close-after-
// response). For us these are not actionable engine errors; they're just
// upstream network turbulence that the user can't do anything about, and
// flooding the UI logs with red ERROR rows ("ERROR [upload] write tcp …
// wsasend: An existing connection was forcibly closed by the remote host"
// repeating dozens of times during a single download) hides actual engine
// problems and makes the user think the VPN is broken.
//
// We downgrade these to DEBUG so they're still captured (full stream is in
// the log buffer for export) but don't surface in the default INFO/WARN/
// ERROR filter view.
const NOISY_NETWORK_ERROR_PATTERNS: readonly RegExp[] = [
  // Windows: WSAECONNRESET / WSAECONNABORTED text from wsasend / wsarecv.
  /existing connection was forcibly closed by the remote host/i,
  /established connection was aborted by the software in your host machine/i,
  // POSIX equivalents that show up in sing-box's Go runtime errors.
  /connection reset by peer/i,
  /broken pipe/i,
  // Go's net package returns this when one side has already called Close().
  /use of closed network connection/i,
  // Tail-end of the error chain when the downstream (VPN client) closes
  // mid-flush. Common with modern browsers that aggressively cancel
  // pre-fetched requests.
  /\bEOF\b.*\b(write|read|copy)\b/i,
  // IPv6 unreachable on dual-stack DNS / IPv4-only ISP. Windows
  // returns `connectex: A socket operation was attempted to an
  // unreachable network` for every IPv6 dial when the user's ISP
  // hasn't given them an IPv6 prefix; sing-box retries on IPv4 and
  // succeeds, so the connection ends up working — but each retry
  // gets logged as ERROR, flooding the UI with rows like
  // `dial tcp [2a01:bc80:8:100::9b85:fc06]:80: connectex: A socket
  // operation was attempted to an unreachable network` repeated
  // 5-10 times per page load. Not actionable from the user's side.
  /socket operation was attempted to an unreachable network/i,
  // POSIX equivalent of the same condition.
  /network is unreachable/i,
  /no route to host/i,
];

export function parseEngineLine(raw: string): LogEntry {
  const t = new Date().toISOString().slice(11, 23);
  const stripped = raw.replace(/\u001b\[[0-9;]*m/g, "").trimEnd();

  const lvlMatch = stripped.match(/\b(INFO|WARN|WARNING|ERROR|FATAL|DEBUG|TRACE)\b/);
  let lvl = lvlMatch ? lvlMatch[1].toUpperCase() : "INFO";
  if (lvl === "WARNING") lvl = "WARN";
  if (lvl === "FATAL") lvl = "ERROR";
  if (lvl === "TRACE") lvl = "DEBUG";

  let src = "core";
  const mod1 = stripped.match(/\s([a-zA-Z][\w/-]*)\s*:\s/);
  const mod2 = stripped.match(/\[([a-zA-Z][\w/-]*)\]/);
  if (mod1) src = mod1[1];
  else if (mod2) src = mod2[1];

  let msg = stripped;
  if (lvlMatch) {
    const idx = stripped.indexOf(lvlMatch[0]);
    msg = stripped.slice(idx + lvlMatch[0].length).replace(/^[\s:[\]]+/, "").trim();
  }
  if (!msg) msg = stripped;

  if (lvl === "ERROR" && NOISY_NETWORK_ERROR_PATTERNS.some((re) => re.test(msg))) {
    lvl = "DEBUG";
  }

  return { t, lvl, src, msg };
}
