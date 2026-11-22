// THE PORTAL — Senneth's bench, the fold school's teaching bench mirrored to
// kaal-ith (docs/portal/archive/games.md, "3. Senneth's bench").
// IMPORT-FREE: the browser runs it live while a reader holds the fold, and
// the server runs it again over the same seed and the reader's bleeds to see
// whether the fold really held. Same function both sides, so the two agree.
//
// A held fold has eight couplings round it. Each carries a load that creeps
// up, faster the deeper the fold; a reader bleeds a coupling to bring it
// down. Over design (1.0) the coupling fails; bled too far (under 0.1) it
// goes slack. Either way the fold drops. Hold it for the exercise's time and
// the bench prints its result — and says nothing about what it means.

export const COUPLINGS = 8;
export const STEP_MS = 100;
export const BLEED = 0.22;
export const OVER = 1.0, SLACK = 0.1;

/** The exercises, in order (kaal-ith: the paper at 14, 15 with its transient,
 *  16 that closes itself, the long hold, and the unaimed fold). Depths are as
 *  the archive prints them, in their numerals. */
export const BENCH = {
  "14": { depth: "14", steps: 150, creep: 0.004, transient: false },
  "15": { depth: "15", steps: 300, creep: 0.0046, transient: true },
  "16": { depth: "16", steps: 450, creep: 0.0052, transient: false },
  long: { depth: "16", steps: 1800, creep: 0.0038, transient: false },
  unaimed: { depth: "", steps: 300, creep: 0.0058, transient: false },
} as const;
export type BenchId = keyof typeof BENCH;
export const BENCH_IDS = Object.keys(BENCH) as BenchId[];
/** In the long hold, the far-end term leaves zero here — in the last place, within tolerance. */
export const DRIFT_STEP = 1500;

function hash(seed: number, a: number, b: number): number {
  let h = (seed ^ Math.imul(a + 1, 0x9e3779b1) ^ Math.imul(b + 7, 0x85ebca6b)) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x7feb352d);
  h = Math.imul(h ^ (h >>> 15), 0x846ca68b);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
/** Smooth value noise in [0, 1) for coupling i at a step. */
function noise(seed: number, i: number, step: number): number {
  const P = 25, k = Math.floor(step / P), f = (step % P) / P;
  const a = hash(seed, i, k), b = hash(seed, i, k + 1), s = f * f * (3 - 2 * f);
  return a + (b - a) * s;
}

export class BenchState {
  loads: number[];
  step = 0;
  failed: number | null = null;
  private transientAt: number;
  constructor(readonly id: BenchId, readonly seed: number) {
    this.loads = [...Array(COUPLINGS).keys()].map((i) => 0.42 + 0.12 * hash(seed, i, -9));
    this.transientAt = 80 + Math.floor(hash(seed, 99, 99) * 120);
  }
  /** Advance one step, after the reader's bleeds for it. */
  tick(bleeds: number[] = []): void {
    if (this.failed !== null) return;
    for (const c of bleeds) if (c >= 0 && c < COUPLINGS) this.loads[c] -= BLEED;
    const spec = BENCH[this.id];
    for (let i = 0; i < COUPLINGS; i++) {
      this.loads[i] += spec.creep * (0.3 + 1.4 * noise(this.seed, i, this.step));
      // The transient at 15: the third ring's coupling (a cracked seat) jumps.
      if (spec.transient && i === 2 && this.step >= this.transientAt && this.step < this.transientAt + 5) this.loads[i] += 0.07;
      if (this.loads[i] > OVER || this.loads[i] < SLACK) { this.failed = this.step; break; }
    }
    this.step++;
  }
  get transientStep(): number | null { return BENCH[this.id].transient ? this.transientAt : null; }
}

/** Replay a run: did the fold hold for `steps`? Bleeds are [step, coupling]. */
export function simulate(id: BenchId, seed: number, bleeds: [number, number][], steps: number): { held: boolean; failStep: number | null } {
  const s = new BenchState(id, seed);
  const by = new Map<number, number[]>();
  let last = -1;
  for (const [step, c] of bleeds) {
    if (step < last || step < 0 || step >= steps) return { held: false, failStep: step };
    last = step;
    (by.get(step) ?? by.set(step, []).get(step)!).push(c);
  }
  for (let k = 0; k < steps && s.failed === null; k++) s.tick(by.get(k));
  return { held: s.failed === null, failStep: s.failed };
}
