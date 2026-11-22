// THE TERROR HOTEL's first room library (Level 5, Oct 2026) — written once,
// then edited in the map editor like every other level's (Admin Panel → Map
// editor). Each room is drawn here in full, cell by cell; this script adds the
// doorway slots and furnishes the rooms from the prop kit, then writes
// src/backrooms/hotel-rooms.json in the editor's own layout (formatLibrary).
//
//   npm run build && node scripts/hotel-library.mjs
//
// Legend (hotel-tiles.ts): '.' floor · '#' solid · furniture: D the service
// stair · S the rusty door · K a Boiler Key spot · R the guest register · L a
// lift · * a ceiling fixture · o a wall sconce · F a furnace · N a moth nest.
// Rooms are 8-cell modules; the slots sit at cells 3-4 of every module side.
//
// Prop placement (kit.ts): x/y in CELLS from the room's corner, r = yaw in
// degrees clockwise from facing SOUTH (0 south, 90 west, 180 north, 270 east),
// z = metres off the floor. A wall prop backs on to its wall.
//
// The references (docs/backrooms/REFERENCES.md → Level 5): long sconce-lit
// corridors of numbered doors, palms round lamp-lit tables, a vast bare
// ballroom with one table under a chandelier, brown tunnels of pipes below.
// The corridors' doors are SCENERY — only the suites open — and every one
// carries a number; the suites' numbers are drawn per map, never one of these.
import { createRequire } from "node:module";
import { writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(path.join(ROOT, "package.json"));
const { formatLibrary } = require(path.join(ROOT, "dist", "backrooms", "tiles.js"));
const { lintHotelTile } = require(path.join(ROOT, "dist", "backrooms", "hotel-tiles.js"));

const M = 8;
function slots(w, h, skip = "") {
  const out = [];
  for (let m = 0; m * M < w; m++) {
    if (!skip.includes("N")) out.push([m * M + 3, 0, "N", 2]);
    if (!skip.includes("S")) out.push([m * M + 3, h - 1, "S", 2]);
  }
  for (let m = 0; m * M < h; m++) {
    if (!skip.includes("W")) out.push([0, m * M + 3, "W", 2]);
    if (!skip.includes("E")) out.push([w - 1, m * M + 3, "E", 2]);
  }
  return out;
}
function slotsWhereOpen(map, skip = "") {
  const h = map.length, w = map[0].length;
  return slots(w, h, skip).filter(([x, y, side]) => {
    const lanes = side === "N" || side === "S" ? [[x, y], [x + 1, y]] : [[x, y], [x, y + 1]];
    return lanes.every(([lx, ly]) => map[ly][lx] !== "#");
  });
}
const fill = (w, h, ch = ".") => Array.from({ length: h }, () => ch.repeat(w));
const rows = (h, row) => Array.from({ length: h }, () => row);
function furn(w, h, pieces) {
  const g = Array.from({ length: h }, () => Array(w).fill("."));
  for (const [x, y, ch] of pieces) g[y][x] = ch;
  return g.map((r) => r.join(""));
}
/** Fixtures on a lattice every `step` cells, offset `at`, off solid cells. */
function lamps(w, h, step = 4, at = 2, map = null) {
  const out = [];
  for (let y = at; y < h; y += step) for (let x = at; x < w; x += step) if (!map || map[y][x] !== "#") out.push([x, y, "*"]);
  return out;
}

// ---- THE NUMBERED DOORS ------------------------------------------------------
// Every placard in the library gets its own number, so a scenery number never
// collides with a suite's (the generator gives suites the numbers left over).
const NUMBERS = [103, 108, 112, 117, 121, 126, 134, 139, 145, 152, 158, 163, 171, 177, 184, 190, 196, 202, 207, 211, 219, 224, 230, 236, 243, 249, 255, 262, 268, 271, 279, 284, 291, 297, 305, 310, 316, 322, 329, 333, 338, 341, 347, 352, 358, 364, 369, 375, 381, 386, 392, 398, 404, 409, 413, 418, 422, 427, 431, 436, 440, 444, 447, 449];
let numAt = 0;
const nextNumber = () => {
  if (numAt >= NUMBERS.length) throw new Error("hotel-library: out of placard numbers — add more to NUMBERS");
  return String(NUMBERS[numAt++]);
};
/** A scenery door on a corridor wall: the dark wood door, its brass number
 *  over it. `side` is the wall it is on (W or E); `edge` the wall's x. */
function roomDoor(edge, y, side) {
  const west = side === "W";
  const r = west ? 270 : 90;
  return [
    { p: "door-panel", v: 3, x: west ? edge + 0.04 : edge - 0.04, y, r },
    { p: "sign-plate", v: 3, x: west ? edge + 0.01 : edge - 0.01, y, r, z: 2.35, text: nextNumber() },
  ];
}
/** Doors down both walls of a 2-wide corridor (floor at cells 3-4), at the
 *  given y's (never across a slot's rows). */
const doorsDown = (ys) => ys.flatMap((y) => [...roomDoor(3, y, "W"), ...roomDoor(5, y, "E")]);

const ROOMS = [
  // ================================================================ SET PIECES
  {
    id: "the-service-stair", name: "The Service Stair", kind: "landing", set: "hall", role: "start", type: "landing", min: 1, max: 1, skip: "N",
    note: "You arrive here, down the office's stairwell: the door on its north wall (the map's edge). Its lights always work, and nothing follows you in. Somewhere a band is playing.",
    map: fill(8, 8),
    furn: furn(8, 8, [[3, 0, "D"], [4, 4, "*"], [0, 5, "o"], [7, 5, "o"]]),
    face: [[3, 0, "N"], [0, 5, "W"], [7, 5, "E"]],
    props: [
      { p: "potted-palm", x: 0.5, y: 0.5, r: 0 },
      { p: "potted-palm", x: 7.5, y: 0.5, r: 0 },
      { p: "velvet-armchair", x: 0.6, y: 2.4, r: 270 },
      { p: "wall-clock", x: 6.0, y: 0.03, r: 0, z: 2.4 },
      { p: "luggage-trolley", x: 6.6, y: 2.6, r: 200 },
      { p: "sign-plate", v: 3, x: 1.6, y: 0.02, r: 0, z: 2.3, text: "STAFF ONLY" },
    ],
  },
  {
    id: "the-beverly-room", name: "The Beverly Room", kind: "beverly", set: "hall", role: "hub", type: "beverly", min: 1, max: 1,
    note: "The Eternal Ballroom: a vast red-carpeted floor under chandeliers, doors on every side, and in the middle one small table — drinks, an unfinished game of Mahjong, and the guest register open beside it. Leave the game alone.",
    map: fill(24, 24),
    furn: furn(24, 24, [[12, 13, "R"], ...lamps(24, 24, 6, 3)]),
    props: [
      // the table under the great chandelier
      // (the register's cell is 12,13 — you read it standing at the table's
      // south side; the game lays the book on this table)
      { p: "persian-rug", x: 12.5, y: 12.8, r: 90 },
      { p: "cafe-table", v: 2, x: 12.5, y: 12.4, r: 0 },
      { p: "mahjong-set", x: 12.5, y: 12.22, r: 90, z: 0.75 },
      { p: "wood-chair", x: 11.9, y: 12.4, r: 270 },
      { p: "wood-chair", x: 13.1, y: 12.4, r: 90 },
      { p: "wood-chair", x: 12.5, y: 11.8, r: 180 },
      // the bar on the north wall, between the doors
      { p: "deco-back-bar", x: 6.4, y: 0.14, r: 0 },
      { p: "reception-desk", x: 6.4, y: 0.95, r: 180 },
      { p: "bar-stool-cushion", v: 2, x: 6.0, y: 1.5, r: 0 },
      { p: "bar-stool-cushion", v: 2, x: 6.9, y: 1.5, r: 0 },
      // palms flanking every door, sofas between them
      ...[1, 7, 9, 15, 17, 23].flatMap((a) => [
        { p: "potted-palm", x: a === 1 || a === 9 || a === 17 ? a + 0.6 : a - 0.6, y: 0.5, r: 0 },
        { p: "potted-palm", x: a === 1 || a === 9 || a === 17 ? a + 0.6 : a - 0.6, y: 23.5, r: 0 },
      ]).filter((pl) => !(pl.y < 1 && pl.x > 4 && pl.x < 9)),
      { p: "velvet-sofa", x: 0.5, y: 8.0, r: 270 },
      { p: "velvet-sofa", x: 0.5, y: 16.0, r: 270 },
      { p: "velvet-sofa", x: 23.5, y: 8.0, r: 90 },
      { p: "velvet-sofa", x: 23.5, y: 16.0, r: 90 },
      // round tables at the edges of the floor, a lamp on each
      ...[[5, 6], [19, 6], [5, 18], [19, 18]].flatMap(([x, y], k) => [
        { p: "cafe-table", v: 2, x, y, r: 0 },
        { p: "deco-table-lamp", x, y, r: 30 * k, z: 0.75 },
        { p: "velvet-armchair", x: x - 0.7, y, r: 270, c: 80 },
        { p: "velvet-armchair", x: x + 0.7, y, r: 90, c: 60 },
      ]),
    ],
  },
  {
    id: "the-boiler-room-door", name: "The Boiler Room Door", kind: "boilergate", set: "boiler", role: "gate", type: "boilergate", min: 1, max: 1,
    note: "The only way below stairs: a plain service room off the Main Hall, the heat coming up through the floor. Past it, the air gets worse.",
    map: fill(8, 8),
    furn: furn(8, 8, [[4, 4, "*"]]),
    props: [
      { p: "sign-plate", v: 4, x: 1.2, y: 0.02, r: 0, z: 2.2, text: "BOILER ROOM" },
      { p: "sign-plate", v: 4, x: 6.8, y: 7.98, r: 180, z: 2.2, text: "BOILER ROOM" },
      { p: "riser-pipes", x: 0.5, y: 0.6, r: 0 },
      { p: "valve-wheel", x: 7.6, y: 1.0, r: 90 },
    ],
  },
  {
    id: "the-rusty-door", name: "The Rusty Door", kind: "rustydoor", set: "boiler", role: "goal", type: "rustydoor", min: 1, max: 1, skip: "S",
    note: "The way on, deep below stairs: a door of riveted iron rusted brown, on its south wall. It takes the Boiler Key.",
    map: fill(8, 8),
    furn: furn(8, 8, [[3, 7, "S"], [3, 3, "*"]]),
    face: [[3, 7, "S"]],
    props: [
      { p: "duct-pipe-riser", v: 1, x: 0.7, y: 7.2, r: 0 },
      { p: "duct-pipe-riser", v: 1, x: 7.3, y: 7.2, r: 0 },
      { p: "pipe-length", x: 4.0, y: 0.4, r: 90, z: 2.6 },
      { p: "propane-tank", v: 2, x: 6.6, y: 0.6, r: 0 },
    ],
  },

  // ================================================================ THE MAIN HALL
  {
    id: "hall-straight", kind: "corridor", set: "hall", role: "block", type: "corridor", weight: 2.2,
    note: "A corridor of numbered doors. None of them open.",
    map: rows(8, "###..###"),
    furn: furn(8, 8, [[3, 2, "o"], [4, 5, "o"], [4, 3, "*"]]),
    face: [[3, 2, "W"], [4, 5, "E"]],
    props: [...doorsDown([1.2, 6.3])],
  },
  {
    id: "hall-long", kind: "corridor", set: "hall", role: "block", type: "corridor", weight: 1.6,
    note: "A long corridor of numbered doors, sconces down both walls.",
    map: rows(16, "###..###"),
    furn: furn(8, 16, [[3, 2, "o"], [4, 6, "o"], [3, 10, "o"], [4, 13, "o"], [3, 4, "*"], [4, 12, "*"]]),
    face: [[3, 2, "W"], [4, 6, "E"], [3, 10, "W"], [4, 13, "E"]],
    props: [...doorsDown([1.2, 6.3, 9.2, 14.3])],
  },
  {
    id: "hall-cross", kind: "corridor", set: "hall", role: "block", type: "corridor", weight: 1.8,
    note: "Two corridors crossing under a lamp.",
    map: ["###..###", "###..###", "###..###", "........", "........", "###..###", "###..###", "###..###"],
    furn: furn(8, 8, [[3, 2, "o"], [4, 5, "o"], [3, 3, "*"]]),
    face: [[3, 2, "W"], [4, 5, "E"]],
    props: [...roomDoor(5, 1.2, "E"), ...roomDoor(3, 6.3, "W")],
  },
  {
    id: "hall-ell", kind: "corridor", set: "hall", role: "block", type: "corridor", weight: 1.2,
    note: "A corridor turning a corner.",
    map: ["###..###", "###..###", "###..###", "###.....", "###.....", "########", "########", "########"],
    furn: furn(8, 8, [[3, 2, "o"], [4, 3, "*"]]),
    face: [[3, 2, "W"]],
    props: [...roomDoor(5, 1.2, "E"), { p: "potted-palm", x: 3.5, y: 4.55, r: 0, c: 60 }],
  },
  {
    id: "hall-tee", kind: "corridor", set: "hall", role: "block", type: "corridor", weight: 1.4,
    note: "A side corridor off a run of doors.",
    map: ["###..###", "###..###", "###..###", "###.....", "###.....", "###..###", "###..###", "###..###"],
    furn: furn(8, 8, [[3, 2, "o"], [3, 5, "o"], [4, 3, "*"]]),
    face: [[3, 2, "W"], [3, 5, "W"]],
    props: [...roomDoor(3, 1.2, "W"), ...roomDoor(3, 6.3, "W"), ...roomDoor(5, 1.2, "E"), ...roomDoor(5, 6.3, "E")],
  },
  {
    id: "lift-hall", name: "Lift Hall", kind: "lifthall", set: "hall", role: "block", type: "lifthall", weight: 0.7, min: 2, max: 4, skip: "N",
    note: "Two brass lifts. Floors 1 to 12 come out somewhere else on this floor. Nobody who pressed 13 has been seen again.",
    map: fill(16, 8),
    // the lifts stand BETWEEN the doorway slots (3-4, 11-12), so a neighbour
    // can always open a door through this wall
    furn: furn(16, 8, [[6, 0, "L"], [9, 0, "L"], [4, 4, "*"], [12, 4, "*"], [1, 0, "o"], [14, 0, "o"]]),
    face: [[6, 0, "N"], [9, 0, "N"], [1, 0, "N"], [14, 0, "N"]],
    props: [
      { p: "potted-palm", x: 7.95, y: 0.5, r: 0 },
      { p: "velvet-armchair", x: 7.0, y: 6.9, r: 180 },
      { p: "velvet-armchair", x: 9.0, y: 6.9, r: 180 },
      { p: "serving-table", x: 8.0, y: 7.6, r: 0 },
      { p: "luggage-trolley", x: 13.6, y: 5.8, r: 160 },
      { p: "deco-table-lamp", x: 8.0, y: 7.6, r: 0, z: 0.82 },
    ],
  },
  {
    id: "lounge", name: "The Palm Lounge", kind: "lounge", set: "hall", role: "block", type: "lounge", weight: 0.9, max: 6,
    note: "Columns, palms, round tables each with its lamp still lit. The chairs are pushed back as if everyone just stood up.",
    map: ["................", "................", "................", "....#......#....", "................", "................", "................", "................", "................", "................", "................", "................", "....#......#....", "................", "................", "................"],
    furn: furn(16, 16, [[2, 2, "*"], [13, 2, "*"], [2, 13, "*"], [13, 13, "*"], [8, 8, "*"]]),
    props: [
      ...[[2, 7], [8, 2], [13.5, 8], [8, 13.5], [8, 8]].flatMap(([x, y], k) => [
        { p: "cafe-table", v: 2, x, y, r: 0 },
        { p: "deco-table-lamp", x, y, r: 40 * k, z: 0.75 },
        { p: "velvet-armchair", x: x - 0.7, y, r: 270, c: 85 },
        { p: "velvet-armchair", x: x + 0.7, y, r: 90, c: 70 },
      ]),
      { p: "potted-palm", x: 3.4, y: 3.5, r: 0 },
      { p: "potted-palm", x: 12.6, y: 3.5, r: 0 },
      { p: "potted-palm", x: 3.4, y: 12.5, r: 0 },
      { p: "potted-palm", x: 12.6, y: 12.5, r: 0 },
      { p: "floor-lamp", v: 2, x: 0.5, y: 15.5, r: 0 },
      { p: "floor-lamp", v: 2, x: 15.5, y: 0.5, r: 0 },
      { p: "picture-frame", x: 0.02, y: 7.0, r: 270, z: 1.5 },
      { p: "picture-frame", x: 15.98, y: 9.0, r: 90, z: 1.5 },
    ],
  },
  {
    id: "lounge-small", kind: "lounge", set: "hall", role: "block", type: "lounge", weight: 0.9, max: 8,
    note: "A sitting room off the corridor: a sofa, two armchairs, a palm.",
    map: fill(8, 8),
    furn: furn(8, 8, [[4, 4, "*"]]),
    props: [
      { p: "persian-rug", x: 4.0, y: 4.0, r: 0 },
      { p: "velvet-sofa", x: 1.0, y: 6.0, r: 270 },
      { p: "velvet-armchair", x: 5.6, y: 2.0, r: 135 },
      { p: "velvet-armchair", x: 6.4, y: 5.8, r: 45 },
      { p: "cafe-table", v: 1, x: 4.0, y: 4.0, r: 0 },
      { p: "chesterfield-sofa", x: 4.0, y: 7.6, r: 180 },
      { p: "picture-frame", x: 4.0, y: 0.02, r: 0, z: 1.5 },
      { p: "potted-palm", x: 0.5, y: 0.5, r: 0 },
      { p: "floor-lamp", v: 2, x: 7.5, y: 7.5, r: 0 },
    ],
  },
  {
    id: "dining-room", name: "Dining Room", kind: "dining", set: "hall", role: "block", type: "dining", weight: 0.7, max: 5,
    note: "Long tables laid for a dinner that never started.",
    map: fill(16, 8),
    furn: furn(16, 8, lamps(16, 8, 4, 2)),
    props: [
      ...[4.5, 11.5].flatMap((x) => [
        { p: "long-table", x, y: 3.0, r: 0 },
        { p: "long-table", x, y: 5.0, r: 0 },
        ...[-0.5, 0.5].flatMap((dx) => [
          { p: "wood-chair", x: x + dx, y: 2.45, r: 180 },
          { p: "wood-chair", x: x + dx, y: 5.55, r: 0, c: 80 },
        ]),
      ]),
      { p: "serving-table", x: 8.0, y: 0.35, r: 0 },
      { p: "potted-palm", x: 0.5, y: 0.5, r: 0 },
      { p: "potted-palm", x: 15.5, y: 7.5, r: 0 },
    ],
  },
  {
    id: "reading-room", name: "Reading Room", kind: "library", set: "hall", role: "block", type: "library", weight: 0.6, max: 4,
    note: "Shelves of books nobody has opened in years, a writing desk, a lamp still on.",
    map: fill(8, 16),
    furn: furn(8, 16, lamps(8, 16, 8, 4)),
    props: [
      ...[1.4, 2.4, 9.6, 12.6, 13.6].map((y) => ({ p: "bookshelf-dusty", x: 0.2, y, r: 270 })),
      ...[1.4, 2.4, 9.6, 12.6, 13.6].map((y) => ({ p: "bookshelf-dusty", x: 7.8, y, r: 90 })),
      { p: "writing-desk", x: 4.0, y: 7.0, r: 0 },
      { p: "wood-chair", x: 4.0, y: 6.3, r: 180 },
      { p: "deco-table-lamp", x: 3.9, y: 7.0, r: 0, z: 0.8 },
      { p: "velvet-armchair", x: 3.0, y: 13.5, r: 30 },
      { p: "floor-lamp", v: 1, x: 2.2, y: 14.5, r: 0 },
      { p: "persian-rug", x: 4.0, y: 7.5, r: 0 },
    ],
  },
  {
    id: "linen-room", kind: "linen", set: "hall", role: "block", type: "linen", weight: 0.4, max: 6, skip: "WE",
    note: "A dark service closet: shelves of folded linen, a laundry smell, and something in the corner that flutters.",
    map: fill(8, 8),
    furn: furn(8, 8, [[6, 6, "N"]]),
    props: [
      { p: "dresser-tall", x: 0.3, y: 2.0, r: 270 },
      { p: "dresser-tall", x: 0.3, y: 5.5, r: 270 },
      { p: "wardrobe", x: 7.7, y: 2.0, r: 90 },
      { p: "low-cabinet", v: 1, x: 7.7, y: 5.0, r: 90 },
    ],
  },

  // ================================================================ THE SUITES
  {
    id: "suite-single", name: "Suite", kind: "suite", set: "hall", role: "suite", type: "suite", weight: 1, min: 6, max: 8,
    note: "A hotel room: a bed, a wardrobe, a lamp by the bed. Its number is on its door. One of them has the Boiler Key on a hook.",
    map: fill(8, 8),
    doors: [[3, 7, "S", 2]],
    furn: furn(8, 8, [[1, 5, "K"], [4, 3, "*"], [0, 2, "o"]]),
    face: [[0, 2, "W"]],
    props: [
      { p: "deco-hotel-bed", x: 3.0, y: 0.6, r: 0 },
      { p: "bedside-table", x: 1.9, y: 0.3, r: 0 },
      { p: "deco-table-lamp", x: 1.9, y: 0.3, r: 0, z: 0.6 },
      { p: "bedside-table", x: 4.1, y: 0.3, r: 0 },
      { p: "antique-wardrobe", x: 7.6, y: 2.0, r: 90 },
      { p: "dressing-table", x: 7.65, y: 5.0, r: 90 },
      { p: "velvet-armchair", x: 1.0, y: 3.4, r: 315, c: 70 },
      { p: "picture-frame", x: 5.6, y: 0.02, r: 0, z: 1.5 },
      { p: "radiator", x: 0.12, y: 5.8, r: 270 },
      { p: "persian-rug", x: 3.0, y: 3.5, r: 90 },
    ],
  },
  {
    id: "suite-grand", name: "Grand Suite", kind: "suite", set: "hall", role: "suite", type: "suite", weight: 0.6, min: 2, max: 4,
    note: "A suite of two rooms: a sitting room by the door, the bedroom beyond.",
    map: fill(8, 16),
    walls: ["........", "........", "........", "........", "........", "........", "........", "--..----", "........", "........", "........", "........", "........", "........", "........", "........"],
    doors: [[3, 15, "S", 2]],
    furn: furn(8, 16, [[6, 4, "K"], [4, 3, "*"], [4, 11, "*"]]),
    props: [
      { p: "deco-hotel-bed", x: 4.0, y: 0.6, r: 0 },
      { p: "bedside-table", x: 2.9, y: 0.3, r: 0 },
      { p: "deco-table-lamp", x: 2.9, y: 0.3, r: 0, z: 0.6 },
      { p: "antique-wardrobe", x: 0.4, y: 4.0, r: 270 },
      { p: "dressing-table", x: 7.65, y: 2.0, r: 90 },
      { p: "velvet-sofa", x: 0.5, y: 11.0, r: 270 },
      { p: "velvet-armchair", x: 3.2, y: 10.0, r: 135 },
      { p: "cafe-table", v: 2, x: 2.2, y: 11.0, r: 0 },
      { p: "writing-desk", x: 7.6, y: 11.0, r: 90 },
      { p: "potted-palm", x: 7.5, y: 8.5, r: 0 },
      { p: "floor-lamp", v: 2, x: 0.5, y: 14.5, r: 0 },
    ],
  },
  {
    id: "suite-dark", name: "Suite", kind: "suite", set: "hall", role: "suite", type: "suite", weight: 0.5, min: 2, max: 4,
    note: "A hotel room with the bulb gone. Something has nested in the wardrobe.",
    map: fill(8, 8),
    doors: [[3, 7, "S", 2]],
    furn: furn(8, 8, [[6, 5, "K"], [6, 1, "N"]]),
    props: [
      { p: "deco-hotel-bed", x: 2.0, y: 0.6, r: 0 },
      { p: "bedside-table", x: 0.4, y: 0.3, r: 0 },
      { p: "antique-wardrobe", x: 7.6, y: 1.0, r: 90 },
      { p: "dresser-tall", x: 0.3, y: 4.5, r: 270 },
    ],
  },

  // ================================================================ BELOW STAIRS
  {
    id: "boiler-room", name: "The Boilers", kind: "boiler", set: "boiler", role: "block", type: "boiler", weight: 0.8, max: 6,
    note: "Four furnaces along the north wall, doors open, red inside. Don't stand at their mouths.",
    map: fill(16, 16),
    furn: furn(16, 16, [[1, 0, "F"], [6, 0, "F"], [9, 0, "F"], [14, 0, "F"], ...lamps(16, 16, 8, 4)]),
    face: [[1, 0, "N"], [6, 0, "N"], [9, 0, "N"], [14, 0, "N"]],
    props: [
      { p: "duct-pipe-riser", v: 1, x: 0.7, y: 15.3, r: 0 },
      { p: "duct-pipe-riser", v: 2, x: 15.3, y: 15.3, r: 0 },
      { p: "riser-pipes", x: 7.5, y: 8.0, r: 0 },
      { p: "pipe-bundle", x: 4.0, y: 13.5, r: 0, c: 70 },
      { p: "valve-wheel", x: 12.0, y: 8.0, r: 0, z: 1.2 },
      { p: "boiler", x: 12.0, y: 12.6, r: 0 },
      { p: "safety-valve", x: 7.8, y: 8.0, r: 0, z: 1.6 },
      { p: "propane-tank", v: 1, x: 15.5, y: 6.0, r: 0 },
      { p: "propane-tank", v: 3, x: 15.5, y: 6.6, r: 0 },
    ],
  },
  {
    id: "boiler-small", kind: "boiler", set: "boiler", role: "block", type: "boiler", weight: 0.9, max: 10,
    note: "One furnace, its door open.",
    map: fill(8, 8),
    furn: furn(8, 8, [[1, 0, "F"], [4, 4, "*"]]),
    face: [[1, 0, "N"]],
    props: [
      { p: "riser-pipes", x: 7.3, y: 0.6, r: 0 },
      { p: "pipe-length", x: 4.0, y: 7.6, r: 90 },
      { p: "valve-wheel", x: 6.0, y: 7.7, r: 180, z: 1.0 },
    ],
  },
  {
    id: "pipeway", kind: "pipeway", set: "boiler", role: "block", type: "pipeway", weight: 2.2,
    note: "A low brown tunnel of pipes.",
    map: rows(8, "##....##"),
    furn: furn(8, 8, [[3, 3, "*"]]),
    props: [
      { p: "pipe-length", x: 2.2, y: 4.0, r: 0, z: 2.2 },
      { p: "pipe-length", x: 5.8, y: 4.0, r: 0, z: 2.4 },
      { p: "valve-wheel", x: 5.85, y: 6.0, r: 90, z: 1.0, c: 50 },
    ],
  },
  {
    id: "pipeway-long", kind: "pipeway", set: "boiler", role: "block", type: "pipeway", weight: 1.4,
    note: "A long tunnel of pipes.",
    map: rows(16, "##....##"),
    furn: furn(8, 16, [[3, 3, "*"], [4, 11, "*"]]),
    props: [
      { p: "pipe-length", x: 2.2, y: 4.0, r: 0, z: 2.2 },
      { p: "pipe-length", x: 2.2, y: 12.0, r: 0, z: 2.2 },
      { p: "pipe-length", x: 5.8, y: 8.0, r: 0, z: 2.4 },
      { p: "riser-pipes", x: 2.5, y: 7.5, r: 0, c: 60 },
    ],
  },
  {
    id: "pipeway-cross", kind: "pipeway", set: "boiler", role: "block", type: "pipeway", weight: 1.6,
    note: "Two pipe tunnels crossing.",
    map: ["##....##", "##....##", "........", "........", "........", "........", "##....##", "##....##"],
    furn: furn(8, 8, [[3, 3, "*"]]),
    props: [{ p: "duct-pipe-riser", v: 1, x: 2.6, y: 2.6, r: 0, c: 50 }],
  },
  {
    id: "coal-store", name: "Coal Store", kind: "coalstore", set: "boiler", role: "block", type: "coalstore", weight: 0.5, max: 6, skip: "WE",
    note: "A black room with no light. The moths sleep here.",
    map: fill(8, 8),
    furn: furn(8, 8, [[5, 2, "N"]]),
    props: [
      { p: "water-barrel", x: 0.6, y: 0.6, r: 0 },
      { p: "explosive-barrel", x: 1.3, y: 0.6, r: 0, c: 50 },
      { p: "pipe-bundle", x: 4.0, y: 6.8, r: 0 },
    ],
  },
];

const out = [];
let bad = 0;
for (const r of ROOMS) {
  const def = { ...r, doors: r.doors ?? slotsWhereOpen(r.map, r.skip) };
  delete def.skip;
  const l = lintHotelTile(def);
  for (const e of l.errors) console.log(`✗ ${r.id}: ${e}`);
  for (const w of l.warnings) console.log(`  ${r.id}: ${w}`);
  if (l.errors.length) bad++;
  out.push(def);
}
writeFileSync(path.join(ROOT, "src", "backrooms", "hotel-rooms.json"), formatLibrary(out));
console.log(`${out.length} rooms → src/backrooms/hotel-rooms.json (${numAt} numbered doors)${bad ? `  (${bad} with errors)` : ""}`);
process.exit(bad ? 1 : 0);
