// THE SUBURBS' first room library (Level 9, Oct 2026) — written once, then
// edited in the map editor like every other level's (Admin Panel → Map
// editor). Each room is drawn here in full, cell by cell; this script adds the
// doorway slots and dresses the rooms, then writes
// src/backrooms/suburb-rooms.json in the editor's own layout (formatLibrary).
//
//   npm run build && node scripts/suburb-library.mjs
//
// Legend (suburb-tiles.ts): '.' floor of the room's own type · '#' solid ·
// zone letters for floor of another type (m manhole, r road, w sidewalk,
// y yard, h house, g garage, k park, q porch) · furniture: D the manhole ·
// F Number 9's front door · K a key spot · * a streetlight (lit) · = (dead) ·
// ~ (flickering) · P a porch light (lit) · p a porch light (dead; it marks a
// house's front). Rooms are 8-cell modules; the slots sit at cells 3-4 of
// every module side, on floor 0. Every house is drawn with its FRONT to the
// south; the planner turns it to the street.
//
// Houses are THIN-walled (the walls layer): `box` draws a house's shell with
// its doors left open, `hwall`/`vwall` its partitions.
//
// Dressing until real models are approved: the kit's furniture indoors (sofas,
// beds, tables, wardrobes), and SHAPES outdoors — a trunk and a ball for a
// tree, low boxes for hedges and fences, a box for a parked car, a post and a
// box for a mailbox. Prop placement (kit.ts): x/y in CELLS from the room's
// corner, r = yaw in degrees clockwise from facing SOUTH, z = metres up.
import { createRequire } from "node:module";
import { writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(path.join(ROOT, "package.json"));
const { formatLibrary } = require(path.join(ROOT, "dist", "backrooms", "tiles.js"));
const { lintSuburbTile } = require(path.join(ROOT, "dist", "backrooms", "suburb-tiles.js"));

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
/** Every slot whose two lanes are open floor. */
function slotsWhereOpen(map, skip = "") {
  const h = map.length, w = map[0].length;
  return slots(w, h, skip).filter(([x, y, side]) => {
    const lanes = side === "N" || side === "S" ? [[x, y], [x + 1, y]] : [[x, y], [x, y + 1]];
    return lanes.every(([lx, ly]) => map[ly][lx] !== "#");
  });
}
const rows = (h, row) => Array.from({ length: h }, () => row);
function furn(w, h, pieces) {
  const g = Array.from({ length: h }, () => Array(w).fill("."));
  for (const [x, y, ch] of pieces) g[y][x] = ch;
  return g.map((r) => r.join(""));
}
/** A map of yard (`yard` letter) with a rectangle of the room's own floor. */
function lotMap(w, h, rects, yard = "y") {
  const g = Array.from({ length: h }, () => Array(w).fill(yard));
  for (const [x0, y0, x1, y1, ch = "."] of rects) for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) g[y][x] = ch;
  return g.map((r) => r.join(""));
}

// ---- the walls layer ------------------------------------------------------
function wallGrid(w, h) {
  const N = Array.from({ length: h }, () => Array(w).fill(false));
  const Wl = Array.from({ length: h }, () => Array(w).fill(false));
  const g = {
    /** A house's shell round cells x0..x1, y0..y1, its doors left open:
     *  ["S", x] / ["N", x] a one-cell door in the south / north wall at
     *  column x, ["W", y] / ["E", y] in the west / east wall at row y. */
    box(x0, y0, x1, y1, doors = []) {
      const has = (s, k) => doors.some(([ds, dk]) => ds === s && dk === k);
      for (let x = x0; x <= x1; x++) {
        if (!has("N", x)) N[y0][x] = true;
        if (y1 + 1 < h && !has("S", x)) N[y1 + 1][x] = true;
      }
      for (let y = y0; y <= y1; y++) {
        if (!has("W", y)) Wl[y][x0] = true;
        if (x1 + 1 < w && !has("E", y)) Wl[y][x1 + 1] = true;
      }
      return g;
    },
    /** A partition along the north edge of row y, x0..x1, gaps at `gaps`. */
    hwall(y, x0, x1, gaps = []) {
      for (let x = x0; x <= x1; x++) if (!gaps.includes(x)) N[y][x] = true;
      return g;
    },
    /** A partition along the west edge of column x, y0..y1, gaps at `gaps`. */
    vwall(x, y0, y1, gaps = []) {
      for (let y = y0; y <= y1; y++) if (!gaps.includes(y)) Wl[y][x] = true;
      return g;
    },
    rows() {
      return N.map((r, y) => r.map((n, x) => (n && Wl[y][x] ? "+" : n ? "-" : Wl[y][x] ? "|" : ".")).join(""));
    },
  };
  return g;
}

// ---- the dressing ----------------------------------------------------------
const GREEN = "green-metal";
/** A tree: a trunk and a crown of three overlapping blobs, not one ball (one
 *  sphere on a stick read as a lollipop at night). The crown is above your
 *  head: only the trunk stops you. */
const tree = (x, y, s = 1, c) => {
  const turn = Math.round(x * 41 + y * 13) % 360;
  const blob = (dx, dy, k, z, col) => ({ p: "shape-sphere", x: +(x + dx * s).toFixed(2), y: +(y + dy * s).toFixed(2), r: (turn + Math.round(k * 97)) % 360, sx: +(2.1 * k * s).toFixed(2), sy: +(1.7 * k * s).toFixed(2), sz: +(2.1 * k * s).toFixed(2), z: +(z * s).toFixed(2), tex: GREEN, col, solid: false, ...(c ? { c } : {}) });
  return [
    { p: "shape-cylinder", x, y, r: 0, sx: 0.3 * s, sy: 2.6 * s, sz: 0.3 * s, tex: "hotel-dark-wood", col: "#4a3828", ...(c ? { c } : {}) },
    blob(0, 0, 1, 2.3, "#2e5232"),
    blob(0.28, -0.18, 0.78, 2.0, "#3a5e34"),
    blob(-0.24, 0.22, 0.72, 2.6, "#284a2c"),
  ];
};
/** A hedge or fence run along x (r 90) or y (r 0), `len` cells long. */
const hedge = (x, y, len, r = 90, c) => ({ p: "shape-cube", x, y, r, sx: 0.55, sy: 1.0, sz: len * 2, tex: GREEN, col: "#24402a", ...(c ? { c } : {}) });
const fence = (x, y, len, r = 90) => ({ p: "shape-cube", x, y, r, sx: 0.08, sy: 1.1, sz: len * 2, tex: "wood-plank-floor", col: "#d9d2c0" });
/** A parked car: a long box, length along y (r 0) or x (r 90). */
const parked = (x, y, r = 0, c) => [
  { p: "shape-cube", x, y, r, sx: 1.8, sy: 1.0, sz: 4.4, z: 0.25, tex: "worn-red-metal", col: "#5c6470", ...(c ? { c } : {}) },
  { p: "shape-cube", x, y, r, sx: 1.6, sy: 0.55, sz: 2.2, z: 1.25, tex: "black-metal", col: "#1d2126", solid: false, ...(c ? { c } : {}) },
];
/** A mailbox on a post, facing the street (south). */
const mailbox = (x, y) => [
  { p: "shape-cylinder", x, y, r: 0, sx: 0.1, sy: 1.0, sz: 0.1, tex: "black-metal", col: "#2a2a2a", solid: false },
  { p: "shape-cube", x, y, r: 0, sx: 0.28, sy: 0.25, sz: 0.5, z: 1.0, tex: "black-metal", col: "#3b3f45", solid: false },
];
/** A flat path of paving, walk-through. */
const path_ = (x, y, w, l, r = 0) => ({ p: "shape-cube", x, y, r, sx: w * 2, sy: 0.05, sz: Math.min(28, l * 2), tex: "stained-concrete-floor", col: "#9a958c", solid: false });
const sign = (x, y, text, v = 1, r = 0, z = 2.3) => ({ p: "sign-plate", v, x, y, r, z, text });

// the furniture (kit models)
const P = (p, x, y, r = 0, extra = {}) => ({ p, x, y, r, ...extra });

const ROOMS = [
  // ================================================================ SET PIECES
  {
    id: "the-manhole", name: "The Manhole", kind: "manhole", set: "street", role: "start", type: "manhole", min: 1, max: 1, skip: "N",
    note: "You climb out of a manhole into a cul-de-sac. One streetlight works. The houses watch you with their dark windows. Nothing walks in here.",
    map: ["w......w", "........", "........", "........", "w......w", "wwrrrrww", "wwrrrrww", "wwrrrrww"],
    furn: furn(8, 8, [[3, 0, "D"], [6, 1, "*"]]),
    face: [[3, 0, "N"]],
    props: [
      sign(1.4, 4.6, "DEAD END", 2, 0, 2.2),
      ...tree(0.6, 1.0, 0.9),
      ...tree(7.4, 3.2, 1.0),
    ],
  },
  {
    id: "number-9", name: "Number 9", kind: "porch", set: "lot", role: "goal", type: "porch", min: 1, max: 1, skip: "NEW",
    note: "The last house on the street. Its porch light is on. Its front door is the only locked door in the neighbourhood, and it is the way out.",
    map: lotMap(16, 16, [[3, 1, 12, 9, "#"]], "."),
    furn: furn(16, 16, [[7, 10, "F"], [9, 10, "P"]]),
    face: [[7, 10, "N"]],
    props: [
      sign(8.0, 9.98, "9", 3, 0, 2.4),
      path_(7.5, 13, 1, 5.8),
      ...tree(2.0, 13.0, 1.1),
      ...tree(14.0, 12.6, 1.0),
      ...mailbox(5.6, 14.8),
      hedge(8.0, 15.6, 5.4, 90),
      fence(0.15, 8.0, 6, 0),
      fence(15.85, 8.0, 6, 0),
    ],
  },

  // ================================================================ THE STREETS
  // Laid by the grid (worldgen-suburb.ts), never packed. Drawn running
  // west–east: the road down the middle four rows, a sidewalk either side.
  // A piece is chosen by the sides its road runs out of.
  ...[
    ["street", "=", 3, []],
    ["street-lit", "*", 1.3, []],
    ["street-flicker", "~", 0.6, []],
    ["street-car", "=", 0.8, parked(2.5, 2.6, 90)],
    ["street-tree", "=", 1.0, [...tree(5.5, 0.6, 0.9), ...tree(1.5, 7.4, 0.9)]],
  ].map(([id, lamp, weight, extra]) => ({
    id, kind: "straight", set: "street", role: "block", type: "road", weight,
    note: "A suburban street: a road down the middle, a pavement either side, a streetlight that may or may not work.",
    map: [...rows(2, "wwwwwwww"), ...rows(4, "........"), ...rows(2, "wwwwwwww")],
    furn: furn(8, 8, [[1, 1, lamp]]),
    props: [...extra],
  })),
  ...[
    ["street-tee", "=", 1.2],
    ["street-tee-lit", "*", 1.0],
  ].map(([id, lamp, weight]) => ({
    id, kind: "tee", set: "street", role: "block", type: "road", weight,
    note: "Where a side street meets the road.",
    map: [...rows(2, "wwwwwwww"), ...rows(4, "........"), ...rows(2, "ww....ww")],
    furn: furn(8, 8, [[1, 6, lamp]]),
    props: [sign(6.6, 1.4, "MAPLE AVE", 1, 0, 2.3)],
  })),
  ...[
    ["crossing", "*", 1.2],
    ["crossing-dead", "=", 1.0],
  ].map(([id, lamp, weight]) => ({
    id, kind: "cross", set: "street", role: "block", type: "road", weight,
    note: "A crossroads. Four ways, all of them the same.",
    map: [...rows(2, "ww....ww"), ...rows(4, "........"), ...rows(2, "ww....ww")],
    furn: furn(8, 8, [[1, 1, lamp]]),
    props: [sign(6.6, 1.4, "ELM ST", 1, 0, 2.3), sign(1.4, 6.6, "STOP", 4, 180, 2.0)],
  })),

  // ================================================================ THE HOUSES
  {
    id: "house-colonial", kind: "house", set: "lot", role: "block", type: "house", weight: 3,
    note: "A two-up two-down family house. The door's unlocked. The table's laid for a dinner nobody ate.",
    map: lotMap(16, 16, [[2, 2, 13, 10]]),
    walls: wallGrid(16, 16)
      .box(2, 2, 13, 10, [["S", 7], ["N", 4]])
      .vwall(8, 2, 10, [4, 8])
      .hwall(6, 2, 7, [4])
      .hwall(6, 9, 13, [11])
      .rows(),
    furn: furn(16, 16, [[8, 11, "p"], [3, 3, "K"], [12, 9, "K"]]),
    props: [
      // kitchen (north-west)
      P("old-table", 5.0, 4.0, 0), P("wood-chair", 5.0, 3.3, 180), P("wood-chair", 5.0, 4.7, 0),
      P("low-cabinet", 6.6, 2.35, 0),
      // living room (south-west), the front door at its south wall
      P("sofa", 4.0, 10.5, 180), P("armchair-90s", 2.6, 7.6, 90), P("persian-rug", 4.5, 8.6, 0),
      P("score-tv", 4.0, 6.25, 0, { z: 0.9 }),
      // bedroom (north-east)
      P("bed-double", 11.5, 3.0, 0), P("wardrobe", 13.55, 4.6, 270), P("bedside-table", 9.6, 2.5, 0),
      // den (south-east)
      P("bookshelf-dusty", 13.6, 8.5, 270), P("armchair-old", 10.6, 8.0, 90), P("floor-lamp", 9.5, 10.4, 0),
      // outside
      path_(7.5, 13, 1, 5.8),
      ...tree(2.2, 13.2), ...tree(13.6, 13.4, 0.9),
      ...mailbox(9.6, 14.8),
      ...parked(13.0, 6.5, 0, 40),
      fence(0.15, 8.0, 6, 0), fence(15.85, 8.0, 6, 0), fence(8.0, 0.15, 6, 90),
    ],
  },
  {
    id: "house-ranch", kind: "house", set: "lot", role: "block", type: "house", weight: 2.4,
    note: "A long low house with the garage built on. The television is on with no picture.",
    map: lotMap(16, 16, [[1, 3, 10, 10], [11, 3, 14, 10, "g"]]),
    walls: wallGrid(16, 16)
      .box(1, 3, 14, 10, [["S", 5], ["S", 12], ["S", 13], ["N", 3]])
      .vwall(11, 3, 10, [7])
      .vwall(7, 3, 10, [5, 9])
      .hwall(7, 1, 6, [3])
      .rows(),
    furn: furn(16, 16, [[6, 11, "p"], [2, 4, "K"], [9, 9, "K"], [13, 5, "K"]]),
    props: [
      // living room (south-west)
      P("chesterfield-sofa", 3.5, 10.5, 180), P("score-tv", 3.5, 7.3, 0, { z: 0.9 }), P("floor-lamp", 1.5, 10.4, 0),
      // kitchen (north-west)
      P("plain-table", 4.5, 4.6, 0), P("wood-chair", 3.8, 4.6, 90), P("wood-chair", 5.2, 4.6, 270),
      // bedroom (east of the hall)
      P("bed-double", 9.0, 4.2, 0), P("dresser-tall", 10.55, 7.0, 270),
      // garage
      ...parked(12.6, 6.2, 0), P("workbench-pegboard", 14.55, 4.0, 270), P("tyre-stack", 14.2, 9.6, 0),
      // outside
      path_(5.5, 13, 1, 5.8), path_(12.5, 13, 2, 5.8),
      ...tree(2.0, 13.4), ...tree(9.0, 1.2, 0.9),
      ...mailbox(7.6, 14.8),
      fence(0.15, 8.0, 6, 0), fence(15.85, 8.0, 6, 0),
    ],
  },
  {
    id: "house-small", kind: "house", set: "lot", role: "block", type: "house", weight: 1.6, max: 22,
    note: "A narrow house on a narrow lot. Shoes by the door, a coat on the hook, nobody home.",
    map: lotMap(8, 16, [[1, 2, 6, 10]]),
    walls: wallGrid(8, 16)
      .box(1, 2, 6, 10, [["S", 3], ["N", 5]])
      .hwall(6, 1, 6, [2])
      .vwall(4, 2, 5, [4])
      .rows(),
    furn: furn(8, 16, [[3, 12, "p"], [5, 3, "K"], [2, 9, "K"]]),
    props: [
      P("sofa", 4.5, 10.5, 180), P("armchair-old", 1.6, 7.6, 90),
      P("bed-double", 2.5, 3.0, 0), P("wardrobe", 6.55, 4.2, 270),
      path_(3.5, 13, 1, 5.8),
      ...tree(6.2, 13.6, 0.9),
      ...mailbox(5.6, 14.8),
    ],
  },
  {
    id: "garage-lot", kind: "garage", set: "lot", role: "block", type: "garage", weight: 1.6, min: 4, max: 12,
    note: "A detached garage, its roller door up. Oil on the floor and a car under a sheet.",
    map: lotMap(8, 8, [[1, 1, 6, 4]]),
    walls: wallGrid(8, 8).box(1, 1, 6, 4, [["S", 3], ["S", 4]]).rows(),
    furn: furn(8, 8, [[2, 2, "K"], [7, 6, "="]]),
    props: [...parked(4.2, 2.6, 90), P("tyre-pair", 1.6, 4.2, 0), P("jerry-can", 6.2, 1.6, 0)],
  },
  {
    id: "yard-empty", kind: "yard", set: "lot", role: "block", type: "yard", weight: 1.4, min: 3, max: 12,
    note: "An empty lot gone to long grass. A FOR SALE sign that's been there for years.",
    map: rows(8, "........"),
    furn: furn(8, 8, [[6, 1, "="]]),
    props: [sign(2.0, 6.4, "FOR SALE", 3, 0, 1.2), ...tree(5.6, 5.6, 1.1), hedge(1.0, 0.4, 2, 90)],
  },
  {
    id: "yard-shed", kind: "yard", set: "lot", role: "block", type: "yard", weight: 1.4, min: 3, max: 10,
    note: "A back garden with a shed. The shed door is open. There's a deckchair facing nothing.",
    map: lotMap(8, 8, [[4, 1, 6, 3, "g"]], "."),
    walls: wallGrid(8, 8).box(4, 1, 6, 3, [["S", 5]]).rows(),
    furn: furn(8, 8, [[5, 2, "K"]]),
    props: [P("wood-chair", 2.0, 5.5, 45), ...tree(1.4, 1.6, 0.9), fence(4.0, 7.85, 3, 90)],
  },

  // ================================================================ THE PARK
  {
    id: "park", name: "Juniper Park", kind: "park", set: "lot", role: "block", type: "park", weight: 0.8, min: 1, max: 2,
    note: "A little park: a lamp in the middle, benches, a playground. The swings move a little. There's no wind.",
    map: rows(16, "................"),
    furn: furn(16, 16, [[7, 7, "*"], [2, 13, "="], [13, 2, "~"]]),
    props: [
      path_(8.0, 8.0, 1, 16, 90), path_(8.0, 8.0, 1, 16, 0),
      P("bench-seat", 5.6, 8.9, 0), P("bench-seat", 10.4, 7.1, 180),
      // the swings
      { p: "shape-cylinder", x: 3.0, y: 3.0, r: 0, sx: 0.12, sy: 2.4, sz: 0.12, tex: "black-metal", col: "#5a3a2a" },
      { p: "shape-cylinder", x: 5.0, y: 3.0, r: 0, sx: 0.12, sy: 2.4, sz: 0.12, tex: "black-metal", col: "#5a3a2a" },
      { p: "shape-cube", x: 4.0, y: 3.0, r: 90, sx: 0.12, sy: 0.12, sz: 4.2, z: 2.35, tex: "black-metal", col: "#5a3a2a", solid: false },
      { p: "shape-cube", x: 3.6, y: 3.0, r: 90, sx: 0.4, sy: 0.05, sz: 0.2, z: 0.55, tex: "black-metal", col: "#222222", solid: false },
      { p: "shape-cube", x: 4.4, y: 3.0, r: 90, sx: 0.4, sy: 0.05, sz: 0.2, z: 0.55, tex: "black-metal", col: "#222222", solid: false },
      // the slide
      { p: "shape-wedge", x: 12.0, y: 12.0, r: 90, sx: 0.8, sy: 1.6, sz: 3.2, tex: "worn-red-metal", col: "#b34a3a" },
      ...tree(1.6, 9.0, 1.2), ...tree(14.2, 6.0, 1.1), ...tree(9.5, 14.2, 1.0),
    ],
  },
  {
    id: "playground", kind: "park", set: "lot", role: "block", type: "park", weight: 1.0, min: 1, max: 3,
    note: "A corner playground: a roundabout and a sandpit. Small footprints in the sand go round and round.",
    map: rows(8, "........"),
    furn: furn(8, 8, [[1, 6, "~"]]),
    props: [
      { p: "shape-cylinder", x: 4.0, y: 4.0, r: 0, sx: 2.4, sy: 0.18, sz: 2.4, z: 0.3, tex: "worn-red-metal", col: "#3c6aa8" },
      { p: "shape-cube", x: 6.0, y: 1.8, r: 0, sx: 2.4, sy: 0.2, sz: 2.4, tex: "stained-concrete-floor", col: "#c9b48a", solid: false },
      ...tree(1.4, 1.4, 1.0),
    ],
  },
];

const out = [];
let bad = 0;
for (const r of ROOMS) {
  const def = { ...r, doors: r.doors ?? slotsWhereOpen(r.map, r.skip) };
  delete def.skip;
  const l = lintSuburbTile(def);
  for (const e of l.errors) console.log(`✗ ${r.id}: ${e}`);
  for (const w of l.warnings) console.log(`  ${r.id}: ${w}`);
  if (l.errors.length) bad++;
  out.push(def);
}
writeFileSync(path.join(ROOT, "src", "backrooms", "suburb-rooms.json"), formatLibrary(out));
console.log(`${out.length} rooms → src/backrooms/suburb-rooms.json${bad ? `  (${bad} with errors)` : ""}`);
process.exit(bad ? 1 : 0);
