// THE HOST'S OWN VOICE SERVER (FEDERATION F5b — Josh: "i wanted the voice
// to be hosted on the satellite's server").
//
// The app bundles livekit-server.exe beside the daemon; this module runs it
// with keys GENERATED ON THIS BOX (persisted in voice.json — the hub is
// handed them over the authenticated link so it can keep minting every
// token itself; the satellite still never decides who joins). Signaling
// reaches us relayed through the hub; media is WebRTC straight from the
// callers to this machine's UDP ports — the Guide tab tells the host what
// to forward (TCP 7880 + UDP 50000-50060).
//
// Opt-in by flag (`--voice`): the desktop app always passes it; the bare
// CLI and the harnesses don't, so tests never bind real SFU ports.
import fs from "node:fs";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { spawn, type ChildProcess } from "node:child_process";

export const VOICE_PORT = 7880;
/** ICE-over-TCP media fallback — what carries a viewer whose network blocks
 *  UDP. LiveKit's default; pinned explicitly so the Guide can tell hosts to
 *  forward it. */
export const VOICE_TCP_PORT = 7_881;
export const VOICE_UDP_START = 50_000;
export const VOICE_UDP_END = 50_060;
/** The SFU's own Prometheus stats — what feeds the Diagnostics tab's "is my
 *  connection keeping up" answer. NB livekit binds it on the server's own
 *  bind_addresses (0.0.0.0), so the LAN can scrape participant counts and
 *  traffic totals — mild, and the port is deliberately NOT in the Guide's
 *  router-forward table, so it never faces the internet unless a host
 *  forwards it by hand. */
const VOICE_METRICS_PORT = 7_889;

export interface VoiceIdentity {
  key: string;
  secret: string;
}

let child: ChildProcess | null = null;
let running = false;
let identity: VoiceIdentity | null = null;
/** The pending crash-restart, if any — a deliberate stop must cancel it, or
 *  a crashed SFU resurrects 30s after the host switched hosting off (and a
 *  fast off→on could double-spawn: the fresh child plus the timer's). */
let retryTimer: NodeJS.Timeout | null = null;

// The SFU dies with the daemon. Registered ONCE — startVoiceHost runs on
// every Settings toggle, and per-call registration accumulated listeners.
process.on("exit", () => { try { child?.kill(); } catch { /* gone */ } });

/** Where the SFU binary lives: beside the daemon exe (the installed app's
 *  layout — Windows sidecar or the Linux CLI's /opt dir), or the repo's dev
 *  copy when running under plain node. */
function findBinary(): string | null {
  const bin = process.platform === "win32" ? "livekit-server.exe" : "livekit-server";
  const beside = path.join(path.dirname(process.execPath), bin);
  if (fs.existsSync(beside)) return beside;
  const dev = path.resolve("./livekit", bin);
  if (fs.existsSync(dev)) return dev;
  return null;
}

function loadIdentity(dataDir: string): VoiceIdentity {
  const file = path.join(dataDir, "voice.json");
  try {
    const raw = JSON.parse(fs.readFileSync(file, "utf8")) as Partial<VoiceIdentity>;
    if (raw.key && raw.secret && raw.secret.length >= 16) return { key: raw.key, secret: raw.secret };
  } catch { /* fresh */ }
  const fresh = { key: `sat${randomBytes(9).toString("hex")}`, secret: randomBytes(32).toString("hex") };
  fs.writeFileSync(file, JSON.stringify(fresh, null, 2), { mode: 0o600 });
  return fresh;
}

/** Start the SFU (idempotent). Returns whether it's running; the caller's
 *  log function narrates. A crashed SFU restarts on a slow clock — a busy
 *  port or a missing binary just means "voice not hosted here". */
export function startVoiceHost(
  dataDir: string,
  log: (m: string) => void,
  onError?: (m: string) => void,
): boolean {
  if (running) return true;
  const bin = findBinary();
  if (!bin) {
    log("voice: livekit-server.exe not found — voice hosting off (calls fall back to the hub)");
    return false;
  }
  identity = loadIdentity(dataDir);
  const cfgPath = path.join(dataDir, "livekit.yaml");
  fs.writeFileSync(cfgPath, [
    `port: ${VOICE_PORT}`,
    "bind_addresses:",
    '  - "0.0.0.0"',
    "rtc:",
    `  tcp_port: ${VOICE_TCP_PORT}`,
    `  port_range_start: ${VOICE_UDP_START}`,
    `  port_range_end: ${VOICE_UDP_END}`,
    "  use_external_ip: true",
    `prometheus_port: ${VOICE_METRICS_PORT}`,
    "keys:",
    `  ${identity.key}: ${identity.secret}`,
    "logging:",
    "  level: warn",
    "",
  ].join("\n"), { mode: 0o600 });
  // The same key and secret voice.json keeps at 0600 (Oct 2026 review): an
  // existing file keeps its old mode through writeFileSync, so set it.
  try { fs.chmodSync(cfgPath, 0o600); } catch { /* Windows: ACLs, not modes */ }
  if (retryTimer) { clearTimeout(retryTimer); retryTimer = null; }
  const boot = (): void => {
    retryTimer = null;
    const c = spawn(bin, ["--config", cfgPath], { stdio: ["ignore", "ignore", "pipe"] });
    child = c;
    running = true;
    log(`voice: SFU up on :${VOICE_PORT} (media UDP ${VOICE_UDP_START}-${VOICE_UDP_END}) — forward these on the router`);
    let err = "";
    c.stderr?.on("data", (d) => { err = String(d).slice(0, 300); });
    // A failed SPAWN (binary deleted, EACCES) emits "error" and never
    // "exit" — unhandled it's an uncaught exception, and `running` would
    // stick true forever with no retry. The child-identity guard makes a
    // deliberate stop's late events no-ops.
    c.on("error", (e) => {
      if (child !== c) return;
      running = false;
      child = null;
      log(`voice: SFU failed to start (${e.message}); retrying in 30s`);
      onError?.(`SFU spawn failed: ${e.message}`);
      if (!retryTimer) { retryTimer = setTimeout(boot, 30_000); retryTimer.unref?.(); }
    });
    c.on("exit", (code) => {
      if (child !== c) return;
      running = false;
      child = null;
      log(`voice: SFU exited (${code})${err ? ` — ${err.split("\n")[0]}` : ""}; retrying in 30s`);
      // A clean 0 is a stop; anything else is worth the hub hearing about.
      if (code !== 0) onError?.(`SFU exited (${code})${err ? `: ${err.split("\n")[0]}` : ""}`);
      if (!retryTimer) { retryTimer = setTimeout(boot, 30_000); retryTimer.unref?.(); }
    });
  };
  boot();
  return true;
}

export function stopVoiceHost(): void {
  if (retryTimer) { clearTimeout(retryTimer); retryTimer = null; }
  const c = child;
  child = null;
  running = false;
  if (c) {
    c.removeAllListeners("exit"); // no auto-restart after a deliberate stop
    try { c.kill(); } catch { /* gone */ }
  }
}

/** What the hub asks for over the link (the "voice.info" RPC). */
export function voiceInfo(): { enabled: boolean; port: number; key: string; secret: string } {
  return {
    enabled: running && !!identity,
    port: VOICE_PORT,
    key: identity?.key ?? "",
    secret: identity?.secret ?? "",
  };
}

// ---- Voice stats (Josh: "make sure the satellite handles the bandwidth") --
// The SFU publishes its own Prometheus metrics on localhost; a 10s sampler
// turns them into the Diagnostics tab's voice row: who's connected, the
// media packet rate, and — the load-bearing one — DROPPED packets, which is
// what "this PC or its connection can't keep up" actually looks like.

export interface VoiceStats {
  at: number;
  participants: number;
  rooms: number;
  /** Real media bytes/second through the SFU (livekit_packet_bytes deltas —
   *  the counter appears only once media has flowed; zero until then). */
  bytesInPerSec: number;
  bytesOutPerSec: number;
  /** Recent OUTGOING packet loss %, from the SFU's own histogram — the
   *  honest "this PC or its connection is struggling" signal. */
  lossPct: number;
}

interface StatsSnapshot { at: number; in: number; out: number; lossSum: number; lossCount: number }
let voiceStatsNow: VoiceStats | null = null;
let prevSnap: StatsSnapshot | null = null;
let statsTimer: NodeJS.Timeout | null = null;
let statsFails = 0;

const metricSum = (text: string, name: string, label?: string): number => {
  let sum = 0;
  const re = new RegExp(`^${name}(?:\\{([^}]*)\\})? (\\S+)$`, "gm");
  for (const m of text.matchAll(re)) {
    if (label && !(m[1] ?? "").includes(label)) continue;
    const v = Number(m[2]);
    if (Number.isFinite(v)) sum += v;
  }
  return sum;
};

async function sampleVoiceStats(): Promise<void> {
  if (!running) { voiceStatsNow = null; prevSnap = null; return; }
  try {
    const res = await fetch(`http://127.0.0.1:${VOICE_METRICS_PORT}/metrics`, { signal: AbortSignal.timeout(4_000) });
    const text = await res.text();
    const now = Date.now();
    const snap: StatsSnapshot = {
      at: now,
      in: metricSum(text, "livekit_packet_bytes", 'direction="incoming"'),
      out: metricSum(text, "livekit_packet_bytes", 'direction="outgoing"'),
      lossSum: metricSum(text, "livekit_packet_loss_percent_sum", 'direction="outgoing"'),
      lossCount: metricSum(text, "livekit_packet_loss_percent_count", 'direction="outgoing"'),
    };
    const dt = prevSnap ? Math.max(1, (now - prevSnap.at) / 1000) : 0;
    const dCount = prevSnap ? snap.lossCount - prevSnap.lossCount : 0;
    voiceStatsNow = {
      at: now,
      participants: metricSum(text, "livekit_participant_total"),
      rooms: metricSum(text, "livekit_room_total"),
      bytesInPerSec: prevSnap ? Math.max(0, Math.round((snap.in - prevSnap.in) / dt)) : 0,
      bytesOutPerSec: prevSnap ? Math.max(0, Math.round((snap.out - prevSnap.out) / dt)) : 0,
      lossPct: dCount > 0 ? Math.max(0, (snap.lossSum - prevSnap!.lossSum) / dCount) : 0,
    };
    prevSnap = snap;
    statsFails = 0;
  } catch {
    // One blip (SFU busy, 4s timeout) mustn't blank the panel mid-call —
    // hold the last good sample through two misses, blank on the third
    // (a real restart, or an old yaml without metrics).
    statsFails++;
    if (statsFails >= 3) { voiceStatsNow = null; prevSnap = null; }
  }
}

export function startVoiceStats(): void {
  if (statsTimer) return;
  statsTimer = setInterval(() => { void sampleVoiceStats(); }, 10_000);
  statsTimer.unref?.();
}

export function voiceStats(): VoiceStats | null {
  return voiceStatsNow;
}
