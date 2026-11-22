// THE SATELLITE DAEMON (FEDERATION.md).
//
// Three ways in:
//   register: node main.js register --hub <url> --key <code> [--name x] [--data dir]
//   run:      node main.js run [--data dir]                (headless, CLI)
//   serve:    node main.js serve [--data dir] [--port n]   (the GUI backend:
//             runs the link like `run` AND a localhost-only control API the
//             Solace Satellite desktop app talks to — setup happens in a
//             window, not a terminal)
//
// The identity file holds the PRIVATE key — it never leaves this box, and
// losing it means asking the hub admin for a fresh provisioning key.
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { createPrivateKey, generateKeyPairSync, sign as edSign } from "node:crypto";
import WebSocket from "ws";
import { SATELLITE_VERSION, helloPayload, updatePayload } from "../federation/protocol";
import { SatelliteStore } from "./store";
import { startLocalApi } from "./local";
import { startVoiceHost, startVoiceStats, stopVoiceHost, voiceInfo, voiceStats } from "./voicehost";
import { diagSample, startDiag } from "./diag";

export interface Identity {
  hub: string;
  satelliteId: number;
  privateKeyPem: string;
  name: string;
}

/** What the control panel (and the log) sees. */
export interface DaemonState {
  configured: boolean;
  linked: boolean;
  hub: string | null;
  name: string | null;
  satelliteId: number | null;
  version: string;
  startedAt: number;
  lastError: string | null;
  log: string[];
}

function arg(name: string, fallback?: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

/** The GUI's default home: a per-user app-data dir, never the cwd. */
function defaultDataDir(): string {
  const appData = process.env.APPDATA;
  return appData ? path.join(appData, "SolaceSatellite") : path.join(os.homedir(), ".solace-satellite");
}

const dataDir = arg("data", process.argv[2] === "serve" ? defaultDataDir() : "./satellite-data")!;
const idFile = path.join(dataDir, "identity.json");

const LOG_MAX = 200;
const state: DaemonState = {
  configured: false, linked: false, hub: null, name: null, satelliteId: null,
  version: SATELLITE_VERSION, startedAt: Date.now(), lastError: null, log: [],
};
export function log(msg: string): void {
  const line = `${new Date().toISOString().slice(11, 19)} ${msg}`;
  state.log.push(line);
  if (state.log.length > LOG_MAX) state.log.splice(0, state.log.length - LOG_MAX);
  console.log(`[satellite] ${msg}`);
}

export function readIdentity(): Identity | null {
  try {
    return JSON.parse(fs.readFileSync(idFile, "utf8")) as Identity;
  } catch {
    return null;
  }
}

/** Register against the hub: generate the keypair HERE (the private half
 *  never travels), redeem the admin-minted key, write the identity file.
 *  `privacy` (F8, the Linux wizard) rides along and shapes the community
 *  page the hub auto-creates on first connect; omitted = open defaults. */
export async function registerWithHub(
  hub: string, key: string, name: string,
  privacy?: { joinPolicy?: string; discoverable?: boolean },
  /** THE HOST AGREEMENT (Sep 2026): the host read and accepted
   *  <hub>/legal/hosting.html. The hub refuses a registration that carries
   *  no acceptance and has none on file for the key — hosting a community
   *  makes you its operator, and that has to be said and agreed to. */
  acceptHosting = false,
): Promise<Identity> {
  const cleanHub = hub.trim().replace(/\/+$/, "");
  if (!/^https?:\/\//.test(cleanHub)) throw new Error("bad_hub");
  if (fs.existsSync(idFile)) throw new Error("already_registered");
  const pair = generateKeyPairSync("ed25519");
  const pubkey = pair.publicKey.export({ type: "spki", format: "pem" }).toString();
  const privateKeyPem = pair.privateKey.export({ type: "pkcs8", format: "pem" }).toString();
  const res = await fetch(`${cleanHub}/api/satellite/register`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      key: key.trim(), name, pubkey, version: SATELLITE_VERSION,
      joinPolicy: privacy?.joinPolicy, discoverable: privacy?.discoverable,
      acceptHosting: acceptHosting || undefined,
    }),
  });
  const body = (await res.json().catch(() => null)) as { ok?: boolean; satelliteId?: number; error?: string } | null;
  if (!res.ok || !body?.ok || !body.satelliteId) {
    throw new Error(body?.error ?? `refused_${res.status}`);
  }
  fs.mkdirSync(dataDir, { recursive: true });
  const identity: Identity = { hub: cleanHub, satelliteId: body.satelliteId, privateKeyPem, name };
  fs.writeFileSync(idFile, JSON.stringify(identity, null, 2), { mode: 0o600 });
  log(`registered as satellite #${body.satelliteId} ("${name}") with ${cleanHub}`);
  return identity;
}

/** Hold the rendezvous line: sign the challenge, answer RPCs, reconnect
 *  forever with capped backoff. A delisted satellite keeps knocking politely
 *  and keeps being refused, which is the intended shape. Returns a STOP
 *  handle (F4: the control panel's reset needs to hang up for good) — the
 *  content store comes as a GETTER because a reset swaps it out live. */
export function startLink(identity: Identity, content: () => SatelliteStore): () => void {
  state.configured = true;
  state.hub = identity.hub;
  state.name = identity.name;
  state.satelliteId = identity.satelliteId;
  const privateKey = createPrivateKey(identity.privateKeyPem);
  const wsUrl = identity.hub.replace(/^http/, "ws") + "/ws-satellite";
  let backoffMs = 5_000;
  let stopped = false;
  let liveWs: WebSocket | null = null;
  let retry: NodeJS.Timeout | null = null;

  // The RPC surface (F2 + F3): the hub asks, we answer. Every op runs against
  // the local content store; the hub already did the permission work.
  // Refusal codes that are ordinary user-flow answers, not faults — they go
  // back to the hub as rpc.err but do NOT land in the error queue (F6).
  const EXPECTED_ERRS = new Set(["no_message", "bad_reply", "bad_file", "no_file", "too_large", "unknown_op", "busy_moving", "storage_missing"]);
  const OPS: Record<string, (args: never) => unknown> = {
    "messages.list": (a) => content().list(a),
    "message.create": (a) => content().create(a),
    "message.update": (a) => content().update(a),
    "message.delete": (a) => content().delete(a),
    "messages.search": (a) => content().search(a),
    "file.put": (a) => content().filePut(a),
    "file.get": (a) => content().fileGet(a),
    "file.delete": (a) => content().fileDelete(a),
    // F5b: the hub asks for this box's LiveKit config before minting a
    // token for one of our rooms. Answering it is not a promise the ports
    // are forwarded — the hub probes reachability itself and falls back.
    "voice.info": () => voiceInfo(),
    // F6: the hub's error sweep collects what went wrong here — queued on
    // this disk until drained. Drain PEEKS; only the hub's ack (sent after
    // the ledger really has the rows) purges — a link that dies mid-sweep
    // just redelivers, and the hub's dedup absorbs the repeat.
    "errors.drain": () => content().drainErrors(),
    "errors.ack": (a) => content().ackErrors(a),
  };

  const connect = (): void => {
    if (stopped) return;
    log(`dialing ${wsUrl}…`);
    // An upgrade that never answers (a host PC slept mid-handshake, a wedged
    // hub) used to hold the socket in CONNECTING forever — no 'close', so no
    // reconnect, and the watchdog only looks at OPEN sockets (Oct 2026 review).
    const ws = new WebSocket(wsUrl, { handshakeTimeout: 15_000 });
    liveWs = ws;
    ws.on("message", (raw) => {
      let msg: { type?: string; nonce?: string; id?: number; op?: string; args?: unknown };
      try { msg = JSON.parse(String(raw)); } catch { return; }
      if (msg.type === "challenge" && typeof msg.nonce === "string") {
        const ts = Date.now();
        const sig = edSign(
          null,
          Buffer.from(helloPayload(msg.nonce, identity.satelliteId, SATELLITE_VERSION, ts)),
          privateKey,
        ).toString("base64");
        ws.send(JSON.stringify({ type: "hello", satelliteId: identity.satelliteId, version: SATELLITE_VERSION, ts, sig }));
      } else if (msg.type === "welcome") {
        backoffMs = 5_000;
        state.linked = true;
        state.lastError = null;
        // Rotation safety: never mint an id the hub has already indexed.
        const floor = Number((msg as { floorId?: unknown }).floorId);
        if (Number.isFinite(floor) && floor > 0) {
          // A silent skip here leaves a rotated box minting used ids (posts
          // then refuse hub-side as collisions) — say so if it ever fails.
          try { content().ensureIdFloor(floor); } catch (e) {
            log(`WARN id-floor seeding failed (${(e as Error).message}) — retried on next reconnect`);
          }
        }
        log("linked. holding the line.");
      } else if (msg.type === "rpc" && typeof msg.op === "string") {
        const op = OPS[msg.op];
        try {
          if (!op) throw new Error("unknown_op");
          const result = op(msg.args as never);
          ws.send(JSON.stringify({ type: "rpc.ok", id: msg.id, result }));
        } catch (e) {
          const why = (e as Error).message || "rpc_error";
          // content() itself can refuse during a storage move — never let
          // the error-recorder become the error.
          if (!EXPECTED_ERRS.has(why)) { try { content().recordError(`rpc:${msg.op}`, why); } catch { /* moving */ } }
          ws.send(JSON.stringify({ type: "rpc.err", id: msg.id, error: why }));
        }
      }
    });
    // The hub pings; ws answers pongs automatically — and the daemon WATCHES
    // for them (Sep 2026 review): a host PC that sleeps and wakes keeps a
    // dead socket open forever otherwise, the panel green, the community
    // unreachable. Three missed heartbeats and the socket is torn down so
    // the ordinary reconnect runs. The welcome names the hub's interval.
    let lastHeard = Date.now();
    let heartbeatMs = 30_000;
    ws.on("ping", () => { lastHeard = Date.now(); });
    ws.on("message", (raw) => {
      lastHeard = Date.now();
      try {
        const m = JSON.parse(String(raw)) as { type?: string; heartbeatMs?: number };
        if (m.type === "welcome" && Number.isFinite(m.heartbeatMs) && Number(m.heartbeatMs) > 1000) heartbeatMs = Number(m.heartbeatMs);
      } catch { /* the main handler reports bad frames */ }
    });
    const watchdog = setInterval(() => {
      if (ws.readyState !== ws.OPEN) return;
      if (Date.now() - lastHeard > heartbeatMs * 3) {
        log("link silent — no heartbeat from the hub; reconnecting");
        try { ws.terminate(); } catch { /* gone */ }
      }
    }, 5_000);
    ws.on("close", (code, reason) => {
      clearInterval(watchdog);
      state.linked = false;
      if (stopped) return;
      const why = `${code}${reason?.length ? `: ${reason}` : ""}`;
      if (String(reason).includes("delisted") || code === 4403) state.lastError = String(reason) || "refused";
      log(`link closed (${why}) — retrying in ${Math.round(backoffMs / 1000)}s`);
      retry = setTimeout(connect, backoffMs);
      backoffMs = Math.min(60_000, backoffMs * 2);
    });
    ws.on("error", (err) => {
      state.lastError = (err as Error).message;
      log(`link error: ${(err as Error).message}`);
    });
  };
  connect();
  return () => {
    stopped = true;
    if (retry) clearTimeout(retry);
    try { liveWs?.close(); } catch { /* already down */ }
    state.linked = false;
  };
}

async function cmdRegister(): Promise<void> {
  const hub = arg("hub", "https://solace.zone")!;
  const key = arg("key");
  const name = arg("name", "Unnamed community")!;
  // F8: the installer wizard's privacy answer.
  const rawPolicy = arg("privacy");
  const joinPolicy = rawPolicy === "open" || rawPolicy === "request" || rawPolicy === "invite" ? rawPolicy : undefined;
  const rawDisc = arg("discoverable");
  const discoverable = rawDisc === "yes" ? true : rawDisc === "no" ? false : undefined;
  if (!key) { console.error("register needs --key <provisioning key from a hub admin>"); process.exit(1); }
  // THE HOST AGREEMENT: an explicit flag, never a default. The Ubuntu wizard
  // asks the question and passes it; a bare CLI run has to say it out loud.
  const acceptHosting = process.argv.includes("--accept-host-agreement");
  if (!acceptHosting) {
    console.error(
      `hosting a community means agreeing to the Satellite Host Agreement at ${hub}/legal/hosting.html\n` +
      "read it, then run again with --accept-host-agreement",
    );
    process.exit(1);
  }
  try {
    await registerWithHub(hub, key, name, { joinPolicy, discoverable }, true);
    log(`identity written to ${idFile} — keep it; it IS this community.`);
  } catch (e) {
    const why = (e as Error).message;
    console.error(why === "hosting_agreement_required"
      ? `registration refused: the hub needs the Host Agreement accepted (${hub}/legal/hosting.html)`
      : `registration refused: ${why}`);
    process.exit(1);
  }
}

/** Host-tunable knobs (F4 — the app's Settings card), persisted beside the
 *  identity. Clamped on every read AND write so a hand-edited file can't
 *  produce a sweep that eats yesterday's uploads or point content at "C". */
export interface SatSettings {
  animatedDays: number;
  staticDays: number;
  /** Host voice calls on this PC (F5b) — honoured only when the process was
   *  started with --voice (the app always is; harnesses never are). */
  voice: boolean;
  /** Where the COMMUNITY lives — content.db + files/ (Josh: "just incase
   *  they have a seperate drive"). null = the data dir. The identity stays
   *  in the data dir regardless: it's tiny, it IS the community, and the
   *  daemon must always know where to find it. Set only via the storage
   *  MOVE (POST /api/storage), never as a plain setting — flipping the path
   *  without moving the bytes would boot an empty community. */
  contentDir: string | null;
  /** Automatic-backup target (a second drive, a NAS share…). null = off. */
  backupDir: string | null;
}
const settingsFile = path.join(dataDir, "settings.json");
const clampDays = (v: unknown, fallback: number): number => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.min(365, Math.max(1, n)) : fallback;
};
/** Only an absolute path survives — a relative one would silently mean
 *  "relative to wherever the daemon happened to start". */
const cleanDir = (v: unknown): string | null =>
  typeof v === "string" && v.trim() && path.isAbsolute(v.trim()) ? path.resolve(v.trim()) : null;
export function loadSettings(): SatSettings {
  let raw: Partial<SatSettings> = {};
  try { raw = JSON.parse(fs.readFileSync(settingsFile, "utf8")) as Partial<SatSettings>; } catch { /* defaults */ }
  return {
    animatedDays: clampDays(raw.animatedDays, 30),
    staticDays: clampDays(raw.staticDays, 90),
    voice: raw.voice !== false,
    contentDir: cleanDir(raw.contentDir),
    backupDir: cleanDir(raw.backupDir),
  };
}
/** ATOMIC (write-then-rename): since F7, settings.json is the SOLE pointer
 *  to a moved community — a truncate-then-write torn by a full disk (exactly
 *  the situation that prompts a move to another drive) would boot an empty
 *  community at the default path while the real one sits orphaned. */
const saveSettings = (s: SatSettings): void => {
  const tmp = settingsFile + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(s, null, 2));
  fs.renameSync(tmp, settingsFile);
};
/** Where content.db + files/ actually live right now. */
const contentRootOf = (s: SatSettings): string => s.contentDir ?? dataDir;

const DAY_MS = 24 * 60 * 60 * 1000;

/** The host's own retention clock (F3): aged attachment files go on a
 *  6-hourly sweep — the hub's rows stop them being SERVED at the same age. */
function startFileSweep(content: () => SatelliteStore, settings: () => SatSettings): void {
  const sweep = (): void => {
    try {
      const s = settings();
      const n = content().sweepFiles(Date.now(), s.animatedDays * DAY_MS, s.staticDays * DAY_MS);
      if (n) log(`retention sweep: ${n} aged file(s) deleted`);
    } catch { /* hygiene must never take the link down */ }
  };
  sweep();
  setInterval(sweep, 6 * 60 * 60 * 1000).unref?.();
}

// ---- Storage & backup (F7 — Josh: "allow satellites to chose where they
// want their bckup and storage to be just incase they have a seperate
// drive"). The move is live-then-swap: files bulk-copy while the store
// keeps serving, then a seconds-long closed window copies the db and any
// stragglers. The old copy is deleted only after the new one is open.

/** Is `child` inside (or equal to) `parent`? Moving content into its own
 *  subtree — either direction — would be a recursive copy eating itself. */
function isInside(parent: string, child: string): boolean {
  const rel = path.relative(path.resolve(parent), path.resolve(child));
  return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
}

/** Incremental one-way copy: only files missing at the destination or with
 *  a differing size/mtime move. Never deletes anything at the destination. */
function copyNewer(srcDir: string, dstDir: string): number {
  fs.mkdirSync(dstDir, { recursive: true });
  let copied = 0;
  for (const name of fs.readdirSync(srcDir)) {
    const s = path.join(srcDir, name);
    const d = path.join(dstDir, name);
    const st = fs.statSync(s);
    if (st.isDirectory()) { copied += copyNewer(s, d); continue; }
    let need = true;
    try {
      const dt = fs.statSync(d);
      need = dt.size !== st.size || dt.mtimeMs < st.mtimeMs;
    } catch { /* missing at destination */ }
    if (need) { fs.copyFileSync(s, d); copied++; }
  }
  return copied;
}

/** The same incremental copy, one file per event-loop turn. The bulk half of
 *  a move/backup can be minutes of real disk work — done synchronously it
 *  froze the daemon solid (link heartbeats dropped, the panel read "engine
 *  not responding", and quitting the app tripped the Rust backstop kill that
 *  orphans the SFU, because the stdin-EOF handler never got a turn). A file
 *  swept away mid-copy is skipped, not fatal — the sync straggler pass in
 *  the move's closed window catches anything that changed. */
async function copyNewerAsync(srcDir: string, dstDir: string): Promise<number> {
  fs.mkdirSync(dstDir, { recursive: true });
  let copied = 0;
  for (const name of fs.readdirSync(srcDir)) {
    const s = path.join(srcDir, name);
    const d = path.join(dstDir, name);
    try {
      const st = fs.statSync(s);
      if (st.isDirectory()) { copied += await copyNewerAsync(s, d); continue; }
      let need = true;
      try {
        const dt = fs.statSync(d);
        need = dt.size !== st.size || dt.mtimeMs < st.mtimeMs;
      } catch { /* missing at destination */ }
      if (need) { await fs.promises.copyFile(s, d); copied++; }
    } catch { /* vanished mid-copy (retention sweep) — the straggler pass owns it */ }
    await new Promise((r) => setImmediate(r));
  }
  return copied;
}

export interface BackupInfo {
  lastAt: number | null;
  lastError: string | null;
  running: boolean;
}
const backupState: BackupInfo = { lastAt: null, lastError: null, running: false };
const BACKUP_EVERY_MS = 24 * 60 * 60 * 1000;
const BACKUP_KEEP_SNAPSHOTS = 7;

/** One full backup into <backupDir>/SolaceSatelliteBackup: a WAL-safe db
 *  snapshot (dated, last 7 kept), an incremental files mirror (no deletes —
 *  a mistake on the live side must not propagate into the backup), and the
 *  crown jewels: identity.json (the community's LIFE), settings, voice keys. */
async function runBackup(content: () => SatelliteStore, settings: () => SatSettings): Promise<{ at: number }> {
  const dest = settings().backupDir;
  if (!dest) throw new Error("no_backup_dir");
  if (backupState.running) throw new Error("busy");
  backupState.running = true;
  try {
    const root = path.join(dest, "SolaceSatelliteBackup");
    fs.mkdirSync(root, { recursive: true });
    // ONE snapshot per DAY (a same-day re-run replaces it) — minute-stamped
    // names let seven "Back up now" presses in one sitting evict a week of
    // daily history, since rotation is by count. The prune regex still
    // matches the old minute-stamped shape so pre-existing files rotate out.
    const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    const snap = path.join(root, `content-${stamp}.db`);
    // Into a temp name first, over today's file only on success (Oct 2026
    // review): deleting the dated file first meant a second press that
    // failed (a full drive, a move in progress) cost today's only good copy.
    const tmp = `${snap}.tmp`;
    fs.rmSync(tmp, { force: true }); // VACUUM INTO refuses an existing target
    content().backupTo(tmp);
    fs.renameSync(tmp, snap);
    const snaps = fs.readdirSync(root).filter((f) => /^content-\d{8}(-\d{4})?\.db$/.test(f)).sort();
    for (const old of snaps.slice(0, Math.max(0, snaps.length - BACKUP_KEEP_SNAPSHOTS))) {
      fs.rmSync(path.join(root, old), { force: true });
    }
    const filesDir = path.join(contentRootOf(settings()), "files");
    if (fs.existsSync(filesDir)) await copyNewerAsync(filesDir, path.join(root, "files"));
    for (const f of ["identity.json", "settings.json", "voice.json"]) {
      const s = path.join(dataDir, f);
      if (fs.existsSync(s)) fs.copyFileSync(s, path.join(root, f));
    }
    backupState.lastAt = Date.now();
    backupState.lastError = null;
    fs.writeFileSync(path.join(root, "last-backup.json"), JSON.stringify({ at: backupState.lastAt }));
    log(`backup written to ${root}`);
    return { at: backupState.lastAt };
  } catch (e) {
    const why = (e as Error).message || "backup_failed";
    backupState.lastError = why;
    try { content().recordError("backup", why); } catch { /* moving */ }
    throw e;
  } finally {
    backupState.running = false;
  }
}

/** The automatic clock: due when the last backup is a day old. The stamp is
 *  recovered from the backup itself, so a daemon restart doesn't force an
 *  immediate re-run — and an hourly due-check means a laptop that was asleep
 *  at the appointed hour still backs up within the hour it wakes. */
function startBackupClock(content: () => SatelliteStore, settings: () => SatSettings): void {
  const recoverStamp = (): void => {
    const d = settings().backupDir;
    if (!d) return;
    try {
      const raw = JSON.parse(fs.readFileSync(path.join(d, "SolaceSatelliteBackup", "last-backup.json"), "utf8")) as { at?: number };
      // Clamp to now: a stamp written while the host's clock ran ahead would
      // otherwise suppress the daily backup until real time caught up.
      if (Number.isFinite(raw.at)) backupState.lastAt = Math.min(raw.at!, Date.now());
    } catch { /* never backed up there */ }
  };
  recoverStamp();
  const tick = (): void => {
    if (!settings().backupDir) return;
    if (backupState.lastAt && Date.now() - backupState.lastAt < BACKUP_EVERY_MS) return;
    runBackup(content, settings).catch((e) => log(`backup failed: ${(e as Error).message}`));
  };
  setTimeout(tick, 60_000).unref?.();
  setInterval(tick, 60 * 60 * 1000).unref?.();
}

function cmdRun(): void {
  const identity = readIdentity();
  if (!identity) { console.error(`no identity at ${idFile} — run the register command first.`); process.exit(1); }
  const settings = loadSettings();
  let content: SatelliteStore;
  try {
    content = new SatelliteStore(contentRootOf(settings));
  } catch (e) {
    console.error(
      `cannot open community storage at ${contentRootOf(settings)} (${(e as Error).message})\n` +
      "— reattach the drive, or edit settings.json's contentDir.",
    );
    process.exit(1);
  }
  startFileSweep(() => content, loadSettings);
  startDiag(() => contentRootOf(loadSettings()));
  startBackupClock(() => content, loadSettings);
  // F6 for the headless CLI too (the Linux systemd service runs this mode):
  // survive faults, queue them for the hub's error sweep. Without these a
  // stray throw is only a systemd restart nobody ever hears about.
  const recordSafe = (kind: string, msg: string): void => {
    try { content.recordError(kind, msg); } catch { /* store closed */ }
  };
  process.on("uncaughtException", (e) => {
    log(`ERROR uncaught: ${e.message}`);
    recordSafe("uncaught", e.stack?.split("\n").slice(0, 3).join(" · ") ?? e.message);
  });
  process.on("unhandledRejection", (e) => {
    const msg = e instanceof Error ? e.message : String(e);
    log(`ERROR unhandled rejection: ${msg}`);
    recordSafe("unhandled", msg);
  });
  if (process.argv.includes("--voice") && settings.voice) {
    startVoiceHost(dataDir, log, (m) => recordSafe("voice", m));
    startVoiceStats();
  }
  startLink(identity, () => content);
}

/** The GUI backend: the link (once configured) plus the localhost control
 *  API. An unconfigured daemon just serves the API and waits for the setup
 *  form; a successful setup starts the link without a restart, and a RESET
 *  hangs up, wipes the disk, and returns to the setup form — also without
 *  a restart. */
function cmdServe(): void {
  fs.mkdirSync(dataDir, { recursive: true });
  let settings = loadSettings();
  let content: SatelliteStore | null = null;
  let storageError: string | null = null;
  let moving = false;      // phase-2 swap: the db is CLOSED for these seconds
  let moveBusy = false;    // the whole move, bulk copy included
  let lastMoveError: string | null = null;
  let stopLink: (() => void) | null = null;
  const port = Number(arg("port", "8765"));
  // A restored backup's settings.json can point contentDir at a drive this
  // machine doesn't have — dying on it hands a no-terminal host a dead
  // engine. Serve the panel, say exactly what's wrong, and retry until the
  // drive comes back (reattach it and the community stands up on its own).
  const openContent = (): void => {
    try {
      content = new SatelliteStore(contentRootOf(settings));
      storageError = null;
    } catch (e) {
      content = null;
      storageError = `community storage unreachable at ${contentRootOf(settings)}: ${(e as Error).message}`;
    }
  };
  openContent();
  if (!content) {
    log(`ERROR ${storageError} — reattach the drive; retrying every 15s`);
    const heal = setInterval(() => {
      if (content || moveBusy) return;
      openContent();
      if (content) {
        clearInterval(heal);
        log("community storage is back — standing up");
        const idNow = readIdentity();
        if (idNow && !stopLink) stopLink = startLink(idNow, liveContent);
      }
    }, 15_000);
    heal.unref?.();
  }
  // Everything that touches the store goes through this gate, so the RPC
  // surface answers a clean "busy_moving" for the seconds the db is closed
  // mid-move (or "storage_missing" while the drive is away) instead of a
  // raw sqlite error landing in the error queue.
  const liveContent = (): SatelliteStore => {
    if (moving) throw new Error("busy_moving");
    if (!content) throw new Error("storage_missing");
    return content;
  };
  // Never let the error-recorder become the error — during the move's swap
  // window (or with the storage drive away) the store refuses, and a throw
  // inside the uncaughtException handler kills the daemon outright.
  const recordSafe = (kind: string, msg: string): void => {
    try { liveContent().recordError(kind, msg); } catch { /* store closed */ }
  };
  // Under the desktop app, our lifetime is the app's. The app pipes our
  // stdin and never writes: when the parent dies — cleanly OR force-killed
  // (a crash, task manager) — the OS closes the pipe and we exit, so a dead
  // window can never orphan a daemon squatting on the port. Flag-gated:
  // a terminal's TTY stdin never ends, and the harness spawns with stdin
  // ignored (instant EOF), so only the app opts in.
  if (process.argv.includes("--watch-stdin")) {
    process.stdin.resume();
    process.stdin.on("end", () => { console.log("[satellite] parent app gone — shutting down"); process.exit(0); });
    process.stdin.on("error", () => process.exit(0));
  }
  startFileSweep(liveContent, () => settings);
  startDiag(() => contentRootOf(settings));
  startBackupClock(liveContent, () => settings);
  // F6: the daemon survives its own faults (the hub's own rule) — logged,
  // queued for the hub's error sweep, and the community stays up.
  process.on("uncaughtException", (e) => {
    log(`ERROR uncaught: ${e.message}`);
    recordSafe("uncaught", e.stack?.split("\n").slice(0, 3).join(" · ") ?? e.message);
  });
  process.on("unhandledRejection", (e) => {
    const msg = e instanceof Error ? e.message : String(e);
    log(`ERROR unhandled rejection: ${msg}`);
    recordSafe("unhandled", msg);
  });
  // F5b: run the SFU when the app asked for it (--voice) and the host
  // hasn't switched it off. Toggling from the Settings card takes effect
  // without a restart.
  const voiceAllowed = process.argv.includes("--voice");
  if (voiceAllowed && settings.voice) startVoiceHost(dataDir, log, (m) => recordSafe("voice", m));
  if (voiceAllowed) startVoiceStats();
  const identity = readIdentity();
  // With the storage drive away the link stays down (the community is
  // honestly offline) — the heal loop starts it when the store opens.
  if (identity && content) stopLink = startLink(identity, liveContent);
  else if (!identity) log("not configured yet — waiting for setup from the control panel.");

  // THE STORAGE MOVE (F7): relocate content.db + files/ to another folder or
  // drive. Phase 1 bulk-copies the files while the store keeps serving; the
  // closed window (phase 2) is just the db plus stragglers — seconds. The
  // old copy is deleted only after the new store is open and settings are
  // persisted, so a crash at ANY point leaves a working community: before
  // the settings write the old location is still authoritative, after it
  // the new one is.
  // Validation is synchronous (the POST answers a bad dir with a 400 on the
  // spot); the copying runs in the BACKGROUND with one file per event-loop
  // turn — done inline it froze the daemon for the length of the bulk copy
  // (heartbeats dropped, the panel timed out and reported a move that later
  // quietly succeeded as failed, and quitting the app mid-copy tripped the
  // backstop TerminateProcess that orphans the SFU). The panel polls
  // storage.moving and reads lastMoveError when it clears.
  const moveContent = (rawDir: string): void => {
    if (moveBusy) throw new Error("busy");
    if (backupState.running) throw new Error("busy");
    if (!content) throw new Error("storage_missing");
    const next = cleanDir(rawDir);
    if (!next) throw new Error("bad_dir");
    const cur = contentRootOf(settings);
    if (path.resolve(next) === path.resolve(cur)) throw new Error("same_dir");
    if (isInside(cur, next) || isInside(next, cur)) throw new Error("nested_dir");
    // NOT INTO SOMEBODY ELSE'S FOLDER (Oct 2026 review): a drive root with
    // its own "files" folder, or another community's database, would be
    // merged into — and a later reset or move away deletes "files" there.
    const occupied = (p: string): boolean => {
      try { return fs.existsSync(p) && (fs.statSync(p).isFile() || fs.readdirSync(p).length > 0); } catch { return true; }
    };
    if (occupied(path.join(next, "content.db")) || occupied(path.join(next, "files"))) throw new Error("dir_in_use");
    fs.mkdirSync(next, { recursive: true });
    const probe = path.join(next, ".solace-write-test");
    fs.writeFileSync(probe, "ok");
    fs.rmSync(probe, { force: true });
    moveBusy = true;
    lastMoveError = null;
    void (async () => {
      const curFiles = path.join(cur, "files");
      try {
        // Phase 1: bulk copy while the store keeps serving.
        if (fs.existsSync(curFiles)) await copyNewerAsync(curFiles, path.join(next, "files"));
        // Phase 2: the seconds-long closed window — db + stragglers, sync.
        const prevSettings = settings;
        moving = true;
        let opened: SatelliteStore | null = null;
        try {
          content!.close();
          for (const f of ["content.db", "content.db-wal", "content.db-shm"]) {
            const s = path.join(cur, f);
            if (fs.existsSync(s)) fs.copyFileSync(s, path.join(next, f));
          }
          if (fs.existsSync(curFiles)) copyNewer(curFiles, path.join(next, "files"));
          opened = new SatelliteStore(next);
          settings = { ...settings, contentDir: next };
          saveSettings(settings);
          content = opened;
        } catch (e) {
          // The old copy was never touched — reopen it, and revert the
          // in-memory POINTER with it (a half-flipped settings object made
          // a retry copy the stale snapshot at `next` and lose everything
          // written since). A store opened at the new place is closed, and
          // if the old one won't reopen either, the content goes to null so
          // the heal loop and the panel take over (it used to keep pointing
          // at the CLOSED store, and every RPC failed until a restart).
          settings = prevSettings;
          try { opened?.close(); } catch { /* already gone */ }
          try {
            content = new SatelliteStore(cur);
          } catch (re) {
            content = null;
            log(`storage move: the old copy would not reopen either (${(re as Error).message})`);
          }
          throw e;
        } finally {
          moving = false;
        }
        // Committed. Old-copy cleanup failing (AV holding a file, EBUSY)
        // must not report the MOVE as failed — the community already lives
        // at the new path.
        try {
          for (const f of ["content.db", "content.db-wal", "content.db-shm"]) {
            fs.rmSync(path.join(cur, f), { force: true });
          }
          fs.rmSync(curFiles, { recursive: true, force: true });
        } catch (e) {
          log(`storage moved, but the old copy could not be fully removed (${(e as Error).message}) — safe to delete by hand: ${cur}`);
        }
        log(`storage moved: the community now lives at ${next}`);
      } catch (e) {
        lastMoveError = (e as Error).message || "move_failed";
        log(`storage move failed: ${lastMoveError} — the community stays at ${cur}`);
      } finally {
        moveBusy = false;
      }
    })();
  };

  startLocalApi({
    port,
    state,
    content: liveContent,
    settings: () => settings,
    setSettings: (patch) => {
      // A non-absolute path must REFUSE, not silently become "backups off"
      // with a 200 — the host would believe a target is set.
      if ("backupDir" in patch && patch.backupDir != null && !cleanDir(patch.backupDir)) {
        throw new Error("bad_dir");
      }
      const nextBackup = "backupDir" in patch ? cleanDir(patch.backupDir) : settings.backupDir;
      const backupChanged = nextBackup !== settings.backupDir;
      settings = {
        animatedDays: clampDays(patch.animatedDays ?? settings.animatedDays, settings.animatedDays),
        staticDays: clampDays(patch.staticDays ?? settings.staticDays, settings.staticDays),
        voice: patch.voice === undefined ? settings.voice : patch.voice !== false,
        contentDir: settings.contentDir, // only the MOVE changes this
        backupDir: nextBackup,
      };
      saveSettings(settings);
      // A fresh target owes a fresh backup — clear the stamp so the hourly
      // clock runs one within the hour (or the host presses Back up now).
      if (backupChanged) { backupState.lastAt = null; backupState.lastError = null; }
      if (voiceAllowed) {
        if (settings.voice) startVoiceHost(dataDir, log, (m) => recordSafe("voice", m));
        else { stopVoiceHost(); log("voice: hosting switched off — calls fall back to the hub"); }
      }
      log(`settings saved: keep animated ${settings.animatedDays}d, files ${settings.staticDays}d, voice ${settings.voice ? "on" : "off"}, backup ${settings.backupDir ?? "off"}`);
      return settings;
    },
    storage: () => ({
      contentDir: contentRootOf(settings),
      isCustom: settings.contentDir != null,
      backupDir: settings.backupDir,
      lastBackupAt: backupState.lastAt,
      lastBackupError: backupState.lastError,
      moving: moveBusy,
      lastMoveError,
      storageError,
    }),
    moveContent,
    backupNow: () => runBackup(liveContent, () => settings),
    setup: async (hub, key, name, acceptHosting) => {
      if (!acceptHosting) throw new Error("hosting_agreement_required");
      const id = await registerWithHub(hub, key, name, undefined, true);
      stopLink = startLink(id, liveContent);
    },
    // AUTO-UPDATE (F4): the app updates itself from the hub, but the
    // installer is member-gated for humans — so the machine door is the
    // satellite's own identity: a short-lived signed token the hub checks
    // against the registered pubkey. Unconfigured = no updates yet.
    updateToken: () => {
      const id = readIdentity();
      if (!id) return null;
      const ts = Date.now();
      const sig = edSign(null, Buffer.from(updatePayload(id.satelliteId, ts)), createPrivateKey(id.privateKeyPem))
        .toString("base64url");
      return { hub: id.hub, token: `${id.satelliteId}.${ts}.${sig}` };
    },
    voiceHosting: () => voiceInfo().enabled,
    voiceStats,
    diag: () => diagSample(),
    // THE RESET: this machine becomes a blank satellite again. The hub still
    // lists the old satellite row (it just goes dark) — delisting or handing
    // out a rotation key is the admin's half of the cleanup.
    reset: () => {
      if (moveBusy) throw new Error("busy");
      stopLink?.();
      stopLink = null;
      content?.close();
      // The content lives wherever the host moved it — wipe THERE, plus the
      // anchor's identity/settings. The voice host stops and its keys go
      // too: the old hub was handed them over the link, and a blank
      // satellite re-registering (possibly elsewhere) must mint fresh ones.
      stopVoiceHost();
      const root = contentRootOf(settings);
      for (const f of ["content.db", "content.db-wal", "content.db-shm"]) {
        fs.rmSync(path.join(root, f), { force: true });
      }
      fs.rmSync(path.join(root, "files"), { recursive: true, force: true });
      for (const f of ["identity.json", "settings.json", "voice.json", "livekit.yaml"]) {
        fs.rmSync(path.join(dataDir, f), { force: true });
      }
      settings = loadSettings();
      openContent();
      backupState.lastAt = null;
      backupState.lastError = null;
      if (voiceAllowed && settings.voice) startVoiceHost(dataDir, log, (m) => recordSafe("voice", m));
      state.configured = false;
      state.linked = false;
      state.hub = null;
      state.name = null;
      state.satelliteId = null;
      state.lastError = null;
      log("reset — this machine is a blank satellite again.");
    },
  });
}

/** Print a fresh identity-signed update token (the F4 machine door) — what
 *  lets the Linux installer script re-download the bundle for an UPGRADE
 *  without burning a fresh provisioning key. */
function cmdUpdateToken(): void {
  const id = readIdentity();
  if (!id) { console.error(`no identity at ${idFile}`); process.exit(1); }
  const ts = Date.now();
  const sig = edSign(null, Buffer.from(updatePayload(id.satelliteId, ts)), createPrivateKey(id.privateKeyPem))
    .toString("base64url");
  console.log(JSON.stringify({ hub: id.hub, token: `${id.satelliteId}.${ts}.${sig}` }));
}

/** One backup, right now, then exit — what `solace-satellite backup` runs.
 *  Safe beside a running service: VACUUM INTO from a second connection is a
 *  consistent WAL snapshot, and the mirror only copies. */
async function cmdBackup(): Promise<void> {
  const settings = loadSettings();
  if (!settings.backupDir) {
    console.error("no backup folder set — run `solace-satellite config` first.");
    process.exit(1);
  }
  const content = new SatelliteStore(contentRootOf(settings));
  try {
    const r = await runBackup(() => content, () => settings);
    console.log(`backup written (${new Date(r.at).toISOString()})`);
  } catch (e) {
    console.error(`backup failed: ${(e as Error).message}`);
    process.exitCode = 1;
  } finally {
    content.close();
  }
}

const cmd = process.argv[2];
if (cmd === "register") void cmdRegister();
else if (cmd === "run") cmdRun();
else if (cmd === "serve") cmdServe();
else if (cmd === "update-token") cmdUpdateToken();
else if (cmd === "backup") void cmdBackup();
else {
  console.error(
    "usage: main.js register --hub <url> --key <code> --accept-host-agreement [--name x] [--data dir] [--privacy open|request|invite] [--discoverable yes|no]\n" +
    "     | main.js run [--data dir]\n" +
    "     | main.js serve [--data dir] [--port n]\n" +
    "     | main.js update-token [--data dir]\n" +
    "     | main.js backup [--data dir]",
  );
  process.exit(1);
}
