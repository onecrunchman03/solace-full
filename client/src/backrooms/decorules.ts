// Deco placement rules — pure, dependency-free, and unit-tested.
//
// The Poolrooms' dressing (arches, benches, portholes) is chosen by the
// generator from district geometry, and the generator does NOT check that the
// architecture it's decorating actually exists. Measured on the frozen sector
// P3: all 166 benches were mounted on open air, and 545 arches stood in the
// middle of dry floor with both piers unsupported. That is what Josh saw as
// panels you walk through and arches that block paths.
//
// The deco layer is purely visual, so these are RENDER-TIME rules rather than
// worldgen changes: no fingerprint churn, no map reset. They live here, away
// from three.js, so a harness can check them against the real sector — the
// same reasoning that put the floor winding in geom.ts.

/** The slice of the world these rules need. Both the renderer's WorldIndex
 *  and a plain sector array satisfy it. */
export interface DecoWorld {
  solidAt(x: number, y: number): boolean;
  /** Water SURFACE height at a cell, or null if dry. */
  waterAt(x: number, y: number): number | null;
  /** Packed deco byte (kind*16+variant), 0 for none. */
  decoAt(x: number, y: number): number;
}

export const DECO_ARCH = 2;

/** DOES THIS ARCH BELONG HERE?
 *
 *  An arch is 4.7m across, so its two piers land in the CELLS EITHER SIDE of
 *  the one it is placed on — a cell is only 2m. In a doorway those piers bury
 *  themselves in the jambs, which is the whole intent, and the opening stays
 *  clear. Stand the same arch on open floor and you get two free-standing
 *  piers supporting nothing: obstacles that belong to no architecture, which
 *  is what reads as an arch "blocking" a path.
 *
 *  Three keeps, and nothing else:
 *   · a pier BURIED in solid — a real doorway
 *   · over WATER — a channel arch, a landmark rather than an obstacle
 *   · a COLONNADE — another same-facing arch within 3 cells, so the piers
 *     read as a repeating order instead of debris
 */
export function archBelongs(w: DecoWorld, gx: number, gy: number, spanX: boolean): boolean {
  for (const s of [-1, 1]) {
    if (w.solidAt(spanX ? gx + s : gx, spanX ? gy : gy + s)) return true;
  }
  if (w.waterAt(gx, gy) !== null) return true;
  for (let d = 1; d <= 3; d++) {
    for (const sgn of [-1, 1]) {
      const ax = spanX ? gx : gx + sgn * d;
      const ay = spanX ? gy + sgn * d : gy;
      const code = w.decoAt(ax, ay);
      if (code >> 4 === DECO_ARCH && ((code & 15) !== 1) === spanX) return true;
    }
  }
  return false;
}

/** Is there real backing on side v (0 N, 1 E, 2 S, 3 W) of this cell? Used by
 *  anything that hangs FLAT on a wall — without this it hangs on nothing and,
 *  being an open shell, is invisible from the far side too. */
export function backedOn(w: DecoWorld, gx: number, gy: number, v: number): boolean {
  const [dx, dy] = v === 0 ? [0, -1] : v === 1 ? [1, 0] : v === 2 ? [0, 1] : [-1, 0];
  return w.solidAt(gx + dx, gy + dy);
}

const DIRS: [number, number, number][] = [[0, -1, 0], [1, 0, 1], [0, 1, 2], [-1, 0, 3]];

/** Where should a wall-mounted bench actually hang?
 *
 *  The generator marks bench cells from hall geometry, and on P3 every single
 *  one is a cell or more short of the real wall. Rather than drop them all,
 *  look for the nearest genuine backing — preferring the side the generator
 *  was aiming at — and hang it there. A bench with no wall within `reach`
 *  isn't a bench, and returns null so nothing is drawn.
 *
 *  `reach` is deliberately short (3): the recovery curve is flat past it
 *  (63 benches at 3, only 77 at 8), so a longer search buys almost nothing
 *  and starts putting furniture far from where it was designed to be. */
export function benchMount(
  w: DecoWorld,
  gx: number,
  gy: number,
  want: number,
  reach = 3,
): { x: number; y: number; side: number } | null {
  const order = [...DIRS].sort((a, b) => (a[2] === want ? -1 : b[2] === want ? 1 : 0));
  for (let d = 0; d <= reach; d++) {
    for (const [dx, dy, side] of order) {
      const cx = gx + dx * d;
      const cy = gy + dy * d;
      if (w.solidAt(cx, cy)) continue; // can't stand inside the wall
      if (w.solidAt(cx + dx, cy + dy)) return { x: cx, y: cy, side };
    }
  }
  return null;
}
