// THE WORKSTATION GPU WATCHER'S SERVER HALF (Josh, Nov 1 2026). deploy/workstation/gpu-watch.ps1
// measures the 3090 Ti once a minute and posts it here on the stream token; gpurule.ts judges it; a
// health check, "Workstation GPU memory", goes RED when a restart is needed or the card is nearly
// full — and red reaches Sterling's alert DMs like every other check. It also goes red when a watcher
// that was reporting stops (STALE_MS), so a dead watcher can't read as a healthy card. The watcher's
// -Uninstall says goodbye, which clears that.
import { bearer, json, type Router } from "../http";
import type { Store } from "../db/store";
import { registerHealthCheck } from "../health";
import { isStreamToken, streamTokenConfigured } from "./streamtoken";
import { gpuVerdict, type GpuSample, type GpuVerdict } from "./gpurule";

/** The watcher posts every minute; this long without one is a stopped watcher. */
export const GPU_STALE_MS = Number(process.env.SURVIVORZ_GPU_STALE_MS) || 10 * 60_000;
const KV_ON = "survivorz_gpu_watch_on";
const MAX_PROCS = 12;

export interface GpuReport extends GpuSample { at: number; verdict: GpuVerdict }

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : null);

/** A posted body → a sample, or null when it isn't one. */
export function cleanSample(b: unknown): GpuSample | null {
  const o = (b ?? {}) as Record<string, unknown>;
  const usedMb = num(o.usedMb), totalMb = num(o.totalMb);
  if (usedMb == null || totalMb == null || totalMb <= 0 || usedMb > totalMb * 1.05) return null;
  const procs = (Array.isArray(o.procs) ? o.procs : [])
    .map((p) => {
      const q = (p ?? {}) as Record<string, unknown>;
      const name = typeof q.name === "string" ? q.name.replace(/[^\w .-]/g, "").slice(0, 40) : "";
      const mb = num(q.mb);
      return name && mb != null ? { name, mb: Math.round(mb) } : null;
    })
    .filter((p): p is { name: string; mb: number } => p !== null)
    .sort((a, b) => b.mb - a.mb)
    .slice(0, MAX_PROCS);
  return { usedMb: Math.round(usedMb), totalMb: Math.round(totalMb), procs };
}

export function startGpuWatch(router: Router, store: Store): { report(): GpuReport | null } {
  let report: GpuReport | null = null;
  const on = (): boolean => store.kvGet(KV_ON) === "1";

  router.post("/api/survivorz/gpu", "none", ({ req, res, url, body }) => {
    if (!streamTokenConfigured()) return json(res, 404, { error: "not_found" });
    if (!isStreamToken(bearer(req, url))) return json(res, 401, { error: "unauthorized" });
    if ((body as { stopping?: unknown } | undefined)?.stopping === true) {
      store.kvDel(KV_ON);
      report = null;
      return json(res, 200, { ok: true });
    }
    const s = cleanSample(body);
    if (!s) return json(res, 400, { error: "bad_sample" });
    report = { ...s, at: Date.now(), verdict: gpuVerdict(s) };
    if (!on()) store.kvSet(KV_ON, "1");
    json(res, 200, { ok: true, verdict: report.verdict });
  });

  router.get("/api/admin/survivorz/gpu", "admin", ({ res }) => {
    json(res, 200, { configured: streamTokenConfigured(), watching: on(), report, age: report ? Date.now() - report.at : null });
  });

  if (streamTokenConfigured()) {
    const bootAt = Date.now();
    registerHealthCheck("Workstation GPU memory", () => {
      if (!on()) return null; // no watcher installed: no check
      if (!report) {
        return Date.now() - bootAt < GPU_STALE_MS
          ? { ok: true, detail: "waiting for the GPU watcher to report" }
          : { ok: false, detail: "the GPU watcher hasn't reported since this boot — is the Solace GPU Watch task running on the workstation?" };
      }
      const age = Date.now() - report.at;
      if (age > GPU_STALE_MS) return { ok: false, detail: `the GPU watcher's last report was ${Math.round(age / 60_000)} min ago — is the workstation on?` };
      return { ok: !report.verdict.alarm, detail: report.verdict.detail };
    });
  }

  return { report: () => report };
}
