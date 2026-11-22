// THE RACE CALLER — a track announcer on every screen that shows the Derby.
//
// Josh, Oct 2026 ("Derby race caller"). A race runs eleven seconds and its
// result is drawn at the gun, so there is no time to have a model write a
// call and a voice read it while it happens. The fixed cast makes that
// unnecessary: every line he can say is in CALL_LINES, voiced ONCE in the
// announcer voice Josh picked (scripts/rollo/render-call.mjs), and this file
// decides which ones play and when — a pure function of the race, so the 2D
// paddock and the casino jumbotron call the same race at the same instant and
// the call can never disagree with the result (the "one appearance, every
// observer" rule, applied to a voice).
//
// No runtime imports on purpose: derby-run.ts hands in the race model and the
// seeded roll, and a plain Node harness (test_derby_call.mjs) loads this file.

import type { RaceModel } from "./derby-race";

/** The caller speaks. Josh heard the voiced lines and approved them (Oct 12,
 *  2026); turn this off to silence him without touching the plan. */
export const CALLER_ON = true;
/** How loud the announcer sits over the crowd (times the screen's volume). */
export const CALL_GAIN = 0.9;
/** How far after the line the winner may be called, to let the slide call finish. */
export const WIN_LATE_MS = 600;
/** The breath between one line ending and the next starting. */
export const GAP_MS = 200;
/** How long after the winner crosses the caller may still be talking. */
export const CALL_TAIL_MS = 10_000;

// <durations> written by scripts/rollo/render-call.mjs from the voiced files — do not edit by hand
export const CALL_MS: Record<string, number> = {
  "derby/call-boulder-flop": 3750,
  "derby/call-boulder-go": 1918,
  "derby/call-early-blob": 2046,
  "derby/call-early-boulder": 2196,
  "derby/call-early-frog": 2532,
  "derby/call-early-nascar": 2042,
  "derby/call-early-rocket": 1979,
  "derby/call-early-snail": 1652,
  "derby/call-lead-blob": 1490,
  "derby/call-lead-boulder": 1925,
  "derby/call-lead-frog": 2355,
  "derby/call-lead-nascar": 2213,
  "derby/call-lead-rocket": 1997,
  "derby/call-lead-snail": 2054,
  "derby/call-off-1": 1067,
  "derby/call-off-2": 1320,
  "derby/call-second-blob": 1523,
  "derby/call-second-boulder": 1987,
  "derby/call-second-frog": 1987,
  "derby/call-second-nascar": 1775,
  "derby/call-second-rocket": 1872,
  "derby/call-second-snail": 1717,
  "derby/call-stretch-1": 1640,
  "derby/call-stretch-2": 1911,
  "derby/call-win-blob": 1328,
  "derby/call-win-boulder": 1567,
  "derby/call-win-boulder-late": 2441,
  "derby/call-win-frog": 1949,
  "derby/call-win-nascar": 1416,
  "derby/call-win-rocket": 1608,
  "derby/call-win-snail": 1634,
  "derby/call-wire-blob": 2088,
  "derby/call-wire-boulder": 2557,
  "derby/call-wire-frog": 2639,
  "derby/call-wire-nascar": 2405,
  "derby/call-wire-rocket": 2315,
  "derby/call-wire-snail": 2374
};
// </durations>

/** How long a line runs (a line not yet voiced is taken at 2.5s). */
export function msOf(clip: string): number {
  return CALL_MS[clip] ?? 2500;
}

const NAMES: Record<string, string> = {
  rocket: "Major Tom",
  snail: "Escargo",
  frog: "Ribbit Nine-Thousand",
  nascar: "The Sponsor",
  blob: "Gerald",
  boulder: "Old Reliable",
};

/** Every line he can say, by clip id (the file is /sfx/<id>.ogg). */
export const CALL_LINES: Record<string, string> = (() => {
  const l: Record<string, string> = {
    "derby/call-off-1": "And they're off!",
    "derby/call-off-2": "They're off and running!",
    "derby/call-stretch-1": "Down the stretch they come!",
    "derby/call-stretch-2": "Here comes the home stretch!",
    "derby/call-boulder-go": "Here comes Old Reliable!",
    "derby/call-win-boulder-late": "From nowhere! Old Reliable wins it!",
    "derby/call-boulder-flop": "And Old Reliable has... fallen over. Somebody help him up.",
  };
  for (const [k, n] of Object.entries(NAMES)) {
    l[`derby/call-early-${k}`] = `${n} jumps out in front!`;
    l[`derby/call-lead-${k}`] = `${n} takes the lead!`;
    l[`derby/call-win-${k}`] = `${n} wins it!`;
    l[`derby/call-wire-${k}`] = `And it's ${n} at the wire!`;
    l[`derby/call-second-${k}`] = `${n} takes second.`;
  }
  return l;
})();

export function callClips(): string[] {
  return Object.keys(CALL_LINES);
}

export interface Cue {
  /** Race-ms (after the countdown) the line starts. */
  at: number;
  clip: string;
}

const STEP_MS = 50;

/** The whole call for one race. `model` must be fresh (it is stepped through
 *  the race here); `rnd` is the seeded roll that picks between phrasings, so
 *  every screen picks the same one. */
export function planCall(model: RaceModel, keys: string[], placings: string[], rnd: () => number): Cue[] {
  const cues: Cue[] = [];
  const winnerFin = model.winnerFin;
  // Free if this line would neither start inside another nor run into the next.
  const clear = (at: number, clip: string): boolean =>
    cues.every((c) => at >= c.at + msOf(c.clip) + GAP_MS || at + msOf(clip) + GAP_MS <= c.at);
  const add = (at: number, clip: string): void => {
    if (clip in CALL_LINES && clear(at, clip)) cues.push({ at, clip });
  };
  const pick = (a: string, b: string): string => (rnd() < 0.5 ? a : b);
  // Chosen up front so the roll is spent the same way whatever the race does.
  const off = pick("derby/call-off-1", "derby/call-off-2");
  const stretch = pick("derby/call-stretch-1", "derby/call-stretch-2");
  const winLine = pick("win", "wire");

  // The race, recorded once, so the lines can be placed in order of how much
  // they matter rather than in the order things happen.
  const frames: { tr: number; progress: number[]; boulderGo: number | null }[] = [];
  for (let tr = 0; tr <= winnerFin + 2500; tr += STEP_MS) {
    const f = model.at(tr);
    frames.push({ tr, progress: f.progress, boulderGo: f.boulderGo });
  }
  const bIdx = keys.indexOf("boulder");
  const goAt = model.boulderFlop ? null : (frames.find((f) => f.boulderGo !== null)?.boulderGo ?? null);
  // The winner may be called a beat after the line (WIN_LATE_MS) — an announcer
  // mid-sentence about the boulder finishes the sentence first.
  const slideEnds = goAt === null ? Infinity : goAt + msOf("derby/call-boulder-go") + GAP_MS;
  const slideFits = slideEnds <= winnerFin + WIN_LATE_MS;
  const winAt = slideFits ? Math.max(winnerFin, slideEnds) : winnerFin;

  // 1. What MUST be said: they're off, the winner, second.
  const win =
    placings[0] === "boulder" && !slideFits ? "derby/call-win-boulder-late" : `derby/call-${winLine}-${placings[0]}`;
  cues.push({ at: 0, clip: off });
  cues.push({ at: winAt, clip: win });
  let after = winAt + msOf(win) + GAP_MS;
  if (placings[1]) {
    const second = `derby/call-second-${placings[1]}`;
    cues.push({ at: after, clip: second });
    after += msOf(second) + GAP_MS;
  }
  // The pratfall lands a second before the winner crosses, which is the one
  // moment that must belong to the winner — so it's the send-off instead.
  if (model.boulderFlop) cues.push({ at: after, clip: "derby/call-boulder-flop" });
  // 2. Old Reliable's slide — the best moment of any race it's in.
  if (goAt !== null && bIdx >= 0 && slideFits) add(goAt, "derby/call-boulder-go");
  // 3. Who broke from the gate, then up to two new leaders who held it.
  let leader = -1;
  let leaderSince = 0;
  let calledLeader = -1;
  let changes = 0;
  for (const f of frames) {
    let best = 0;
    for (let i = 1; i < f.progress.length; i++) if (f.progress[i] > f.progress[best]) best = i;
    if (best !== leader) {
      leader = best;
      leaderSince = f.tr;
    }
    if (f.tr === 1700 && f.progress[leader] > 0) {
      add(f.tr, `derby/call-early-${keys[leader]}`);
      calledLeader = leader;
    }
    const clip = `derby/call-lead-${keys[leader]}`;
    if (f.tr > 2400 && f.tr - leaderSince >= 400 && leader !== calledLeader && leader !== bIdx && changes < 2 && clear(f.tr, clip)) {
      add(f.tr, clip);
      calledLeader = leader;
      changes++;
    }
  }
  // 4. Nothing said coming home? Somebody has to call the stretch.
  const home = winnerFin - 3800;
  if (home > 0 && !cues.some((c) => c.at > winnerFin - 4500 && c.at < winnerFin)) add(home, stretch);
  return cues.sort((a, b) => a.at - b.at);
}
