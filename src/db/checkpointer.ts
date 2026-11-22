// THE WAL CHECKPOINT, OFF THE EVENT LOOP (Oct 2026).
//
// SQLite's automatic checkpoint runs INSIDE whichever commit pushes the WAL
// past 1,000 pages, and it syncs the main database file to disk before that
// commit returns. Node's sqlite is synchronous, so the commit that drew the
// short straw held the whole server — measured on the R220 at ~0.3-0.4s every
// five minutes, landing on the exchange's minute-bar flush. Every game socket
// is served from that one loop, so a held loop is a Backrooms runner's move
// frames queuing up and arriving together.
//
// So the main connection's auto-checkpoint is switched OFF and a worker
// thread with its OWN connection runs `wal_checkpoint(PASSIVE)` on a clock.
// PASSIVE never waits on a writer or a reader; it copies what it can and
// leaves the rest for the next pass, and the disk sync happens on the
// worker's thread. If the worker ever dies, auto-checkpoint is switched back
// ON at once — a WAL with nobody checkpointing it grows without limit, which
// is a worse failure than the hitch this exists to remove.

import { Worker } from "node:worker_threads";
import type { Store } from "./store";
import { heartbeat } from "../health";

/** The page count SQLite checkpoints at by default — restored on failure. */
export const AUTO_CHECKPOINT_PAGES = 1000;

const WORKER_SRC = `
const { parentPort, workerData } = require("node:worker_threads");
const { DatabaseSync } = require("node:sqlite");
const db = new DatabaseSync(workerData.dbPath);
db.exec("PRAGMA busy_timeout = 5000;");
const pass = () => {
  try {
    const r = db.prepare("PRAGMA wal_checkpoint(PASSIVE)").get();
    parentPort.postMessage({ ok: true, busy: r.busy, log: r.log, done: r.checkpointed });
  } catch (e) {
    parentPort.postMessage({ ok: false, error: String(e && e.message || e) });
  }
};
pass();
setInterval(pass, workerData.everyMs);
`;

export interface CheckpointStats {
  passes: number;
  lastLog: number;
  lastDone: number;
  failures: number;
}

/**
 * Start the checkpointer for the database at `dbPath`. Returns a stop
 * function that terminates the worker and hands checkpointing back to SQLite.
 */
export function startCheckpointer(store: Store, dbPath: string, everyMs = 30_000): { stop: () => void; kill: () => void; stats: CheckpointStats } {
  const stats: CheckpointStats = { passes: 0, lastLog: 0, lastDone: 0, failures: 0 };
  let stopped = false;
  let worker: Worker | null = null;
  let restartTimer: NodeJS.Timeout | null = null;

  const handBack = (why: string) => {
    store.setAutoCheckpoint(AUTO_CHECKPOINT_PAGES);
    if (!stopped) console.warn(`[db] checkpoint worker ${why} — SQLite checkpoints on its own again`);
  };

  const launch = () => {
    if (stopped) return;
    const w = new Worker(WORKER_SRC, { eval: true, workerData: { dbPath, everyMs } });
    worker = w;
    w.unref();
    let first = true;
    let failedInARow = 0;
    w.on("message", (m: { ok: boolean; busy?: number; log?: number; done?: number; error?: string }) => {
      if (!m.ok) {
        stats.failures++;
        console.warn(`[db] checkpoint pass failed: ${m.error}`);
        // A worker that stays alive but fails every pass is a WAL nobody
        // checkpoints (Oct 2026 review): hand the job back and restart it.
        if (++failedInARow >= 5) void w.terminate();
        return;
      }
      failedInARow = 0;
      // Only once a pass has actually run do we take the job off SQLite.
      if (first) {
        first = false;
        store.setAutoCheckpoint(0);
      }
      stats.passes++;
      stats.lastLog = m.log ?? 0;
      stats.lastDone = m.done ?? 0;
      heartbeat("wal checkpoint", everyMs * 3);
    });
    const down = (why: string) => {
      if (worker !== w) return;
      worker = null;
      handBack(why);
      // Try again in a minute; until then SQLite does it the old way.
      if (!stopped) {
        restartTimer = setTimeout(launch, 60_000);
        restartTimer.unref?.();
      }
    };
    w.on("error", (e) => down(`failed (${e.message})`));
    w.on("exit", (code) => down(`exited (${code})`));
  };

  launch();
  return {
    stats,
    /** Terminate the worker as a crash would (the harness's way in). */
    kill: () => void worker?.terminate(),
    stop: () => {
      stopped = true;
      if (restartTimer) clearTimeout(restartTimer);
      const w = worker;
      worker = null;
      store.setAutoCheckpoint(AUTO_CHECKPOINT_PAGES);
      void w?.terminate();
    },
  };
}
