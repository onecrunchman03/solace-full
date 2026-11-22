// THE CAVE SYSTEM's first room library (Level 8, Oct 2026) — written once,
// then edited in the map editor like every other level's (Admin Panel → Map
// editor). Each room is drawn here in full, cell by cell; this script adds the
// doorway slots and dresses the rooms, then writes src/backrooms/cave-rooms.json
// in the editor's own layout (formatLibrary).
//
//   npm run build && node scripts/cave-library.mjs
//
// Legend (cave-tiles.ts): '.' floor · '#' rock · zone letters for floor of
// another type (c cavern, r river, o grotto, s passage, k crawl …) ·
// furniture: D the subway stair · C the chimney · R a rope spot · * a survey
// work lamp (lit) · = a dead tunnel batten · ~ a flickering platform lamp.
// Heights: '0' floor, 'a' -1 'b' -2 'c' -3 …, 'j' -10 (a drop that kills),
// '1'-'3' up. Rooms are 8-cell modules; the slots sit at cells 3-4 of every
// module side, on floor 0.
//
// Dressing until the real models are approved (scripts/assets/level8.json):
// the kit's SHAPES in the cave's own surfaces — cones of limestone for
// stalagmites, squashed spheres for boulders, tile pillars on the platforms,
// a long green box for a dead subway car, thin black bars for rails, planks
// over the chasm. Prop placement (kit.ts): x/y in CELLS from the room's
// corner, r = yaw in degrees clockwise from facing SOUTH, z = metres up.
import { createRequire } from "node:module";
import { writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(path.join(ROOT, "package.json"));
const { formatLibrary } = require(path.join(ROOT, "dist", "backrooms", "tiles.js"));
const { lintCaveTile } = require(path.join(ROOT, "dist", "backrooms", "cave-tiles.js"));

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
/** Every slot whose two lanes are open floor at height 0. */
function slotsWhereOpen(map, height, skip = "") {
  const h = map.length, w = map[0].length;
  return slots(w, h, skip).filter(([x, y, side]) => {
    const lanes = side === "N" || side === "S" ? [[x, y], [x + 1, y]] : [[x, y], [x, y + 1]];
    return lanes.every(([lx, ly]) => map[ly][lx] !== "#" && (!height || height[ly][lx] === "0"));
  });
}
const fill = (w, h, ch = ".") => Array.from({ length: h }, () => ch.repeat(w));
const rows = (h, row) => Array.from({ length: h }, () => row);
function furn(w, h, pieces) {
  const g = Array.from({ length: h }, () => Array(w).fill("."));
  for (const [x, y, ch] of pieces) g[y][x] = ch;
  return g.map((r) => r.join(""));
}

// ---- the dressing ----------------------------------------------------------
const ROCK = "cave-rock";
/** A stalagmite: a limestone cone. */
const stag = (x, y, h = 1.6, w = 0.7, c) => ({ p: "shape-cone", x, y, r: 0, sx: w, sy: h, sz: w, tex: ROCK, col: "#b9a084", ...(c ? { c } : {}) });
/** A boulder: a squashed limestone ball. */
const boulder = (x, y, s = 1.2, c) => ({ p: "shape-sphere", x, y, r: Math.round(x * 37 + y * 11) % 360, sx: s, sy: s * 0.65, sz: s * 0.85, tex: ROCK, col: "#a38c70", ...(c ? { c } : {}) });
/** A low rock lump you step over. */
const pebble = (x, y) => ({ p: "shape-sphere", x, y, r: 0, sx: 0.5, sy: 0.22, sz: 0.4, tex: ROCK, col: "#8f7a62", solid: false });
/** Two rails along a track, from x0 to x1 at row y (EW) — walk-through bars. */
const rails = (x0, x1, y) => {
  const out = [];
  for (let a = x0; a < x1; a += 8) {
    const b = Math.min(x1, a + 8);
    for (const dy of [-0.36, 0.36]) out.push({ p: "shape-cube", x: (a + b) / 2, y: y + dy, r: 90, sx: 0.08, sy: 0.12, sz: (b - a) * 2, tex: "black-metal", col: "#5a5550", solid: false });
  }
  return out;
};
/** The same, running north–south at column x. */
const railsNS = (y0, y1, x) => {
  const out = [];
  for (let a = y0; a < y1; a += 8) {
    const b = Math.min(y1, a + 8);
    for (const dx of [-0.36, 0.36]) out.push({ p: "shape-cube", x: x + dx, y: (a + b) / 2, r: 0, sx: 0.08, sy: 0.12, sz: (b - a) * 2, tex: "black-metal", col: "#5a5550", solid: false });
  }
  return out;
};
/** A dead subway car: a long green box, its length along x (r 90) or y (r 0). */
const car = (x, y, len, r = 90) => ({ p: "shape-cube", x, y, r, sx: 2.6, sy: 3.1, sz: len, tex: "green-rust-metal", col: "#6f8a74" });
/** A tiled station pillar. */
const tilePillar = (x, y) => ({ p: "shape-square-pillar", x, y, r: 0, sx: 0.7, sy: 4.2, sz: 0.7, tex: "dirty-white-tile" });
/** A platform bench (wood slats on a box). */
const bench = (x, y, r = 0) => ({ p: "shape-cube", x, y, r, sx: 1.6, sy: 0.45, sz: 0.45, tex: "wood-plank-floor", col: "#7a5a3a" });
/** A plank laid on the bridge (walk-through). */
const plank = (x, y, r = 0) => ({ p: "shape-cube", x, y, r, sx: 1.3, sy: 0.06, sz: 0.24, tex: "wood-plank-floor", col: "#6b4f33", solid: false });
const sign = (x, y, text, v = 3, r = 0, z = 2.3) => ({ p: "sign-plate", v, x, y, r, z, text });
/** One side of a station platform (side 0 the north platform, rows 0-2; side
 *  1 the south, rows 5-7): tiled pillars at the ends, two benches against the
 *  back wall facing the track (the doorway at cells 3-4 kept clear), a bin,
 *  the yellow line along the edge, MIND THE GAP painted at the edge. */
const platformSide = (side) => {
  const Y = (y) => (side ? 8 - y : y);
  const R = (r) => (side ? (r + 180) % 360 : r);
  return [
    tilePillar(0.8, Y(0.9)), tilePillar(7.2, Y(0.9)),
    bench(2.0, Y(0.45), R(0)), bench(6.0, Y(0.45), R(0)),
    { p: "wire-bin", x: 2.75, y: Y(0.35), r: 0, c: 60 },
    { p: "shape-cube", x: 4, y: Y(2.86), r: 90, sx: 0.28, sy: 0.05, sz: 16, tex: "dirty-white-tile", col: "#d8b13a", solid: false },
    { p: "sign-floor", v: 2, x: side ? 2.0 : 6.0, y: Y(2.45), r: R(0), text: "MIND THE GAP" },
  ];
};
/** A dead subway car on the track, its length west–east: the green body and
 *  a band of black windows down each side. */
const trainCar = (x, y, len) => [
  car(x, y, len, 90),
  ...[-1, 1].map((s) => ({ p: "shape-cube", x, y: y + s * 0.66, r: 90, sx: 0.05, sy: 0.75, sz: len - 1.6, z: 1.45, tex: "black-metal", col: "#0c0e0f", solid: false })),
];
/** A run of cable along a tunnel wall at row `y` (the wall's face), from x0 to x1. */
const tunnelCable = (y, x0 = 0, x1 = 8) => [{ p: "shape-cube", x: (x0 + x1) / 2, y, r: 90, sx: 0.1, sy: 0.08, sz: (x1 - x0) * 2, z: 2.3, tex: "black-metal", col: "#1c1a18", solid: false }];
/** A line of ticket gates across a hall at row y: a gate cabinet at each x. */
const turnstiles = (y, xs) => xs.map((x) => ({ p: "shape-cube", x, y, r: 0, sx: 0.28, sy: 1.0, sz: 1.1, tex: "black-metal", col: "#5b5d5f" }));

const ROOMS = [
  // ================================================================ SET PIECES
  {
    id: "the-subway-stair", name: "The Subway Stair", kind: "subwaystair", set: "station", role: "start", type: "subwaystair", min: 1, max: 1, skip: "N",
    note: "You come down here from the drowned square: the stair is on the north wall (the map's edge). Water drips down it after you. Nothing that lives down here comes into this room.",
    map: fill(8, 8),
    furn: furn(8, 8, [[3, 0, "D"], [4, 4, "~"], [1, 6, "="]]),
    face: [[3, 0, "N"]],
    props: [
      sign(1.4, 0.02, "LINE 8 · PLATFORMS"),
      sign(6.6, 0.02, "WAY OUT", 1),
      { p: "wet-floor-sign", x: 6.4, y: 2.0, r: 30, c: 60 },
      tilePillar(0.6, 7.4),
      tilePillar(7.4, 7.4),
    ],
  },
  {
    id: "the-chimney", name: "The Chimney", kind: "chimney", set: "deep", role: "goal", type: "chimney", min: 1, max: 1, skip: "S",
    note: "The end of the Deep: a natural shaft goes straight up out of the south wall. Far up there's a round of light, a manhole, and a streetlight's glow. You can't climb it bare-handed. You can with a rope.",
    map: ["........", "........", ".#....#.", "........", "........", "........", "##....##", "###..###"],
    furn: furn(8, 8, [[3, 7, "C"]]),
    face: [[3, 7, "S"]],
    props: [boulder(1.2, 6.2, 1.1), boulder(6.8, 6.3, 1.0), pebble(5.5, 4.2), pebble(2.4, 3.6)],
  },

  // ================================================================ THE STATION
  // Josh, Oct 16 2026: "the first part is very disorganized looking with prop
  // placement not making much sense". The Station is planned in rows now
  // (worldgen-cave.ts stationRows): the ticket halls by the stair, the
  // passages down to the platforms, THE LINE, and the far side. Every room is
  // furnished the way that room would be — benches against the platform's
  // back wall facing the track, turnstiles in a line across the hall with the
  // walkways lined up on its doors, cabinets against walls, nothing loose in
  // the middle of a floor without a reason. Doorway cells (3-4 on every
  // module side) are kept clear.
  //
  // THE LINE (type trackbed, laid by the planner along the Station's third
  // row). Drawn running west–east: the track down the middle two rows
  // (ankle-deep water, the rails), the platforms either side a step up (half
  // a metre), with a step down at each doorway.
  {
    id: "station-platforms", name: "Foundry Street", kind: "station", set: "station", role: "block", type: "trackbed", weight: 1,
    note: "The station: a platform either side of the flooded track, tiled walls, benches facing the rails. The lamps still flicker. Nobody has waited here for a long time.",
    map: [...rows(3, "pppppppp"), ...rows(2, "........"), ...rows(3, "pppppppp")],
    height: ["11100111", "11111111", "11111111", "00000000", "00000000", "11111111", "11111111", "11100111"],
    furn: furn(8, 8, [[1, 1, "~"], [6, 1, "~"], [1, 6, "~"], [6, 6, "="]]),
    props: [
      ...platformSide(0), ...platformSide(1),
      ...rails(0, 8, 4.0),
      sign(6.0, 0.02, "FOUNDRY STREET", 3, 0, 2.5),
      sign(2.0, 7.98, "FOUNDRY STREET", 3, 180, 2.5),
    ],
  },
  {
    id: "station-train", name: "Foundry Street", kind: "station-train", set: "station", role: "block", type: "trackbed", weight: 1,
    note: "The dead train, standing at the platform with its doors shut and its windows black. There's room to squeeze between the cars.",
    map: [...rows(3, "pppppppp"), ...rows(2, "........"), ...rows(3, "pppppppp")],
    height: ["11100111", "11111111", "11111111", "00000000", "00000000", "11111111", "11111111", "11100111"],
    furn: furn(8, 8, [[1, 1, "~"], [6, 1, "="], [1, 6, "="], [6, 6, "~"]]),
    props: [
      ...platformSide(0), ...platformSide(1),
      ...rails(0, 8, 4.0),
      ...trainCar(4.0, 4.0, 12),
      sign(6.0, 0.02, "FOUNDRY STREET", 3, 0, 2.5),
    ],
  },
  {
    id: "tunnel", kind: "tunnel", set: "station", role: "block", type: "trackbed", weight: 2.4,
    note: "The tunnel: rails under ankle-deep water, cables along the wall, a dead lamp every so often. It runs further than your torch.",
    map: [...rows(2, "########"), ...rows(4, "........"), ...rows(2, "########")],
    furn: furn(8, 8, [[4, 2, "="]]),
    props: [...rails(0, 8, 4.0), ...tunnelCable(2.06)],
  },
  {
    id: "tunnel-signal", kind: "tunnel", set: "station", role: "block", type: "trackbed", weight: 1.0,
    note: "A signal cabinet set into the tunnel wall, its door hanging open, its lamp dead.",
    map: [...rows(2, "########"), ...rows(4, "........"), ...rows(2, "########")],
    furn: furn(8, 8, [[2, 5, "="]]),
    props: [...rails(0, 8, 4.0), ...tunnelCable(5.94), { p: "utility-box", x: 5.5, y: 2.3, r: 0 }, sign(5.5, 2.02, "SIGNAL 8-14", 2, 0, 1.9)],
  },
  {
    id: "tunnel-car", kind: "tunnel", set: "station", role: "block", type: "trackbed", weight: 0.6, max: 2,
    note: "One car on its own in the tunnel, a long way from the train it came off. There's room to get past it along the wall.",
    map: [...rows(2, "########"), ...rows(4, "........"), ...rows(2, "########")],
    furn: furn(8, 8, [[4, 2, "="]]),
    props: [...rails(0, 8, 4.0), ...trainCar(4.0, 4.0, 12)],
  },
  {
    id: "tunnel-door", kind: "tunnel", set: "station", role: "block", type: "trackbed", weight: 1.2,
    note: "A staff door in the tunnel wall, a step up off the track.",
    map: ["###hh###", "###hh###", ...rows(4, "........"), ...rows(2, "########")],
    furn: furn(8, 8, [[6, 2, "="]]),
    props: [...rails(0, 8, 4.0), ...tunnelCable(5.94), sign(1.6, 2.02, "STAFF ONLY", 2, 0, 2.0)],
  },

  // THE TICKET HALLS (rows 1-2): what you walk into off the stair.
  {
    id: "ticket-hall", name: "The Ticket Hall", kind: "hall", set: "station", role: "block", type: "concourse", weight: 1.2, min: 1, max: 2,
    note: "The ticket hall: the booth with its shutter down, a line of turnstiles, a clock stopped at twenty past four.",
    map: fill(16, 8),
    furn: furn(16, 8, [[2, 2, "="], [7, 4, "~"], [13, 2, "="], [10, 6, "="]]),
    props: [
      // the booth against the north wall, between the two doors
      { p: "shape-cube", x: 8.0, y: 0.4, r: 0, sx: 3.6, sy: 2.6, sz: 1.6, tex: "dirty-white-tile", col: "#cfc8b8" },
      { p: "shape-cube", x: 8.0, y: 0.82, r: 0, sx: 3.0, sy: 0.9, sz: 0.06, tex: "black-metal", col: "#3a3a38", solid: false, z: 1.0 },
      sign(8.0, 0.02, "TICKETS", 3, 0, 2.95),
      { p: "wall-clock", x: 13.6, y: 0.03, r: 0, z: 2.6 },
      sign(2.0, 0.02, "LINE 8", 1),
      // the gate line across the hall, its walkways lined up on the doors
      ...turnstiles(5.0, [1.0, 2.0, 5.6, 6.6, 9.4, 10.4, 14.0, 15.0]),
      // along the walls: machines, benches, bins
      { p: "drinks-vending-machine", x: 0.5, y: 5.8, r: 270 },
      { p: "vending-machine-60s", x: 0.5, y: 7.1, r: 270, c: 70 },
      { p: "wire-bin", x: 15.6, y: 6.8, r: 0 },
      { p: "fire-extinguisher", x: 15.7, y: 1.4, r: 90 },
      { p: "wet-floor-sign-aframe", x: 14.2, y: 6.6, r: 20, c: 60 },
    ],
  },
  {
    id: "station-hall", kind: "hall", set: "station", role: "block", type: "concourse", weight: 1.4, max: 4,
    note: "A side hall of the station: two tiled pillars, a gate line, a map of a line that doesn't go anywhere you know.",
    map: fill(8, 8),
    furn: furn(8, 8, [[2, 2, "="], [5, 5, "="]]),
    props: [
      tilePillar(1.6, 1.6), tilePillar(6.4, 1.6),
      ...turnstiles(5.5, [1.0, 2.0, 6.0, 7.0]),
      sign(5.8, 0.02, "LINE 8 · ALL STATIONS", 3, 0, 2.4),
      { p: "wire-bin", x: 7.6, y: 6.6, r: 0 },
      bench(0.45, 6.0, 90),
    ],
  },

  // THE WAY DOWN TO THE PLATFORMS (row 2): tiled passages.
  {
    id: "platform-passage", kind: "corridor", set: "station", role: "block", type: "concourse", weight: 1.6, max: 4,
    note: "A tiled passage down to the platforms. The signs still point the way.",
    map: rows(8, "##....##"),
    furn: furn(8, 8, [[3, 2, "="], [4, 6, "~"]]),
    props: [
      sign(2.02, 2.0, "PLATFORMS ↓", 2, 270, 2.2),
      sign(5.98, 5.6, "WAY OUT ↑", 2, 90, 2.2),
      { p: "fire-extinguisher", x: 5.7, y: 1.2, r: 90 },
      { p: "wire-bin", x: 2.3, y: 6.8, r: 0, c: 60 },
    ],
  },
  {
    id: "platform-passage-ell", kind: "corridor", set: "station", role: "block", type: "concourse", weight: 0.8, max: 2,
    note: "The passage turns. A poster nobody can read any more.",
    map: ["##....##", "##....##", "##......", "##......", "##......", "##......", "########", "########"],
    furn: furn(8, 8, [[3, 2, "="]]),
    props: [sign(2.02, 2.0, "PLATFORMS →", 2, 270, 2.2), { p: "cork-noticeboard", x: 4.0, y: 5.98, r: 180, z: 1.5 }],
  },

  // SERVICE ROOMS (rows 1, 2 or 4): where the staff worked.
  {
    id: "staff-room", name: "Staff Room", kind: "service", set: "station", role: "block", type: "concourse", weight: 0.8, max: 2,
    note: "The staff room: lockers, a table, two chairs pushed back as if the shift just ended. A rota on the board with nobody's name crossed off.",
    map: fill(8, 8),
    furn: furn(8, 8, [[4, 4, "="]]),
    props: [
      { p: "locker-bank", x: 0.4, y: 1.6, r: 270 },
      { p: "locker-tall", x: 0.4, y: 6.2, r: 270 },
      { p: "plain-table", x: 5.4, y: 5.4, r: 0 },
      { p: "wood-chair", x: 5.4, y: 4.6, r: 0 },
      { p: "wood-chair", x: 6.2, y: 6.0, r: 250 },
      { p: "coffee-mug", x: 5.2, y: 5.3, z: 0.76, r: 0 },
      { p: "cork-noticeboard", x: 6.0, y: 0.02, r: 0, z: 1.5 },
      { p: "water-cooler", x: 7.5, y: 0.6, r: 90 },
      { p: "wire-bin", x: 7.6, y: 7.4, r: 0 },
    ],
  },
  {
    id: "plant-room", name: "Plant Room", kind: "service", set: "station", role: "block", type: "concourse", weight: 0.8, max: 3,
    note: "The station's plant room: switchgear in a row, cable drums, a warning on the door. Everything is dead.",
    map: fill(8, 8),
    furn: furn(8, 8, [[2, 4, "="], [5, 4, "="]]),
    props: [
      { p: "switchgear-low", x: 1.1, y: 0.5, r: 0 },
      { p: "electrical-cabinet", x: 6.4, y: 0.5, r: 0 },
      { p: "electrical-cabinet", x: 7.4, y: 0.5, r: 0 },
      { p: "utility-box", x: 0.5, y: 6.2, r: 270 },
      { p: "cable-drum", x: 6.6, y: 6.6, r: 0 },
      { p: "wall-cable", x: 7.98, y: 1.6, r: 90, z: 2.4 },
      { p: "fire-extinguisher", x: 0.3, y: 1.6, r: 270 },
      sign(6.9, 0.02, "DANGER · 600 V", 2, 0, 2.0),
    ],
  },
  {
    id: "store-room", name: "Stores", kind: "service", set: "station", role: "block", type: "concourse", weight: 0.7, max: 2,
    note: "The stores: shelving along the walls, crates of spare signal parts, a mop in a bucket gone dry.",
    map: fill(8, 8),
    furn: furn(8, 8, [[4, 4, "="]]),
    props: [
      { p: "rusty-shelving", x: 0.5, y: 1.4, r: 270 },
      { p: "rusty-shelving", x: 0.5, y: 6.4, r: 270 },
      { p: "worn-metal-rack", x: 7.5, y: 6.4, r: 90 },
      { p: "crate-stack", x: 6.6, y: 1.0, r: 0 },
      { p: "wood-crate", x: 7.4, y: 2.2, r: 10, c: 70 },
      { p: "cardboard-box", x: 1.4, y: 5.0, r: 30, c: 70 },
      { p: "bucket", x: 6.2, y: 7.4, r: 0, c: 60 },
    ],
  },

  // THE BREACH (the far row): where the station's back wall gave way into the
  // rock, and the way on into the caves.
  {
    id: "breach", name: "The Breach", kind: "breach", set: "station", role: "block", type: "breach", weight: 1.0, min: 2, max: 4,
    note: "The far wall of the station gave way here. Tiled floor up to a heap of rubble, and past it raw rock and a smell of wet stone. The survey team went through: their lamp is still on.",
    map: ["........", "........", "........", "........", "..#.....", ".##...#.", "##.....#", "#.......".replace(/.$/, ".")],
    furn: furn(8, 8, [[5, 4, "*"], [2, 1, "="]]),
    props: [
      { p: "broken-wall-slab", x: 1.2, y: 1.4, r: 20 },
      { p: "rubble-pile", x: 2.4, y: 2.6, r: 70 },
      { p: "concrete-shard", x: 0.8, y: 2.4, r: 140, c: 70 },
      { p: "work-light-tripod", x: 5.6, y: 6.4, r: 210 },
      { p: "sign-paint", v: 3, x: 7.98, y: 2.0, r: 90, z: 1.4, text: "ASYNC SURVEY →" },
      boulder(6.4, 7.2, 0.9), pebble(2.6, 6.6),
    ],
  },
  {
    id: "breach-corridor", kind: "breach", set: "station", role: "block", type: "breach", weight: 0.8, max: 3,
    note: "A service corridor that ends in rock: the tiles stop and the cave begins.",
    map: ["##....##", "##....##", "##....##", "##.....#", "#.......", "#.......", "##.....#", "###...##"],
    furn: furn(8, 8, [[3, 1, "="]]),
    props: [{ p: "rubble-pile", x: 5.6, y: 5.0, r: 40 }, boulder(2.0, 6.0, 0.8, 60), { p: "concrete-shard", x: 4.4, y: 3.0, r: 70 }],
  },

  // ================================================================ THE CAVERNS
  {
    id: "cavern", kind: "cavern", set: "caverns", role: "block", type: "cavern", weight: 2.0,
    note: "A rock chamber, bigger than your light. Stalagmites, wet stone, the drip of water somewhere.",
    map: ["##..#..#", "#.......", "........", "........", "........", ".#......", "#......#", "##..#.##"],
    furn: furn(8, 8, [[5, 5, "*"], [2, 6, "R"]]),
    props: [stag(1.6, 1.8, 1.8), stag(6.4, 1.4, 1.2, 0.5), stag(6.0, 5.8, 2.2, 0.8), boulder(1.4, 5.0, 1.0, 60), pebble(4.6, 2.2)],
  },
  {
    id: "cavern-pillars", kind: "cavern", set: "caverns", role: "block", type: "cavern", weight: 1.4,
    note: "A chamber held up on columns of stone where the stalactites met the floor.",
    map: ["#......#", ".#....#.", "........", "........", "........", "........", ".#....#.", "#......#"],
    height: ["00000000", "00000000", "00000000", "00011000", "00011000", "00000000", "00000000", "00000000"],
    furn: furn(8, 8, [[2, 3, "*"], [6, 5, "R"]]),
    props: [stag(4.0, 4.0, 2.4, 0.9), stag(2.6, 6.2, 1.0, 0.5, 70), pebble(5.6, 1.6)],
  },
  {
    id: "cathedral", name: "The Cathedral", kind: "cavern", set: "caverns", role: "block", type: "cavern", weight: 0.9, min: 1, max: 3,
    note: "A cavern so tall your beam doesn't find the roof. Stalagmites as tall as you, a mound of fallen rock in the middle you can climb.",
    map: [
      "##..............",
      "#...............",
      "........##......",
      "................",
      "................",
      "................",
      "................",
      "................",
      "................",
      "................",
      "................",
      "................",
      "......##........",
      "................",
      "...............#",
      "..............##",
    ],
    height: [
      "0000000000000000",
      "0000000000000000",
      "0000000000000000",
      "0000000000000000",
      "0000011110000000",
      "0000122221000000",
      "0001233332100000",
      "0001234432100000",
      "0001234432100000",
      "0001233332100000",
      "0000122221000000",
      "0000011110000000",
      "0000000000000000",
      "0000000000000000",
      "0000000000000000",
      "0000000000000000",
    ],
    furn: furn(16, 16, [[2, 2, "*"], [13, 2, "*"], [2, 13, "*"], [13, 12, "*"], [7, 7, "R"], [13, 6, "R"], [2, 9, "R"]]),
    props: [
      stag(11.5, 3.0, 2.8, 1.0), stag(12.4, 3.6, 1.6, 0.6), stag(3.4, 12.0, 2.4, 0.9), stag(11.6, 11.4, 2.0, 0.8),
      stag(14.2, 9.4, 1.4, 0.5), stag(1.6, 6.0, 1.8, 0.7),
      boulder(10.6, 13.4, 1.4), boulder(4.6, 3.0, 1.2, 70), pebble(8.6, 2.6), pebble(13.4, 14.2),
      { p: "work-light-tripod", x: 6.6, y: 13.6, r: 200, c: 70 },
    ],
  },
  {
    id: "survey-camp", name: "Survey Camp", kind: "cavern", set: "caverns", role: "block", type: "cavern", weight: 0.7, min: 1, max: 2,
    note: "Async's survey team camped here: work lights still on, crates, a table of maps gone to pulp. They left in a hurry.",
    map: ["#.......", "........", "........", "........", "........", "........", "......#.", "#.....##"],
    furn: furn(8, 8, [[4, 4, "*"], [1, 1, "*"], [6, 2, "R"], [2, 6, "R"]]),
    props: [
      { p: "work-light-tripod", x: 1.2, y: 6.6, r: 45 },
      { p: "steel-frame-table", x: 4.0, y: 1.2, r: 0 },
      { p: "wood-crate", x: 6.8, y: 4.0, r: 20 },
      { p: "cardboard-box", x: 6.6, y: 5.0, r: 60, c: 70 },
      { p: "water-barrel", x: 0.6, y: 0.6, r: 0 },
      { p: "cable-drum", x: 5.0, y: 6.4, r: 0, c: 60 },
      sign(4.0, 0.03, "ASYNC SURVEY · CAMP 2", 2),
    ],
  },
  {
    id: "gallery-bowl", name: "The Terraces", kind: "gallery", set: "caverns", role: "block", type: "gallery", weight: 0.8, max: 4,
    note: "A cavern in steps: a sunken bowl in the middle. Go off the north ledge and you'll land fine — you won't get back up it. The slope round the south side is the way back.",
    map: fill(16, 8),
    height: [
      "0000000000000000",
      "0000000000000000",
      "00cccccccccccc00",
      "00cccccccccccc00",
      "00cccccccccccc00",
      "00bbbbbbbbbbbc00",
      "0000aaaaaaaaab00",
      "000000000000000a".replace(/a$/, "0"),
    ],
    furn: furn(16, 8, [[3, 0, "*"], [12, 7, "*"], [7, 3, "R"]]),
    props: [stag(4.4, 3.4, 1.4, 0.6), stag(10.6, 2.8, 2.0, 0.8), boulder(8.0, 4.2, 1.0, 70), pebble(13.2, 6.2)],
  },
  {
    id: "gallery-shelf", kind: "gallery", set: "caverns", role: "block", type: "gallery", weight: 1.0,
    note: "A rock shelf up one side of the chamber. A slope climbs to it; the edge drops straight back down.",
    map: fill(8, 8),
    height: ["00000000", "00000000", "00000000", "00000000", "00000000", "33333210", "33333210", "33333210"],
    furn: furn(8, 8, [[5, 2, "*"], [1, 6, "R"]]),
    props: [stag(1.4, 1.4, 1.6, 0.6), boulder(2.2, 6.2, 0.8, 60)],
  },
  {
    id: "river", kind: "caveriver", set: "caverns", role: "block", type: "caveriver", weight: 1.6,
    note: "An underground river, ankle-deep and fast, cold enough to hurt. It's loud. So are you, in it.",
    map: ["cccccccc", "cccccccc", "........", "........", "........", "........", "cccccccc", "cccccccc"],
    furn: furn(8, 8, [[2, 1, "*"], [6, 6, "R"]]),
    props: [boulder(1.2, 4.6, 0.9), boulder(6.0, 3.0, 0.7, 70), stag(6.8, 0.8, 1.4, 0.5), pebble(2.6, 6.4)],
  },
  {
    id: "river-ford", kind: "caveriver", set: "caverns", role: "block", type: "caveriver", weight: 0.8,
    note: "The river runs shallow over a shelf of rock here. Stepping stones, if you trust them.",
    map: ["cccccccc", "cccccccc", "........", "........", "........", "........", "cccccccc", "cccccccc"],
    furn: furn(8, 8, [[6, 1, "*"], [1, 6, "R"]]),
    props: [pebble(3.6, 2.6), pebble(4.2, 3.6), pebble(3.8, 4.6), pebble(4.4, 5.4), stag(0.8, 0.8, 1.6, 0.6), stag(7.2, 7.2, 2.0, 0.8)],
  },
  {
    id: "river-bend", kind: "caveriver", set: "caverns", role: "block", type: "caveriver", weight: 1.0,
    note: "The river turning a corner, cutting under the rock.",
    map: ["cc....cc", "cc....cc", "cc......", "cc......", "cc......", "cc......", "cccccccc", "cccccccc"],
    furn: furn(8, 8, [[1, 6, "*"], [0, 1, "R"]]),
    props: [boulder(6.6, 6.6, 1.0, 60), pebble(1.0, 3.2)],
  },
  {
    id: "chasm", name: "The Chasm", kind: "chasm", set: "caverns", role: "block", type: "chasm", weight: 0.8, min: 1, max: 3,
    note: "The cave splits open here. A drop nobody walks away from, and one way across: a walk of planks somebody laid on a spine of rock.",
    map: rows(16, "........"),
    height: [
      "00000000",
      "00000000",
      "00000000",
      "00000000",
      "00000000",
      "jjj0jjjj",
      "jjj0jjjj",
      "jjj0jjjj",
      "jjj0jjjj",
      "jjj0jjjj",
      "jjj0jjjj",
      "00000000",
      "00000000",
      "00000000",
      "00000000",
      "00000000",
    ],
    furn: furn(8, 16, [[1, 2, "*"], [6, 13, "*"], [6, 2, "R"]]),
    props: [
      plank(3.5, 5.3), plank(3.5, 5.9), plank(3.5, 6.5), plank(3.5, 7.1), plank(3.5, 7.7), plank(3.5, 8.3), plank(3.5, 8.9), plank(3.5, 9.5), plank(3.5, 10.1), plank(3.5, 10.7),
      { p: "shape-cylinder", x: 3.0, y: 4.85, r: 0, sx: 0.12, sy: 1.1, sz: 0.12, tex: "wood-plank-floor", col: "#5a4128" },
      { p: "shape-cylinder", x: 4.0, y: 4.85, r: 0, sx: 0.12, sy: 1.1, sz: 0.12, tex: "wood-plank-floor", col: "#5a4128" },
      { p: "shape-cylinder", x: 3.0, y: 11.15, r: 0, sx: 0.12, sy: 1.1, sz: 0.12, tex: "wood-plank-floor", col: "#5a4128" },
      { p: "shape-cylinder", x: 4.0, y: 11.15, r: 0, sx: 0.12, sy: 1.1, sz: 0.12, tex: "wood-plank-floor", col: "#5a4128" },
      sign(1.0, 4.4, "DON'T", 2, 0, 0.9),
      stag(6.8, 14.6, 1.6, 0.6), boulder(1.2, 14.2, 1.0),
    ],
  },
  {
    id: "breach-cave", kind: "breach", set: "caverns", role: "block", type: "breach", weight: 0.5, max: 3,
    note: "A length of subway tunnel that went the wrong way into the rock. The tiles stop mid-wall.",
    map: ["##....##", "##....##", "##.....#", "##......", "##......", "##.....#", "##....##", "##....##"],
    furn: furn(8, 8, [[3, 3, "="], [5, 6, "R"]]),
    props: [...railsNS(0, 6, 4.0), { p: "rubble-pile", x: 5.6, y: 4.4, r: 40 }, boulder(5.6, 1.4, 0.9)],
  },

  // ================================================================ THE DEEP
  {
    id: "passage", kind: "passage", set: "deep", role: "block", type: "passage", weight: 2.6,
    note: "A narrow passage, your shoulders brushing rock. The walls click now and then. Rock settling, probably.",
    map: ["###..###", "###..###", "##...###", "##..####", "###..###", "###...##", "###..###", "###..###"],
    furn: furn(8, 8, []),
    props: [pebble(3.4, 4.6)],
  },
  {
    id: "passage-long", kind: "passage", set: "deep", role: "block", type: "passage", weight: 1.6,
    note: "A long narrow passage. You can't see the end of it and you can't turn round in it either.",
    map: ["###..###", "###..###", "###...##", "####..##", "####..##", "###..###", "##...###", "##..####", "##..####", "###..###", "###..###", "###...##", "####..##", "###..###", "###..###", "###..###"],
    furn: furn(8, 16, []),
    props: [],
  },
  {
    id: "passage-ell", kind: "passage", set: "deep", role: "block", type: "passage", weight: 1.4,
    note: "The passage turns.",
    map: ["###..###", "###..###", "###..###", "###.....", "###.....", "########", "########", "########"],
    furn: furn(8, 8, []),
    props: [],
  },
  {
    id: "passage-tee", kind: "passage", set: "deep", role: "block", type: "passage", weight: 1.2,
    note: "Two passages meet. Listen before you pick one.",
    map: ["###..###", "###..###", "###..###", "........", "........", "########", "########", "########"],
    furn: furn(8, 8, []),
    props: [],
  },
  {
    id: "passage-cross", kind: "passage", set: "deep", role: "block", type: "passage", weight: 0.9,
    note: "Four ways into the rock.",
    map: ["###..###", "###..###", "###..###", "........", "........", "###..###", "###..###", "###..###"],
    furn: furn(8, 8, []),
    props: [],
  },
  {
    id: "passage-nook", kind: "passage", set: "deep", role: "block", type: "passage", weight: 1.0,
    note: "The passage opens for a few steps into a little chamber. Open rock. Whatever lives in the walls doesn't come out here.",
    map: ["###..###", "###..###", "#oooooo#", "#oooooo#", "#oooooo#", "#oooooo#", "###..###", "###..###"],
    furn: furn(8, 8, []),
    props: [pebble(1.6, 2.6), boulder(6.2, 5.4, 0.7, 60)],
  },
  {
    id: "crawl", kind: "crawl", set: "deep", role: "block", type: "crawl", weight: 1.6,
    note: "A crawlspace. The roof comes down to meet you; you go through on your knees, or not at all.",
    map: rows(8, "###..###"),
    furn: furn(8, 8, []),
    props: [],
  },
  {
    id: "crawl-long", name: "The Squeeze", kind: "crawl", set: "deep", role: "block", type: "crawl", weight: 0.8, max: 5,
    note: "The longest crawl in the Deep. Halfway along you'll hear it, and you'll be on your knees when you do.",
    map: rows(16, "###..###"),
    furn: furn(8, 16, []),
    props: [],
  },
  {
    id: "crawl-ell", kind: "crawl", set: "deep", role: "block", type: "crawl", weight: 1.0,
    note: "A crawlspace bending round a corner of rock.",
    map: ["###..###", "###..###", "###..###", "###.....", "###.....", "########", "########", "########"],
    furn: furn(8, 8, []),
    props: [],
  },
  {
    id: "grotto", kind: "grotto", set: "deep", role: "block", type: "grotto", weight: 1.2,
    note: "A small open chamber, room to stand. The clicking stops at the edge of it.",
    map: ["##....##", "#......#", "........", "........", "........", "........", "#......#", "##....##"],
    furn: furn(8, 8, []),
    props: [stag(5.8, 1.8, 1.4, 0.6), boulder(1.6, 5.8, 0.9), pebble(4.2, 5.2)],
  },
  {
    id: "grotto-big", name: "The Hollow", kind: "grotto", set: "deep", role: "block", type: "grotto", weight: 0.6, max: 3,
    note: "A wide low hollow in the Deep, the only room down here to breathe. Survey chalk on the walls: arrows, and a count of days that stops.",
    map: [
      "##..............",
      "#...............",
      "................",
      "......##........",
      "......##........",
      "................",
      "................",
      "...............#",
      "#...............",
      "................",
      "........##......",
      "........##......",
      "................",
      "................",
      "...............#",
      "..............##",
    ],
    furn: furn(16, 16, []),
    props: [
      stag(3.0, 3.0, 1.6, 0.6), stag(12.6, 6.0, 1.2, 0.5), stag(4.4, 12.6, 1.8, 0.7), boulder(12.0, 13.0, 1.2), pebble(9.0, 6.4),
      { p: "sign-paint", v: 3, x: 0.02, y: 9.0, r: 270, z: 1.2, text: "IIII IIII III" },
    ],
  },
  {
    id: "deep-chasm", kind: "chasm", set: "deep", role: "block", type: "chasm", weight: 0.4, max: 2,
    note: "The cave drops away under a crack in the Deep. Planks across it, and nothing under the planks for a long way.",
    map: rows(8, "........"),
    height: ["00000000", "00000000", "jjj0jjjj", "jjj0jjjj", "jjj0jjjj", "jjj0jjjj", "00000000", "00000000"],
    furn: furn(8, 8, []),
    props: [plank(3.5, 2.3), plank(3.5, 2.9), plank(3.5, 3.5), plank(3.5, 4.1), plank(3.5, 4.7), plank(3.5, 5.3), plank(3.5, 5.8)],
  },
];

const out = [];
let bad = 0;
for (const r of ROOMS) {
  const def = { ...r, doors: r.doors ?? slotsWhereOpen(r.map, r.height, r.skip) };
  delete def.skip;
  const l = lintCaveTile(def);
  for (const e of l.errors) console.log(`✗ ${r.id}: ${e}`);
  for (const w of l.warnings) console.log(`  ${r.id}: ${w}`);
  if (l.errors.length) bad++;
  out.push(def);
}
writeFileSync(path.join(ROOT, "src", "backrooms", "cave-rooms.json"), formatLibrary(out));
console.log(`${out.length} rooms → src/backrooms/cave-rooms.json${bad ? `  (${bad} with errors)` : ""}`);
process.exit(bad ? 1 : 0);
