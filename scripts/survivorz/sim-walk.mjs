// SOLACE SURVIVORZ — THE SIMULATION'S WALK MAP: the grey box's walk map with the furniture in it.
//
// Run:  npm run build && node scripts/survivorz/sim-walk.mjs
//
// THE BUNKER (Nov 3 2026, docs/survivorz/BUNKER.md): the map is Civil Defence Shelter 14 (bunker-map.ts) and
// the dressed rooms are client/src/survivorz/room/bunker.json alone. The containers worth searching are named
// below (CONTAINERS) and become "loot" spots; the beds are the infirmary's (resting there heals faster).
//
// src/survivorz/bunker-walk.json (scripts/survivorz/greybox.mjs --map bunker) knows the walls and nothing else, so a
// body walking it goes straight through the desks. This stamps every piece of furniture the dressed
// rooms place (client/src/survivorz/room/*.json — the one list of what stands where) onto it, sized
// from the packed props' measured bounds (assets/downloads/survivorz/props/props.json — gitignored,
// licensed, so this runs on the box that has the props; the output is committed), and writes
//   src/survivorz/sim/walk.json
// which src/survivorz/sim/nav.ts reads, and beside it
//   src/survivorz/sim/sight.json
// — the grey box's walls plus the shells' TALL OPAQUE architecture (below) — which decides what can be seen.
// The rules:
//   · a prop blocks the cells within BODY_R of its footprint (turned by its yaw, or its tipped box's
//     outline for a knocked-over one), only if it stands on the floor (its bottom under 1.2 m) and is
//     big enough to walk round (taller than 0.35 m, a footprint over 0.04 m²);
//   · nothing in a shaft (the lift car, the stairs) and nothing within a door's approach is stamped;
//   · a prop that would cut a room in two (more walkable pieces in that room than before) is DROPPED
//     and named in the output, so a badly placed prop can never strand a spot or a doorway;
//   · every spot the sim needs (loot, terminals, keycards, breakers, …) gets a STAND cell — the nearest
//     walkable cell in its room to where the grey box puts it — and every safe room's six beds are the
//     real bed props (a sleeper lies ON the bed; the stand cell is beside it).
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const { BUNKER: SITE_9 } = require(path.join(ROOT, "dist/survivorz/bunker-map.js"));
const { FLOOR_Y, floorsOf, doorPlacement, VAULT_OPENING } = require(path.join(ROOT, "dist/survivorz/facility.js"));
const BASE = JSON.parse(fs.readFileSync(path.join(ROOT, "src/survivorz/bunker-walk.json"), "utf8"));
const GREY = path.join(ROOT, "assets/downloads/survivorz/set/bunker-greybox.json");
const PROPS = path.join(ROOT, "assets/downloads/survivorz/props/props.json");
for (const f of [GREY, PROPS]) if (!fs.existsSync(f)) { console.error(`missing ${path.relative(ROOT, f)} — run this on the box with the packed set and props`); process.exit(1); }
const grey = JSON.parse(fs.readFileSync(GREY, "utf8"));
const propIndex = JSON.parse(fs.readFileSync(PROPS, "utf8"));
const propInfo = propIndex.props ?? propIndex;

const RES = BASE.res, R = BASE.bodyR;
const MIN_H = 0.35, MIN_AREA = 0.04, MAX_BOTTOM = 1.2, DOOR_CLEAR = 1.1;
// LOW BUT WIDE (map polish, Oct 28 2026): a crate 0.30 m tall and 1.8 m long, a body bag, a box of 0.34
// is under MIN_H but nobody walks THROUGH it — measured over 6 sim hours, bodies stood inside ~2,500
// times. Anything at least LOW_H tall with a footprint over LOW_AREA is furniture too.
const LOW_H = 0.2, LOW_AREA = 0.15;

// ---- decode the base walk map -------------------------------------------------------------------------
const floors = BASE.floors.map((f) => {
  const g = new Uint8Array(f.w * f.h);
  f.rows.forEach((row, j) => {
    let i = 0;
    for (const m of row.matchAll(/(\d+)([.#])/g)) { const n = Number(m[1]); if (m[2] === ".") g.fill(1, j * f.w + i, j * f.w + i + n); i += n; }
  });
  return { ...f, g };
});
// THE SIGHT GRID starts as the walls alone (a body sees over a desk, a crate, a body bag)
const sight = floors.map((f) => Uint8Array.from(f.g));
const cellOf = (f, x, z) => [Math.floor((x - f.origin[0]) * RES), Math.floor((z - f.origin[1]) * RES)];
const centreOf = (f, i, j) => [f.origin[0] + (i + 0.5) / RES, f.origin[1] + (j + 0.5) / RES];
const roomById = new Map(SITE_9.rooms.map((r) => [r.id, r]));

// ---- the cells nothing may be stamped on: each door's opening and the floor either side of it -------------
const guard = floors.map((f) => new Uint8Array(f.w * f.h));
for (const d of SITE_9.doors) {
  if (d.kind === "vent" || d.kind === "grate") continue;
  const p = doorPlacement(SITE_9, d.id);
  const ra = roomById.get(d.a), rb = roomById.get(d.b);
  const shared = floorsOf(ra).filter((x) => floorsOf(rb).includes(x));
  if (!p || !shared.length) continue;
  for (const fl of shared) {
    const f = floors[fl];
    const w = (d.kind === "vault" ? VAULT_OPENING[0] : p.size[0]) / 2 + 0.3;
    const nx = p.normal[0], nz = p.normal[2];
    for (let j = 0; j < f.h; j++) for (let i = 0; i < f.w; i++) {
      const [cx, cz] = centreOf(f, i, j);
      const dx = cx - p.centre[0], dz = cz - p.centre[2];
      const across = dx * nx + dz * nz, along = -dx * nz + dz * nx;
      if (Math.abs(across) <= DOOR_CLEAR && Math.abs(along) <= w) guard[fl][j * f.w + i] = 1;
    }
  }
}
// the shafts' links and the grate's ladder: keep a metre round each end clear
for (const l of BASE.links) for (const end of [l.upper, l.lower]) {
  const f = floors[end.floor];
  const [ci, cj] = cellOf(f, end.at[0], end.at[2]);
  for (let j = cj - RES; j <= cj + RES; j++) for (let i = ci - RES; i <= ci + RES; i++) if (i >= 0 && j >= 0 && i < f.w && j < f.h) guard[end.floor][j * f.w + i] = 1;
}

// ---- which room a cell is in (its centre inside the rect, on that floor) --------------------------------
const roomAt = floors.map((f) => {
  const a = new Int16Array(f.w * f.h).fill(-1);
  SITE_9.rooms.forEach((r, ri) => {
    if (!floorsOf(r).includes(f.floor)) return;
    const [i0, j0] = cellOf(f, r.rect.x, r.rect.y), [i1, j1] = cellOf(f, r.rect.x + r.rect.w, r.rect.y + r.rect.h);
    for (let j = Math.max(0, j0); j <= Math.min(f.h - 1, j1); j++) for (let i = Math.max(0, i0); i <= Math.min(f.w - 1, i1); i++) {
      const [cx, cz] = centreOf(f, i, j);
      if (cx >= r.rect.x && cx <= r.rect.x + r.rect.w && cz >= r.rect.y && cz <= r.rect.y + r.rect.h && a[j * f.w + i] < 0) a[j * f.w + i] = ri;
    }
  });
  return a;
});

/** How many separate walkable pieces a room has on a floor. */
function pieces(fl, ri) {
  const f = floors[fl], g = f.g, ra = roomAt[fl];
  const r = SITE_9.rooms[ri];
  const [i0, j0] = cellOf(f, r.rect.x - 1, r.rect.y - 1), [i1, j1] = cellOf(f, r.rect.x + r.rect.w + 1, r.rect.y + r.rect.h + 1);
  const lo = (v, n) => Math.max(0, Math.min(n - 1, v));
  const I0 = lo(i0, f.w), I1 = lo(i1, f.w), J0 = lo(j0, f.h), J1 = lo(j1, f.h);
  const seen = new Uint8Array((I1 - I0 + 1) * (J1 - J0 + 1));
  const W = I1 - I0 + 1;
  let n = 0;
  const stack = [];
  for (let j = J0; j <= J1; j++) for (let i = I0; i <= I1; i++) {
    const k = j * f.w + i;
    if (!g[k] || ra[k] !== ri || seen[(j - J0) * W + (i - I0)]) continue;
    n++;
    stack.push(i, j); seen[(j - J0) * W + (i - I0)] = 1;
    while (stack.length) {
      const y = stack.pop(), x = stack.pop();
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const a = x + dx, b = y + dy;
        if (a < I0 || a > I1 || b < J0 || b > J1) continue;
        const kk = b * f.w + a, s = (b - J0) * W + (a - I0);
        if (seen[s] || !g[kk] || ra[kk] !== ri) continue;
        seen[s] = 1; stack.push(a, b);
      }
    }
  }
  return n;
}

/** The walkable pieces of a room on a floor, as cell lists. */
function components(fl, ri) {
  const f = floors[fl], g = f.g, ra = roomAt[fl];
  const r = SITE_9.rooms[ri];
  const [i0, j0] = cellOf(f, r.rect.x - 1, r.rect.y - 1), [i1, j1] = cellOf(f, r.rect.x + r.rect.w + 1, r.rect.y + r.rect.h + 1);
  const lo = (v, n) => Math.max(0, Math.min(n - 1, v));
  const I0 = lo(i0, f.w), I1 = lo(i1, f.w), J0 = lo(j0, f.h), J1 = lo(j1, f.h);
  const seen = new Set(), out = [];
  for (let j = J0; j <= J1; j++) for (let i = I0; i <= I1; i++) {
    const k = j * f.w + i;
    if (!g[k] || ra[k] !== ri || seen.has(k)) continue;
    const cells = [k], st = [k]; seen.add(k);
    while (st.length) {
      const q = st.pop(), x = q % f.w, y = (q - x) / f.w;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const a = x + dx, b = y + dy;
        if (a < I0 || a > I1 || b < J0 || b > J1) continue;
        const kk = b * f.w + a;
        if (seen.has(kk) || !g[kk] || ra[kk] !== ri) continue;
        seen.add(kk); st.push(kk); cells.push(kk);
      }
    }
    out.push(cells);
  }
  return out;
}

// THE SEALED POCKET (map polish, Oct 28 2026): a cell's bars, then its partitions, close a pocket nobody can
// walk into — the holding cells, the specimen cells, the corner behind the interview room's desk. The
// "never cut a room in two" rule used to drop the partition instead, and bodies walked through it into the
// cell. A pocket with no doorway, no shaft link and no spot in it is FILLED (it's solid now: nothing
// spawns, stands or films there); a cut that leaves a doorway or a spot on both sides is still refused.
const spotCells = floors.map(() => new Set());
for (const sp of grey.spots) {
  const r = roomById.get(sp.room); if (!r) continue;
  const fl = r.floor + (r.spans ?? 1) - 1, f = floors[fl];
  const [i, j] = cellOf(f, sp.at[0], sp.at[2]);
  for (let dj = -2; dj <= 2; dj++) for (let di = -2; di <= 2; di++) spotCells[fl].add((j + dj) * f.w + i + di);
}
let sealed = 0;
const sealedNames = [];
/** after a stamp split room ri: fill the pieces nothing needs, if that leaves one; true if it did */
function sealPockets(fl, ri, what) {
  const comps = components(fl, ri);
  const needed = (cells) => cells.some((k) => guard[fl][k] || spotCells[fl].has(k));
  const keep = comps.filter(needed);
  if (keep.length !== 1) return false;
  const f = floors[fl];
  let n = 0;
  for (const c of comps) if (c !== keep[0]) for (const k of c) { f.g[k] = 0; n++; }
  sealed += n;
  sealedNames.push(`${what} in ${SITE_9.rooms[ri].id} (${(n / RES / RES).toFixed(1)} m²)`);
  return true;
}

// ---- the furniture ------------------------------------------------------------------------------------
const deg = Math.PI / 180;
/** The xz outline of a prop as a test: (x, z) → inside (grown by R)? Plus its bounding box. */
function footprint(p, size, grow = R) {
  const [sx, sy, sz] = size;
  if (!p.rot) {
    const t = (p.yaw ?? 0) * deg, c = Math.cos(t), s = Math.sin(t);
    const hx = sx / 2 + grow, hz = sz / 2 + grow;
    const ext = Math.abs(c) * hx + Math.abs(s) * hz, extz = Math.abs(s) * hx + Math.abs(c) * hz;
    // three.js rotation.y = t: local (lx, lz) → world (lx c + lz s, -lx s + lz c); invert it
    return {
      box: [p.at[0] - ext, p.at[2] - extz, p.at[0] + ext, p.at[2] + extz], height: sy,
      inside: (x, z) => { const dx = x - p.at[0], dz = z - p.at[2]; const lx = dx * c - dz * s, lz = dx * s + dz * c; return Math.abs(lx) <= hx && Math.abs(lz) <= hz; },
    };
  }
  // knocked over: Euler YXZ, turn the eight corners and keep their outline's box
  const [ax, ay, az] = p.rot.map((v) => v * deg);
  const cx = Math.cos(ax), sxx = Math.sin(ax), cy = Math.cos(ay), sy2 = Math.sin(ay), cz = Math.cos(az), sz2 = Math.sin(az);
  // R = Ry * Rx * Rz (three's "YXZ")
  const m = [
    cy * cz + sy2 * sxx * sz2, -cy * sz2 + sy2 * sxx * cz, sy2 * cx,
    cx * sz2, cx * cz, -sxx,
    -sy2 * cz + cy * sxx * sz2, sy2 * sz2 + cy * sxx * cz, cy * cx,
  ];
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (const a of [-1, 1]) for (const b of [0, 1]) for (const c of [-1, 1]) {
    const lx = a * sx / 2, ly = b * sy, lz = c * sz / 2;
    const wx = m[0] * lx + m[1] * ly + m[2] * lz, wy = m[3] * lx + m[4] * ly + m[5] * lz, wz = m[6] * lx + m[7] * ly + m[8] * lz;
    x0 = Math.min(x0, wx); x1 = Math.max(x1, wx); y0 = Math.min(y0, wy); y1 = Math.max(y1, wy); z0 = Math.min(z0, wz); z1 = Math.max(z1, wz);
  }
  const box = [p.at[0] + x0 - grow, p.at[2] + z0 - grow, p.at[0] + x1 + grow, p.at[2] + z1 + grow];
  return { box, height: y1 - y0, inside: (x, z) => x >= box[0] && x <= box[2] && z >= box[1] && z <= box[3] };
}

const layouts = ["bunker.json"];
const placed = [];
for (const file of layouts) {
  const L = JSON.parse(fs.readFileSync(path.join(ROOT, "client/src/survivorz/room", file), "utf8"));
  for (const p of L.props ?? []) placed.push({ ...p, file });
}
let stamped = 0, small = 0, raised = 0, shaft = 0;
const dropped = [];
/** props and architecture stamped with half a body's margin (the whole one cut the room in two) */
const halfMargin = [];
const bedProps = new Map();   // safe room → its bed props
function stampProp(p) {
  const r = roomById.get(p.room);
  const info = propInfo[p.id];
  if (!r || !info) { dropped.push({ id: p.id, room: p.room, why: !r ? "no such room" : "no size" }); return; }
  const fl = floorsOf(r).find((x) => p.at[1] - FLOOR_Y[x] > -0.3 && p.at[1] - FLOOR_Y[x] < 3);
  if (fl === undefined) { raised++; return; }
  // the shelter bunks sleep three; each bunk's pillow is where a sleeper's head goes, at its own height
  if (r.kind === "safe" && p.id === "bunk-pillow") { if (!bedProps.has(r.id)) bedProps.set(r.id, []); bedProps.get(r.id).push({ ...p, floor: fl }); }
  if ((r.spans ?? 1) > 1) { shaft++; return; }
  if (p.at[1] - FLOOR_Y[fl] > MAX_BOTTOM) { raised++; return; }
  const fp0 = footprint(p, info.size);
  const area = info.size[0] * info.size[2];
  if ((fp0.height < MIN_H || area < MIN_AREA) && !(fp0.height >= LOW_H && area >= LOW_AREA)) { small++; return; }
  const f = floors[fl], g = f.g, ri = SITE_9.rooms.indexOf(r);
  const before = pieces(fl, ri);
  // a body's whole radius round it first; if that cuts the room in two, HALF of it (a body brushes the
  // prop's edge in the gap rather than walking through it) — and only then is it dropped
  let res = "none";
  for (const grow of [R, R / 2]) {
    const fp = grow === R ? fp0 : footprint(p, info.size, grow);
    const [i0, j0] = cellOf(f, fp.box[0], fp.box[1]), [i1, j1] = cellOf(f, fp.box[2], fp.box[3]);
    const touched = [];
    for (let j = Math.max(0, j0); j <= Math.min(f.h - 1, j1); j++) for (let i = Math.max(0, i0); i <= Math.min(f.w - 1, i1); i++) {
      const k = j * f.w + i;
      if (!g[k] || guard[fl][k]) continue;
      const [cx, cz] = centreOf(f, i, j);
      if (!fp.inside(cx, cz)) continue;
      g[k] = 0; touched.push(k);
    }
    if (!touched.length) { res = "none"; break; }
    if (pieces(fl, ri) > before) {
      if (grow === R && before === 1 && sealPockets(fl, ri, p.id)) { res = "ok"; break; }
      for (const k of touched) g[k] = 1; res = "cut"; continue;
    }
    res = grow === R ? "ok" : "half"; break;
  }
  if (res === "none") return;
  if (res === "cut") { dropped.push({ id: p.id, room: p.room, at: p.at, why: "cuts the room in two" }); return; }
  if (res === "half") halfMargin.push(`${p.id} in ${p.room}`);
  stamped++;
}

// ---- the shells' own architecture (each layout's `arch`: the guard booth, glass office fronts, cell and
// observation partitions, tunnel piers) — built into the baked shell, so the grey box's walk map never knew
// them and bodies walked through the armoured booth and the interview glass (map polish, Oct 28 2026).
// Stamped by the props' rules (on the floor, in the way of a body, never cutting a room in two — a partition
// that would seal a cell is dropped and named, like a prop), and in THIS ORDER: the cell fronts and bars
// first (they ARE walls), then the architecture, then the furniture — a wall doesn't move for a chair, so a
// chair that would then seal off a corner gets the half margin or is dropped, never the glass behind it.
// Stairs and landings are floor.
// THE SIGHT GRID'S TALL ARCHITECTURE (map polish, Oct 29 2026): line of sight ran on the walls alone, so
// the dead saw through the specimen cells' and the holding cells' partitions and the director filmed
// through them. A solid architecture box (never glass) that stands across eye height — its bottom under
// EYE_LO, its top over EYE_HI — and is wall-like (a footprint over SIGHT_AREA, or a side over SIGHT_LONG)
// now blocks sight in every cell it touches. A post, a jamb, a mullion or a window frame doesn't (you see
// past it); glass doesn't, and neither do the cell fronts (glazed) or the holding cells' bars, which are
// props. Low things never block: the rule is the eye's height, not the body's. Shafts are left alone (the
// stair walls stand in rooms the sim walks by link, as on the walk map).
const EYE_LO = 1.0, EYE_HI = 1.75, SIGHT_AREA = 0.04, SIGHT_LONG = 0.5;
let sightStamped = 0, sightCells = 0;
const sightNames = new Map();
function stampSight(fl, bx0, by0, bz0, bx1, by1, bz1, what) {
  const f = floors[fl];
  if (by0 - FLOOR_Y[fl] > EYE_LO || by1 - FLOOR_Y[fl] < EYE_HI) return;
  const sx = bx1 - bx0, sz = bz1 - bz0;
  if (sx * sz < SIGHT_AREA && Math.max(sx, sz) < SIGHT_LONG) return;
  const [i0, j0] = cellOf(f, bx0, bz0), [i1, j1] = cellOf(f, bx1 - 1e-6, bz1 - 1e-6);
  let n = 0;
  for (let j = Math.max(0, j0); j <= Math.min(f.h - 1, j1); j++) for (let i = Math.max(0, i0); i <= Math.min(f.w - 1, i1); i++) {
    const k = j * f.w + i;
    const ri = roomAt[fl][k];
    if (ri >= 0 && (SITE_9.rooms[ri].spans ?? 1) > 1) continue;
    if (sight[fl][k]) { sight[fl][k] = 0; n++; }
  }
  if (!n) return;
  sightStamped++; sightCells += n;
  sightNames.set(what, (sightNames.get(what) ?? 0) + 1);
}
const STRUCTURAL = /^(cell-front|cell-bars)$/;
for (const p of placed) if (STRUCTURAL.test(p.id)) stampProp(p);
let archStamped = 0;
for (const file of layouts) {
  const L = JSON.parse(fs.readFileSync(path.join(ROOT, "client/src/survivorz/room", file), "utf8"));
  for (const a of L.arch ?? []) {
    const b = a.box ?? a.glass;
    if (!b || /stair|landing/i.test(a.what ?? "")) continue;
    const [bx0, by0, bz0, bx1, by1, bz1] = b;
    const fl = FLOOR_Y.findIndex((y) => by0 >= y - 0.35 && by0 < y + 4.5);
    if (fl < 0 || !floors[fl]) continue;
    if (a.box) stampSight(fl, bx0, by0, bz0, bx1, by1, bz1, a.what);
    if (by0 - FLOOR_Y[fl] > MAX_BOTTOM || by1 - FLOOR_Y[fl] < 0.6) continue;
    const f = floors[fl], g = f.g;
    let res = "none", where = "";
    for (const grow of [R, R / 2]) {
      const box = [bx0 - grow, bz0 - grow, bx1 + grow, bz1 + grow];
      const [i0, j0] = cellOf(f, box[0], box[1]), [i1, j1] = cellOf(f, box[2], box[3]);
      const touched = [], roomsHit = new Set();
      for (let j = Math.max(0, j0); j <= Math.min(f.h - 1, j1); j++) for (let i = Math.max(0, i0); i <= Math.min(f.w - 1, i1); i++) {
        const k = j * f.w + i;
        if (!g[k] || guard[fl][k]) continue;
        const [cx, cz] = centreOf(f, i, j);
        if (cx < box[0] || cx > box[2] || cz < box[1] || cz > box[3]) continue;
        touched.push(k);
        if (roomAt[fl][k] >= 0) roomsHit.add(roomAt[fl][k]);
      }
      if (!touched.length) { res = "none"; break; }
      const ris = [...roomsHit].filter((ri) => (SITE_9.rooms[ri].spans ?? 1) === 1);
      if (ris.length < roomsHit.size) { res = "none"; break; }   // (nothing in a shaft)
      where = ris.map((ri) => SITE_9.rooms[ri].id).join("+");
      const before = ris.map((ri) => pieces(fl, ri));
      for (const k of touched) g[k] = 0;
      if (ris.some((ri, n) => pieces(fl, ri) > before[n])) {
        if (grow === R && ris.length === 1 && before[0] === 1 && sealPockets(fl, ris[0], `arch:${a.what}`)) { res = "ok"; break; }
        for (const k of touched) g[k] = 1; res = "cut"; continue;
      }
      res = grow === R ? "ok" : "half"; break;
    }
    if (res === "none") continue;
    if (res === "cut") { dropped.push({ id: `arch:${a.what}`, room: where, at: [bx0, by0, bz0], why: "cuts the room in two" }); continue; }
    if (res === "half") halfMargin.push(`arch:${a.what} in ${where}`);
    archStamped++;
  }
}
for (const p of placed) if (!STRUCTURAL.test(p.id)) stampProp(p);

// ---- spots: a stand cell for each, beds the real beds --------------------------------------------------
function nearestOpen(fl, x, z, ri) {
  const f = floors[fl];
  const [ci, cj] = cellOf(f, x, z);
  for (let rad = 0; rad < 200; rad++) {
    let best = null, bd = Infinity;
    for (let j = cj - rad; j <= cj + rad; j++) for (let i = ci - rad; i <= ci + rad; i++) {
      if (Math.max(Math.abs(i - ci), Math.abs(j - cj)) !== rad || i < 0 || j < 0 || i >= f.w || j >= f.h) continue;
      const k = j * f.w + i;
      if (!f.g[k] || (ri !== undefined && roomAt[fl][k] !== ri)) continue;
      const [cx, cz] = centreOf(f, i, j);
      const d = (cx - x) ** 2 + (cz - z) ** 2;
      if (d < bd) { bd = d; best = [cx, cz]; }
    }
    if (best) return best;
  }
  return null;
}
const r3 = (v) => Math.round(v * 1000) / 1000;
/** src/survivorz/sim/survivor.ts REACH_M: an interaction is within this of what it touches */
const REACH = 0.9;
const reached = [];
/** the point of a standing prop's footprint (turned by its yaw) nearest (x, z) */
function nearestOnFootprint(p, size, x, z) {
  const t = (p.yaw ?? 0) * deg, c = Math.cos(t), sn = Math.sin(t);
  const dx = x - p.at[0], dz = z - p.at[2];
  const lx = dx * c - dz * sn, lz = dx * sn + dz * c;
  const qx = Math.max(-size[0] / 2, Math.min(size[0] / 2, lx)), qz = Math.max(-size[2] / 2, Math.min(size[2] / 2, lz));
  return [p.at[0] + qx * c + qz * sn, p.at[2] - qx * sn + qz * c];
}
// ON THE THING ITSELF (Josh, Nov 4 2026: "make sure… they have to be right next to something to interact with. the
// survivors in your video closed the vault door without being at the crank"). The grey box lays a room's spots out
// along its far wall, knowing nothing of the dressing: the crank stood in the middle of the vestibule, 4 m from the
// wheel; the radio set 8.5 m from the radio console. Every spot the sim walks a survivor to is put ON ITS PROP: the
// one named here, else the nearest piece of furniture in its room (any map: a new map only names its own).
// The stand cell is then the nearest walkable cell to that prop, and the touch point the prop's face.
const HOSTS = {
  crank: "valve-wheel", "radio-set": "control-console", keycard: "office-desk", "note-security": "clipboard",
  "armory-racks": "weapon-rack", "part-workshop": "workbench", "note-qm": "clipboard-pen", "note-private-b": "book-stack",
};
const hosted = [];
const spots = {};
for (const s of grey.spots) {
  const id = s.name.replace(/^SPOT_/, "");
  if (s.kind === "bed") continue;
  const r = roomById.get(s.room);
  const fl = r.floor + (r.spans ?? 1) - 1;
  const ri = SITE_9.rooms.indexOf(r);
  const inRoom = placed.filter((p) => p.room === s.room && propInfo[p.id]);
  const named = HOSTS[id];
  const pool = named ? inRoom.filter((p) => p.id === named) : inRoom;
  if (named && !pool.length) { console.error(`spot ${id}: no ${named} in ${s.room}`); process.exit(1); }
  const host = pool.sort((a, b) => Math.hypot(a.at[0] - s.at[0], a.at[2] - s.at[2]) - Math.hypot(b.at[0] - s.at[0], b.at[2] - s.at[2]))[0];
  if (host) {
    const hs = nearestOpen(fl, host.at[0], host.at[2], ri);
    if (!hs) { console.error(`spot ${id}: no walkable cell beside the ${host.id}`); process.exit(1); }
    const face = nearestOnFootprint(host, propInfo[host.id].size, hs[0], hs[1]);
    hosted.push(`${id}: on the ${host.id} (${Math.hypot(s.at[0] - face[0], s.at[2] - face[1]).toFixed(1)} m from where the grey box put it; stand ${Math.hypot(face[0] - hs[0], face[1] - hs[1]).toFixed(2)} m from it)`);
    spots[id] = { room: s.room, kind: s.kind, floor: fl, at: [r3(face[0]), FLOOR_Y[fl], r3(face[1])], stand: [r3(hs[0]), FLOOR_Y[fl], r3(hs[1])] };
    continue;
  }
  const st = nearestOpen(fl, s.at[0], s.at[2], ri);
  if (!st) { console.error(`spot ${id} has no walkable cell in ${s.room}`); process.exit(1); }
  // OUT OF REACH (map polish, Oct 29 2026): the grey box puts some spots in the MIDDLE of the furniture the
  // dressed room stands there — the morgue's terminal is the centre of the 1.9 m deep body fridge, 1.94 m
  // from the nearest floor. Past REACH_M, the touch point moves to the face of that furniture nearest the
  // stand cell: you read a terminal on the fridge's front, not inside it.
  let at = [s.at[0], s.at[2]];
  if (Math.hypot(at[0] - st[0], at[1] - st[1]) > REACH) {
    const host = placed.find((p) => p.room === s.room && propInfo[p.id] && footprint(p, propInfo[p.id].size, 0).inside(at[0], at[1]));
    if (host) {
      const face = nearestOnFootprint(host, propInfo[host.id].size, st[0], st[1]);
      reached.push(`${id}: ${Math.hypot(s.at[0] - st[0], s.at[2] - st[1]).toFixed(2)} → ${Math.hypot(face[0] - st[0], face[1] - st[1]).toFixed(2)} m (the front of the ${host.id})`);
      at = face;
    }
  }
  spots[id] = { room: s.room, kind: s.kind, floor: fl, at: [r3(at[0]), FLOOR_Y[fl], r3(at[1])], stand: [r3(st[0]), FLOOR_Y[fl], r3(st[1])] };
}
// THE CONTAINERS (the bunker's loot spots): which props in which room hold something worth a search. A prop id
// names every copy of it in that room unless it's followed by ":n" (the first n copies, west to east).
const CONTAINERS = {
  equipment: ["staff-lockers", "shelving-steel", "tool-chest"],
  common: ["vending-machine", "cube-shelf"],
  barracks: ["staff-lockers", "staff-lockers-open", "military-crate:2", "backpack-small"],
  "private-a": ["staff-lockers", "military-crate"],
  "private-b": ["staff-lockers", "military-crate"],
  laundry: ["shelving-steel:1"],
  maint: ["tool-chest", "shelving-boxes"],
  armory: ["weapon-rack", "device-lockers", "ammo-can:2", "military-crate:1", "staff-lockers"],
  security: ["filing-cabinet:1"],
  radio: ["filing-cabinet"],
  workshop: ["workbench", "tool-chest", "shelving-steel"],
  infirmary: ["medicine-cabinet", "medical-cart"],
  qm: ["filing-cabinet:2", "shelving-boxes"],
  mess: ["servery"],
  kitchen: ["fridge", "steel-counter", "food-cans"],
  stores: ["shelving-steel:5", "shelving-boxes:4", "plastic-crate:2", "military-crate", "water-point"],
};
let containers = 0;
for (const [room, list] of Object.entries(CONTAINERS)) {
  const r = roomById.get(room);
  if (!r) { console.error(`containers: no room ${room}`); process.exit(1); }
  const ri = SITE_9.rooms.indexOf(r);
  for (const want of list) {
    const [pid, nStr] = want.split(":");
    const copies = placed.filter((p) => p.room === room && p.id === pid).sort((a, b) => a.at[0] - b.at[0] || a.at[2] - b.at[2]);
    if (!copies.length) { console.error(`containers: no ${pid} in ${room}`); process.exit(1); }
    const take = nStr ? copies.slice(0, Number(nStr)) : copies;
    take.forEach((p, n) => {
      const id = `${room}-${pid}${take.length > 1 ? "-" + (n + 1) : ""}`;
      const st = nearestOpen(r.floor, p.at[0], p.at[2], ri);
      if (!st) { console.error(`container ${id} has no walkable cell`); process.exit(1); }
      const info = propInfo[p.id];
      const at = info ? nearestOnFootprint(p, info.size, st[0], st[1]) : [p.at[0], p.at[2]];
      spots[id] = { room, kind: "loot", floor: r.floor, at: [r3(at[0]), FLOOR_Y[r.floor], r3(at[1])], stand: [r3(st[0]), FLOOR_Y[r.floor], r3(st[1])] };
      containers++;
    });
  }
}
// THE BEDS: the infirmary's hospital beds (resting in one heals faster) — a body lies ON the bed, its stand
// cell beside it. Keyed by room like the old show's safe rooms.
const beds = {};
for (const [room, pid] of [["infirmary", "hospital-bed"]]) {
  const r = roomById.get(room), ri = SITE_9.rooms.indexOf(r);
  const copies = placed.filter((p) => p.room === room && p.id === pid).sort((a, b) => a.at[0] - b.at[0] || a.at[2] - b.at[2]);
  beds[room] = copies.map((p, i) => {
    const st = nearestOpen(r.floor, p.at[0], p.at[2], ri);
    return { id: `${room}-bed-${i + 1}`, at: [r3(p.at[0]), r3(p.at[1] + 0.62), r3(p.at[2])], stand: [r3(st[0]), FLOOR_Y[r.floor], r3(st[1])], real: true };
  });
}

// ---- out --------------------------------------------------------------------------------------------------
const rows = (f) => {
  const out = [];
  for (let j = 0; j < f.h; j++) {
    let s = "", run = 0, ch = "";
    for (let i = 0; i < f.w; i++) {
      const c = f.g[j * f.w + i] ? "." : "#";
      if (c === ch) run++; else { if (run) s += run + ch; ch = c; run = 1; }
    }
    out.push(s + run + ch);
  }
  return out;
};
const out = {
  map: BASE.map, res: RES, bodyR: R,
  about: "Written by scripts/survivorz/sim-walk.mjs (the grey box's walk map + the dressed rooms' furniture); read by src/survivorz/sim/nav.ts. Do not edit by hand.",
  floors: floors.map((f) => ({ floor: f.floor, y: f.y, origin: f.origin, w: f.w, h: f.h, rows: rows(f) })),
  links: BASE.links,
  spots, beds,
  furniture: { stamped, arch: archStamped, halfMargin, sealed: sealedNames, dropped },
};
fs.mkdirSync(path.join(ROOT, "src/survivorz/sim"), { recursive: true });
const file = path.join(ROOT, "src/survivorz/sim/walk.json");
fs.writeFileSync(file, JSON.stringify(out) + "\n");
const sightOut = {
  map: BASE.map, res: RES,
  about: "Written by scripts/survivorz/sim-walk.mjs (the grey box's walls + the shells' tall opaque architecture: what blocks the eye); read by src/survivorz/sim/nav.ts and the show's director (client/src/survivorz/show/direct.ts). Do not edit by hand.",
  floors: floors.map((f, i) => ({ floor: f.floor, y: f.y, origin: f.origin, w: f.w, h: f.h, rows: rows({ w: f.w, h: f.h, g: sight[i] }) })),
};
const sightFile = path.join(ROOT, "src/survivorz/sim/sight.json");
fs.writeFileSync(sightFile, JSON.stringify(sightOut) + "\n");
const open = (f) => f.g.reduce((s, v) => s + v, 0) / RES / RES;
console.log(`sim walk map: ${stamped} props + ${archStamped} pieces of the shells' architecture stamped, ${small} too small, ${raised} off the floor, ${shaft} in shafts, ${dropped.length} dropped`);
for (const d of dropped) console.log(`  dropped ${d.id} in ${d.room}: ${d.why}`);
for (const sn of sealedNames) console.log(`  sealed off: ${sn}`);
for (const h of halfMargin) console.log(`  half a body's margin: ${h}`);
for (const f of floors) console.log(`  floor ${f.floor}: ${open(f).toFixed(0)} m² walkable`);
for (const h of hosted) console.log(`  ${h}`);
console.log(`  ${Object.keys(spots).length} spots (${containers} containers), ${Object.values(beds).flat().filter((b) => b.real).length} of ${Object.values(beds).flat().length} beds on real bed props`);
for (const r of reached) console.log(`  out of reach, moved to the furniture's face: ${r}`);
console.log(`  sight: ${sightStamped} pieces of tall architecture block the eye (${(sightCells / RES / RES).toFixed(1)} m²): ${[...sightNames].map(([k, v]) => `${k} ×${v}`).join(", ")}`);
console.log(`  → ${path.relative(ROOT, file)} (${(fs.statSync(file).size / 1024).toFixed(0)} KB), ${path.relative(ROOT, sightFile)} (${(fs.statSync(sightFile).size / 1024).toFixed(0)} KB)`);
