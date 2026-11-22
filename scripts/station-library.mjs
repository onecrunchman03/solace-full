// THE ELECTRICAL STATION's first room library (Level 3, Oct 2026) — written
// once, then edited in the map editor like every other level's (Admin Panel →
// Map editor). Each room is drawn here in full, cell by cell; this script only
// adds the doorway slots every module side carries, then writes
// src/backrooms/station-rooms.json in the editor's own layout (formatLibrary).
//
//   npm run build && node scripts/station-library.mjs
//
// Legend (station-tiles.ts): '.' floor · '#' solid · furniture: D the pressure
// door · X the lift shutter · B a breaker · A an arcing panel · w live water ·
// * a lamp. Rooms are 8-cell modules; the slots sit at cells 3-4 of every
// module side.
import { createRequire } from "node:module";
import { writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(path.join(ROOT, "package.json"));
const { formatLibrary } = require(path.join(ROOT, "dist", "backrooms", "tiles.js"));
const { lintStationTile } = require(path.join(ROOT, "dist", "backrooms", "station-tiles.js"));

const M = 8;
/** Every slot on every module side — the generator opens the ones it needs.
 *  `skip` names sides to leave shut ("N", "E", "S", "W"). */
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
/** Doorways only where the map's corridor actually reaches the rim. */
function slotsWhereOpen(map) {
  const h = map.length, w = map[0].length;
  return slots(w, h).filter(([x, y, side]) => {
    const lanes = side === "N" || side === "S" ? [[x, y], [x + 1, y]] : [[x, y], [x, y + 1]];
    return lanes.every(([lx, ly]) => map[ly][lx] !== "#");
  });
}
const fill = (w, h, ch = ".") => Array.from({ length: h }, () => ch.repeat(w));
/** h copies of one row */
const rows = (h, row) => Array.from({ length: h }, () => row);

const ROOMS = [
  // ================================================================ SET PIECES
  {
    id: "the-intake-hall", name: "The Intake Hall", kind: "intake", set: "any", role: "start", type: "intake", min: 1, max: 1,
    note: "You arrive here from Pipe Dreams, through the pressure door on its north wall (the map's edge).",
    map: fill(16, 16),
    furn: [
      ".......D........",
      "................",
      "................",
      "...*........*...",
      "................",
      "................",
      ".......*........",
      "................",
      "................",
      "................",
      "................",
      "................",
      "...*........*...",
      "................",
      "................",
      "................",
    ],
    face: [[7, 0, "N"]],
    props: [
      { p: "utility-box", v: 1, x: 1.5, y: 0.35, r: 0 },
      { p: "wet-floor-sign-aframe", x: 10.5, y: 2.5, r: 20 },
      { p: "electrical-cabinet", x: 14.6, y: 6.0, r: 270 },
    ],
  },
  {
    id: "the-lift-hall", name: "The Lift Hall", kind: "lifthall", set: "any", role: "goal", min: 1, max: 1,
    type: "lifthall",
    note: "The way on to Level 4: the lift shutter on its south wall opens when all six breakers are on.",
    map: fill(16, 16),
    furn: [
      "................",
      "................",
      "................",
      "...*........*...",
      "................",
      "................",
      "................",
      "...............A",
      "................",
      "................",
      "................",
      "................",
      "...*....*...*...",
      "................",
      "................",
      ".......X........",
    ],
    face: [[7, 15, "S"], [15, 7, "E"]],
    props: [
      { p: "station-transformer", x: 3.0, y: 7.5, r: 0 },
      { p: "switchgear-low", x: 14.6, y: 0.4, r: 90 },
    ],
  },

  // ================================================================ BREAKERS
  {
    id: "switch-room", name: "Switch Room", kind: "switchroom", set: "any", role: "breaker", type: "switchroom", weight: 1,
    note: "A section's breaker, on the east wall. The arcing panel by the west door keeps you honest.",
    map: fill(8, 8),
    furn: [
      "........",
      "........",
      "..*.....",
      "........",
      ".....*..",
      "..w.....",
      "Aww..*.B",
      "........",
    ],
    face: [[7, 6, "E"], [0, 6, "W"]],
    props: [
      { p: "switchgear-low", x: 1.5, y: 0.4, r: 90 },
      { p: "switchgear-low", x: 5.6, y: 0.4, r: 90 },
    ],
  },
  {
    id: "switch-room-flooded", name: "Flooded Switch Room", kind: "switchroom", set: "any", role: "breaker", type: "switchroom", weight: 1,
    note: "The breaker sits beyond a band of live water — come in from the north, or cut the section first.",
    map: fill(8, 16),
    furn: [
      "......B.",
      "........",
      "..*.....",
      "........",
      ".....*..",
      "........",
      "........",
      "wwwwwwww",
      "wwwwwwww",
      ".......A",
      "........",
      "..*.....",
      "........",
      ".....*..",
      "........",
      "........",
    ],
    face: [[6, 0, "N"], [7, 9, "E"]],
    props: [
      { p: "switchgear-low", x: 0.4, y: 5.5, r: 0 },
      { p: "wet-floor-sign-aframe", x: 5.5, y: 10.6, r: 160 },
    ],
  },
  {
    id: "main-switch-room", name: "Main Switch Room", kind: "switchroom", set: "any", role: "breaker", type: "switchroom", weight: 0.6,
    note: "Two rows of switchgear, the breaker on the north wall between the doors.",
    map: fill(16, 16),
    furn: [
      ".......B........",
      "................",
      "................",
      "...*........*...",
      "................",
      "................",
      "................",
      "A..............A",
      "................",
      "................",
      "......ww........",
      "......www.......",
      "...*........*...",
      "................",
      "................",
      "................",
    ],
    face: [[7, 0, "N"], [0, 7, "W"], [15, 7, "E"]],
    props: [
      { p: "switchgear-low", x: 3.5, y: 5.5, r: 90 },
      { p: "switchgear-low", x: 6.5, y: 5.5, r: 90 },
      { p: "switchgear-low", x: 9.5, y: 5.5, r: 90 },
      { p: "switchgear-low", x: 12.5, y: 5.5, r: 90 },
      { p: "switchgear-low", x: 3.5, y: 9.5, r: 90 },
      { p: "switchgear-low", x: 12.5, y: 9.5, r: 90 },
    ],
  },

  // ================================================================ SERVICEWAYS
  {
    id: "service-cross", kind: "serviceway", set: "any", role: "block", type: "serviceway", weight: 2.4,
    note: "A crossing of the tight service corridors.",
    map: ["###..###", "###..###", "###..###", "........", "........", "###..###", "###..###", "###..###"],
    furn: ["........", "....*...", "........", ".*......", "......*.", "........", "...*....", "........"],
  },
  {
    id: "service-cross-live", kind: "serviceway", set: "any", role: "block", type: "serviceway", weight: 1,
    note: "A crossing with a live panel in its south arm — time your walk past it.",
    map: ["###..###", "###..###", "###..###", "........", "........", "###..###", "###..###", "###..###"],
    furn: ["........", "....*...", "........", ".*......", "......*.", "....A...", "........", "........"],
    face: [[4, 5, "E"]],
  },
  {
    id: "service-straight", kind: "serviceway", set: "any", role: "block", type: "serviceway", weight: 2,
    note: "A straight run of service corridor.",
    map: rows(8, "###..###"),
    furn: ["........", "........", "...*....", "........", "........", "....*...", "........", "........"],
  },
  {
    id: "service-straight-live", kind: "serviceway", set: "any", role: "block", type: "serviceway", weight: 0.8,
    note: "A straight run with an arcing panel on its west wall.",
    map: rows(8, "###..###"),
    furn: ["........", "........", "...*....", "........", "...A....", "....*...", "........", "........"],
    face: [[3, 4, "W"]],
  },
  {
    id: "service-ell", kind: "serviceway", set: "any", role: "block", type: "serviceway", weight: 1.6,
    note: "A corner in the service corridors.",
    map: ["###..###", "###..###", "###..###", "###.....", "###.....", "########", "########", "########"],
    furn: ["........", "...*....", "........", "......*.", "....*...", "........", "........", "........"],
  },
  {
    id: "service-tee", kind: "serviceway", set: "any", role: "block", type: "serviceway", weight: 1.6,
    note: "A side corridor branching off a run.",
    map: ["###..###", "###..###", "###..###", "###.....", "###.....", "###..###", "###..###", "###..###"],
    furn: ["........", "....*...", "........", "......*.", "........", "........", "...*....", "........"],
  },
  {
    id: "service-long", kind: "serviceway", set: "any", role: "block", type: "serviceway", weight: 0.9, max: 10,
    note: "A long corridor through a small pump chamber, water standing either side of the walkway.",
    map: [
      "###..###", "###..###", "###..###", "###..###", "###..###", "###..###",
      "#......#", "#......#", "#......#", "#......#",
      "###..###", "###..###", "###..###", "###..###", "###..###", "###..###",
    ],
    furn: [
      "........", "........", "...*....", "........", "........", "........",
      "........", ".ww..ww.", ".ww.*ww.", "........",
      "........", "........", "........", "...*....", "........", "........",
    ],
  },

  // ================================================================ ROOMS
  {
    id: "cable-vault", kind: "cablevault", set: "any", role: "block", type: "cablevault", weight: 1.4,
    note: "A cramped vault of cable runs: partitions, low ceiling, two lamps.",
    map: ["........", ".#....#.", "........", "........", "........", "........", ".#....#.", "........"],
    walls: ["........", "........", ".----...", "......|.", "..|.....", "...----.", "........", "........"],
    furn: ["........", "........", "........", "......*.", "........", "..*.....", "........", "........"],
  },
  {
    id: "control-room", kind: "controldesk", set: "any", role: "block", type: "controldesk", weight: 1,
    note: "A small control room: cabinets along the north wall, a desk, a chair.",
    map: fill(8, 8),
    furn: ["........", "........", "........", "..*..*..", "........", "........", "...*....", "........"],
    props: [
      { p: "electrical-cabinet", x: 1.5, y: 0.5, r: 0 },
      { p: "electrical-cabinet", x: 6.0, y: 0.5, r: 0 },
      { p: "steel-frame-table", x: 4.0, y: 4.6, r: 0 },
      { p: "office-chair-60s", v: 1, x: 4.0, y: 5.4, r: 180 },
    ],
  },
  {
    id: "battery-room", kind: "batteryroom", set: "any", role: "block", type: "batteryroom", weight: 1, max: 8,
    note: "Two long battery racks, a live panel on one, acid water in the middle aisle.",
    map: [
      "........", "........", ".##..##.", "........", "........",
      ".##..##.", ".##..##.", ".##..##.", ".##..##.", ".##..##.", ".##..##.",
      "........", "........", ".##..##.", "........", "........",
    ],
    furn: [
      "...*....", "........", "........", "........", "......*.",
      "........", "...A....", "........", "....w...", "...ww...", "........",
      ".*......", "........", "........", "...*....", "........",
    ],
    face: [[3, 6, "W"]],
  },
  {
    id: "transformer-bay", kind: "xfmrbay", set: "any", role: "block", type: "xfmrbay", weight: 0.8, max: 4,
    note: "Two big transformers. One has failed and stands in its own spilt water.",
    map: fill(16, 16),
    furn: [
      ".......A........",
      "................",
      "................",
      "...*........*...",
      "................",
      "................",
      "................",
      ".......*........",
      "..........ww....",
      "..........www...",
      "...........w....",
      "................",
      "...*........*...",
      "................",
      "................",
      "................",
    ],
    face: [[7, 0, "N"]],
    props: [
      { p: "station-transformer", x: 4.5, y: 6.0, r: 0 },
      { p: "station-transformer", x: 11.5, y: 6.0, r: 0 },
      { p: "wet-floor-sign-aframe", x: 9.6, y: 11.4, r: 200 },
    ],
  },
  {
    id: "substation-hall", name: "The Substation", kind: "substation", set: "any", role: "block", type: "substation", weight: 0.6, max: 2,
    note: "The big switchgear hall: two rows of cabinets, a live panel either end.",
    map: fill(16, 16),
    furn: [
      "................",
      "................",
      "................",
      "...*........*...",
      "................",
      "................",
      "................",
      "A......*.......A",
      "................",
      "................",
      "................",
      "................",
      "...*..ww....*...",
      ".......ww.......",
      "................",
      "................",
    ],
    face: [[0, 7, "W"], [15, 7, "E"]],
    props: [
      { p: "switchgear-low", x: 3.5, y: 5.5, r: 90 },
      { p: "switchgear-low", x: 6.5, y: 5.5, r: 90 },
      { p: "switchgear-low", x: 9.5, y: 5.5, r: 90 },
      { p: "switchgear-low", x: 12.5, y: 5.5, r: 90 },
      { p: "switchgear-low", x: 3.5, y: 10.5, r: 90 },
      { p: "switchgear-low", x: 6.5, y: 10.5, r: 90 },
      { p: "switchgear-low", x: 9.5, y: 10.5, r: 90 },
      { p: "switchgear-low", x: 12.5, y: 10.5, r: 90 },
    ],
  },
  {
    id: "workshop", kind: "workshop", set: "any", role: "block", type: "workshop", weight: 1,
    note: "A maintenance workshop: a bench, lockers, a rack.",
    map: fill(8, 8),
    furn: ["........", "........", "........", "..*.....", ".....*..", "........", "........", "........"],
    props: [
      { p: "steel-frame-table", x: 1.9, y: 0.6, r: 0 },
      { p: "locker-blue", v: 1, x: 6.1, y: 0.3, r: 0 },
      { p: "worn-metal-rack", x: 0.35, y: 5.5, r: 90 },
      { p: "wet-floor-sign-aframe", x: 5.5, y: 5.6, r: 30 },
    ],
  },
  {
    id: "flood-room", kind: "floodroom", set: "any", role: "block", type: "floodroom", weight: 0.8, max: 8,
    note: "A pump room under water — a dry ledge runs round the walls.",
    map: fill(8, 8),
    furn: ["........", ".ww..ww.", ".ww*www.", "..wwww..", "..wwww..", ".wwww*w.", ".ww..ww.", "........"],
    props: [{ p: "diesel-generator", x: 5.0, y: 3.0, r: 40 }],
  },
  {
    id: "flood-gallery", kind: "floodroom", set: "any", role: "block", type: "floodroom", weight: 0.5, max: 4,
    note: "A long flooded gallery with the ledge round it.",
    map: fill(16, 8),
    furn: [
      "................",
      "..w..wwwwww..w..",
      "..wwww*wwwwwww..",
      "..wwwwwwwwwwww..",
      "..wwwwwwwww*ww..",
      "..wwwwwwwwwwww..",
      "................",
      "................",
    ],
  },
];

const out = [];
let bad = 0;
for (const r of ROOMS) {
  const def = { ...r, doors: r.doors ?? slotsWhereOpen(r.map) };
  const l = lintStationTile(def);
  for (const e of l.errors) console.log(`✗ ${r.id}: ${e}`);
  for (const w of l.warnings) console.log(`  ${r.id}: ${w}`);
  if (l.errors.length) bad++;
  out.push(def);
}
writeFileSync(path.join(ROOT, "src", "backrooms", "station-rooms.json"), formatLibrary(out));
console.log(`${out.length} rooms → src/backrooms/station-rooms.json${bad ? `  (${bad} with errors)` : ""}`);
process.exit(bad ? 1 : 0);
