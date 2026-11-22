// THE WORKSTATION'S GPU MEMORY, JUDGED (Josh, Nov 1 2026: "a watcher that watches and maintains my
// gpu memory and lets me know if a restart is needed").
//
// The 3090 Ti carries the 26B model (~17 GB), the stream page (~3 GB) and the Windows desktop. On
// Oct 31 the stream ran out of memory because Windows' desktop compositor (dwm) had crept to 8.6 GB
// over a long uptime; after a reboot it held 0.8 GB and everything fit. Nothing but a restart shrinks
// dwm, so that is the one thing the watcher can't fix and has to tell Josh about.
//
// Pure, import-free: deploy/workstation/gpu-watch.ps1 measures, the server (gpuwatch.ts) judges with
// this, and the harness drives it directly.

export interface GpuSample {
  usedMb: number;
  totalMb: number;
  /** the biggest users of dedicated memory, largest first */
  procs: { name: string; mb: number }[];
}

export type GpuLevel = "ok" | "watch" | "restart" | "full";

export interface GpuVerdict {
  level: GpuLevel;
  /** red in the health check (Sterling DMs on it) */
  alarm: boolean;
  detail: string;
}

/** dwm past this is the creep a restart cures (normal is under 1 GB). */
export const DWM_RESTART_MB = 3000;
/** dwm past this is worth watching. */
export const DWM_WATCH_MB = 1800;
/** less than this free and the stream page's next zone load can lose its WebGL context. */
export const FREE_FULL_MB = 1200;
/** less than this free is worth watching. */
export const FREE_WATCH_MB = 2500;

const gb = (mb: number): string => (mb / 1024).toFixed(1) + " GB";

export function gpuVerdict(s: GpuSample): GpuVerdict {
  const free = Math.max(0, s.totalMb - s.usedMb);
  const dwm = s.procs.filter((p) => p.name.toLowerCase() === "dwm").reduce((a, p) => a + p.mb, 0);
  const top = s.procs.filter((p) => p.name.toLowerCase() !== "dwm").slice(0, 3)
    .map((p) => `${p.name} ${gb(p.mb)}`).join(", ");
  const card = `${gb(s.usedMb)} of ${gb(s.totalMb)} used`;

  if (dwm >= DWM_RESTART_MB) {
    return { level: "restart", alarm: true,
      detail: `restart the PC: Windows' desktop (dwm) has grown to ${gb(dwm)} and only a restart shrinks it · ${card}` };
  }
  if (free < FREE_FULL_MB) {
    return dwm >= DWM_WATCH_MB
      ? { level: "restart", alarm: true, detail: `restart the PC: the card is nearly full (${gb(free)} free) and Windows' desktop (dwm) holds ${gb(dwm)} · ${card}` }
      : { level: "full", alarm: true, detail: `the card is nearly full (${gb(free)} free) — biggest users: ${top || "unknown"} · ${card}` };
  }
  if (dwm >= DWM_WATCH_MB || free < FREE_WATCH_MB) {
    return { level: "watch", alarm: false, detail: `watching: ${gb(free)} free, dwm ${gb(dwm)} · ${card}` };
  }
  return { level: "ok", alarm: false, detail: `${gb(free)} free, dwm ${gb(dwm)} · ${card}` };
}
