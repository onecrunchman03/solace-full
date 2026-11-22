// THE 37 POCKETS — the single-zero wheel, as data.
//
// Its own module (no THREE, no DOM) for the same reason spin.ts is: the hall
// that turns the wheel needs it, and so does a harness that can't load WebGL.
// The order below is the real European wheel's, and it is the only thing
// standing between "the ball landed on 17" and a 3D animation that means
// nothing — so it is checked against the server's own paytable in
// scripts/checks/test_casino_layout.mjs.

/** Clockwise from 0, the way the pockets are actually laid out. */
export const EU_ORDER = [
  0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10,
  5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26,
];

/** The reds. Mirrors RED_NUMBERS in src/roulette.ts — the engine pays off its
 *  copy, this one only paints, and the harness holds the two together. */
export const EU_RED = new Set([
  1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36,
]);

export const POCKETS = EU_ORDER.length; // 37

/** Where a pocket sits on the wheel head, radians, in the head's own frame.
 *  The half-step offset keeps every pocket clear of the texture's seam. */
export function pocketAngle(pocket: number): number {
  const k = Math.max(0, EU_ORDER.indexOf(pocket));
  return -Math.PI / 2 + (k + 0.5) * ((Math.PI * 2) / POCKETS);
}
