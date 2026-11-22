// LIGHTS OUT's first room library (Level 6, Oct 2026) — written once, then
// edited in the map editor like every other level's (Admin Panel → Map
// editor). Each room is drawn here in full, cell by cell; this script adds the
// doorway slots and furnishes the rooms from the prop kit, then writes
// src/backrooms/lights-rooms.json in the editor's own layout (formatLibrary).
//
//   npm run build && node scripts/lights-library.mjs
//
// Legend (lights-tiles.ts): '.' floor · '#' solid · furniture: D the stair ·
// H the sea hatch · K a Handwheel spot · B a battery spot · * a dead caged
// bulkhead · = a dead fluorescent batten. Rooms are 8-cell modules; the slots
// sit at cells 3-4 of every module side.
//
// Prop placement (kit.ts): x/y in CELLS from the room's corner, r = yaw in
// degrees clockwise from facing SOUTH (0 south, 90 west, 180 north, 270 east),
// z = metres off the floor. A wall prop backs on to its wall.
//
// The references (docs/backrooms/REFERENCES.md → Level 6): grey concrete in
// the dark, bare doorways, rubble floors, pipes along the walls, dead tubes on
// the ceiling, a little abandoned clutter (a table, a shelf, a bin, boards),
// wet floors in the worst of it. No valve wheels as dressing: down here the
// one wheel that matters is the Handwheel.
import { createRequire } from "node:module";
import { writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(path.join(ROOT, "package.json"));
const { formatLibrary } = require(path.join(ROOT, "dist", "backrooms", "tiles.js"));
const { lintLightsTile } = require(path.join(ROOT, "dist", "backrooms", "lights-tiles.js"));

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
function lamps(w, h, step = 4, at = 2, map = null, ch = "*") {
  const out = [];
  for (let y = at; y < h; y += step) for (let x = at; x < w; x += step) if (!map || map[y][x] !== "#") out.push([x, y, ch]);
  return out;
}
/** Thin walls from lists of cells: north edges and west edges. */
function walls(w, h, north, west) {
  const key = (x, y) => `${x},${y}`;
  const N = new Set(north.map(([x, y]) => key(x, y)));
  const Wv = new Set(west.map(([x, y]) => key(x, y)));
  return Array.from({ length: h }, (_, y) =>
    Array.from({ length: w }, (_, x) => (N.has(key(x, y)) && Wv.has(key(x, y)) ? "+" : N.has(key(x, y)) ? "-" : Wv.has(key(x, y)) ? "|" : ".")).join(""),
  );
}
const span = (a, b, fixed, horiz) => Array.from({ length: b - a + 1 }, (_, k) => (horiz ? [a + k, fixed] : [fixed, a + k]));

// a pipe run high on a wall (west side of a corridor at x, or east)
const pipesAlong = (x, y0, y1, z = 2.3) => {
  const out = [];
  for (let y = y0; y + 3 <= y1; y += 3) out.push({ p: "pipe-length", x, y: y + 1.5, r: 0, z });
  return out;
};

const ROOMS = [
  // ================================================================ SET PIECES
  {
    id: "the-stair", name: "The Stair", kind: "stairfoot", set: "dark", role: "start", type: "stairfoot", min: 1, max: 1, skip: "N",
    note: "You come down here from the hotel's rusty door: the stair is on the north wall (the map's edge). Nothing that hunts down here comes into this room. Past its doorways, there is no light but yours.",
    map: fill(8, 8),
    furn: furn(8, 8, [[3, 0, "D"], [4, 4, "*"], [2, 6, "B"]]),
    face: [[3, 0, "N"]],
    props: [
      { p: "sign-plate", v: 4, x: 1.4, y: 0.02, r: 0, z: 2.2, text: "LEVEL 6" },
      { p: "riser-pipes", x: 7.4, y: 0.6, r: 0 },
      { p: "oil-drum", x: 0.6, y: 7.3, r: 0 },
      { p: "wood-pallet", x: 6.6, y: 6.8, r: 15 },
    ],
  },
  {
    id: "the-sea-hatch", name: "The Sea Hatch", kind: "seahatch", set: "wet", role: "goal", type: "seahatch", min: 1, max: 1, skip: "S",
    note: "The way on: a watertight steel hatch in the south wall, its wheel gone. Through the steel you can hear the sea. It takes the Handwheel.",
    map: fill(8, 8),
    furn: furn(8, 8, [[3, 7, "H"], [4, 3, "*"]]),
    face: [[3, 7, "S"]],
    props: [
      { p: "duct-pipe-riser", v: 1, x: 0.7, y: 7.2, r: 0 },
      { p: "duct-pipe-riser", v: 1, x: 7.3, y: 7.2, r: 0 },
      { p: "pipe-length", x: 4.0, y: 0.4, r: 90, z: 2.5 },
      { p: "wet-floor-sign", x: 6.4, y: 1.0, r: 30, c: 60 },
    ],
  },

  // ================================================================ THE CORRIDORS
  {
    id: "dark-straight", kind: "darkhall", set: "dark", role: "block", type: "darkhall", weight: 2.4,
    note: "A concrete corridor. The tube on the ceiling hasn't worked in years.",
    map: rows(8, "###..###"),
    furn: furn(8, 8, [[3, 3, "="]]),
    props: [...pipesAlong(3.1, 0, 8)],
  },
  {
    id: "dark-long", kind: "darkhall", set: "dark", role: "block", type: "darkhall", weight: 1.8,
    note: "A long concrete corridor. Your beam doesn't reach the end of it.",
    map: rows(16, "###..###"),
    furn: furn(8, 16, [[3, 3, "="], [4, 11, "="]]),
    props: [...pipesAlong(4.9, 0, 16, 2.4), { p: "plastic-bin", x: 3.35, y: 9.0, r: 0, c: 40 }],
  },
  {
    id: "dark-cross", kind: "darkhall", set: "dark", role: "block", type: "darkhall", weight: 1.8,
    note: "Two corridors crossing. Four ways into the dark.",
    map: ["###..###", "###..###", "###..###", "........", "........", "###..###", "###..###", "###..###"],
    furn: furn(8, 8, [[3, 3, "="]]),
    props: [],
  },
  {
    id: "dark-ell", kind: "darkhall", set: "dark", role: "block", type: "darkhall", weight: 1.3,
    note: "A corridor turning a corner.",
    map: ["###..###", "###..###", "###..###", "###.....", "###.....", "########", "########", "########"],
    furn: furn(8, 8, [[4, 3, "="], [3, 4, "B"]]),
    props: [{ p: "cardboard-box", x: 3.3, y: 4.6, r: 20, c: 70 }],
  },
  {
    id: "dark-tee", kind: "darkhall", set: "dark", role: "block", type: "darkhall", weight: 1.5,
    note: "A side corridor off the main run.",
    map: ["###..###", "###..###", "###..###", "###.....", "###.....", "###..###", "###..###", "###..###"],
    furn: furn(8, 8, [[4, 3, "="]]),
    props: [...pipesAlong(3.1, 0, 3)],
  },
  {
    id: "pipe-run", kind: "piperun", set: "dark", role: "block", type: "piperun", weight: 1.6,
    note: "A low wide passage, pipes down both walls. They tick as they cool, or as something touches them.",
    map: rows(8, "##....##"),
    furn: furn(8, 8, [[3, 3, "*"]]),
    props: [...pipesAlong(2.15, 0, 8, 2.1), ...pipesAlong(5.85, 0, 8, 2.3), { p: "pipe-saddle-rail", x: 2.3, y: 4.0, r: 0, c: 50 }],
  },
  {
    id: "pipe-run-long", kind: "piperun", set: "dark", role: "block", type: "piperun", weight: 1.1,
    note: "A long run of pipes.",
    map: rows(16, "##....##"),
    furn: furn(8, 16, [[3, 3, "*"], [4, 11, "*"]]),
    props: [...pipesAlong(2.15, 0, 16, 2.1), ...pipesAlong(5.85, 0, 16, 2.3), { p: "riser-pipes", x: 2.5, y: 8.0, r: 0, c: 60 }],
  },

  // ================================================================ THE ROOMS
  {
    id: "bare-room", kind: "darkroom", set: "dark", role: "block", type: "darkroom", weight: 1.6,
    note: "A bare concrete room with doorways cut straight through it. Nothing in it but dust.",
    map: fill(8, 8),
    furn: furn(8, 8, [[4, 4, "*"], [1, 6, "K"], [6, 1, "B"]]),
    props: [{ p: "bucket", x: 6.8, y: 6.6, r: 0, c: 50 }, { p: "cardboard-box", x: 0.6, y: 0.7, r: 10, c: 50 }, { p: "broken-pillar-stump", x: 1.4, y: 2.0, r: 0, c: 50 }],
  },
  {
    id: "pillar-hall", name: "The Pillar Hall", kind: "darkroom", set: "dark", role: "block", type: "darkroom", weight: 0.8, max: 4,
    note: "A wide low hall held up on concrete pillars. In a torch beam the pillars look like people standing still.",
    map: [
      "................",
      "................",
      "................",
      "...#...##...#...",
      "................",
      "................",
      "................",
      "...#...##...#...",
      "...#...##...#...",
      "................",
      "................",
      "................",
      "...#...##...#...",
      "................",
      "................",
      "................",
    ],
    furn: furn(16, 16, [...lamps(16, 16, 8, 5, null, "*"), [1, 1, "K"], [14, 14, "B"], [14, 1, "B"]]),
    props: [
      { p: "wood-pallet", x: 1.2, y: 14.2, r: 30, c: 70 },
      { p: "oil-drum", x: 15.4, y: 8.0, r: 0 },
      { p: "hazard-drum-dented", x: 15.4, y: 8.8, r: 40, c: 60 },
      { p: "tyre", x: 9.0, y: 14.6, r: 0, c: 40 },
      { p: "broken-pillar-tall", x: 6.0, y: 10.6, r: 0, c: 70 },
      { p: "broken-pillar", x: 2.0, y: 9.6, r: 25, c: 50 },
      { p: "concrete-shard", x: 10.5, y: 5.5, r: 140, c: 60 },
    ],
  },
  {
    id: "store-room", name: "Store Room", kind: "storeroom", set: "dark", role: "block", type: "storeroom", weight: 1.0, min: 3, max: 8,
    note: "Racks of nothing much: drums, crates, a box of dead batteries. Sometimes not all of them are dead.",
    map: fill(8, 8),
    furn: furn(8, 8, [[4, 4, "*"], [2, 5, "B"], [5, 2, "B"], [5, 5, "K"]]),
    props: [
      { p: "caged-rack", x: 0.45, y: 1.6, r: 270 },
      { p: "caged-rack", x: 7.55, y: 6.4, r: 90 },
      { p: "oil-drum", x: 0.6, y: 6.6, r: 0 },
      { p: "hazard-drum", x: 1.3, y: 7.3, r: 0, c: 60 },
      { p: "wood-crate", x: 7.2, y: 0.8, r: 15 },
      { p: "cardboard-box", x: 6.6, y: 1.0, r: 300, c: 70 },
      { p: "rusty-shelving", x: 7.4, y: 2.0, r: 90, c: 70 },
    ],
  },
  {
    id: "store-long", name: "Store Room", kind: "storeroom", set: "dark", role: "block", type: "storeroom", weight: 0.7, max: 4,
    note: "A long store: pallet racks down one wall, crates on the floor.",
    map: fill(16, 8),
    furn: furn(16, 8, [[4, 4, "*"], [12, 4, "*"], [6, 5, "B"], [13, 2, "B"], [9, 6, "K"]]),
    props: [
      { p: "pallet-rack", x: 8.0, y: 0.6, r: 0 },
      { p: "crate-stack", x: 1.2, y: 6.8, r: 0 },
      { p: "wood-crate", x: 15.2, y: 6.9, r: 25 },
      { p: "water-barrel", x: 14.4, y: 0.7, r: 0, c: 60 },
      { p: "wood-pallet", x: 2.0, y: 1.0, r: 0, c: 70 },
      { p: "rusty-shelving", x: 15.4, y: 2.2, r: 90 },
    ],
  },
  {
    id: "cell-block", name: "The Partitions", kind: "cellblock", set: "dark", role: "block", type: "cellblock", weight: 0.7, max: 4,
    note: "A room cut up by concrete partitions into bays. Every bay looks the same in the dark, and so does the way out.",
    map: fill(16, 16),
    walls: walls(
      16,
      16,
      [...span(1, 2, 6, true), ...span(5, 10, 6, true), ...span(13, 14, 6, true), ...span(1, 2, 10, true), ...span(5, 10, 10, true), ...span(13, 14, 10, true)],
      [...span(1, 5, 6, false), ...span(1, 5, 10, false), ...span(11, 14, 6, false), ...span(11, 14, 10, false)],
    ),
    furn: furn(16, 16, [[8, 3, "*"], [8, 12, "*"], [3, 8, "="], [12, 8, "="], [7, 2, "K"], [1, 13, "B"], [8, 13, "B"]]),
    props: [
      { p: "wood-chair", x: 2.0, y: 2.0, r: 45, c: 50 },
      { p: "plastic-bin", x: 14.4, y: 2.0, r: 0, c: 50 },
      { p: "cardboard-box", x: 14.2, y: 14.2, r: 10, c: 60 },
    ],
  },
  {
    id: "collapsed-room", name: "Fallen Room", kind: "rubble", set: "dark", role: "block", type: "rubble", weight: 0.8, max: 6,
    note: "Half the ceiling came down here. Climb round it.",
    map: ["........", "........", "........", "........", "........", ".....##.", ".....##.", "........"],
    furn: furn(8, 8, [[2, 2, "*"], [1, 6, "K"], [6, 1, "B"]]),
    props: [
      { p: "wood-pallet", x: 6.6, y: 6.6, r: 60, c: 60 },
      { p: "cardboard-box", x: 1.0, y: 1.0, r: 25, c: 50 },
      { p: "rubble-pile", x: 5.3, y: 3.2, r: 30 },
      { p: "broken-pillar-stump", x: 6.6, y: 4.6, r: 0, c: 70 },
      { p: "concrete-shard", x: 4.4, y: 6.6, r: 70, c: 60 },
    ],
  },
  {
    id: "dead-office", name: "Dead Office", kind: "deadoffice", set: "dark", role: "block", type: "deadoffice", weight: 0.8, min: 2, max: 5,
    note: "Somebody worked down here once: a steel table, a chair pushed back, bottles, a shelf of files nobody will read.",
    map: fill(8, 8),
    furn: furn(8, 8, [[4, 4, "="], [5, 6, "K"], [2, 6, "B"]]),
    props: [
      { p: "steel-frame-table", x: 4.0, y: 1.0, r: 0 },
      { p: "wood-chair", x: 4.0, y: 1.9, r: 200 },
      { p: "filing-cabinet", x: 0.45, y: 1.2, r: 270 },
      { p: "caged-rack", x: 7.55, y: 1.6, r: 90 },
      { p: "archive-box", x: 4.4, y: 1.0, r: 10, z: 0.78, c: 70 },
      { p: "wire-bin", x: 0.6, y: 7.3, r: 0, c: 60 },
    ],
  },
  {
    id: "locker-room", name: "Locker Room", kind: "deadoffice", set: "dark", role: "block", type: "deadoffice", weight: 0.6, max: 4,
    note: "Rows of steel lockers, doors hanging open, nothing inside but one battery somebody forgot.",
    map: fill(8, 8),
    furn: furn(8, 8, [[4, 4, "="], [2, 4, "B"], [1, 1, "K"]]),
    props: [
      { p: "locker-bank", x: 7.6, y: 2.0, r: 90 },
      { p: "locker-bank", x: 7.6, y: 6.0, r: 90 },
      { p: "locker-tall", x: 0.4, y: 6.4, r: 270 },
      { p: "wood-chair", x: 3.0, y: 2.5, r: 120, c: 50 },
    ],
  },

  // ================================================================ THE WET END
  {
    id: "wet-straight", kind: "wetway", set: "wet", role: "block", type: "wetway", weight: 2.4,
    note: "Ankle-deep water over concrete. Every step you take, everything down here can hear.",
    map: rows(8, "###..###"),
    furn: furn(8, 8, [[3, 3, "*"]]),
    props: [...pipesAlong(3.1, 0, 8, 2.4)],
  },
  {
    id: "wet-long", kind: "wetway", set: "wet", role: "block", type: "wetway", weight: 1.6,
    note: "A long flooded corridor. Somewhere ahead, the sea.",
    map: rows(16, "###..###"),
    furn: furn(8, 16, [[3, 3, "*"], [4, 11, "*"]]),
    props: [...pipesAlong(4.9, 0, 16, 2.4)],
  },
  {
    id: "wet-cross", kind: "wetway", set: "wet", role: "block", type: "wetway", weight: 1.8,
    note: "Two flooded corridors crossing.",
    map: ["###..###", "###..###", "###..###", "........", "........", "###..###", "###..###", "###..###"],
    furn: furn(8, 8, [[3, 3, "*"]]),
    props: [],
  },
  {
    id: "wet-ell", kind: "wetway", set: "wet", role: "block", type: "wetway", weight: 1.3,
    note: "A flooded corridor turning a corner.",
    map: ["###..###", "###..###", "###..###", "###.....", "###.....", "########", "########", "########"],
    furn: furn(8, 8, [[4, 3, "*"]]),
    props: [],
  },
  {
    id: "wet-room", kind: "wetway", set: "wet", role: "block", type: "wetway", weight: 1.2,
    note: "A flooded room, a drum floating against the wall.",
    map: fill(8, 8),
    furn: furn(8, 8, [[4, 4, "*"]]),
    props: [{ p: "oil-drum", x: 0.7, y: 0.7, r: 0, c: 70 }, { p: "riser-pipes", x: 7.4, y: 7.4, r: 0 }],
  },
  {
    id: "cistern", name: "The Cistern", kind: "cistern", set: "wet", role: "block", type: "cistern", weight: 0.9, min: 1, max: 3,
    note: "A tall flooded hall on square columns. The water carries every sound to the far wall and back.",
    map: [
      "................",
      "................",
      "................",
      "...##......##...",
      "...##......##...",
      "................",
      "................",
      "................",
      "................",
      "................",
      "................",
      "...##......##...",
      "...##......##...",
      "................",
      "................",
      "................",
    ],
    furn: furn(16, 16, [[8, 8, "*"], [1, 1, "*"], [14, 14, "*"]]),
    props: [
      { p: "duct-pipe-riser", v: 1, x: 0.7, y: 15.3, r: 0 },
      { p: "duct-pipe-riser", v: 2, x: 15.3, y: 0.7, r: 0 },
      { p: "pipe-length", x: 8.0, y: 0.4, r: 90, z: 3.6 },
      { p: "pipe-length", x: 8.0, y: 15.6, r: 90, z: 3.6 },
    ],
  },
  {
    id: "pump-hall", name: "Pump Hall", kind: "cistern", set: "wet", role: "block", type: "cistern", weight: 0.8, max: 3,
    note: "Dead pumps standing in the water, their pipes going down into the floor.",
    map: fill(16, 8),
    furn: furn(16, 8, [[4, 4, "*"], [12, 4, "*"]]),
    props: [
      { p: "electrical-cabinet", x: 15.6, y: 1.5, r: 90 },
      { p: "duct-pipe-elbow", x: 1.0, y: 1.0, r: 0 },
      { p: "riser-pipes", x: 7.5, y: 0.6, r: 0 },
      { p: "riser-pipes", x: 8.5, y: 7.4, r: 0 },
    ],
  },
];

const out = [];
let bad = 0;
for (const r of ROOMS) {
  const def = { ...r, doors: r.doors ?? slotsWhereOpen(r.map, r.skip) };
  delete def.skip;
  const l = lintLightsTile(def);
  for (const e of l.errors) console.log(`✗ ${r.id}: ${e}`);
  for (const w of l.warnings) console.log(`  ${r.id}: ${w}`);
  if (l.errors.length) bad++;
  out.push(def);
}
writeFileSync(path.join(ROOT, "src", "backrooms", "lights-rooms.json"), formatLibrary(out));
console.log(`${out.length} rooms → src/backrooms/lights-rooms.json${bad ? `  (${bad} with errors)` : ""}`);
process.exit(bad ? 1 : 0);
