// Health checks + the sweep heartbeat registry — the Admin Panel's
// "is everything OK?" screen, and the signal source for Sterling's alerts.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { config } from "./config";
import type { Store } from "./db/store";
import { ER_MINT_TRIPWIRE, mintSilverEq } from "./casino/escape-loot";

// ---- Heartbeats: every background loop stamps itself so a silently dead
// sweep shows RED instead of nothing. expectedMs ≈ the loop interval.

const beats = new Map<string, { at: number; expectedMs: number }>();

const lastGood = new Map<string, number>();
export function heartbeat(name: string, expectedMs: number): void {
  const old = beats.get(name);
  lastGood.set(name, old?.at ?? 0);
  beats.set(name, { at: Date.now(), expectedMs });
}

/** For the loops that stamp BEFORE their work (their bodies return early in
 *  several places): a failed pass takes the stamp back to the last good one
 *  and lands in the errors table, so a loop failing every tick reads red and
 *  reaches the surge alert (Oct 2026 review — Sterling, the goblins, Voss and
 *  the Deep all logged to the console only and stayed green). */
export function beatFailed(store: Store | null, name: string, e: unknown): void {
  const b = beats.get(name);
  if (b) b.at = lastGood.get(name) ?? 0;
  console.error(`[${name}] tick failed:`, e);
  try {
    store?.recordError("server", `${name}: ${(e as Error)?.message ?? String(e)}`, (e as Error)?.stack ?? null, `sweep:${name}`);
  } catch { /* never the error */ }
}

/** Run one sweep pass the honest way: the work FIRST, the heartbeat only
 *  when it finished, and a throw recorded in the errors table (Sep 2026
 *  review: every loop stamped before its try block and logged failures to
 *  the console only, so a sweep throwing on every tick read GREEN on the
 *  health screen and never reached the surge alert). The stamp is skipped on
 *  failure, so a loop that keeps failing goes red on its own schedule. */
/** A sweep this slow holds the event loop long enough for players to feel
 *  it — logged by name, so a hitch can be traced to its sweep. */
const SLOW_TICK_MS = 150;

export function guardedTick(store: Store, name: string, expectedMs: number, work: () => void): void {
  // Known from its FIRST call (Oct 2026 review): a loop that had failed on
  // every tick since boot never reached the map, so it showed no row at all
  // rather than a red one. Registered now, it ages into red on its schedule.
  if (!beats.has(name)) beats.set(name, { at: Date.now(), expectedMs });
  try {
    const t0 = performance.now();
    work();
    const took = performance.now() - t0;
    if (took >= SLOW_TICK_MS) console.warn(`[perf] sweep "${name}" took ${Math.round(took)}ms`);
    heartbeat(name, expectedMs);
  } catch (e) {
    console.error(`[${name}] sweep failed:`, e);
    try {
      store.recordError("server", `${name}: ${(e as Error)?.message ?? String(e)}`, (e as Error)?.stack ?? null, `sweep:${name}`);
    } catch { /* never the error */ }
  }
}

export interface HealthCheck {
  name: string;
  ok: boolean;
  detail: string;
}

export const BACKUP_DIR = process.env.BACKUP_DIR ?? "/var/backups/solace";
const BACKUP_MAX_AGE_MS = 48 * 3_600_000;

// ---- LiveKit liveness ------------------------------------------------------
// The old check only said "configured" — a dead SFU stayed green until someone
// tried to join voice. A 60s background probe hits the configured URL over
// HTTP (in prod that's wss://…/livekit via Caddy, so it validates the exact
// path clients take). Any response below 500 = the SFU answered; a 502/503
// (Caddy up, LiveKit down), refusal, or timeout = red — which Sterling's
// alert sweep then DMs the admins about. Cached because health checks are
// synchronous.
//
// ONE MISSED PROBE IS NOT AN OUTAGE (Josh, Sep 2026: "why do i keep getting
// this alert"). In prod the probe leaves the box and comes back in through
// the router to reach solace.zone, and that round trip drops a request now
// and then while the SFU itself is fine — six of the nine alerts on record
// were single misses an hour or days apart, with LiveKit never restarting.
// Red now takes LK_FAILS_TO_RED misses IN A ROW (three minutes); a real
// outage, like Sep 17's, still goes red inside three minutes.

let lkProbe: { ok: boolean; detail: string } | null = null;
let lkFails = 0;
const LK_FAILS_TO_RED = Number(process.env.LIVEKIT_PROBE_FAILS ?? 3);

async function probeLivekit(): Promise<void> {
  const url = config.livekitUrl.replace(/^ws/, "http");
  let miss: string;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8000), redirect: "manual" });
    if (res.status < 500) {
      lkFails = 0;
      lkProbe = { ok: true, detail: `SFU answered (${res.status}) at ${config.livekitUrl}` };
      return;
    }
    miss = `upstream error ${res.status} — LiveKit down behind the proxy?`;
  } catch (e) {
    miss = `unreachable: ${String(e).slice(0, 100)}`;
  }
  lkFails++;
  lkProbe =
    lkFails >= LK_FAILS_TO_RED
      ? { ok: false, detail: `${miss} (${lkFails} probes in a row)` }
      : { ok: true, detail: `SFU missed ${lkFails} probe${lkFails === 1 ? "" : "s"} in a row — watching (${miss})` };
}

/** Start the background SFU probe (no-op when voice isn't configured). */
export function startLivekitProbe(): void {
  if (!config.livekitUrl) return;
  void probeLivekit();
  setInterval(() => void probeLivekit(), 60_000).unref();
}

// EXTRA CHECKS (Oct 13 2026): a module registers its own check here (the AI
// engine, the regulars' voices on slopbot) instead of health.ts importing it.
// A red one reaches Sterling's alert DMs like every other check.
const extraChecks = new Map<string, () => { ok: boolean; detail: string } | null>();
export function registerHealthCheck(name: string, fn: () => { ok: boolean; detail: string } | null): void {
  extraChecks.set(name, fn);
}

export function runHealthChecks(store: Store): HealthCheck[] {
  const checks: HealthCheck[] = [];
  const add = (name: string, ok: boolean, detail: string) => checks.push({ name, ok, detail });

  // Database: writable, migrations current.
  try {
    const probe = store.dbWriteProbe();
    add("Database writable", probe, probe ? "write probe OK" : "write probe FAILED");
  } catch (e) {
    add("Database writable", false, String(e).slice(0, 120));
  }

  // Disk headroom under the data dir.
  try {
    const s = fs.statfsSync(config.dataDir);
    const freeGb = (s.bavail * s.bsize) / 1024 ** 3;
    const totalGb = (s.blocks * s.bsize) / 1024 ** 3;
    const pct = totalGb > 0 ? (freeGb / totalGb) * 100 : 100;
    add("Disk space", pct > 10, `${freeGb.toFixed(1)} GB free (${pct.toFixed(0)}%)`);
  } catch {
    add("Disk space", true, "statfs unavailable on this platform");
  }

  // Memory pressure.
  const freeMemPct = (os.freemem() / os.totalmem()) * 100;
  add("System memory", freeMemPct > 8, `${freeMemPct.toFixed(0)}% free of ${(os.totalmem() / 1024 ** 3).toFixed(1)} GB`);

  // Backups: the silent killer — a stale newest archive means restores lie.
  try {
    if (fs.existsSync(BACKUP_DIR)) {
      const newest = fs
        .readdirSync(BACKUP_DIR)
        // Only the nightly's own archives: the emoji art tarball the setup
        // guide keeps in the same folder would read as a fresh backup.
        .filter((f) => /^solace-\d{8}-\d{6}\.tar\.gz$/.test(f))
        .map((f) => fs.statSync(path.join(BACKUP_DIR, f)).mtimeMs)
        .sort((a, b) => b - a)[0];
      if (newest === undefined) add("Backups", false, `no archives in ${BACKUP_DIR}`);
      else {
        const ageH = (Date.now() - newest) / 3_600_000;
        add("Backups", Date.now() - newest < BACKUP_MAX_AGE_MS, `newest archive ${ageH.toFixed(1)}h old`);
      }
    } else {
      add("Backups", true, `no backup dir on this machine (dev)`);
    }
  } catch (e) {
    add("Backups", false, String(e).slice(0, 120));
  }

  // LiveKit (voice) — a real liveness probe when configured, not just "keys
  // are present" (see probeLivekit above).
  if (!config.livekitUrl) add("Voice (LiveKit)", true, "not configured (voice hidden)");
  else if (lkProbe) add("Voice (LiveKit)", lkProbe.ok, lkProbe.detail);
  else add("Voice (LiveKit)", true, `probe starting… (${config.livekitUrl})`);

  for (const [name, fn] of extraChecks) {
    try {
      const r = fn();
      if (r) add(name, r.ok, r.detail);
    } catch (e) {
      add(name, false, String(e).slice(0, 120));
    }
  }

  // Sweep heartbeats — a loop 2.5× past its interval is presumed dead.
  const now = Date.now();
  for (const [name, b] of [...beats.entries()].sort((x, y) => x[0].localeCompare(y[0]))) {
    const age = now - b.at;
    add(`Loop: ${name}`, age < b.expectedMs * 2.5, `last ran ${(age / 1000).toFixed(0)}s ago (every ${(b.expectedMs / 1000).toFixed(0)}s)`);
  }

  // THE ESCAPE-ROOM MINT TRIPWIRE (E3b, ESCAPE.md): the chest tables are the
  // floor's one sanctioned mint; a day whose emission crosses the line goes
  // RED here, and Sterling escalates a red check like any other. The detail
  // always carries the number, so the panel reads the mint at a glance.
  try {
    const today = new Date().toISOString().slice(0, 10);
    const m = store.erMintDay(today);
    const eq = mintSilverEq(m);
    add(
      "Escape-room mint",
      eq <= ER_MINT_TRIPWIRE,
      `${eq.toLocaleString()} silver-eq today (${m.opens} opens; tripwire ${ER_MINT_TRIPWIRE.toLocaleString()})`,
    );
  } catch (e) {
    add("Escape-room mint", false, String(e).slice(0, 120));
  }

  add("Uptime", true, `${(process.uptime() / 3600).toFixed(1)}h`);
  return checks;
}
