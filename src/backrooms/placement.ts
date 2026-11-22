// THE PLACEMENT LAW (Josh, Oct 2026): "make sure that all new hard drives,
// relics are positioned correctly across the map and not underneath the map.
// i found a relic in the pipe dreams map that was under the floor … just keep
// this as a law for all maps. i dont want progression messed up because i
// incorrectly spawned hard drive, relic, or objective."
//
// Anything a player has to walk up to and pick up or use — a relic, a lore
// drive, a key, a fuse, a door, a breaker — goes ONLY on a cell this file
// says yes to. One rule, every level, every picker:
//
//   in bounds · not solid · not SCENERY (background: drawn, never entered) ·
//   not a lethal pit · not deep water (anything you'd have to dive for is
//   lost the moment you drop it) · not under furniture or a solid kit prop ·
//   not a stair (a ramp, not a floor) · REACHABLE on foot from the level's
//   door under the climb rule
//
// The last one is what the older per-picker checks all missed: a cell can be
// open floor and still be sealed off — a closet the generator never joined,
// a room the map editor's checker only WARNS about, a deck you can see but
// not climb to. An objective there is progression nobody can make.
//
// The map editor's relic and drive SPOTS go through this too: a spot placed
// somewhere it can't be used is skipped by the game and reported by the
// editor's checks (designs.ts), rather than spawning something nobody can
// reach.
//
// The CLIENT half of the same law is in BackroomsGame.svelte (`pinToGround`):
// whatever the server places, the game draws ON the floor under it, and keeps
// it there as the floor's chunk streams in.
import { distanceMap, isPitCell, type Sector } from "./worldgen";
import { propAt } from "./props";
import { kitBlocks, kitCovers, kitExtents } from "./kit";
import { STAIR_NONE } from "./stairs";

/** Water this many steps over the floor is swum, not waded (Level 1's rule). */
export const DEEP_WATER_STEPS = 3;

export type Unplaceable =
  | "outside"
  | "solid"
  | "scenery"
  | "pit"
  | "deep_water"
  | "furniture"
  | "prop"
  | "stair"
  | "unreachable";

/** Plain words for the editor's checks. */
export const UNPLACEABLE_SAYS: Record<Unplaceable, string> = {
  outside: "off the map",
  solid: "inside something solid",
  scenery: "on scenery nobody can walk onto",
  pit: "at the bottom of a lethal drop",
  deep_water: "in water too deep to stand in",
  furniture: "under furniture",
  prop: "under a solid prop",
  stair: "on a stair",
  unreachable: "where nobody can walk to from the level's door",
};

interface Analysis {
  /** Walk distance from the doors, -1 = unreachable. */
  reach: Int32Array;
  /** 1 = a blocking kit prop covers the cell's centre. */
  kitMask: Uint8Array;
  /** The kit list the mask was built from: a dressing-only publish swaps
   *  `sector.kit` on the SAME sector object, so the mask is rebuilt when the
   *  list changes (the floor and walls only change with a new sector). */
  kitRef: Sector["kit"];
}
const cache = new WeakMap<Sector, Analysis>();

function analyse(s: Sector): Analysis {
  let a = cache.get(s);
  if (!a) {
    a = { reach: distanceMap(s, s.doors.map((d) => ({ x: Math.floor(d.x), y: Math.floor(d.y) }))), kitMask: new Uint8Array(0), kitRef: undefined };
    a.kitRef = Symbol() as unknown as Sector["kit"]; // force the first build
    cache.set(s, a);
  }
  if (a.kitRef !== s.kit) {
    const mask = new Uint8Array(s.size * s.size);
    for (const pl of s.kit ?? []) {
      if (!kitBlocks(pl)) continue;
      const { rx, ry } = kitExtents(pl);
      for (let y = Math.max(0, Math.floor(pl.y - ry)); y <= Math.min(s.size - 1, Math.floor(pl.y + ry)); y++)
        for (let x = Math.max(0, Math.floor(pl.x - rx)); x <= Math.min(s.size - 1, Math.floor(pl.x + rx)); x++)
          if (kitCovers(pl, x + 0.5, y + 0.5)) mask[y * s.size + x] = 1;
    }
    a.kitMask = mask;
    a.kitRef = s.kit;
  }
  return a;
}

/** Why an objective can't go on this cell, or null if it can. */
export function whyUnplaceable(s: Sector, x: number, y: number): Unplaceable | null {
  if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0 || x >= s.size || y >= s.size) return "outside";
  const i = y * s.size + x;
  if (s.solid[i]) return "solid";
  if (s.background[i]) return "scenery";
  if (isPitCell(s, x, y)) return "pit";
  if (s.water && s.water[i] !== -128 && s.water[i] - s.floor[i] >= DEEP_WATER_STEPS) return "deep_water";
  if (s.stair && s.stair[i] !== STAIR_NONE) return "stair";
  if (propAt(s, x, y)) return "furniture";
  const a = analyse(s);
  if (a.kitMask[i]) return "prop";
  if (a.reach[i] < 0) return "unreachable";
  return null;
}

/** May an objective go on this cell? */
export const placeable = (s: Sector, x: number, y: number): boolean => whyUnplaceable(s, x, y) === null;

/** Walk distance from the level's door(s), -1 = unreachable (cached). */
export const reachFromDoors = (s: Sector): Int32Array => analyse(s).reach;

/** THE CREATURE HALF OF THE LAW: where a monster may START. Looser than an
 *  objective's cell — a creature may stand on a stair, by furniture or in a
 *  prop's shadow — but never inside a wall, on scenery, at the bottom of a
 *  shaft, or anywhere it could never walk out of to reach a player. An
 *  alligator is the one creature that must start IN deep water. */
export function whyNoCreature(s: Sector, x: number, y: number, kind: "walker" | "gator" = "walker"): Unplaceable | "dry" | null {
  if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0 || x >= s.size || y >= s.size) return "outside";
  const i = y * s.size + x;
  if (s.solid[i]) return "solid";
  if (s.background[i]) return "scenery";
  if (isPitCell(s, x, y)) return "pit";
  if (kind === "gator" && !(s.water && s.water[i] !== -128 && s.water[i] - s.floor[i] >= DEEP_WATER_STEPS)) return "dry";
  if (analyse(s).reach[i] < 0) return "unreachable";
  return null;
}

/** The editor's checks for the game layer: every relic and drive spot must be
 *  a cell an objective may use, and every spawner a cell its creature may
 *  start on. A spot that fails is skipped by the game — reported here so the
 *  designer finds out at the publish screen, not from a player. */
export function markProblems(s: Sector): string[] {
  const out: string[] = [];
  for (const m of s.marks ?? []) {
    const x = Math.floor(m.x), y = Math.floor(m.y);
    const at = `at (${x}, ${y})`;
    if (m.k === "relic" || m.k === "drive") {
      const why = whyUnplaceable(s, x, y);
      if (why) out.push(`a ${m.k === "relic" ? "relic" : "drive"} spot ${at} is ${UNPLACEABLE_SAYS[why]}`);
    } else if (m.k === "entity" || m.k === "gator") {
      const why = whyNoCreature(s, x, y, m.k === "gator" ? "gator" : "walker");
      if (why) out.push(`${m.k === "gator" ? "an alligator" : "an Entity"} spawner ${at} is ${why === "dry" ? "on dry floor (an alligator starts in deep water)" : UNPLACEABLE_SAYS[why]}`);
    }
  }
  return out;
}

/** A RELIC'S CELL, picked at random: a free map-editor relic spot first, then
 *  any placeable cell at least `minFromDoor` cells (straight line) from every
 *  door. `taken` keeps two relics off the same spot. `rnd(n)` returns an
 *  integer in [0, n) — the service passes crypto's randomInt, since which
 *  relic lies where is worth money. null = nowhere found this time (the
 *  spawner simply tries again on its next tick). */
export function pickRelicCell(
  s: Sector,
  taken: { x: number; y: number }[],
  minFromDoor: number,
  rnd: (n: number) => number,
): [number, number] | null {
  const spots = (s.marks ?? []).filter(
    (m) => m.k === "relic" && placeable(s, Math.floor(m.x), Math.floor(m.y)) && !taken.some((t) => Math.hypot(t.x - m.x, t.y - m.y) < 1.5),
  );
  if (spots.length) {
    const m = spots[rnd(spots.length)];
    return [Math.floor(m.x), Math.floor(m.y)];
  }
  for (let tries = 0; tries < 400; tries++) {
    const x = 4 + rnd(s.size - 8);
    const y = 4 + rnd(s.size - 8);
    if (!placeable(s, x, y)) continue;
    if (taken.some((t) => Math.hypot(t.x - x - 0.5, t.y - y - 0.5) < 1.5)) continue;
    let doorDist = Infinity;
    for (const d of s.doors) doorDist = Math.min(doorDist, Math.hypot(d.x - x, d.y - y));
    if (doorDist < minFromDoor) continue;
    return [x, y];
  }
  return null;
}
