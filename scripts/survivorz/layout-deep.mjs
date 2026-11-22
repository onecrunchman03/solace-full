// SURVIVORZ: the deep's layout (ASSETS.md step D, zone 8), written as a program so every position
// comes from the room's walls and the packed props' real sizes (props.json), never a guess.
// Writes client/src/survivorz/room/deep.json (room-build.py --set deep reads it too).
// The design, room by room, and its references: SURVIVORZ.md "THE DEEP LAB AND THE TUNNELS", REFERENCES.md round twelve.
//
//   node scripts/survivorz/layout-deep.mjs
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const G = JSON.parse(fs.readFileSync(path.join(ROOT, "assets/downloads/survivorz/set/greybox.json"), "utf8"));
const PROPS = JSON.parse(fs.readFileSync(path.join(ROOT, "assets/downloads/survivorz/props/props.json"), "utf8"));
const OUT = path.join(ROOT, "client/src/survivorz/room/deep.json");

let st = 8831;
const rnd = () => { st = (st + 0x6d2b79f5) >>> 0; let t = st; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const jit = (a) => (rnd() - 0.5) * 2 * a;
const r3 = (v) => +v.toFixed(3);

const rooms = G.rooms.filter((r) => r.zone === "deep");
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
const F = -16;   // the bottom floor
const stainF = (tex, x, z, w, h, rot = 0) => decals.push({ tex, at: [r3(x), F + 0.004, r3(z)], n: [0, 1, 0], size: [w, h], rot });
const paint = (tex, x, z, w, h, rot = 0, repeat) => decals.push({ tex, at: [r3(x), F + 0.003, r3(z)], n: [0, 1, 0], size: [w, h], rot, paint: true, ...(repeat ? { repeat } : {}) });
const caged = (room, x, z, opts = {}) => fixtures.push({ kind: "caged", at: [x, r3((opts.y ?? TOP[room]) - 0.2), z], yaw: opts.yaw ?? 0, room, bank: 0, ...(opts.circuit === null ? {} : { circuit: opts.circuit ?? "mains" }), ...(opts.style ? { style: opts.style } : {}) });
// the free switchboard and control cabinet face +x in their own files: turn them so their front faces `face`
const FRONT = { switchboard: -90, "control-cabinet": -90 };
const putFacing = (id, room, x, y, z, face, extra) => put(id, room, x, y, z, face + (FRONT[id] ?? 0), extra);
const stencilAt = (tex, x, y, z, n, w, h) => decals.push({ tex, at: [r3(x), y, r3(z)], n, size: [w, h], paint: true });
const puddles = [];

// ---- styles ---------------------------------------------------------------------------------------------------------
// round twelve: the lab level is pale painted concrete with steel brackets and a clean white suite inside it; the
// director's office the only warm room; under it the city's tunnels, concrete box sections and the old brick
const styles = {
  "freight-lift": { floor: "steel-plate", ceiling: "slab", bands: [[99, "vault-wall"]] },
  "deep-corridor": { floor: "painted-floor", ceiling: "slab", bands: [[0.12, "skirting"], [1.2, "wainscot"], [99, "painted-wall"]] },
  "deep-lab": { floor: "lab-floor", ceiling: "ceiling-white", bands: [[0.12, "plinth"], [99, "lab-wall"]] },
  "deep-office": { floor: "marble-dark", ceiling: "plaster", bands: [[0.12, "skirting"], [99, "walnut"]] },
  "tunnel-junction": { floor: "tunnel-floor", ceiling: "tunnel-ceiling", bands: [[99, "tunnel-wall"]] },
  "service-tunnel": { floor: "tunnel-floor", ceiling: "tunnel-ceiling", bands: [[1.0, "vault-floor"], [99, "tunnel-wall"]] },
  "far-tunnels": { floor: "tunnel-floor", ceiling: "brick-old", bands: [[99, "brick-old"]] },
};
const skins = {};
const tint = { "marble-dark": [0.32, 0.3, 0.29] };   // Marble021 is a pale stone: the director's floor is dark (D15)

// ================================================================================================================
// THE FREIGHT LIFT (x 70-78, z 76-84, from floor 1 down): the car parked at the top, its gate half drawn toward the
// cryo hall; the shaft below it raw, the lower landing's gate onto the deep corridor; capacity stencilled on the wall.
{
  const R = "freight-lift";
  put("freight-car", R, 74.0, 8.0, 80.0, 180, { note: "the lift car, parked at B1" });
  caged(R, 74.0, 80.0, { y: -5.06 });   // the car's own light, under its roof
  caged(R, 74.0, 81.5, { y: -8.3 });    // under the car, lighting the pit and the lower landing
  stencilAt("paint-lift-capacity", 70.11, F + 2.4, 80.0, [1, 0, 0], 2.4, 0.8);
  emergency(R, 77.9, F + 2.6, 82.0, [-1, 0, 0]);
  paint("paint-hazard", 74.0, 83.7, 3.0, 0.25, 0, [3, 1]);
}

// ================================================================================================================
// THE DEEP CORRIDOR (x 52-92, z 84-90, 3 m): pale painted concrete, cable trays on steel brackets along both walls, a
// yellow lane down the floor and a red line that ends at the Research Suite's door; the lift's lower gate in the north
// wall, the service tunnel's door at the west end.
{
  const R = "deep-corridor", I = inner(R);
  for (let x = 55; x <= 89; x += 4) panel(R, x, 87.0, "mains", x === 79 ? "failing" : undefined);
  for (const x of [58, 72, 86]) emergency(R, x, F + 2.4, r3(I.z1), [0, 0, -1]);
  exit(R, r3(I.x0), F + 2.45, 87.0, [1, 0, 0]);
  for (let x = 55; x <= 89; x += 3) { put("cable-tray", R, x, 2.45, r3(I.z0 + 0.16), 0); put("cable-tray", R, x, 2.45, r3(I.z1 - 0.16), 0); }
  paint("paint-walkway", 72.0, 86.6, 39.0, 0.1); paint("paint-walkway", 72.0, 87.4, 39.0, 0.1);
  decals.push({ tex: "dirt-band", at: [62.0, F + 0.003, 89.4], n: [0, 1, 0], size: [20.0, 0.12], paint: true, repeat: [10, 1] });
  arch.push({ what: "wayfinding stripe", key: "panel-accent", box: [52.12, F + 1.15, r3(I.z1 - 0.012), 71.2, F + 1.25, r3(I.z1)] });   // ends at the suite's door (D23)
  plate("plate-deep-corridor", 75.0, F + 1.6, r3(I.z0), [0, 0, 1]);
  plate("plate-deep-lab", 73.0, F + 1.6, r3(I.z1), [0, 0, -1]);
  put("eyewash-shower", R, 70.2, 0, r3(I.z1 - 0.55), 180);   // the drench shower at the suite's threshold (D9, D13)
  put("biohazard-bin", R, 74.2, 0, r3(I.z1 - 0.3), 180);
  put("hazmat-suit-hung", R, 66.0, 0, r3(I.z1 - 0.3), 180, { rot: [0, 180, 0] });
  put("air-hose", R, 69.0, 2.0, 89.2, 0, { rot: [70, 20, 0] });   // a dropped hose
  put("wet-floor-sign", R, 60.0, 0, 86.0, 40);
  stainF("prints-shoes", 64.0, 87.0, 1.4, 1.0, 180); stainF("grime-floor", 56.0, 88.0, 1.2, 0.8, 0);
}

// ================================================================================================================
// THE DEEP LAB (x 60-84, z 90-106, 5 m): the Research Suite, a white clean box under a gridded ceiling. The key bench in
// the middle (the work, the file left open on it, the terminal), cabinets and hoods round the walls, the suit wall by
// the door, air hoses coiled from the ceiling, glass into the director's office.
{
  const R = "deep-lab", I = inner(R);
  for (const x of [64, 69, 74.5, 80]) for (const z of [94, 98.5, 103]) panel(R, x, z, "mains", x === 80 && z === 103 ? "failing" : undefined);
  emergency(R, 61.0, F + 3.6, r3(I.z0), [0, 0, 1]); emergency(R, 83.9, F + 3.6, 102.0, [-1, 0, 0]);
  // the glass into the director's office (the office's door at z 95)
  cutouts.push({ axis: "x", c: 84, a0: 96.0, a1: 99.7, y0: F + 0.9, y1: F + 2.7 });
  glazing("x", 84, 96.0, 99.7, F + 0.9, F + 2.7, "director's window");
  // the key bench (lazarus-bench): the work on it, the final file left open, the terminal
  const kb = put("lab-bench-island", R, 72.0, 0, 99.0, 0, { note: "the lazarus-bench" });
  on(kb, "chemistry-set", -0.8, 0.9, 0.35, 0); on(kb, "kit-sequencer", 0.9, 0.9, 0.35, 0);
  on(kb, "flat-monitor", 0.9, 0.9, -0.35, 180, { note: "the deep-terminal" }); on(kb, "microscope-lab", -1.2, 0.9, -0.3, 180);   // the SF microscope, kept for this bench
  on(kb, "binder", -0.2, 0.9, -0.4, 165, { note: "the final-file, open where it was being read" }); on(kb, "file-folder", 0.15, 0.9, -0.45, 200);
  on(kb, "kit-tube-rack", 0.0, 0.9, 0.3, 0); on(kb, "micropipette", 0.35, 0.9, 0.25, 70, { rot: [90, 70, 0] });
  for (const dx of [-1.0, 1.0]) put("lab-stool", R, 72.0 + dx, 0, 100.4, jit(40));
  // round the walls
  for (const z of [93.0, 96.0]) wall("biosafety-cabinet", R, "W", z);
  wall("fume-hood", R, "W", 100.0); wall("incubator-stack", R, "W", 102.4); wall("ln2-dewar", R, "W", 104.4);
  for (const x of [64.0, 68.0, 76.0]) wall("lab-bench-wall", R, "S", x);
  wall("lab-sink", R, "S", 80.6); wall("cryo-em", R, "E", 103.4);
  put("centrifuge", R, 76.0, 0.9, r3(I.z1 - 0.36), 180);
  // the suit wall by the door, and the hoses over the benches (D13)
  for (const x of [63.2, 64.0, 64.8]) wall("hazmat-suit-hung", R, "N", x);
  for (const [x, z] of [[68.0, 97.0], [72.0, 101.5], [76.0, 97.0], [66.0, 102.5]]) put("air-hose", R, x, r3(TOP[R] - BOT[R] - 1.0), z, 0);
  put("office-chair", R, 75.2, 0, 97.4, 0, { rot: [86, 150, 0] });
  put("lab-stool", R, 69.6, 0, 103.2, 0, { rot: [88, 40, 0] });
  stainF("grime-floor", 70.0, 97.0, 0.8, 0.8, 0);
}

// ================================================================================================================
// THE DIRECTOR'S OFFICE (x 84-94, z 90-100): the only warm room on the level. Walnut walls, a dark marble floor, the
// desk turned to face the glass into the lab, a sofa and chairs, one picture; the lamp left on, the glass poured, the
// briefcase open, the drawer the papers came from pulled out (D15, D24).
{
  const R = "deep-office", I = inner(R);
  panel(R, 87.0, 93.0, "mains"); panel(R, 91.0, 97.0, "mains");
  emergency(R, 93.9, F + 2.4, 92.0, [-1, 0, 0]);
  const d = put("office-desk", R, 91.6, 0, 96.0, 90);   // the director sits with the wall behind, facing the lab
  on(d, "flat-monitor", -0.35, 0.787, -0.25, 0, { note: "the director-terminal" }); on(d, "desk-lamp", 0.8, 0.787, -0.2, -30);
  on(d, "glass-bottle", -0.85, 0.787, 0.1, 0); on(d, "coffee-mug", 0.4, 0.787, 0.15, 60); on(d, "file-folder", 0.1, 0.787, 0.2, 15);
  put("office-chair", R, 92.75, 0, 96.1, -90);
  wall("filing-cabinet", R, "E", 98.6); put("filing-cabinet", R, r3(I.x1 - 0.37), 0, 99.0, -90, { note: "a drawer pulled out" });
  put("lobby-sofa", R, 88.6, 0, r3(I.z0 + 0.45), 0); put("coffee-table", R, 88.6, 0, 92.3, 90);
  put("lobby-armchair", R, 86.4, 0, 93.4, 120);
  wall("frame-landscape", R, "N", 91.8, { y: 1.5 }); wall("snake-plant", R, "E", 91.0); wall("cube-shelf", R, "S", 87.6);
  put("briefcase", R, 90.2, 0, 98.8, 30, { rot: [0, 30, 0], note: "open" });
  plate("plate-deep-office", r3(I.x0) - 0.2, F + 1.6, 93.9, [-1, 0, 0]);
}

// ================================================================================================================
// THE TUNNEL JUNCTION (x 38-52, z 52-64, 5 m): where the plant floor's grate drops in, by a caged ladder between two steel
// posts; pipe bundles coming in, a bulkhead door in the east wall, the tunnels' stencils; dim and wet.
{
  const R = "tunnel-junction", I = inner(R);
  caged(R, 42.0, 58.0, { style: "failing" }); caged(R, 48.5, 60.5); caged(R, 49.0, 53.4, { style: "dead" });
  emergency(R, 51.9, F + 3.0, 61.0, [-1, 0, 0]);
  put("cage-ladder", R, 47.0, 0, 54.7, 0, { note: "up to the maintenance grate (pipes-tunnels)" });
  for (const x of [46.35, 47.65]) arch.push({ what: "ladder post", key: "steel", box: [r3(x - 0.05), F, 54.3, r3(x + 0.05), -11.0, 54.4] });
  for (const x of [42.0, 49.6]) wall("pipe-rack", R, "N", x);
  for (const z of [55.0, 61.0]) put("pipe-main", R, 39.0, 0, z, 90);
  wall("bulkhead-door", R, "E", 58.0, { note: "sealed" });
  stencilAt("paint-tunnel-t1", r3(I.x0), F + 2.9, 60.4, [1, 0, 0], 1.6, 0.6);
  stencilAt("paint-tunnel-s1", 49.8, F + 2.9, r3(I.z1), [0, 0, -1], 1.6, 0.6);
  stainF("grime-floor", 46.0, 58.0, 2.0, 1.6, 30); stainF("grime-floor", 47.0, 55.6, 1.2, 1.2, 0);
  puddles.push({ at: [45.0, F, 59.5], radius: 1.2, room: R, under: "the grate's drip" });
}

// ================================================================================================================
// THE SERVICE TUNNEL (x 44-52, z 64-90, 4 m): a concrete box tunnel, pipe bundles down the west wall, its lights in a
// line with gaps where they've failed, water lying along the base; the door into the deep corridor at the far end.
{
  const R = "service-tunnel", I = inner(R);
  for (const z of [67, 73, 79, 85]) caged(R, 48.5, z, { style: z === 79 ? "dead" : z === 73 ? "failing" : undefined });
  emergency(R, 51.9, F + 2.6, 70.0, [-1, 0, 0]);
  for (let z = 66.2; z <= 88; z += 4.1) wall("pipe-rack", R, "W", z);
  stencilAt("paint-tunnel-t2", r3(I.x1), F + 2.6, 66.5, [-1, 0, 0], 1.6, 0.6);
  wall("valve-wheel", R, "W", 77.0, { y: 1.2 });
  stainF("grime-floor", 48.0, 70.0, 2.4, 1.6, 0); stainF("grime-floor", 46.5, 82.0, 1.8, 2.6, 90);
  puddles.push({ at: [47.0, F, 75.0], radius: 1.0, room: R }, { at: [46.2, F, 86.5], radius: 0.8, room: R });
  put("jerrycan", R, 51.3, 0, 81.0, 40, { rot: [90, 40, 0] }); put("rusted-can", R, 50.8, 0, 72.4, 0);
}

// ================================================================================================================
// THE FAR TUNNELS (x 0-38, z 54-62, 5 m): the old city under the new: brick, ribbed every 4 m, a 1920s shopfront the
// viaducts buried, water in the low end; the utility plan pinned up where the crews worked from it (tunnel-route).
{
  const R = "far-tunnels", I = inner(R);
  for (const x of [32, 22, 12, 4]) caged(R, x, 58.0, { style: x === 12 ? "dead" : x === 4 ? "failing" : undefined });
  emergency(R, 37.9, F + 3.0, 56.0, [-1, 0, 0]);
  for (let x = 2.0; x < 38; x += 4.0) {                                                  // the brick ribs
    arch.push({ what: "tunnel rib", key: "brick-old", box: [r3(x - 0.3), r3(TOP[R] - 0.35), r3(I.z0), r3(x + 0.3), TOP[R], r3(I.z1)] });
    for (const z of [I.z0, I.z1 - 0.3]) {
      if (z === I.z0 && (x === 18 || x === 22)) continue;   // the shopfront's bay
      arch.push({ what: "tunnel pier", key: "brick-old", box: [r3(x - 0.3), F, r3(z), r3(x + 0.3), r3(TOP[R] - 0.35), r3(z + 0.3)] });
    }
  }
  wall("storefront", R, "N", 20.0, { extra: { note: "a 1920s shopfront, buried under the viaducts (D16)" } });
  decals.push({ tex: "plan-tunnels", at: [24.0, F + 1.5, r3(I.z1)], n: [0, 0, -1], size: [1.1, 0.71], opaque: true, rot: -2 });   // the tunnel-route, pinned up
  put("hand-truck", R, 30.5, 0, 60.6, 200); put("barrel", R, 6.8, 0, 55.4, 0); put("planks", R, 9.5, 0, 59.5, 90, { rot: [0, 90, 80] });   // (map polish: was 61, 1.4 m through the wall)
  stainF("grime-floor", 10.0, 58.0, 3.0, 2.4, 0); stainF("grime-floor", 24.0, 57.0, 2.0, 1.6, 40);
  puddles.push({ at: [5.0, F, 58.0], radius: 2.2, room: R, under: "the low end, flooded" }, { at: [14.0, F, 59.0], radius: 1.2, room: R });
}

// ---- out ---------------------------------------------------------------------------------------------------------
const L = {
  about: "THE DEEP LAB AND THE TUNNELS (docs/survivorz/ASSETS.md step D, zone 8). Written by scripts/survivorz/layout-deep.mjs (edit that, not this); read by scripts/survivorz/room-build.py --set deep and client/src/survivorz/room/lobby.ts.",
  rooms: rooms.map((r) => r.id),
  roomRects: Object.fromEntries(rooms.map((r) => [r.id, { x: r.rect.x, z: r.rect.y, w: r.rect.w, h: r.rect.h, zone: r.zone }])),
  styles, skins, arch, cutouts, props, fixtures, decals, cast: [],
  shots: {
    lift: { at: [75.2, -8.0 + 1.65, 81.8], look: [73.4, -8.0 + 1.0, 76.5], label: "The freight lift's car, its gate half drawn" },
    corridor: { at: [53.0, F + 1.65, 87.0], look: [91.0, F + 1.2, 87.0], label: "The deep corridor" },
    lab: { at: [72.0, F + 1.8, 91.0], look: [72.0, F + 1.0, 100.0], label: "The Research Suite" },
    bench: { at: [74.2, F + 1.65, 101.6], look: [71.6, F + 0.9, 98.6], label: "The key bench" },
    labwall: { at: [80.0, F + 1.8, 104.0], look: [62.0, F + 1.2, 95.0], label: "The suite, the cabinets" },
    office: { at: [85.0, F + 1.65, 99.0], look: [92.0, F + 1.0, 93.0], label: "The director's office" },
    window: { at: [92.5, F + 1.65, 98.0], look: [76.0, F + 1.2, 98.0], label: "The director's window" },
    junction: { at: [40.0, F + 1.65, 63.0], look: [47.0, F + 2.6, 54.5], label: "The tunnel junction" },
    service: { at: [48.0, F + 1.65, 65.0], look: [48.0, F + 1.2, 89.0], label: "The service tunnel" },
    far: { at: [37.0, F + 1.65, 58.0], look: [0.0, F + 1.2, 58.0], label: "The far tunnels" },
    storefront: { at: [23.0, F + 1.65, 60.5], look: [19.5, F + 1.6, 54.5], label: "The buried shopfront" },
  },
  tint,
  kit: { copies: [] },
  catcher: { at: [47, 79], size: [96, 56] },
  shadowSpots: [],
  puddles,
};
fs.writeFileSync(OUT, JSON.stringify(L, null, 2) + "\n");
console.log(`deep: ${props.length} props, ${fixtures.length} fixtures, ${arch.length} arch, ${decals.length} decals`);
