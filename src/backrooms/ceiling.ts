// A CEILING THAT STAYS PUT (Josh, Oct 2026: "Fix the height tool it just
// the ceiling when i only want to drop the floor").
//
// A cell's ceiling has always been its FLOOR plus its room's height, so a
// floor dropped with the Heights tool took its ceiling down with it — a
// sunken pit got a sunken roof. A cell can now HOLD its ceiling: the room
// design's `ceiling` layer (tiles.ts) records the floor height the ceiling
// hangs from, and the cell's own floor moves on its own. The map carries it
// per cell as `Sector.lid` (dressing — not in the fingerprint, like a look),
// the chunks stream it, and every place that works out a ceiling asks here.
//
// Imports nothing: the server, the editor and the game all read it.

/** "No held ceiling — it follows the floor", in an Int8 lid array. */
export const LID_NONE = -128;

/** However the ceiling is held, a raised floor never comes closer to it than
 *  this (metres) — a platform under a held ceiling pushes it up locally. */
export const LID_HEADROOM = 2.2;

/** The ceiling ELEVATION (metres) of a cell. `over(floorM)` is the level's
 *  usual rule (its floor plus its room's height); `lidM` is the held
 *  height in metres, or null when the cell follows its floor. */
export function ceilingWithLid(over: (floorM: number) => number, floorM: number, lidM: number | null): number {
  if (lidM === null) return over(floorM);
  return Math.max(over(lidM), floorM + LID_HEADROOM);
}

/** A lid byte as metres (null for LID_NONE / absent). */
export const lidMetres = (v: number | undefined, stepM: number): number | null =>
  v === undefined || v === LID_NONE ? null : v * stepM;
