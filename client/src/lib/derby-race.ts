// THE SEEDED RACE — one source, two screens.
//
// The server broadcasts a seed and the full finish order; every client then
// runs the SAME race locally. That only stays true if there is exactly one
// copy of the maths, which is why it lives here rather than inside Derby.svelte:
// the 2D paddock and the casino's jumbotron both import it, so a player in the
// hub and a player standing at the bar are watching the same horses in the
// same positions at the same instant (Josh, Aug 2026: "cast the same racing
// screen you see in the 2d version… no need to reinvent the wheel").
//
// Everything here is a pure function of (seed, keys, placings, raceMs).

export function mulberry32(a: number): () => number {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Signature pacing shapes (segment speed multipliers, later normalized).
 *  rocket: violent burns and dead coasts · snail: metronome · frog: raw
 *  segments (progress quantized into hops by the caller) · nascar: smooth ·
 *  blob: lazy wobble · boulder: parked until a late detonation. */
export function shapeFor(key: string, rnd: () => number): number[] {
  switch (key) {
    case "rocket":
      return Array.from({ length: 8 }, (_, i) => (i % 2 === 0 ? 2.2 + rnd() * 1.6 : 0.1 + rnd() * 0.25));
    case "snail":
      return Array.from({ length: 8 }, () => 0.95 + rnd() * 0.1);
    case "frog":
      return Array.from({ length: 8 }, () => 0.7 + rnd() * 0.6);
    case "nascar":
      return Array.from({ length: 8 }, () => 0.9 + rnd() * 0.25);
    case "blob":
      return Array.from({ length: 8 }, () => 0.5 + rnd() * 1.1);
    case "boulder":
      // Unused — the boulder ignores curves entirely: it sits at the gate
      // until the leader is ~85% home, then slides (special-cased by callers).
      return [1, 1, 1, 1, 1, 1, 1, 1];
    default:
      return Array.from({ length: 8 }, () => 0.4 + rnd() * 1.2);
  }
}

/** Precompute a dense, SMOOTH cumulative-progress table from a racer's
 *  segment multipliers. Two smoothness fixes (July 2026, "the race jitters
 *  near the end"): velocities BLEND across segment boundaries with a
 *  smoothstep instead of jumping stepwise, and every racer decelerates into
 *  the line across the last 12% instead of freezing at full speed. */
export function smoothTable(segs: number[]): number[] {
  const N = 96;
  const n = segs.length;
  const vel = (u: number): number => {
    const x = u * n - 0.5; // segment-space, centered on each segment
    const i = Math.floor(x);
    const f = x - i;
    const a = segs[Math.max(0, Math.min(n - 1, i))];
    const b = segs[Math.max(0, Math.min(n - 1, i + 1))];
    let v = a + (b - a) * (f * f * (3 - 2 * f)); // smoothstep blend
    if (u > 0.88) {
      // Glide into the line: taper to ~35% speed over the final stretch.
      const g = (u - 0.88) / 0.12;
      v *= 1 - 0.65 * (g * g * (3 - 2 * g));
    }
    return Math.max(0.02, v); // never fully stalls — stays monotone
  };
  const table = [0];
  let acc = 0;
  for (let i = 1; i <= N; i++) {
    acc += vel((i - 0.5) / N) / N;
    table.push(acc);
  }
  return table.map((d) => d / acc); // normalize: table ends exactly at 1
}

export interface SeededRace {
  curves: number[][];
  /** key → the millisecond (into the race) it crosses the line. */
  finish: Map<string, number>;
  /** The last-place gag fired this time. */
  boulderFlop: boolean;
}

export function buildRace(
  seed: number,
  racerKeys: string[],
  placings: string[],
  raceMs: number,
): SeededRace {
  const rnd = mulberry32(seed);
  const curves = racerKeys.map((k) => smoothTable(shapeFor(k, rnd)));
  // The SERVER draws the whole finish order (the podium pays out), so the
  // animation lands exactly on the broadcast placings.
  const finish = new Map<string, number>();
  placings.forEach((k, i) =>
    finish.set(k, i === 0 ? raceMs * 0.88 : raceMs * (0.94 + (i - 1) * 0.035 + rnd() * 0.02)),
  );
  // The last-place gag: half the time the boulder scoots forward and just
  // falls over. Seeded — every client sees the same pratfall.
  const bFin = finish.get("boulder") ?? 0;
  const boulderFlop = bFin === Math.max(...finish.values()) && rnd() < 0.5;
  return { curves, finish, boulderFlop };
}

/** Progress at race-fraction u — linear interpolation into the racer's
 *  precomputed smooth table (dense enough that frames never see a kink). */
export function distanceAt(table: number[], u: number): number {
  if (u <= 0) return 0;
  if (u >= 1) return 1;
  const x = u * (table.length - 1);
  const i = Math.floor(x);
  return table[i] + (table[i + 1] - table[i]) * (x - i);
}

/** Ribbit-9000 crosses in exactly this many jumps. */
export const HOPS = 13;

export interface RaceFrameState {
  /** 0..1 per racer, in `keys` order. */
  progress: number[];
  /** Old Reliable has keeled over. */
  boulderDown: boolean;
  /** Race-ms the boulder set off (or null while it waits at the gate). */
  boulderGo: number | null;
}

export interface RaceModel {
  /** Where everybody is `tr` ms into the running (after the countdown). Pure:
   *  any `tr`, in any order, gives the same answer on every screen. */
  at(tr: number): RaceFrameState;
  /** Race-ms the winner's lane crosses the line. */
  winnerFin: number;
  finish: Map<string, number>;
  boulderFlop: boolean;
  /** Race-ms the last runner is done (crossed the line, or lying down). */
  lastFinish: number;
}

/** The whole running of a race — the curves, the frog's hops and the
 *  boulder's late slide (or pratfall) — as ONE model every screen and the race
 *  caller share. It used to live inside derby-run.ts's frame loop; the caller
 *  (derby-call.ts) needs the same positions, and a second copy of the boulder
 *  rule would be the "two hand-copied clocks" bug again. */
export function raceModel(seed: number, keys: string[], placings: string[], raceMs: number): RaceModel {
  const { curves, finish, boulderFlop } = buildRace(seed, keys, placings, raceMs);
  const winnerFin = finish.get(placings[0]) ?? raceMs * 0.88;
  const bIdx = keys.indexOf("boulder");
  const bFin = finish.get("boulder") ?? raceMs;
  const others = (tr: number, out: number[]): number[] => {
    keys.forEach((k, i) => {
      if (k === "boulder") return void (out[i] = 0); // filled in by the caller
      const p = distanceAt(curves[i], Math.min(1, tr / (finish.get(k) ?? raceMs)));
      // The frog travels in discrete hops; everyone else flows.
      // (Rounded DOWN: rounding to the nearest hop landed the last one on the
      // line up to a hop early — ahead of runners the result put in front of
      // it, in about one race in four. Down, the last hop lands at its finish.)
      out[i] = k === "frog" ? Math.min(1, Math.floor(p * HOPS + 1e-9) / HOPS) : p;
    });
    return out;
  };
  // The boulder sits at the gate until the leader is ~85% home, then SLIDES —
  // how fast depends on where the draw says it must finish. (The bFin-900
  // clause guarantees a winning boulder still crosses first even if the field
  // is slow to 85%.) Decided HERE, on a fixed 50ms step, not on whichever
  // frame a screen happens to draw: a tab that came back from the background
  // late used to start the slide late, and a winning boulder then crossed
  // AFTER a runner it beat (Derby v2 review). Now at(tr) is a pure function.
  let boulderGo: number | null = null;
  if (bIdx >= 0) {
    const buf: number[] = [];
    for (let tr = 50; tr <= raceMs * 1.2; tr += 50) {
      const maxOther = Math.max(...others(tr, buf).filter((_, i) => i !== bIdx), 0);
      if (maxOther >= 0.85 || tr >= bFin - 900) {
        boulderGo = tr;
        break;
      }
    }
  }
  const lastFinish = Math.max(...finish.values(), boulderGo !== null && boulderFlop ? boulderGo + 700 : 0);
  return {
    winnerFin,
    finish,
    boulderFlop,
    lastFinish,
    at(tr) {
      const progress = others(tr, new Array(keys.length));
      let boulderDown = false;
      const went = boulderGo !== null && tr >= boulderGo ? boulderGo : null;
      if (bIdx >= 0 && went !== null) {
        if (boulderFlop) {
          // Scoot a few lengths, then keel over. A legend, humbled.
          const u = Math.min(1, (tr - went) / 700);
          progress[bIdx] = 0.16 * (1 - (1 - u) * (1 - u));
          boulderDown = u >= 1;
        } else {
          // Detonate then glide: ease-out so the slide launches hard and
          // settles into the line instead of freezing mid-stride.
          const dur = Math.max(500, bFin - went);
          const u = Math.min(1, (tr - went) / dur);
          progress[bIdx] = 1 - (1 - u) * (1 - u);
        }
      }
      return { progress, boulderDown, boulderGo: went };
    },
  };
}
