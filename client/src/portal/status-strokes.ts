// THE PORTAL — Tharvend's nine status signs and the count mark, drawn in the
// script's own stroke style (the same 100×112 grid) but never letters.
// Order matches STATUS in src/portal/hall.ts.
import type { Part } from "./glyph-strokes";

export const STATUS_STROKES: Part[][] = [
  // ORMAA — the star's output: a disc and four rays
  [["c", 50, 50, 14], ["p", "M50 16 V28 M50 72 V84 M16 50 H28 M72 50 H84"]],
  // MEMBERS — a count of heads
  [["c", 30, 46, 8], ["c", 50, 46, 8], ["c", 70, 46, 8], ["p", "M20 72 H80"]],
  // LINE — a keystone's line: two posts and the thread between
  [["c", 22, 50, 7], ["c", 78, 50, 7], ["p", "M29 50 H71"]],
  // DOOR — the door beneath: an arch over a floor
  [["p", "M30 84 V40 Q50 14 70 40 V84"], ["p", "M20 84 H80"]],
  // REPAIR — a break, mended: a zigzag under a bar
  [["p", "M22 34 H78"], ["p", "M26 76 L40 54 L54 76 L68 54 L76 66"]],
  // FILED — set down: a box with its lid
  [["p", "M28 36 H72 V82 H28 Z"], ["p", "M24 26 H76"]],
  // CAPACITY — cannot hold: a bowl, brimming over
  [["p", "M22 44 Q50 92 78 44"], ["p", "M18 44 H82"], ["d", 50, 30]],
  // ENTRY — a member entered: a ring with its mark
  [["c", 50, 50, 24], ["p", "M38 52 L48 62 L64 40"]],
  // ENTRY-X — the entry Tharvend could not complete: the ring, broken
  [["p", "M74 50 A24 24 0 1 1 50 26"], ["p", "M38 52 L48 62"], ["p", "M60 30 L80 18"]],
];

/** The count mark: the last room's only name. Appears once, and nowhere else. */
export const COUNT_MARK: Part[] = [["p", "M50 14 L82 50 L50 86 L18 50 Z"], ["c", 50, 50, 10], ["p", "M50 86 V100"]];
