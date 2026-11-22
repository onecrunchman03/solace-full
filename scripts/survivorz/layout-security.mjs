// SURVIVORZ: the security wing's layout (ASSETS.md step D, zone 5), written as a program so every position
// comes from the room's walls and the packed props' real sizes (props.json), never a guess.
// Writes client/src/survivorz/room/security.json (room-build.py --set security reads it too).
// The design, room by room, and its references: SURVIVORZ.md "THE SECURITY WING", REFERENCES.md round nine.
//
//   node scripts/survivorz/layout-security.mjs
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const G = JSON.parse(fs.readFileSync(path.join(ROOT, "assets/downloads/survivorz/set/greybox.json"), "utf8"));
const PROPS = JSON.parse(fs.readFileSync(path.join(ROOT, "assets/downloads/survivorz/props/props.json"), "utf8"));
const OUT = path.join(ROOT, "client/src/survivorz/room/security.json");

let st = 5531;
const rnd = () => { st = (st + 0x6d2b79f5) >>> 0; let t = st; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const jit = (a) => (rnd() - 0.5) * 2 * a;
const r3 = (v) => +v.toFixed(3);

const rooms = G.rooms.filter((r) => r.zone === "security");
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

const wallStain = (tex, x, y, z, n, w, h, rot = 0) => decals.push({ tex, at: [r3(x), y, r3(z)], n, size: [w, h], rot });

// ---- styles and skins ---------------------------------------------------------------------------------------------
// corporate-secure, not raw (round nine): grey acoustic panels and carpet tile where staff sat, sealed floors and
// painted block where the guns and the detainees were
const styles = {
  "sec-corridor": { floor: "polished-concrete", ceiling: "ceiling-white", bands: [[99, "panel-white"]], skin: "hall" },
  "control-room": { floor: "carpet-tile", ceiling: "office-ceiling", bands: [[0.12, "plinth"], [1.1, "panel-dark"], [99, "panel-white"]] },
  "sec-office": { floor: "carpet-tile", ceiling: "office-ceiling", bands: [[0.12, "plinth"], [99, "lab-wall"]] },
  interview: { floor: "kitchen-floor", ceiling: "office-ceiling", bands: [[0.12, "skirting"], [99, "panel-white"]] },
  "sec-lockers": { floor: "rubber-floor", ceiling: "office-ceiling", bands: [[0.12, "skirting"], [99, "painted-wall"]] },
  armoury: { floor: "painted-floor", ceiling: "slab", bands: [[1.2, "steel-plate"], [99, "painted-wall"]] },
  "camera-room": { floor: "raised-floor", ceiling: "slab", bands: [[0.12, "skirting"], [99, "painted-wall"]] },
  holding: { floor: "painted-floor", ceiling: "slab", bands: [[0.12, "skirting"], [99, "painted-wall"]] },
  "holding-cell": { floor: "painted-floor", ceiling: "slab", bands: [[99, "painted-wall"]] },
};
const skins = {
  "sec-corridor": { room: "sec-corridor", ceilY: 3.0, slotAxis: "x", slotPitch: 1.6, slotZ0: 73, slotInset: 0.8, slotWidth: 0.06 },
};

// ================================================================================================================
// THE SECURITY CORRIDOR (x 66-106, z 70-76): the wing's spine, glazed into the chief's office on the north and the
// control room on the south. The guards held it from the medical door and lost it: brass and dropped magazines, a
// riot shield, a barricade of chairs pulled across the control room's door.
{
  const R = "sec-corridor", I = inner(R, true);
  for (const x of [70, 84, 98]) emergency(R, x, 2.62, I.z1, [0, 0, -1]);
  exit(R, r3(I.x0), 2.45, 73.0, [1, 0, 0]);   // over the keycard door back to medical
  // the glazed fronts: the chief's office (north) and the control room (south), glass to 2.7
  cutouts.push({ axis: "z", c: 70, a0: 88.3, a1: 99.7, y0: 0, y1: 2.7 });
  glazing("z", 70, 88.3, 93.55, 0, 2.7, "chief office front west"); glazing("z", 70, 94.45, 99.7, 0, 2.7, "chief office front east");
  glazing("z", 70, 93.55, 94.45, 2.1, 2.7, "chief office door transom");
  cutouts.push({ axis: "z", c: 76, a0: 66.3, a1: 71.9, y0: 0, y1: 2.7 }, { axis: "z", c: 76, a0: 74.1, a1: 79.7, y0: 0, y1: 2.7 });
  glazing("z", 76, 66.3, 71.9, 0, 2.7, "control room front west"); glazing("z", 76, 74.1, 79.7, 0, 2.7, "control room front east");
  for (const [tex, x, z, n] of [["plate-sec-corridor", 67.4, I.z0, [0, 0, 1]], ["plate-sec-lockers", 72.9, I.z0, [0, 0, 1]], ["plate-interview", 83.9, I.z0, [0, 0, 1]],
    ["plate-control-room", 72.22, I.z1, [0, 0, -1]], ["plate-armoury", 86.45, I.z1, [0, 0, -1]], ["plate-camera-room", 95.9, I.z1, [0, 0, -1]], ["plate-holding", 103.9, I.z1, [0, 0, -1]]])
    plate(tex, x, 1.6, z, n);
  // the barricade at the control room's door: chairs dragged out and tipped, a table on its side
  put("office-chair", R, 72.4, 0, 74.9, 0, { rot: [88, 40, 0] }); put("office-chair", R, 73.7, 0, 75.1, 0, { rot: [84, 200, 0] });
  put("canteen-table", R, 73.0, 0, 74.3, 0, { rot: [86, 8, 0] });
  put("riot-shield", R, 75.6, 0, 74.6, 0, { rot: [86, 120, 0] }); put("riot-shield", R, 70.6, 0, 75.5, 182);
  // what the fight left: spent magazines and brass from the medical door to the barricade
  for (let k = 0; k < 9; k++) put(rnd() < 0.5 ? "mag-rifle" : "mag-pistol", R, 67.5 + rnd() * 8, 0, 71.0 + rnd() * 4.2, rnd() * 360, { rot: [90, rnd() * 360, 0] });
  for (let k = 0; k < 4; k++) put("shotgun-shells", R, 68.0 + rnd() * 7, 0, 71.2 + rnd() * 4, rnd() * 360);
  put("tactical-helmet", R, 69.2, 0, 71.6, 140, { rot: [0, 140, 80] }); put("walkie", R, 77.4, 0, 72.0, 30, { rot: [90, 30, 0] });
  wall("fire-extinguisher", R, "N", 80.0, { skin: true, y: 0.6 }); wall("water-dispenser", R, "S", 91.0, { skin: true });
  stain("smear", 70.4, 73.2, 1.0, 2.6, 70); stain("prints-shoes", 76.5, 72.4, 1.4, 1.0, 0); stain("smear", 81.0, 74.6, 0.8, 1.6, 20);
}

// ================================================================================================================
// THE CONTROL ROOM (x 66-80, z 76-88): the facility's command room (S1-S10), scaled to the room: the video wall on
// the far wall, two rows of consoles turned to it, the supervisor's desk behind them, the vault override on its own
// panel against the west wall (S7). The screens are dark like every other screen when the power went.
{
  const R = "control-room", I = inner(R);
  for (const [x, z] of [[69.5, 79.5], [73.0, 79.5], [76.5, 79.5], [69.5, 84.0], [73.0, 84.0], [76.5, 84.0]]) panel(R, x, z);
  emergency(R, 68.0, 2.75, I.z1, [0, 0, -1]); emergency(R, 78.0, 2.75, I.z1, [0, 0, -1]);
  wall("video-wall", R, "S", 70.55, { y: 1.15 }); wall("video-wall", R, "S", 75.45, { y: 1.15 });
  wall("wall-tv", R, "E", 84.0, { y: 1.8 }); wall("wall-tv", R, "E", 82.6, { y: 1.8 });
  // two rows of consoles facing the wall: the operators sat on the north side, looking south
  for (const z of [81.2, 84.4]) for (const x of [71.1, 74.9]) {
    put("control-console", R, x, 0, z, 180);
    for (const dx of [-0.9, 0.9]) put("office-chair", R, x + dx + jit(0.15), 0, z - 1.05 + jit(0.1), jit(30));
  }
  // the supervisor's desk behind, the incident log open on it
  const d = put("office-desk", R, 77.4, 0, 78.0, 180);
  on(d, "flat-monitor", -0.3, 0.787, -0.25, 0, { note: "the control-terminal" }); on(d, "flat-monitor", 0.35, 0.787, -0.25, -15);
  on(d, "notebook", 0.55, 0.787, 0.15, 20, { note: "the incident log, stopping mid-line" }); on(d, "desk-phone", -0.75, 0.787, 0.05, 30); on(d, "coffee-cup", 0.85, 0.787, -0.1);
  put("office-chair", R, 77.5, 0, 77.2, 0, { rot: [86, 160, 0] });   // (map polish: clear of the wall)
  wall("override-console", R, "W", 85.6, { extra: { note: "the vault override" } });
  decals.push({ tex: "sign-biohazard", at: [r3(I.x0), 2.25, 85.6], n: [1, 0, 0], size: [0.3, 0.3], opaque: true });
  wall("filing-cabinet", R, "W", 79.2); wall("security-camera", R, "N", 79.6, { y: 2.6 });
  for (let k = 0; k < 5; k++) put("file-folder", R, 70 + rnd() * 6, 0, 82.4 + rnd() * 1.2, rnd() * 360);
}

// ================================================================================================================
// THE ARMOURY (x 80-90, z 76-86): behind the card-and-PIN door. Racks along the back wall, every one emptied, the
// ammunition cage open, armour still on its hooks (not everyone came for it), the cleaning bench and its clearing
// barrel by the door (S13-S16). They armed up in a hurry.
{
  const R = "armoury", I = inner(R);
  panel(R, 83, 79); panel(R, 87, 79); panel(R, 83, 83); panel(R, 87, 83, "mains", "failing");
  emergency(R, 82.0, 2.75, I.z0, [0, 0, 1]);
  for (const x of [81.0, 82.25, 83.5, 84.75, 86.0, 87.25]) wall("weapon-rack", R, "S", x);
  wall("cleaning-bench", R, "N", r3(I.x0 + 1.2));
  decals.push({ tex: "sign-clear-weapons", at: [83.85, 1.45, r3(I.z0)], n: [0, 0, 1], size: [0.28, 0.39], opaque: true });
  wall("pharmacy-cage", R, "E", 80.6);
  put("military-crate", R, r3(I.x1 - 0.65), 0, 80.6, 90); put("military-crate", R, r3(I.x1 - 0.65), 0.3, 80.4, 94);
  for (const z of [79.6, 81.2]) put("ammo-can", R, r3(I.x1 - 0.9), 0, z, 90 + jit(15));
  put("ammo-can", R, 87.4, 0, 81.2, 30, { rot: [90, 30, 0] });   // dropped on the way out of the cage
  put("gear-rail", R, r3(I.x0 + 0.08), 1.62, 81.4, 90);
  for (const z of [80.9, 81.6]) put("armor-vest", R, r3(I.x0 + 0.3), 1.05, z, 90);
  put("tactical-helmet", R, r3(I.x0 + 0.25), 0, 83.2, 90); put("duty-belt", R, 83.6, 0, 82.4, 70);
  put("holster", R, 85.2, 0, 83.6, 200); put("riot-shield", R, r3(I.x0 + 0.1), 0, 79.0, 90, { rot: [-12, 90, 0] });
  for (let k = 0; k < 6; k++) put(rnd() < 0.5 ? "ammo-box-pistol" : "mag-pistol", R, 82.0 + rnd() * 5, 0, 81.5 + rnd() * 3.5, rnd() * 360);
  wallStain("smear", r3(I.x1), 1.0, 83.0, [-1, 0, 0], 0.7, 1.8, 6);   // down the wall beside the cage
  stain("smear", 88.6, 83.4, 0.9, 1.8, 40);
}

// ================================================================================================================
// THE CAMERA ROOM (x 90-100, z 76-86): the hot back room (S21): recorder racks on the east wall, a cable tray
// over them, the monitor desk and its wall of screens on the west, the archive of tapes and drives on the south.
{
  const R = "camera-room", I = inner(R);
  panel(R, 93, 80); panel(R, 97, 80); panel(R, 95, 83.5, "mains", "failing");
  emergency(R, 92.0, 2.75, I.z0, [0, 0, 1]);
  for (const z of [79.0, 79.6, 80.2, 80.8]) wall("server-rack", R, "E", z);
  wall("ups-cabinet", R, "E", 82.2);
  put("cable-tray", R, 98.0, 2.85, 80.2, 90);
  const d = wall("office-desk", R, "W", 80.6);
  on(d, "flat-monitor", -0.45, 0.787, -0.25, 0, { note: "the camera-terminal" }); on(d, "flat-monitor", 0.2, 0.787, -0.25, -10); on(d, "crt-monitor", 0.75, 0.787, -0.2, -20);
  put("office-chair", R, r3(I.x0 + 1.55), 0, 80.4, -90 + jit(30));
  for (const [z, y] of [[79.9, 1.25], [81.0, 1.25], [79.9, 1.95], [81.0, 1.95]]) wall("wall-tv", R, "W", z, { y });
  wall("shelving-boxes", R, "S", 93.0); wall("shelving-boxes", R, "S", 95.0);
  put("cardboard-box", R, 96.6, 0, 84.9, 20); put("binder", R, 94.0, 0, 83.6, 60);
}

// ================================================================================================================
// HOLDING (x 100-112, z 76-86): the booking counter by the door, three barred cells along the back wall, each a
// stainless bench and a toilet (S18-S20); the sealed Holding Cell 2 through the east wall.
{
  const R = "holding", I = inner(R);
  panel(R, 103, 79); panel(R, 108, 79); panel(R, 105.5, 84.2, "mains", "failing");
  emergency(R, 110.0, 2.75, I.z0, [0, 0, 1]);
  const c = put("steel-counter", R, 106.0, 0, 79.2, 0);   // the officer stood south of it, facing the door
  on(c, "flat-monitor", -0.35, 1.05, -0.2); on(c, "plastic-crate", 0.4, 1.05, -0.05, 15, { note: "the property bin" }); on(c, "clipboard-pen", 0.05, 1.05, 0.1, 10);
  put("metal-stool", R, 106.3, 0, 80.2, 0);
  // the cells: bars across the front at z 82.6, block walls between them
  const front = 82.6, xs = [101.75, 105.15, 108.55];
  for (const x of xs) put("cell-bars", R, x, 0, front + 0.08, 0);
  for (const x of [103.45, 106.85]) arch.push({ what: "cell partition", key: "painted-wall", box: [r3(x - 0.06), 0, front, r3(x + 0.06), TOP[R], r3(I.z1)] });
  arch.push({ what: "cell partition", key: "painted-wall", box: [110.25, 0, front, r3(I.x1), TOP[R], r3(I.z1)] });
  xs.forEach((x, k) => {
    wall("cell-bench", R, "S", x - 0.6);
    wall("prison-toilet", R, "S", x + 1.15);
    if (k === 1) put("bunk-blanket", R, x - 0.4, 0, 84.0, 30);
  });
  put("food-tray", R, 108.2, 0, 84.0, 20); put("handcuffs", R, 104.2, 0, 81.4, 80);
  wall("fire-extinguisher", R, "N", 101.0, { y: 0.6 });
  stain("smear", 105.0, 84.2, 0.8, 1.4, 10);
}
{
  const R = "holding-cell";
  panel(R, 115.0, 81.0, "mains", "failing");
  wall("cell-bench", R, "N", 115.2); wall("prison-toilet", R, "E", 79.4);
  put("bunk-blanket", R, 114.2, 0, 82.6, 120); put("food-tray", R, 116.6, 0, 82.8, 60, { rot: [0, 60, 90] });
}

// ================================================================================================================
// THE GUARD LOCKERS (x 66-78, z 60-70): banks along the north and west walls, benches between, armour on the hook
// rail, a uniform shirt on the floor, a duty belt half-buckled, a radio left on the bench (S17, S24).
{
  const R = "sec-lockers", I = inner(R);
  panel(R, 69, 63.5); panel(R, 74, 63.5); panel(R, 71.5, 67.2);
  emergency(R, 68.0, 2.75, I.z1, [0, 0, -1]);
  [66.9, 68.5, 70.1, 71.7, 73.3, 74.9].forEach((x, k) => wall(k % 3 === 1 ? "staff-lockers-open" : "staff-lockers", R, "N", x));
  wall("staff-lockers", R, "W", 64.0); wall("staff-lockers-open", R, "W", 65.6);
  put("gear-rail", R, r3(I.x1 - 0.08), 1.62, 64.5, -90);
  for (const z of [63.8, 64.5]) put("armor-vest", R, r3(I.x1 - 0.3), 1.05, z, -90);
  put("tactical-helmet", R, r3(I.x1 - 0.3), 0, 66.4, -90);
  for (const z of [63.4, 66.0]) put("stepover-bench", R, 72.0, 0, z, 0);
  put("duty-belt", R, 71.6, 0.45, 63.4, 20); put("walkie", R, 72.6, 0.45, 63.3, 80);
  put("clothes-folded", R, 70.4, 0, 65.0, 40, { rot: [0, 40, 6], note: "a uniform shirt" }); put("sneakers", R, 73.6, 0, 66.6, 120);
  put("towel-folded", R, 72.4, 0.45, 66.0, 10); put("backpack-small", R, 69.2, 0, 61.4, 200);
  wall("notice-board", R, "E", 67.6, { y: 1.1 });
}

// ================================================================================================================
// INTERVIEW (x 78-88, z 60-70): the interview room and, behind the glass, its observation room (S11, S12). The
// interview side is bright and hard: the bolted table, two chairs, acoustic panels, a camera in the corner. The
// observation side is dark: the recorder still running, a chair knocked over.
{
  const R = "interview", I = inner(R);
  const P = 63.2;   // the partition, its glass from 81 to 86, its door at its west end
  const box = (what, x0, y0, x1, y1) => arch.push({ what, key: "panel-white", box: [r3(x0), y0, r3(P - 0.06), r3(x1), y1, r3(P + 0.06)] });
  box("observation partition", I.x0, 0, 78.3, TOP[R]); box("observation partition", 79.3, 0, 81.0, TOP[R]); box("observation partition", 86.0, 0, I.x1, TOP[R]);
  box("observation partition", 78.3, 2.1, 79.3, TOP[R]);
  box("observation partition", 81.0, 0, 86.0, 0.9); box("observation partition", 81.0, 2.1, 86.0, TOP[R]);
  glazing("z", P, 81.0, 86.0, 0.9, 2.1, "observation glass");
  panel(R, 83.5, 65.5); panel(R, 83.5, 68.0); panel(R, 80.5, 61.6, "mains", "failing");
  emergency(R, 86.5, 2.75, I.z1, [0, 0, -1]);
  put("interview-table", R, 84.3, 0, 66.6, 0);
  put("canteen-chair", R, 84.3, 0, 65.8, 0); put("canteen-chair", R, 84.5, 0, 67.5, 175);
  put("handcuffs", R, 84.1, 0.75, 66.5, 30); put("coffee-cup", R, 84.8, 0.75, 66.9, 0);
  wall("security-camera", R, "E", 69.4, { y: 2.65 });
  // the observation room
  const d = put("office-desk", R, 83.0, 0, r3(P - 0.06 - 0.48), 180);
  on(d, "cassette-player", -0.4, 0.787, -0.15, 0, { note: "the interview-recorder, still running" }); on(d, "desk-phone", 0.5, 0.787, -0.1, 20); on(d, "flat-monitor", -0.85, 0.787, -0.25, 15);
  put("office-chair", R, 83.4, 0, 61.4, 0, { rot: [88, 210, 0] });
  wall("filing-cabinet", R, "N", 86.8);
}

// ================================================================================================================
// THE CHIEF'S OFFICE (x 88-100, z 60-70): glass to the corridor, the executive desk facing it, the credenza of files
// behind, commendations on the wall, and the map of level 1 with its pins (S23, S25).
{
  const R = "sec-office", I = inner(R);
  panel(R, 91.5, 64); panel(R, 96.5, 64); panel(R, 94, 67.5);
  emergency(R, 98.5, 2.75, I.z0, [0, 0, 1]);
  const d = put("office-desk", R, 94.0, 0, 63.2, 180);
  on(d, "flat-monitor", -0.3, 0.787, -0.25, 0, { note: "the chief-terminal" }); on(d, "flat-monitor", 0.35, 0.787, -0.25, -15);
  on(d, "desk-lamp", -0.85, 0.787, -0.2); on(d, "walkie", 0.6, 0.787, 0.15, 40); on(d, "file-folder", 0.15, 0.787, 0.2, 10);
  put("office-chair", R, 94.1, 0, 62.1, jit(20));
  put("lobby-armchair", R, 93.0, 0, 65.4, 170); put("lobby-armchair", R, 95.2, 0, 65.5, 195);
  for (const x of [92.0, 92.4, 95.8, 96.2]) wall("filing-cabinet", R, "N", x);
  for (const x of [93.4, 94.6]) wall("frame-charter", R, "N", x, { y: 1.4 });
  decals.push({ tex: "map-pinned", at: [r3(I.x0), 1.55, 64.6], n: [1, 0, 0], size: [1.6, 1.0], opaque: true });
  wall("coat-stand", R, "E", 61.2); wall("dead-plant", R, "E", 68.8);
  put("briefcase", R, 96.8, 0, 62.6, 70);
}

// ---- out ---------------------------------------------------------------------------------------------------------
const L = {
  about: "THE SECURITY WING (docs/survivorz/ASSETS.md step D, zone 5). Written by scripts/survivorz/layout-security.mjs (edit that, not this); read by scripts/survivorz/room-build.py --set security and client/src/survivorz/room/lobby.ts.",
  rooms: rooms.map((r) => r.id),
  roomRects: Object.fromEntries(rooms.map((r) => [r.id, { x: r.rect.x, z: r.rect.y, w: r.rect.w, h: r.rect.h, zone: r.zone }])),
  styles, skins, arch, cutouts, props, fixtures, decals, cast: [],
  shots: {
    corridor: { at: [67.2, 1.65, 73.0], look: [100, 1.2, 73.0], label: "The security corridor" },
    barricade: { at: [79.0, 1.65, 71.4], look: [72.5, 0.6, 75.0], label: "The barricade at the control room" },
    control: { at: [73.0, 1.65, 76.8], look: [73.0, 1.4, 87.5], label: "The control room" },
    override: { at: [76.0, 1.65, 82.0], look: [66.5, 1.0, 85.6], label: "The vault override" },
    armoury: { at: [85.0, 1.65, 76.7], look: [85.0, 0.9, 85.5], label: "The armoury" },
    cameras: { at: [95.0, 1.65, 76.7], look: [92.0, 1.0, 82.0], label: "The camera room" },
    holding: { at: [103.0, 1.65, 76.7], look: [106.0, 0.9, 85.5], label: "Holding" },
    cell: { at: [112.8, 1.65, 81.0], look: [117.0, 0.6, 81.0], label: "Holding Cell 2" },
    lockers: { at: [72.0, 1.65, 69.4], look: [70.0, 1.0, 61.0], label: "The guard lockers" },
    interview: { at: [87.0, 1.65, 69.2], look: [82.5, 1.2, 63.2], label: "Interview, the glass" },
    observation: { at: [80.0, 1.65, 60.6], look: [86.0, 1.0, 66.0], label: "Observation" },
    office: { at: [94.0, 1.65, 69.4], look: [92.0, 1.2, 61.0], label: "The chief's office" },
  },
  tint: { "carpet-tile": [0.5, 0.52, 0.56] },
  kit: { copies: [] },
  catcher: { at: [92, 74], size: [56, 32] },
  shadowSpots: [],
  puddles: [],
};
fs.writeFileSync(OUT, JSON.stringify(L, null, 2) + "\n");
console.log(`security: ${props.length} props, ${fixtures.length} fixtures, ${arch.length} arch, ${decals.length} decals`);
