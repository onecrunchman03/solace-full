// SURVIVORZ: power and maintenance's layout (ASSETS.md step D, zone 6), written as a program so every position
// comes from the room's walls and the packed props' real sizes (props.json), never a guess.
// Writes client/src/survivorz/room/power.json (room-build.py --set power reads it too).
// The design, room by room, and its references: SURVIVORZ.md "POWER AND MAINTENANCE", REFERENCES.md round ten.
//
//   node scripts/survivorz/layout-power.mjs
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const G = JSON.parse(fs.readFileSync(path.join(ROOT, "assets/downloads/survivorz/set/greybox.json"), "utf8"));
const PROPS = JSON.parse(fs.readFileSync(path.join(ROOT, "assets/downloads/survivorz/props/props.json"), "utf8"));
const OUT = path.join(ROOT, "client/src/survivorz/room/power.json");

let st = 6631;
const rnd = () => { st = (st + 0x6d2b79f5) >>> 0; let t = st; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const jit = (a) => (rnd() - 0.5) * 2 * a;
const r3 = (v) => +v.toFixed(3);

const rooms = G.rooms.filter((r) => r.zone === "power");
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

// ---- styles ---------------------------------------------------------------------------------------------------------
// raw and industrial (round ten): sealed concrete floors, painted block to a dado and bare concrete above, the slab
// overhead; the shelter in the house's painted finish
const plant = { floor: "painted-floor", ceiling: "slab", bands: [[0.12, "skirting"], [1.6, "wainscot"], [99, "vault-wall"]] };
const styles = {
  "service-stairs": { floor: "painted-floor", ceiling: "slab", bands: [[99, "vault-wall"]] },
  "generator-hall": plant,
  catwalks: { floor: "diamond-plate", ceiling: "slab", bands: [[99, "vault-wall"]] },
  "safe-power": { floor: "painted-floor", ceiling: "slab", bands: [[0.12, "skirting"], [99, "painted-wall"]] },
  boiler: plant,
  "maint-lockup": { floor: "painted-floor", ceiling: "slab", bands: [[99, "painted-wall"]] },
  workshop: plant,
  "pipe-gallery": { floor: "tunnel-floor", ceiling: "slab", bands: [[0.12, "skirting"], [1.6, "wainscot"], [99, "vault-wall"]] },
  "pump-room": plant,
};
const skins = {};

// ================================================================================================================
// THE SERVICE STAIRS (x 32-42, z 12-18): the shaft from the stores down to the generator hall, 11 m. The flights and
// landings are the map's own (set/greybox.json's stair boxes), built here in steel plate, the wall between the
// flights in painted block, a steel balustrade up the open side of the upper flight.
{
  const R = "service-stairs";
  for (const b of G.boxes.filter((q) => q.room === R)) {
    if (b.cat === "stairs" || b.cat === "landing") arch.push({ what: `service stair ${b.cat}`, key: "steel-plate", box: [...b.min, ...b.max].map(r3) });
    else if (b.cat === "rail") arch.push({ what: "service stair wall", key: b.max[1] > 0.5 ? "steel-plate" : "painted-wall", box: [...b.min, ...b.max].map(r3) });
  }
  for (const b of G.boxes.filter((q) => q.room === R && q.cat === "stairs" && q.min[2] > 14)) {   // the upper flight's open side
    arch.push({ what: "service stair balustrade", key: "steel", box: [r3(b.min[0]), r3(b.max[1]), 16.36, r3(b.max[0]), r3(b.max[1] + 0.95), 16.4] });
  }
  caged(R, 37.0, 15.0, { y: 3.0 }); caged(R, 33.0, 14.0, { y: -4.3 });   // one at the top, one under the half landing
  emergency(R, 41.9, -5.6, 13.0, [-1, 0, 0]); emergency(R, 32.1, 2.3, 17.0, [1, 0, 0]);
  plate("plate-service-stairs", 38.3, 1.6, 17.88, [0, 0, -1]);
  plate("plate-generator-hall", 38.6, F + 1.6, 17.9, [0, 0, -1]);
  decals.push({ tex: "paint-hazard", at: [37.0, 0.003, 17.85], n: [0, 1, 0], size: [10, 0.25], paint: true, repeat: [10, 1] });   // the top landing's edge
}

// ================================================================================================================
// THE GENERATOR HALL (x 14-44, z 18-38, 6.5 m): three standby sets in a row along the north wall, each with its day
// tank behind it; the switchboard and the five zone breakers along the south wall under the high-voltage warning;
// the generator log at its desk in the corner; yellow walkways painted round all of it.
{
  const R = "generator-hall", I = inner(R);
  for (const x of [18, 25, 32, 39]) for (const z of [23, 32]) caged(R, x, z);
  for (const [x, z] of [[17, 37.9], [30, 37.9], [42, 37.9]]) emergency(R, x, F + 3.2, z, [0, 0, -1]);
  emergency(R, 16, F + 3.2, 18.1, [0, 0, 1]);
  const gens = [18.5, 25.5, 32.0];
  gens.forEach((x, k) => {
    const g = put("genset", R, x, 0, 22.0, 0, { note: k === 2 ? "GEN 3: the one that tripped" : undefined });
    put("day-tank", R, x + 1.4, 0, r3(I.z0 + 0.6), 0);
    decals.push({ tex: `paint-gen-${k + 1}`, at: [x + 1.3, F + 1.9, r3(22.0 + 1.0 + 0.012)], n: [0, 0, 1], size: [1.0, 0.5], paint: true });
    paint("paint-hazard", x, 23.6, 6.4, 0.25, 0, [6, 1]);                     // the keep-clear line in front of each set
  });
  for (const x of [22.0, 28.75]) put("cable-tray", R, x, 4.9, 26.0, 90);  // over the aisle
  put("cable-tray", R, 29.0, 4.9, 34.0, 0); put("cable-tray", R, 32.0, 4.9, 34.0, 0); put("cable-tray", R, 35.0, 4.9, 34.0, 0);
  // the walkways: from the stairs' doorway (x 37, z 18) down the east side, and along the aisle between the sets and
  // the switchgear
  paint("paint-walkway", 36.2, 28.0, 0.1, 19.6); paint("paint-walkway", 37.8, 28.0, 0.1, 19.6);
  paint("paint-walkway", 26.0, 27.6, 23.0, 0.1); paint("paint-walkway", 26.0, 29.2, 23.0, 0.1);
  // the switchgear along the south wall: the main switchboard, then the five zone breakers (the game throws them)
  putFacing("switchboard", R, 27.6, 0, r3(I.z1 - size("switchboard")[0] / 2), 180);
  const zones = ["labs", "medical", "security", "containment", "deep"];
  zones.forEach((zn, k) => {
    const x = 30.9 + k * 1.0;
    wall("breaker-cabinet", R, "S", x, { extra: { note: `breaker-${zn}` } });
    decals.push({ tex: `breaker-${zn}`, at: [x, F + 1.57, r3(I.z1 - 0.5 - 0.009)], n: [0, 0, -1], size: [0.44, 0.1], opaque: true });
  });
  decals.push({ tex: "sign-high-voltage", at: [33.0, F + 2.6, r3(I.z1)], n: [0, 0, -1], size: [0.4, 0.56], opaque: true });
  paint("paint-hazard", 30.0, 36.6, 9.6, 0.25, 0, [9, 1]);                   // keep clear of the switchgear
  // the generator log: a steel desk in the south-east corner, its terminal, the logbook left open
  const d = put("office-desk", R, 41.6, 0, 36.6, 180);
  on(d, "terminal", 0.0, 0.787, -0.15, 0, { note: "the generator-log terminal" }); on(d, "clipboard", 0.65, 0.787, 0.15, 25);
  put("office-chair", R, 41.4, 0, 35.4, 0, { rot: [86, 140, 0] });
  wall("fire-extinguisher", R, "E", 24.0, { y: 0.6 }); wall("fire-extinguisher", R, "W", 33.0, { y: 0.6 });
  wall("control-cabinet", R, "E", 30.0);   // (turned by hand below)
  props[props.length - 1].yaw = r3(-90 + FRONT["control-cabinet"]);
  wall("wet-floor-sign", R, "W", 22.0);
  put("hand-truck", R, 40.6, 0, 31.0, 200); put("jerrycan", R, 40.2, 0, 30.4, 30); put("jerrycan", R, 39.9, 0, 30.6, 80, { rot: [90, 80, 0] });
  stainF("grime-floor", 33.4, 24.2, 2.2, 1.6, 10);   // diesel under GEN 3
  stainF("prints-shoes", 30.0, 28.4, 1.4, 1.0, 180);
}

// ================================================================================================================
// THE CATWALKS (x 2-14, z 18-38, 6.5 m): the plant's back corridor beside the hall: a catwalk run along the west wall
// over the pipe racks, a ladder up to it, the ducts overhead; the shelter's door at its south end.
{
  const R = "catwalks", I = inner(R);
  for (const z of [22, 30, 36]) caged(R, 8.0, z);
  emergency(R, 13.9, F + 3.0, 22.0, [-1, 0, 0]); emergency(R, 2.1, F + 3.0, 34.0, [1, 0, 0]);
  for (const z of [20.6, 24.6, 28.6, 32.6]) put("catwalk", R, r3(I.x0 + 0.55), 0, z, 90);
  put("ladder", R, r3(I.x0 + 1.2), 0, 34.8, 90);
  for (const x of [4.2, 9.8]) wall("pipe-rack", R, "N", x);
  for (const z of [21.0, 33.0]) wall("pipe-rack", R, "E", z);
  for (const z of [21.5, 24.5, 27.5, 30.5, 33.5]) put("cable-tray", R, 10.5, 4.8, z, 90);
  put("barrel", R, 12.8, 0, 36.6, 0); put("gas-cylinder", R, 12.2, 0, 37.2, 40); put("wire-coil", R, 9.0, 0, 36.8, 20);
  plate("plate-safe-power", 9.2, F + 1.6, r3(I.z1), [0, 0, -1]);
  stainF("grime-floor", 6.0, 27.0, 1.8, 1.4, 60);
}

// ================================================================================================================
// THE MAINTENANCE CREW SAFE ROOM (x 2-14, z 38-48): the plant's shelter (rule 11), like every other: six berths, the
// water point, the air unit, the workbench and the team box, stocked shelving.
{
  const R = "safe-power", I = inner(R);
  caged(R, 5.5, 42.5, { circuit: null }); caged(R, 10.5, 44.5, { circuit: null });
  wall("shelter-bunk", R, "S", 4.4); wall("shelter-bunk", R, "S", 7.0);
  wall("air-filter", R, "E", 40.6, { y: 0.6 }); wall("water-point", R, "E", 45.0);
  put("workbench", R, r3(I.x0 + size("workbench")[0] / 2), 0, 42.6, 0);
  wall("military-crate", R, "N", 11.2, { extra: { note: "the team's linked storage box" } });
  const s = wall("shelving-steel", R, "W", 45.6);
  [[0.08, "jerrycan"], [0.59, "ration-pack"], [0.98, "medical-box"], [1.36, "first-aid-kit"], [1.75, "plastic-crate"]].forEach(([y, id]) => { for (let lx = -0.55; lx <= 0.56; lx += 0.55) if (rnd() < 0.85) on(s, id, lx + jit(0.02), y, jit(0.03)); });
  for (const bx of [4.4, 7.0]) for (const ty of [0.46, 1.16, 1.86]) put("bunk-pillow", R, bx - 0.72, ty, r3(I.z1 - size("shelter-bunk")[2] / 2), 90);
}

// ================================================================================================================
// THE BOILER ROOM (x 14-28, z 38-50, 3.2 m): two fire-tube boilers side by side, burners to the south, flues up
// through the slab; pipe racks on the walls; the toolbox; the sealed lockup's door in the east wall.
{
  const R = "boiler", I = inner(R);
  for (const [x, z] of [[17, 40.5], [25, 40.5], [21, 44], [17, 48], [25, 48]]) caged(R, x, z);
  emergency(R, 21.0, F + 2.6, r3(I.z0), [0, 0, 1]);
  put("boiler", R, 16.6, 0, 44.4, 0); put("boiler", R, 25.0, 0, 44.4, 0);
  wall("pipe-rack", R, "N", 17.5); wall("pipe-rack", R, "N", 25.4);
  wall("tool-chest", R, "W", 48.6); wall("shelving-steel", R, "S", 26.2);
  put("gate-valve", R, 23.2, 0, 41.2, 90); put("pump-group", R, 0, 0, 0, 0);   // (placed below)
  props.pop();
  wall("water-filter", R, "E", 47.8, { y: 0.9 });
  plate("plate-maint-lockup", r3(I.x1), F + 1.6, 44.4, [-1, 0, 0]);
  plate("plate-boiler", 22.3, F + 1.6, r3(I.z0), [0, 0, 1]);
  stainF("grime-floor", 18.4, 47.0, 1.8, 1.2, 20); stainF("grime-floor", 24.6, 47.5, 1.2, 1.0, 120);
}
{
  const R = "maint-lockup", I = inner(R);
  caged(R, 31.0, 43.0, { style: "dead" });
  wall("shelving-steel", R, "N", 31.0); wall("shelving-boxes", R, "E", 43.0);
  put("jerrycan", R, 29.0, 0, 44.8, 20); put("wire-coil", R, 30.2, 0, 45.2, 0); put("cardboard-box", R, 32.4, 0, 45.0, 15);
}

// ================================================================================================================
// THE WORKSHOP (x 14-28, z 50-60): the benches, the tool chests and racks, a ladder, a hand truck, cylinders.
{
  const R = "workshop", I = inner(R);
  for (const [x, z] of [[17.5, 53.5], [24.5, 53.5], [17.5, 57.5], [24.5, 57.5]]) caged(R, x, z, { style: undefined });
  emergency(R, 26.0, F + 2.6, r3(I.z0), [0, 0, 1]);
  wall("workbench", R, "S", 17.5); wall("workbench", R, "S", 21.5);
  wall("tool-chest", R, "S", 25.0); wall("tool-chest", R, "S", 25.75);
  wall("shelving-steel", R, "E", 53.2); wall("shelving-boxes", R, "E", 55.4);
  wall("gas-cylinder", R, "W", 52.6); wall("gas-cylinder", R, "W", 53.0);
  put("prep-table", R, 21.0, 0, 55.0, 0);
  put("claw-hammer", R, 20.6, 0.9, 54.9, 30, { rot: [90, 30, 0] }); put("duct-tape", R, 21.4, 0.9, 55.2, 0); put("crowbar", R, 21.2, 0.9, 54.75, 70, { rot: [90, 70, 0] });   // (map polish: on the table, not off its end)
  put("hand-truck", R, 15.2, 0, 57.8, 70); put("ladder", R, r3(I.x0 + 0.12), 0, 55.6, 90);
  put("barrel", R, 26.8, 0, 51.2, 0); put("wire-coil", R, 24.0, 0, 51.4, 30);
  plate("plate-workshop", 22.3, F + 1.6, r3(I.z0), [0, 0, 1]);
  stainF("grime-floor", 21.0, 57.0, 1.2, 1.0, 60);
}

// ================================================================================================================
// THE PIPE GALLERY (x 44-50, z 18-58, 6 m): a long run of colour-coded pipe on both walls, the big main on its stands
// down the east side, valves at the branches; the maintenance grate down to the tunnels at its south end.
{
  const R = "pipe-gallery", I = inner(R);
  for (const z of [22, 30, 38, 46, 54]) caged(R, 47.0, z);
  emergency(R, 44.1, F + 3.0, 36.0, [1, 0, 0]); emergency(R, 49.9, F + 3.0, 52.0, [-1, 0, 0]);
  for (const z of [20.5, 24.6, 32.0, 36.1, 40.2, 44.3, 48.4, 52.5, 55.8]) wall("pipe-rack", R, "W", z);
  for (const z of [20.2, 24.3, 28.4, 32.5, 36.6, 40.7, 48.6, 52.7, 55.8]) wall("pipe-rack", R, "E", z);
  for (const z of [20.3, 24.4, 28.5, 32.6, 36.7, 40.8, 49.2, 53.3]) put("pipe-main", R, 48.4, 0, z, 90);
  for (const z of [26.4, 42.7]) put("gate-valve", R, 48.4, 0, z, 90);
  put("floor-grate", R, 47.0, 0, 55.0, 0, { note: "the maintenance grate (pipes-tunnels)" });
  paint("paint-hazard", 47.0, 53.9, 1.8, 0.25, 0, [2, 1]); paint("paint-hazard", 47.0, 56.1, 1.8, 0.25, 0, [2, 1]);
  plate("plate-pipe-gallery", 44.1, F + 1.6, 26.4, [1, 0, 0]);
  plate("plate-pump-room", r3(I.x1), F + 1.6, 46.2, [-1, 0, 0]);
  stainF("grime-floor", 46.2, 34.0, 1.6, 2.4, 0); stainF("grime-floor", 47.4, 50.0, 1.2, 1.8, 30);
  wall("valve-wheel", R, "W", 29.0, { y: 1.3 });
}

// ================================================================================================================
// THE PUMP ROOM (x 50-62, z 40-50): three pumps on their bases along the north wall, the pressure set on the east, the
// control cabinet, a locker.
{
  const R = "pump-room", I = inner(R);
  for (const [x, z] of [[53, 43], [59, 43], [56, 47.5]]) caged(R, x, z);
  emergency(R, 55.0, F + 2.6, r3(I.z1), [0, 0, -1]);
  for (const x of [53.0, 55.2, 57.4]) {
    put("pump", R, x, 0, r3(I.z0 + 1.2), 0);
    put("gate-valve", R, x + 0.6, 0, r3(I.z0 + 0.6), 0);
  }
  wall("pipe-rack", R, "N", 55.2);
  put("pump-group", R, r3(I.x1 - size("pump-group")[0] / 2 - 0.05), 0, 45.0, 0);
  putFacing("control-cabinet", R, 52.0, 0, r3(I.z1 - size("control-cabinet")[0] / 2), 180);
  wall("locker", R, "S", 54.4, { extra: { note: "pump-room-locker" } });
  stainF("grime-floor", 55.0, 43.6, 2.6, 1.4, 0);
}

// ---- out ---------------------------------------------------------------------------------------------------------
const L = {
  about: "POWER AND MAINTENANCE (docs/survivorz/ASSETS.md step D, zone 6). Written by scripts/survivorz/layout-power.mjs (edit that, not this); read by scripts/survivorz/room-build.py --set power and client/src/survivorz/room/lobby.ts.",
  rooms: rooms.map((r) => r.id),
  roomRects: Object.fromEntries(rooms.map((r) => [r.id, { x: r.rect.x, z: r.rect.y, w: r.rect.w, h: r.rect.h, zone: r.zone }])),
  styles, skins, arch, cutouts, props, fixtures, decals, cast: [],
  shots: {
    stairs: { at: [40.6, F + 1.65, 17.3], look: [34.0, F + 2.6, 13.4], label: "The service stairs, from the bottom" },
    hall: { at: [37.4, F + 1.8, 20.0], look: [20.0, F + 1.2, 33.0], label: "The generator hall, from the stairs" },
    gensets: { at: [28.8, F + 1.65, 29.0], look: [22.0, F + 1.2, 21.0], label: "The gensets" },
    breakers: { at: [33.0, F + 1.65, 32.0], look: [31.5, F + 1.1, 37.9], label: "The switchboard and the zone breakers" },
    catwalks: { at: [13.0, F + 1.65, 37.0], look: [5.0, F + 2.5, 20.0], label: "The catwalks" },
    safe: { at: [12.0, F + 1.65, 39.0], look: [5.0, F + 1.0, 46.0], label: "The maintenance crew safe room" },
    boiler: { at: [21.0, F + 1.65, 49.2], look: [21.0, F + 1.0, 40.0], label: "The boiler room" },
    workshop: { at: [16.0, F + 1.65, 50.8], look: [24.0, F + 0.8, 59.0], label: "The workshop" },
    gallery: { at: [47.0, F + 1.65, 19.0], look: [47.0, F + 1.5, 57.0], label: "The pipe gallery" },
    grate: { at: [46.0, F + 1.65, 50.5], look: [47.0, F + 0.0, 55.5], label: "The maintenance grate" },
    pumps: { at: [51.0, F + 1.65, 49.0], look: [58.0, F + 0.6, 41.0], label: "The pump room" },
  },
  tint: {},
  kit: { copies: [] },
  catcher: { at: [32, 38], size: [64, 48] },
  shadowSpots: [],
  puddles: [],
};
fs.writeFileSync(OUT, JSON.stringify(L, null, 2) + "\n");
console.log(`power: ${props.length} props, ${fixtures.length} fixtures, ${arch.length} arch, ${decals.length} decals`);
