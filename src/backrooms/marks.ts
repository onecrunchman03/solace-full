// THE GAME LAYER — things placed in a room design that change how a level
// PLAYS rather than how it looks (Josh, Sep 2026: "creature spawners with
// their own settings" and "place relics and lore drives by hand").
//
// A mark sits at (x, y) in CELLS inside its room, continuous like a prop
// (3.5 = the middle of cell 3), and turns and mirrors with the room. The
// generator copies every mark into the map it builds (`Sector.marks`), where
// the service reads them. Imports nothing, so the editor shares it verbatim.
//
//   entity   a spawner for THE ENTITY — any level (Pipe Dreams has none
//            until you place one). It wanders round its spawner.
//   gator    a spawner for an ALLIGATOR — the Poolrooms, standing in deep
//            water. It never leaves the body of water it's put in.
//   relic    a spot a relic may turn up (the level's relics use these
//            first, then places of their own choosing).
//   drive    a spot a lore drive lies (Level 0): drives fill these first.
//
// Settings are all optional; a missing one is the creature's usual.

export type MarkKind = "entity" | "gator" | "relic" | "drive";

export interface MarkPlace {
  k: MarkKind;
  x: number;
  y: number;
  /** How many it spawns (creatures), 1–3. Default 1. */
  n?: number;
  /** Speed, percent of the creature's usual (50–200). Default 100. */
  speed?: number;
  /** How far it sees, in cells. Default: the creature's usual. */
  sight?: number;
  /** How far from its spawner it wanders, in cells. Default 16. */
  roam?: number;
  /** An alligator's bite, hit points (10–100). Default 34. */
  bite?: number;
  /** The share of the room's copies it appears in, percent. Default 100. */
  chance?: number;
}

export interface MarkDef {
  k: MarkKind;
  name: string;
  /** What it does, one line, for the editor. */
  help: string;
  /** The levels it can be placed on. */
  levels: readonly number[];
  creature: boolean;
  color: string;
  glyph: string;
}

export const MARKS: readonly MarkDef[] = [
  { k: "entity", name: "The Entity", help: "A spawner: the Entity wanders near here and hunts whoever it sees or hears.", levels: [0, 1, 2], creature: true, color: "#ff4d4d", glyph: "E" },
  { k: "gator", name: "Alligator", help: "A spawner: put it in deep water. It stays in that water and bites whoever swims in.", levels: [1], creature: true, color: "#46c46a", glyph: "A" },
  { k: "relic", name: "Relic spot", help: "A relic may turn up here. Relics use these spots first, then find places of their own.", levels: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9], creature: false, color: "#ffd24a", glyph: "R" },
  { k: "drive", name: "Lore drive spot", help: "A lore drive lies here. Drives use these spots first; any left over find places of their own.", levels: [0], creature: false, color: "#5cc8ff", glyph: "D" },
];
export const MARK: ReadonlyMap<MarkKind, MarkDef> = new Map(MARKS.map((m) => [m.k, m]));

/** The usual settings of each creature — the service's own numbers, so the
 *  editor can show what "default" means. */
export const CREATURE_USUAL = {
  entity: { sight: 14, roam: 16 },
  gator: { sight: 26, bite: 34 },
} as const;

/** The most creatures spawners may put on one level (they cost the server a
 *  little every tick each, and more than this is a massacre, not a level). */
export const MAX_SPAWNED = 24;

const clampInt = (v: unknown, lo: number, hi: number): number | undefined => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : undefined;
};

/** Everything wrong with one mark, as plain sentences. */
export function markProblems(m: MarkPlace, level: number): string[] {
  const d = MARK.get(m.k);
  if (!d) return [`there is no game marker called "${m.k}"`];
  const out: string[] = [];
  if (!d.levels.includes(level)) out.push(`${d.name} can't go on this level`);
  if (!Number.isFinite(m.x) || !Number.isFinite(m.y)) out.push(`${d.name}: its position is not a number`);
  const range = (v: number | undefined, lo: number, hi: number, what: string): void => {
    if (v !== undefined && (!Number.isFinite(v) || v < lo || v > hi)) out.push(`${d.name}: ${what} must be ${lo}–${hi}`);
  };
  range(m.n, 1, 3, "how many");
  range(m.speed, 50, 200, "speed");
  range(m.sight, 2, 40, "sight");
  range(m.roam, 2, 60, "roam");
  range(m.bite, 10, 100, "bite");
  range(m.chance, 1, 100, "chance");
  return out;
}

/** A mark with its settings clamped and defaults dropped (what a library
 *  stores). */
export function cleanMark(m: MarkPlace): MarkPlace {
  const o: MarkPlace = { k: m.k, x: Math.round(m.x * 100) / 100, y: Math.round(m.y * 100) / 100 };
  const n = clampInt(m.n, 1, 3);
  if (n && n !== 1) o.n = n;
  const sp = clampInt(m.speed, 50, 200);
  if (sp && sp !== 100) o.speed = sp;
  const si = clampInt(m.sight, 2, 40);
  if (si) o.sight = si;
  const ro = clampInt(m.roam, 2, 60);
  if (ro) o.roam = ro;
  const bi = clampInt(m.bite, 10, 100);
  if (bi) o.bite = bi;
  const ch = clampInt(m.chance, 1, 100);
  if (ch && ch !== 100) o.chance = ch;
  return o;
}

/** A small deterministic hash → [0, 1): the "does this copy get it" roll, the
 *  same on every boot for the same map (props' chance uses it too). */
export function copyRoll(seed: number, inst: number, k: number, salt = 0): number {
  let h = (seed ^ Math.imul(inst + 1, 0x9e3779b1) ^ Math.imul(k + 1, 0x85ebca77) ^ Math.imul(salt + 7, 0xc2b2ae3d)) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x7feb352d) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 0x846ca68b) >>> 0;
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
