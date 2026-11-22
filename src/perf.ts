// Server performance sampling — the admin observability layer. An in-memory
// sample refreshes every 15s (the live panel polls it); every 4th tick lands
// in perf_samples (migration 44) and rows older than 7 days are pruned, so
// the table stays ~10k rows. Cross-platform best-effort: bandwidth comes
// from /proc/net/dev (Linux — the R220); on Windows dev it reads null.

import fs from "node:fs";
import os from "node:os";
import { monitorEventLoopDelay } from "node:perf_hooks";
import type { Store } from "./db/store";
import { config } from "./config";
import { heartbeat } from "./health";

const LIVE_MS = 15_000;
const PERSIST_EVERY = 4; // 4 × 15s = one DB row per minute
// Two weeks, not one: the weekly stability check reads this history, and a
// check that slips a day past 7d retention would lose its window.
const RETAIN_MS = 14 * 24 * 60 * 60 * 1000;

/** App-level counters, incremented by the HTTP router. */
export const perfCounters = { httpReqs: 0 };

let wsClientsFn: () => number = () => 0;
export function setWsClientCounter(fn: () => number): void {
  wsClientsFn = fn;
}

export interface PerfSample {
  at: number;
  /** Process CPU, percent of one core over the interval. */
  cpu: number;
  /** 1-min system load average (0 on Windows). */
  load1: number;
  rssMb: number;
  heapMb: number;
  memUsedMb: number;
  memTotalMb: number;
  diskUsedGb: number;
  diskFreeGb: number;
  /** System-wide non-loopback traffic (null where /proc/net/dev is absent). */
  netRxKbps: number | null;
  netTxKbps: number | null;
  wsClients: number;
  /** HTTP requests served during the interval. */
  httpReqs: number;
  /** Event-loop delay over the interval, ms: the 99th percentile and the
   *  worst. Live only (not persisted). Every game socket is served from this
   *  one loop, so a held loop is what a player feels as a hitch — their move
   *  frames queue up and arrive together. */
  loopP99Ms: number;
  loopMaxMs: number;
}

/** A held loop worth naming in the log (journal + the Admin Panel's live
 *  log): long enough that a runner's frames bunch up, which used to snap
 *  them back (Oct 2026). The line carries the time, so it can be read
 *  against whatever else was logged around it. */
const STALL_LOG_MS = 200;
const STALL_TICK_MS = 100;
let stallsSince = 0;

function readNetTotals(): { rx: number; tx: number } | null {
  try {
    const raw = fs.readFileSync("/proc/net/dev", "utf8");
    let rx = 0;
    let tx = 0;
    for (const line of raw.split("\n").slice(2)) {
      const parts = line.trim().split(/[:\s]+/).filter(Boolean);
      if (parts.length < 10 || parts[0] === "lo") continue;
      rx += Number(parts[1]) || 0;
      tx += Number(parts[9]) || 0;
    }
    return { rx, tx };
  } catch {
    return null;
  }
}

function diskStats(): { usedGb: number; freeGb: number } {
  try {
    const s = fs.statfsSync(config.dataDir);
    const total = s.blocks * s.bsize;
    const free = s.bavail * s.bsize;
    return { usedGb: (total - free) / 1e9, freeGb: free / 1e9 };
  } catch {
    return { usedGb: 0, freeGb: 0 };
  }
}

let latest: PerfSample | null = null;
export function liveSample(): PerfSample | null {
  return latest;
}

/** Stalls logged since boot (the weekly report's one-line count). */
export function loopStalls(): number {
  return stallsSince;
}

export function startPerfSampler(store: Store): () => void {
  let prevCpu = process.cpuUsage();
  let prevNet = readNetTotals();
  let prevAt = Date.now();
  let tick = 0;
  let minuteReqs = 0;
  const loop = monitorEventLoopDelay({ resolution: 20 });
  loop.enable();
  // The stall watch: a 100ms timer that notices when it ran late.
  let expect = Date.now() + STALL_TICK_MS;
  const watch = setInterval(() => {
    const now = Date.now();
    const late = now - expect;
    expect = now + STALL_TICK_MS;
    if (late >= STALL_LOG_MS) {
      stallsSince++;
      console.warn(`[perf] event loop held ${late}ms (${wsClientsFn()} sockets)`);
    }
  }, STALL_TICK_MS);
  watch.unref?.();

  const sample = () => {
    const now = Date.now();
    const dtMs = Math.max(1, now - prevAt);
    const cpu = process.cpuUsage();
    const cpuPct = ((cpu.user + cpu.system - prevCpu.user - prevCpu.system) / 1000 / dtMs) * 100;
    prevCpu = cpu;

    const net = readNetTotals();
    let rxKbps: number | null = null;
    let txKbps: number | null = null;
    if (net && prevNet) {
      rxKbps = ((net.rx - prevNet.rx) * 8) / dtMs; // bytes/ms → kbit/s
      txKbps = ((net.tx - prevNet.tx) * 8) / dtMs;
    }
    prevNet = net;
    prevAt = now;

    const mem = process.memoryUsage();
    const disk = diskStats();
    const s: PerfSample = {
      at: now,
      cpu: Math.round(cpuPct * 10) / 10,
      load1: Math.round((os.loadavg()[0] ?? 0) * 100) / 100,
      rssMb: Math.round(mem.rss / 1e6),
      heapMb: Math.round(mem.heapUsed / 1e6),
      memUsedMb: Math.round((os.totalmem() - os.freemem()) / 1e6),
      memTotalMb: Math.round(os.totalmem() / 1e6),
      diskUsedGb: Math.round(disk.usedGb * 100) / 100,
      diskFreeGb: Math.round(disk.freeGb * 100) / 100,
      netRxKbps: rxKbps === null ? null : Math.round(rxKbps),
      netTxKbps: txKbps === null ? null : Math.round(txKbps),
      wsClients: wsClientsFn(),
      httpReqs: perfCounters.httpReqs,
      loopP99Ms: Math.round(loop.percentile(99) / 1e5) / 10,
      loopMaxMs: Math.round(loop.max / 1e5) / 10,
    };
    loop.reset();
    perfCounters.httpReqs = 0;
    latest = s;

    // The persisted row is a MINUTE (Oct 2026 review): it carried only its
    // last 15-second sample's requests, so "http max N/min" read about four
    // times low.
    minuteReqs += s.httpReqs;
    tick++;
    if (tick % PERSIST_EVERY === 0) {
      store.perfInsert({ ...s, httpReqs: minuteReqs });
      minuteReqs = 0;
      store.perfPrune(now - RETAIN_MS);
    }
  };

  sample(); // seed the live panel immediately (its counts start the first minute)
  const t = setInterval(() => {
    heartbeat("perf sampler", LIVE_MS);
    sample();
  }, LIVE_MS);
  t.unref?.();
  return () => {
    clearInterval(t);
    clearInterval(watch);
    loop.disable();
  };
}
