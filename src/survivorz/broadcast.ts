// SOLACE SURVIVORZ — THE BROADCAST (SURVIVORZ.md §12): the show's run loop and its watch socket.
//
// One world runs on the server; every screen draws it. This file owns:
//   · the RUN LOOP — the simulation ticked at TICK_HZ through guardedTick (a sweep that throws is
//     recorded and goes red on the health screen; it never takes the process down);
//   · /ws-survivorz — WATCHERS ONLY. A socket gets the snapshot on connect, then every frame the
//     world makes. Nothing a watcher sends is ever read (the casino show's rule): the admin's levers
//     go over HTTP and are audited — with ONE exception, WALK THE MAP (below);
//   · who may watch: the ADMIN always; MEMBERS only while the show is ON AIR (Josh, Oct 27 2026:
//     the Solace-only broadcast is an ON AIR band like the casino's), capped at MAX_WATCHERS.
//
// The world itself is the sim's (src/survivorz/sim/) and is injected as a factory, so this file
// knows only the wire (sim/wire.ts) and a handful of methods.
//
// SAVE AND RESUME (Josh, Oct 31 2026: "a deploy or crash resumes the same survivors, zombies and
// progress within seconds"): every RUN has a stable id (KV_RUN); the running world is saved to app_kv
// (KV_SAVE, deflated) every SAVE_SIM_MS of show clock, on every start/pause/resume and on shutdown
// (saveNow, from index.ts), and a boot with the show running resumes THAT world — paused if it was
// paused. A save that can't be read starts a fresh run and says so in the journal. The show clock
// carries on from the save: the minutes the server was down don't happen (fast-forwarding them would be
// a teleport on every screen).
//
// THE BUNKER'S RUNS (BUNKER.md, "Running it" 34-43): "Start show" streams and NUMBERS a run (the counter only ever
// counts up, KV_RUN_NO); "Test run" does neither — only an admin's own socket sees a test (the stream rig and the
// members get "offair"), and only a test may be sped up (2-8x) or jumped ahead (to a time, or to an objective). If the
// AI engine drops mid-show (a real one), the show HOLDS behind a "Technical difficulties" card until it's back: the
// clock stops, exactly as a pause.
//
// WALK THE MAP (sim/player.ts; Josh, Nov 13 2026): a WALK RUN is a test run with one survivor, driven by the admin's
// own hand. It is started over HTTP like any run ({op: "walk"}, audited); while it is on — and only then — an
// admin's own socket may send the four walk commands (sim/wire.ts WalkCommand: the stick, an action, a blow, stop),
// each checked and rate-limited here before the world sees it, and gets the `walk` frame back (who they are, what
// is in reach, what the hands are on). From anybody else, or in any other run, those messages are dropped unread.
//
// THE THREE PLACES (CLAUDE.md, the escape room's lockout): a /ws-* prefix needs realtime.ts's
// upgrade allowlist, deploy/Caddyfile's @backend matcher AND client/vite.config.ts's proxy.
import type { IncomingMessage, Server } from "node:http";
import type { Duplex } from "node:stream";
import { WebSocket, WebSocketServer } from "ws";
import type { Store } from "../db/store";
import { rememberSocketToken, sessionStandsFor, userForToken } from "../auth";
import { isStreamToken, STREAM_PRINCIPAL } from "./streamtoken";
import { termsOutstanding } from "../legal";
import { clientIp, makeRateLimiter } from "../http";
import { guardedTick } from "../health";
import { randomSeed } from "./doors";
import { deflateRawSync, inflateRawSync } from "node:zlib";
import { dropHeldVoices } from "./voices";
import { KEEPALIVE_MS, TICK_HZ, type ServerFrame, type Snapshot, type WalkFrame } from "./sim/wire";
import { CHARACTERS, SUITED, onCast } from "./cast";
import { publicOf } from "./cast/rules";
import { setTalkMap } from "./talk/sheets";

/** the objectives a test run can jump to (goals.ts) */
export const JUMP_OBJECTIVES = ["part", "code", "sealed", "fixed", "called", "clear"] as const;
export type JumpObjective = (typeof JUMP_OBJECTIVES)[number];
/** the setup a run reports (SimWorld.setup) */
export interface RunSetup { seed: number; starts: { who: string; room: string }[]; partSpot: string; noteSpot: string; zombies: number; inside: number }

/** What the broadcast needs from a world. SimWorld satisfies it. */
export interface ShowWorld {
  snapshot(): Snapshot;
  tick(dtMs: number): void;
  onFrame(cb: (f: ServerFrame) => void): void;
  /** frames a watcher joining mid-show gets right after the snapshot (the cast cards' thoughts) */
  catchUp?(): ServerFrame[];
  /** THE ADMIN'S BODY LEVERS (routes/survivorz-show.ts, audited): kill · down · revive · infect */
  lever?(op: string, id: string, hours?: number): boolean;
  /** the show clock now (cheap — status() used to build a whole snapshot to read it) */
  simTime?(): number;
  /** the world's whole state, for a restart to resume from (sim/save.ts); the factory's `restore` */
  save?(): string;
  /** write anything the world keeps elsewhere (the minds' memory) — called with every save */
  flush?(): void;
  /** the sim alone, no minds (a test run's jump fast-forwards through this) */
  fastTick?(dtMs: number): void;
  /** has this objective been done? (a jump's stop) */
  done?(o: JumpObjective): boolean;
  /** has the show ended? */
  over?(): boolean;
  /** where everyone woke, the hiding places, the dead (Admin Panel → Show → Run setup) */
  setup?(): RunSetup;
  /** THE SPAWN LEVER: `n` of the dead in `room` (or anywhere away from the living); how many came */
  spawn?(n: number, room?: string): number;
  /** is the AI engine down while the minds are meant to be talking? (a real show holds) */
  aiDown?(): boolean;
  /** THE CONTROL ROOM's test-run levers (routes/survivorz-show.ts /act): heal · give · move · clear · length ·
   *  trickle · nudge. Returns false when refused; `n` is a count where there is one. */
  act?(op: string, a: Record<string, unknown>): { ok: boolean; n?: number };
  /** the run's dials as they stand: the show's length (min), the trickle's pace, the dead at the start */
  dials?(): { showMin: number; trickle: number; startZombies: number | null };
  /** how the run stands, for THE RUN HISTORY: the show clock it ran, how it ended (null = still going), each
   *  survivor's fate and the objectives done */
  summary?(): RunSummary;
  /** WALK THE MAP (sim/player.ts): the id of the body the admin drives ("s:<who>"), null in any other run */
  walker?(): string | null;
  /** …and its four inputs (already checked by the broadcast: finite numbers, a short id) and what its screen is told */
  walkInput?(mx: number, mz: number, run: boolean, crouch: boolean): void;
  walkDo?(id: string): boolean;
  walkHit?(): void;
  walkStop?(): void;
  walkFrame?(peek?: boolean): WalkFrame | null;
  /** the driven body is dead, turned or away (asked while paused too: a paused world does not end itself) */
  walkerGone?(): boolean;
}

/** one run, as the run history keeps it */
export interface RunSummary {
  ranMs: number;
  ending: "rescued" | "wiped" | "timeout" | "escaped" | "survived" | null;
  survivors: { who: string; fate: "alive" | "dead" | "turned" | "rescued"; cause?: string }[];
  done: string[];
}
export interface HistoryEntry extends RunSummary {
  run: string;
  runNo: number | null;
  test: boolean;
  map: string | null;
  seed: number;
  /** wall clock */
  startedAt: number;
  endedAt: number;
  /** how it came to an end: the show's own ending, or the admin's stop or restart */
  why: "ended" | "stopped" | "restarted";
}

export type MakeWorld = (opts: { seed?: number; now: () => number; run: string; restore?: string; map?: string; cast?: string[]; zombies?: number; player?: string } & SetupPick) => ShowWorld;
/** THE RUN SETUP's picks (the control room's stage 3): a start room per survivor, the part's and the note's spots */
export interface SetupPick { starts?: Record<string, string>; partSpot?: string; noteSpot?: string }
/** what a run is started on (Admin Panel → Survivorz → Show): the map and who's in it, the setup picks, and (a
 *  test run) the dead */
export interface RunPick extends SetupPick {
  map?: string; cast?: string[]; zombies?: number;
  /** a real show's countdown, chosen on the Start card (ms; absent = COUNTDOWN_MS). Kept in KV_PICKS so a
   *  restart of the same show waits as long again. A test run has none, whatever this says. */
  countdownMs?: number;
  /** WALK THE MAP: a test run with this one survivor in it, driven by the admin's own hand (sim/player.ts) */
  player?: string;
}

export const MAX_WATCHERS = 60;
/** ...and how many of them one account may hold (a member opened all sixty: the code review's C-3) */
export const MAX_WATCHERS_EACH = 3;
/** the walk commands one socket may send: a burst of WALK_BURST, refilled WALK_PER_S a second (the stick is sent
 *  at most 20 times a second; an action, a blow or a stop costs three) */
const WALK_BURST = 60, WALK_PER_S = 40;
/** the walk frame goes out when it changes, at most this often (ms) */
const WALK_FRAME_MS = 200;
/** how many times a minute one address may knock on the show socket's door ✱ */
const KNOCKS_PER_MIN = Number(process.env.SURVIVORZ_KNOCKS_PER_MIN) || 120;
const knock = makeRateLimiter();
/** how often every watch socket's session is looked at again ✱ */
const RECHECK_MS = Number(process.env.SURVIVORZ_RECHECK_MS) || 30_000;
/** the most a watch socket may have waiting to be read before it is hung up on (bytes) ✱ */
const MAX_BUFFERED = Number(process.env.SURVIVORZ_MAX_BUFFERED) || 4 * 1024 * 1024;
/** a walk whose body is dead (or away) is put away this long after ✱ */
const WALK_OVER_MS = Number(process.env.SURVIVORZ_WALK_OVER_MS) || 60_000;
const KV_RUNNING = "survivorz_running";
/** "1": when the AI drops, a real show carries on with code instead of holding (the control room's switch) */
const KV_NOHOLD = "survivorz_nohold";
const KV_ONAIR = "survivorz_onair";
const KV_RUN = "survivorz_run";
const KV_SAVE = "survivorz_save";
const KV_PAUSED = "survivorz_paused";
/** the map and the cast of the run (kept after a stop too, as the panel's next default) */
const KV_MAP = "survivorz_map";
const KV_CAST = "survivorz_cast";
/** the run's setup picks and (a test run) the dead at the start, kept so a restart starts the same way */
const KV_PICKS = "survivorz_picks";
/** THE RUN HISTORY (newest first, the last HISTORY_KEEP runs) */
const KV_HISTORY = "survivorz_history";
/** the running run's wall-clock start (for the history; survives a restart) */
const KV_STARTED = "survivorz_started";
const HISTORY_KEEP = 100;
/** the wall clock a real show's countdown ends at (so a restart mid-countdown keeps counting, not starts the show) */
const KV_COUNTDOWN = "survivorz_countdown";
/** the last run number given (counts up forever; test runs never take one) */
const KV_RUN_NO = "survivorz_run_no";
/** the running run's number ("test" for a test run) */
const KV_RUN_CUR = "survivorz_run_cur";
/** what a WALK found when it began — the map the last show ran on and whether ON AIR was left on — put back when
 *  the walk ends (a walk must change nothing the next real show reads: the review, Nov 13 2026). JSON. */
const KV_WALK_BEFORE = "survivorz_walk_before";
/** how long the engine must be down before a real show holds (a blip must not throw up the card) */
const HOLD_AFTER_MS = Math.max(1000, Number(process.env.SURVIVORZ_HOLD_AFTER_MS) || 10_000);
/** THE COUNTDOWN (BUNKER.md 37): a real show waits this long on its countdown card before the clock starts
 *  (SURVIVORZ_COUNTDOWN_MS for a harness; the admin's "Go now" skips it). A test run has none. */
const COUNTDOWN_MS = Math.max(0, Number(process.env.SURVIVORZ_COUNTDOWN_MS ?? 5 * 60_000));
/** a jump never runs further than this much show clock */
const JUMP_MAX_MS = 2 * 3_600_000;
/** how often (show clock) the running world is saved; SURVIVORZ_SAVE_SIM_MS for a harness */
export const SAVE_SIM_MS = Math.max(1000, Number(process.env.SURVIVORZ_SAVE_SIM_MS) || 3 * 60_000);
/** what KV_SAVE holds: the run it belongs to, the seed, the clock, and the world, deflated */
interface SaveRecord { v: 1; run: string; seed: number; t: number; at: number; z: string }
/** A tick that falls this far behind is dropped rather than run twice — a stalled event loop must
 *  not fast-forward the show in a burst every screen would see as a teleport. */
const MAX_DT_MS = 500;

export interface ShowStatus {
  running: boolean;
  paused: boolean;
  onAir: boolean;
  watchers: number;
  members: number;
  t: number | null;
  seed: number | null;
  /** the run's stable id (it survives a restart) */
  run: string | null;
  /** the last save: when (wall clock), its size (bytes, deflated + base64) and what it cost (ms) */
  saved: { at: number; bytes: number; ms: number } | null;
  ticks: number;
  /** the last tick's cost, ms — the R220 budget is the show's whole frame */
  tickMs: number;
  framesOut: number;
  bytesOut: number;
  /** THE DIAGNOSTICS (the control room's Diagnostics section): the tick's cost against its budget, ticks the event
   *  loop delivered late, who's on the watch socket, and the clocks the broadcast runs on */
  diag: {
    tickAvgMs: number; tickMaxMs: number; lateTicks: number; tickBudgetMs: number;
    /** when this process began (or resumed) the run, and the run's own wall-clock start */
    beganAt: number | null; startedAt: number | null;
    admins: number; streams: number; maxWatchers: number; saveEveryMs: number; holdAfterMs: number;
  };
  /** a test run: not streamed, not numbered, may be sped up and jumped */
  test: boolean;
  /** WALK THE MAP: this (test) run is a walk — one survivor, driven by the admin; `walker` is its body id */
  walk: boolean;
  walker: string | null;
  /** this run's number (null: a test, or stopped); `lastRunNo` the counter */
  runNo: number | null;
  lastRunNo: number;
  /** the test run's speed, 1-8 */
  speed: number;
  /** a jump in progress */
  jumping: { to: string; from: number } | null;
  /** holding behind "Technical difficulties" (the AI engine dropped) */
  held: boolean;
  /** THE CONTROL ROOM's switch: when the AI drops, carry on with code instead of holding */
  noHold: boolean;
  /** the run's dials (length, trickle, starting dead), while one runs */
  dials: { showMin: number; trickle: number; startZombies: number | null } | null;
  /** the countdown before a real show's clock starts: ms left (0 = none) */
  countdown: number;
  /** the countdown a real show gets when the Start card picks none (SURVIVORZ_COUNTDOWN_MS, 5 min) */
  countdownDefaultMs: number;
  setup: RunSetup | null;
  /** the map the run is on (maps.ts), and who it started with — the last run's while stopped */
  map: string | null;
  cast: string[];
}

export interface Broadcast {
  status(): ShowStatus;
  /** start a show — numbered and streamable — or (`test`) a test run that is neither */
  start(seed?: number, opts?: { test?: boolean } & RunPick): ShowStatus;
  stop(): ShowStatus;
  pause(on: boolean): ShowStatus;
  /** the control room's switch: when the AI drops, carry on with code (true) or hold (false) */
  setNoHold(on: boolean): ShowStatus;
  /** THE RUN HISTORY, newest first */
  history(): HistoryEntry[];
  /** restart: a new seed, or (`same`) the same one — the same starting positions and hiding places; the
   *  same map and cast either way */
  reset(seed?: number, opts?: { same?: boolean }): ShowStatus;
  /** a test run's speed (1-8); throws "not_test" on a real show */
  setSpeed(x: number): ShowStatus;
  /** a test run jumps ahead: `minutes` of show clock, or until an objective is done (or the show ends) */
  jump(to: { minutes?: number; objective?: JumpObjective }): ShowStatus;
  /** end the countdown now (the clock starts) */
  go(): ShowStatus;
  /** add `ms` to a running countdown (never past 30 min from now); throws "no_countdown" when none runs */
  wait(ms: number): ShowStatus;
  /** save the running world now (the control room's lever) */
  saveLever(): ShowStatus;
  /** an account's session changed (sign-out, revoke, suspend): its sockets that no longer stand are closed */
  kick(userId: number): void;
  setOnAir(on: boolean): ShowStatus;
  /** may this user open the watch socket / load the show's assets right now? */
  mayWatch(user: { isAdmin?: boolean } | undefined): boolean;
  /** the running world, for the admin's levers (null when stopped) */
  world(): ShowWorld | null;
  /** save the running world now (index.ts's shutdown) */
  saveNow(): void;
}

export function attachSurvivorzBroadcast(httpServer: Server, store: Store, makeWorld: MakeWorld | null): Broadcast {
  const wss = new WebSocketServer({ noServer: true, maxPayload: 1024 });
  const watchers = new Map<WebSocket, { id: number; admin: boolean; stream: boolean; tokens: number; at: number }>();
  let world: ShowWorld | null = null;
  let seed: number | null = null;
  let runId: string | null = null;
  let paused = store.kvGet(KV_PAUSED) === "1";
  let lastSaveT = 0;
  let saved: ShowStatus["saved"] = null;
  let timer: NodeJS.Timeout | null = null;
  let last = 0;
  let ticks = 0, tickMs = 0, framesOut = 0, bytesOut = 0;
  /** the run's diagnostics: the tick's running average and worst, ticks that came late, when this process began the run */
  let tickAvg = 0, tickMax = 0, lateTicks = 0, beganAt = 0;
  let onAir = store.kvGet(KV_ONAIR) === "1";
  let test = false, runNo: number | null = null, speed = 1;
  let jumping: ShowStatus["jumping"] = null, muted = false;
  let held = false, downSince = 0, lastAiCheck = 0;
  /** the running run's wall-clock start, and the run the history has already written */
  let startedWall = 0, recorded: string | null = null;
  let countdownUntil = 0;
  /** WALK THE MAP: the body the admin drives in the running world (null: not a walk), the last walk frame sent and
   *  when, and the socket whose stick is pushed (it goes slack when that socket closes) */
  let walker: string | null = null, walkSent = "", walkSentAt = 0, walkSock: WebSocket | null = null;
  /** does this watcher see the running world? (a test run: an admin's own socket only) */
  const tokenOf = new WeakMap<WebSocket, string | undefined>();
  const sees = (w: { admin: boolean; stream: boolean }): boolean => !test || (w.admin && !w.stream);

  const send = (ws: WebSocket, data: Buffer): void => {
    // a Buffer goes out as a BINARY frame unless told otherwise, and a browser hands that to
    // onmessage as a Blob — encode once, but send as text (realtime.ts does the same)
    if (ws.readyState !== WebSocket.OPEN) return;
    // A SCREEN THAT HAS STOPPED READING IS LET GO (the code review's C-13): the frames it does not take pile up in
    // this process, without limit, for as long as its socket stays open (a tab frozen in the background, a phone
    // gone to sleep on a line that never closed). Past MAX_BUFFERED it is hung up on; a page that is still there
    // opens a new socket within seconds and is sent the world afresh (live.ts).
    if (ws.bufferedAmount > MAX_BUFFERED) { slowDropped++; ws.terminate(); return; }
    ws.send(data, { binary: false }); bytesOut += data.length;
  };
  let slowDropped = 0;
  /** Encode once, send to every watcher (realtime.ts's broadcast rule). */
  const fanOut = (f: ServerFrame): void => {
    framesOut++;
    if (!watchers.size || muted) return;
    const data = Buffer.from(JSON.stringify(f));
    for (const [ws, w] of watchers) if (sees(w)) send(ws, data);
  };
  /** the running world from the top, for one socket: the snapshot, the cast cards, the hold */
  const sendWorld = (ws: WebSocket): void => {
    if (!world) return;
    send(ws, Buffer.from(JSON.stringify(world.snapshot())));
    for (const f of world.catchUp?.() ?? []) send(ws, Buffer.from(JSON.stringify(f)));
    send(ws, castFrame());
    if (held) send(ws, Buffer.from(JSON.stringify({ type: "hold", on: true })));
    if (countdownUntil > Date.now()) send(ws, Buffer.from(JSON.stringify({ type: "countdown", ms: countdownUntil - Date.now() })));
    // (a walk: who they are and what is in reach, right behind the snapshot)
    // (peeked: the note in it is for the one driving, and is theirs on the next pump: the code review's C-10)
    if (walker) { const f = world.walkFrame?.(true); if (f) send(ws, Buffer.from(JSON.stringify(f))); }
  };
  /** the walk frame to every admin socket on the run, when it has changed (or `force`: behind a snapshot) */
  const walkPump = (force = false): void => {
    if (!world || !walker || muted) return;
    const now = Date.now();
    if (!force && now - walkSentAt < WALK_FRAME_MS) return;
    const f = world.walkFrame?.();
    if (!f) return;
    const json = JSON.stringify(f);
    walkSentAt = now;
    if (!force && json === walkSent) return;
    // (a note is sent once: the frame after it is the same frame without it, and need not go out again)
    walkSent = f.note ? JSON.stringify({ ...f, note: undefined }) : json;
    tellSeeing(f);
  };
  /** A walk command from an admin's own socket (the caller has checked that much): parsed, bounded, counted, and
   *  only then handed to the world. Anything else is dropped. */
  const walkCommand = (ws: WebSocket, w: { tokens: number; at: number }, raw: string): void => {
    if (!world || !walker) return;
    let m: { type?: unknown; mx?: unknown; mz?: unknown; run?: unknown; crouch?: unknown; id?: unknown };
    try { m = JSON.parse(raw); } catch { return; }
    if (!m || typeof m !== "object" || typeof m.type !== "string" || !m.type.startsWith("walk.")) return;
    const now = Date.now();
    w.tokens = Math.min(WALK_BURST, w.tokens + (now - w.at) / 1000 * WALK_PER_S); w.at = now;
    const cost = m.type === "walk.in" ? 1 : 3;
    // (a flood is counted out, not obeyed — and the stick goes slack, so the last push let through isn't left on)
    // (THEIR OWN push: a second admin socket's flood used to let go of the first one's held key: the review's C-9)
    if (w.tokens < cost) { if (walkSock === ws) { world.walkInput?.(0, 0, false, false); walkSock = null; } return; }
    w.tokens -= cost;
    // (a paused or jumping run takes nothing — but a key let go is still let go, or the body walks on at resume.
    // Counted like any other frame.)
    if (paused || jumping) { if (m.type === "walk.stop" || (m.type === "walk.in" && m.mx === 0 && m.mz === 0)) { world.walkInput?.(0, 0, false, false); if (walkSock === ws) walkSock = null; } return; }
    if (m.type === "walk.in") {
      if (typeof m.mx !== "number" || typeof m.mz !== "number" || !Number.isFinite(m.mx) || !Number.isFinite(m.mz)) return;
      const len = Math.hypot(m.mx, m.mz), k = len > 1 ? 1 / len : 1;
      world.walkInput?.(m.mx * k, m.mz * k, m.run === true, m.crouch === true);
      walkSock = len >= 0.1 ? ws : walkSock === ws ? null : walkSock;
    } else if (m.type === "walk.do") {
      if (typeof m.id !== "string" || m.id.length < 1 || m.id.length > 80) return;
      world.walkDo?.(m.id);
    } else if (m.type === "walk.hit") world.walkHit?.();
    else if (m.type === "walk.stop") { world.walkStop?.(); if (walkSock === ws) walkSock = null; }
  };
  const tellSeeing = (msg: unknown): void => {
    const data = Buffer.from(JSON.stringify(msg));
    for (const [ws, w] of watchers) if (sees(w)) send(ws, data);
  };
  // THE CAST IS LIVE (Nov 4 2026): who's in the show, as the page may know them (cast/rules.ts publicOf: no
  // sheets, no genes) — after every snapshot, and to everyone watching whenever the panel's list changes it,
  // so a character brought in from the list has a name on the cards without a client rebuild
  const castFrame = (): Buffer => Buffer.from(JSON.stringify({ type: "cast", cast: CHARACTERS.map((c) => publicOf(c, SUITED.has(c.id))) }));
  onCast(() => { if (world && watchers.size) for (const [ws, w] of watchers) if (sees(w)) send(ws, castFrame()); });

  const run = (): void => {
    // A WALK WHOSE BODY IS GONE ENDS BY ITSELF (the code review's C-11): it used to tick and save until somebody
    // stopped it, and a real show could not be started meanwhile (409). Paused or not: a walk paused over its
    // dead body sat there for good (the re-grade).
    if (world && walker && (world.over?.() || world.walkerGone?.())) {
      walkOverAt = walkOverAt || Date.now();
      if (Date.now() - walkOverAt >= WALK_OVER_MS) { walkOverAt = 0; stopRun(); return; }
    } else walkOverAt = 0;
    if (!world || paused || jumping) { last = Date.now(); return; }
    const now = Date.now();
    if (countdownUntil) {
      if (now < countdownUntil) { last = now; return; }
      countdownUntil = 0; store.kvDel(KV_COUNTDOWN);
      tellSeeing({ type: "countdown", ms: 0 });
    }
    // THE HOLD: a real show whose AI engine has been down HOLD_AFTER_MS stops its clock behind the card
    if (!test && world.aiDown && now - lastAiCheck >= 1000) {
      lastAiCheck = now;
      // a run that's over has nothing left to think about: its end and recap cards stay on screen, never the hold card
      const down = world.aiDown() && !world.over?.() && !noHold();
      downSince = down ? downSince || now : 0;
      const hold = down && now - downSince >= HOLD_AFTER_MS;
      if (hold !== held) {
        held = hold;
        tellSeeing({ type: "hold", on: held });
        console.log(`[survivorz] ${held ? "the AI engine is down: the show HOLDS (Technical difficulties)" : "the AI engine is back: the show carries on"}`);
      }
    }
    if (held) { last = now; return; }
    const dt = Math.min(MAX_DT_MS, Math.max(0, now - last)) * (test ? speed : 1);
    if (now - last > MAX_DT_MS) lateTicks++;
    last = now;
    const t0 = performance.now();
    world.tick(dt);
    tickMs = performance.now() - t0;
    ticks++;
    tickAvg += (tickMs - tickAvg) * 0.02;
    if (tickMs > tickMax) tickMax = tickMs;
    if (recorded !== runId && world.over?.()) record("ended");
    if (simTime() - lastSaveT >= SAVE_SIM_MS) save();
    walkPump();
  };

  /** when a walk's world was first seen to be over (0 = it is not) */
  let walkOverAt = 0;
  const simTime = (): number => (world ? (world.simTime ? world.simTime() : world.snapshot().t) : 0);

  /** Save the running world to app_kv. Never throws: a failed save is logged and the show runs on. */
  const save = (): void => {
    if (!world?.save || !runId || seed === null) return;
    lastSaveT = simTime();
    try {
      const t0 = performance.now();
      const raw = world.save();
      const z = deflateRawSync(Buffer.from(raw)).toString("base64");
      const rec: SaveRecord = { v: 1, run: runId, seed, t: lastSaveT, at: Date.now(), z };
      store.kvSet(KV_SAVE, JSON.stringify(rec));
      world.flush?.();
      saved = { at: rec.at, bytes: z.length, ms: Math.round((performance.now() - t0) * 10) / 10 };
    } catch (e) {
      console.error("[survivorz] could not save the show:", e);
    }
  };

  /** The saved world, if there is one that reads. */
  const loadSave = (): SaveRecord | null => {
    const raw = store.kvGet(KV_SAVE);
    if (!raw) return null;
    try {
      const rec = JSON.parse(raw) as SaveRecord;
      if (rec.v !== 1 || typeof rec.z !== "string" || typeof rec.run !== "string") return null;
      return rec;
    } catch { return null; }
  };

  /** Start a world: a fresh run (a new id), or — `resume` — the saved one. */
  const kvPicks = (): RunPick => { try { const v = JSON.parse(store.kvGet(KV_PICKS) ?? "{}"); return v && typeof v === "object" ? v as RunPick : {}; } catch { return {}; } };
  const readHistory = (): HistoryEntry[] => { try { const v = JSON.parse(store.kvGet(KV_HISTORY) ?? "[]"); return Array.isArray(v) ? v : []; } catch { return []; } };
  /** Write the running run into THE RUN HISTORY once: when it ends by itself, or when the admin stops or
   *  restarts it. A run already written isn't written again (a stop after the end changes nothing). */
  const record = (why: HistoryEntry["why"]): void => {
    if (!world || !runId || recorded === runId || seed === null) return;
    // (a walk is the admin looking round a map, not a run of the show: it is not kept)
    if (walker) return;
    const sum = world.summary?.();
    if (!sum) return;
    recorded = runId;
    const entry: HistoryEntry = { ...sum, run: runId, runNo, test, map: store.kvGet(KV_MAP) ?? null, seed, startedAt: startedWall, endedAt: Date.now(), why };
    // ONE ENTRY A RUN: a run that ended, was written, and was then resumed by a restart is over again on its first
    // tick — written twice, it was two rows with one id (and the panel's list is keyed by it)
    try { store.kvSet(KV_HISTORY, JSON.stringify([entry, ...readHistory().filter((h) => h.run !== runId)].slice(0, HISTORY_KEEP))); }
    catch (e) { console.error("[survivorz] the run history could not be written:", (e as Error).message); }
  };
  const kvCast = (): string[] => { try { const v = JSON.parse(store.kvGet(KV_CAST) ?? "[]"); return Array.isArray(v) ? v.filter((x) => typeof x === "string") : []; } catch { return []; } };
  const begin = (s?: number, resume?: SaveRecord, asTest = false, pick: RunPick = {}): void => {
    if (!makeWorld) throw new Error("no_world");
    // A WORLD THAT WILL NOT BE MADE LEAVES NOTHING HALF BEGUN (the code review's C-14): `test`, the run's number
    // and the kept picks were all written before the world was built, so a throw there left a "test run" with no
    // world. Everything this start wrote is taken back.
    const before = { runNo: store.kvGet(KV_RUN_NO), cur: store.kvGet(KV_RUN_CUR), map: store.kvGet(KV_MAP), picks: store.kvGet(KV_PICKS), cast: store.kvGet(KV_CAST), walk: store.kvGet(KV_WALK_BEFORE), cd: store.kvGet(KV_COUNTDOWN) };
    try { beginWorld(s, resume, asTest, pick); }
    catch (e) {
      if (!resume) for (const [k, v] of [[KV_RUN_NO, before.runNo], [KV_RUN_CUR, before.cur], [KV_MAP, before.map], [KV_PICKS, before.picks], [KV_CAST, before.cast], [KV_WALK_BEFORE, before.walk], [KV_COUNTDOWN, before.cd]] as const) { if (v === null || v === undefined) store.kvDel(k); else store.kvSet(k, v); }
      halt();
      // (...and nothing is left saying a run is live. A RESET had already put the old world away when its new one
      // failed: the panel said stopped while the kept keys said running, and the next boot resumed the old run.)
      if (!resume) { for (const k of [KV_RUNNING, KV_SAVE, KV_RUN, KV_PAUSED, KV_RUN_CUR, KV_COUNTDOWN]) store.kvDel(k); walkGiveBack(); paused = false; tellAll({ type: "offair" }); }
      throw e;
    }
  };
  const beginWorld = (s?: number, resume?: SaveRecord, asTest = false, pick: RunPick = {}): void => {
    if (!makeWorld) throw new Error("no_world");
    setTalkMap(pick.map ?? store.kvGet(KV_MAP));   // (the minds are told where they are: the map's world, maps.ts)
    held = false; downSince = 0; speed = 1; jumping = null; muted = false; countdownUntil = 0;
    if (resume) {
      const cur = store.kvGet(KV_RUN_CUR) ?? "";
      test = cur === "test"; runNo = test || !cur ? null : Number(cur) || null;
      const cd = Number(store.kvGet(KV_COUNTDOWN)) || 0;
      if (!test && cd > Date.now()) countdownUntil = cd;
    } else {
      test = asTest;
      if (test) runNo = null;
      else { runNo = (Number(store.kvGet(KV_RUN_NO)) || 0) + 1; store.kvSet(KV_RUN_NO, String(runNo)); }
      store.kvSet(KV_RUN_CUR, test ? "test" : String(runNo));
      const cdMs = pick.countdownMs ?? COUNTDOWN_MS;
      if (!test && cdMs > 0) countdownUntil = Date.now() + cdMs;
      if (countdownUntil) store.kvSet(KV_COUNTDOWN, String(countdownUntil)); else store.kvDel(KV_COUNTDOWN);
    }
    if (resume) {
      const restore = inflateRawSync(Buffer.from(resume.z, "base64")).toString();
      // (on the run's own map, kept beside it: a save is refused by a world made on any other)
      const w = makeWorld({ seed: resume.seed, now: Date.now, run: resume.run, restore, map: store.kvGet(KV_MAP) ?? undefined });
      world = w; seed = resume.seed; runId = resume.run;
      startedWall = Number(store.kvGet(KV_STARTED)) || Date.now(); recorded = null;
      lastSaveT = simTime();
    } else {
      seed = s ?? randomSeed();
      runId = `${Date.now().toString(36)}-${seed.toString(36)}`;
      // (a run that is not a walk starts clean: nothing a walk once borrowed is waiting to be "given back" to it)
      // (...and an ordinary test run gives ON AIR back too when it is stopped, as a walk always did: it took it
      // off the air to begin with. Its map stays the panel's pick: `keepMap`.)
      if (!asTest) store.kvDel(KV_WALK_BEFORE);
      if (asTest && !store.kvGet(KV_WALK_BEFORE)) store.kvSet(KV_WALK_BEFORE, JSON.stringify(pick.player ? { map: store.kvGet(KV_MAP) ?? null, onAir } : { onAir, keepMap: true }));
      if (pick.map) store.kvSet(KV_MAP, pick.map);
      // (a walk leaves the panel's cast as it was: its one survivor is the walk's, kept with the picks below)
      const walkWho = asTest && pick.player ? pick.player : undefined;
      if (walkWho) { /* kept */ } else if (pick.cast?.length) store.kvSet(KV_CAST, JSON.stringify(pick.cast)); else store.kvDel(KV_CAST);
      const picks: SetupPick & { zombies?: number } = {
        ...(pick.starts && Object.keys(pick.starts).length ? { starts: pick.starts } : {}),
        ...(pick.partSpot ? { partSpot: pick.partSpot } : {}),
        ...(pick.noteSpot ? { noteSpot: pick.noteSpot } : {}),
        ...(asTest && pick.zombies !== undefined ? { zombies: pick.zombies } : {}),
        ...(walkWho ? { player: walkWho } : {}),
      };
      // the countdown rides with the picks (never into the world) so a restart of this show waits as long again
      store.kvSet(KV_PICKS, JSON.stringify({ ...picks, ...(pick.countdownMs !== undefined ? { countdownMs: pick.countdownMs } : {}) }));
      world = makeWorld({ seed, now: Date.now, run: runId, map: store.kvGet(KV_MAP) ?? undefined, cast: !walkWho && pick.cast?.length ? pick.cast : undefined, ...picks });
      startedWall = Date.now(); recorded = null;
      store.kvSet(KV_RUN, runId);
      store.kvSet(KV_STARTED, String(startedWall));
      save();
    }
    world.onFrame(fanOut);
    // (a walk is known by the world itself: a resumed one comes back a walk, with the same body)
    walker = test ? world.walker?.() ?? null : null; walkSent = ""; walkSock = null;
    last = Date.now();
    ticks = 0; tickAvg = 0; tickMax = 0; lateTicks = 0; beganAt = Date.now();
    if (!timer) {
      timer = setInterval(() => guardedTick(store, "survivorz", 2000, run), Math.round(1000 / TICK_HZ));
      timer.unref?.();
    }
    // a test run is never on air
    if (test && onAir) { onAir = false; store.kvDel(KV_ONAIR); for (const [ws, w] of watchers) if (!w.admin) ws.close(4003, "off_air"); }
    // every screen already watching starts from the new world (a test run: only an admin's own; the rest go dark)
    const snap = Buffer.from(JSON.stringify(world.snapshot()));
    const dark = Buffer.from(JSON.stringify({ type: "offair" }));
    for (const [ws, w] of watchers) send(ws, sees(w) ? snap : dark);
    if (countdownUntil) tellSeeing({ type: "countdown", ms: countdownUntil - Date.now() });
    walkPump(true);
  };

  /** a walk is over: the map and the ON AIR switch are as the last real show left them */
  const walkGiveBack = (): void => {
    const raw = store.kvGet(KV_WALK_BEFORE);
    if (!raw) return;
    store.kvDel(KV_WALK_BEFORE);
    try {
      const b = JSON.parse(raw) as { map?: string | null; onAir?: boolean; keepMap?: boolean };
      if (!b.keepMap) { if (b.map) store.kvSet(KV_MAP, b.map); else store.kvDel(KV_MAP); }
      if (b.onAir) { onAir = true; store.kvSet(KV_ONAIR, "1"); }
    } catch { /* nothing to give back */ }
  };
  /** the run is over and put away (the admin's stop; a walk whose body is gone) */
  const stopRun = (): void => {
    record(world?.over?.() ? "ended" : "stopped");
    halt();
    for (const k of [KV_RUNNING, KV_SAVE, KV_RUN, KV_PAUSED, KV_RUN_CUR, KV_COUNTDOWN]) store.kvDel(k);
    walkGiveBack();
    paused = false;
    tellAll({ type: "offair" });
  };
  const halt = (): void => {
    if (timer) { clearInterval(timer); timer = null; }
    world = null;
    seed = null;
    runId = null;
    saved = null;
    test = false; runNo = null; speed = 1; jumping = null; muted = false; held = false; downSince = 0; countdownUntil = 0;
    walker = null; walkSent = ""; walkSock = null;
    // a line still waiting for its voice belongs to the world that just went (voices.ts)
    dropHeldVoices();
  };

  const status = (): ShowStatus => ({
    running: !!world, paused, onAir,
    watchers: watchers.size,
    members: [...watchers.values()].filter((w) => !w.admin).length,
    t: world ? simTime() : null,
    seed, run: runId, saved, ticks, tickMs: Math.round(tickMs * 100) / 100, framesOut, bytesOut,
    diag: {
      tickAvgMs: Math.round(tickAvg * 100) / 100, tickMaxMs: Math.round(tickMax * 100) / 100, lateTicks, tickBudgetMs: Math.round(1000 / TICK_HZ),
      beganAt: world ? beganAt : null, startedAt: world ? startedWall : null,
      admins: [...watchers.values()].filter((w) => w.admin && !w.stream).length,
      streams: [...watchers.values()].filter((w) => w.stream).length,
      maxWatchers: MAX_WATCHERS, saveEveryMs: SAVE_SIM_MS, holdAfterMs: HOLD_AFTER_MS,
    },
    test, walk: !!walker, walker, runNo, lastRunNo: Number(store.kvGet(KV_RUN_NO)) || 0, speed, jumping, held, noHold: noHold(),
    dials: world?.dials?.() ?? null,
    countdown: Math.max(0, countdownUntil - Date.now()),
    countdownDefaultMs: COUNTDOWN_MS,
    setup: world?.setup?.() ?? null,
    map: store.kvGet(KV_MAP) ?? null,
    cast: walker ? [walker.replace(/^s:/, "")] : kvCast(),
  });

  function noHold(): boolean { return store.kvGet(KV_NOHOLD) === "1"; }

  const mayWatch = (user: { isAdmin?: boolean } | undefined): boolean =>
    !!user && (user.isAdmin === true || (onAir && !test));

  httpServer.on("upgrade", (req: IncomingMessage, socket: Duplex, head: Buffer) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    if (url.pathname !== "/ws-survivorz") return;
    // THE STREAM RIG (streamtoken.ts): watches even off air, never counted as a member
    const stream = isStreamToken(url.searchParams.get("token"));
    const refuse = (code: string): void => { socket.write(`HTTP/1.1 ${code}\r\n\r\n`); socket.destroy(); };
    // (KNOCKS ARE COUNTED BY ADDRESS, before the session is looked up: each one is a read of the sessions table,
    // and nothing stopped a loop of them. The stream rig's own token is not counted. The re-grade.)
    if (!stream && !knock(`sz-ws:${clientIp(req)}`, KNOCKS_PER_MIN, 60_000)) return refuse("429 Too Many Requests");
    const user = stream ? STREAM_PRINCIPAL : userForToken(store, url.searchParams.get("token") ?? undefined);
    if (!user) return refuse("401 Unauthorized");
    if (!stream && termsOutstanding(user)) return refuse("403 Forbidden");
    if (!stream && !mayWatch(user)) return refuse("403 Forbidden");
    if (!stream && !user.isAdmin && watchers.size >= MAX_WATCHERS) return refuse("503 Service Unavailable");
    if (!stream && !user.isAdmin) { let mine = 0; for (const o of watchers.values()) if (!o.stream && o.id === user.id) mine++; if (mine >= MAX_WATCHERS_EACH) return refuse("429 Too Many Requests"); }
    wss.handleUpgrade(req, socket, head, (ws) => {
      if (!stream) rememberSocketToken(ws, url.searchParams.get("token"));
      const w = { id: user.id, admin: stream || user.isAdmin === true, stream, tokens: WALK_BURST, at: Date.now() };
      watchers.set(ws, w);
      if (!stream) tokenOf.set(ws, url.searchParams.get("token") ?? undefined);
      const gone = (): void => {
        watchers.delete(ws);
        // (the one whose stick was pushed has gone: the body stands, it doesn't walk on into a wall)
        if (walkSock === ws) { walkSock = null; if (walker) world?.walkInput?.(0, 0, false, false); }
      };
      ws.on("close", gone);
      ws.on("error", gone);
      // nothing a watcher sends is ever read — but an ADMIN's own socket, in a WALK run, drives the body
      // (walkCommand: every message checked and counted). The stream rig is not an admin for this.
      if (w.admin && !w.stream) ws.on("message", (data, isBinary) => { if (!isBinary && walker) walkCommand(ws, w, String(data)); });
      if (world && sees(w)) sendWorld(ws);
      else send(ws, Buffer.from(JSON.stringify({ type: "offair" })));
    });
  });

  // a show that was running before a restart RESUMES — the same run, from its last save (paused if it was)
  if (store.kvGet(KV_RUNNING) === "1" && makeWorld) {
    const rec = loadSave();
    const want = store.kvGet(KV_RUN);
    let resumed = false, otherMap = false;
    if (rec && (!want || rec.run === want)) {
      try {
        const t0 = performance.now();
        begin(undefined, rec);
        // (a walk saved with the stick pushed: nobody is holding it now. The body walked eleven metres after a
        // restart with nobody connected: the code review's C-2)
        if (walker) (world as unknown as { walkInput?(mx: number, mz: number, run: boolean, crouch: boolean): void } | null)?.walkInput?.(0, 0, false, false);
        resumed = true;
        console.log(`[survivorz] resumed run ${rec.run} at show clock ${new Date(rec.t).toISOString()} (saved ${Math.round((Date.now() - rec.at) / 1000)} s ago, ${Math.round(performance.now() - t0)} ms to load)${paused ? ", paused" : ""}`);
      } catch (e) {
        // a save from another map is the old show: stop rather than start a numbered show nobody asked for
        otherMap = /from another map/.test(String((e as Error)?.message));
        if (otherMap) { console.log(`[survivorz] the saved run ${rec.run} is from another map — the show is stopped; start one from the Admin Panel`); store.kvSet(KV_RUNNING, "0"); }
        else console.error(`[survivorz] the saved run ${rec.run} would not load — starting a FRESH run:`, e);
        halt();
      }
    } else console.error(`[survivorz] the show was running but there's no save for run ${want ?? "?"} — starting a FRESH run`);
    // (what was running was a TEST RUN or a walk: it is over. A fresh run here would be a numbered real show, with
    // its countdown, sent to the stream rig — started by nobody. The review, Nov 13 2026.)
    const wasTest = store.kvGet(KV_RUN_CUR) === "test";
    if (!resumed && !otherMap && wasTest) {
      console.log("[survivorz] the test run that was going could not be resumed — the show is stopped");
      for (const k of [KV_RUNNING, KV_SAVE, KV_RUN, KV_PAUSED, KV_RUN_CUR, KV_COUNTDOWN]) store.kvDel(k);
      walkGiveBack();
    }
    if (!resumed && !otherMap && !wasTest) {
      try { begin(undefined, undefined, false, { map: store.kvGet(KV_MAP) ?? undefined, cast: kvCast() }); } catch (e) { console.error("[survivorz] could not start the show:", e); }
    }
  }

  const tellAll = (msg: unknown): void => {
    const data = Buffer.from(JSON.stringify(msg));
    for (const ws of watchers.keys()) send(ws, data);
  };

  /** THE JUMP (a test run only): the sim alone, a second at a time, in slices of the event loop so the server keeps
   *  answering; nothing goes out meanwhile, then everyone watching gets the new world in one snapshot. */
  const jump = (to: { minutes?: number; objective?: JumpObjective }): void => {
    if (!world) throw new Error("no_world");
    if (!test) throw new Error("not_test");
    if (jumping) throw new Error("busy");
    const w = world, t0 = simTime();
    const until = t0 + Math.min(JUMP_MAX_MS, to.minutes ? to.minutes * 60_000 : JUMP_MAX_MS);
    jumping = { to: to.objective ?? `+${to.minutes} min`, from: t0 };
    muted = true;
    const finish = (): void => {
      jumping = null; muted = false; last = Date.now();
      if (world !== w) return;
      for (const [ws, x] of watchers) if (sees(x)) sendWorld(ws);
      save();
    };
    const slice = (): void => {
      if (world !== w) { jumping = null; muted = false; return; }
      const wall = Date.now();
      try {
        while (Date.now() - wall < 40) {
          if (w.over?.() || simTime() >= until || (to.objective && w.done?.(to.objective))) return finish();
          (w.fastTick ?? w.tick).call(w, 1000);
        }
      } catch (e) { console.error("[survivorz] the jump failed:", e); return finish(); }
      setImmediate(slice);
    };
    setImmediate(slice);
  };

  // KEEPALIVE: the show can be quiet (paused, off air, nobody moving), so without a frame now and then a
  // half-open socket can't be told from a quiet one. Every watch socket gets one every KEEPALIVE_MS.
  const ka = setInterval(() => { if (watchers.size) tellAll({ type: "ka", t: Date.now() }); }, KEEPALIVE_MS);
  ka.unref?.();
  // A SESSION CAN END WITH NO EVENT (the re-grade): a member who dies on the Wheel while watching, a session row
  // taken by the age prune. Its socket stayed open, and an admin's went on driving a walk. Every watch socket's
  // session is looked at again on a clock, as it was at the door.
  const recheck = setInterval(() => {
    for (const [ws, w] of watchers) {
      if (w.stream) continue;
      const u = sessionStandsFor(store, ws) ? userForToken(store, tokenOf.get(ws)) : null;
      if (!u || termsOutstanding(u) || !mayWatch(u)) { if (walkSock === ws) { world?.walkInput?.(0, 0, false, false); walkSock = null; } ws.close(4003, "kicked"); }
    }
  }, RECHECK_MS);
  recheck.unref?.();

  const setPaused = (on: boolean): void => {
    paused = on;
    if (on) store.kvSet(KV_PAUSED, "1"); else store.kvDel(KV_PAUSED);
    save();
  };

  return {
    status,
    history: () => readHistory(),
    setNoHold(on) {
      store.kvSet(KV_NOHOLD, on ? "1" : "0");
      if (on && held) { held = false; downSince = 0; tellSeeing({ type: "hold", on: false }); }
      return status();
    },
    start(s, opts) {
      // (a walk gives way to another walk: the admin picking the next map to look round)
      if (world && walker && opts?.test && opts.player) { halt(); for (const k of [KV_SAVE, KV_RUN]) store.kvDel(k); }
      if (world) throw new Error("already_running");
      begin(s, undefined, !!opts?.test, { map: opts?.map, cast: opts?.cast, zombies: opts?.zombies, starts: opts?.starts, partSpot: opts?.partSpot, noteSpot: opts?.noteSpot, countdownMs: opts?.countdownMs, player: opts?.test ? opts.player : undefined });
      store.kvSet(KV_RUNNING, "1"); setPaused(false); return status();
    },
    stop() { stopRun(); return status(); },
    pause(on) { if (!world) throw new Error("not_running"); setPaused(on); return status(); },
    reset(s, opts) {
      // (with nothing running this used to START a numbered show, countdown and all)
      if (!world) throw new Error("not_running");
      const wasTest = test, same = seed;
      record(world?.over?.() ? "ended" : "restarted");
      halt();
      begin(opts?.same && same !== null ? same : s, undefined, wasTest, { ...kvPicks(), map: store.kvGet(KV_MAP) ?? undefined, cast: kvCast() });
      store.kvSet(KV_RUNNING, "1"); setPaused(false); return status();
    },
    setSpeed(x) {
      if (!world) throw new Error("no_world");
      if (!test) throw new Error("not_test");
      speed = Math.max(1, Math.min(8, Math.round(x) || 1));
      return status();
    },
    jump(to) { jump(to); return status(); },
    go() {
      if (countdownUntil) { countdownUntil = 0; store.kvDel(KV_COUNTDOWN); last = Date.now(); tellSeeing({ type: "countdown", ms: 0 }); }
      return status();
    },
    wait(ms) {
      if (!world) throw new Error("not_running");
      if (!countdownUntil || countdownUntil <= Date.now()) throw new Error("no_countdown");
      countdownUntil = Math.min(Date.now() + 30 * 60_000, countdownUntil + Math.max(0, ms));
      store.kvSet(KV_COUNTDOWN, String(countdownUntil));
      tellSeeing({ type: "countdown", ms: countdownUntil - Date.now() });
      return status();
    },
    saveLever() { if (!world) throw new Error("not_running"); save(); return status(); },
    // SIGNED OUT, REVOKED, SUSPENDED (the code review's C-1): every other socket in Solace hangs up on `user.kick`;
    // this one checked its token once, at the door, and a signed-out admin's socket could still drive a walk.
    kick(userId) {
      for (const [ws, w] of watchers) {
        if (w.stream || w.id !== userId) continue;
        const u = sessionStandsFor(store, ws) ? userForToken(store, tokenOf.get(ws)) : null;
        if (!u || termsOutstanding(u) || !mayWatch(u)) ws.close(4003, "kicked");
      }
    },
    setOnAir(on) {
      if (on && test) throw new Error("test_run");
      onAir = on;
      if (on) store.kvSet(KV_ONAIR, "1"); else store.kvDel(KV_ONAIR);
      // (OFF AIR pressed during a test run or a walk is the admin's last word: the run's end used to "give back"
      // the ON AIR it had borrowed, and the next real show started on air)
      if (!on) {
        const raw = store.kvGet(KV_WALK_BEFORE);
        if (raw) { try { const v = JSON.parse(raw); if (v && typeof v === "object" && v.onAir) { v.onAir = false; store.kvSet(KV_WALK_BEFORE, JSON.stringify(v)); } } catch { /* nothing kept */ } }
      }
      // taking the show off air closes every member's socket; the admin keeps watching
      if (!on) for (const [ws, w] of watchers) if (!w.admin) ws.close(4003, "off_air");
      return status();
    },
    mayWatch,
    world: () => world,
    saveNow: save,
  };
}
