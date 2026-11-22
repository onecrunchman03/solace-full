// SURVIVORZ: the research labs' layout (ASSETS.md step D, zone 3), written as a program so every position
// comes from the room's walls and the packed props' real sizes (props.json), never a guess.
// Writes client/src/survivorz/room/labs.json (room-build.py --set labs reads it too).
// The design, room by room, and its references: SURVIVORZ.md "THE RESEARCH LABS", REFERENCES.md round seven.
//
//   node scripts/survivorz/layout-labs.mjs
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const G = JSON.parse(fs.readFileSync(path.join(ROOT, "assets/downloads/survivorz/set/greybox.json"), "utf8"));
const PROPS = JSON.parse(fs.readFileSync(path.join(ROOT, "assets/downloads/survivorz/props/props.json"), "utf8"));
const OUT = path.join(ROOT, "client/src/survivorz/room/labs.json");

let st = 7741;
const rnd = () => { st = (st + 0x6d2b79f5) >>> 0; let t = st; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const jit = (a) => (rnd() - 0.5) * 2 * a;
const r3 = (v) => +v.toFixed(3);

const rooms = G.rooms.filter((r) => r.zone === "labs");
const RECT = Object.fromEntries(rooms.map((r) => [r.id, r.rect]));
const T = 0.1, SKIN = 0.02;
const inner = (id, skin = false) => { const r = RECT[id], s = T + (skin ? SKIN : 0); return { x0: r.x + s, x1: r.x + r.w - s, z0: r.y + s, z1: r.y + r.h - s }; };
const size = (id) => { const p = PROPS[id]; if (!p) throw new Error(`no packed prop ${id}`); return p.size; };

const props = [], fixtures = [], decals = [], arch = [], cutouts = [];
const put = (id, room, x, y, z, yaw = 0, extra = {}) => { props.push({ id, at: [r3(x), r3(y), r3(z)], yaw: r3(yaw), room, ...extra }); return props[props.length - 1]; };
function wall(id, room, side, along, { y = 0, skin = false, out = 0, extra = {} } = {}) {
  const I = inner(room, skin), d = size(id)[2] / 2 + out;
  if (side === "N") put(id, room, along, y, I.z0 + d, 0, extra);
  if (side === "S") put(id, room, along, y, I.z1 - d, 180, extra);
  if (side === "W") put(id, room, I.x0 + d, y, along, 90, extra);
  if (side === "E") put(id, room, I.x1 - d, y, along, -90, extra);
  return props[props.length - 1];
}
const local = (p, lx, ly, lz) => { const t = (p.yaw * Math.PI) / 180; return [r3(p.at[0] + lx * Math.cos(t) + lz * Math.sin(t)), r3(p.at[1] + ly), r3(p.at[2] - lx * Math.sin(t) + lz * Math.cos(t))]; };
const on = (p, id, lx, ly, lz, dyaw = 0, extra = {}) => props.push({ id, at: local(p, lx, ly, lz), yaw: r3(p.yaw + dyaw), room: p.room, ...extra });

// ---- styles and skins (room-build.py) --------------------------------------------------------------------------
const styles = {
  "labs-corridor": { floor: "lab-floor", ceiling: "ceiling-white", bands: [[99, "panel-white"]], skin: "hall" },
  "break-room": { floor: "vinyl-oak", ceiling: "ceiling-white", bands: [[99, "panel-white"]], skin: "hall" },
  "glass-offices": { floor: "carpet-tile", ceiling: "ceiling-white", bands: [[99, "panel-white"]], skin: "hall" },
  conference: { floor: "carpet-tile", ceiling: "ceiling-white", bands: [[99, "panel-white"]], skin: "hall" },
  "server-room": { floor: "raised-floor", ceiling: "ceiling-white", bands: [[99, "panel-white"]], skin: "hall" },
  airlock: { floor: "kitchen-floor", ceiling: "ceiling-white", bands: [[0.12, "plinth"], [99, "stainless"]] },
  "decon-shower": { floor: "steel-plate", ceiling: "stainless", bands: [[99, "stainless"]] },
  "suit-room": { floor: "kitchen-floor", ceiling: "ceiling-white", bands: [[0.12, "plinth"], [99, "lab-wall"]] },
  "clean-lab-a": { floor: "lab-floor", ceiling: "ceiling-white", bands: [[0.12, "plinth"], [99, "lab-wall"]] },
  "clean-lab-b": { floor: "lab-floor", ceiling: "ceiling-white", bands: [[0.12, "plinth"], [99, "lab-wall"]] },
  "lab-storage": { floor: "kitchen-floor", ceiling: "ceiling-white", bands: [[0.12, "plinth"], [99, "lab-wall"]] },
};
const skins = {
  "labs-corridor": { room: "labs-corridor", ceilY: 3.0, slotAxis: "x", slotPitch: 1.6, slotZ0: 43, slotInset: 0.8, slotWidth: 0.06 },
  "break-room": { room: "break-room", ceilY: 2.8, slotPitch: 2.4, slotX0: 76, slotInset: 0.6, slotWidth: 0.06 },
  "glass-offices": { room: "glass-offices", ceilY: 2.8, slotAxis: "x", slotPitch: 2.4, slotZ0: 33, slotInset: 0.6, slotWidth: 0.06 },
  conference: { room: "conference", ceilY: 2.8, slotPitch: 2.4, slotX0: 108, slotInset: 0.6, slotWidth: 0.06 },
  "server-room": { room: "server-room", ceilY: 2.8, slotAxis: "z", slotPitch: 1.8, slotX0: 112, slotInset: 0.6, slotWidth: 0.06 },
};
const TOP = Object.fromEntries(rooms.map((r) => [r.id, r.top]));
const slot = (room, x, z, style) => fixtures.push({ kind: "slot", at: [x, skins[room].ceilY + 0.06, z], room, bank: 0, ...(style ? { style } : {}) });
const emergency = (room, x, y, z, face) => fixtures.push({ kind: "emergency", at: [x, y, z], face, room, bank: 0 });
const exit = (room, x, y, z, face) => fixtures.push({ kind: "exit", at: [x, y, z], face, room, bank: 0 });
const panel = (room, x, z, circuit, style) => fixtures.push({ kind: "panel-flush", at: [x, TOP[room], z], room, bank: 0, ...(circuit ? { circuit } : {}), ...(style ? { style } : {}) });
// a door plate and its neighbours: on the wall the door is in, beside it on the side you approach from
const plate = (tex, x, y, z, n, w = 0.3, h = 0.15) => decals.push({ tex, at: [r3(x), y, r3(z)], n, size: [w, h], opaque: true });
// glazing: a pane from (a0..a1) along a wall line, its steel mullions every 1.2 m, a head and a sill channel
function glazing(axis, c, a0, a1, y0, y1, what) {
  const t = 0.006;
  for (let a = a0; a < a1 - 1e-6; a += 1.2) {
    const b = Math.min(a + 1.2, a1);
    arch.push({ what: `${what} pane`, glass: axis === "z" ? [r3(a + 0.02), y0, r3(c - t), r3(b - 0.02), y1, r3(c + t)] : [r3(c - t), y0, r3(a + 0.02), r3(c + t), y1, r3(b - 0.02)] });
  }
  for (let a = a0; a <= a1 + 1e-6; a += 1.2) {
    const m = Math.min(a, a1);
    arch.push({ what: `${what} mullion`, key: "steel", box: axis === "z" ? [r3(m - 0.025), y0, r3(c - 0.05), r3(m + 0.025), y1, r3(c + 0.05)] : [r3(c - 0.05), y0, r3(m - 0.025), r3(c + 0.05), y1, r3(m + 0.025)] });
  }
  for (const [ya, yb] of [[y0 - 0.001, y0 + 0.04], [y1 - 0.04, y1]]) arch.push({ what: `${what} channel`, key: "steel", box: axis === "z" ? [a0, ya, r3(c - 0.06), a1, yb, r3(c + 0.06)] : [r3(c - 0.06), ya, a0, r3(c + 0.06), yb, a1] });
}

// ================================================================================================================
// THE LABS CORRIDOR (x 60-108, z 40-46): the spine (L28). Resin floor, white panels, twin lines of light along it,
// the glass offices and conference room along the north side (L10-L12): you can see into every room.
{
  const R = "labs-corridor", I = inner(R, true);
  emergency(R, 70, 2.62, I.z1, [0, 0, -1]); emergency(R, 86, 2.62, I.z1, [0, 0, -1]); emergency(R, 100, 2.62, I.z1, [0, 0, -1]);
  exit(R, 63, 2.45, I.z0, [0, 0, 1]);   // over the keycard door back to decon (the way out)
  // the glazed fronts: the offices (86-102) and the conference room (102-108), glass to 2.7, their doors in them
  cutouts.push({ axis: "z", c: 40, a0: 86.3, a1: 101.7, y0: 0, y1: 2.7 }, { axis: "z", c: 40, a0: 102.3, a1: 107.7, y0: 0, y1: 2.7 });
  glazing("z", 40, 86.3, 93.55, 0, 2.7, "office front west"); glazing("z", 40, 94.45, 101.7, 0, 2.7, "office front east");
  glazing("z", 40, 93.55, 94.45, 2.1, 2.7, "office door transom");
  glazing("z", 40, 102.3, 104.55, 0, 2.7, "conference front"); glazing("z", 40, 105.45, 107.7, 0, 2.7, "conference front");
  glazing("z", 40, 104.55, 105.45, 2.1, 2.7, "conference door transom");
  // the steel bump rail along the solid south wall (L: the corridor's trolleys)
  // broken at every doorway in that wall (map polish, Oct 29 2026: one run straight across the airlock's
  // opening at hip height — the doorway was walkable on the walk map and a rail stood in it on screen)
  {
    const gaps = G.doors.filter((d) => d.kind !== "vent" && d.kind !== "grate" && d.normal[0] === 0 && d.centre[0] > 60.25 && d.centre[0] < 107.75 && Math.abs(d.centre[2] - RECT["labs-corridor"].y - RECT["labs-corridor"].h) < 0.3)
      .map((d) => [d.centre[0] - d.size[0] / 2 - 0.05, d.centre[0] + d.size[0] / 2 + 0.05]).sort((a, b) => a[0] - b[0]);
    let x = 60.25;
    for (const [g0, g1] of [...gaps, [107.75, 107.75]]) {
      if (g0 > x + 0.1) arch.push({ what: "south bump rail", key: "steel", box: [r3(x), 0.92, r3(I.z1 - 0.05), r3(Math.min(g0, 107.75)), 1.04, r3(I.z1)], skip: ["+z"] });
      x = Math.max(x, g1);
    }
  }
  // the plates, the corridor's few things
  plate("plate-labs-corridor", 61.6, 1.6, I.z0, [0, 0, 1]);
  plate("plate-break-room", 77.2, 1.6, I.z0, [0, 0, 1]);
  plate("plate-server-room", r3(I.x1), 1.6, 44.4, [-1, 0, 0]);
  plate("plate-airlock", 106.6, 1.6, I.z1, [0, 0, -1]); plate("pressure-25", 103.6, 1.5, I.z1, [0, 0, -1], 0.15, 0.2);
  decals.push({ tex: "sign-biohazard", at: [105, 2.75, r3(I.z1)], n: [0, 0, -1], size: [0.4, 0.4], opaque: true });
  wall("water-dispenser", R, "S", 66.0, { skin: true });
  wall("fire-extinguisher", R, "S", 80.4, { skin: true, y: 0.6 });
  wall("fire-extinguisher", R, "S", 96.4, { skin: true, y: 0.6 });
  wall("biohazard-bin", R, "S", 102.6, { skin: true });
  wall("glove-dispenser", R, "S", 107.0, { skin: true, y: 1.2 });
  put("clipboard", R, 88.2, 0, 43.6, 37); put("paper-debris", R, 82.5, 0, 42.8, 150); put("coffee-cup", R, 74.4, 0, 44.9, 0, { rot: [90, 30, 0] });
  put("id-card", R, 97.1, 0, 42.4, 64);
}

// ================================================================================================================
// THE BREAK ROOM (x 66-86, z 32-40): the zone's one warm room (L11, L14): oak vinyl, the kitchenette on the north
// wall, three tables, a sofa corner; the coffee left to go cold.
{
  const R = "break-room", I = inner(R, true);
  emergency(R, 74.6, 2.38, I.z1, [0, 0, -1]);
  const k = wall("kitchenette", R, "N", 71.0, { skin: true });
  wall("fridge", R, "N", 73.6, { skin: true });
  wall("vending-machine", R, "N", 74.6, { skin: true, out: 0.05 });
  on(k, "coffee-maker", 1.2, 0.9, -0.12, 90); on(k, "microwave", 0.35, 0.9, -0.05);
  on(k, "mug-white", 1.0, 0.9, 0.12, 40); on(k, "mug-white", 1.45, 0.9, 0.1, 160); on(k, "coffee-cup", -1.4, 0.9, 0.1);
  for (const [tx, tz] of [[71.5, 36.2], [76.0, 36.2], [80.5, 35.0]]) {
    put("canteen-table", R, tx, 0, tz, 0);
    for (const side of [-1, 1]) for (const dx of [-0.55, 0.55]) {
      if (rnd() < 0.15) continue;
      const push = 0.6 + rnd() * 0.3, yaw = (side < 0 ? 0 : 180) + jit(20);
      put("canteen-chair", R, tx + dx + jit(0.06), 0, tz + side * push, yaw);
    }
  }
  put("coffee-cup", R, 71.2, 0.75, 36.0, 0); put("coffee-cup", R, 76.4, 0.75, 36.4, 0); put("mug-white", R, 80.2, 0.75, 35.1, 70);
  put("plate", R, 71.9, 0.762, 36.35, 0); put("cutlery", R, 72.1, 0.762, 36.3, 30);
  // the sofa corner by the east wall
  put("lobby-sofa", R, r3(I.x1 - 0.4), 0, 36.4, -90);
  put("coffee-table", R, r3(I.x1 - 1.45), 0, 36.4, 0);
  put("magazine-pile", R, r3(I.x1 - 1.45), 0.39, 36.2, 20);
  wall("notice-board", R, "W", 35.5, { skin: true, y: 1.1 });
  wall("snake-plant", R, "S", 84.6, { skin: true });
}

// ================================================================================================================
// THE GLASS OFFICES (x 86-102, z 26-40): the researchers' write-up space (L10): two private glass offices on the
// north wall, six desks in the open part, two terminals left logged in, the keycard on a desk (keycard 2).
{
  const R = "glass-offices", I = inner(R, true);
  emergency(R, 92.4, 2.38, I.z1, [0, 0, -1]);
  // the two private offices: glass fronts at z 30.4 with a door gap each, glass between them at x 94
  for (const [a0, a1, d0] of [[86.12, 93.9, 91.6], [94.1, 101.88, 99.6]]) {
    glazing("z", 30.4, a0, d0, 0, 2.8, "private office front"); glazing("z", 30.4, d0 + 0.95, a1, 0, 2.8, "private office front");
    glazing("z", 30.4, d0, d0 + 0.95, 2.1, 2.8, "private office door transom");
  }
  glazing("x", 94.0, 26.12, 30.4, 0, 2.8, "private office partition");
  for (const [cx, name] of [[90.0, "a"], [98.0, "b"]]) {
    const d = put("office-desk", R, cx, 0, 28.3, 180);   // its user sits on the wall side, facing the glass
    on(d, "flat-monitor", -0.3, 0.787, -0.25); on(d, "flat-monitor", 0.35, 0.787, -0.25, -20);
    put("office-chair", R, cx + 0.3, 0, 27.15, jit(30));
    wall("filing-cabinet", R, "N", cx - 2.6, { skin: true });
    wall("whiteboard", R, "W", 28.2, { skin: true, y: 0.9 }).room = R;
  }
  props[props.length - 1].at[0] = r3(94.1 + size("whiteboard")[2] / 2);   // the east office's board hangs on the partition's far side
  // the open desks: two rows of three, back to back on a spine at z 34; each desk's front (+z of the prop) is
  // the side its user sits at, its screens on the back edge
  const desks = [[89.4, 180], [93.9, 180], [98.4, 180], [89.4, 0], [93.9, 0], [98.4, 0]];
  desks.forEach(([x, yaw], i) => {
    const dk = put("office-desk", R, x, 0, yaw === 180 ? 33.52 : 34.48, yaw);
    on(dk, "flat-monitor", -0.4, 0.787, -0.25, 0); on(dk, "flat-monitor", 0.25, 0.787, -0.25, -15);
    if (i % 2) on(dk, "desk-lamp", 0.85, 0.787, -0.2, 200);
    if (rnd() < 0.6) on(dk, "coffee-cup", 0.6, 0.787, 0.1);
    if (rnd() < 0.5) on(dk, "sticky-notes", -0.75, 0.787, 0.1, jit(40));
    if (rnd() < 0.5) on(dk, "clipboard", 0.1, 0.787, 0.15, jit(60));
    const away = 0.75 + rnd() * 0.35, zc = yaw === 180 ? 33.52 - 0.48 - away : 34.48 + 0.48 + away;
    if (i === 4) put("office-chair", R, x - 0.2, 0, zc, yaw + 180, { rot: [90, yaw + 180, 0] });   // knocked over as they ran
    else put("office-chair", R, x + jit(0.3), 0, zc, yaw + 180 + jit(35));
  });
  // keycard 2: left on the desk nearest the door, beside its owner's cup (facility-map "card-2")
  put("keycard-b", R, 94.4, 0.79, 34.85, 37, { note: "keycard 2 (facility-map card-2)" });
  wall("office-copier", R, "W", 37.0, { skin: true });
  wall("snake-plant", R, "E", 38.8, { skin: true });
  put("paper-debris", R, 92.0, 0, 37.5, 10); put("binder", R, 97.0, 0, 37.8, 120);
}

// ================================================================================================================
// THE CONFERENCE ROOM (x 102-114, z 30-40): the long table, chairs pushed back, the board with the log (L: a
// legible handwritten log), the screen dark mid-meeting.
{
  const R = "conference", I = inner(R, true);
  emergency(R, 110.0, 2.38, I.z1, [0, 0, -1]);
  put("conference-table", R, 108.2, 0, 35.0, 0);
  for (const s of [-1, 1]) for (const dx of [-1.8, -0.9, 0, 0.9, 1.8]) {
    const away = 0.85 + rnd() * 0.45;
    put("office-chair", R, 108.2 + dx + jit(0.15), 0, 35.0 + s * away, (s < 0 ? 0 : 180) + jit(40));
  }
  put("office-chair", R, 105.3, 0, 35.0, 90 + jit(20));
  wall("whiteboard", R, "E", 35.0, { skin: true, y: 0.9, extra: { note: "the conference whiteboard (facility-map log conference-whiteboard)" } });
  wall("wall-tv", R, "N", 108.2, { skin: true, y: 1.4 });
  for (const [x, z] of [[107.0, 34.7], [109.5, 35.3], [106.4, 35.4]]) put("coffee-cup", R, x, 0.752, z, 0);
  put("clipboard", R, 108.8, 0.752, 34.6, 15); put("laptop", R, 110.3, 0.752, 34.7, 180);
  wall("snake-plant", R, "N", 112.8, { skin: true });
}

// ================================================================================================================
// THE SERVER ROOM (x 108-116, z 40-52): the opposite register (L18, L20): the access floor, two rows of racks facing
// across a cold aisle, the cooling unit at the end, the UPS by the door, cable trays overhead.
{
  const R = "server-room", I = inner(R, true);
  emergency(R, 112.0, 2.38, I.z0, [0, 0, 1]);
  plate("plate-server-room", r3(I.x0), 1.6, 41.6, [1, 0, 0]);
  for (let k = 0; k < 9; k++) {
    const z = 44.1 + k * 0.61;
    put("server-rack", R, 110.6, 0, r3(z), 90);    // two rows facing across a 1.7 m cold aisle, hot aisles behind
    put("server-rack", R, 113.4, 0, r3(z), -90);
  }
  wall("crac-unit", R, "S", 112.0, { skin: true });
  wall("ups-cabinet", R, "N", 113.9, { skin: true }); wall("ups-cabinet", R, "N", 114.6, { skin: true });
  for (const x of [110.6, 113.4]) for (const z of [45.5, 48.5]) put("cable-tray", R, x, 2.35, z, 90);
  const d = wall("office-desk", R, "N", 110.6, { skin: true });
  on(d, "flat-monitor", -0.3, 0.787, -0.2); on(d, "flat-monitor", 0.35, 0.787, -0.2, -15);
  put("office-chair", R, 110.7, 0, 42.4, 160);
}

// ================================================================================================================
// THE ENTRY SEQUENCE (L1, L2, L4, L9): one-way, each room smaller, harder and emptier than the last.
// The airlock (x 102-108, z 46-52): stainless, the interlock panels and readers, the pressure gauge.
{
  const R = "airlock", I = inner(R);
  panel(R, 105, 49, "mains");
  emergency(R, 103.0, 2.45, I.z0, [0, 0, 1]);
  for (const [z, n] of [[I.z0, [0, 0, 1]], [I.z1, [0, 0, -1]]]) {
    put("touch-panel", R, 106.3, 1.3, r3(z + n[2] * 0.012), n[2] > 0 ? 0 : 180);
    put("bio-reader", R, 106.0, 1.25, r3(z + n[2] * 0.045), n[2] > 0 ? 0 : 180);
  }
  plate("plate-decon-shower", 106.6, 1.6, I.z1, [0, 0, -1]); plate("pressure-50", 103.6, 1.5, I.z1, [0, 0, -1], 0.15, 0.2);
  wall("glove-dispenser", R, "W", 49.0, { y: 1.2 });
  wall("biohazard-bin", R, "E", 50.6);
}
// The chemical shower (x 102-108, z 52-58): all stainless, the nozzle frame, the floor still wet, nothing else.
{
  const R = "decon-shower", I = inner(R);
  panel(R, 105, 55, "mains");
  emergency(R, 103.0, 2.45, I.z1, [0, 0, -1]);
  put("decon-shower-rig", R, 104.9, 0, 55.0, 0);
  plate("plate-suit-room", r3(I.x1), 1.6, 56.6, [-1, 0, 0]); plate("pressure-75", r3(I.x1), 1.5, 53.6, [-1, 0, 0], 0.15, 0.2);
}
// The suit room (x 108-116, z 52-64): numbered lockers (one open), the rail of suits (one missing), coiled hoses
// hanging from the ceiling, the step-over bench across it.
{
  const R = "suit-room", I = inner(R);
  panel(R, 112, 55.5, "mains"); panel(R, 112, 60.5, "mains");
  emergency(R, 110.0, 2.6, I.z1, [0, 0, -1]);
  wall("staff-lockers", R, "N", 110.6); wall("staff-lockers-open", R, "N", 112.4); wall("staff-lockers", R, "N", 114.2);
  const rail = wall("suit-rail", R, "S", 112.0);
  [-0.96, -0.48, 0.48, 0.96].forEach((lx) => on(rail, "hazmat-suit-hung", lx, 0.22 - rail.at[1], 0.3, jit(6)));   // the hook at 0
  for (const [x, z] of [[110.0, 58.0], [112.0, 58.0], [114.0, 58.0], [112.0, 56.0]]) put("air-hose", R, x, r3(TOP[R] - 1.0), z, jit(90));
  put("stepover-bench", R, 112.0, 0, 59.6, 0);
  wall("glove-dispenser", R, "W", 58.8, { y: 1.2 }); wall("biohazard-bin", R, "W", 61.6);
  plate("plate-clean-lab-a", r3(I.x1), 1.6, 59.6, [-1, 0, 0]);
  decals.push({ tex: "sign-biohazard", at: [r3(I.x1), 2.5, 58.0], n: [-1, 0, 0], size: [0.4, 0.4], opaque: true });
}

// ================================================================================================================
// THE CLEAN LABS (L5, L13, L15): white resin, epoxy walls, a sealed white ceiling with flush panels; two islands
// with their service spines, the cabinets and the hood on the walls, the freezers on the back wall, hoses over
// the aisles. Lab A: the working lab, left mid-procedure.
const benchTop = (b, items) => items.forEach(([id, lx, lz, dyaw = 0, extra = {}]) => on(b, id, lx, 0.9, lz, dyaw, extra));
{
  const R = "clean-lab-a", I = inner(R);
  for (const x of [119.6, 123.2, 126.8]) for (const z of [55.2, 59.0, 62.8]) panel(R, x, z, "mains");
  emergency(R, 117.4, 2.55, I.z0, [0, 0, 1]); emergency(R, 128.6, 2.55, I.z1, [0, 0, -1]);
  const i1 = put("lab-bench-island", R, 124.4, 0, 57.25, 0), i2 = put("lab-bench-island", R, 124.4, 0, 60.85, 0);
  benchTop(i1, [["kit-analyser", -1.0, -0.4], ["kit-tube-rack", 0.2, -0.45, 10], ["micropipette", 0.45, -0.5, 80, { rot: [0, 80, 90] }], ["conical-flasks", 1.2, -0.45],
    ["microscope-industrial", -1.1, 0.42, 180], ["centrifuge", 0.4, 0.4, 180], ["beaker", 1.3, 0.45], ["test-tubes", 0.95, 0.5, 30]]);
  benchTop(i2, [["kit-plate-reader", -1.1, -0.45], ["kit-meter", 0.0, -0.5], ["kit-balance", 1.1, -0.5], ["kit-mini-centrifuge", -0.6, 0.45, 180],
    ["kit-tube-rack-b", 0.5, 0.45, 180], ["erlenmeyer", 1.2, 0.5], ["graduated-cylinder", 1.4, 0.4]]);
  for (const b of [i1, i2]) for (const [lx, ly, lz] of [[-1.2, 1.32, -0.1], [-0.6, 1.32, 0.1], [0.3, 1.67, -0.1], [1.0, 1.32, 0.12], [0.8, 1.67, 0.08]]) on(b, "glass-bottle", lx, ly, lz);
  for (const b of [i1, i2]) for (const [lx, lz, yaw] of [[-1.3, -0.95, 0], [0.0, -1.0, 10], [1.2, 0.95, 180]]) on(b, "lab-stool", lx, 0, lz, yaw + jit(30));
  put("lab-stool", R, 121.8, 0, 59.1, 0, { rot: [90, 30, 0] });   // knocked over in the aisle
  wall("biosafety-cabinet", R, "N", 119.1); wall("biosafety-cabinet", R, "N", 127.4);
  wall("fume-hood", R, "E", 54.6);
  wall("freezer-80", R, "S", 128.8); wall("freezer-80", R, "S", 127.85); wall("fridge", R, "S", 126.9);
  wall("incubator-stack", R, "S", 125.8);
  wall("eyewash-shower", R, "S", 117.6);
  wall("lab-sink", R, "W", 54.4); wall("autoclave", R, "W", 63.4);
  wall("biohazard-bin", R, "W", 61.0);
  for (const x of [120.6, 124.4, 128.2]) put("air-hose", R, x, r3(TOP[R] - 1.0), 59.05, jit(90));
  put("clipboard", R, 122.6, 0, 58.6, 70); put("test-tubes", R, 126.0, 0, 59.3, 110, { rot: [0, 110, 90] });
  plate("plate-lab-storage", 124.2, 1.6, I.z0, [0, 0, 1]);
  plate("plate-clean-lab-b", r3(I.x1), 1.6, 57.4, [-1, 0, 0]);
}
// Lab B: the instrument lab (L8: a big instrument inside containment): the floor microscope in its bay, the
// analysers on the wall benches, one island, the freezers.
{
  const R = "clean-lab-b", I = inner(R);
  for (const x of [133.6, 137.2, 140.8]) for (const z of [55.2, 59.0, 62.8]) panel(R, x, z, "mains");
  emergency(R, 131.4, 2.55, I.z1, [0, 0, -1]);
  const w1 = wall("lab-bench-wall", R, "N", 134.6), w2 = wall("lab-bench-wall", R, "N", 137.65);
  benchTop(w1, [["kit-liquid-handler", -0.6, 0.0], ["kit-tube-rack", 0.75, 0.05], ["beaker", 1.2, -0.15]]);
  benchTop(w2, [["kit-sequencer", -0.8, 0.0], ["kit-monitor", 0.55, 0.15], ["kit-tablet", 1.1, 0.0, 15]]);
  wall("lab-bench-wall", R, "E", 55.8);
  benchTop(props[props.length - 1], [["kit-analyser", -0.6, 0.0], ["conical-flasks", 0.8, 0.0]]);
  // the bay: the cryo-EM against the east wall, its operator's desk facing it across the floor
  put("cryo-em", R, r3(I.x1 - 0.85), 0, 62.4, -90);
  const op = put("office-desk", R, 139.2, 0, 62.4, -90);   // its user sits on the west side, facing the machine
  on(op, "flat-monitor", -0.45, 0.787, -0.25); on(op, "flat-monitor", 0.2, 0.787, -0.25, -15); on(op, "kit-tablet", 0.7, 0.787, 0.1, 20);
  put("office-chair", R, 138.1, 0, 62.6, 90 + jit(30));
  wall("kit-floor-unit", R, "E", 59.4); wall("kit-floor-unit", R, "E", 58.6);
  const isl = put("lab-bench-island", R, 136.0, 0, 60.4, 0);
  benchTop(isl, [["microscope-industrial", -1.0, -0.45], ["kit-vortex", -0.2, -0.45], ["test-tubes", 0.4, -0.5], ["kit-tube-rack-b", 1.1, 0.45, 180], ["centrifuge", -0.4, 0.45, 180]]);
  for (const [lx, lz, yaw] of [[-1.2, -1.0, 0], [0.6, 1.0, 180]]) on(isl, "lab-stool", lx, 0, lz, yaw + jit(30));
  wall("biosafety-cabinet", R, "W", 63.6, { out: 0.0 });
  wall("freezer-80", R, "S", 136.0); wall("freezer-80", R, "S", 136.95); wall("freezer-80", R, "S", 137.9);
  wall("ln2-dewar", R, "S", 139.4);
  for (const x of [134.2, 138.0]) put("air-hose", R, x, r3(TOP[R] - 1.0), 58.6, jit(90));
}
// Lab storage (x 116-130, z 40-52): the loud ugly room (L21, L22): a row of -80s, the dewars, the yellow
// flammables cabinets, gas cylinders, shelving of consumables.
{
  const R = "lab-storage", I = inner(R);
  for (const x of [119.5, 126.5]) for (const z of [43.5, 48.5]) panel(R, x, z, "mains");
  emergency(R, 121.6, 2.55, I.z1, [0, 0, -1]);
  for (let k = 0; k < 6; k++) wall("freezer-80", R, "N", 117.0 + k * 0.95);
  wall("chemical-cabinet", R, "E", 42.6); wall("chemical-cabinet", R, "E", 43.8);
  for (const z of [46.0, 46.8, 47.6]) wall("ln2-dewar", R, "E", z);
  for (const z of [41.0, 41.5, 42.0, 42.5]) wall("gas-cylinder", R, "W", z, { out: 0.02 });
  for (const x of [118.6, 127.6]) {
    const s = wall("shelving-steel", R, "S", x);
    [[0.08, "cardboard-box"], [0.59, "plastic-crate"], [0.98, "medical-box"], [1.36, "cardboard-box"], [1.75, "plastic-crate"]].forEach(([y, id]) => {
      for (let lx = -0.55; lx <= 0.56; lx += 0.42) if (rnd() < 0.85) on(s, id, lx + jit(0.02), y, jit(0.03));
    });
  }
  put("hand-truck", R, 124.0, 0, 46.2, 30);
  put("cardboard-box", R, 124.3, 0, 46.9, 12); put("cardboard-box", R, 124.25, 0.34, 46.85, 40);
  decals.push({ tex: "sign-authorized", at: [r3(I.x1), 1.7, 45.2], n: [-1, 0, 0], size: [0.4, 0.3], opaque: true });
}

// ================================================================================================================
// THE MESS (2026-10-27): the labs were left at a run, not a walk. Papers off the office desks, a chair rolled into the
// aisle, a mug knocked over in the conference room, a clipboard and a dropped tube rack in the clean labs, shoe prints
// out of the airlock and down the corridor.
{
  const floor = (id, room, x, z, yaw, flat = true) => put(id, room, x, 0, z, yaw, flat ? { rot: [90, yaw, 0] } : {});
  const stain = (tex, x, z, w, h, rot = 0) => decals.push({ tex, at: [r3(x), 0.004, r3(z)], n: [0, 1, 0], size: [w, h], rot });
  for (const [x, z, a] of [[91.5, 30.6, 20], [96.0, 30.9, 140], [92.8, 37.6, 75], [100.4, 37.2, 200]]) put("paper-debris", "glass-offices", x, 0, z, a);
  floor("file-folder", "glass-offices", 94.6, 30.2, 35); floor("clipboard", "glass-offices", 90.9, 36.7, 300);
  put("office-chair", "glass-offices", 95.9, 0, 31.4, 0, { rot: [84, 120, 0] });
  put("coffee-cup", "conference", 108.6, 0, 33.0, 0, { rot: [90, 40, 0] }); put("paper-debris", "conference", 104.2, 0, 37.4, 60);
  floor("clipboard", "clean-lab-a", 121.0, 63.6, 20); put("kit-tube-rack", "clean-lab-a", 127.6, 0, 63.2, 70, { rot: [0, 70, 90] });
  put("paper-debris", "clean-lab-b", 133.4, 0, 58.2, 110);
  put("paper-debris", "labs-corridor", 104.0, 0, 43.4, 20); floor("id-card", "labs-corridor", 99.2, 42.7, 64);
  stain("prints-shoes", 103.0, 43.2, 1.4, 1.0, 180); stain("prints-shoes", 96.0, 42.6, 1.4, 1.0, 180);
}

// ---- out ---------------------------------------------------------------------------------------------------------
const L = {
  about: "THE RESEARCH LABS (docs/survivorz/ASSETS.md step D, zone 3). Written by scripts/survivorz/layout-labs.mjs (edit that, not this); read by scripts/survivorz/room-build.py --set labs and client/src/survivorz/room/lobby.ts.",
  rooms: rooms.map((r) => r.id),
  roomRects: Object.fromEntries(rooms.map((r) => [r.id, { x: r.rect.x, z: r.rect.y, w: r.rect.w, h: r.rect.h, zone: r.zone }])),
  styles, skins, arch, cutouts, props, fixtures, decals, cast: [],
  shots: {
    corridor: { at: [61.5, 1.65, 43.0], look: [100, 1.4, 43.0], label: "The labs corridor" },
    offices: { at: [91.0, 1.65, 44.6], look: [96, 1.2, 33.0], label: "Into the glass offices" },
    desks: { at: [100.6, 1.65, 38.8], look: [90, 1.0, 33.0], label: "The offices' desks" },
    break: { at: [83.6, 1.65, 38.8], look: [70, 1.1, 33.5], label: "The break room" },
    conference: { at: [103.2, 1.65, 38.8], look: [112, 1.0, 33.0], label: "The conference room" },
    server: { at: [112.0, 1.65, 42.0], look: [112, 1.0, 51.5], label: "The server room" },
    airlock: { at: [105.0, 1.65, 46.6], look: [105, 1.3, 57.5], label: "The airlock" },
    suits: { at: [109.0, 1.65, 54.6], look: [113, 1.0, 62.5], label: "The suit room" },
    "lab-a": { at: [117.0, 1.65, 54.0], look: [127, 0.9, 61.5], label: "Clean Lab A" },
    "lab-b": { at: [131.0, 1.65, 64.6], look: [140, 1.0, 55.0], label: "Clean Lab B" },
    storage: { at: [123.0, 1.65, 50.6], look: [121, 1.0, 41.0], label: "Lab storage" },
  },
  tint: { "carpet-tile": [0.5, 0.52, 0.56] },
  kit: { copies: [] },
  catcher: { at: [102, 46], size: [86, 42] },
  shadowSpots: [],
  puddles: [{ at: [104.9, 0.0, 55.0], radius: 1.3, room: "decon-shower", under: "the last cycle" }],
};
fs.writeFileSync(OUT, JSON.stringify(L, null, 2) + "\n");
console.log(`labs: ${props.length} props, ${fixtures.length} fixtures, ${arch.length} arch, ${decals.length} decals`);
