// HOST DIAGNOSTICS (F6 — Josh: "so host can see things like bandwidth
// utilization, storage stats, cpu usage, ram utilization, etc").
//
// A 10-second sampler; the panel's Diagnostics tab reads the latest sample
// from /api/status. Everything is plain OS introspection — no elevation
// (admin mode buys a Windows process zero extra performance; standard user
// reads all of this fine).
import os from "node:os";
import fs from "node:fs";
import { execFile } from "node:child_process";

export interface DiagSample {
  at: number;
  /** Whole-machine CPU busy, 0-100. */
  cpuPct: number;
  /** This daemon's share, 0-100 (one core = 100/cores). */
  daemonCpuPct: number;
  ramTotal: number;
  ramFree: number;
  daemonRss: number;
  /** The drive the community lives on. */
  diskTotal: number;
  diskFree: number;
  /** Whole-machine network rates, bytes/sec (Windows: netstat -e deltas). */
  netInBps: number;
  netOutBps: number;
}

let latest: DiagSample | null = null;
let prevCpus = os.cpus();
let prevProc = process.cpuUsage();
let prevAt = Date.now();
let prevNet: { rx: number; tx: number } | null = null;

function cpuDelta(): { total: number; daemon: number } {
  const now = os.cpus();
  let idle = 0;
  let all = 0;
  for (let i = 0; i < now.length; i++) {
    const a = now[i].times;
    const b = prevCpus[i]?.times ?? a;
    idle += a.idle - b.idle;
    all += a.user - b.user + (a.nice - b.nice) + (a.sys - b.sys) + (a.irq - b.irq) + (a.idle - b.idle);
  }
  prevCpus = now;
  const proc = process.cpuUsage();
  const wallUs = (Date.now() - prevAt) * 1000 * now.length;
  const daemonUs = proc.user - prevProc.user + (proc.system - prevProc.system);
  prevProc = proc;
  return {
    total: all > 0 ? Math.min(100, Math.max(0, (1 - idle / all) * 100)) : 0,
    daemon: wallUs > 0 ? Math.min(100, (daemonUs / wallUs) * 100) : 0,
  };
}

/** Interface byte totals since boot. Linux reads /proc/net/dev (every
 *  non-loopback interface summed — the hub's perf layer's approach);
 *  Windows execs `netstat -e` — the price of "bandwidth utilization" on an
 *  OS with no /proc/net/dev. */
function readNet(cb: (v: { rx: number; tx: number } | null) => void): void {
  if (process.platform === "linux") {
    try {
      let rx = 0, tx = 0;
      for (const line of fs.readFileSync("/proc/net/dev", "utf8").split("\n").slice(2)) {
        const m = /^\s*([^:\s]+):\s*(\d+)(?:\s+\d+){7}\s+(\d+)/.exec(line);
        if (m && m[1] !== "lo") { rx += Number(m[2]); tx += Number(m[3]); }
      }
      return cb({ rx, tx });
    } catch { return cb(null); }
  }
  if (process.platform !== "win32") return cb(null);
  execFile("netstat", ["-e"], { timeout: 4000 }, (err, out) => {
    if (err) return cb(null);
    // "Bytes" covers English; the fallback takes the FIRST data row with
    // exactly two integer columns — which is the bytes row on every locale
    // ("Octets", "Bytes", …) since it always leads the statistics table.
    const m = /Bytes\s+(\d+)\s+(\d+)/.exec(out)
      ?? /^\s*[^\d\s][^\d\n]*?(\d+)\s+(\d+)\s*$/m.exec(out);
    cb(m ? { rx: Number(m[1]), tx: Number(m[2]) } : null);
  });
}

/** `dir` is a getter: the drive being measured follows a storage move. */
export function startDiag(dir: () => string): void {
  const tick = (): void => {
    readNet((net) => {
      const now = Date.now();
      const dt = Math.max(1, (now - prevAt) / 1000);
      const cpu = cpuDelta();
      let disk = { total: 0, free: 0 };
      try {
        const s = fs.statfsSync(dir());
        disk = { total: s.blocks * s.bsize, free: s.bavail * s.bsize };
      } catch { /* leave zeros */ }
      let netIn = latest?.netInBps ?? 0;
      let netOut = latest?.netOutBps ?? 0;
      if (net && prevNet) {
        netIn = Math.max(0, (net.rx - prevNet.rx) / dt);
        netOut = Math.max(0, (net.tx - prevNet.tx) / dt);
      }
      if (net) prevNet = net;
      prevAt = now;
      latest = {
        at: now,
        cpuPct: Math.round(cpu.total * 10) / 10,
        daemonCpuPct: Math.round(cpu.daemon * 10) / 10,
        ramTotal: os.totalmem(),
        ramFree: os.freemem(),
        daemonRss: process.memoryUsage.rss(),
        diskTotal: disk.total,
        diskFree: disk.free,
        netInBps: Math.round(netIn),
        netOutBps: Math.round(netOut),
      };
    });
  };
  tick();
  setInterval(tick, 10_000).unref?.();
}

export function diagSample(): DiagSample | null {
  return latest;
}
