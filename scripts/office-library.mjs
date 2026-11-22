// THE ABANDONED OFFICE's first room library (Level 4, Oct 2026) — written
// once, then edited in the map editor like every other level's (Admin Panel →
// Map editor). Each room is drawn here in full, cell by cell; this script adds
// the doorway slots every module side carries and furnishes the rooms from
// the prop kit, then writes src/backrooms/office-rooms.json in the editor's
// own layout (formatLibrary).
//
//   npm run build && node scripts/office-library.mjs
//
// Legend (office-tiles.ts): '.' floor · '#' solid · furniture: D the lift ·
// S the stairwell door · K the security keycard · W a window · * a troffer.
// Rooms are 8-cell modules; the slots sit at cells 3-4 of every module side.
//
// Prop placement (kit.ts): x/y in CELLS from the room's corner (3.5 = the
// middle of cell 3), r = yaw in degrees clockwise from facing SOUTH (0 south,
// 90 west, 180 north, 270 east), z = metres off the floor. A desk top is
// 0.73m. A wall prop backs on to its wall: y = its depth / 2 on a north wall,
// facing south (r 0), and so on round the room.
//
// The references (docs/backrooms/REFERENCES.md → Level 4): the big rooms are
// BARE, the furniture lives in the small rooms; cubicles are partitions you
// can see over (kit props 1.4m tall), not walls.
import { createRequire } from "node:module";
import { writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(path.join(ROOT, "package.json"));
const { formatLibrary } = require(path.join(ROOT, "dist", "backrooms", "tiles.js"));
const { lintOfficeTile } = require(path.join(ROOT, "dist", "backrooms", "office-tiles.js"));

const M = 8;
/** Every slot on every module side. `skip` names sides to leave shut. */
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
/** Doorways only where the room's floor actually reaches the rim. */
function slotsWhereOpen(map, skip = "") {
  const h = map.length, w = map[0].length;
  return slots(w, h, skip).filter(([x, y, side]) => {
    const lanes = side === "N" || side === "S" ? [[x, y], [x + 1, y]] : [[x, y], [x, y + 1]];
    return lanes.every(([lx, ly]) => map[ly][lx] !== "#");
  });
}
const fill = (w, h, ch = ".") => Array.from({ length: h }, () => ch.repeat(w));
const rows = (h, row) => Array.from({ length: h }, () => row);
/** A furniture layer: empty, with `pieces` [[x, y, glyph], ...] set on it. */
function furn(w, h, pieces) {
  const g = Array.from({ length: h }, () => Array(w).fill("."));
  for (const [x, y, ch] of pieces) g[y][x] = ch;
  return g.map((r) => r.join(""));
}
/** Troffers on a lattice every `step` cells, offset `at` (the drop ceiling's
 *  grid), skipping cells `map` says are solid. */
function troffers(w, h, step = 4, at = 2, map = null) {
  const out = [];
  for (let y = at; y < h; y += step) for (let x = at; x < w; x += step) if (!map || map[y][x] !== "#") out.push([x, y, "*"]);
  return out;
}

// ---- furnishing helpers ----------------------------------------------------
const L = 1.315; // a long cubicle partition, in cells (2.63m)
const DESK = 0.73;
/** A desk against a wall-side partition, its sitter facing `face` (N or S):
 *  the desk, a CRT on it, the chair, and (by chance) the rest. */
function workstation(x, y, face, k = 0, lite = false) {
  const n = face === "N";
  const out = [
    { p: "office-desk-90s", x, y, r: 90 },
    { p: "crt-monitor", v: 1 + (k % 3), x: x + 0.1, y: y + (n ? -0.05 : 0.05), r: n ? 0 : 180, z: DESK },
    { p: "office-chair-leather", x: x + 0.05, y: y + (n ? 0.45 : -0.45), r: n ? 180 : 0, c: 75 },
    { p: "keyboard-90s", v: 1 + (k % 3), x: x + 0.1, y: y + (n ? 0.13 : -0.13), r: n ? 90 : 270, z: DESK, c: 80 },
  ];
  // every other desk stands bare — no screen, no chair: the seat was
  // cleared out (and a cubicle block stays inside the cost meter's budget)
  if (k % 2) return out.slice(0, 1);
  if (k % 4 === 2) out.push({ p: "desk-phone", x: x - 0.22, y: y + (n ? 0.02 : -0.02), r: n ? 0 : 180, z: DESK, c: 60 });
  else out.push({ p: "logo-mug", v: 1 + (k % 4), x: x - 0.22, y, r: 30 * k, z: DESK, c: 50 });
  if (k % 3 === 0) out.push({ p: "loose-paper", v: 1 + (k % 3), x: x + 0.3, y: y + (n ? 0.4 : -0.4), r: 40 * k, c: 45 });
  return out;
}
/** Four cubicles round a cross of partitions, centred at (cx, cy): walled on
 *  the north and south, each open on its outer east or west side. */
function cubicles(cx, cy, k = 0, lite = false) {
  const P = (x, y, r) => ({ p: "cubicle-partition", v: 1, x, y, r });
  return [
    P(cx - L / 2, cy, 0),
    P(cx + L / 2, cy, 0),
    P(cx, cy - L / 2, 90),
    P(cx, cy + L / 2, 90),
    P(cx - L / 2, cy - L, 0),
    P(cx + L / 2, cy - L, 0),
    P(cx - L / 2, cy + L, 0),
    P(cx + L / 2, cy + L, 0),
    ...workstation(cx - L / 2, cy - L + 0.22, "N", k, lite),
    ...workstation(cx + L / 2, cy - L + 0.22, "N", k + 1, lite),
    ...workstation(cx - L / 2, cy + L - 0.22, "S", k + 2, lite),
    ...workstation(cx + L / 2, cy + L - 0.22, "S", k + 3, lite),
  ];
}

const ROOMS = [
  // ================================================================ SET PIECES
  {
    id: "the-lift-lobby", name: "The Lift Lobby", kind: "liftlobby", set: "any", role: "start", type: "liftlobby", min: 1, max: 1,
    note: "You arrive here from the Electrical Station: the lift on its north wall (the map's edge). Its lights always work, and nothing follows you in.",
    map: fill(16, 8),
    furn: furn(16, 8, [[7, 0, "D"], ...troffers(16, 8, 4, 2)]),
    face: [[7, 0, "N"]],
    props: [
      { p: "elevator-doors", x: 4.0, y: 0.12, r: 0 },
      { p: "elevator-doors", x: 12.0, y: 0.12, r: 0 },
      { p: "armchair-90s", x: 1.0, y: 6.4, r: 0 },
      { p: "armchair-90s", x: 2.3, y: 6.4, r: 0 },
      { p: "potted-plant", x: 0.5, y: 0.5, r: 0 },
      { p: "potted-plant", x: 15.5, y: 0.5, r: 0 },
      { p: "wall-clock", x: 10.0, y: 0.03, r: 0, z: 2.2 },
      { p: "plastic-bin", x: 14.4, y: 7.5, r: 0 },
    ],
  },
  {
    id: "the-security-office", name: "The Security Office", kind: "security", set: "any", role: "key", type: "security", min: 1, max: 1, skip: "N",
    note: "The keycard lies here. A bank of CCTV screens over a desk; the guard's chair is pushed back.",
    map: fill(8, 8),
    furn: furn(8, 8, [[5, 3, "K"], [2, 2, "*"], [5, 5, "*"]]),
    props: [
      { p: "office-desk-90s", x: 2.0, y: 0.45, r: 90 },
      { p: "office-desk-90s", x: 3.3, y: 0.45, r: 90 },
      { p: "crt-monitor", v: 3, x: 1.7, y: 0.4, r: 0, z: DESK },
      { p: "crt-monitor", v: 3, x: 2.3, y: 0.4, r: 0, z: DESK },
      { p: "crt-monitor", v: 3, x: 3.0, y: 0.4, r: 0, z: DESK },
      { p: "crt-monitor", v: 3, x: 3.6, y: 0.4, r: 0, z: DESK },
      { p: "office-chair-leather", x: 2.6, y: 1.5, r: 200 },
      { p: "filing-cabinet", v: 1, x: 7.7, y: 0.6, r: 90 },
      { p: "filing-cabinet", v: 1, x: 7.7, y: 1.3, r: 90 },
      { p: "cork-noticeboard", v: 1, x: 0.05, y: 4.0, r: 270, z: 1.5 },
      { p: "desk-phone", x: 3.9, y: 0.5, r: 0, z: DESK },
      { p: "logo-mug", v: 4, x: 1.3, y: 0.55, r: 60, z: DESK },
    ],
  },
  {
    id: "the-stairwell", name: "The Stairwell", kind: "stairwell", set: "any", role: "goal", type: "stairwell", min: 1, max: 1, skip: "S",
    note: "The way down: a steel door with a badge reader on its south wall. Bring the keycard from the Security Office.",
    map: fill(8, 8),
    furn: furn(8, 8, [[3, 7, "S"], [3, 3, "*"]]),
    face: [[3, 7, "S"]],
    props: [
      { p: "exit-sign-box", x: 4.5, y: 7.95, r: 180, z: 2.3 },
      { p: "plastic-bin", x: 6.5, y: 7.5, r: 0 },
      { p: "archive-box", v: 2, x: 0.5, y: 0.5, r: 20 },
      { p: "archive-box", v: 1, x: 0.6, y: 1.2, r: 75 },
    ],
  },

  // ================================================================ HALLWAYS
  {
    id: "hall-cross", kind: "hallway", set: "any", role: "block", type: "hallway", weight: 2.2,
    note: "A crossing of plain office corridors.",
    map: ["##....##", "##....##", "........", "........", "........", "........", "##....##", "##....##"],
    furn: furn(8, 8, [[3, 1, "*"], [1, 4, "*"], [6, 3, "*"], [4, 6, "*"]]),
  },
  {
    id: "hall-straight", kind: "hallway", set: "any", role: "block", type: "hallway", weight: 2,
    note: "A straight run of corridor.",
    map: rows(8, "##....##"),
    furn: furn(8, 8, [[3, 1, "*"], [4, 5, "*"]]),
    props: [{ p: "water-cooler-90s", x: 2.25, y: 3.6, r: 270, c: 30 }],
  },
  {
    id: "hall-ell", kind: "hallway", set: "any", role: "block", type: "hallway", weight: 1.6,
    note: "A corner in the corridors.",
    map: ["##....##", "##....##", "##......", "##......", "##......", "##......", "########", "########"],
    furn: furn(8, 8, [[3, 1, "*"], [4, 4, "*"]]),
  },
  {
    id: "hall-tee", kind: "hallway", set: "any", role: "block", type: "hallway", weight: 1.6,
    note: "A side corridor branching off a run.",
    map: ["##....##", "##....##", "##......", "##......", "##......", "##......", "##....##", "##....##"],
    furn: furn(8, 8, [[3, 1, "*"], [6, 3, "*"], [3, 6, "*"]]),
    props: [{ p: "potted-plant-90s", x: 2.3, y: 1.0, r: 0, c: 50 }],
  },
  {
    id: "hall-long", kind: "hallway", set: "any", role: "block", type: "hallway", weight: 1, max: 12,
    note: "A long corridor with windows down one side — rain on them, fog behind (they show only where the wall is the building's edge).",
    map: rows(16, "##....##"),
    furn: furn(8, 16, [[3, 1, "*"], [4, 5, "*"], [3, 9, "*"], [4, 13, "*"], [5, 2, "W"], [5, 6, "W"], [5, 10, "W"], [5, 13, "W"]]),
    face: [[5, 2, "E"], [5, 6, "E"], [5, 10, "E"], [5, 13, "E"]],
  },

  // ================================================================ CUBICLES
  {
    id: "cubicle-farm", name: "Cubicle Farm", kind: "cubicles", set: "any", role: "block", type: "cubicles", weight: 1.6, max: 14,
    note: "Four blocks of four cubicles: partitions you can see over, an aisle round them.",
    map: fill(16, 16),
    furn: furn(16, 16, troffers(16, 16)),
    props: [...cubicles(5.0, 5.0, 0, true), ...cubicles(11.0, 5.0, 1, true), ...cubicles(5.0, 11.0, 2, true), ...cubicles(11.0, 11.0, 3, true), { p: "plastic-bin", x: 8.0, y: 8.0, r: 0, c: 50 }],
  },
  {
    id: "cubicle-row", name: "Cubicle Farm", kind: "cubicles", set: "any", role: "block", type: "cubicles", weight: 1.4,
    note: "Two blocks of cubicles across a long room.",
    map: fill(16, 8),
    furn: furn(16, 8, troffers(16, 8)),
    props: [...cubicles(5.0, 4.0, 1), ...cubicles(11.0, 4.0, 2), { p: "office-printer", v: 1, x: 8.0, y: 0.45, r: 0, c: 60 }],
  },
  {
    id: "cubicle-pod", kind: "cubicles", set: "any", role: "block", type: "cubicles", weight: 1.2,
    note: "One block of four cubicles in a small room.",
    map: fill(8, 8),
    furn: furn(8, 8, troffers(8, 8)),
    props: [...cubicles(4.0, 4.0, 2)],
  },

  // ================================================================ BIG ROOMS
  {
    id: "open-floor", name: "Open Floor", kind: "openplan", set: "any", role: "block", type: "openplan", weight: 1, max: 10,
    note: "A vast bare floor: square pillars, nothing else. The carpet still holds the dents of the desks that stood here.",
    map: ["................", "................", "................", "....#......#....", "................", "................", "................", "................", "................", "................", "................", "................", "....#......#....", "................", "................", "................"],
    furn: furn(16, 16, troffers(16, 16)),
    props: [
      { p: "loose-paper", v: 1, x: 7.2, y: 6.3, r: 30, c: 60 },
      { p: "crumpled-paper", v: 1, x: 9.6, y: 9.1, r: 0, c: 50 },
      { p: "archive-box", v: 1, x: 13.4, y: 14.6, r: 15, c: 40 },
    ],
  },
  {
    id: "open-floor-half", kind: "openplan", set: "any", role: "block", type: "openplan", weight: 0.9,
    note: "A bare open floor with two pillars.",
    map: ["................", "................", "................", "....#......#....", "................", "................", "................", "................"],
    furn: furn(16, 8, troffers(16, 8)),
    props: [{ p: "office-chair-leather", x: 8.4, y: 5.2, r: 130, c: 50 }],
  },

  // ================================================================ ROOMS
  {
    id: "conference-room", name: "Conference Room", kind: "conference", set: "any", role: "block", type: "conference", weight: 0.9, max: 6,
    note: "A long table, chairs round it, a whiteboard. Windows along one wall.",
    map: fill(8, 16),
    furn: furn(8, 16, [...troffers(8, 16, 4, 2), [7, 2, "W"], [7, 6, "W"], [7, 10, "W"], [7, 13, "W"]]),
    face: [[7, 2, "E"], [7, 6, "E"], [7, 10, "E"], [7, 13, "E"]],
    props: [
      { p: "long-table", x: 4.0, y: 6.0, r: 90 },
      { p: "long-table", x: 4.0, y: 8.0, r: 90 },
      { p: "long-table", x: 4.0, y: 10.0, r: 90 },
      ...[5.6, 6.6, 7.6, 8.6, 9.6, 10.4].flatMap((y, k) => [
        { p: "office-chair-leather", x: 3.35, y, r: 270, c: 90 },
        { p: "office-chair-leather", x: 4.65, y, r: 90, c: k % 2 ? 90 : 60 },
      ]),
      { p: "whiteboard", x: 4.0, y: 0.35, r: 0 },
      { p: "file-stack", x: 4.0, y: 7.0, r: 10, z: 0.73, c: 60 },
    ],
  },
  {
    id: "corner-office", name: "Corner Office", kind: "corneroffice", set: "any", role: "block", type: "corneroffice", weight: 0.7, max: 6,
    note: "An executive's office: a big desk facing the door, a plant, a bookcase. Windows behind the desk.",
    map: fill(8, 8),
    furn: furn(8, 8, [[2, 2, "*"], [5, 5, "*"], [2, 0, "W"], [5, 0, "W"]]),
    face: [[2, 0, "N"], [5, 0, "N"]],
    props: [
      { p: "office-desk-worn", v: 1, x: 4.0, y: 2.0, r: 0 },
      { p: "office-chair-60s", v: 1, x: 4.0, y: 1.2, r: 0 },
      { p: "armchair-90s", x: 3.2, y: 4.5, r: 180, c: 70 },
      { p: "armchair-90s", x: 4.8, y: 4.5, r: 180, c: 70 },
      { p: "potted-plant", x: 0.5, y: 0.5, r: 0 },
      { p: "bookcase", x: 7.85, y: 2.0, r: 90 },
      { p: "desk-lamp-anglepoise", v: 1, x: 4.9, y: 2.0, r: 200, z: 0.8 },
    ],
  },
  {
    id: "break-room", name: "Break Room", kind: "kitchenette", set: "any", role: "block", type: "kitchenette", weight: 0.9, max: 8,
    note: "Two vending machines, a water cooler, a table. The machines still hum.",
    map: fill(8, 8),
    furn: furn(8, 8, [[2, 2, "*"], [5, 5, "*"]]),
    props: [
      { p: "drinks-vending-machine", x: 1.2, y: 0.25, r: 0 },
      { p: "drinks-vending-machine", x: 6.0, y: 0.25, r: 0 },
      { p: "water-cooler-90s", x: 7.8, y: 2.0, r: 90 },
      { p: "plain-table", x: 4.0, y: 5.0, r: 0 },
      { p: "wood-chair", x: 3.4, y: 5.0, r: 270 },
      { p: "wood-chair", x: 4.6, y: 5.0, r: 90 },
      { p: "coffee-maker", x: 4.1, y: 4.9, r: 0, z: 0.75 },
      { p: "plastic-bin", x: 0.4, y: 7.5, r: 0 },
    ],
  },
  {
    id: "copy-room", name: "Copy Room", kind: "copyroom", set: "any", role: "block", type: "copyroom", weight: 0.8, max: 8,
    note: "The photocopier, two printers and the boxes of paper they were waiting on.",
    map: fill(8, 8),
    furn: furn(8, 8, [[2, 2, "*"], [5, 5, "*"]]),
    props: [
      { p: "photocopier", x: 2.0, y: 0.35, r: 0 },
      { p: "office-printer", v: 1, x: 7.7, y: 1.6, r: 90 },
      { p: "office-printer", v: 2, x: 7.7, y: 6.4, r: 90 },
      { p: "archive-box", v: 1, x: 0.4, y: 5.6, r: 10 },
      { p: "archive-box", v: 2, x: 0.45, y: 6.3, r: 80 },
      { p: "archive-box", v: 1, x: 0.4, y: 6.3, r: 5, z: 0.2 },
      { p: "loose-paper", v: 2, x: 3.4, y: 3.2, r: 20 },
      { p: "loose-paper", v: 1, x: 5.1, y: 2.4, r: 150 },
      { p: "crumpled-paper", v: 2, x: 4.6, y: 4.4, r: 0 },
    ],
  },
  {
    id: "records-room", name: "Records", kind: "records", set: "any", role: "block", type: "records", weight: 0.8, max: 6,
    note: "Rows of filing cabinets and shelving. Narrow aisles, and a long way to see down each.",
    map: fill(8, 16),
    furn: furn(8, 16, troffers(8, 16, 4, 2)),
    props: [
      ...[2, 4.5, 11.5, 14].flatMap((y) => [
        { p: "open-shelving", v: 1, x: 1.6, y, r: 0 },
        { p: "open-shelving", v: 1, x: 6.4, y, r: 0 },
      ]),
      ...[6.8, 7.6, 8.4, 9.2].flatMap((y) => [
        { p: "filing-cabinet", v: 1, x: 0.3, y, r: 270 },
        { p: "filing-cabinet", v: 1, x: 7.7, y, r: 90 },
      ]),
      { p: "archive-box", v: 1, x: 3.6, y: 7.5, r: 30 },
      { p: "file-stack", x: 4.3, y: 8.6, r: 70 },
    ],
  },
  {
    id: "server-room", name: "Server Room", kind: "serverroom", set: "any", role: "block", type: "serverroom", weight: 0.6, max: 4,
    note: "Two rows of cabinets in the dark. One troffer, if it works.",
    map: fill(8, 8),
    furn: furn(8, 8, [[3, 4, "*"]]),
    props: [
      { p: "electrical-cabinet", x: 1.2, y: 1.5, r: 0 },
      { p: "electrical-cabinet", x: 1.2, y: 6.0, r: 0 },
      { p: "electrical-cabinet", x: 6.8, y: 1.5, r: 0 },
      { p: "electrical-cabinet", x: 6.8, y: 6.0, r: 0 },
    ],
  },
  {
    id: "washroom", name: "Washroom", kind: "washroom", set: "any", role: "block", type: "washroom", weight: 0.6, max: 6, skip: "N",
    note: "Three stalls along the north wall, basins opposite.",
    map: fill(8, 8),
    walls: ["........", ".|.|.|..", ".|.|.|..", "........", "........", "........", "........", "........"],
    furn: furn(8, 8, [[2, 4, "*"], [5, 4, "*"]]),
    props: [
      { p: "toilet", v: 2, x: 0.5, y: 0.35, r: 0 },
      { p: "toilet", v: 3, x: 2.5, y: 0.35, r: 0 },
      { p: "toilet", v: 2, x: 4.5, y: 0.35, r: 0 },
      { p: "wall-basin", x: 5.0, y: 7.86, r: 180, z: 0.8 },
      { p: "wall-basin", x: 6.4, y: 7.86, r: 180, z: 0.8 },
      { p: "led-mirror", v: 1, x: 5.0, y: 7.95, r: 180, z: 1.35 },
      { p: "led-mirror", v: 1, x: 6.4, y: 7.95, r: 180, z: 1.35 },
      { p: "pedal-bin", x: 7.6, y: 7.0, r: 0 },
    ],
  },
  {
    id: "reception", name: "Reception", kind: "reception", set: "any", role: "block", type: "reception", weight: 0.6, max: 4,
    note: "A long front desk, a waiting area of armchairs, a clock that has stopped.",
    map: fill(16, 8),
    furn: furn(16, 8, troffers(16, 8)),
    props: [
      { p: "office-desk-worn", v: 2, x: 8.0, y: 3.0, r: 180 },
      { p: "office-chair-leather", x: 8.0, y: 2.2, r: 0 },
      { p: "crt-monitor", v: 1, x: 7.6, y: 3.0, r: 0, z: 0.8 },
      { p: "desk-phone", x: 8.6, y: 3.0, r: 0, z: 0.8 },
      { p: "armchair-90s", x: 1.0, y: 6.5, r: 0 },
      { p: "armchair-90s", x: 2.3, y: 6.5, r: 0 },
      { p: "armchair-90s", x: 13.7, y: 6.5, r: 0 },
      { p: "armchair-90s", x: 15.0, y: 6.5, r: 0 },
      { p: "potted-plant", x: 0.5, y: 0.5, r: 0 },
      { p: "potted-plant", x: 15.5, y: 0.5, r: 0 },
      { p: "wall-clock", x: 8.0, y: 0.03, r: 0, z: 2.2 },
    ],
  },
  {
    id: "supply-closet", name: "Supply Closet", kind: "supply", set: "any", role: "block", type: "supply", weight: 0.6, max: 8,
    note: "Shelves of paper and toner, boxes on the floor.",
    map: fill(8, 8),
    furn: furn(8, 8, [[3, 4, "*"]]),
    props: [
      { p: "open-shelving", v: 1, x: 1.6, y: 0.35, r: 0 },
      { p: "open-shelving", v: 1, x: 6.4, y: 0.35, r: 0 },
      { p: "office-cupboard", v: 1, x: 0.25, y: 6.0, r: 270 },
      { p: "archive-box", v: 2, x: 6.8, y: 6.6, r: 0 },
      { p: "archive-box", v: 1, x: 7.4, y: 6.9, r: 40 },
      { p: "archive-box", v: 2, x: 6.9, y: 6.6, r: 5, z: 0.2 },
      { p: "bucket", v: 1, x: 7.5, y: 5.2, r: 0 },
    ],
  },
];

const out = [];
let bad = 0;
for (const r of ROOMS) {
  const def = { ...r, doors: r.doors ?? slotsWhereOpen(r.map, r.skip) };
  delete def.skip;
  const l = lintOfficeTile(def);
  for (const e of l.errors) console.log(`✗ ${r.id}: ${e}`);
  for (const w of l.warnings) console.log(`  ${r.id}: ${w}`);
  if (l.errors.length) bad++;
  out.push(def);
}
writeFileSync(path.join(ROOT, "src", "backrooms", "office-rooms.json"), formatLibrary(out));
console.log(`${out.length} rooms → src/backrooms/office-rooms.json${bad ? `  (${bad} with errors)` : ""}`);
process.exit(bad ? 1 : 0);
