// SURVIVORZ: the residential wing's layout (ASSETS.md step D, zone 2), written as a program so every
// position comes from the room's walls and the packed props' real sizes (props.json), never a guess.
// Writes client/src/survivorz/room/residential.json (room-build.py --set residential reads it too).
// The design, room by room, and its references: SURVIVORZ.md "THE RESIDENTIAL WING", REFERENCES.md round six.
//
//   node scripts/survivorz/layout-residential.mjs
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const G = JSON.parse(fs.readFileSync(path.join(ROOT, "assets/downloads/survivorz/set/greybox.json"), "utf8"));
const PROPS = JSON.parse(fs.readFileSync(path.join(ROOT, "assets/downloads/survivorz/props/props.json"), "utf8"));
const OUT = path.join(ROOT, "client/src/survivorz/room/residential.json");
const prev = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, "utf8")) : {};

// a seeded roll, so a rerun lays the same mess
let st = 9157;
const rnd = () => { st = (st + 0x6d2b79f5) >>> 0; let t = st; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const jit = (a) => (rnd() - 0.5) * 2 * a;
const r3 = (v) => +v.toFixed(3);

const rooms = G.rooms.filter((r) => r.zone === "residential");
const RECT = Object.fromEntries(rooms.map((r) => [r.id, r.rect]));
const T = 0.1;                    // half the wall: a room's inner face is its rect 0.1 in
const SKIN = 0.02;                // the hall skin's panels stand 20 mm proud
const inner = (id, skin = false) => { const r = RECT[id], s = T + (skin ? SKIN : 0); return { x0: r.x + s, x1: r.x + r.w - s, z0: r.y + s, z1: r.y + r.h - s }; };
const size = (id) => { const p = PROPS[id]; if (!p) throw new Error(`no packed prop ${id}`); return p.size; };   // [x, height, z]

const props = [], fixtures = [], decals = [];
// every packed prop faces +z; a yaw turns it: 0 faces +z (south), 180 north, 90 +x (east), -90 west
const put = (id, room, x, y, z, yaw = 0, extra = {}) => props.push({ id, at: [r3(x), r3(y), r3(z)], yaw: r3(yaw), room, ...extra });
// against a wall, facing into the room: `along` is the coordinate along the wall
const FACE = { N: { yaw: 0, n: [0, 1] }, S: { yaw: 180, n: [0, -1] }, W: { yaw: 90, n: [1, 0] }, E: { yaw: -90, n: [-1, 0] } };
function wall(id, room, side, along, { y = 0, skin = false, out = 0, extra = {} } = {}) {
  const I = inner(room, skin), d = size(id)[2] / 2 + out;
  if (side === "N") put(id, room, along, y, I.z0 + d, 0, extra);
  if (side === "S") put(id, room, along, y, I.z1 - d, 180, extra);
  if (side === "W") put(id, room, I.x0 + d, y, along, 90, extra);
  if (side === "E") put(id, room, I.x1 - d, y, along, -90, extra);
}
// a point in a placed prop's own frame (x along it, z out of its front, y up), turned into the world
const local = (p, lx, ly, lz) => { const t = (p.yaw * Math.PI) / 180; return [r3(p.at[0] + lx * Math.cos(t) + lz * Math.sin(t)), r3(p.at[1] + ly), r3(p.at[2] - lx * Math.sin(t) + lz * Math.cos(t))]; };
const last = () => props[props.length - 1];
// a steel rack's contents (shelving-steel, measured 2026-10-27 off the bake copy: 1.58 m long, 0.56 deep, shelf tops
// at 0.08 / 0.59 / 0.98 / 1.36 / 1.75 m): rows of `id` across a shelf, each `gap` apart, `fill` of the slots taken
const SHELVES = [0.08, 0.59, 0.98, 1.36, 1.75];
function stock(rack, rows, fill = 0.9) {
  rows.forEach((row, k) => {
    if (!row) return;
    const [id, step, stack = 1] = row;
    const n = Math.floor(1.44 / step);
    for (let i = 0; i < n; i++) {
      if (rnd() > fill) continue;
      const lx = -0.72 + step / 2 + i * step + jit(0.015);
      for (let h = 0; h < stack; h++) props.push({ id, at: local(rack, lx, SHELVES[k] + h * size(id)[1], jit(0.03)), yaw: r3(rack.yaw + jit(4)), room: rack.room });
    }
  });
}

// ---- styles and skins (room-build.py) --------------------------------------------------------------------------
const styles = {
  "res-corridor": { floor: "polished-concrete", ceiling: "ceiling-white", bands: [[99, "panel-white"]], skin: "hall" },
  canteen: { floor: "polished-concrete", ceiling: "ceiling-white", bands: [[99, "panel-white"]], skin: "hall" },
  kitchen: { floor: "kitchen-floor", ceiling: "ceiling-white", bands: [[99, "decon-tiles"]] },
  stores: { floor: "painted-floor", ceiling: "slab", bands: [[99, "painted-wall"]] },
  "safe-res": { floor: "painted-floor", ceiling: "slab", bands: [[0.12, "skirting"], [99, "painted-wall"]] },
  "bunks-a": { floor: "carpet-tile", ceiling: "ceiling-white", bands: [[99, "panel-white"]], skin: "hall" },
  "bunks-b": { floor: "carpet-tile", ceiling: "ceiling-white", bands: [[99, "panel-white"]], skin: "hall" },
  showers: { floor: "kitchen-floor", ceiling: "ceiling-white", bands: [[99, "decon-tiles"]] },
  "rec-room": { floor: "carpet-tile", ceiling: "ceiling-white", bands: [[99, "panel-white"]], skin: "hall" },
  "panic-room": { floor: "diamond-plate", ceiling: "steel-plate", bands: [[99, "steel-plate"]] },
};
const skins = {
  "res-corridor": { room: "res-corridor", ceilY: 2.8, slotAxis: "x", slotPitch: 1.6, slotZ0: 43, slotInset: 0.8, slotWidth: 0.06 },
  canteen: { room: "canteen", ceilY: 3.4, slotPitch: 2.4, slotX0: 23, slotInset: 0.6, slotWidth: 0.06 },
  "bunks-a": { room: "bunks-a", ceilY: 2.6, slotPitch: 2.4, slotX0: 12, slotInset: 0.6, slotWidth: 0.06 },
  "bunks-b": { room: "bunks-b", ceilY: 2.6, slotPitch: 2.4, slotX0: 24, slotInset: 0.6, slotWidth: 0.06 },
  "rec-room": { room: "rec-room", ceilY: 3.0, slotPitch: 2.4, slotX0: 47, slotInset: 0.6, slotWidth: 0.06, panelKey: "panel-accent" },
};
const slot = (room, x, z, style) => fixtures.push({ kind: "slot", at: [x, skins[room].ceilY + 0.06, z], room, bank: 0, ...(style ? { style } : {}) });
const emergency = (room, x, y, z, face) => fixtures.push({ kind: "emergency", at: [x, y, z], face, room, bank: 0 });
const exit = (room, x, y, z, face) => fixtures.push({ kind: "exit", at: [x, y, z], face, room, bank: 0 });
const panel = (room, x, z, circuit, style) => fixtures.push({ kind: "panel-flush", at: [x, RECT_TOP[room], z], room, bank: 0, ...(circuit ? { circuit } : {}), ...(style ? { style } : {}) });
const caged = (room, x, z, style) => fixtures.push({ kind: "caged", at: [x, RECT_TOP[room] - 0.2, z], yaw: 0, room, bank: 0, ...(style ? { style } : {}) });
const RECT_TOP = Object.fromEntries(rooms.map((r) => [r.id, r.top]));

// ================================================================================================================
// THE CORRIDOR (x 0-60, z 40-46): the residential street. Its ceiling lines are mains only; in the blackout the
// battery twin-heads over every second door and the exit signs light it (references R18, rule 4).
{
  const R = "res-corridor", I = inner(R, true);
  emergency(R, 12, 2.42, I.z1, [0, 0, -1]); emergency(R, 35, 2.42, I.z1, [0, 0, -1]);
  emergency(R, 25.4, 2.42, I.z0, [0, 0, 1]); emergency(R, 50.0, 2.42, I.z0, [0, 0, 1]);
  exit(R, 57, 2.55, I.z0, [0, 0, 1]);   // over the doorway back to decon (the way out)
  exit(R, 8, 2.35, I.z0, [0, 0, 1]);    // over the safe room's door
  // a water fountain, extinguishers, the cleaning things people leave in a corridor; the trail of the run
  wall("water-dispenser", R, "N", 32.5, { skin: true });
  wall("fire-extinguisher", R, "S", 29.5, { skin: true });
  wall("fire-extinguisher", R, "N", 15.2, { skin: true });
  wall("snake-plant", R, "N", 44.0, { skin: true });
  wall("laundry-basket", R, "S", 13.4, { skin: true });
  put("sneakers", R, 10.6, 0, I.z1 - 0.3, 172); put("sneakers", R, 25.3, 0, I.z1 - 0.25, 188);
  put("backpack-small", R, 16.5, 0, 43.4, 64, { rot: [0, 64, 92] });
  put("id-card", R, 19.2, 0, 42.6, 31);
  put("paper-debris", R, 21.5, 0, 43.1, 140); put("paper-debris", R, 12.5, 0, 42.0, 30);
  put("food-tray", R, 22.1, 0, 41.3, 205, { rot: [0, 205, 4] });
  put("water-bottle", R, 9.6, 0, 41.9, 0, { rot: [90, 20, 0] });
}

// ================================================================================================================
// THE CANTEEN (x 14-32, z 26-40): frozen at the alarm (R24). The serving line on the east wall against the
// kitchen, eight tables in three rows round a central aisle from the doorway, the big screen on the north wall.
{
  const R = "canteen", I = inner(R, true);
  slot(R, 23, 33, "failing");
  exit(R, 23, 2.62, I.z1, [0, 0, -1]);
  // the window screen (R10/R23), the menu screen, the notice board with record R-04
  wall("window-screen", R, "N", 23, { skin: true, y: 1.0 });
  wall("wall-tv", R, "N", 28.6, { skin: true, y: 1.5 });
  // the serving line: two sections facing west, the staff aisle behind against the kitchen wall
  const sx = I.x1 - 1.25 - size("servery")[2] / 2;
  for (const z of [28.4, 30.82]) put("servery", R, sx, 0, z, -90);
  wall("fridge", R, "N", 28.0, { skin: true });   // on the north wall: the staff aisle behind the line stays clear
  wall("steel-counter", R, "N", 30.3, { skin: true });   // the tray and cutlery stand at the start of the line
  for (let k = 0; k < 4; k++) put("food-tray", R, 30.0 - 0.02 * k, 0.9 + 0.012 * k, 26.65, 2);
  put("mug-white", R, 30.7, 0.9, 26.55, 30); put("mug-white", R, 30.85, 0.9, 26.7, 110);
  // the tables: cols at x 16.8 / 20.4 / 26.0, rows at z 29.0 / 32.2 / 35.4 (the middle-col front table left out
  // of the aisle line), six chairs each, most pushed back, two knocked over; trays mid-meal on five
  const TABLES = [[16.8, 29.0], [20.4, 29.0], [26.0, 29.0], [16.8, 32.2], [20.4, 32.2], [26.0, 32.2], [16.8, 35.4], [26.0, 35.4]];
  TABLES.forEach(([tx, tz], ti) => {
    put("canteen-table", R, tx, 0, tz, 0);
    for (const side of [-1, 1]) for (const dx of [-0.6, 0, 0.6]) {
      if (rnd() < 0.12) continue;   // a chair taken elsewhere
      const push = 0.55 + rnd() * 0.35;   // pushed back as they stood
      const yaw = (side < 0 ? 0 : 180) + jit(22);
      if (rnd() < 0.07) put("canteen-chair", R, tx + dx + jit(0.2), 0, tz + side * (push + 0.25), yaw, { rot: [side < 0 ? -90 : 90, yaw, 0] });
      else put("canteen-chair", R, tx + dx + jit(0.06), 0, tz + side * push, yaw);
    }
    if (![0, 2, 4, 5, 7].includes(ti)) return;
    for (const side of [-1, 1]) for (const dx of [-0.6, 0.6]) {
      if (rnd() < 0.3) continue;
      const yaw = (side < 0 ? 0 : 180) + jit(10);
      put("food-tray", R, tx + dx + jit(0.05), 0.75, tz + side * 0.2, yaw);
      put("plate", R, tx + dx + jit(0.04), 0.762, tz + side * 0.2 + jit(0.03), jit(180));
      put("cutlery", R, tx + dx + 0.16, 0.762, tz + side * 0.2, yaw + 90 + jit(15));
      if (rnd() < 0.5) put("mug-white", R, tx + dx - 0.17, 0.762, tz + side * 0.24, jit(180));
    }
  });
  put("food-tray", R, 23.4, 0, 31.0, 160, { rot: [0, 160, 0] }); put("plate", R, 23.0, 0, 30.6, 0, { rot: [70, 40, 0] });
  wall("water-dispenser", R, "W", 33.0, { skin: true });
}

// ================================================================================================================
// THE KITCHEN (x 32-42, z 28-40): stainless, white tile, the pass to the canteen through the west door
{
  const R = "kitchen", I = inner(R);
  panel(R, 37, 33, null, "failing"); panel(R, 37, 37, "mains"); panel(R, 39.5, 30.5, "mains");
  wall("kitchen-appliances", R, "E", 32.2);
  for (const x of [33.4, 34.92, 36.44, 37.96, 39.48]) wall("steel-counter", R, "S", x);
  put("prep-table", R, 37.0, 0, 33.4, 0); put("prep-table", R, 37.0, 0, 35.6, 0);
  wall("fridge", R, "N", 33.4); wall("fridge", R, "N", 34.2);
  wall("sink-steel", R, "W", 30.4);
  // on the benches: food left out mid-prep, the cans the record says they're down to
  put("fruit-veg", R, 37.0, 0.9, 33.4, 12);
  put("bread-roll", R, 36.3, 0.9, 35.4, 30); put("bread-roll", R, 36.45, 0.9, 35.6, 70);
  put("food-cans", R, 38.2, 0.9, I.z1 - 0.3, 180); put("cereal-box", R, 39.6, 0.9, I.z1 - 0.25, 175);
  put("russian-cans", R, 37.9, 0.9, 35.7, 40); put("cutlery", R, 37.6, 0.9, 33.5, 80);
}

// ================================================================================================================
// THE STORES (x 32-42, z 18-28): back of house, painted concrete, still fully stocked (R27): they meant to
// come back. Racking down both walls, the aisle from the kitchen door to the keycard door to Maintenance.
{
  const R = "stores", I = inner(R);
  caged(R, 35, 22, null); caged(R, 39, 24.5, "failing");
  for (const z of [19.3, 21.3, 23.3]) wall("shelving-boxes", R, "W", z);
  const RACKS = [
    [["plastic-crate", 0.36], ["food-cans", 0.4], ["russian-cans", 0.16, 3], ["ration-pack", 0.55, 2], ["cardboard-box", 0.42]],
    [["cardboard-box", 0.42], ["water-bottle", 0.1], ["water-bottle", 0.1], ["cereal-box", 0.16], ["plastic-crate", 0.36]],
    [["jerrycan", 0.38], ["ration-pack", 0.55, 3], ["food-cans", 0.4], ["medical-box", 0.55, 2], ["cardboard-box", 0.42]],
    [["plastic-crate", 0.36], ["russian-cans", 0.16, 2], ["bandage-box", 0.2], ["duct-tape", 0.18], ["cardboard-box", 0.42]],
  ];
  [19.0, 20.7, 22.4, 24.1].forEach((z, k) => { wall("shelving-steel", R, "E", z); stock(last(), RACKS[k], 0.92); });
  wall("military-crate", R, "S", 34.8); wall("plastic-crate", R, "S", 39.2);
  put("plastic-crate", R, 39.25, 0.41, I.z1 - 0.15, 175); put("jerrycan", R, 40.6, 0, 26.9, 30);
  put("cardboard-box", R, 35.2, 0, 26.0, 18); put("cardboard-box", R, 35.0, 0.34, 26.0, 40);
  put("water-bottle", R, 36.2, 0, 25.7, 0); put("water-bottle", R, 36.3, 0, 25.85, 0);
}

// ================================================================================================================
// THE SAFE ROOM (x 2-14, z 28-40): a shelter (rule 11): six berths on two three-tier bunks, the water point
// (the only working water), the air unit with its crank, the workbench, the team's storage box, rations;
// spare frames stacked flat (R12); respirators on the floor (R25). Warm caged work lights.
{
  const R = "safe-res", I = inner(R);
  caged(R, 5.5, 32.5, null); caged(R, 10.5, 35.5, null);
  exit(R, 8, 2.35, I.z1, [0, 0, -1]);
  wall("shelter-bunk", R, "N", 4.4); wall("shelter-bunk", R, "N", 7.0);
  wall("air-filter", R, "N", 10.6, { y: 0.6 });
  wall("water-point", R, "E", 31.0);
  put("workbench", R, I.x1 - size("workbench")[0] / 2, 0, 35.6, 180);   // its long side runs along z: it stands along the wall
  wall("military-crate", R, "W", 37.4, { extra: { note: "the team's linked storage box" } });
  wall("shelving-steel", R, "W", 34.2);
  stock(last(), [["jerrycan", 0.38], ["water-bottle", 0.1], ["ration-pack", 0.55, 2], ["medical-box", 0.55], ["plastic-crate", 0.36]], 0.75);
  wall("medicine-cabinet", R, "S", 4.2, { y: 1.3 });
  wall("metal-sheets", R, "W", 31.2);
  // the beds made up for the first night, one not
  for (const [bx, n] of [[4.4, 0], [7.0, 1]]) {
    const z = I.z0 + size("shelter-bunk")[2] / 2;
    for (const [ty, lid] of [[0.46, 0], [1.16, 1], [1.86, 2]]) {
      if (n === 1 && lid === 2) continue;
      put("bunk-pillow", R, bx - 0.72, ty, z, 90 + jit(8));
      if ((lid + n) % 2 === 0) put("bunk-blanket", R, bx + 0.15, ty + 0.01, z, jit(6));
    }
  }
  put("sheets-rumpled", R, 6.9, 1.17, I.z0 + 0.45, 12);
  put("radio-backpack", R, 12.6, 0, 37.9, 220); put("flashlight", R, 13.4, 0.91, 35.6, 40);   // (map polish: on the workbench)
  put("water-filter", R, 13.2, 0.9, 31.4, -90);
}

// ================================================================================================================
// THE BUNK ROOMS (x 6-18 and 18-30, z 46-58): hot-bunked in shifts (R5, R9): built-in pods down both walls,
// curtains half drawn, blackout dark; lockers by the door; a sink (R8). Every berth somebody's (R19, R26).
function bunks(R, cx, dying) {
  const I = inner(R, true);
  if (dying) slot(R, cx, 52, "dying");
  emergency(R, cx + 1.6, 2.2, I.z0, [0, 0, 1]);
  emergency(R, cx, 2.2, I.z1, [0, 0, -1]);   // the far wall: the gangway between the pods is the escape route
  const zs = [49.3, 51.7, 54.1, 56.5];
  for (const side of ["W", "E"]) for (const z of zs) {
    if (side === "E" && z === 56.5) continue;
    wall("bunk-pod", R, side, z, { skin: true });
    const pod = last();
    // the berths' things: bedding, somebody's clothes, a photo on the shelf, shoes on the floor below
    for (const [ly, k] of [[0.28, 0], [1.4, 1]]) {
      const made = rnd() < 0.35;
      if (made) props.push({ id: "bunk-blanket", at: local(pod, 0.05, ly, 0.0), yaw: r3(pod.yaw + jit(4)), room: R });
      else props.push({ id: "sheets-rumpled", at: local(pod, 0.2 + jit(0.3), ly, 0.05), yaw: r3(pod.yaw + jit(30)), room: R });
      props.push({ id: "bunk-pillow", at: local(pod, -0.78, ly, 0.0), yaw: r3(pod.yaw + 90 + jit(10)), room: R });
      if (rnd() < 0.5) props.push({ id: rnd() < 0.5 ? "photo-frame-a" : "photo-frame-b", at: local(pod, -0.55 + rnd() * 0.5, ly + 0.42, -0.36), yaw: r3(pod.yaw + jit(12)), room: R });
      if (rnd() < 0.35) props.push({ id: "book-stack", at: local(pod, 0.5, ly + 0.42, -0.36), yaw: r3(pod.yaw + jit(20)), room: R });
      if (k === 0 && rnd() < 0.6) props.push({ id: "sneakers", at: local(pod, 0.6 + jit(0.2), 0, 0.75), yaw: r3(pod.yaw + jit(40)), room: R });
      if (rnd() < 0.3) props.push({ id: rnd() < 0.5 ? "clothes-pile" : "clothes-folded", at: local(pod, 0.4, ly, 0.1), yaw: r3(pod.yaw + jit(60)), room: R });
    }
  }
  // lockers either side of the door, a sink, the laundry
  wall("staff-lockers", R, "N", cx - 3.2, { skin: true }); wall("staff-lockers-open", R, "N", cx + 3.4, { skin: true });
  wall("sink-basin", R, "S", cx, { skin: true });
  put("laundry-basket", R, cx - 1.2, 0, I.z1 - 0.6, 18); put("clothes-pile", R, cx - 0.4, 0, I.z1 - 0.7, 130);
  put("towel-folded", R, cx + 0.2, 0, 50.1, 30);
}
bunks("bunks-a", 12, false);
bunks("bunks-b", 24, true);
{ const pod = props.find((p) => p.id === "bunk-pod" && p.room === "bunks-b");
  props.push({ id: "laptop", at: local(pod, 0.35, 0.28, 0.12), yaw: r3(pod.yaw + 160), room: "bunks-b", note: "the bunks-b tablet stand-in (record R-05)" }); }

// ================================================================================================================
// THE SHOWERS (x 30-40, z 46-56): a row of cubicles on the south wall, the long vanity on the west wall
{
  const R = "showers", I = inner(R);
  panel(R, 35, 50, null, "buzz"); panel(R, 35, 53.5, "mains");
  for (const x of [31.2, 32.3, 33.4, 34.5, 35.6, 36.7, 37.8]) wall("shower-stall", R, "S", x);
  wall("vanity", R, "W", 49.4);
  put("stepover-bench", R, 36.0, 0, 50.2, 0);
  put("towels-pile", R, 35.6, 0.45, 50.2, 20); put("towel-folded", R, 36.5, 0.45, 50.2, 80);
  const v = props.find((p) => p.id === "vanity" && p.room === R);
  for (const [lx, id] of [[-1.0, "toothbrush-cup"], [-0.3, "soap-dispenser"], [0.25, "shampoo"], [0.95, "toothbrush-cup"]]) props.push({ id, at: local(v, lx, 0.86, -0.1), yaw: v.yaw, room: R });
  put("sanitizer", R, I.x0 + 0.3, 0.86, 48.8, 90);   // (map polish: on the vanity)
  put("wet-floor-sign", R, 34.0, 0, 52.4, 30);
}

// ================================================================================================================
// THE REC ROOM (x 40-54, z 46-58): the wing's heart, its one accent colour (R2); sofas round the big screen, the
// pool table with a game left mid-play, the cube shelf of paperbacks (record R-07 folded in one), a card game
{
  const R = "rec-room", I = inner(R, true);
  slot(R, 47, 52, "buzz");
  wall("window-screen", R, "S", 46.0, { skin: true, y: 0.9 });
  put("lobby-sofa", R, 46.0, 0, 53.8, 0); put("lobby-armchair", R, 43.6, 0, 55.0, 130); put("lobby-armchair", R, 48.6, 0, 55.2, 230);
  put("coffee-table", R, 46.0, 0, 55.4, 90);
  put("sheets-rumpled", R, 45.4, 0.42, 54.0, 160);
  put("mug-white", R, 45.8, 0.39, 55.3, 20); put("book-stack", R, 46.8, 0.66, 53.9, 200, { rot: [0, 200, 180] });   // (map polish: on the sofa)
  put("pool-table", R, 50.6, 0, 50.0, 90);
  wall("cube-shelf", R, "W", 49.2, { skin: true });
  { const sh = last(); for (const [lx, ly] of [[-0.36, 0.4], [0.0, 0.76], [0.36, 1.12], [-0.36, 1.12], [0.36, 0.04]]) props.push({ id: "book-stack", at: local(sh, lx, ly, 0.0), yaw: sh.yaw, room: R }); }
  put("canteen-table", R, 43.6, 0, 48.8, 90);
  for (const [dx, dz, yaw] of [[-0.62, -0.45, 90], [-0.62, 0.45, 90], [0.62, -0.45, -90], [0.62, 0.45, -90]]) put("canteen-chair", R, 43.6 + dx * 1.0, 0, 48.8 + dz, yaw + jit(15));
  put("poker-set", R, 43.6, 0.75, 48.7, 20); put("cards-scatter", R, 43.7, 0.75, 49.2, 50);
  put("snake-plant", R, I.x1 - 0.4, 0, I.z0 + 0.4, 0);
}

// ================================================================================================================
// THE PANIC ROOM (x 54-60, z 48-56): all steel, sealed (its door a flush panel from the rec room, R11)
{
  const R = "panic-room", I = inner(R);
  caged(R, 57, 52, null);
  emergency(R, I.x0 + 0.2, 2.1, 52.0, [1, 0, 0]);
  // four berths, its own air and water, a week of rations on the rack: built for a lockdown, never used
  const berths = [50.4, 53.6].map((z) => { wall("shelter-bunk", R, "E", z); return last(); });
  wall("air-filter", R, "S", 57.0, { y: 0.6 });
  wall("water-point", R, "N", 55.6);
  wall("shelving-steel", R, "N", 57.4);
  stock(last(), [["jerrycan", 0.38], ["water-bottle", 0.1], ["ration-pack", 0.55, 3], ["medical-box", 0.55, 2], ["cardboard-box", 0.42]], 0.97);
  for (const b of berths) for (const ty of [0.46, 1.16, 1.86]) {   // made up, square, never slept in
    props.push({ id: "bunk-pillow", at: local(b, -0.72, ty, 0), yaw: r3(b.yaw + 90), room: R });
    props.push({ id: "bunk-blanket", at: local(b, 0.15, ty + 0.01, 0), yaw: b.yaw, room: R });
  }
  put("flashlight", R, 55.2, 0, 49.0, 30); put("first-aid-kit", R, 55.6, 0, 49.1, 80);
}

// ================================================================================================================
// THE WING'S PLATES AND NOTICES (2026-10-27): the house plate beside every door, as every other zone has, and the
// ordinary paper of a place people lived in
{
  const plateAt = (tex, x, y, z, n, w = 0.3, h = 0.15) => decals.push({ tex, at: [+x.toFixed(3), y, +z.toFixed(3)], n, size: [w, h], opaque: true });
  const C = inner("res-corridor", true);
  for (const [tex, x] of [["plate-bunks-a", 12.9], ["plate-bunks-b", 24.9], ["plate-showers", 35.9], ["plate-rec-room", 47.9]]) plateAt(tex, x, 1.6, C.z1, [0, 0, -1]);
  plateAt("plate-canteen", 24.3, 1.6, C.z0, [0, 0, 1]); plateAt("plate-safe-res", 9.0, 1.6, C.z0, [0, 0, 1]);
  plateAt("plate-kitchen", inner("canteen", true).x1, 1.6, 35.0, [-1, 0, 0]);
  plateAt("plate-stores", 38.0, 1.6, inner("kitchen").z0, [0, 0, 1]);
  plateAt("notice-quiet", 11.05, 1.45, C.z1, [0, 0, -1], 0.21, 0.297); plateAt("notice-quiet", 23.05, 1.45, C.z1, [0, 0, -1], 0.21, 0.297);
  plateAt("notice-laundry", 33.9, 1.45, C.z1, [0, 0, -1], 0.21, 0.297);
  plateAt("notice-kitchen", inner("kitchen").x0, 1.45, 35.1, [1, 0, 0], 0.21, 0.297);
}

// ---- out ---------------------------------------------------------------------------------------------------------
const L = {
  about: "THE RESIDENTIAL WING (docs/survivorz/ASSETS.md step D, zone 2): where the staff lived for days at a time, frozen at the alarm. Written by scripts/survivorz/layout-residential.mjs (edit that, not this); read by scripts/survivorz/room-build.py --set residential and client/src/survivorz/room/lobby.ts.",
  rooms: rooms.map((r) => r.id),
  roomRects: Object.fromEntries(rooms.map((r) => [r.id, { x: r.rect.x, z: r.rect.y, w: r.rect.w, h: r.rect.h, zone: r.zone }])),
  styles, skins, arch: [], props, fixtures, decals: [...(prev.decals ?? []).filter((d) => !/^(plate|notice)-/.test(d.tex)), ...decals],   // anything placed by hand stays; the plates are this file's cast: [],
  shots: {
    corridor: { at: [56.5, 1.65, 43.0], look: [20, 1.4, 43.0], label: "The corridor" },
    canteen: { at: [23.0, 1.65, 39.0], look: [23, 1.2, 27.0], label: "The canteen" },
    servery: { at: [17.0, 1.6, 33.6], look: [30, 1.0, 29.5], label: "The serving line" },
    kitchen: { at: [33.2, 1.6, 38.8], look: [40, 1.0, 30.5], label: "The kitchen" },
    stores: { at: [37.0, 1.6, 27.0], look: [37, 1.0, 18.5], label: "The stores" },
    safe: { at: [8.2, 1.6, 39.2], look: [6, 1.0, 29.0], label: "The safe room" },
    bunks: { at: [12.0, 1.6, 46.8], look: [12, 0.9, 57.0], label: "Bunk room A" },
    showers: { at: [35.0, 1.6, 46.8], look: [35, 1.0, 55.5], label: "The showers" },
    rec: { at: [47.0, 1.6, 46.8], look: [47, 0.9, 56.0], label: "The rec room" },
    panic: { at: [55.0, 1.6, 52.0], look: [59.5, 0.8, 52.0], label: "The panic room" },
  },
  tint: { "carpet-tile": [0.62, 0.64, 0.68] },
  kit: { copies: [] },
  catcher: { at: [30, 46], size: [64, 40] },
  shadowSpots: [],
};
fs.writeFileSync(OUT, JSON.stringify(L, null, 2) + "\n");
console.log(`residential: ${props.length} props, ${fixtures.length} fixtures`);
