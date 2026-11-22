// THE RACE DIRECTOR — one clock, one set of sound cues, every screen.
//
// derby-race.ts already gave both screens the same CURVES. This gives them the
// same RUN: the 3-2-1 countdown eating the front of the clock, the frog's
// thirteen hops, the boulder's late detonation (or its pratfall), the buzzer
// on the frame the winner's lane crosses, and the crowd under all of it.
//
// It exists because the casino's jumbotron now shows the real racetrack
// component rather than a drawing of one (Josh, Aug 2026: "i would like you to
// put the same screen someone would see in the 2d casino. also include the
// sounds as well"), and a shared component driven by two hand-copied clocks
// would be the same bug in a new place.
//
// Pure timing + audio: it renders nothing and reads no store.

import type { DerbyState } from "./api";
import { raceModel, mulberry32 } from "./derby-race";
import { countBeep, goBeep, raceCrowd, finishFanfare, flopThud } from "./derby-audio";
import { planCall, callClips, CALL_GAIN, CALL_TAIL_MS, CALLER_ON } from "./derby-call";
import { playSfx, preloadSfx } from "./sfx";

export const COUNTDOWN_MS = 3000;
export const GO_HOLD_MS = 700;

export interface RaceFrame {
  /** 0..1 per racer, in `st.racers` order. */
  progress: number[];
  /** 3 / 2 / 1 / 0 during the start, null once they're off. */
  countdown: number | null;
  /** Old Reliable has keeled over. */
  boulderDown: boolean;
}

export interface RaceRunOpts {
  onFrame(f: RaceFrame): void;
  /** Scales every cue, sampled per cue. 0 = silent — the casino uses it to
   *  fade the jumbotron by how far away you're standing. Default: full. */
  volume?: () => number;
  /** Bail out early if the round is abandoned. Default: run to the end. */
  stillLive?: () => boolean;
}

// ---- THE SHARED CLOCK (Derby v2) ------------------------------------------------
// The race used to start from `Date.now()` when THIS screen first saw it, so a
// late joiner (a refresh, walking into the casino) watched a fresh race from
// the gate, and a browser whose clock ran slow revealed the winner before
// their lane crossed. Now every screen runs the race on the SERVER's clock:
// each state carries the server's time, the client remembers its offset, and
// the race is positioned from the gun (`startedAt`).
let skew = 0;
/** Remember how far this browser's clock is from the server's. */
export function noteServerClock(serverNow: number | undefined): void {
  if (typeof serverNow === "number" && serverNow > 0) skew = serverNow - Date.now();
}
/** Now, on the server's clock. */
export function serverTime(): number {
  return Date.now() + skew;
}
/** When the race's gun went (server ms) and how long the running lasts after
 *  the countdown. Every screen gets the same answer. */
export function raceClock(st: DerbyState): { start: number; runMs: number } {
  const total = st.raceMs > 0 ? st.raceMs : 14_000;
  const start = st.startedAt ?? (st.endsAt ?? serverTime()) - total;
  return { start, runMs: total - COUNTDOWN_MS };
}
/** Server ms when the last runner is done — the moment the result shows. */
export function raceRevealAt(st: DerbyState): number {
  const { start, runMs } = raceClock(st);
  const model = raceModel(st.seed, st.racers.map((r) => r.key), st.placings, runMs);
  return start + COUNTDOWN_MS + model.lastFinish + 400;
}

/** Run `st`'s race. Returns a stop function — call it on unmount, or when a
 *  new round arrives, or the old race keeps playing under the new one. */
export function runRace(st: DerbyState, opts: RaceRunOpts): () => void {
  const { start, runMs } = raceClock(st);
  const keys = st.racers.map((r) => r.key);
  const model = raceModel(st.seed, keys, st.placings, runMs);
  const vol = (): number => Math.max(0, Math.min(1, opts.volume?.() ?? 1));
  const live = (): boolean => opts.stillLive?.() ?? true;

  // Sound anchors ride the ANIMATION, not server phases: the winner visually
  // crosses at the model's winnerFin — the buzzer fires there and the crowd
  // runs exactly that long (plus a short tail).
  const winnerFin = model.winnerFin;
  // THE RACE CALLER: the same cues on every screen, planned from the seed.
  if (CALLER_ON) preloadSfx(callClips());
  const cues = CALLER_ON ? planCall(model, keys, st.placings, mulberry32(st.seed ^ 0x5eed)) : [];
  // Frames stop once everybody's done; the loop runs on only for the caller.
  const framesUntil = model.lastFinish + 400;
  const endAt = COUNTDOWN_MS + Math.max(framesUntil, winnerFin + CALL_TAIL_MS);
  const joinedAt = serverTime() - start;
  let nextCue = 0;
  let stopCrowd: (() => void) | null = null;
  // Joined after the gun: no countdown beeps to replay, and nothing already
  // past is played late (each sound has a one-second shelf life below).
  let lastCount = joinedAt >= COUNTDOWN_MS ? 0 : -1;
  let crowdOn = false;
  let buzzed = false;
  let flopped = false;
  let finalSent = false;
  let raf = 0;
  let stopped = false;
  const fresh = (late: number): boolean => late >= 0 && late < 1000;

  const step = (): void => {
    if (stopped) return;
    const t = serverTime() - start;
    let countdown: number | null = null;
    if (t < COUNTDOWN_MS + GO_HOLD_MS) {
      const n = t < COUNTDOWN_MS ? Math.max(1, Math.ceil((COUNTDOWN_MS - t) / 1000)) : 0;
      countdown = n;
      if (n !== lastCount) {
        lastCount = n;
        const g = vol();
        if (n > 0) {
          if (g > 0) countBeep(g);
        } else {
          if (g > 0) goBeep(g);
        }
      }
    }
    const tr = Math.max(0, t - COUNTDOWN_MS);
    // The crowd from the gun to the line — or from whenever this screen
    // arrived, for what's left of it.
    if (!crowdOn && t >= COUNTDOWN_MS && tr < winnerFin) {
      crowdOn = true;
      if (vol() > 0) stopCrowd = raceCrowd(winnerFin + 1200 - tr, vol());
    }
    const f = model.at(tr);
    if (f.boulderDown && !flopped) {
      flopped = true;
      if (vol() > 0 && fresh(tr - (f.boulderGo ?? tr) - 700)) flopThud(vol()); // the legend hits the dirt
    }
    // The caller: a cue whose moment has come plays; one more than a second
    // stale (a late joiner, a backgrounded tab) is skipped, never stacked.
    if (t >= COUNTDOWN_MS) {
      while (nextCue < cues.length && cues[nextCue].at <= tr) {
        const c = cues[nextCue++];
        if (fresh(tr - c.at) && vol() > 0) playSfx(c.clip, CALL_GAIN * vol());
      }
    }
    if (tr <= framesUntil || !finalSent) {
      finalSent = tr > framesUntil;
      opts.onFrame({ progress: f.progress, countdown, boulderDown: f.boulderDown });
    }
    // "AND THAT'S THE RACE, FOLKS" — the instant the winner's lane visually
    // crosses the line, not when the server phase flips.
    if (!buzzed && tr >= winnerFin) {
      buzzed = true;
      if (vol() > 0 && fresh(tr - winnerFin)) finishFanfare(vol());
    }
    if (live() && t < endAt) raf = requestAnimationFrame(step);
  };
  raf = requestAnimationFrame(step);

  return () => {
    stopped = true;
    cancelAnimationFrame(raf);
    stopCrowd?.();
    stopCrowd = null;
  };
}
