// The operator's log window: wraps console.* so the last N lines are
// readable from the Admin Panel without SSH. Install FIRST (before anything
// logs) — index.ts imports this at the top. The original console methods
// keep working untouched (journalctl still gets everything).

interface LogLine {
  at: number;
  level: "log" | "warn" | "error";
  line: string;
}

const RING_MAX = 1500; // ~300KB worst case — enough scrollback to outlive a busy stretch
const ring: LogLine[] = [];
let nextId = 1;
const ids: number[] = []; // parallel to ring — monotonically increasing ids
// A per-process boot marker. The ids restart at 1 on every restart, so a
// client that keeps polling with a stale-high `after` (its value from before
// a deploy) would see an empty result FOREVER — the live-log window froze
// after every deploy until a full page reload. The client compares this and
// resets its cursor when it changes.
const EPOCH = Date.now();
export function logEpoch(): number {
  return EPOCH;
}

function push(level: LogLine["level"], args: unknown[]): void {
  try {
    const line = args
      .map((a) => {
        if (typeof a === "string") return a;
        if (a instanceof Error) return `${a.message}\n${a.stack ?? ""}`;
        try {
          return JSON.stringify(a);
        } catch {
          return String(a);
        }
      })
      .join(" ")
      .slice(0, 2000);
    ring.push({ at: Date.now(), level, line });
    ids.push(nextId++);
    if (ring.length > RING_MAX) {
      ring.shift();
      ids.shift();
    }
  } catch {
    /* logging must never throw */
  }
}

export function installLogBuffer(): void {
  const orig = { log: console.log, warn: console.warn, error: console.error };
  console.log = (...a: unknown[]) => {
    push("log", a);
    orig.log(...a);
  };
  console.warn = (...a: unknown[]) => {
    push("warn", a);
    orig.warn(...a);
  };
  console.error = (...a: unknown[]) => {
    push("error", a);
    orig.error(...a);
  };
}

/** Lines after `afterId` (0 = everything buffered), oldest first. */
export function readLog(afterId = 0): { id: number; at: number; level: string; line: string }[] {
  const out: { id: number; at: number; level: string; line: string }[] = [];
  for (let i = 0; i < ring.length; i++) {
    if (ids[i] > afterId) out.push({ id: ids[i], ...ring[i] });
  }
  return out;
}
