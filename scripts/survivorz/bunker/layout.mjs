// SURVIVORZ — THE BUNKER's layout (docs/survivorz/BUNKER.md, step 2 second half): Civil Defence Shelter 14,
// dressed. Written as a program like the old zones' layout-<zone>.mjs: every position comes from the room's
// walls (the grey box) and the packed props' real sizes (props.json), never a guess.
//
//   node scripts/survivorz/greybox.mjs --map bunker && node scripts/survivorz/bunker/layout.mjs
//   → client/src/survivorz/room/bunker.json (room-build.py --set bunker and the client read it)
//
// THE LOOK (Josh's answers): a 1960s civil-defence shell refitted modern. The old concrete stays where it
// always was (the tunnel, the vestibule round the blast door, the ceilings' bare slab in the plant rooms);
// where people lived and worked it's newer white panels on a plinth with cool white LED. Painted stencils
// name the rooms. Freshly overrun at the start: grime and boot prints near the entrance, furniture knocked
// over in the vestibule and the common room, the rest still tidy. Lived-in, not crowded: clear paths.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const G = JSON.parse(fs.readFileSync(path.join(ROOT, "assets/downloads/survivorz/set/bunker-greybox.json"), "utf8"));
const PJ = JSON.parse(fs.readFileSync(path.join(ROOT, "assets/downloads/survivorz/props/props.json"), "utf8"));
const PROPS = PJ.props ?? PJ;
const OUT = path.join(ROOT, "client/src/survivorz/room/bunker.json");

let st = 1401;
const rnd = () => { st = (st + 0x6d2b79f5) >>> 0; let t = st; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const jit = (a) => (rnd() - 0.5) * 2 * a;
const r3 = (v) => +v.toFixed(3);

const rooms = G.rooms;
const RECT = Object.fromEntries(rooms.map((r) => [r.id, r.rect]));
const TOP = Object.fromEntries(rooms.map((r) => [r.id, r.top]));
const T = 0.1, SKIN = 0.02;
const inner = (id, skin = false) => { const r = RECT[id], s = T + (skin ? SKIN : 0); return { x0: r.x + s, x1: r.x + r.w - s, z0: r.y + s, z1: r.y + r.h - s }; };
const size = (id) => { const p = PROPS[id]; if (!p) throw new Error(`no packed prop ${id}`); return p.size; };

const props = [], fixtures = [], decals = [], arch = [], cutouts = [];
const put = (id, room, x, y, z, yaw = 0, extra = {}) => { size(id); props.push({ id, at: [r3(x), r3(y), r3(z)], yaw: r3(yaw), room, ...extra }); return props[props.length - 1]; };
function wall(id, room, side, along, { y = 0, skin = false, out = 0, extra = {} } = {}) {
  const I = inner(room, skin), d = size(id)[2] / 2 + out;
  if (side === "N") return put(id, room, along, y, I.z0 + d, 0, extra);
  if (side === "S") return put(id, room, along, y, I.z1 - d, 180, extra);
  if (side === "W") return put(id, room, I.x0 + d, y, along, 90, extra);
  return put(id, room, I.x1 - d, y, along, -90, extra);
}
const local = (p, lx, ly, lz) => { const t = (p.yaw * Math.PI) / 180; return [r3(p.at[0] + lx * Math.cos(t) + lz * Math.sin(t)), r3(p.at[1] + ly), r3(p.at[2] - lx * Math.sin(t) + lz * Math.cos(t))]; };
const on = (p, id, lx, ly, lz, dyaw = 0, extra = {}) => { size(id); props.push({ id, at: local(p, lx, ly, lz), yaw: r3(p.yaw + dyaw), room: p.room, ...extra }); return props[props.length - 1]; };
/** knocked over: lying on its side (the client settles a tipped prop onto the floor) */
const tipped = (id, room, x, z, yaw, axis = "x") => put(id, room, x, 0, z, yaw, { rot: axis === "x" ? [88, 0, 0] : [0, 0, 88], note: "knocked over in the breach" });

const emergency = (room, x, y, z, face) => fixtures.push({ kind: "emergency", at: [r3(x), y, r3(z)], face, room, bank: 0 });
const panel = (room, x, z, style) => fixtures.push({ kind: "panel-flush", at: [r3(x), TOP[room], r3(z)], room, bank: 0, circuit: "mains", ...(style ? { style } : {}) });
const caged = (room, x, z, style) => fixtures.push({ kind: "caged", at: [r3(x), r3(TOP[room] - 0.2), r3(z)], yaw: 0, room, bank: 0, circuit: "mains", ...(style ? { style } : {}) });
/** LED panels on a grid inside a room, about `pitch` apart */
function grid(room, pitch = 3.6, style = {}) {
  const I = inner(room), nx = Math.max(1, Math.round((I.x1 - I.x0) / pitch)), nz = Math.max(1, Math.round((I.z1 - I.z0) / pitch));
  for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++)
    panel(room, I.x0 + (i + 0.5) * (I.x1 - I.x0) / nx, I.z0 + (j + 0.5) * (I.z1 - I.z0) / nz, style[`${i},${j}`]);
}
function cagedGrid(room, pitch = 4.5, style = {}) {
  const I = inner(room), nx = Math.max(1, Math.round((I.x1 - I.x0) / pitch)), nz = Math.max(1, Math.round((I.z1 - I.z0) / pitch));
  for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++)
    caged(room, I.x0 + (i + 0.5) * (I.x1 - I.x0) / nx, I.z0 + (j + 0.5) * (I.z1 - I.z0) / nz, style[`${i},${j}`]);
}
const stain = (tex, room, x, z, w, h, rot = 0) => decals.push({ tex, at: [r3(x), 0.004, r3(z)], n: [0, 1, 0], size: [w, h], rot, room });
const onWall = (tex, x, y, z, n, w, h, extra = {}) => decals.push({ tex, at: [r3(x), y, r3(z)], n, size: [w, h], ...extra });
/** a painted stencil on a wall face: the room's name (scripts/survivorz/bunker/signs.mjs paints them) */
const stencil = (id, x, y, z, n, w = 1.6, h = 0.4) => onWall(`bunker-${id}`, x, y, z, n, w, h, { paint: true });
function glazing(axis, c, a0, a1, y0, y1, what) {
  const t = 0.012;
  arch.push({ what: `${what} pane`, glass: axis === "z" ? [r3(a0 + 0.04), y0, r3(c - t), r3(a1 - 0.04), y1, r3(c + t)] : [r3(c - t), y0, r3(a0 + 0.04), r3(c + t), y1, r3(a1 - 0.04)] });
  for (const [ya, yb] of [[y0 - 0.06, y0], [y1, y1 + 0.06]]) arch.push({ what: `${what} frame`, key: "steel", box: axis === "z" ? [a0, ya, r3(c - 0.11), a1, yb, r3(c + 0.11)] : [r3(c - 0.11), ya, a0, r3(c + 0.11), yb, a1] });
  for (const a of [a0, a1]) arch.push({ what: `${what} frame`, key: "steel", box: axis === "z" ? [r3(a - 0.04), y0, r3(c - 0.11), r3(a + 0.04), y1, r3(c + 0.11)] : [r3(c - 0.11), y0, r3(a - 0.04), r3(c + 0.11), y1, r3(a + 0.04)] });
}

// ---- styles and skins ---------------------------------------------------------------------------------------------
const refit = { floor: "polished-concrete", ceiling: "ceiling-white", bands: [[0.12, "plinth"], [99, "panel-white"]] };
const living = { floor: "vinyl-oak", ceiling: "ceiling-white", bands: [[0.12, "skirting"], [99, "panel-white"]] };
const plant = { floor: "painted-floor", ceiling: "slab", bands: [[0.12, "skirting"], [1.4, "wainscot"], [99, "vault-wall"]] };
const styles = {
  tunnel: { floor: "tunnel-floor", ceiling: "tunnel-ceiling", bands: [[99, "tunnel-wall"]] },
  vestibule: { floor: "vault-floor", ceiling: "vault-ceiling", bands: [[1.2, "steel-plate"], [99, "vault-wall"]] },
  decon: { floor: "rubber-floor", ceiling: "ceiling-white", bands: [[99, "decon-tiles"]] },
  equipment: { ...plant },
  common: { floor: "polished-concrete", ceiling: "vault-ceiling", bands: [[0.12, "plinth"], [99, "panel-white"]] },
  barracks: { ...living, floor: "painted-floor" },
  "private-a": { ...living },
  "private-b": { ...living },
  laundry: { floor: "kitchen-floor", ceiling: "ceiling-white", bands: [[0.12, "skirting"], [1.4, "decon-tiles"], [99, "painted-wall"]] },
  maint: { ...plant },
  armory: { floor: "painted-floor", ceiling: "slab", bands: [[1.2, "steel-plate"], [99, "painted-wall"]] },
  security: { floor: "carpet-tile", ceiling: "office-ceiling", bands: [[0.12, "plinth"], [1.1, "panel-dark"], [99, "panel-white"]] },
  radio: { floor: "carpet-tile", ceiling: "office-ceiling", bands: [[0.12, "plinth"], [1.1, "panel-dark"], [99, "panel-white"]] },
  generator: { ...plant, bands: [[1.4, "steel-plate"], [99, "vault-wall"]] },
  workshop: { ...plant },
  infirmary: { floor: "kitchen-floor", ceiling: "ceiling-white", bands: [[0.12, "skirting"], [99, "lab-wall"]] },
  qm: { floor: "carpet-tile", ceiling: "office-ceiling", bands: [[0.12, "plinth"], [99, "lab-wall"]] },
  mess: { ...refit },
  kitchen: { floor: "kitchen-floor", ceiling: "ceiling-white", bands: [[0.12, "skirting"], [1.4, "decon-tiles"], [99, "panel-white"]] },
  stores: { ...plant },
};
// the halls: the refit's white panel skin with its LED light slots, an egress line along the plinth
const hall = { floor: "polished-concrete", ceiling: "ceiling-white", bands: [[99, "panel-white"]], skin: "hall" };
const skins = {};
for (const id of ["hall-n", "hall-w", "hall-e", "pass-n", "pass-w", "pass-e"]) {
  styles[id] = { ...hall };
  const r = RECT[id], along = r.w >= r.h ? "x" : "z";
  skins[id] = { room: id, ceilY: TOP[id], slotAxis: along, slotPitch: 1.6, slotInset: 0.6, slotWidth: 0.06,
    ...(along === "x" ? { slotZ0: r.y + r.h / 2 } : { slotX0: r.x + r.w / 2 }) };
}
for (const r of rooms) if (!styles[r.id]) throw new Error(`no style for ${r.id}`);

// ================================================================================================================
// THE TUNNEL (x 37-43, z 57-77): the old shell outside the blast door, out into the night. A little wind-blown debris.
{
  const R = "tunnel", I = inner(R);
  for (const z of [62, 70]) caged(R, 40, z, z === 70 ? "dead" : "failing");
  put("paper-debris", R, 38.6, 0, 66.3, 20); put("rusted-can", R, 41.9, 0, 63.1, 70); put("planks", R, I.x0 + 0.1, 0, 72.5, 90, { rot: [0, 0, 12] });
  stain("grime-floor", R, 40, 64, 4.5, 6); stain("prints-boots", R, 40.2, 60, 1.2, 3.2, 3);
}
// THE ENTRY VESTIBULE (x 34-46, z 51-57): the blast door in the south wall and its crank wheel beside it. The breach
// happened here: a stool kicked over, a sign down, boot prints and smears running north into the decon corridor.
{
  const R = "vestibule", I = inner(R);
  wall("valve-wheel", R, "S", 43.9, { y: 1.15, extra: { note: "THE CRANK: turn it to swing the blast door shut" } });
  wall("warning-signs", R, "S", 36.2, { y: 1.6 });
  wall("fire-extinguisher", R, "W", 52.4, { y: 0.4 });
  wall("utility-box", R, "N", 44.9, { out: 0 });
  tipped("canteen-chair", R, 37.2, 54.3, 30);
  tipped("wet-floor-sign", R, 42.6, 52.4, 120, "z");
  for (const x of [36.5, 43.5]) caged(R, x, 54, x < 40 ? "buzz" : "failing");
  emergency(R, 40, 2.9, I.z0, [0, 0, 1]);
  stain("smear", R, 40.4, 53.8, 2.4, 1.6, 10); stain("prints-shoes", R, 39.6, 52.2, 1.0, 2.6, -8); stain("grime-floor", R, 40, 55, 6, 3);
  onWall("leak-a", 35.4, 2.2, I.z0 + 0.01, [0, 0, 1], 1.0, 1.6);
  stencil("shelter-14", 40, 2.65, I.z0 + 0.012, [0, 0, 1], 3.0, 0.5);
}
// DECONTAMINATION (x 38.5-41.5, z 41-51): the narrow corridor, tiled to the ceiling, its floor grate and dispensers.
{
  const R = "decon", I = inner(R);
  for (const z of [43.5, 48.5]) panel(R, 40, z, z > 46 ? "failing" : undefined);
  put("floor-grate", R, 40, 0, 46, 0); put("floor-grate", R, 40, 0, 44.6, 0);
  wall("soap-dispenser", R, "W", 47.8, { y: 1.2 }); wall("glove-dispenser", R, "E", 44.0, { y: 1.3 });
  stain("prints-shoes", R, 40.1, 46.5, 0.8, 3.4, 4); stain("smear", R, 39.8, 49.2, 1.2, 1.0, 40);
  onWall("sign-decon", I.x0 + 0.01, 1.5, 49.6, [1, 0, 0], 0.45, 0.6, { opaque: true });
  stencil("decon", I.x1 - 0.012, 2.4, 42.6, [-1, 0, 0], 1.6, 0.36);
}
// THE EQUIPMENT ROOM (x 41.5-49, z 43-51): suits on a rail, lockers, shelves of kit.
{
  const R = "equipment", I = inner(R);
  cagedGrid(R, 4);
  const rail = wall("suit-rail", R, "N", 46, { y: 1.7 });
  for (const lx of [-0.8, 0, 0.8]) on(rail, "hazmat-suit-hung", lx, -1.7, 0.1);
  wall("staff-lockers", R, "E", 46.2); wall("shelving-steel", R, "S", 46.4);
  wall("gas-cylinder", R, "S", 43.4); wall("tool-chest", R, "E", 49.3);
  put("cardboard-box", R, 47.9, 0, 47.8, 25);
}

// THE COMMON ROOM (x 26-54, z 21-41): the heart. Tables and chairs, a lounge corner, the notice board. Overrun from the
// decon door in the south wall: chairs over, a table shoved askew, grime trodden in toward the middle.
{
  const R = "common", I = inner(R);
  grid(R, 4.0, { "0,4": "buzz", "3,4": "failing" });
  // four corners round two clear aisles: north-south from the decon door (x 37.5-42.5) to the north passage, and
  // east-west between the side passages (z 29-33) — nothing stands in either
  const seat4 = (t, skip = -1) => [[-0.5, -0.7, 0], [0.5, -0.7, 0], [-0.5, 0.7, 180], [0.5, 0.7, 180]]
    .forEach(([lx, lz, dy], k) => { if (k !== skip) on(t, "canteen-chair", lx, 0, lz, dy + jit(8)); });
  // the north-east: where they ate
  for (const [x, z] of [[46, 23.6], [50.6, 23.6], [46, 27], [50.6, 27]]) seat4(put("canteen-table", R, x, 0, z, 0));
  put("coffee-mug", R, 46.3, 0.78, 23.8); put("food-tray", R, 50.4, 0.78, 27.1, 20); put("magazine-pile", R, 45.6, 0.78, 27.2, 30);
  // the south-east: two more tables, one shoved askew by whatever came through the decon door, its chairs over
  seat4(put("canteen-table", R, 46.2, 0, 36.4, 0));
  seat4(put("canteen-table", R, 49.6, 0, 37.8, 16), 3);
  tipped("canteen-chair", R, 43.6, 38.6, 60); tipped("canteen-chair", R, 41.2, 36.0, -20, "z");
  wall("water-dispenser", R, "E", 36.4); wall("vending-machine", R, "E", 38.4); wall("trash-can", R, "S", 52.4);
  // the north-west: the lounge, the sofa and armchairs round a low table facing the TV on the west wall
  wall("wall-tv", R, "W", 24.8, { y: 1.5 });
  put("lobby-sofa", R, 31.6, 0, 24.8, -90); put("coffee-table", R, 29.6, 0, 24.8, 0);
  put("lobby-armchair", R, 29.4, 0, 22.7, 0); put("lobby-armchair", R, 29.4, 0, 26.9, 180);
  wall("cube-shelf", R, "N", 34.6); put("book-stack", R, 29.4, 0.42, 24.6, 15); wall("snake-plant", R, "N", 36.6);
  // the south-west: the pool table, a card table, the notice board
  put("pool-table", R, 31.0, 0, 37.0, 0);
  seat4(put("canteen-table", R, 35.4, 0, 36.0, 90), 1);
  put("cards-scatter", R, 35.4, 0.78, 36.0, 10); put("poker-set", R, 35.2, 0.78, 36.4, 40);
  wall("notice-board", R, "W", 37.0, { y: 1.1 }); wall("dead-plant", R, "S", 27.4); wall("wall-clock", R, "S", 33.0, { y: 2.3 });
  stain("smear", R, 40.6, 38.8, 2.0, 1.4, -20); stain("prints-shoes", R, 40.2, 37.2, 1.2, 3.2, 12); stain("grime-floor", R, 40, 37, 9, 6);
  stencil("common", 40, 2.95, I.z0 + 0.012, [0, 0, 1], 2.6, 0.45);
}
// THE HALLS: the light slots are in the skin; an emergency unit over each run, painted arrows at the junctions.
{
  const N = inner("hall-n"), W = inner("hall-w"), E = inner("hall-e");
  for (const x of [22, 40, 56]) emergency("hall-n", x, 2.62, N.z0, [0, 0, 1]);
  for (const z of [26, 42]) emergency("hall-w", W.x0, 2.62, z, [1, 0, 0]);
  for (const z of [16, 34, 48]) emergency("hall-e", E.x1, 2.62, z, [-1, 0, 0]);
  wall("fire-extinguisher", "hall-n", "N", 33.4, { y: 0.4 }); wall("fire-extinguisher", "hall-e", "E", 28.0, { y: 0.4 });
  stencil("arrow-armory", 29, 1.9, N.z1 - 0.012, [0, 0, -1], 1.4, 0.3);
  stencil("arrow-radio", 53, 1.9, N.z1 - 0.012, [0, 0, -1], 1.4, 0.3);
  stencil("arrow-dorms", W.x1 - 0.012, 1.9, 21, [-1, 0, 0], 1.4, 0.3);
  stencil("arrow-stores", E.x0 + 0.012, 1.9, 41, [1, 0, 0], 1.4, 0.3);
}

// THE BARRACKS (x 2-14, z 18-34): bunks two deep along the long walls, a locker between each, kit on the floor.
{
  const R = "barracks", I = inner(R);
  grid(R, 4.0);
  // three-tier bunks made up with a pillow and a blanket a berth (the residential wing's safe room, scaled up)
  const made = (bunk, k) => { for (const [ty, lid] of [[0.46, 0], [1.16, 1], [1.86, 2]]) {
    on(bunk, "bunk-pillow", -0.72, ty, 0, 90 + jit(8));
    if ((lid + k) % 3 !== 2) on(bunk, "bunk-blanket", 0.15, ty + 0.01, 0, jit(6)); else on(bunk, "sheets-rumpled", 0.1, ty + 0.01, 0, jit(15));
  } };
  [20.6, 24.2, 27.8, 31.4].forEach((z, k) => made(wall("shelter-bunk", R, "W", z), k));
  [19.3, 22.6].forEach((z, k) => made(wall("shelter-bunk", R, "E", z), k + 1));   // clear of the door at z 26
  wall("staff-lockers", R, "N", 8.0); wall("staff-lockers-open", R, "E", 31.0);
  // a table in the middle where the bunk-room played cards, footlockers at the bunks
  const t = put("canteen-table", R, 8.4, 0, 26.6, 90);
  for (const [lx, lz, dy] of [[-0.7, -0.4, 90], [0.7, 0.4, -90], [0.7, -0.5, -90]]) on(t, "canteen-chair", lx, 0, lz, dy + jit(10));
  put("cards-scatter", R, 8.4, 0.78, 26.4, 30); put("coffee-mug", R, 8.6, 0.78, 27.2);
  for (const z of [20.6, 24.2, 27.8, 31.4]) put("military-crate", R, 4.4, 0, z, 90);
  put("clothes-pile", R, 6.4, 0, 22.8, 40); put("laundry-basket", R, 10.6, 0, 30.4, 15); wall("coat-stand", R, "N", 5.0);
  put("backpack-small", R, 6.2, 0, 29.6, 70, { note: "dressing (not a pickup)" });
  stencil("barracks", I.x1 - 0.012, 2.4, 26, [-1, 0, 0], 2.0, 0.4);
}
// THE PRIVATE ROOMS (x 6-14, z 36-48): a bed, a locker, a few personal things each.
for (const [R, z0] of [["private-a", 36], ["private-b", 42]]) {
  const I = inner(R);
  panel(R, 10, z0 + 3);
  const bed = wall("bed-frame", R, "W", z0 + 3, {});
  on(bed, "pillow", 0, 0.62, -0.75); on(bed, "sheets-rumpled", 0, 0.62, 0.1, 15);
  wall("staff-lockers", R, "N", 11.8); wall("military-crate", R, "S", 12.0);
  put("desk-lamp", R, 12.0, 0.32, z0 + 4.9, 200); put(R === "private-a" ? "photo-frame-a" : "book-stack", R, 11.5, 0.32, z0 + 5.0, 170);
  put("clothes-folded", R, 9.6, 0, z0 + 1.0, 10);
}
// THE LAUNDRY (x 18-26, z 18-29): sinks, shelves of towels, baskets.
{
  const R = "laundry", I = inner(R);
  grid(R, 3.8);
  wall("sink-steel", R, "N", 22.0); wall("shelving-steel", R, "E", 21.6); wall("shelving-steel", R, "E", 25.4);
  put("laundry-basket", R, 21.0, 0, 24.0, 30); put("towels-pile", R, 23.0, 0, 26.6, 0); wall("trash-can", R, "S", 21.0);
}
// MAINTENANCE (x 18-24, z 8-14): the caretaker's cupboard.
{
  const R = "maint";
  caged(R, 21, 11);
  wall("tool-chest", R, "N", 20.2); wall("shelving-boxes", R, "W", 10.6); wall("ladder", R, "E", 10.2, { y: 0 });
  wall("electrical-panel", R, "N", 22.6, { y: 0.8 }); put("wire-coil", R, 21.4, 0, 12.4, 0); put("jerrycan", R, 22.6, 0, 12.9, 40);
}

// THE ARMORY (x 24-34, z 2-14): behind the keycard door. Rifles on racks, pistols in the lockers, ammo crates.
{
  const R = "armory", I = inner(R);
  cagedGrid(R, 4.5);
  for (const x of [26.6, 29.0]) wall("weapon-rack", R, "N", x);
  wall("staff-lockers", R, "N", 31.8);
  wall("device-lockers", R, "W", 6.0, { y: 0 });
  for (const [x, z] of [[30.6, 7.6], [30.6, 9.0]]) put("military-crate", R, x, 0, z, 90);
  put("military-crate", R, 30.6, 0.32, 8.3, 92);
  for (const [x, z] of [[27.0, 9.6], [27.4, 9.7], [27.2, 10.1]]) put("ammo-can", R, x, 0, z, jit(20));
  wall("armor-vest", R, "E", 4.4, { y: 0.9 }); wall("riot-shield", R, "E", 5.4, { y: 0 });
  stencil("armory", I.x1 - 0.012, 2.3, 11, [-1, 0, 0], 2.0, 0.4);
}
// THE SECURITY OFFICE (x 35-45, z 4-14): the desk with the keycard, the CCTV wall (static), the glass onto the hall.
{
  const R = "security", I = inner(R);
  grid(R, 3.4);
  const desk = put("office-desk", R, 40, 0, 9.4, 180);
  on(desk, "crt-monitor", -0.5, 0.76, 0.15); on(desk, "crt-monitor", 0.5, 0.76, 0.15); on(desk, "desk-phone", 0.85, 0.76, -0.1, 20);
  on(desk, "clipboard", -0.2, 0.76, -0.2, 8);
  put("office-chair", R, 40, 0, 10.4, 180);
  wall("video-wall", R, "N", 40, { y: 1.1, extra: { note: "the CCTV: decoration only, static" } });
  wall("filing-cabinet", R, "W", 6.2); wall("filing-cabinet", R, "W", 7.0); wall("whiteboard", R, "E", 7.4, { y: 1.0 });
  // the glass partition onto the north hall, either side of the door
  for (const [a0, a1] of [[35.6, 39.2], [40.8, 44.4]]) {
    cutouts.push({ axis: "z", c: 14, a0, a1, y0: 1.0, y1: 2.3 });
    glazing("z", 14, a0, a1, 1.0, 2.3, "security window");
  }
  stencil("security", 40, 2.65, I.z1 - 0.012, [0, 0, -1], 2.4, 0.36);
}
// THE RADIO ROOM (x 48-58, z 4-14): behind the keypad. The Cold War set on its desk with a modern unit bolted beside.
{
  const R = "radio", I = inner(R);
  grid(R, 3.4, { "1,1": "buzz" });
  const set = wall("control-console", R, "N", 52.6, { extra: { note: "THE RADIO SET: the old desk with dials and a handset" } });
  on(set, "desk-phone", 0.6, 1.0, 0.2, 10);
  wall("server-rack", R, "N", 55.8, { extra: { note: "the modern unit bolted on" } });
  put("office-chair", R, 52.6, 0, 7.0, 0); wall("radio-backpack", R, "E", 9.0, {});
  wall("filing-cabinet", R, "W", 9.6); wall("frame-landscape", R, "W", 7.0, { y: 1.5 });
  stencil("radio", 53, 2.65, I.z1 - 0.012, [0, 0, -1], 2.4, 0.36);
}

// THE GENERATOR ROOM (x 66-82, z 2-14): atmosphere only. The genset humming in the middle, its day tank, the panels.
{
  const R = "generator", I = inner(R);
  cagedGrid(R, 5.0);
  put("genset", R, 74, 0, 7.6, 0);
  wall("day-tank", R, "N", 79.4); wall("electrical-panel", R, "E", 10.4, { y: 0.6 }); wall("breaker-cabinet", R, "E", 12.4);
  wall("pipe-main", R, "N", 70.0, { y: 2.6 }); put("barrel", R, 68.0, 0, 12.4, 0); put("jerrycan", R, 69.0, 0, 12.8, 30);
  wall("fire-extinguisher", R, "W", 12.8, { y: 0.4 }); wall("gas-cylinder", R, "S", 80.0);
  stencil("generator", 74, 3.6, I.z1 - 0.012, [0, 0, -1], 3.0, 0.5);
}
// THE WORKSHOP (x 54-62, z 18-29): benches, a tool chest, shelves.
{
  const R = "workshop", I = inner(R);
  cagedGrid(R, 4.0);
  wall("workbench", R, "W", 22.0); wall("workbench", R, "W", 25.4);
  wall("tool-chest", R, "N", 59.0); wall("shelving-steel", R, "S", 57.4); wall("power-box", R, "N", 56.4, { y: 1.2 });
  put("hand-truck", R, 60.4, 0, 26.6, -30); put("cardboard-box", R, 58.8, 0, 23.0, 15);
  stencil("workshop", I.x1 - 0.012, 2.3, 21.4, [-1, 0, 0], 2.0, 0.36);
}
// THE INFIRMARY (x 54-62, z 33-46): beds along the west wall, the monitors, the medicine cabinet.
{
  const R = "infirmary", I = inner(R);
  grid(R, 3.6);
  for (const z of [35.4, 39.0, 42.6]) { const b = wall("hospital-bed", R, "W", z); }
  put("iv-stand", R, 57.0, 0, 36.6, 0); put("ecg-monitor", R, 57.2, 0, 40.2, -90); put("privacy-screen", R, 57.4, 0, 44.4, 90);
  wall("medical-cart", R, "N", 59.6); wall("medicine-cabinet", R, "S", 59.0, { y: 1.3 }); wall("sink-basin", R, "S", 60.6, { y: 0 });
  stencil("infirmary", I.x1 - 0.012, 2.4, 44.2, [-1, 0, 0], 2.0, 0.36);
}
// THE QUARTERMASTER (x 54-62, z 46-52): the stores' office.
{
  const R = "qm", I = inner(R);
  panel(R, 58, 49);
  const desk = wall("office-desk", R, "W", 49.0);
  on(desk, "clipboard-pen", 0.2, 0.76, 0.1); on(desk, "desk-lamp", -0.6, 0.76, 0.0, 30);
  put("office-chair", R, 56.4, 0, 49.0, 90);
  for (const x of [58.6, 59.2, 59.8]) wall("filing-cabinet", R, "N", x);
  wall("shelving-boxes", R, "S", 58.6);
}
// THE MESS HALL (x 66-80, z 16-28): long tables, the servery against the kitchen hatch.
{
  const R = "mess", I = inner(R);
  grid(R, 3.6);
  for (const x of [69.4, 73.6, 77.8]) for (const z of [19.4, 23.0]) {
    const t = put("canteen-table", R, x, 0, z, 90);
    for (const [lx, lz, dy] of [[-0.5, -0.7, 0], [0.5, -0.7, 0], [-0.5, 0.7, 180], [0.5, 0.7, 180]]) on(t, "canteen-chair", lx, 0, lz, dy + jit(6));
  }
  put("servery", R, 73, 0, I.z1 - 0.5, 180); wall("water-dispenser", R, "N", 79.0); wall("trash-can", R, "N", 67.4);
  put("food-tray", R, 73.4, 0.8, 23.2, 20);
  // the serving hatch through to the kitchen
  cutouts.push({ axis: "z", c: 28, a0: 71.2, a1: 74.8, y0: 1.0, y1: 2.0 });
  arch.push({ what: "hatch sill", key: "stainless", box: [71.2, 0.94, 27.85, 74.8, 1.0, 28.15] });
  arch.push({ what: "hatch head", key: "steel", box: [71.2, 2.0, 27.88, 74.8, 2.06, 28.12] });
  for (const a of [71.2, 74.8]) arch.push({ what: "hatch jamb", key: "steel", box: [a - 0.03, 1.0, 27.88, a + 0.03, 2.0, 28.12] });
  stencil("mess", 73, 2.95, I.z0 + 0.012, [0, 0, 1], 2.4, 0.4);
}
// THE KITCHEN (x 66-80, z 28-34): behind the hatch. Counters, the ovens, a prep table, the fridges.
{
  const R = "kitchen", I = inner(R);
  grid(R, 3.6);
  wall("kitchenette", R, "S", 71.0); wall("kitchen-appliances", R, "S", 76.6);
  put("prep-table", R, 76.0, 0, 30.4, 0); wall("fridge", R, "E", 32.4); wall("steel-counter", R, "N", 68.0);
  put("food-cans", R, 76.2, 0.9, 30.4, 15);
}
// THE STORES (x 66-82, z 36-50): one big storeroom of shelving rows (rations, water, tools), aisles between.
{
  const R = "stores", I = inner(R);
  cagedGrid(R, 4.5);
  for (const z of [39.6, 43.4, 47.2]) for (const x of [70.4, 72.4, 76.4, 78.4]) put(x % 4 < 1 ? "shelving-boxes" : "shelving-steel", R, x, 0, z, 0);
  wall("shelving-steel", R, "E", 38.4); wall("water-point", R, "E", 46.4);
  for (const [x, z] of [[68.0, 37.4], [68.6, 37.6], [68.2, 49.0]]) put("plastic-crate", R, x, 0, z, jit(25));
  put("military-crate", R, 80.2, 0, 49.0, 0); put("jerrycan", R, 81.0, 0, 41.8, 60); put("cardboard-box", R, 74.4, 0, 49.0, 10);
  stencil("stores", I.x1 - 0.012, 2.6, 43, [-1, 0, 0], 2.2, 0.4);
}

// ---- out ---------------------------------------------------------------------------------------------------------
const L = {
  about: "THE BUNKER, Civil Defence Shelter 14 (docs/survivorz/BUNKER.md). Written by scripts/survivorz/bunker/layout.mjs (edit that, not this); read by scripts/survivorz/room-build.py --set bunker and client/src/survivorz/room/lobby.ts.",
  greybox: "bunker-greybox.json",
  vaultDoor: true,
  vaultAt: [40, 57, 180],   // in the vestibule's south wall, facing in (Halcyon's faced the other way)
  rooms: rooms.map((r) => r.id),
  roomRects: Object.fromEntries(rooms.map((r) => [r.id, { x: r.rect.x, z: r.rect.y, w: r.rect.w, h: r.rect.h, zone: r.zone }])),
  styles, skins, arch, cutouts, props, fixtures, decals, cast: [],
  shots: {
    tunnel: { at: [40, 1.65, 74], look: [40, 1.6, 55], label: "Up the tunnel at the blast door" },
    vestibule: { at: [35.4, 1.65, 52.2], look: [43.6, 1.2, 56.4], label: "The vestibule: the door and its crank" },
    decon: { at: [40, 1.65, 50.4], look: [40, 1.5, 41], label: "Up the decon corridor" },
    common: { at: [52.5, 1.65, 39.5], look: [32, 1.2, 22], label: "The common room" },
    "hall-n": { at: [15, 1.65, 16], look: [62, 1.5, 16], label: "The north hall" },
    security: { at: [44.2, 1.65, 12.8], look: [37, 1.0, 5], label: "The security office" },
    radio: { at: [57.0, 1.65, 12.8], look: [51, 1.0, 5], label: "The radio room" },
    armory: { at: [33, 1.65, 12.8], look: [26, 1.0, 4], label: "The armory" },
    barracks: { at: [13, 1.65, 33], look: [4, 1.0, 19], label: "The barracks" },
    mess: { at: [79.4, 1.65, 17], look: [68, 1.0, 26], label: "The mess hall" },
    stores: { at: [81, 1.65, 49], look: [67, 1.0, 37], label: "The stores" },
    generator: { at: [80.5, 1.65, 13], look: [70, 1.2, 4], label: "The generator room" },
    infirmary: { at: [61, 1.65, 34], look: [55, 0.8, 45], label: "The infirmary" },
  },
  tint: { "carpet-tile": [0.5, 0.52, 0.56] },
  kit: { copies: [] },
  catcher: { at: [42, 39], size: [84, 78] },
  shadowSpots: [],
  puddles: [],
};
fs.writeFileSync(OUT, JSON.stringify(L, null, 2) + "\n");
console.log(`bunker: ${props.length} props, ${fixtures.length} fixtures, ${arch.length} arch, ${decals.length} decals`);
