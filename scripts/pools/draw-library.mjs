// THE POOLROOMS' FIRST ROOM LIBRARY — the drawing script that produced
// src/backrooms/pools-rooms.json (Josh, 2026-09-27: "lets do rivers as the
// main path").
//
// ONE-TIME SCAFFOLDING. The JSON is the source of truth from the moment it is
// written: Josh edits rooms in the Admin Panel's map editor, and a design he
// publishes is pulled back into git with GET /api/admin/maps/1/export. Running
// this again OVERWRITES the library, so only do it on purpose — to redraw the
// river pieces after the cross-section changes, say — and then re-apply any
// hand edits.
//
// It is a script rather than hand-typed text because the river pieces are
// curves: a bend is a quarter annulus of the river's cross-section, the
// Confluence a round basin with four mouths, and a pool's graded floor is
// arithmetic. Every tile is linted as it is drawn; the script refuses to write
// a library with a broken room in it.
//
//   npm run build && node scripts/pools/draw-library.mjs

import { writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const require = createRequire(path.join(ROOT, "package.json"));
const { encodeH, formatLibrary } = require(path.join(ROOT, "dist", "backrooms", "tiles.js"));
const { lintPoolTile } = require(path.join(ROOT, "dist", "backrooms", "pools-tiles.js"));
const { RIVER_PROFILE } = require(path.join(ROOT, "dist", "backrooms", "pools-vocab.js"));

const RW = RIVER_PROFILE.length; // 19

// ---- a canvas ------------------------------------------------------------------------

class Draw {
  constructor(w, h) {
    this.w = w;
    this.h = h;
    this.m = Array.from({ length: h }, () => Array(w).fill(" "));
    this.z = Array.from({ length: h }, () => Array(w).fill(0));
    this.f = Array.from({ length: h }, () => Array(w).fill("."));
    this.r = null;
    this.doors = [];
    this.inner = [];
    this.face = [];
    this.props = [];
  }
  in(x, y) {
    return x >= 0 && y >= 0 && x < this.w && y < this.h;
  }
  /** Open floor ('.' or a zone letter) at height z. */
  floor(x, y, z = 0, ch = ".") {
    if (!this.in(x, y)) return;
    this.m[y][x] = ch;
    this.z[y][x] = z;
  }
  wall(x, y) {
    if (!this.in(x, y)) return;
    this.m[y][x] = "#";
    this.z[y][x] = 0;
    this.f[y][x] = ".";
  }
  none(x, y) {
    if (!this.in(x, y)) return;
    this.m[y][x] = " ";
    this.z[y][x] = 0;
    this.f[y][x] = ".";
  }
  isOpen(x, y) {
    return this.in(x, y) && this.m[y][x] !== " " && this.m[y][x] !== "#";
  }
  get(x, y) {
    return this.in(x, y) ? this.m[y][x] : " ";
  }
  hz(x, y) {
    return this.z[y][x];
  }
  put(x, y, g) {
    if (this.in(x, y)) this.f[y][x] = g;
  }
  rect(x0, y0, x1, y1, fn) {
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) fn(x, y);
  }
  /** Fill a box with floor and ring it with masonry. */
  hall(x0, y0, x1, y1, z = 0, ch = ".") {
    this.rect(x0, y0, x1, y1, (x, y) => (x === x0 || y === y0 || x === x1 || y === y1 ? this.wall(x, y) : this.floor(x, y, z, ch)));
  }
  /** A doorway through the border: `n` lanes from (x, y) on `side`, opened
   *  onto the floor inside (at z 0), with a portal ring on a 3-wide one. */
  door(x, y, side, n = 3, ring = true) {
    const lx = side === "N" || side === "S" ? 1 : 0;
    for (let k = 0; k < n; k++) this.floor(x + lx * k, y + (1 - lx) * k, 0);
    this.doors.push([x, y, side, n]);
    if (ring && n === 3) this.put(x + lx, y + (1 - lx), "P");
  }
  /** Surround every open cell with masonry where nothing is drawn. */
  encase() {
    const add = [];
    for (let y = 0; y < this.h; y++)
      for (let x = 0; x < this.w; x++) {
        if (this.m[y][x] !== " ") continue;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]])
          if (this.isOpen(x + dx, y + dy)) {
            add.push([x, y]);
            break;
          }
      }
    for (const [x, y] of add) this.wall(x, y);
  }
  def(meta) {
    const rows = (fn) => Array.from({ length: this.h }, (_, y) => Array.from({ length: this.w }, (_, x) => fn(x, y)).join(""));
    const d = { ...meta, map: rows((x, y) => this.m[y][x]) };
    if (this.z.some((r) => r.some((v) => v !== 0))) d.height = rows((x, y) => (this.m[y][x] === " " ? " " : encodeH(this.z[y][x])));
    if (this.f.some((r, y) => r.some((v, x) => v !== "." && this.m[y][x] !== " "))) d.furn = rows((x, y) => (this.m[y][x] === " " ? " " : this.f[y][x]));
    if (this.r) d.rooms = rows((x, y) => (this.m[y][x] === " " ? " " : this.r[y][x]));
    if (this.inner.length) d.inner = this.inner;
    if (this.face.length) d.face = this.face;
    d.doors = this.doors;
    if (this.props.length) d.props = this.props;
    return d;
  }
}

const TILES = [];
const add = (d, meta) => TILES.push(d.def(meta));

// ---- THE RIVER ---------------------------------------------------------------------------
// A river piece runs NORTH-SOUTH as drawn (the generator turns it): x = 0 and
// x = 20 are its walls, lanes 1-19 the cross-section, rows 0 and L-1 its mouths.

function reach(L) {
  const d = new Draw(RW + 2, L);
  for (let y = 0; y < L; y++) {
    d.wall(0, y);
    d.wall(RW + 1, y);
    for (let k = 0; k < RW; k++) d.floor(1 + k, y, RIVER_PROFILE[k]);
  }
  d.doors.push([1, 0, "N", RW], [1, L - 1, "S", RW]);
  return d;
}
/** A towpath doorway through the west (x 0) or east (x 20) wall at row y. */
function towDoor(d, west, y) {
  const x = west ? 0 : RW + 1;
  for (let k = 0; k < 3; k++) d.floor(x, y + k, 0);
  d.doors.push([x, y, west ? "W" : "E", 3]);
  d.put(x, y + 1, "P");
}
/** Dress a reach: portholes and cubbies along the towpath walls, skylights
 *  over the channel. Rows in `skip` are left clear (doorways). */
function dressReach(d, skip) {
  const L = d.h;
  for (let y = 2; y < L - 2; y++) {
    if (skip.some((s) => y >= s - 1 && y <= s + 3)) continue;
    if (y % 6 === 3) {
      d.put(1, y, "o");
      d.put(RW, y, "o");
    } else if (y % 6 === 0) {
      d.put(1, y, "b");
      d.put(RW, y, "b");
    }
  }
  for (let y = 3; y < L - 2; y += 6) d.put(1 + (RW >> 1), y, "*");
}

{
  // the plain reach: a doorway on each bank
  const d = reach(16);
  towDoor(d, true, 6);
  towDoor(d, false, 6);
  dressReach(d, [6]);
  add(d, { id: "river-reach", kind: "river", set: "any", role: "river", type: "river", weight: 4, note: "A straight reach: towpath doors on both banks." });
}
{
  // the long reach: two doorways a bank, staggered
  const d = reach(26);
  towDoor(d, true, 4);
  towDoor(d, false, 11);
  towDoor(d, true, 18);
  dressReach(d, [4, 11, 18]);
  add(d, { id: "river-reach-long", kind: "river", set: "any", role: "river", type: "river", weight: 3, note: "A long reach, doors staggered along the banks." });
}
{
  // the blind reach: walls both sides — a stretch you only pass through
  const d = reach(12);
  dressReach(d, []);
  add(d, { id: "river-reach-blind", kind: "river", set: "any", role: "river", type: "river", weight: 1.5, note: "A short reach with no doors — walls on both banks." });
}
{
  // THE ARCADE: each towpath walks behind a masonry arcade, arches opening
  // onto the water every other cell
  const L = 20;
  const d = reach(L);
  for (let y = 2; y < L - 2; y++) {
    for (const x of [3, RW - 1]) {
      if (y % 2 === 0) d.wall(x, y);
      else d.put(x, y, "A");
    }
  }
  towDoor(d, true, 8);
  towDoor(d, false, 8);
  for (let y = 3; y < L - 2; y += 6) d.put(1 + (RW >> 1), y, "*");
  add(d, { id: "river-arcade", kind: "river", set: "any", role: "river", type: "river", weight: 2, note: "The towpaths walk behind arcades of arches over the water." });
}
{
  // THE BRIDGE: a deck across the channel at +1, the banks' towpaths either
  // end — and the one place a reach ends for the boats and the alligators
  const L = 16;
  const d = reach(L);
  for (const y of [7, 8]) for (let k = 3; k < RW - 3; k++) {
    d.floor(1 + k, y, 1);
    d.put(1 + k, y, "B");
  }
  towDoor(d, true, 6);
  towDoor(d, false, 6);
  for (let y = 3; y < L - 2; y += 10) d.put(1 + (RW >> 1), y, "*");
  d.put(1, 3, "o");
  d.put(RW, 3, "o");
  d.put(1, 12, "b");
  d.put(RW, 12, "b");
  add(d, { id: "river-bridge", kind: "river", set: "any", role: "river", type: "river", weight: 2, note: "A footbridge across — it also ends a reach for boats and alligators." });
}
{
  // THE DOCK: a jetty out to the deep water, with a ladder down — where the
  // boats tie up
  const L = 16;
  const d = reach(L);
  for (const y of [6, 7]) for (let k = 3; k <= 6; k++) d.floor(1 + k, y, 0);
  d.put(8, 6, "H");
  towDoor(d, false, 6);
  dressReach(d, [6]);
  d.put(1, 3, ".");
  add(d, { id: "river-dock", kind: "river", set: "any", role: "river", type: "river", weight: 1.5, min: 2, note: "A jetty out to the deep channel: a boat's mooring." });
}

// THE BEND: a quarter annulus of the cross-section round a pivot, with a
// straight lead-in of `lead` cells at each mouth — the lead-ins are where a
// bend carries its towpath doorways (a doorway can't sit on a curve)
function bend(R, lead = 0) {
  const S = lead + R + RW + 1;
  const d = new Draw(S, S);
  for (let y = 0; y < S; y++)
    for (let x = 0; x < S; x++) {
      const px = x - lead;
      const py = y - lead;
      let r = null;
      if (px >= 0 && py >= 0) r = Math.hypot(px + 0.5, py + 0.5) - R;
      else if (py < 0 && px >= 0) r = px - R + 0.5; // the north lead-in
      else if (px < 0 && py >= 0) r = py - R + 0.5; // the west lead-in
      if (r === null) continue;
      if (r >= 0 && r < RW) d.floor(x, y, RIVER_PROFILE[Math.floor(r)]);
      else if (r >= -1 && r < RW + 1) d.wall(x, y);
    }
  d.doors.push([lead + R, 0, "N", RW], [0, lead + R, "W", RW]);
  if (lead >= 6) {
    // outer bank: the north arm's east wall, the west arm's south wall
    const ex = lead + R + RW;
    for (let k = 0; k < 3; k++) d.floor(ex, 2 + k, 0);
    d.doors.push([ex, 2, "E", 3]);
    d.put(ex, 3, "P");
    const sy = lead + R + RW;
    for (let k = 0; k < 3; k++) d.floor(2 + k, sy, 0);
    d.doors.push([2, sy, "S", 3]);
    d.put(3, sy, "P");
  }
  // skylights down the middle of the channel
  for (const a of [0.25, 0.5, 0.75]) {
    const rr = R + RW / 2;
    const x = lead + Math.floor(Math.cos((a * Math.PI) / 2) * rr);
    const y = lead + Math.floor(Math.sin((a * Math.PI) / 2) * rr);
    if (d.isOpen(x, y)) d.put(x, y, "*");
  }
  return d;
}
{
  const d = bend(8, 8);
  add(d, { id: "river-bend", kind: "river", set: "any", role: "river", type: "river", weight: 3, note: "A quarter turn, banks graded all the way round; towpath doors on the outside of the turn." });
}
{
  const d = bend(16, 7);
  add(d, { id: "river-bend-wide", kind: "river", set: "any", role: "river", type: "river", weight: 2, note: "A slow quarter turn; towpath doors on the outside of the turn." });
}

// THE CONFLUENCE: a round basin where both rivers meet
{
  const S = 61;
  const c = (S - 1) / 2;
  const d = new Draw(S, S);
  const BASIN = 10; // bed radius
  const HALL = 27; // floor radius
  const carve = (x, y) => {
    let h = 0;
    let open = false;
    const r = Math.hypot(x - c, y - c);
    if (r <= HALL) {
      open = true;
      const k = Math.floor(r - BASIN);
      h = Math.min(h, k < 0 ? -6 : k < 6 ? -6 + k : 0);
    }
    // the four arms, each the river's cross-section out to the edge
    const u = x - (c - (RW - 1) / 2);
    const v = y - (c - (RW - 1) / 2);
    if (u >= 0 && u < RW && (y < c || y > c)) {
      open = true;
      h = Math.min(h, RIVER_PROFILE[u]);
    }
    if (v >= 0 && v < RW && (x < c || x > c)) {
      open = true;
      h = Math.min(h, RIVER_PROFILE[v]);
    }
    return open ? h : null;
  };
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const h = carve(x, y);
    if (h !== null) d.floor(x, y, h);
  }
  d.encase();
  // the arms reach the edge: their mouths
  const a = c - (RW - 1) / 2;
  d.doors.push([a, 0, "N", RW], [a, S - 1, "S", RW], [0, a, "W", RW], [S - 1, a, "E", RW]);
  // clear the corner cells the encase put ON the edge rows beside the mouths
  // (they are walls, which is right), and ring the basin with pillars in
  // the shallows
  for (let k = 0; k < 8; k++) {
    const ang = (k + 0.5) * (Math.PI / 4);
    const x = Math.round(c + Math.cos(ang) * (HALL - 3)) - 1;
    const y = Math.round(c + Math.sin(ang) * (HALL - 3)) - 1;
    const ok = [0, 1].every((dy) => [0, 1].every((dx) => d.isOpen(x + dx, y + dy) && d.hz(x + dx, y + dy) === d.hz(x, y)));
    if (ok) for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) d.put(x + dx, y + dy, "O");
  }
  for (const [dx, dy] of [[0, 0], [-6, 0], [6, 0], [0, -6], [0, 6]]) d.put(c + dx, c + dy, "*");
  add(d, { id: "the-confluence", name: "The Confluence", kind: "confluence", set: "any", role: "confluence", type: "river", min: 1, max: 1, note: "Where the two rivers meet: a round basin, four mouths." });
}

// THE SOURCES: where a river rises, and where it runs out
function headwater(L) {
  const d = new Draw(RW + 2, L);
  for (let y = 0; y < L; y++) {
    d.wall(0, y);
    d.wall(RW + 1, y);
    for (let k = 0; k < RW; k++) {
      // the bed shelves up to the head wall
      const depth = RIVER_PROFILE[k];
      const shelf = Math.min(0, depth + Math.max(0, 5 - y));
      d.floor(1 + k, y, y === 0 ? 0 : shelf);
    }
  }
  for (let x = 0; x <= RW + 1; x++) d.wall(x, 0);
  d.doors.push([1, L - 1, "S", RW]);
  return d;
}
{
  // THE CULVERT: the river pours out of a tunnel mouth in the head wall; a
  // footbridge joins the banks just below it
  const L = 18;
  const d = headwater(L);
  for (const y of [7, 8]) for (let k = 3; k < RW - 3; k++) {
    d.floor(1 + k, y, 1);
    d.put(1 + k, y, "B");
  }
  towDoor(d, true, 11);
  towDoor(d, false, 11);
  d.put(8, 1, "o");
  d.put(10, 1, "o");
  d.put(12, 1, "o");
  d.put(1 + (RW >> 1), 4, "*");
  add(d, { id: "source-culvert", name: "The Culvert", kind: "source", set: "any", role: "source", type: "river", max: 2, note: "A river's end: it pours from a culvert in the head wall." });
}
{
  // THE SPRINGS: the river rises in a round pool
  const R = 13;
  const S = RW + 2 + 8;
  const L = 2 * R + 14;
  const d = new Draw(S, L);
  const cx = (S - 1) / 2;
  const cy = R + 1;
  for (let y = 0; y < L; y++) for (let x = 0; x < S; x++) {
    let h = null;
    const r = Math.hypot(x - cx, y - cy);
    if (r <= R) {
      const k = Math.floor(R - r);
      h = Math.max(-6, -k + 1 > 0 ? 0 : Math.min(0, 1 - k));
      if (r > R - 1.5) h = 0;
    }
    const u = x - 5;
    if (u >= 0 && u < RW && y >= cy) h = h === null ? RIVER_PROFILE[u] : Math.min(h, RIVER_PROFILE[u]);
    if (h !== null) d.floor(x, y, h);
  }
  d.encase();
  d.doors.push([5, L - 1, "S", RW]);
  // a doorway out of the pool room on each side
  for (const west of [true, false]) {
    const x = west ? 0 : S - 1;
    // find the rim at cy
    for (let k = 0; k < 3; k++) {
      d.floor(x, cy - 1 + k, 0);
      const step = west ? 1 : -1;
      for (let xx = x + step; d.get(xx, cy - 1 + k) === "#"; xx += step) d.floor(xx, cy - 1 + k, 0);
    }
    d.doors.push([x, cy - 1, west ? "W" : "E", 3]);
    d.put(x, cy, "P");
  }
  for (const [dx, dy] of [[0, 0], [-5, 0], [5, 0], [0, -5]]) d.put(Math.round(cx + dx), cy + dy, "*");
  add(d, { id: "source-springs", name: "The Springs", kind: "source", set: "any", role: "source", type: "river", max: 2, note: "A river's head: it rises in a round spring pool." });
}
{
  // THE OUTFALL: a square flood chamber with a pillar grid, the river's end
  const L = 30;
  const S = RW + 12;
  const d = new Draw(S, L);
  for (let y = 0; y < L; y++) for (let x = 0; x < S; x++) {
    const u = x - 6;
    let h;
    if (y < 18) {
      // the chamber: deep in the middle, a dry apron round it
      const edge = Math.min(x, S - 1 - x, y);
      h = edge < 3 ? 0 : Math.max(-6, -(edge - 2));
      if (y > 14 && (u < 0 || u >= RW)) h = 0;
    } else h = u >= 0 && u < RW ? RIVER_PROFILE[u] : null;
    if (h !== null) d.floor(x, y, h);
  }
  // blend the channel into the chamber's floor
  for (let y = 12; y < 18; y++) for (let x = 6; x < 6 + RW; x++) d.floor(x, y, Math.min(d.hz(x, y), RIVER_PROFILE[x - 6]));
  d.encase();
  d.doors.push([6, L - 1, "S", RW]);
  for (let y = 5; y <= 10; y += 5) for (let x = 7; x < S - 7; x += 5) {
    const z = d.hz(x, y);
    if ([0, 1].every((dy) => [0, 1].every((dx) => d.isOpen(x + dx, y + dy) && d.hz(x + dx, y + dy) === z))) for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) d.put(x + dx, y + dy, "O");
  }
  // doorways off the apron
  d.door(0, 5, "W");
  d.door(S - 1, 5, "E");
  d.door(Math.floor(S / 2) - 1, 0, "N");
  add(d, { id: "source-outfall", name: "The Outfall", kind: "source", set: "any", role: "source", type: "river", max: 2, note: "A river's end: a pillared flood chamber." });
}

// ---- THE HALLS -------------------------------------------------------------------------

/** Doorway lanes on a hall border at the middle of a side. */
function sideDoors(d, sides) {
  const { w, h } = d;
  for (const s of sides) {
    if (s === "N") d.door((w >> 1) - 1, 0, "N");
    if (s === "S") d.door((w >> 1) - 1, h - 1, "S");
    if (s === "W") d.door(0, (h >> 1) - 1, "W");
    if (s === "E") d.door(w - 1, (h >> 1) - 1, "E");
  }
}
/** A pool: a rounded rectangle sunk into the deck, shallow end ramping to
 *  the deep end along x. */
function pool(d, x0, y0, x1, y1, deep = -5, r = 3) {
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const cx = Math.max(x0 + r, Math.min(x1 - r, x));
    const cy = Math.max(y0 + r, Math.min(y1 - r, y));
    if (Math.hypot(x - cx, y - cy) > r + 0.3) continue;
    const t = (x - x0) / Math.max(1, x1 - x0);
    const z = Math.round(-2 + (deep + 2) * Math.min(1, t * 1.6));
    d.floor(x, y, z);
  }
}
/** Chrome ladders at the rim, facing out onto the deck. */
function ladders(d, spots) {
  for (const [x, y] of spots) {
    for (const [dx, dy, s] of [[0, -1, "N"], [1, 0, "E"], [0, 1, "S"], [-1, 0, "W"]]) {
      if (d.isOpen(x + dx, y + dy) && d.hz(x + dx, y + dy) >= 0 && d.hz(x, y) <= -2) {
        d.put(x, y, "H");
        d.face.push([x, y, s]);
        break;
      }
    }
  }
}
/** Pillars in a grid inside a box, where the floor under each is level. */
function pillarGrid(d, x0, y0, x1, y1, step) {
  for (let y = y0; y + 1 <= y1; y += step) for (let x = x0; x + 1 <= x1; x += step) {
    const z = d.hz(x, y);
    const ok = [0, 1].every((dy) => [0, 1].every((dx) => d.isOpen(x + dx, y + dy) && d.hz(x + dx, y + dy) === z && d.f[y + dy][x + dx] === "."));
    if (ok) for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) d.put(x + dx, y + dy, "O");
  }
}
/** Portholes and cubbies along the inside of the border. */
function dressWalls(d, every = 5) {
  const doorCells = new Set();
  for (const [x, y, s, n] of d.doors) {
    const lx = s === "N" || s === "S" ? 1 : 0;
    for (let k = -1; k <= n; k++) {
      doorCells.add(`${x + lx * k},${y + (1 - lx) * k}`);
      // and the step inside
      const ix = x + lx * k + (s === "W" ? 1 : s === "E" ? -1 : 0);
      const iy = y + (1 - lx) * k + (s === "N" ? 1 : s === "S" ? -1 : 0);
      doorCells.add(`${ix},${iy}`);
    }
  }
  let n = 0;
  for (let y = 1; y < d.h - 1; y++) for (let x = 1; x < d.w - 1; x++) {
    if (!d.isOpen(x, y) || d.hz(x, y) !== 0 || d.f[y][x] !== "." || doorCells.has(`${x},${y}`)) continue;
    const wallSide = [[0, -1], [1, 0], [0, 1], [-1, 0]].findIndex(([dx, dy]) => d.get(x + dx, y + dy) === "#");
    if (wallSide < 0) continue;
    if (n++ % every === 0) d.put(x, y, (n / every) % 2 < 1 ? "o" : "b");
  }
}

{
  // THE GRAND LIDO: the great pool hall — a pool big enough for an
  // alligator, round pillars standing in it, a mezzanine up a spiral stair
  const W = 46;
  const H = 38;
  const d = new Draw(W, H);
  d.hall(0, 0, W - 1, H - 1);
  pool(d, 6, 9, W - 7, H - 6, -5, 4);
  // the mezzanine along the north wall at +6, reached by a spiral stair
  for (let y = 1; y <= 3; y++) for (let x = 12; x <= W - 2; x++) d.floor(x, y, 6);
  // the stair tower: a 6×6 block, 2×2 core, twelve-cell ring climbing 1-6
  const tx = 5;
  const ty = 1;
  d.rect(tx, ty, tx + 5, ty + 5, (x, y) => d.wall(x, y));
  const ring = [[1, 1], [2, 1], [3, 1], [4, 1], [4, 2], [4, 3], [4, 4], [3, 4], [2, 4], [1, 4], [1, 3], [1, 2]];
  const hts = [6, 6, 5, 5, 4, 4, 3, 3, 2, 2, 1, 1];
  ring.forEach(([rx, ry], k) => d.floor(tx + rx, ty + ry, hts[k]));
  for (const [dx, dy] of [[2, 2], [3, 2], [2, 3], [3, 3]]) {
    d.floor(tx + dx, ty + dy, 0);
    d.put(tx + dx, ty + dy, "Q");
  }
  // in at the bottom (ring cell at 1, (1,2)) from the deck on its west…
  d.floor(tx, ty + 2, 0);
  // …out at the top (ring cell at 6, (4,1)) onto the mezzanine's east
  d.floor(tx + 5, ty + 1, 6);
  d.floor(tx + 6, ty + 1, 6);
  for (let x = tx + 6; x < 12; x++) d.floor(x, ty, 6), d.floor(x, ty + 1, 6), d.floor(x, ty + 2, 6);
  sideDoors(d, ["W", "E", "S"]);
  pillarGrid(d, 12, 13, W - 12, H - 10, 8);
  ladders(d, [[8, 12], [W - 9, H - 10], [20, H - 7], [30, 10]]);
  for (let y = 12; y < H - 6; y += 8) for (let x = 12; x < W - 8; x += 9) d.put(x, y, d.f[y][x] === "." ? "*" : d.f[y][x]);
  dressWalls(d, 6);
  add(d, { id: "grand-lido", name: "The Grand Lido", kind: "natatorium", set: "any", role: "hall", type: "natatorium", min: 1, max: 1, weight: 2, note: "The great pool hall: a deep pool, pillars in the water, a mezzanine up a spiral stair." });
}
{
  // a smaller pool hall
  const W = 30;
  const H = 24;
  const d = new Draw(W, H);
  d.hall(0, 0, W - 1, H - 1);
  pool(d, 5, 5, W - 6, H - 6, -4, 3);
  sideDoors(d, ["W", "E", "N"]);
  ladders(d, [[6, 7], [W - 7, H - 8]]);
  for (let x = 8; x < W - 6; x += 7) d.put(x, H >> 1, "*");
  dressWalls(d, 5);
  add(d, { id: "natatorium", kind: "natatorium", set: "any", role: "hall", type: "natatorium", weight: 2, max: 8, note: "A pool hall." });
}
{
  // THE VAULT SEA: deep water wall to wall, an arcade of pillars and arches
  // rising out of it, one walkway threading through
  const W = 40;
  const H = 40;
  const d = new Draw(W, H);
  d.hall(0, 0, W - 1, H - 1, -5);
  // the walkway: in at the west door, a dogleg, out at the east and south
  const walk = (x0, y0, x1, y1) => d.rect(Math.min(x0, x1), Math.min(y0, y1), Math.max(x0, x1), Math.max(y0, y1), (x, y) => d.floor(x, y, 0));
  walk(1, 18, 14, 20);
  walk(12, 18, 14, 30);
  walk(12, 28, W - 2, 30);
  walk(24, 28, 26, H - 2);
  // dry landings behind every doorway
  d.door(0, 18, "W");
  d.door(W - 1, 28, "E");
  d.door(24, H - 1, "S");
  walk(1, 17, 2, 21);
  // the arcades: rows of pillars with an arch between each pair, in the water
  for (const y of [6, 12, 24, 34]) {
    for (let x = 3; x + 1 < W - 2; x += 3) {
      if (!d.isOpen(x, y) || !d.isOpen(x + 1, y + 1) || d.hz(x, y) !== -5 || d.hz(x + 1, y + 1) !== -5 || d.hz(x + 1, y) !== -5 || d.hz(x, y + 1) !== -5) continue;
      if (x % 6 === 3) for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) d.put(x + dx, y + dy, "O");
    }
  }
  for (let y = 4; y < H - 2; y += 9) for (let x = 5; x < W - 3; x += 9) if (d.isOpen(x, y) && d.f[y][x] === ".") d.put(x, y, "*");
  ladders(d, [[3, 17], [15, 22], [22, 27], [30, 31]]);
  add(d, { id: "vault-sea", name: "The Vault Sea", kind: "vaultsea", set: "any", role: "hall", type: "vaultsea", min: 1, max: 1, note: "Deep water wall to wall, pillars rising out of it, one walkway through." });
  add(d, { id: "flooded-vault", kind: "vaultsea", set: "any", role: "hall", type: "vaultsea", max: 2, note: "The Vault Sea's drawing, unnamed: deep water, pillars, one walkway." });
}
{
  // THE LONG GALLERY: a nave down the middle with a knee-deep channel,
  // portal rings every eight cells, dry aisles either side through arches
  const L = 50;
  const W = 17;
  const d = new Draw(W, L);
  d.hall(0, 0, W - 1, L - 1);
  const c = W >> 1; // 8
  // the nave: 5 wide (c-2..c+2), the channel 3 wide at -3 in its middle
  for (let y = 1; y < L - 1; y++) {
    d.wall(c - 3, y);
    d.wall(c + 3, y);
    for (let x = c - 2; x <= c + 2; x++) d.floor(x, y, Math.abs(x - c) <= 1 ? (y < 3 || y > L - 4 ? -1 : -3) : 0);
  }
  // cross walls with a portal ring every 8 cells
  for (let y = 6; y < L - 4; y += 8) {
    d.wall(c - 2, y);
    d.wall(c + 2, y);
    d.put(c, y, "P");
  }
  // arched doorways between the aisles and the nave
  for (let y = 10; y < L - 4; y += 8) {
    for (const x of [c - 3, c + 3]) {
      d.floor(x, y, 0);
      d.put(x, y, "A");
    }
  }
  // the ends: the nave opens into the aisles
  for (const y of [1, 2, L - 3, L - 2]) for (const x of [c - 3, c + 3]) d.floor(x, y, 0);
  d.door(1, 0, "N");
  d.door(W - 4, 0, "N");
  d.door(1, L - 1, "S");
  d.door(W - 4, L - 1, "S");
  for (let y = 4; y < L - 2; y += 6) {
    d.put(1, y, "o");
    d.put(W - 2, y, "o");
  }
  for (let y = 4; y < L - 2; y += 8) d.put(c, y, "*");
  add(d, { id: "long-gallery", name: "The Long Gallery", kind: "portalhall", set: "any", role: "hall", type: "portalhall", min: 1, max: 1, note: "A nave of portal rings over a knee-deep channel, dry aisles either side." });
}
{
  // THE FLOOD FIELDS: a waist-deep pillar field under skylights
  const W = 38;
  const H = 30;
  const d = new Draw(W, H);
  d.hall(0, 0, W - 1, H - 1, -3);
  // a dry ledge round the edge
  for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) if (x <= 2 || y <= 2 || x >= W - 3 || y >= H - 3) d.floor(x, y, 0);
  for (let y = 3; y < H - 3; y++) for (let x = 3; x < W - 3; x++) if (x === 3 || y === 3 || x === W - 4 || y === H - 4) d.floor(x, y, -2);
  sideDoors(d, ["W", "E", "N", "S"]);
  pillarGrid(d, 6, 6, W - 6, H - 6, 5);
  for (let y = 5; y < H - 3; y += 6) for (let x = 5; x < W - 3; x += 6) if (d.f[y][x] === ".") d.put(x, y, "*");
  dressWalls(d, 7);
  add(d, { id: "flood-fields", name: "The Flood Fields", kind: "shallows", set: "any", role: "hall", type: "shallows", min: 1, max: 1, note: "Waist-deep water across the whole hall, a pillar field under skylights." });
  add(d, { id: "shallows", kind: "shallows", set: "any", role: "hall", type: "shallows", max: 2, note: "The Flood Fields' drawing, unnamed: waist-deep water, a pillar field." });
}
{
  // THE GREAT DOME: a round room, a ring of steps down into a round pool
  const S = 37;
  const c = (S - 1) / 2;
  const d = new Draw(S, S);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const r = Math.hypot(x - c, y - c);
    if (r > 16.5) continue;
    const z = r > 11 ? 0 : r > 10 ? -1 : r > 9 ? -2 : r > 8 ? -3 : r > 7 ? -4 : -5;
    d.floor(x, y, z);
  }
  // corridors from the ring out to the tile edge at the four compass points
  for (const [dx, dy, s] of [[0, -1, "N"], [0, 1, "S"], [-1, 0, "W"], [1, 0, "E"]]) {
    for (let k = 14; k <= c; k++) for (let q = -1; q <= 1; q++) {
      const x = c + dx * k + (dy ? q : 0);
      const y = c + dy * k + (dx ? q : 0);
      d.floor(x, y, 0);
    }
  }
  d.encase();
  for (const [x, y, s] of [[c - 1, 0, "N"], [c - 1, S - 1, "S"], [0, c - 1, "W"], [S - 1, c - 1, "E"]]) {
    d.doors.push([x, y, s, 3]);
    d.put(s === "N" || s === "S" ? x + 1 : x, s === "N" || s === "S" ? y : y + 1, "P");
  }
  // a ring of pillars on the dry floor
  for (let k = 0; k < 8; k++) {
    const a = (k + 0.5) * (Math.PI / 4);
    const x = Math.round(c + Math.cos(a) * 13.5) - 1;
    const y = Math.round(c + Math.sin(a) * 13.5) - 1;
    if ([0, 1].every((dy) => [0, 1].every((dx) => d.isOpen(x + dx, y + dy) && d.hz(x + dx, y + dy) === 0))) for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) d.put(x + dx, y + dy, "O");
  }
  d.put(c, c, "*");
  for (const [dx, dy] of [[-5, 0], [5, 0], [0, -5], [0, 5]]) d.put(c + dx, c + dy, "*");
  add(d, { id: "great-dome", name: "The Great Dome", kind: "rotunda", set: "any", role: "hall", type: "rotunda", min: 1, max: 1, note: "A round domed room: rings of steps down into a round pool." });
}
{
  // a small rotunda
  const S = 23;
  const c = (S - 1) / 2;
  const d = new Draw(S, S);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const r = Math.hypot(x - c, y - c);
    if (r > 9.5) continue;
    d.floor(x, y, r > 6 ? 0 : r > 5 ? -1 : r > 4 ? -2 : -3);
  }
  for (const [dx, dy] of [[0, -1], [0, 1], [-1, 0], [1, 0]]) for (let k = 8; k <= c; k++) for (let q = -1; q <= 1; q++) d.floor(c + dx * k + (dy ? q : 0), c + dy * k + (dx ? q : 0), 0);
  d.encase();
  for (const [x, y, s] of [[c - 1, 0, "N"], [c - 1, S - 1, "S"], [0, c - 1, "W"], [S - 1, c - 1, "E"]]) {
    d.doors.push([x, y, s, 3]);
    d.put(s === "N" || s === "S" ? x + 1 : x, s === "N" || s === "S" ? y : y + 1, "P");
  }
  d.put(c, c, "*");
  add(d, { id: "rotunda", kind: "rotunda", set: "any", role: "hall", type: "rotunda", max: 6, note: "A small round room with a sunken pool." });
}
{
  // THE BATHHOUSE: a corridor of private bath rooms behind arched doors
  const W = 31;
  const H = 21;
  const d = new Draw(W, H);
  d.r = Array.from({ length: H }, () => Array(W).fill("1"));
  d.hall(0, 0, W - 1, H - 1);
  // the corridor down the middle
  const cy = H >> 1;
  // the rooms: four north, four south, 6 wide each
  for (let k = 0; k < 4; k++) {
    const x0 = 1 + k * 7 + 1;
    for (const north of [true, false]) {
      const y0 = north ? 1 : cy + 3;
      const y1 = north ? cy - 3 : H - 2;
      const label = String.fromCharCode(97 + k * 2 + (north ? 0 : 1));
      for (let y = y0; y <= y1; y++) for (let x = x0; x < x0 + 6; x++) d.r[y][x] = label;
      for (let y = y0; y <= y1; y++) {
        d.wall(x0 - 1, y);
        if (k === 3) d.wall(x0 + 6, y);
      }
      // the private pool
      for (let y = y0 + 1; y <= y1 - 1; y++) for (let x = x0 + 1; x <= x0 + 4; x++) if (Math.abs(y - (y0 + y1) / 2) <= 1.5) d.floor(x, y, -3);
      // the arched doorway onto the corridor
      const dx = x0 + 2;
      const dy = north ? y1 + 1 : y0 - 1;
      d.wall(x0, dy);
      d.wall(x0 + 1, dy);
      d.wall(x0 + 3, dy);
      d.wall(x0 + 4, dy);
      d.wall(x0 + 5, dy);
      d.floor(dx, dy, 0);
      d.r[dy][dx] = label;
      d.put(dx, dy, "A");
      d.inner.push([dx, north ? dy + 1 : dy - 1, north ? "N" : "S", 1]);
      d.put(north ? x0 + 5 : x0, north ? y0 : y1, "b");
    }
  }
  d.door(0, cy - 1, "W");
  d.door(W - 1, cy - 1, "E");
  for (let x = 4; x < W - 2; x += 7) d.put(x, cy, "*");
  add(d, { id: "bathhouse", name: "The Bathhouse", kind: "baths", set: "any", role: "hall", type: "baths", min: 1, max: 1, note: "Eight private baths off a corridor, each through its own arch." });
  add(d, { id: "bath-corridor", kind: "baths", set: "any", role: "hall", type: "baths", max: 2, note: "The Bathhouse's drawing, unnamed: private baths off a corridor." });
}
{
  // THE WINDING: a maze of wading tunnels, portholes in their walls
  const S = 33;
  const d = new Draw(S, S);
  // carve a grid maze of 3-wide tunnels on a 6-cell pitch, from the centre
  const N = 5;
  const P = 6;
  const cellAt = (i, j) => [3 + i * P, 3 + j * P];
  const seen = new Set();
  let seed = 7;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  const carve = (x0, y0, x1, y1) => d.rect(Math.min(x0, x1), Math.min(y0, y1), Math.max(x0, x1), Math.max(y0, y1), (x, y) => d.floor(x, y, -2));
  const visit = (i, j) => {
    seen.add(`${i},${j}`);
    const [x, y] = cellAt(i, j);
    carve(x, y, x + 2, y + 2);
    const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]].sort(() => rnd() - 0.5);
    for (const [di, dj] of dirs) {
      const ni = i + di;
      const nj = j + dj;
      if (ni < 0 || nj < 0 || ni >= N || nj >= N || seen.has(`${ni},${nj}`)) continue;
      const [nx, ny] = cellAt(ni, nj);
      carve(x, y, nx + 2, ny + 2);
      visit(ni, nj);
    }
  };
  visit(2, 2);
  // a few extra openings make loops
  for (const [i, j, di, dj] of [[0, 0, 1, 0], [3, 1, 0, 1], [1, 3, 1, 0], [4, 4, 0, -1]]) {
    const [x, y] = cellAt(i, j);
    const [nx, ny] = cellAt(i + di, j + dj);
    carve(x, y, nx + 2, ny + 2);
  }
  // a round swim well in the middle chamber
  const [mx, my] = cellAt(2, 2);
  for (let y = my - 1; y <= my + 3; y++) for (let x = mx - 1; x <= mx + 3; x++) d.floor(x, y, Math.hypot(x - mx - 1, y - my - 1) < 1.2 ? -5 : Math.hypot(x - mx - 1, y - my - 1) < 2.4 ? -3 : -2);
  // doorways at the four edges: a dry step up (-1) and the lanes at 0
  for (const [i, j, s] of [[2, 0, "N"], [2, N - 1, "S"], [0, 2, "W"], [N - 1, 2, "E"]]) {
    const [x, y] = cellAt(i, j);
    if (s === "N") for (let yy = 0; yy < y; yy++) for (let k = 0; k < 3; k++) d.floor(x + k, yy, yy === 0 ? 0 : -1);
    if (s === "S") for (let yy = y + 3; yy < S; yy++) for (let k = 0; k < 3; k++) d.floor(x + k, yy, yy === S - 1 ? 0 : -1);
    if (s === "W") for (let xx = 0; xx < x; xx++) for (let k = 0; k < 3; k++) d.floor(xx, y + k, xx === 0 ? 0 : -1);
    if (s === "E") for (let xx = x + 3; xx < S; xx++) for (let k = 0; k < 3; k++) d.floor(xx, y + k, xx === S - 1 ? 0 : -1);
    const dx = s === "N" || s === "S" ? x : s === "W" ? 0 : S - 1;
    const dy = s === "W" || s === "E" ? y : s === "N" ? 0 : S - 1;
    d.doors.push([dx, dy, s, 3]);
  }
  d.encase();
  // portholes on the tunnel walls
  let n = 0;
  for (let y = 1; y < S - 1; y++) for (let x = 1; x < S - 1; x++) {
    if (!d.isOpen(x, y) || d.hz(x, y) !== -2) continue;
    if ([[0, -1], [1, 0], [0, 1], [-1, 0]].some(([dx, dy]) => d.get(x + dx, y + dy) === "#") && n++ % 7 === 0) d.put(x, y, "o");
  }
  add(d, { id: "the-winding", name: "The Winding", kind: "tunnels", set: "any", role: "hall", type: "tunnels", min: 1, max: 1, note: "A maze of wading tunnels, portholes in the walls, a swim well at its heart." });
}

{
  // THE GALLERY: a dry colonnade hall, a long reflecting channel down its
  // middle, skylights over the pillars
  const W = 36;
  const H = 22;
  const d = new Draw(W, H);
  d.hall(0, 0, W - 1, H - 1);
  const cy = H >> 1;
  for (let x = 4; x <= W - 5; x++) for (let y = cy - 1; y <= cy; y++) d.floor(x, y, x === 4 || x === W - 5 ? -1 : -2);
  for (let x = 5; x + 1 <= W - 6; x += 5) for (const y of [cy - 5, cy + 4]) for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) d.put(x + dx, y + dy, "O");
  sideDoors(d, ["W", "E", "N", "S"]);
  for (let x = 7; x < W - 4; x += 5) d.put(x, cy - 2, "*");
  dressWalls(d, 6);
  add(d, { id: "colonnade", name: "The Gallery", kind: "natatorium", set: "any", role: "hall", type: "portalhall", max: 1, weight: 3, note: "A dry colonnade, a reflecting channel down the middle." });
}
{
  // a colonnade hall, unnamed
  const W = 26;
  const H = 18;
  const d = new Draw(W, H);
  d.hall(0, 0, W - 1, H - 1);
  for (let x = 4; x + 1 <= W - 5; x += 5) for (const y of [4, H - 6]) for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) d.put(x + dx, y + dy, "O");
  for (let x = 6; x <= W - 7; x++) d.floor(x, H >> 1, -2), d.floor(x, (H >> 1) - 1, -2);
  sideDoors(d, ["W", "E", "N", "S"]);
  for (let x = 6; x < W - 3; x += 6) d.put(x, 2, "*");
  dressWalls(d, 5);
  add(d, { id: "pillar-hall", kind: "natatorium", set: "any", role: "hall", type: "natatorium", max: 8, weight: 3, note: "Two rows of round pillars, a shallow channel between." });
}
{
  // THE CISTERN: flooded waist to swim deep, a pillar grid, a cross of
  // walkways through it
  const S = 32;
  const d = new Draw(S, S);
  d.hall(0, 0, S - 1, S - 1, -4);
  const c = S >> 1;
  for (let k = 1; k < S - 1; k++) for (let q = -1; q <= 0; q++) d.floor(c + q, k, 0), d.floor(k, c + q, 0);
  pillarGrid(d, 3, 3, S - 4, S - 4, 6);
  d.door(c - 2, 0, "N");
  d.door(c - 2, S - 1, "S");
  d.door(0, c - 2, "W");
  d.door(S - 1, c - 2, "E");
  // the walkways widen to meet the doors
  for (const [x0, y0, x1, y1] of [[c - 2, 1, c + 1, 2], [c - 2, S - 3, c + 1, S - 2], [1, c - 2, 2, c + 1], [S - 3, c - 2, S - 2, c + 1]]) d.rect(x0, y0, x1, y1, (x, y) => d.floor(x, y, 0));
  for (const [x, y] of [[c - 6, c - 6], [c + 5, c - 6], [c - 6, c + 5], [c + 5, c + 5]]) if (d.f[y][x] === ".") d.put(x, y, "*");
  ladders(d, [[c - 3, 6], [c + 2, S - 7], [6, c + 2], [S - 7, c - 3]]);
  add(d, { id: "cistern", kind: "vaultsea", set: "any", role: "hall", type: "vaultsea", max: 6, weight: 2.5, note: "Flooded between pillars; two walkways cross it." });
}
{
  // a lido deck: three small pools sunk in one wide deck
  const W = 38;
  const H = 24;
  const d = new Draw(W, H);
  d.hall(0, 0, W - 1, H - 1);
  pool(d, 4, 5, 13, 18, -3, 2);
  pool(d, 16, 5, 23, 18, -4, 2);
  pool(d, 26, 5, 33, 18, -5, 2);
  sideDoors(d, ["W", "E", "N", "S"]);
  ladders(d, [[5, 6], [17, 17], [32, 6]]);
  for (const x of [9, 20, 30]) d.put(x, 2, "*");
  dressWalls(d, 5);
  add(d, { id: "lido-deck", kind: "natatorium", set: "any", role: "hall", type: "natatorium", max: 6, weight: 3, note: "Three pools of three depths in one deck." });
}
{
  // a skylit atrium: a round pool under the light, arches round it
  const S = 26;
  const c = (S - 1) / 2;
  const d = new Draw(S, S);
  d.hall(0, 0, S - 1, S - 1);
  for (let y = 1; y < S - 1; y++) for (let x = 1; x < S - 1; x++) {
    const r = Math.hypot(x - c, y - c);
    if (r < 7.5) d.floor(x, y, r < 3 ? -5 : r < 5 ? -4 : r < 6.5 ? -3 : -2);
  }
  for (let k = 0; k < 8; k++) {
    const a = (k * Math.PI) / 4;
    const x = Math.round(c + Math.cos(a) * 9.5) - 1;
    const y = Math.round(c + Math.sin(a) * 9.5) - 1;
    if ([0, 1].every((dy) => [0, 1].every((dx) => d.isOpen(x + dx, y + dy) && d.hz(x + dx, y + dy) === 0))) for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) d.put(x + dx, y + dy, "O");
  }
  d.put(Math.round(c), Math.round(c), "*");
  for (const [dx, dy] of [[-3, 0], [3, 0], [0, -3], [0, 3]]) d.put(Math.round(c) + dx, Math.round(c) + dy, "*");
  sideDoors(d, ["W", "E", "N", "S"]);
  ladders(d, [[Math.round(c) - 6, Math.round(c)], [Math.round(c) + 6, Math.round(c)]]);
  dressWalls(d, 6);
  add(d, { id: "atrium", kind: "natatorium", set: "any", role: "hall", type: "rotunda", max: 6, weight: 2.5, note: "A round pool under a skylight, pillars round it." });
}
{
  // a canal hall: a canal crosses it, two footbridges over
  const W = 32;
  const H = 22;
  const d = new Draw(W, H);
  d.hall(0, 0, W - 1, H - 1);
  const cy = H >> 1;
  for (let x = 1; x < W - 1; x++) for (let y = cy - 2; y <= cy + 2; y++) d.floor(x, y, Math.abs(y - cy) === 2 ? -2 : -4);
  for (const bx of [8, W - 10]) for (let x = bx; x <= bx + 2; x++) for (let y = cy - 2; y <= cy + 2; y++) {
    d.floor(x, y, 1);
    d.put(x, y, "B");
  }
  // landings at 0 either end of each bridge are the deck rows already
  d.door(0, 3, "W");
  d.door(W - 1, H - 6, "E");
  d.door((W >> 1) - 1, 0, "N");
  d.door((W >> 1) - 1, H - 1, "S");
  for (let x = 4; x < W - 3; x += 7) d.put(x, cy, d.f[cy][x] === "." ? "*" : d.f[cy][x]);
  dressWalls(d, 6);
  add(d, { id: "canal-hall", kind: "natatorium", set: "any", role: "hall", type: "shallows", max: 6, weight: 2.5, note: "A swimming canal across the hall, two footbridges over." });
}
{
  // sunken steps: a pool you walk down into, step by step
  const W = 28;
  const H = 20;
  const d = new Draw(W, H);
  d.hall(0, 0, W - 1, H - 1);
  for (let y = 3; y <= H - 4; y++) for (let x = 3; x <= W - 4; x++) {
    const e = Math.min(x - 3, W - 4 - x, y - 3, H - 4 - y);
    d.floor(x, y, -Math.min(5, e + 1));
  }
  sideDoors(d, ["W", "E", "N"]);
  d.put(W >> 1, H >> 1, "*");
  dressWalls(d, 5);
  add(d, { id: "sunken-steps", kind: "natatorium", set: "any", role: "hall", type: "shallows", max: 6, weight: 2, note: "Broad steps walk you down into a deep square pool." });
}

// ---- CORRIDORS ---------------------------------------------------------------------------
// 3-wide arched passages between the halls. A tunnel variant wades.

function corridor(L, wet) {
  const d = new Draw(5, L);
  for (let y = 0; y < L; y++) {
    d.wall(0, y);
    d.wall(4, y);
    for (let x = 1; x <= 3; x++) d.floor(x, y, wet && y > 1 && y < L - 2 ? (y === 2 || y === L - 3 ? -1 : -2) : 0, wet ? "t" : ".");
  }
  d.doors.push([1, 0, "N", 3], [1, L - 1, "S", 3]);
  return d;
}
{
  const d = corridor(12, false);
  d.put(1, 4, "o");
  d.put(3, 8, "o");
  d.put(2, 6, "*");
  add(d, { id: "passage", kind: "corridor", set: "any", role: "corridor", type: "tunnels", weight: 3, note: "A dry tiled passage." });
}
{
  const d = corridor(18, true);
  d.put(1, 5, "o");
  d.put(3, 9, "o");
  d.put(1, 13, "o");
  add(d, { id: "wading-tunnel", kind: "corridor", set: "any", role: "corridor", type: "tunnels", weight: 2, note: "A tunnel with ankle-deep water." });
}
{
  // a passage with an arched door in its side
  const d = corridor(14, false);
  d.floor(0, 6, 0);
  d.doors.push([0, 6, "W", 1]);
  d.put(1, 6, "*");
  d.put(3, 3, "o");
  d.put(3, 10, "o");
  add(d, { id: "passage-side", kind: "corridor", set: "any", role: "corridor", type: "tunnels", weight: 2, note: "A passage with a narrow side door." });
}
{
  // the bend
  const d = new Draw(9, 9);
  for (let y = 0; y < 9; y++) for (let x = 0; x < 9; x++) {
    const inN = x >= 1 && x <= 3 && y <= 7;
    const inE = y >= 5 && y <= 7 && x >= 1;
    if (inN || inE) d.floor(x, y, 0, ".");
  }
  d.encase();
  d.doors.push([1, 0, "N", 3], [8, 5, "E", 3]);
  d.put(2, 6, "*");
  add(d, { id: "passage-bend", kind: "corridor", set: "any", role: "corridor", type: "tunnels", weight: 2, note: "A corner." });
}
{
  // the wading corner: the tunnel turns, ankle-deep
  const d = new Draw(9, 9);
  for (let y = 0; y < 9; y++) for (let x = 0; x < 9; x++) {
    const inN = x >= 1 && x <= 3 && y <= 7;
    const inE = y >= 5 && y <= 7 && x >= 1;
    if (inN || inE) d.floor(x, y, y <= 1 || x >= 7 ? (y === 0 || x === 8 ? 0 : -1) : -2, "t");
  }
  d.encase();
  d.doors.push([1, 0, "N", 3], [8, 5, "E", 3]);
  d.put(1, 3, "o");
  add(d, { id: "wading-bend", kind: "corridor", set: "any", role: "corridor", type: "tunnels", weight: 1.5, note: "A tunnel corner, ankle-deep." });
}
{
  // the tee
  const d = new Draw(11, 9);
  for (let y = 0; y < 9; y++) for (let x = 0; x < 11; x++) {
    if ((y >= 1 && y <= 3) || (x >= 4 && x <= 6 && y >= 1)) d.floor(x, y, 0);
  }
  for (let x = 0; x < 11; x++) d.wall(x, 0);
  d.encase();
  for (const y of [1, 2, 3]) d.floor(0, y, 0), d.floor(10, y, 0);
  d.doors.push([0, 1, "W", 3], [10, 1, "E", 3], [4, 8, "S", 3]);
  d.put(5, 2, "*");
  add(d, { id: "passage-tee", kind: "corridor", set: "any", role: "corridor", type: "tunnels", weight: 2, note: "A junction of three passages." });
}
{
  // the crossing: four passages meet at a round well
  const d = new Draw(13, 13);
  for (let y = 0; y < 13; y++) for (let x = 0; x < 13; x++) {
    const r = Math.hypot(x - 6, y - 6);
    if (r < 4.6 || (x >= 5 && x <= 7) || (y >= 5 && y <= 7)) d.floor(x, y, r < 1.6 ? -4 : r < 2.8 ? -2 : 0);
  }
  d.encase();
  for (let k = 5; k <= 7; k++) {
    d.floor(k, 0, 0);
    d.floor(k, 12, 0);
    d.floor(0, k, 0);
    d.floor(12, k, 0);
  }
  d.doors.push([5, 0, "N", 3], [5, 12, "S", 3], [0, 5, "W", 3], [12, 5, "E", 3]);
  d.put(6, 6, "*");
  add(d, { id: "well-crossing", kind: "corridor", set: "any", role: "corridor", type: "tunnels", weight: 1.5, note: "Four passages meet round a small well." });
}

// ---- ROOMS ---------------------------------------------------------------------------------

{
  // a plunge pool room, entered by a narrow door
  const d = new Draw(11, 11);
  d.hall(0, 0, 10, 10, 0, "b");
  for (let y = 3; y <= 7; y++) for (let x = 3; x <= 7; x++) d.floor(x, y, Math.hypot(x - 5, y - 5) < 1.5 ? -4 : -3, "b");
  d.floor(5, 10, 0, "b");
  d.doors.push([5, 10, "S", 1]);
  d.put(1, 1, "b");
  d.face.push([1, 1, "N"]);
  d.put(9, 5, "o");
  d.put(5, 5, "*");
  add(d, { id: "plunge-pool", kind: "baths", set: "any", role: "room", type: "baths", max: 12, weight: 2, note: "A small room round a plunge pool." });
}
{
  // a changing room: benches in cubbies down both walls
  const d = new Draw(9, 13);
  d.hall(0, 0, 8, 12, 0, "b");
  for (let y = 2; y <= 10; y += 2) {
    d.put(1, y, "b");
    d.put(7, y, "b");
  }
  d.floor(4, 12, 0, "b");
  d.doors.push([4, 12, "S", 1]);
  d.put(4, 6, "*");
  add(d, { id: "changing-room", kind: "baths", set: "any", role: "room", type: "baths", max: 10, weight: 2, note: "Benches in cubbies down both walls." });
}
{
  // the steam room: a dry, low, round-cornered room with a wide door
  const d = new Draw(13, 11);
  d.hall(0, 0, 12, 10, 0, "b");
  for (let y = 2; y <= 8; y++) {
    d.floor(2, y, 1, "b");
    d.floor(10, y, 1, "b");
  }
  d.door(5, 10, "S");
  d.put(6, 5, "*");
  d.put(1, 1, "b");
  d.face.push([1, 1, "N"]);
  add(d, { id: "steam-room", kind: "baths", set: "any", role: "room", type: "baths", max: 8, weight: 1.5, note: "Raised benches either side, a wide door." });
}
{
  // the dead end: a short arched alcove that closes a passage
  const d = new Draw(5, 6);
  for (let y = 0; y < 5; y++) for (let x = 1; x <= 3; x++) d.floor(x, y, 0);
  d.encase();
  d.doors.push([1, 0, "N", 3]);
  d.put(2, 4, "o");
  d.face.push([2, 4, "S"]);
  add(d, { id: "alcove", kind: "corridor", set: "any", role: "cap", type: "tunnels", weight: 1, note: "An alcove: a passage's dead end." });
}

{
  // a pump room: dry, low, two pillars, a wide door
  const d = new Draw(13, 11);
  d.hall(0, 0, 12, 10, 0, "b");
  for (const [x, y] of [[3, 3], [8, 3]]) for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) d.put(x + dx, y + dy, "O");
  d.door(5, 10, "S");
  d.put(6, 2, "*");
  d.put(1, 7, "o");
  d.put(11, 7, "o");
  add(d, { id: "pump-room", kind: "baths", set: "any", role: "room", type: "baths", max: 8, weight: 1.5, note: "A dry room, two pillars, portholes." });
}
{
  // the showers: a wading floor, benches along the walls
  const d = new Draw(11, 13);
  d.hall(0, 0, 10, 12, 0, "b");
  for (let y = 3; y <= 9; y++) for (let x = 3; x <= 7; x++) d.floor(x, y, x === 3 || x === 7 || y === 3 || y === 9 ? -1 : -2, "b");
  d.door(4, 12, "S");
  for (const y of [2, 5, 8]) {
    d.put(1, y, "b");
    d.put(9, y, "b");
  }
  d.put(5, 6, "*");
  add(d, { id: "showers", kind: "baths", set: "any", role: "room", type: "baths", max: 8, weight: 1.5, note: "Ankle water in the middle, benches down the walls." });
}
{
  // the lifeguard's room: a raised seat at the window
  const d = new Draw(9, 9);
  d.hall(0, 0, 8, 8, 0, "b");
  d.floor(4, 2, 1, "b");
  d.door(3, 8, "S");
  d.put(1, 2, "o");
  d.put(7, 2, "o");
  d.put(4, 5, "*");
  add(d, { id: "lifeguard-room", kind: "baths", set: "any", role: "room", type: "baths", max: 6, weight: 1, note: "A small dry room, a raised seat." });
}

// ---- THE DOORS --------------------------------------------------------------------------------
// The four ways out. Each is a room with the exit frame standing in the
// middle of dry floor (the client builds a real doorframe there).

function doorRoom(W, H, sides, exit = true) {
  const d = new Draw(W, H);
  d.hall(0, 0, W - 1, H - 1);
  sideDoors(d, sides);
  const cx = W >> 1;
  const cy = H >> 1;
  if (exit) d.put(cx, cy, "D");
  return { d, cx, cy };
}
{
  const { d } = doorRoom(15, 15, ["S", "E", "W"]);
  for (const [x, y] of [[2, 2], [11, 2], [2, 11], [11, 11]]) for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) d.put(x + dx, y + dy, "O");
  d.put(7, 3, "*");
  add(d, { id: "door-landing", name: "The Landing", kind: "landing", set: "any", role: "door", type: "rotunda", min: 1, max: 1, note: "The Landing: the one way in and out — Level 0's passage arrives here." });
}
{
  const { d } = doorRoom(17, 13, ["W", "E"], false);
  for (let x = 2; x <= 14; x += 3) {
    d.put(x, 1, "b");
    d.put(x, 11, "b");
  }
  add(d, { id: "changing-rooms", name: "The Changing Rooms", kind: "changing", set: "any", role: "hall", type: "baths", min: 1, max: 1, note: "Benches down both walls (an exit on P3; one door per level since)." });
}
{
  const { d, cx, cy } = doorRoom(19, 17, ["N", "S"], false);
  // the filter beds: two long sunken troughs either side of the floor
  for (let y = 3; y <= 13; y++) for (const x of [2, 3, 15, 16]) d.floor(x, y, -3);
  pillarGrid(d, 5, 3, 13, 5, 7);
  pillarGrid(d, 5, 12, 13, 14, 7);
  void cx, cy;
  add(d, { id: "filtration-hall", name: "The Filtration Hall", kind: "filtration", set: "any", role: "hall", type: "natatorium", min: 1, max: 1, note: "Two long filter beds either side of the floor." });
}
{
  // THE HIGH DIVE: the exit stands on the deck; a diving pool beside it,
  // a platform at +6 to jump from
  const W = 25;
  const H = 19;
  const d = new Draw(W, H);
  d.hall(0, 0, W - 1, H - 1);
  for (let y = 2; y <= H - 3; y++) for (let x = 15; x <= W - 3; x++) d.floor(x, y, -6);
  // the platform: a +6 deck on the pool's west edge, reached by a ramp
  for (let y = 2; y <= 4; y++) for (let x = 9; x <= 14; x++) d.floor(x, y, 6);
  for (let k = 0; k < 6; k++) for (let x = 11; x <= 13; x++) d.floor(x, 10 - k, k + 1);
  // the ramp is walled from the deck and from the pool
  for (let y = 5; y <= 10; y++) d.wall(10, y), d.wall(14, y);
  for (let x = 9; x <= 10; x++) d.wall(x, 5);
  d.floor(11, 11, 0);
  d.floor(12, 11, 0);
  d.floor(13, 11, 0);
  d.door(0, 7, "W");
  d.door(10, H - 1, "S");
  ladders(d, [[15, 14], [W - 3, 8]]);
  d.put(19, 9, "*");
  add(d, { id: "high-dive", name: "The High Dive", kind: "highdive", set: "any", role: "hall", type: "natatorium", min: 1, max: 1, note: "A diving pool and a platform at +6 to jump from." });
}

// ---- check + write ------------------------------------------------------------------------------

let bad = 0;
for (const t of TILES) {
  const l = lintPoolTile(t);
  if (l.errors.length) {
    bad++;
    console.log(`✗ ${t.id}:`);
    for (const e of l.errors.slice(0, 8)) console.log(`    ${e}`);
  } else console.log(`✓ ${t.id}${l.warnings.length ? `  (${l.warnings.length} warning${l.warnings.length > 1 ? "s" : ""}: ${l.warnings[0]})` : ""}`);
}
if (bad) {
  console.log(`\n${bad} broken — nothing written.`);
  process.exit(1);
}
writeFileSync(path.join(ROOT, "src", "backrooms", "pools-rooms.json"), formatLibrary(TILES));
console.log(`\n${TILES.length} rooms written to src/backrooms/pools-rooms.json`);
