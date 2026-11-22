// THE PORTAL — the survey (docs/portal/archive/games.md, "1. The survey").
// The Yulenai outer survey mirrored its readings to the hall; the mirror is
// still there. A player points it at one of the cluster's six galaxies, sees
// its pulsars beat, and matches each beat to the galaxy's catalogue, which
// gives every period in octal NUMERAL GLYPHS. Nobody can read those at first:
// a match is worked out from which entries share a mark, which is frequency
// analysis wearing a different coat. Each galaxy matched in full reads one
// numeral for everyone.
//
// SERVER ONLY (it holds the answers). The catalogue is a list of periods, not
// prose — it is a mechanism like the Fleet roll, not archive text. It is built
// from a fixed seed: changing the generator changes the puzzle, so don't,
// once a server has charted.

import { NUMERAL_IDS } from "./glyph-ids";

export const GALAXIES = ["Theruun", "Oshkaa", "Paaruk", "Senwe", "Yulenai", "Maalith"] as const;
export type Galaxy = (typeof GALAXIES)[number];

/** When each galaxy's keystones dropped (tharvend.md): a ghost's "last seen",
 *  and the far end of the fold weather the survey records. */
export const DROP_T: Record<Galaxy, number> = { Theruun: 18.7, Oshkaa: 36.95, Paaruk: 48.41, Senwe: 53.91, Yulenai: 65.9, Maalith: 80.17 };
/** The deep array's long hold began at t14 (BIBLE movement 1). */
export const LONG_HOLD_T = 14;
/** The survey's window, in turns. */
export const WINDOW_T = 80.17;

/** Wrong charts a reader may submit in a day (UTC), across every galaxy. */
export const SURVEY_TRIES = 3;

/** The numeral each galaxy reads when it is charted. Yulenai is the easiest
 *  galaxy (the Hiccup is in it), so its mark is the first most players read. */
export const SURVEY_REWARD: Record<Galaxy, number> = {
  Yulenai: NUMERAL_IDS[1], Theruun: NUMERAL_IDS[2], Oshkaa: NUMERAL_IDS[3],
  Paaruk: NUMERAL_IDS[4], Senwe: NUMERAL_IDS[5], Maalith: NUMERAL_IDS[6],
};

/** Where each galaxy sits on the sky map (0..1), its size and tilt. */
export const SKY: Record<Galaxy, { x: number; y: number; r: number; tilt: number }> = {
  Theruun: { x: 0.18, y: 0.30, r: 0.085, tilt: 24 },
  Oshkaa: { x: 0.36, y: 0.62, r: 0.07, tilt: -38 },
  Paaruk: { x: 0.52, y: 0.26, r: 0.075, tilt: 62 },
  Senwe: { x: 0.64, y: 0.70, r: 0.065, tilt: 10 },
  Yulenai: { x: 0.80, y: 0.40, r: 0.06, tilt: -14 },
  Maalith: { x: 0.50, y: 0.48, r: 0.09, tilt: 40 },
};

export type SourceKind = "pulse" | "hiccup" | "stopped";
export type Mark = "stutter" | "pause" | null;
export interface Source { id: string; x: number; y: number; period: number; phase: number; kind: SourceKind }
export interface Entry { id: string; period: number; mark: Mark }
export interface Chart { sources: Source[]; entries: Entry[]; answer: Record<string, string> }

const SIZES: Record<Galaxy, number> = { Theruun: 5, Oshkaa: 5, Paaruk: 5, Senwe: 5, Yulenai: 3, Maalith: 6 };
const MIN_P = 3, MAX_P = 23;

function mulberry(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const markOf = (k: SourceKind): Mark => (k === "hiccup" ? "stutter" : k === "stopped" ? "pause" : null);

/** Every way to match a galaxy's sources to its entries that a reader who
 *  knows NO numeral could still believe: kinds agree with marks, and some
 *  one-to-one reading of the marks makes every entry say its source's period.
 *  A fair catalogue has exactly one. */
export function readings(sources: Pick<Source, "period" | "kind">[], entries: Pick<Entry, "period" | "mark">[]): number[][] {
  const out: number[][] = [];
  const strs = entries.map((e) => (e.mark === "pause" ? "" : e.period.toString(8)));
  const perm: number[] = [];
  const used = new Set<number>();
  const go = (i: number) => {
    if (i === sources.length) {
      // entries' TRUE digit strings stand in for glyph strings: same glyph = same true digit.
      const g2d = new Map<string, string>(), d2g = new Map<string, string>();
      for (let s = 0; s < sources.length; s++) {
        const e = perm[s], want = sources[s].kind === "stopped" ? "" : sources[s].period.toString(8), glyphs = strs[e];
        if (want.length !== glyphs.length) return;
        for (let k = 0; k < want.length; k++) {
          const g = glyphs[k], d = want[k];
          if ((g2d.has(g) && g2d.get(g) !== d) || (d2g.has(d) && d2g.get(d) !== g)) return;
          g2d.set(g, d); d2g.set(d, g);
        }
      }
      out.push([...perm]);
      return;
    }
    for (let e = 0; e < entries.length; e++) {
      if (used.has(e) || entries[e].mark !== markOf(sources[i].kind)) continue;
      used.add(e); perm.push(e); go(i + 1); perm.pop(); used.delete(e);
    }
  };
  go(0);
  return out;
}

function build(g: Galaxy, gi: number): Chart {
  const rand = mulberry(0x5e1a0 + gi * 7919);
  const n = SIZES[g];
  for (;;) {
    const kinds: SourceKind[] = Array(n).fill("pulse");
    if (g === "Yulenai") kinds[0] = "hiccup";
    if (g === "Maalith") kinds[0] = "stopped";
    const periods = new Set<number>(g === "Yulenai" ? [8] : []);
    while (periods.size < n - (g === "Maalith" ? 1 : 0)) periods.add(MIN_P + Math.floor(rand() * (MAX_P - MIN_P + 1)));
    const ps = [...periods];
    const srcs = kinds.map((kind, i) => ({ kind, period: kind === "stopped" ? 0 : ps[g === "Maalith" ? i - 1 : i] }));
    // Display order of the catalogue: shuffled, so position gives nothing away.
    const order = srcs.map((_, i) => i);
    for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
    const entries: Entry[] = order.map((si, k) => ({ id: `e${k}`, period: srcs[si].period, mark: markOf(srcs[si].kind) }));
    const sols = readings(srcs, entries);
    // Fair (one reading) and not trivial: outside the easy galaxy, at least two
    // entries must be the same length, so lengths alone don't settle it.
    const lens = entries.filter((e) => e.mark !== "pause").map((e) => e.period.toString(8).length);
    const shared = lens.length !== new Set(lens).size;
    if (sols.length !== 1 || (g !== "Yulenai" && !shared)) continue;
    // Positions inside the galaxy's view, kept apart.
    const pts: { x: number; y: number }[] = [];
    while (pts.length < n) {
      const p = { x: 0.12 + rand() * 0.76, y: 0.14 + rand() * 0.72 };
      if (pts.every((q) => Math.hypot(q.x - p.x, q.y - p.y) > 0.2)) pts.push(p);
    }
    const sources: Source[] = srcs.map((s, i) => ({ id: `s${i}`, x: +pts[i].x.toFixed(3), y: +pts[i].y.toFixed(3), period: s.period, phase: s.period ? Math.floor(rand() * s.period) : 0, kind: s.kind }));
    const answer: Record<string, string> = {};
    sols[0].forEach((e, s) => (answer[`s${s}`] = entries[e].id));
    return { sources, entries, answer };
  }
}

export const CHARTS: Record<Galaxy, Chart> = Object.fromEntries(GALAXIES.map((g, i) => [g, build(g, i)])) as Record<Galaxy, Chart>;

export const isGalaxy = (g: unknown): g is Galaxy => typeof g === "string" && (GALAXIES as readonly string[]).includes(g);

/** A submitted chart: every source matched to a distinct entry, all right. */
export function checkChart(g: Galaxy, pairs: unknown): "bad" | boolean {
  if (!pairs || typeof pairs !== "object" || Array.isArray(pairs)) return "bad";
  const c = CHARTS[g], p = pairs as Record<string, unknown>;
  const ids = new Set(c.entries.map((e) => e.id));
  const keys = Object.keys(p);
  if (keys.length !== c.sources.length || !c.sources.every((s) => typeof p[s.id] === "string" && ids.has(p[s.id] as string))) return "bad";
  if (new Set(keys.map((k) => p[k])).size !== keys.length) return "bad";
  return c.sources.every((s) => p[s.id] === c.answer[s.id]);
}

/** THE FOLD WEATHER the survey recorded: the relay's channels thinning, link
 *  by link down the chain. Each link runs from one galaxy's drop to the next.
 *  The galaxies themselves never change on the survey — their light takes far
 *  longer than the window to cross. */
export function foldWeather(): { knot: { galaxy: Galaxy; from: number; to: number }; links: { a: Galaxy; b: Galaxy; from: number; to: number }[] } {
  return {
    knot: { galaxy: "Theruun", from: LONG_HOLD_T, to: DROP_T.Theruun },
    links: GALAXIES.slice(0, -1).map((a, i) => ({ a, b: GALAXIES[i + 1], from: DROP_T[a], to: DROP_T[GALAXIES[i + 1]] })),
  };
}
