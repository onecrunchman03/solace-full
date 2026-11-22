// SOLACE SURVIVORZ — THE GREY BOX, computed from the map (SURVIVORZ.md §3, "The facility file").
//
// Run:  npm run build && node scripts/survivorz/greybox.mjs [--map site9|bunker]
//
// --map bunker (Nov 2026) builds Civil Defence Shelter 14 (src/survivorz/bunker-map.ts) instead: its
// geometry goes to set/bunker-greybox.json and its walk map to src/survivorz/bunker-walk.json.
//
// Turns src/survivorz/facility-map.ts into the set's exact grey-box geometry — every piece an
// axis-aligned box in WORLD metres (x east, y up, z south), so the numbers here are the numbers
// in the game — and the WALK MAP for each floor. Two outputs:
//   assets/downloads/survivorz/set/greybox.json   the geometry, for scripts/survivorz/greybox-build.py
//                                                 (headless Blender builds the .blend and the GLB)
//   src/survivorz/site9-walk.json                 the walk map per floor (run-length rows) + the shafts
// Nothing is placed by eye: walls run along the room edges the map draws, every door is cut where
// facility.ts doorPlacement says it is, and the two stairwells and the grate shaft are built here
// by hand (they are the only pieces with any geometry of their own).
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const MAPS = {
  site9: { file: "facility-map.js", name: "SITE_9", geom: "greybox.json", walk: "src/survivorz/site9-walk.json" },
  bunker: { file: "bunker-map.js", name: "BUNKER", geom: "bunker-greybox.json", walk: "src/survivorz/bunker-walk.json" },
};
const mapArg = process.argv.includes("--map") ? process.argv[process.argv.indexOf("--map") + 1] : "site9";
const OUT = MAPS[mapArg];
if (!OUT) { console.error(`unknown --map ${mapArg} (site9 | bunker)`); process.exit(1); }
const SITE_9 = require(path.join(ROOT, "dist/survivorz", OUT.file))[OUT.name];
const { FLOOR_Y, floorsOf, doorPlacement, layoutProblems, VAULT_OPENING } = require(path.join(ROOT, "dist/survivorz/facility.js"));

export const WALL_T = 0.2;      // wall thickness, centred on the room edge
export const SLAB_T = 0.3;      // floor and ceiling slabs
export const BODY_R = 0.3;      // a body's radius on the walk map
export const WALK_RES = 4;      // walk-map cells a metre
const E = 1e-6;

/** Ceiling height by room (the rest by kind). Floors are 8 m apart, so nothing passes 7.4. */
const HEIGHT = {
  outside: 6, "vault-chamber": 6, reception: 5, "generator-hall": 6.5, catwalks: 6.5, "pipe-gallery": 6,
  "cryo-hall": 6, "specimen-cells": 4.5, observation: 4.5, "deep-lab": 5, "tunnel-junction": 5, "far-tunnels": 5,
  "service-tunnel": 4, canteen: 3.6, "labs-corridor": 3.4, "res-corridor": 3.0, "med-hall": 3.0, "sec-corridor": 3.0,
};
const KIND_HEIGHT = { corridor: 3.0, room: 3.2, safe: 3.0, sealed: 3.0, exit: 6 };
const heightOf = (r) => r.height ?? HEIGHT[r.id] ?? KIND_HEIGHT[r.kind] ?? 3.2;
/** A room's vertical extent: from its lowest floor to its own ceiling (a shaft spans floors). */
const bottomOf = (r) => FLOOR_Y[r.floor + (r.spans ?? 1) - 1];
const topOf = (r) => FLOOR_Y[r.floor] + heightOf(r);

const rooms = SITE_9.rooms;
const roomById = new Map(rooms.map((r) => [r.id, r]));
const boxes = [];   // { min:[x,y,z], max:[x,y,z], cat, room?, zone?, name? }
const box = (x0, y0, z0, x1, y1, z1, cat, extra = {}) => {
  if (x1 - x0 < E || y1 - y0 < E || z1 - z0 < E) return;
  boxes.push({ min: [x0, y0, z0], max: [x1, y1, z1], cat, ...extra });
};

// ---- the shafts' own pieces, by hand ---------------------------------------------------------------
// A switchback: an upper landing strip along the entry wall at the upper floor, flight A down to a
// mid landing, flight B down to the bottom; the bottom is open floor wherever there's headroom.
const STAIR_STEP = 0.2;
function flight(x0, z0, x1, z1, yHigh, yLow, along, room) {
  // along: "x-" | "x+" | "z-" | "z+" — the direction you walk DOWN the flight
  const n = Math.round((yHigh - yLow) / STAIR_STEP);
  const len = along[0] === "x" ? x1 - x0 : z1 - z0;
  const tread = len / n;
  for (let i = 0; i < n; i++) {
    const top = yHigh - (i + 1) * STAIR_STEP;   // the i-th step down
    const a = along[1] === "+" ? i * tread : len - (i + 1) * tread;
    const b = a + tread;
    if (along[0] === "x") box(x0 + a, top - SLAB_T, z0, x0 + b, top, z1, "stairs", { room });
    else box(x0, top - SLAB_T, z0 + a, x1, top, z0 + b, "stairs", { room });
  }
}
function rail(x0, z0, x1, z1, y0, y1, room) { box(x0, y0, z0, x1, y1, z1, "rail", { room }); }

const SHAFT = {
  // Service Stairs: 10 x 6, both doors on the south wall (z 18). Flights run along x.
  "service-stairs": (r) => {
    const { x, y: z, w, h } = r.rect, top = FLOOR_Y[r.floor], low = top - 8, mid = top - 4;
    const strip = 1.6, land = 1.5, lane = (h - strip) / 2;
    box(x, top - SLAB_T, z + h - strip, x + w, top, z + h, "landing", { room: r.id });               // upper strip
    flight(x + land, z + h - strip - lane, x + w, z + h - strip, top, mid, "x-", r.id);              // A: east→west
    box(x, mid - SLAB_T, z, x + land, mid, z + h - strip, "landing", { room: r.id });                 // west landing
    flight(x + land, z, x + w, z + lane, mid, low, "x+", r.id);                                       // B: west→east
    rail(x, z + h - strip - 0.05, x + w - 1.6, z + h - strip + 0.05, top, top + 1.0, r.id);          // the strip's edge
    for (let i = 0; i < 20; i++) {                                                                    // the divider, stepped
      const xa = x + land + i * ((w - land) / 20), xb = xa + (w - land) / 20;
      if (xb > x + w - 1.6) break;                                                                    // walk-under gap at the east end
      const lt = top - (20 - i) * STAIR_STEP;
      rail(xa, z + lane - 0.05, xb, z + lane + 0.05, low, lt + 1.0, r.id);
    }
    return { upper: { floor: r.floor, at: [x + w / 2, top, z + h - strip / 2] }, lower: { floor: r.floor + 1, at: [x + w / 2, low, z + h - 0.8] } };
  },
  // Containment Stairs: 6 x 10, the upper door on the south wall (z 70), the lower on the west (x 100).
  "containment-stairs": (r) => {
    const { x, y: z, w, h } = r.rect, top = FLOOR_Y[r.floor], low = top - 8, mid = top - 4;
    const strip = 1.6, land = 1.5, lane = w / 2;
    box(x, top - SLAB_T, z + h - strip, x + w, top, z + h, "landing", { room: r.id });
    flight(x, z + land, x + lane, z + h - strip, top, mid, "z-", r.id);                               // A: south→north (west lane)
    box(x, mid - SLAB_T, z, x + w, mid, z + land, "landing", { room: r.id });                         // north landing
    flight(x + lane, z + land, x + w, z + h - strip, mid, low, "z+", r.id);                           // B: north→south (east lane)
    rail(x + lane, z + h - strip - 0.05, x + w, z + h - strip + 0.05, top, top + 1.0, r.id);
    const n = 20, run = h - strip - land;
    for (let i = 0; i < n; i++) {
      const za = z + land + i * (run / n), zb = za + run / n;
      if (zb > z + h - strip - 2.2) break;                                                            // walk-under gap at the south end
      const lt = mid + (i + 1) * STAIR_STEP;                                                           // flight A at this point
      rail(x + lane - 0.05, za, x + lane + 0.05, zb, low, lt + 1.0, r.id);
    }
    return { upper: { floor: r.floor, at: [x + w / 2, top, z + h - strip / 2] }, lower: { floor: r.floor + 1, at: [x + 1.2, low, z + h / 2] } };
  },
  // The Freight Lift: an 8 x 8 shaft, the car parked at the top (the game moves LIFT_CAR).
  "freight-lift": (r) => {
    const { x, y: z, w, h } = r.rect, top = FLOOR_Y[r.floor], low = FLOOR_Y[r.floor + 1];
    box(x + 0.15, top - 0.25, z + 0.15, x + w - 0.15, top, z + h - 0.15, "lift", { room: r.id, name: "LIFT_CAR" });
    return { upper: { floor: r.floor, at: [x + w / 2, top, z + h / 2] }, lower: { floor: r.floor + 1, at: [x + w / 2, low, z + h / 2] }, lift: true };
  },
};

// ---- slabs ------------------------------------------------------------------------------------------
/** a rectangle minus holes, as rectangles (each hole cuts the remaining pieces into up to four) */
function cut(rects, hole) {
  const out = [];
  for (const [x0, z0, x1, z1] of rects) {
    const hx0 = Math.max(x0, hole[0]), hz0 = Math.max(z0, hole[1]), hx1 = Math.min(x1, hole[2]), hz1 = Math.min(z1, hole[3]);
    if (hx1 - hx0 < E || hz1 - hz0 < E) { out.push([x0, z0, x1, z1]); continue; }
    out.push([x0, z0, x1, hz0], [x0, hz1, x1, z1], [x0, hz0, hx0, hz1], [hx1, hz0, x1, hz1]);
  }
  return out.filter(([a, b, c, d]) => c - a > E && d - b > E);
}

// the grate: a hole in the pipe gallery's floor, the tunnel junction's ceiling, and a short shaft between
const grates = [];
for (const d of SITE_9.doors) {
  if (d.kind !== "grate") continue;
  const pl = doorPlacement(SITE_9, d.id);
  const [cx, cy, cz] = pl.centre, s = pl.size[0] + 0.2;
  grates.push({ door: d.id, hole: [cx - s / 2, cz - s / 2, cx + s / 2, cz + s / 2], upperY: cy, a: d.a, b: d.b });
}
const holesFloor = (id) => grates.filter((g) => { const r = roomById.get(g.a), q = roomById.get(g.b); return (r.floor < q.floor ? r : q).id === id; }).map((g) => g.hole);
const holesCeil = (id) => grates.filter((g) => { const r = roomById.get(g.a), q = roomById.get(g.b); return (r.floor < q.floor ? q : r).id === id; }).map((g) => g.hole);

const links = [];
for (const r of rooms) {
  const { x, y: z, w, h } = r.rect;
  const bottom = bottomOf(r), top = topOf(r);
  let floorRects = [[x, z, x + w, z + h]];
  for (const hole of holesFloor(r.id)) floorRects = cut(floorRects, hole);
  for (const [a, b, c, d] of floorRects) box(a, bottom - SLAB_T, b, c, bottom, d, "floor", { room: r.id, zone: r.zone });
  let ceilRects = [[x, z, x + w, z + h]];
  for (const hole of holesCeil(r.id)) ceilRects = cut(ceilRects, hole);
  for (const [a, b, c, d] of ceilRects) box(a, top, b, c, top + SLAB_T, d, "ceiling", { room: r.id, zone: r.zone });
  if (SHAFT[r.id]) links.push({ shaft: r.id, ...SHAFT[r.id](r) });
}
for (const g of grates) {
  const lower = roomById.get(roomById.get(g.a).floor > roomById.get(g.b).floor ? g.a : g.b);
  const y0 = topOf(lower), y1 = g.upperY - SLAB_T;
  const [a, b, c, d] = g.hole, t = 0.15;
  box(a - t, y0, b - t, c + t, y1, b, "wall", { room: g.door });
  box(a - t, y0, d, c + t, y1, d + t, "wall", { room: g.door });
  box(a - t, y0, b, a, y1, d, "wall", { room: g.door });
  box(c, y0, b, c + t, y1, d, "wall", { room: g.door });
  for (let y = FLOOR_Y[lower.floor] + 0.3; y < g.upperY + 1.0; y += 0.3) box(a + 0.3, y - 0.03, b + 0.02, c - 0.3, y + 0.03, b + 0.08, "ladder", { room: g.door });
  links.push({ grate: g.door, upper: { floor: lower.floor - 1, at: [(a + c) / 2, g.upperY, (b + d) / 2] }, lower: { floor: lower.floor, at: [(a + c) / 2, FLOOR_Y[lower.floor], (b + d) / 2] }, ladder: true });
}

// ---- walls: every room edge, merged along its line, the doors cut out ---------------------------------
// An edge is (axis, line coordinate, along-interval, vertical interval). Pieces on one line are split at
// every endpoint so a wall is built once however many rooms share it, as tall as the tallest of them.
const edges = new Map();   // key "x:12.5" → [{a0, a1, y0, y1}]
const pushEdge = (axis, c, a0, a1, y0, y1) => {
  const k = `${axis}:${c.toFixed(3)}`;
  if (!edges.has(k)) edges.set(k, []);
  edges.get(k).push({ a0, a1, y0, y1 });
};
for (const r of rooms) {
  const { x, y: z, w, h } = r.rect, y0 = bottomOf(r) - SLAB_T, y1 = topOf(r) + SLAB_T;
  pushEdge("x", x, z, z + h, y0, y1);        // west wall (a line of constant x, running along z)
  pushEdge("x", x + w, z, z + h, y0, y1);    // east
  pushEdge("z", z, x, x + w, y0, y1);        // north (constant z, running along x)
  pushEdge("z", z + h, x, x + w, y0, y1);    // south
}
// the openings: every door that's a hole in a wall (not vents, not the grate)
const openings = new Map();   // line key → [{a0, a1, y0, y1, door}]
for (const d of SITE_9.doors) {
  if (d.kind === "vent" || d.kind === "grate") continue;
  const pl = doorPlacement(SITE_9, d.id);
  const [cx, cy, cz] = pl.centre, [w, h] = pl.size;
  const axis = Math.abs(pl.normal[0]) > 0.5 ? "x" : "z";
  const c = axis === "x" ? cx : cz, along = axis === "x" ? cz : cx;
  const k = `${axis}:${c.toFixed(3)}`;
  const level = cy - h / 2;
  if (!openings.has(k)) openings.set(k, []);
  openings.get(k).push({ a0: along - w / 2, a1: along + w / 2, y0: level, y1: level + h, door: d.id });
}
/** a (along, y) rectangle minus a hole → the remaining rectangles */
function cut2(rects, o) {
  const out = [];
  for (const q of rects) {
    const a0 = Math.max(q.a0, o.a0), a1 = Math.min(q.a1, o.a1), y0 = Math.max(q.y0, o.y0), y1 = Math.min(q.y1, o.y1);
    if (a1 - a0 < E || y1 - y0 < E) { out.push(q); continue; }
    out.push({ ...q, a1: a0 }, { ...q, a0: a1 }, { ...q, a0, a1, y1: y0 }, { ...q, a0, a1, y0: y1 });
  }
  return out.filter((q) => q.a1 - q.a0 > E && q.y1 - q.y0 > E);
}
let openingsUsed = 0;
for (const [k, list] of edges) {
  const [axis, cs] = k.split(":"), c = Number(cs);
  const cutsAt = [...new Set(list.flatMap((e) => [e.a0, e.a1]))].sort((p, q) => p - q);
  let pieces = [];
  for (let i = 0; i + 1 < cutsAt.length; i++) {
    const a0 = cutsAt[i], a1 = cutsAt[i + 1];
    const cover = list.filter((e) => e.a0 <= a0 + E && e.a1 >= a1 - E).map((e) => [e.y0, e.y1]).sort((p, q) => p[0] - q[0]);
    // merge overlapping vertical ranges (two floors' rooms on one line stay two walls)
    const merged = [];
    for (const [y0, y1] of cover) {
      const last = merged[merged.length - 1];
      if (last && y0 <= last[1] + E) last[1] = Math.max(last[1], y1);
      else merged.push([y0, y1]);
    }
    for (const [y0, y1] of merged) pieces.push({ a0, a1, y0, y1 });
  }
  // join neighbouring pieces with the same height so a wall is one box where it can be
  pieces.sort((p, q) => p.y0 - q.y0 || p.a0 - q.a0);
  const joined = [];
  for (const p of pieces) {
    const last = joined.find((q) => Math.abs(q.a1 - p.a0) < E && Math.abs(q.y0 - p.y0) < E && Math.abs(q.y1 - p.y1) < E);
    if (last) last.a1 = p.a1;
    else joined.push({ ...p });
  }
  // stretch each run's free ends by half a wall so corners close
  for (const p of joined) {
    if (!joined.some((q) => q !== p && Math.abs(q.a1 - p.a0) < E && q.y0 < p.y1 && q.y1 > p.y0)) p.a0 -= WALL_T / 2;
    if (!joined.some((q) => q !== p && Math.abs(q.a0 - p.a1) < E && q.y0 < p.y1 && q.y1 > p.y0)) p.a1 += WALL_T / 2;
  }
  let rects = joined;
  for (const o of openings.get(k) ?? []) { rects = cut2(rects, o); openingsUsed++; }
  for (const q of rects) {
    if (axis === "x") box(c - WALL_T / 2, q.y0, q.a0, c + WALL_T / 2, q.y1, q.a1, "wall");
    else box(q.a0, q.y0, c - WALL_T / 2, q.a1, q.y1, c + WALL_T / 2, "wall");
  }
}

// ---- the vault door's frame: a stand-in for the real frame (the look test swaps the model in), so the
// walk map knows the way through is the frame's 1.07 m opening and not the 2 m hole in the wall
for (const d of SITE_9.doors.filter((x) => x.kind === "vault")) {
  const pl = doorPlacement(SITE_9, d.id);
  const [cx, cy, cz] = pl.centre, [w, h] = pl.size, [ow, oh] = VAULT_OPENING, depth = 0.5;
  const level = cy - h / 2;
  const xAxis = Math.abs(pl.normal[0]) > 0.5;
  const piece = (a0, a1, y0, y1) => xAxis
    ? box(cx - depth / 2, y0, cz + a0, cx + depth / 2, y1, cz + a1, "frame", { name: "VAULT_FRAME", door: d.id })
    : box(cx + a0, y0, cz - depth / 2, cx + a1, y1, cz + depth / 2, "frame", { name: "VAULT_FRAME", door: d.id });
  piece(-w / 2, -ow / 2, level, level + h);
  piece(ow / 2, w / 2, level, level + h);
  piece(-ow / 2, ow / 2, level + oh, level + h);
}

// ---- the door leaves (shut, as the game starts them; the game moves DOOR_<id>) ------------------------
const LEAF = { door: 0.06, keycard: 0.12, power: 0.12, lockdown: 0.2, safe: 0.15, sealed: 0.12, vault: 0.2 };
const doors = [];
for (const d of SITE_9.doors) {
  const pl = doorPlacement(SITE_9, d.id);
  doors.push({ id: d.id, kind: d.kind, centre: pl.centre, normal: pl.normal, size: pl.size });
  if (d.kind === "grate") {
    const [cx, cy, cz] = pl.centre, s = pl.size[0];
    box(cx - s / 2, cy - 0.05, cz - s / 2, cx + s / 2, cy, cz + s / 2, "leaf", { name: `DOOR_${d.id}`, door: d.id, kind: d.kind });
    continue;
  }
  const t = LEAF[d.kind];
  if (!t) continue;
  // the vault's leaf fills the frame's opening, not the hole in the wall
  const [w, h] = d.kind === "vault" ? VAULT_OPENING : pl.size;
  const cx = pl.centre[0], cz = pl.centre[2], cy = pl.centre[1] - pl.size[1] / 2 + h / 2;
  if (Math.abs(pl.normal[0]) > 0.5) box(cx - t / 2, cy - h / 2, cz - w / 2, cx + t / 2, cy + h / 2, cz + w / 2, "leaf", { name: `DOOR_${d.id}`, door: d.id, kind: d.kind });
  else box(cx - w / 2, cy - h / 2, cz - t / 2, cx + w / 2, cy + h / 2, cz + t / 2, "leaf", { name: `DOOR_${d.id}`, door: d.id, kind: d.kind });
}

// ---- each room's INSIDE faces, for a dressed room (scripts/survivorz/room-build.py) ----------------------
// The grey box's walls are centred boxes shared by two rooms; a dressed room needs the face on ITS side,
// so each side can wear its own room's material. Per room: every wall face (inset half a wall from the
// edge line, cut round every opening on that line at this floor), the reveals (the opening's sides and
// head through the wall's thickness, given to room a of the door), and the floor and ceiling inset.
// A face is { kind, room, axis, c, inward, a0, a1, y0, y1 }: the plane is axis = c, facing `inward`
// (+1/-1 along that axis), spanning a0..a1 along the other horizontal axis and y0..y1 up.
const surfaces = [];
for (const r of rooms) {
  const { x, y: z, w, h } = r.rect, y0 = bottomOf(r), y1 = topOf(r), t = WALL_T / 2;
  const sides = [
    { axis: "x", line: x, c: x + t, inward: 1, a0: z + t, a1: z + h - t },
    { axis: "x", line: x + w, c: x + w - t, inward: -1, a0: z + t, a1: z + h - t },
    { axis: "z", line: z, c: z + t, inward: 1, a0: x + t, a1: x + w - t },
    { axis: "z", line: z + h, c: z + h - t, inward: -1, a0: x + t, a1: x + w - t },
  ];
  for (const sd of sides) {
    let rects = [{ a0: sd.a0, a1: sd.a1, y0, y1 }];
    for (const o of openings.get(`${sd.axis}:${sd.line.toFixed(3)}`) ?? []) {
      if (o.a1 <= sd.a0 || o.a0 >= sd.a1 || o.y1 <= y0 || o.y0 >= y1) continue;
      rects = cut2(rects, o);
      const d = SITE_9.doors.find((q) => q.id === o.door);
      if (d.a !== r.id) continue;
      // the reveals: both jambs and the head, through the wall
      const lo = sd.line - t, hi = sd.line + t;
      surfaces.push({ kind: "reveal", room: r.id, axis: sd.axis === "x" ? "z" : "x", c: o.a0, inward: 1, a0: lo, a1: hi, y0: o.y0, y1: o.y1, door: o.door });
      surfaces.push({ kind: "reveal", room: r.id, axis: sd.axis === "x" ? "z" : "x", c: o.a1, inward: -1, a0: lo, a1: hi, y0: o.y0, y1: o.y1, door: o.door });
      surfaces.push({ kind: "head", room: r.id, axis: sd.axis, c: sd.line, inward: 0, a0: o.a0, a1: o.a1, y0: lo, y1: hi, at: o.y1, door: o.door });
    }
    for (const q of rects) surfaces.push({ kind: "wall", room: r.id, axis: sd.axis, c: sd.c, inward: sd.inward, a0: q.a0, a1: q.a1, y0: q.y0, y1: q.y1 });
  }
  surfaces.push({ kind: "floor", room: r.id, rect: [x + t, z + t, x + w - t, z + h - t], y: y0, holes: holesFloor(r.id) });
  surfaces.push({ kind: "ceiling", room: r.id, rect: [x + t, z + t, x + w - t, z + h - t], y: y1, holes: holesCeil(r.id) });
}

// ---- the anchors: ROOM_<id> at the floor's min-x/min-z corner; spots laid out inside each room ---------
const anchors = rooms.map((r) => ({ name: `ROOM_${r.id}`, at: [r.rect.x, bottomOf(r), r.rect.y], room: r.id, zone: r.zone, kind: r.kind }));
const spots = [];
for (const r of rooms) {
  const list = r.spots;
  if (!list.length) continue;
  const { x, y: z, w, h } = r.rect, y = bottomOf(r);
  const beds = list.filter((s) => s.kind === "bed"), rest = list.filter((s) => s.kind !== "bed");
  // six beds along the long walls, heads to the wall; everything else along the far wall
  beds.forEach((s, i) => {
    const side = i % 2, k = Math.floor(i / 2);
    const along = w >= h;
    const pos = along ? [x + 1.5 + k * ((w - 3) / 2), y, side ? z + h - 1.2 : z + 1.2] : [side ? x + w - 1.2 : x + 1.2, y, z + 1.5 + k * ((h - 3) / 2)];
    spots.push({ name: `SPOT_${s.id}`, at: pos, kind: s.kind, room: r.id });
  });
  rest.forEach((s, i) => {
    const t = (i + 1) / (rest.length + 1);
    const pos = w >= h ? [x + t * w, y, z + (beds.length ? h / 2 : h - 1.0)] : [x + w - 1.0, y, z + t * h];
    spots.push({ name: `SPOT_${s.id}`, at: pos, kind: s.kind, room: r.id, ...(s.tier ? { tier: s.tier } : {}), ...(s.zone ? { zone: s.zone } : {}) });
  });
}

// ---- the walk map, per floor ----------------------------------------------------------------------------
// '.' a body fits · '#' it doesn't. A cell is open when it's inside a room on that floor (a shaft counts
// on both its floors) and at least BODY_R from every wall, rail or stair standing in the band a body
// occupies there. Door leaves don't count: doors are state (doors.ts), not walls.
const walk = [];
for (const fl of [0, 1, 2]) {
  const here = rooms.filter((r) => floorsOf(r).includes(fl));
  if (!here.length) continue;                 // the bunker is one floor
  const level = FLOOR_Y[fl];
  const minX = Math.min(...here.map((r) => r.rect.x)), minZ = Math.min(...here.map((r) => r.rect.y));
  const maxX = Math.max(...here.map((r) => r.rect.x + r.rect.w)), maxZ = Math.max(...here.map((r) => r.rect.y + r.rect.h));
  const W = Math.ceil((maxX - minX) * WALK_RES), H = Math.ceil((maxZ - minZ) * WALK_RES);
  const g = new Uint8Array(W * H);   // 0 blocked, 1 open
  for (const r of here) {
    // a shaft's floor area is walkable at the bottom; at its top only the landing strip is
    for (let j = Math.floor((r.rect.y - minZ) * WALK_RES); j < Math.ceil((r.rect.y + r.rect.h - minZ) * WALK_RES); j++)
      for (let i = Math.floor((r.rect.x - minX) * WALK_RES); i < Math.ceil((r.rect.x + r.rect.w - minX) * WALK_RES); i++) {
        const cx = minX + (i + 0.5) / WALK_RES, cz = minZ + (j + 0.5) / WALK_RES;
        if (cx < r.rect.x || cx > r.rect.x + r.rect.w || cz < r.rect.y || cz > r.rect.y + r.rect.h) continue;
        if ((r.spans ?? 1) > 1 && fl === r.floor) {
          // the upper floor of a shaft: only what has a landing under your feet at this level
          const onLanding = boxes.some((b) => (b.cat === "landing" || b.cat === "lift") && b.room === r.id && Math.abs(b.max[1] - level) < 0.01
            && cx >= b.min[0] - 0.2 && cx <= b.max[0] + 0.2 && cz >= b.min[2] - 0.2 && cz <= b.max[2] + 0.2);
          if (!onLanding) continue;
        }
        if (grates.some((gr) => cx >= gr.hole[0] && cx <= gr.hole[2] && cz >= gr.hole[1] && cz <= gr.hole[3] && Math.abs(gr.upperY - level) < 0.01)) continue;
        g[j * W + i] = 1;
      }
  }
  const band0 = level + 0.1, band1 = level + 1.8;
  for (const b of boxes) {
    if (!(b.cat === "wall" || b.cat === "rail" || b.cat === "frame" || (b.cat === "stairs" && b.max[1] > band0 && b.max[1] < band1 + 0.5))) continue;
    if (b.max[1] <= band0 || b.min[1] >= band1) continue;
    const i0 = Math.max(0, Math.floor((b.min[0] - BODY_R - minX) * WALK_RES)), i1 = Math.min(W - 1, Math.ceil((b.max[0] + BODY_R - minX) * WALK_RES));
    const j0 = Math.max(0, Math.floor((b.min[2] - BODY_R - minZ) * WALK_RES)), j1 = Math.min(H - 1, Math.ceil((b.max[2] + BODY_R - minZ) * WALK_RES));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const cx = minX + (i + 0.5) / WALK_RES, cz = minZ + (j + 0.5) / WALK_RES;
      const dx = Math.max(b.min[0] - cx, 0, cx - b.max[0]), dz = Math.max(b.min[2] - cz, 0, cz - b.max[2]);
      if (dx * dx + dz * dz < BODY_R * BODY_R) g[j * W + i] = 0;
    }
  }
  // run-length rows: "12#40.3#" — a count and a character, repeated
  const rows = [];
  for (let j = 0; j < H; j++) {
    let s = "", run = 0, ch = "";
    for (let i = 0; i < W; i++) {
      const c = g[j * W + i] ? "." : "#";
      if (c === ch) run++;
      else { if (run) s += run + ch; ch = c; run = 1; }
    }
    s += run + ch;
    rows.push(s);
  }
  walk.push({ floor: fl, y: level, origin: [minX, minZ], w: W, h: H, rows });
}

// ---- out --------------------------------------------------------------------------------------------------
const problems = layoutProblems(SITE_9);
if (problems.length) { console.error("the map has layout problems; fix them first:\n  " + problems.join("\n  ")); process.exit(1); }
const unusedOpenings = SITE_9.doors.filter((d) => d.kind !== "vent" && d.kind !== "grate").length - openingsUsed;
const setDir = path.join(ROOT, "assets/downloads/survivorz/set");
fs.mkdirSync(setDir, { recursive: true });
const geom = { map: SITE_9.id, units: "metres, x east, y up, z south", wallT: WALL_T, slabT: SLAB_T, boxes, surfaces, doors, anchors, spots, links,
  zones: SITE_9.zones.map((z) => z.id), rooms: rooms.map((r) => ({ id: r.id, name: r.name, zone: r.zone, kind: r.kind, floor: r.floor, spans: r.spans ?? 1, rect: r.rect, bottom: bottomOf(r), top: topOf(r) })) };
fs.writeFileSync(path.join(setDir, OUT.geom), JSON.stringify(geom));
fs.writeFileSync(path.join(ROOT, OUT.walk), JSON.stringify({ map: SITE_9.id, res: WALK_RES, bodyR: BODY_R, floors: walk, links }, null, 0) + "\n");
const count = (c) => boxes.filter((b) => b.cat === c).length;
console.log(`greybox: ${boxes.length} boxes (walls ${count("wall")}, floors ${count("floor")}, ceilings ${count("ceiling")}, stairs ${count("stairs")}, rails ${count("rail")}, leaves ${count("leaf")})`);
console.log(`doors cut: ${openingsUsed} of ${SITE_9.doors.length - SITE_9.doors.filter((d) => d.kind === "vent" || d.kind === "grate").length}${unusedOpenings ? "  <-- SOME DOORS FOUND NO WALL" : ""}`);
for (const f of walk) {
  const open = f.rows.reduce((s, r) => s + [...r.matchAll(/(\d+)\./g)].reduce((t, m) => t + Number(m[1]), 0), 0);
  console.log(`walk floor ${f.floor}: ${f.w}x${f.h} cells, ${(open / WALK_RES / WALK_RES).toFixed(0)} m² open`);
}
