// GETTING UP STEPS YOU OFF THE STOOL (Josh, Oct 2026: "when sitting at any of
// the black jack tables and getting up you get stuck in between the table and
// the stool"). A seat sits INSIDE its own stool's collider, and the movement
// controller snaps any step taken from inside a box to one of that box's
// edges — often the side wedged against the felt. So standing moves you back
// off the seat (away from what it faces), turning a little either way if that
// spot is taken, to the nearest floor no collider overlaps.
//
// Pure (no imports) so test_casino_layout can walk every seat in the hall.

/** A collider box: centre and half-extents, in cells. */
export interface Box { x: number; y: number; rx: number; ry: number }

/** The player's radius in cells, with a hair of margin (controller: 0.22). */
export const STAND_R = 0.24;

/** Where somebody stands when they get up from a seat at (x, y) facing
 *  `heading` (forward is (−sin h, −cos h), so behind is (sin h, cos h)). Null
 *  only if nothing within 1.45 cells is clear. */
export function standOff(
  seat: { x: number; y: number; heading: number },
  near: (x: number, y: number) => Box[],
  size: { w: number; h: number },
): { x: number; y: number } | null {
  const R = STAND_R;
  const clear = (x: number, y: number): boolean =>
    x > R && y > R && x < size.w - R && y < size.h - R &&
    near(x, y).every((p) => Math.abs(x - p.x) >= p.rx + R || Math.abs(y - p.y) >= p.ry + R);
  for (const d of [0.55, 0.7, 0.85, 1.0, 1.2, 1.45]) {
    for (const turn of [0, 0.5, -0.5, 1, -1, 1.5, -1.5]) {
      const a = seat.heading + turn;
      const x = seat.x + Math.sin(a) * d;
      const y = seat.y + Math.cos(a) * d;
      if (clear(x, y)) return { x, y };
    }
  }
  return null;
}
