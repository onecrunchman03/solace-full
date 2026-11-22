// SURVIVORZ: medical and quarantine's layout (ASSETS.md step D, zone 4), written as a program so every position
// comes from the room's walls and the packed props' real sizes (props.json), never a guess.
// Writes client/src/survivorz/room/medical.json (room-build.py --set medical reads it too).
// The design, room by room, and its references: SURVIVORZ.md "MEDICAL AND QUARANTINE", REFERENCES.md round eight.
//
//   node scripts/survivorz/layout-medical.mjs
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const G = JSON.parse(fs.readFileSync(path.join(ROOT, "assets/downloads/survivorz/set/greybox.json"), "utf8"));
const PROPS = JSON.parse(fs.readFileSync(path.join(ROOT, "assets/downloads/survivorz/props/props.json"), "utf8"));
const OUT = path.join(ROOT, "client/src/survivorz/room/medical.json");

let st = 4421;
const rnd = () => { st = (st + 0x6d2b79f5) >>> 0; let t = st; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const jit = (a) => (rnd() - 0.5) * 2 * a;
const r3 = (v) => +v.toFixed(3);

const rooms = G.rooms.filter((r) => r.zone === "medical");
const RECT = Object.fromEntries(rooms.map((r) => [r.id, r.rect]));
const TOP = Object.fromEntries(rooms.map((r) => [r.id, r.top]));
const T = 0.1, SKIN = 0.02;
const inner = (id, skin = false) => { const r = RECT[id], s = T + (skin ? SKIN : 0); return { x0: r.x + s, x1: r.x + r.w - s, z0: r.y + s, z1: r.y + r.h - s }; };
const size = (id) => { const p = PROPS[id]; if (!p) throw new Error(`no packed prop ${id}`); return p.size; };

const props = [], fixtures = [], decals = [], arch = [], cutouts = [];
const put = (id, room, x, y, z, yaw = 0, extra = {}) => { props.push({ id, at: [r3(x), r3(y), r3(z)], yaw: r3(yaw), room, ...extra }); return props[props.length - 1]; };
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

// ---- styles and skins ---------------------------------------------------------------------------------------------
const clinic = { floor: "kitchen-floor", ceiling: "ceiling-white", bands: [[0.12, "plinth"], [99, "lab-wall"]] };
const styles = {
  "med-corridor": { floor: "lab-floor", ceiling: "ceiling-white", bands: [[99, "panel-white"]], skin: "hall" },
  "med-hall": { floor: "lab-floor", ceiling: "ceiling-white", bands: [[99, "panel-white"]], skin: "hall" },
  pharmacy: clinic, "exam-rooms": clinic, ward: clinic,
  "med-office": { floor: "carpet-tile", ceiling: "ceiling-white", bands: [[0.12, "plinth"], [99, "lab-wall"]] },
  "staff-lounge": { floor: "vinyl-oak", ceiling: "ceiling-white", bands: [[0.12, "plinth"], [99, "lab-wall"]] },
  "safe-med": { floor: "painted-floor", ceiling: "slab", bands: [[0.12, "skirting"], [99, "painted-wall"]] },
  quarantine: { floor: "lab-floor", ceiling: "ceiling-white", bands: [[0.12, "plinth"], [99, "lab-wall"]] },
  "quarantine-cell": { floor: "lab-floor", ceiling: "ceiling-white", bands: [[99, "lab-wall"]] },
  operating: { floor: "lab-floor", ceiling: "ceiling-white", bands: [[0.12, "plinth"], [99, "lab-wall"]] },
  morgue: { floor: "steel-plate", ceiling: "ceiling-white", bands: [[1.2, "stainless"], [99, "lab-wall"]] },
  "cold-storage": { floor: "steel-plate", ceiling: "stainless", bands: [[99, "stainless"]] },
};
const skins = {
  "med-corridor": { room: "med-corridor", ceilY: 2.7, slotAxis: "z", slotPitch: 1.6, slotX0: 3, slotInset: 0.8, slotWidth: 0.06 },
  "med-hall": { room: "med-hall", ceilY: 2.7, slotAxis: "x", slotPitch: 1.6, slotZ0: 73, slotInset: 0.8, slotWidth: 0.06 },
};

// ================================================================================================================
// THE MEDICAL CORRIDOR (x 0-6, z 46-70) and THE HALL (x 0-66, z 70-76): the clinic's spine. Bright and expensive (M29:
// a corporation's own hospital): white panels, a steel crash rail at hip height, light lines along it. The stretchers
// they brought the first infected in on are still in it.
{
  const R = "med-corridor", I = inner(R, true);
  emergency(R, r3(I.x1), 2.35, 52, [-1, 0, 0]); emergency(R, r3(I.x0), 2.35, 64, [1, 0, 0]);
  exit(R, 3.0, 2.45, I.z0, [0, 0, 1]);   // over the keycard door back to the residential wing
  for (const x of [I.x0, I.x1]) arch.push({ what: "corridor crash rail", key: "steel", box: x < 3 ? [r3(x), 0.9, 46.3, r3(x + 0.05), 1.05, 69.7] : [r3(x - 0.05), 0.9, 46.3, r3(x), 1.05, 69.7] });
  plate("plate-med-hall", r3(I.x1), 1.6, 47.6, [-1, 0, 0]);
  put("wheelchair", R, 1.1, 0, 58.0, 160);
  put("stretcher", R, 4.6, 0, 62.5, 92, { note: "brought in from the residential wing" });
  stain("smear", 3.0, 55.0, 0.9, 2.6, 8);
}
{
  const R = "med-hall", I = inner(R, true);
  for (const x of [8, 22, 36, 50, 62]) emergency(R, x, 2.35, I.z1, [0, 0, -1]);
  exit(R, 3.0, 2.45, I.z0, [0, 0, 1]);
  // the crash rail on both long walls (doorways leave gaps where it would cross them)
  const doorsN = [[2.2, 3.8], [11.55, 12.45], [24.55, 25.45], [37.55, 38.45], [48.55, 49.45], [59.5, 60.5]], doorsS = [[12.55, 13.45], [27.55, 28.45], [50.55, 51.45]];
  for (const [z, doors, dz] of [[I.z0, doorsN, 1], [I.z1, doorsS, -1]]) {
    let a = 0.4;
    for (const [d0, d1] of [...doors, [65.7, 66]]) {
      if (d0 - 0.25 > a) arch.push({ what: "hall crash rail", key: "steel", box: [r3(a), 0.9, r3(dz > 0 ? z : z - 0.05), r3(d0 - 0.25), 1.05, r3(dz > 0 ? z + 0.05 : z)] });
      a = d1 + 0.25;
    }
  }
  // plates beside each door, on the hall's side
  for (const [tex, x, z, n] of [["plate-pharmacy", 13.3, I.z0, [0, 0, 1]], ["plate-exam-rooms", 26.3, I.z0, [0, 0, 1]], ["plate-med-office", 39.3, I.z0, [0, 0, 1]],
    ["plate-staff-lounge", 50.3, I.z0, [0, 0, 1]], ["plate-safe-med", 61.4, I.z0, [0, 0, 1]], ["plate-quarantine", 14.3, I.z1, [0, 0, -1]], ["plate-ward", 29.3, I.z1, [0, 0, -1]], ["plate-morgue", 52.3, I.z1, [0, 0, -1]]])
    plate(tex, x, 1.6, z, n);
  decals.push({ tex: "sign-breach", at: [11.8, 1.45, r3(I.z1)], n: [0, 0, -1], size: [0.21, 0.297], opaque: true, rot: -4 });   // taped beside the isolation door
  decals.push({ tex: "pressure-50", at: [11.5, 1.85, r3(I.z1)], n: [0, 0, -1], size: [0.15, 0.2], opaque: true });
  // the trail from the stretchers to isolation, and what was left in the hall
  put("stretcher", R, 17.0, 0, 73.6, 8 + 90); put("wheelchair", R, 23.2, 0, 71.6, -30);
  put("iv-stand", R, 14.6, 0, 73.95, 0, { rot: [84, 30, 0] });   // knocked over (map polish: 74.4 lay through the wall)
  put("body-bag", R, 47.6, 0, 74.8, 2); put("stretcher", R, 44.0, 0, 73.9, 90);
  put("sharps-bin", R, 33.0, 0, 71.6, 40);
  wall("water-dispenser", R, "N", 31.0, { skin: true }); wall("fire-extinguisher", R, "S", 40.0, { skin: true, y: 0.6 });
  wall("biohazard-bin", R, "S", 11.0, { skin: true }); wall("glove-dispenser", R, "S", 15.4, { skin: true, y: 1.2 });
  stain("smear", 13.0, 74.2, 1.0, 2.4, 80); stain("prints-shoes", 18.5, 73.4, 1.4, 1.0, 90); stain("smear", 50.6, 74.6, 0.8, 1.6, 15);
}

// ================================================================================================================
// THE CLINIC (north of the hall): pharmacy, exam bays, the CMO, the lounge, the shelter.
// The pharmacy (x 6-18, z 60-70): pick-bin shelving, the controlled-drugs cage in its corner, the dispensing counter.
{
  const R = "pharmacy", I = inner(R);
  panel(R, 10, 63.5); panel(R, 14.5, 63.5); panel(R, 12, 67.5);
  emergency(R, 8.0, 2.55, I.z1, [0, 0, -1]);
  for (const x of [7.4, 9.25]) wall("pharmacy-shelves", R, "N", x);
  for (const z of [62.4, 64.25]) wall("pharmacy-shelves", R, "W", z);
  put("pharmacy-cage", R, r3(I.x1 - 1.55), 0, r3(I.z0 + 0.66), 0);
  const c = put("steel-counter", R, 12.3, 0, 66.6, 180);
  on(c, "flat-monitor", -0.3, 0.9, 0.1); on(c, "pill-bottle", 0.4, 0.9, -0.05); on(c, "pill-bottle", 0.5, 0.9, 0.05, 40); on(c, "clipboard", 0.1, 0.9, -0.15, 20);
  put("office-chair", R, 12.3, 0, 65.6, 20);
  for (let k = 0; k < 7; k++) put(rnd() < 0.5 ? "pill-blister" : "pill-bottle", R, 9.0 + rnd() * 3.5, 0, 63.0 + rnd() * 2.5, rnd() * 360, rnd() < 0.5 ? { rot: [90, rnd() * 360, 0] } : {});
  wall("medicine-cabinet", R, "E", 66.6, { y: 1.3 });
}
// The exam rooms (x 18-32, z 60-70): three bays along the north wall, each a curtain, a couch, a cart; the light
// box and the sink by the door.
{
  const R = "exam-rooms", I = inner(R);
  panel(R, 21.5, 63.5); panel(R, 25, 63.5); panel(R, 28.5, 63.5); panel(R, 25, 67.6);
  emergency(R, 21.0, 2.55, I.z1, [0, 0, -1]);
  [20.8, 25.0, 29.2].forEach((x, k) => {
    put("bed-curtain", R, x, 0.3, r3(I.z0 + 1.15), 0);
    put("exam-table", R, x, 0, r3(I.z0 + 1.15), k === 1 ? 4 : 0);
    put("medical-cart", R, x + 0.95, 0, r3(I.z0 + 0.45), 0);
    wall("sharps-bin", R, "N", x - 0.9, { y: 1.2 });
  });
  wall("xray-viewer", R, "S", 21.5, { y: 1.3 });
  wall("sink-basin", R, "S", 29.6);
  put("privacy-screen", R, 27.3, 0, 66.8, 160);
  put("stethoscope" in PROPS ? "stethoscope" : "clipboard", R, 25.2, 0, 64.9, 30);
}
// The CMO's office (x 32-44, z 60-70): the desk with the terminal still logged in (cmo-terminal), the shelf, two
// armchairs, the whiteboard.
{
  const R = "med-office", I = inner(R);
  panel(R, 36, 64); panel(R, 40, 64);
  emergency(R, 34.0, 2.55, I.z1, [0, 0, -1]);
  const d = put("office-desk", R, 38.0, 0, 62.9, 180);   // the CMO sits on the wall side, facing the door
  on(d, "flat-monitor", -0.3, 0.787, -0.25, 0, { note: "the cmo-terminal (logged in)" }); on(d, "flat-monitor", 0.35, 0.787, -0.25, -15);
  on(d, "desk-lamp", -0.85, 0.787, -0.2); on(d, "coffee-cup", 0.75, 0.787, 0.1); on(d, "clipboard", 0.2, 0.787, 0.15, 30);
  put("office-chair", R, 38.2, 0, 61.75, jit(25));
  wall("filing-cabinet", R, "W", 61.2); wall("filing-cabinet", R, "W", 61.6);
  wall("cube-shelf", R, "E", 62.4);
  put("lobby-armchair", R, 35.0, 0, 67.6, 140); put("lobby-armchair", R, 37.0, 0, 68.2, 200); put("coffee-table", R, 36.0, 0, 67.0, 70);
  wall("whiteboard", R, "W", 66.5, { y: 0.9 });
  wall("snake-plant", R, "E", 68.8);
}
// The staff lounge (x 44-54, z 60-70): the kitchenette, a sofa, a table, the lockers by the door (lounge-lockers).
{
  const R = "staff-lounge", I = inner(R);
  panel(R, 47, 64); panel(R, 51, 64);
  emergency(R, 46.0, 2.55, I.z1, [0, 0, -1]);
  const k = wall("kitchenette", R, "N", 48.0);
  on(k, "coffee-maker", 1.2, 0.9, -0.12, 90); on(k, "mug-white", 0.9, 0.9, 0.1, 30); on(k, "microwave", 0.3, 0.9, -0.05);
  wall("fridge", R, "N", 50.6);
  wall("staff-lockers", R, "E", 66.6); wall("staff-lockers-open", R, "E", 64.8);
  put("lobby-sofa", R, r3(I.x0 + 0.4), 0, 66.0, 90); put("coffee-table", R, r3(I.x0 + 1.5), 0, 66.0, 0);
  put("canteen-table", R, 49.8, 0, 65.2, 90);
  for (const [dx, dz, yaw] of [[-0.6, -0.5, 90], [-0.6, 0.5, 90], [0.6, -0.5, -90], [0.6, 0.5, -90]]) put("canteen-chair", R, 49.8 + dx * 1.05, 0, 65.2 + dz, yaw + jit(25));
  put("coffee-cup", R, 49.6, 0.75, 65.0, 0); put("mug-white", R, 50.0, 0.75, 65.6, 120); put("magazine-pile", R, r3(I.x0 + 1.5), 0.39, 66.2, 20);
}
// The medical staff safe room (x 54-66, z 58-70): the second shelter (rule 11): six berths, the water point, the air
// unit, the workbench and the team box, stocked shelving.
{
  const R = "safe-med", I = inner(R);
  fixtures.push({ kind: "caged", at: [57.5, TOP[R] - 0.2, 62.0], yaw: 0, room: R, bank: 0 }); fixtures.push({ kind: "caged", at: [62.5, TOP[R] - 0.2, 65.0], yaw: 0, room: R, bank: 0 });
  wall("shelter-bunk", R, "N", 56.4); wall("shelter-bunk", R, "N", 59.0);
  wall("air-filter", R, "N", 62.6, { y: 0.6 }); wall("water-point", R, "E", 61.0);
  put("workbench", R, r3(I.x1 - size("workbench")[0] / 2), 0, 65.6, 180);
  wall("military-crate", R, "W", 66.8, { extra: { note: "the team's linked storage box" } });
  const s = wall("shelving-steel", R, "W", 63.4);
  [[0.08, "jerrycan"], [0.59, "ration-pack"], [0.98, "medical-box"], [1.36, "first-aid-kit"], [1.75, "plastic-crate"]].forEach(([y, id]) => { for (let lx = -0.55; lx <= 0.56; lx += 0.55) if (rnd() < 0.85) on(s, id, lx + jit(0.02), y, jit(0.03)); });
  for (const [bx] of [[56.4], [59.0]]) for (const ty of [0.46, 1.16, 1.86]) put("bunk-pillow", R, bx - 0.72, ty, r3(I.z0 + size("shelter-bunk")[2] / 2), 90);
}

// ================================================================================================================
// QUARANTINE (M1, M8, M10, M11): the isolation block (x 6-20, z 76-88) watching the sealed cell (x 6-12, z 88-94)
// through laminated glass; two isolator beds; the PPE bench and the bins; the pass-through hatch into the cell.
// It reads as a sealed box that has failed.
{
  const R = "quarantine", I = inner(R);
  panel(R, 9.5, 79.5); panel(R, 16.5, 79.5); panel(R, 9.5, 84.5, "mains", "failing"); panel(R, 16.5, 84.5);
  emergency(R, 18.4, 2.55, I.z0, [0, 0, 1]);
  // the observation window into the cell, beside its sealed door (the door at x 8.55-9.45 on the z 88 wall)
  cutouts.push({ axis: "z", c: 88, a0: 10.0, a1: 11.8, y0: 0.95, y1: 2.05 });
  glazing("z", 88, 10.0, 11.8, 0.95, 2.05, "observation window");
  put("touch-panel", R, 12.3, 1.35, r3(I.z1 - 0.012), 180, { note: "the intercom" });
  put("pass-box", R, 7.4, 0.95, r3(I.z1 - 0.075), 180);
  plate("pressure-75", 13.0, 1.6, I.z1, [0, 0, -1], 0.15, 0.2);
  // the watch station facing the window
  const d = put("office-desk", R, 11.0, 0, 85.6, 180);   // the watcher faces the cell window
  on(d, "flat-monitor", -0.4, 0.787, -0.25); on(d, "flat-monitor", 0.3, 0.787, -0.25, -15); on(d, "clipboard", 0.7, 0.787, 0.1);
  put("office-chair", R, 10.8, 0, 84.2, 15);
  // two isolator beds on the east side
  for (const z of [79.6, 83.2]) {
    put("hospital-bed", R, 17.4, 0, z, -90);
    put("isolator-tent", R, 17.4, 0, z, 0);   // the tent runs along the bed (its long side is its x)
    put("iv-stand", R, 15.8, 0, r3(z - 0.9), 0);
  }
  put("iv-stand", R, 14.6, 0, 86.6, 0, { rot: [86, 110, 0] });
  put("stepover-bench", R, 9.0, 0, 79.2, 90);
  wall("biohazard-bin", R, "W", 81.6); wall("biohazard-bin", R, "W", 82.3); wall("glove-dispenser", R, "W", 80.4, { y: 1.2 });
  stain("smear", 13.0, 83.5, 1.2, 2.2, 30); stain("prints-shoes", 11.5, 80.5, 1.4, 1.0, 0);
}
{
  const R = "quarantine-cell", I = inner(R);
  panel(R, 9.0, 91.0, "mains", "dying");
  put("hospital-bed", R, 9.6, 0, 91.6, 180); put("isolator-tent", R, 9.6, 0, 91.6, 90);
  put("iv-stand", R, 7.4, 0, 92.6, 0, { rot: [80, 200, 0] });
  stain("smear", 8.0, 89.8, 1.0, 1.6, 120); stain("smear", 10.6, 90.2, 0.8, 1.2, 40);
}

// ================================================================================================================
// THE WARD (x 20-36, z 76-90): six bays on ceiling tracks (M14), headwalls, monitors, IV poles; one bed rolled askew,
// one curtain gone, a stretcher in the aisle (M26).
{
  const R = "ward", I = inner(R);
  for (const x of [23, 28, 33]) for (const z of [79.5, 84.5]) panel(R, x, z);
  emergency(R, 26.0, 2.55, I.z1, [0, 0, -1]);
  const bays = [[I.x0, 78.6, 90], [I.x0, 82.6, 90], [I.x0, 86.6, 90], [I.x1, 84.0, -90], [I.x1, 87.6, -90]];
  bays.forEach(([wx, z, yaw], k) => {
    const sgn = yaw === 90 ? 1 : -1;
    put("headwall", R, r3(wx + sgn * 0.06), 1.2, z, yaw);
    const askew = k === 1;
    put("hospital-bed", R, r3(wx + sgn * (askew ? 1.6 : 1.12)), 0, r3(z + (askew ? 0.35 : 0)), yaw + (askew ? 28 : 0));
    if (k !== 2) put("bed-curtain", R, r3(wx + sgn * 1.25), 0.3, z, yaw - 90);
    put(k % 2 ? "ecg-monitor" : "monitor-trolley", R, r3(wx + sgn * 0.5), 0, r3(z + 0.95), yaw);
    put("iv-stand", R, r3(wx + sgn * 0.45), 0, r3(z - 0.85), 0);
  });
  put("stretcher", R, 28.0, 0, 82.0, 4); put("medical-cart", R, 30.2, 0, 86.4, 200, { rot: [0, 200, 88] });   // the cart tipped over
  put("wheelchair", R, 26.0, 0, 88.6, 40);
  wall("sharps-bin", R, "N", 24.0, { y: 1.2 }); wall("glove-dispenser", R, "N", 25.2, { y: 1.2 });
  stain("smear", 24.4, 83.0, 1.0, 2.0, 60); stain("prints-shoes", 28.0, 79.2, 1.2, 1.0, 20);
  plate("plate-operating", r3(I.x1), 1.6, 79.2, [-1, 0, 0]);
}
// The operating room (x 36-46, z 76-86): the table under the laminar canopy and the twin lights, the scrub trough by
// the door, the monitor, the code cart dumped (M16-M18).
{
  const R = "operating", I = inner(R);
  panel(R, 38.0, 78.0); panel(R, 44.0, 78.0); panel(R, 38.0, 84.0); panel(R, 44.0, 84.0);
  emergency(R, 44.0, 2.55, I.z1, [0, 0, -1]);
  put("laminar-canopy", R, 41.2, r3(TOP[R] - 0.124), 81.0, 0);
  put("operating-table", R, 41.2, 0, 81.0, 0);
  put("surgical-light", R, 41.2, r3(TOP[R] - 0.124 - size("surgical-light")[1]), 81.0, 30);
  put("monitor-trolley", R, 43.4, 0, 79.6, -60); put("iv-stand", R, 39.4, 0, 79.8, 0);
  wall("scrub-sink", R, "N", 38.4);
  wall("xray-viewer", R, "E", 81.0, { y: 1.3 });
  put("medical-cart", R, 42.6, 0, 83.4, 30, { rot: [0, 30, -86] });   // the code cart, dumped
  put("scalpels", R, 42.0, 0, 82.6, 40); put("medical-scissors", R, 41.6, 0, 83.0, 110); put("syringe-medical", R, 40.4, 0, 82.4, 20);
  stain("smear", 41.2, 82.0, 1.4, 2.2, 0);
}
// The morgue (x 46-56, z 76-86): stainless to dado, the body-storage bank on the back wall, two downdraft tables, bags
// waiting; the sealed cold store's door on the east wall.
{
  const R = "morgue", I = inner(R);
  panel(R, 49, 79.5); panel(R, 53, 79.5); panel(R, 51, 83.0, "mains", "failing");
  emergency(R, 48.0, 2.55, I.z0, [0, 0, 1]);
  wall("morgue-fridge", R, "S", 51.0);
  put("morgue-table", R, 48.8, 0, 80.4, 0); put("morgue-table", R, 53.2, 0, 80.4, 0);
  put("stretcher", R, r3(I.x0 + 1.1), 0, 82.4, 0); put("body-bag", R, r3(I.x0 + 1.1), 0.86, 82.4, 90);   // (map polish: +0.5 put them 0.45 m through the wall)
  put("body-bag", R, 50.8, 0, 82.3, 6);   // clear of the fridge: the terminal on its front must be reachable (was 83.2)
  wall("lab-sink", R, "N", 47.6);
  plate("plate-cold-storage", r3(I.x1), 1.6, 79.6, [-1, 0, 0]);
  decals.push({ tex: "sign-biohazard", at: [r3(I.x1), 2.3, 81.0], n: [-1, 0, 0], size: [0.35, 0.35], opaque: true });
}
{
  const R = "cold-storage", I = inner(R);
  panel(R, 59.0, 81.0, "mains", "dead");
  for (const x of [57.4, 58.3]) wall("freezer-80", R, "N", x);
  put("body-bag", R, 59.2, 0, 82.6, 80); put("body-bag", R, 59.4, 0.22, 82.7, 95);
}

// ---- out ---------------------------------------------------------------------------------------------------------
const L = {
  about: "MEDICAL AND QUARANTINE (docs/survivorz/ASSETS.md step D, zone 4). Written by scripts/survivorz/layout-medical.mjs (edit that, not this); read by scripts/survivorz/room-build.py --set medical and client/src/survivorz/room/lobby.ts.",
  rooms: rooms.map((r) => r.id),
  roomRects: Object.fromEntries(rooms.map((r) => [r.id, { x: r.rect.x, z: r.rect.y, w: r.rect.w, h: r.rect.h, zone: r.zone }])),
  styles, skins, arch, cutouts, props, fixtures, decals, cast: [],
  shots: {
    corridor: { at: [3.0, 1.65, 47.0], look: [3.0, 1.2, 70.0], label: "The medical corridor" },
    hall: { at: [1.6, 1.65, 73.0], look: [40, 1.2, 73.0], label: "The medical hall" },
    pharmacy: { at: [12.0, 1.65, 69.4], look: [12, 1.1, 61.0], label: "The pharmacy" },
    exam: { at: [25.0, 1.65, 69.4], look: [25, 1.0, 61.0], label: "The exam bays" },
    cmo: { at: [42.6, 1.65, 69.2], look: [36, 1.0, 62.0], label: "The CMO's office" },
    lounge: { at: [53.0, 1.65, 69.3], look: [46, 1.0, 62.0], label: "The staff lounge" },
    safe: { at: [60.0, 1.65, 69.3], look: [58, 1.0, 59.0], label: "The medical safe room" },
    quarantine: { at: [13.0, 1.65, 77.0], look: [11, 1.4, 88.0], label: "Isolation, the cell's window" },
    isolators: { at: [8.0, 1.65, 78.0], look: [18, 1.0, 82.0], label: "Isolation, the isolator beds" },
    ward: { at: [28.0, 1.65, 77.0], look: [28, 1.0, 89.0], label: "The ward" },
    operating: { at: [37.0, 1.65, 81.0], look: [44, 1.2, 81.0], label: "The operating room" },
    morgue: { at: [51.0, 1.65, 76.6], look: [51, 1.0, 85.5], label: "The morgue" },
  },
  tint: { "carpet-tile": [0.5, 0.52, 0.56] },
  kit: { copies: [] },
  catcher: { at: [33, 70], size: [70, 50] },
  shadowSpots: [],
  puddles: [],
};
fs.writeFileSync(OUT, JSON.stringify(L, null, 2) + "\n");
console.log(`medical: ${props.length} props, ${fixtures.length} fixtures, ${arch.length} arch, ${decals.length} decals`);
