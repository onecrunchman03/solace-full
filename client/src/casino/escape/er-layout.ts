// THE ESCAPE ROOM COMPLEX — the map, as data (design: ESCAPE.md; Josh's
// drawing: assets/casino/escape room/escape rooms map design.png).
//
// V2 (Josh, 2026-08-14: "why does the map layout look different than what i
// gave you"). The first transcription kept the drawing's topology but
// compressed its open space into 2-cell corridors — and the drawing isn't a
// corridor map: it is ROOM CLUSTERS STANDING IN ONE OPEN FLOOR. So v2 is an
// island model: a single floor plate, the lettered clusters placed where he
// drew them (C's paired columns west, C7/C9 + C8/C10 facing pairs, B's two
// long rows with the mid-row gap, D's block under them, A's three short
// rows, Z's paired columns east), dens in the leftover spots, the spawn room
// hanging off the south. Rooms stay 3×2 / 2×3 cells (6×4 m — the furniture
// sets the scale, Josh's standing note); everything between them is floor.
//
// This file is DELIBERATELY free of runtime-only TS and imports nothing, so
// scripts/checks/test_escape_layout.mjs can import the SHIPPED data under
// Node's type-stripping and assert the invariants.
//
// The drawing labels TWO rooms B13; the second is B14 here (Josh approved).

export const CELL = 2;

/** Grid extent in cells. x east, y south, origin at the NW corner. */
export const GRID = { w: 56, h: 30 };

export interface Rect {
  x0: number;
  y0: number;
  x1: number; // inclusive
  y1: number; // inclusive
}

/** THE FLOOR PLATE — one open space; the rooms are islands inside it. */
export const FLOOR: Rect = { x0: 2, y0: 2, x1: 53, y1: 21 };
/** The short throat connecting the floor's south edge to the ante-room. */
export const STUB: Rect = { x0: 26, y0: 22, x1: 27, y1: 22 };

export type Facing = "N" | "S" | "E" | "W";

export interface Room extends Rect {
  id: string;
  /** Which way the DOOR faces (toward the open floor). */
  facing: Facing;
  /** The floor cell directly outside the door. */
  door: { x: number; y: number };
}

const room = (id: string, x0: number, y0: number, x1: number, y1: number, facing: Facing, dx: number, dy: number): Room =>
  ({ id, x0, y0, x1, y1, facing, door: { x: dx, y: dy } });

/** All 48 rooms, clustered as drawn. */
export const ROOMS: Room[] = [
  // ---- C block (west: two facing columns + two facing pairs) ----
  room("C1", 3, 3, 4, 5, "E", 5, 4),
  room("C2", 3, 7, 4, 9, "E", 5, 8),
  room("C3", 3, 11, 4, 13, "E", 5, 12),
  room("C4", 7, 3, 8, 5, "W", 6, 4),
  room("C5", 7, 7, 8, 9, "W", 6, 8),
  room("C6", 7, 11, 8, 13, "W", 6, 12),
  room("C7", 11, 4, 13, 5, "S", 12, 6),
  room("C8", 16, 4, 18, 5, "S", 17, 6),
  room("C9", 11, 8, 13, 9, "N", 12, 7),
  room("C10", 16, 8, 18, 9, "N", 17, 7),
  // ---- B block (two long rows, the drawn gap between B7 and B9) ----
  room("B2", 21, 3, 23, 4, "S", 22, 5),
  room("B3", 24, 3, 26, 4, "S", 25, 5),
  room("B5", 27, 3, 29, 4, "S", 28, 5),
  room("B7", 30, 3, 32, 4, "S", 31, 5),
  room("B9", 35, 3, 37, 4, "S", 36, 5),
  room("B11", 38, 3, 40, 4, "S", 39, 5),
  room("B13", 41, 3, 43, 4, "S", 42, 5),
  room("B1", 21, 7, 23, 8, "N", 22, 6),
  room("B4", 24, 7, 26, 8, "N", 25, 6),
  room("B6", 27, 7, 29, 8, "N", 28, 6),
  room("B8", 30, 7, 32, 8, "N", 31, 6),
  room("B10", 35, 7, 37, 8, "N", 36, 6),
  room("B12", 38, 7, 40, 8, "N", 39, 6),
  room("B14", 41, 7, 43, 8, "N", 42, 6),
  // ---- D block (west-centre, two rows facing across a floor band) ----
  room("D1", 10, 12, 12, 13, "S", 11, 14),
  room("D2", 13, 12, 15, 13, "S", 14, 14),
  room("D3", 16, 12, 18, 13, "S", 17, 14),
  room("D4", 10, 15, 12, 16, "N", 11, 14),
  room("D5", 13, 15, 15, 16, "N", 14, 14),
  room("D6", 16, 15, 18, 16, "N", 17, 14),
  // ---- A block (three short rows, as drawn) ----
  room("A5", 22, 12, 24, 13, "S", 23, 14),
  room("A6", 25, 12, 27, 13, "S", 26, 14),
  room("A7", 28, 12, 30, 13, "S", 29, 14),
  room("A8", 31, 12, 33, 13, "S", 32, 14),
  room("A1", 21, 15, 23, 16, "N", 22, 14),
  room("A3", 24, 15, 26, 16, "N", 25, 14),
  room("A9", 31, 15, 33, 16, "N", 32, 14),
  room("A2", 21, 18, 23, 19, "S", 22, 20),
  room("A4", 24, 18, 26, 19, "S", 25, 20),
  room("A10", 28, 18, 30, 19, "S", 29, 20),
  room("A11", 31, 18, 33, 19, "S", 32, 20),
  // ---- Z block (east: paired columns facing across the floor) ----
  room("Z1", 44, 3, 45, 5, "E", 46, 4),
  room("Z4", 48, 3, 49, 5, "W", 47, 4),
  room("Z2", 44, 7, 45, 9, "E", 46, 8),
  room("Z5", 48, 7, 49, 9, "W", 47, 8),
  room("Z3", 44, 11, 45, 13, "E", 46, 12),
  room("Z6", 48, 11, 49, 13, "W", 47, 12),
  room("Z7", 48, 15, 49, 17, "W", 47, 16),
];

/** THE DENS — three rolling-shutter rooms the monster spawns from, one
 *  crypto-picked per hunt (Josh: "around the map"): far west, the B-row
 *  gap (the drawing's own hole), far east. No chests, no key, no shelter. */
export const DENS: (Rect & { id: string; door: { x: number; y: number } })[] = [
  { id: "den-west", x0: 2, y0: 16, x1: 4, y1: 17, door: { x: 3, y: 15 } },
  { id: "den-mid", x0: 33, y0: 3, x1: 34, y1: 4, door: { x: 33, y: 5 } },
  { id: "den-east", x0: 50, y0: 16, x1: 52, y1: 17, door: { x: 51, y: 15 } },
];

/** THE ANTE-ROOM (safe, always): Sterling's counter, the two lockers, the
 *  wall map, and both doors. 20×12 m off the south edge. */
export const SPAWN_ROOM: Rect = { x0: 22, y0: 23, x1: 31, y1: 28 };

/** The teleport door back to the casino floor (south wall of the ante-room). */
export const DOOR_CASINO = { x: 26, y: 28 };

/** The teleport door INTO the complex (top of the ante-room, up the stub).
 *  Locked during the red phase; the way OUT only opens to a key. */
export const DOOR_COMPLEX = { x: 26, y: 23 };

/** Block letters that exist — the hunt's "open blocks" roll draws from these. */
export const BLOCKS = ["A", "B", "C", "D", "Z"] as const;

export const roomById = (id: string): Room | undefined => ROOMS.find((r) => r.id === id);

/** Every walkable cell (the floor plate + stub + ante-room; rooms and dens
 *  are subsets of the plate) — the collision/pathing substrate the client
 *  build and the server's monster brain both derive from. */
export function walkableCells(): Set<string> {
  const out = new Set<string>();
  const add = (r: Rect): void => {
    for (let y = r.y0; y <= r.y1; y++) for (let x = r.x0; x <= r.x1; x++) out.add(`${x},${y}`);
  };
  add(FLOOR);
  add(STUB);
  add(SPAWN_ROOM);
  return out;
}
