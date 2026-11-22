// THALASSOPHOBIA's first block library (Level 7, Oct 2026) — written once,
// then edited in the map editor like every other level's (Admin Panel → Map
// editor). Each block is drawn here cell by cell from rectangles; this script
// writes src/backrooms/ocean-rooms.json in the editor's own layout
// (formatLibrary).
//
//   npm run build && node scripts/ocean-library.mjs
//
// Legend (ocean-tiles.ts): the block's own type is '.', other types by their
// zone letter — t the tower · r a dry roof · w a wading roof · s a sunk roof ·
// c a drowned street · p the sunken plaza · d the deep · and '#' a building
// rising into the fog. Heights (steps of 0.5m): roofs 1-2 above the water,
// wading roofs a step or two under, sunk ones 4-10 under; the water types
// take their depth from the zone. Furniture: D the hatch · U the subway stair ·
// K a Diving Helmet spot · * a lit caged bulkhead (the tower only).
//
// Prop placement (kit.ts): x/y in CELLS from the block's corner, r = yaw in
// degrees clockwise from facing SOUTH, z = metres off the floor.
import { createRequire } from "node:module";
import { writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(path.join(ROOT, "package.json"));
const { formatLibrary, encodeH } = require(path.join(ROOT, "dist", "backrooms", "tiles.js"));
const { lintOceanTile } = require(path.join(ROOT, "dist", "backrooms", "ocean-tiles.js"));

/** A block painted from rectangles: [x0, y0, x1, y1, glyph, height]. */
function paint(w, h, base, rects) {
  const map = Array.from({ length: h }, () => Array(w).fill(base));
  const hgt = Array.from({ length: h }, () => Array(w).fill("."));
  for (const [x0, y0, x1, y1, ch, ht = 0] of rects)
    for (let y = y0; y <= y1; y++)
      for (let x = x0; x <= x1; x++) {
        map[y][x] = ch;
        hgt[y][x] = ht ? encodeH(ht) : ".";
      }
  return { map: map.map((r) => r.join("")), height: hgt.map((r) => r.join("")) };
}
/** A block's streets open to its neighbours: a 2-wide water doorway in the
 *  middle of every module side (cells 4-5). */
function edgeDoors(w, h) {
  const out = [];
  for (let m = 0; m * 10 < w; m++) out.push([m * 10 + 4, 0, "N", 2], [m * 10 + 4, h - 1, "S", 2]);
  for (let m = 0; m * 10 < h; m++) out.push([0, m * 10 + 4, "W", 2], [w - 1, m * 10 + 4, "E", 2]);
  return out;
}
function furn(w, h, pieces) {
  const g = Array.from({ length: h }, () => Array(w).fill("."));
  for (const [x, y, ch] of pieces) g[y][x] = ch;
  return g.map((r) => r.join(""));
}
const BLOCKS = [
  // ================================================================ SET PIECES
  (() => {
    // THE TOWER: the top floor of a half-sunk office block, a metre above the
    // water. You come up the hatch from Lights Out against its service core;
    // doorways open south and east onto a roof terrace, and past it the city.
    const p = paint(20, 20, ".", [
      [3, 3, 16, 16, "r", 1],
      [5, 5, 14, 14, "t", 2],
      [9, 9, 10, 10, "#"],
      [5, 5, 5, 5, "#"],
      [14, 5, 14, 5, "#"],
      [5, 14, 5, 14, "#"],
      [14, 14, 14, 14, "#"],
    ]);
    return {
      id: "the-tower", name: "The Tower", kind: "seatower", set: "city", role: "start", type: "seacanal", min: 1, max: 1,
      note: "You come up through the hatch onto the top floor of a sunken office tower — the only dry rooms there are. Outside, grey water to the fog, and the roofs of a drowned city.",
      ...p,
      rooms: p.map.map((r) => [...r].map((ch) => (ch === "t" ? "a" : "b")).join("")),
      roomKinds: { b: "seacanal" },
      furn: furn(20, 20, [[9, 11, "D"], [7, 7, "*"], [12, 7, "*"], [7, 12, "*"], [12, 12, "*"]]),
      face: [[9, 11, "N"]],
      inner: [[9, 14, "S", 2], [14, 9, "E", 2]],
      doors: [],
      props: [
        { p: "wood-crate", x: 6.0, y: 6.2, r: 10 },
        { p: "cardboard-box", x: 13.2, y: 6.4, r: 40, c: 70 },
        { p: "plastic-bin", x: 6.4, y: 13.4, r: 0, c: 60 },
        { p: "rusty-shelving", x: 12.6, y: 13.5, r: 0, c: 70 },
        { p: "oil-drum", x: 4.0, y: 16.0, r: 0, c: 60 },
        { p: "wood-pallet", x: 16.0, y: 4.0, r: 25, c: 50 },
      ],
    };
  })(),
  (() => {
    // THE SUNKEN PLAZA: a square that sank further than the streets round it —
    // 24m to its floor. The subway stair is against the kiosk at its north
    // side. One breath cannot reach it; the helmet can.
    const p = paint(20, 20, ".", [
      [5, 5, 14, 14, "p"],
      [9, 6, 10, 6, "#"],
      [0, 0, 2, 2, "r", 1],
      [17, 0, 19, 2, "r", 1],
      [0, 17, 2, 19, "w", -1],
      [17, 17, 19, 19, "s", -6],
    ]);
    return {
      id: "the-sunken-plaza", name: "The Sunken Plaza", kind: "seaplaza", set: "city", role: "goal", type: "seacanal", min: 1, max: 1,
      note: "Below the streets the square drops away into black. At the bottom, against the old ticket kiosk, a stair goes on down: the subway, and the way to the next level. Take the helmet.",
      ...p,
      furn: furn(20, 20, [[9, 7, "U"]]),
      face: [[9, 7, "N"]],
      doors: [],
      props: [
        { p: "broken-pillar", x: 6.0, y: 13.0, r: 30, c: 70 },
        { p: "rubble-pile", x: 12.5, y: 12.0, r: 60, c: 70 },
        { p: "broken-wall-slab", x: 7.0, y: 6.0, r: 0, c: 60 },
      ],
    };
  })(),

  // ================================================================ THE CITY
  {
    id: "flat-roof", kind: "searoof", set: "city", role: "block", type: "seacanal", weight: 1.5,
    note: "A flat roof standing a step out of the water. You can climb onto it from a swim.",
    ...paint(10, 10, ".", [[2, 2, 7, 7, "r", 1]]),
    furn: furn(10, 10, [[5, 5, "K"]]),
    doors: [],
    props: [
      { p: "wood-crate", x: 3.0, y: 3.0, r: 20, c: 60 },
      { p: "water-barrel", x: 7.0, y: 7.0, r: 0, c: 40 },
    ],
  },
  {
    id: "roof-hut", kind: "searoof", set: "city", role: "block", type: "seacanal", weight: 1.1,
    note: "A roof with its stair hut still standing, the door rusted shut.",
    ...paint(10, 10, ".", [[2, 2, 7, 7, "r", 1], [5, 5, 6, 6, "#"]]),
    furn: furn(10, 10, [[3, 3, "K"]]),
    doors: [],
    props: [{ p: "hazard-drum", x: 3.2, y: 6.4, r: 0, c: 50 }],
  },
  {
    id: "skyscraper", name: "A Tower Into the Fog", kind: "searoof", set: "city", role: "block", type: "seacanal", weight: 1.0, min: 4, max: 10,
    note: "A building that never stopped going up — its top is lost in the fog. A ledge runs round its foot just out of the water.",
    ...paint(10, 10, ".", [[2, 2, 7, 7, "r", 1], [3, 3, 6, 6, "#"]]),
    furn: furn(10, 10, [[2, 2, "K"]]),
    doors: [],
  },
  {
    id: "wading-roof", kind: "seawade", set: "city", role: "block", type: "seacanal", weight: 1.1,
    note: "A roof just under the surface: you can wade across it, the water at your knees.",
    ...paint(10, 10, ".", [[2, 2, 7, 7, "w", -1], [4, 4, 5, 5, "r", 1]]),
    furn: furn(10, 10, [[4, 4, "K"]]),
    doors: [],
  },
  {
    id: "sunk-roof", kind: "seasunk", set: "city", role: "block", type: "seacanal", weight: 1.1,
    note: "A roof three metres under: you swim over it, its edge a pale line below you.",
    ...paint(10, 10, ".", [[2, 2, 7, 7, "s", -6]]),
    doors: [],
    props: [{ p: "broken-pillar-stump", x: 4.0, y: 4.0, r: 0, c: 60 }],
  },
  {
    id: "deep-roof", kind: "seasunk", set: "city", role: "block", type: "seacanal", weight: 0.9,
    note: "A building that sank deeper than the rest — its roof five metres down, a chimney standing out of the water.",
    ...paint(10, 10, ".", [[1, 1, 8, 8, "s", -10], [6, 3, 6, 3, "#"]]),
    doors: [],
  },
  {
    id: "open-square", kind: "seacanal", set: "city", role: "block", type: "seacanal", weight: 0.8,
    note: "Where a square used to be: open water, six metres deep.",
    ...paint(10, 10, ".", []),
    doors: [],
  },
  {
    id: "twin-roofs", kind: "searoof", set: "city", role: "block", type: "seacanal", weight: 1.2,
    note: "Two narrow roofs with a street between them.",
    ...paint(10, 10, ".", [[1, 2, 3, 7, "r", 1], [6, 2, 8, 7, "r", 1]]),
    furn: furn(10, 10, [[2, 4, "K"]]),
    doors: [],
    props: [{ p: "wood-pallet", x: 7.0, y: 3.0, r: 0, c: 50 }],
  },
  {
    id: "ruin", kind: "seasunk", set: "city", role: "block", type: "seacanal", weight: 0.9,
    note: "A building broken open: two walls still standing out of the water, the floor inside sunk two metres.",
    ...paint(10, 10, ".", [[2, 2, 7, 7, "s", -4], [2, 2, 7, 2, "#"], [2, 3, 2, 7, "#"]]),
    doors: [],
    props: [{ p: "rubble-pile", x: 5.5, y: 5.5, r: 30, c: 60 }],
  },
  {
    id: "low-roofs", kind: "searoof", set: "city", role: "block", type: "seacanal", weight: 1.0,
    note: "A cluster of low roofs, some out of the water, some just under it.",
    ...paint(10, 10, ".", [[1, 1, 4, 4, "r", 1], [5, 1, 8, 4, "w", -2], [1, 5, 4, 8, "w", -1], [5, 5, 8, 8, "r", 1]]),
    furn: furn(10, 10, [[6, 6, "K"]]),
    doors: [],
  },

  // ================================================================ THE DROP
  {
    id: "the-deep", kind: "seadrop", set: "drop", role: "block", type: "seadrop", weight: 3.0,
    note: "Past the city's edge the bottom drops away. You can't see it, and something down there can see you.",
    ...paint(10, 10, ".", []),
    doors: [],
  },
  {
    id: "lone-spire", name: "A Lone Spire", kind: "seadrop", set: "drop", role: "block", type: "seadrop", weight: 0.6, max: 8,
    note: "A single building standing up out of the deep, a ledge round its foot — somewhere to get out of the water.",
    ...paint(10, 10, ".", [[3, 3, 6, 6, "r", 1], [4, 4, 5, 5, "#"]]),
    doors: [],
  },
];

const out = [];
let bad = 0;
for (const b of BLOCKS) {
  const def = { ...b, doors: b.doors?.length ? b.doors : edgeDoors(b.map[0].length, b.map.length) };
  const l = lintOceanTile(def);
  for (const e of l.errors) console.log(`✗ ${def.id}: ${e}`);
  for (const w of l.warnings) console.log(`  ${def.id}: ${w}`);
  if (l.errors.length) bad++;
  out.push(def);
}
writeFileSync(path.join(ROOT, "src", "backrooms", "ocean-rooms.json"), formatLibrary(out));
console.log(`${out.length} blocks → src/backrooms/ocean-rooms.json${bad ? `  (${bad} with errors)` : ""}`);
process.exit(bad ? 1 : 0);
