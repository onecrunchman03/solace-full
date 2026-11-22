// SURVIVORZ: specimen containment's layout (ASSETS.md step D, zone 7), written as a program so every position
// comes from the room's walls and the packed props' real sizes (props.json), never a guess.
// Writes client/src/survivorz/room/containment.json (room-build.py --set containment reads it too).
// The design, room by room, and its references: SURVIVORZ.md "SPECIMEN CONTAINMENT", REFERENCES.md round eleven.
//
//   node scripts/survivorz/layout-containment.mjs
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const G = JSON.parse(fs.readFileSync(path.join(ROOT, "assets/downloads/survivorz/set/greybox.json"), "utf8"));
const PROPS = JSON.parse(fs.readFileSync(path.join(ROOT, "assets/downloads/survivorz/props/props.json"), "utf8"));
const OUT = path.join(ROOT, "client/src/survivorz/room/containment.json");

let st = 7731;
const rnd = () => { st = (st + 0x6d2b79f5) >>> 0; let t = st; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const jit = (a) => (rnd() - 0.5) * 2 * a;
const r3 = (v) => +v.toFixed(3);

const rooms = G.rooms.filter((r) => r.zone === "containment");
const RECT = Object.fromEntries(rooms.map((r) => [r.id, r.rect]));
const TOP = Object.fromEntries(rooms.map((r) => [r.id, r.top]));
const BOT = Object.fromEntries(rooms.map((r) => [r.id, r.bottom]));   // the plant floor is 8 m down: every prop stands on its own room's floor
const T = 0.1, SKIN = 0.02;
const inner = (id, skin = false) => { const r = RECT[id], s = T + (skin ? SKIN : 0); return { x0: r.x + s, x1: r.x + r.w - s, z0: r.y + s, z1: r.y + r.h - s }; };
const size = (id) => { const p = PROPS[id]; if (!p) throw new Error(`no packed prop ${id}`); return p.size; };

const props = [], fixtures = [], decals = [], arch = [], cutouts = [];
const put = (id, room, x, y, z, yaw = 0, extra = {}) => { props.push({ id, at: [r3(x), r3(y + BOT[room]), r3(z)], yaw: r3(yaw), room, ...extra }); return props[props.length - 1]; };
function wall(id, room, side, along, { y = 0, skin = false, out = 0, extra = {} } = {}) {
  const I = inner(room, skin), d = size(id)[2] / 2 + out;
  if (side === "N") return put(id, room, along, y, I.z0 + d, 0, extra);
  if (side === "S") return put(id, room, along, y, I.z1 - d, 180, extra);
  if (side === "W") return put(id, room, I.x0 + d, y, along, 90, extra);
  return put(id, room, I.x1 - d, y, along, -90, extra);
}
const local = (p, lx, ly, lz) => { const t = (p.yaw * Math.PI) / 180; return [r3(p.at[0] + lx * Math.cos(t) + lz * Math.sin(t)), r3(p.at[1] + ly), r3(p.at[2] - lx * Math.sin(t) + lz * Math.cos(t))]; };
const on = (p, id, lx, ly, lz, dyaw = 0, extra = {}) => { props.push({ id, at: local(p, lx, ly, lz), yaw: r3(p.yaw + dyaw), room: p.room, ...extra }); return props[props.length - 1]; };
const emergency = (room, x, y, z, face) => fixtures.push({ kind: "emergency", at: [x, y, z], face, room, bank: 0 });
const exit = (room, x, y, z, face) => fixtures.push({ kind: "exit", at: [x, y, z], face, room, bank: 0 });
const panel = (room, x, z, circuit = "mains", style) => fixtures.push({ kind: "panel-flush", at: [x, TOP[room], z], room, bank: 0, ...(circuit ? { circuit } : {}), ...(style ? { style } : {}) });
const plate = (tex, x, y, z, n, w = 0.3, h = 0.15) => decals.push({ tex, at: [r3(x), y, r3(z)], n, size: [w, h], opaque: true });
const stain = (tex, x, z, w, h, rot = 0) => decals.push({ tex, at: [r3(x), 0.004, r3(z)], n: [0, 1, 0], size: [w, h], rot });
function glazing(axis, c, a0, a1, y0, y1, what) {
  const t = 0.012;
  arch.push({ what: `${what} pane`, glass: axis === "z" ? [r3(a0 + 0.04), y0, r3(c - t), r3(a1 - 0.04), y1, r3(c + t)] : [r3(c - t), y0, r3(a0 + 0.04), r3(c + t), y1, r3(a1 - 0.04)] });
  for (const [ya, yb] of [[y0 - 0.06, y0], [y1, y1 + 0.06]]) arch.push({ what: `${what} frame`, key: "steel", box: axis === "z" ? [a0, ya, r3(c - 0.11), a1, yb, r3(c + 0.11)] : [r3(c - 0.11), ya, a0, r3(c + 0.11), yb, a1] });
  for (const a of [a0, a1]) arch.push({ what: `${what} frame`, key: "steel", box: axis === "z" ? [r3(a - 0.04), y0, r3(c - 0.11), r3(a + 0.04), y1, r3(c + 0.11)] : [r3(c - 0.11), y0, r3(a - 0.04), r3(c + 0.11), y1, r3(a + 0.04)] });
}

const wallStain = (tex, x, y, z, n, w, h, rot = 0) => decals.push({ tex, at: [r3(x), y, r3(z)], n, size: [w, h], rot });
const F = -8;   // the plant floor
const stainF = (tex, x, z, w, h, rot = 0) => decals.push({ tex, at: [r3(x), F + 0.004, r3(z)], n: [0, 1, 0], size: [w, h], rot });
const paint = (tex, x, z, w, h, rot = 0, repeat) => decals.push({ tex, at: [r3(x), F + 0.003, r3(z)], n: [0, 1, 0], size: [w, h], rot, paint: true, ...(repeat ? { repeat } : {}) });
const caged = (room, x, z, opts = {}) => fixtures.push({ kind: "caged", at: [x, r3((opts.y ?? TOP[room]) - 0.2), z], yaw: opts.yaw ?? 0, room, bank: 0, ...(opts.circuit === null ? {} : { circuit: opts.circuit ?? "mains" }), ...(opts.style ? { style: opts.style } : {}) });
// the free switchboard and control cabinet face +x in their own files: turn them so their front faces `face`
const FRONT = { switchboard: -90, "control-cabinet": -90 };
const putFacing = (id, room, x, y, z, face, extra) => put(id, room, x, y, z, face + (FRONT[id] ?? 0), extra);
const smearGlass = (x, y, z, n, w, h, rot = 0) => decals.push({ tex: "smear", at: [r3(x), F + y, r3(z)], n, size: [w, h], rot });

// ---- styles ---------------------------------------------------------------------------------------------------------
// the block is the company's most expensive room and its most guarded: sealed white epoxy walls and floors, stainless
// at the cells, the observation deck in carpet tile and dark acoustic panel; the cryo hall in steel and painted block
const styles = {
  "containment-stairs": { floor: "painted-floor", ceiling: "slab", bands: [[99, "vault-wall"]] },
  observation: { floor: "carpet-tile", ceiling: "office-ceiling", bands: [[0.12, "plinth"], [1.1, "panel-dark"], [99, "panel-white"]] },
  "specimen-cells": { floor: "lab-floor", ceiling: "ceiling-white", bands: [[0.12, "plinth"], [1.2, "stainless"], [99, "lab-wall"]] },
  "sample-storage": { floor: "lab-floor", ceiling: "ceiling-white", bands: [[0.12, "plinth"], [99, "lab-wall"]] },
  "cryo-hall": { floor: "diamond-plate", ceiling: "slab", bands: [[0.12, "skirting"], [1.6, "steel-plate"], [99, "painted-wall"]] },
  "cryo-pod": { floor: "steel-plate", ceiling: "slab", bands: [[99, "steel-plate"]] },
};
const skins = {};
const tint = { "carpet-tile": [0.5, 0.52, 0.56] };

// ================================================================================================================
// THE CONTAINMENT STAIRS (x 100-106, z 60-70): the shaft down from Security, built from the map's own flights in
// steel plate like the service stairs, with hazard paint on its top landing.
{
  const R = "containment-stairs";
  for (const b of G.boxes.filter((q) => q.room === R)) {
    if (b.cat === "stairs" || b.cat === "landing") arch.push({ what: `containment stair ${b.cat}`, key: "steel-plate", box: [...b.min, ...b.max].map(r3) });
    else if (b.cat === "rail") arch.push({ what: "containment stair wall", key: b.max[1] > 0.5 ? "steel-plate" : "painted-wall", box: [...b.min, ...b.max].map(r3) });
  }
  caged(R, 103.0, 65.0, { y: 3.0 });
  const half = G.boxes.filter((q) => q.room === R && q.cat === "landing").sort((a, b) => a.max[1] - b.max[1])[0];
  if (half) caged(R, r3((half.min[0] + half.max[0]) / 2), r3((half.min[2] + half.max[2]) / 2), { y: half.min[1] });
  emergency(R, 105.9, -5.6, 62.0, [-1, 0, 0]); emergency(R, 100.1, 2.3, 68.0, [1, 0, 0]);
  plate("plate-containment-stairs", 104.4, 1.6, 69.88, [0, 0, -1]);
  plate("plate-observation", 100.1, F + 1.6, 66.4, [1, 0, 0]);
}

// ================================================================================================================
// THE OBSERVATION DECK (x 84-100, z 60-70): the staff side of the glass. Two consoles against the window onto the
// specimen cells, the observation terminal on its desk behind them, the lab coats on their stand, a wall of files;
// the lockdown notice by the cell block's door.
{
  const R = "observation", I = inner(R);
  cutouts.push({ axis: "z", c: 70, a0: 84.3, a1: 90.6, y0: F + 0.95, y1: F + 2.7 }, { axis: "z", c: 70, a0: 93.4, a1: 99.7, y0: F + 0.95, y1: F + 2.7 });
  glazing("z", 70, 84.3, 90.6, F + 0.95, F + 2.7, "observation window west"); glazing("z", 70, 93.4, 99.7, F + 0.95, F + 2.7, "observation window east");
  for (const [x, z, st] of [[87, 63.5], [97, 63.5, "failing"], [92, 62.5]]) panel(R, x, z, "mains", st);   // the watching side is kept dim (C16, C23)
  emergency(R, 92.0, F + 3.6, r3(I.z0), [0, 0, 1]);
  for (const x of [87.4, 96.6]) {
    put("control-console", R, x, 0, 69.35, 180);
    for (const dx of [-0.9, 0.9]) put("office-chair", R, x + dx + jit(0.15), 0, 68.3 + jit(0.1), jit(30));
  }
  const d = wall("office-desk", R, "N", 92.0);
  on(d, "flat-monitor", -0.3, 0.787, -0.25, 0, { note: "the observation-terminal" }); on(d, "flat-monitor", 0.35, 0.787, -0.25, -15);
  on(d, "clipboard", 0.6, 0.787, 0.15, 20); on(d, "coffee-cup", -0.7, 0.787, 0.1);
  put("office-chair", R, 92.0, 0, 61.9, 180 + jit(25));
  wall("coat-stand", R, "W", 61.0); wall("filing-cabinet", R, "N", 85.0); wall("filing-cabinet", R, "N", 85.4); wall("filing-cabinet", R, "N", 98.6);
  wall("whiteboard", R, "N", 95.6, { y: 0.9 });
  put("clipboard-pen", R, 89.6, 0, 66.4, 40); put("file-folder", R, 94.2, 0, 64.8, 120); put("coffee-cup", R, 90.3, 0, 67.6, 0, { rot: [90, 30, 0] });
  decals.push({ tex: "sign-lockdown", at: [94.0, F + 1.55, r3(I.z1)], n: [0, 0, -1], size: [0.42, 0.29], opaque: true });
  decals.push({ tex: "pressure-75", at: [89.9, F + 2.0, r3(I.z1)], n: [0, 0, -1], size: [0.15, 0.2], opaque: true });
  plate("plate-specimen-cells", 94.0, F + 2.1, r3(I.z1), [0, 0, -1]);
  plate("plate-cryo-hall", r3(I.x0), F + 1.6, 66.4, [1, 0, 0]);
}

// ================================================================================================================
// THE SPECIMEN CELLS (x 84-100, z 70-82): a viewing corridor along the observation glass, four cells along the back
// behind laminated fronts, and a passage between them to sample storage. Each cell: a bolted restraint bed, a drain,
// a camera. Sealed at the alarm; what was in them is the game's.
{
  const R = "specimen-cells", I = inner(R);
  const FRONT_Z = 77.0;
  const cells = [85.6, 92.1, 95.1, 98.1];   // cell centres (3.0 wide); the passage to storage is x 89.4-90.6
  cells.forEach((x, k) => {
    put("cell-front", R, x, 0, FRONT_Z, 180, { note: `specimen cell ${k + 1}, sealed` });
    decals.push({ tex: `cell-${k + 1}`, at: [r3(x - 0.79), F + 2.5, r3(FRONT_Z - 0.128)], n: [0, 0, -1], size: [0.4, 0.2], opaque: true });
    put("restraint-bed", R, x + 0.6, 0, 80.7, 180);
    put("security-camera", R, x - 1.2, 3.6, 81.7, 180);
    panel(R, x, 79.6, "mains", k === 2 ? "failing" : undefined);
    stainF("grime-floor", x, 79.6, 0.6, 0.6);   // the drain
  });
  // the partitions between the cells, and the passage's walls
  for (const x of [87.15, 89.4, 90.6, 93.6, 96.6, 99.6]) arch.push({ what: "cell partition", key: "lab-wall", box: [r3(x - 0.05), F, FRONT_Z, r3(x + 0.05), TOP[R], r3(I.z1)] });
  arch.push({ what: "cell partition", key: "lab-wall", box: [99.6, F, FRONT_Z - 0.13, r3(I.x1), TOP[R], r3(I.z1)] });
  arch.push({ what: "store alcove front", key: "lab-wall", box: [87.15, F + 2.6, r3(FRONT_Z - 0.13), 89.4, TOP[R], r3(FRONT_Z + 0.13)] });
  // the second cell's glass has been hit from inside
  smearGlass(92.9, 1.3, FRONT_Z + 0.03, [0, 0, 1], 0.5, 0.8, 15);
  // the corridor: lights, the hazard line in front of the glass, the supply alcove's shelving
  for (const x of [86, 90, 94, 98]) panel(R, x, 73.5);
  emergency(R, 84.1, F + 3.4, 73.5, [1, 0, 0]); emergency(R, 99.9, F + 3.4, 73.5, [-1, 0, 0]);
  paint("paint-hazard", 92.0, 76.4, 15.6, 0.25, 0, [15, 1]);
  put("shelving-steel", R, 88.3, 0, 81.6, 180); put("biohazard-bin", R, 88.0, 0, 78.4, 0); put("glove-dispenser", R, 88.3, 1.3, r3(I.z1 - 0.08), 180);
  put("hazmat-suit-hung", R, 84.6, 0, 74.2, 90); put("hazmat-suit-hung", R, 84.6, 0, 72.6, 90);
  for (const x of [86.5, 91.0, 96.5]) put("air-hose", R, x, r3(TOP[R] - BOT[R] - 1.0), 74.8, 0);   // the suit air, coiled from the ceiling (C2, C4)
  put("sharps-bin", R, 99.3, 0, 71.2, -90);
  plate("plate-sample-storage", 89.3, F + 1.6, r3(I.z1), [0, 0, -1]);
  stainF("prints-shoes", 91.0, 73.6, 1.4, 1.0, 270);
}

// ================================================================================================================
// SAMPLE STORAGE (x 84-96, z 82-90): the −80 °C freezer farm along the walls, two LN2 supply dewars, racked sample
// cases; one freezer left open.
{
  const R = "sample-storage", I = inner(R);
  for (const [x, z] of [[87, 85], [93, 85], [90, 88]]) panel(R, x, z);
  emergency(R, 95.9, F + 2.6, 84.0, [-1, 0, 0]);
  for (let k = 0; k < 9; k++) wall("freezer-80", R, "S", 84.6 + k * 0.92 + 0.45);
  for (const z of [84.0, 85.0]) wall("freezer-80", R, "W", z);
  wall("ln2-dewar", R, "E", 87.0); wall("ln2-dewar", R, "E", 88.2);
  const s = wall("shelving-steel", R, "E", 85.0);
  [[0.59, "sample-case"], [0.98, "cold-case"], [1.36, "cold-case"]].forEach(([y, id]) => { if (rnd() < 0.9) on(s, id, jit(0.1), y, 0); });
  put("cold-case", R, 91.0, 0, 86.5, 30); put("test-tubes", R, 91.4, 0, 86.9, 70);
  stainF("grime-floor", 88.0, 88.2, 1.2, 0.9, 40);
}

// ================================================================================================================
// THE CRYO HALL (x 66-84, z 58-76, 6 m): rows of cryostorage dewars, numbered, their level controllers facing the
// aisles; the LN2 supply along the east wall; the cryo terminal in the middle; Cryo Pod 7's sealed door in the west
// wall; the freight lift's keycard door in the south.
{
  const R = "cryo-hall", I = inner(R);
  for (const x of [69.5, 74.5, 79.5]) for (const z of [61.5, 67.0, 72.5]) caged(R, x, z);
  emergency(R, 66.1, F + 3.4, 61.0, [1, 0, 0]); emergency(R, 83.9, F + 3.4, 71.0, [-1, 0, 0]); emergency(R, 74.0, F + 3.4, r3(I.z1), [0, 0, -1]);
  let n = 0;
  const row = (z, yaw, xs) => xs.forEach((x) => {
    n += 1; if (n === 7) n += 1;   // Pod 7 is its own room
    put("cryo-dewar", R, x, 0, z, yaw, { note: `dewar ${n}` });
    decals.push({ tex: `dewar-${n}`, at: [x, F + 0.85, r3(z + (yaw === 0 ? 0.811 : -0.811))], n: [0, 0, yaw === 0 ? 1 : -1], size: [0.4, 0.2], opaque: true });
  });
  row(59.0, 0, [68.4, 70.6, 72.8, 75.0, 77.2, 79.4]);
  row(66.3, 180, [70.0, 72.2, 78.0, 80.2]);
  row(69.6, 0, [70.0, 72.2, 78.0, 80.2]);
  for (const z of [60.6, 70.6]) wall("pipe-rack", R, "E", z);   // (the observation door is at z 65)
  wall("ln2-dewar", R, "E", 73.6); wall("ln2-dewar", R, "E", 74.6);
  const t = put("control-console", R, 75.1, 0, 67.9, 0, { note: "the cryo-terminal" });
  put("office-chair", R, 75.1, 0, 69.2, 180, { rot: [86, 200, 0] });
  for (const z of [62, 66, 70]) put("cable-tray", R, 75.0, 5.2, z, 90);
  plate("plate-cryo-pod", r3(I.x0), F + 1.6, 68.3, [1, 0, 0]);
  decals.push({ tex: "sign-lockdown", at: [r3(I.x0), F + 1.5, 65.6], n: [1, 0, 0], size: [0.42, 0.29], opaque: true });
  paint("paint-hazard", 74.0, 74.9, 3.0, 0.25, 0, [3, 1]);
  put("ladder", R, 68.4, 0, 60.3, 0, { rot: [-14, 0, 0] }); put("ladder", R, 80.2, 0, 70.8, 180, { rot: [-14, 180, 0] });   // step-ladders leant on the dewars (C17)
  paint("paint-walkway", 74.95, 66.0, 0.1, 15.0); paint("paint-walkway", 73.05, 66.0, 0.1, 15.0);   // the aisle to the freight lift
  paint("paint-walkway", 74.0, 61.6, 13.0, 0.1); paint("paint-walkway", 74.0, 63.4, 13.0, 0.1);
  stainF("grime-floor", 71.0, 63.5, 1.4, 1.0, 20); stainF("prints-shoes", 75.0, 73.0, 1.4, 1.0, 90);
}
{
  const R = "cryo-pod", I = inner(R);
  panel(R, 63.0, 67.0, "battery", "failing");
  put("stasis-chamber", R, 62.6, 0, 67.0, 90, { note: "Cryo Pod 7" });
  stainF("grime-floor", 63.4, 67.0, 1.6, 1.6, 0);
}

// ---- out ---------------------------------------------------------------------------------------------------------
const L = {
  about: "SPECIMEN CONTAINMENT (docs/survivorz/ASSETS.md step D, zone 7). Written by scripts/survivorz/layout-containment.mjs (edit that, not this); read by scripts/survivorz/room-build.py --set containment and client/src/survivorz/room/lobby.ts.",
  rooms: rooms.map((r) => r.id),
  roomRects: Object.fromEntries(rooms.map((r) => [r.id, { x: r.rect.x, z: r.rect.y, w: r.rect.w, h: r.rect.h, zone: r.zone }])),
  styles, skins, arch, cutouts, props, fixtures, decals, cast: [],
  shots: {
    stairs: { at: [104.6, F + 1.65, 69.5], look: [101.5, F + 3.6, 61.5], label: "The containment stairs, up to the half landing" },
    observation: { at: [98.5, F + 1.65, 60.8], look: [88.0, F + 1.4, 70.0], label: "The observation deck" },
    glass: { at: [92.0, F + 1.65, 68.2], look: [92.0, F + 1.3, 80.0], label: "Through the glass" },
    cells: { at: [84.6, F + 1.65, 71.2], look: [96.0, F + 1.2, 78.0], label: "The specimen cells" },
    cell: { at: [94.2, F + 1.65, 73.4], look: [95.4, F + 0.7, 81.5], label: "Cell 3" },
    storage: { at: [90.0, F + 1.65, 82.6], look: [90.0, F + 0.9, 89.5], label: "Sample storage" },
    cryo: { at: [83.0, F + 1.8, 65.0], look: [68.0, F + 1.2, 66.0], label: "The cryo hall" },
    dewars: { at: [74.0, F + 1.65, 75.0], look: [72.0, F + 1.2, 59.0], label: "The dewars" },
    pod: { at: [65.5, F + 1.65, 69.4], look: [61.5, F + 1.0, 66.0], label: "Cryo Pod 7" },
  },
  tint,
  kit: { copies: [] },
  catcher: { at: [84, 72], size: [52, 36] },
  shadowSpots: [],
  puddles: [],
};
fs.writeFileSync(OUT, JSON.stringify(L, null, 2) + "\n");
console.log(`containment: ${props.length} props, ${fixtures.length} fixtures, ${arch.length} arch, ${decals.length} decals`);
