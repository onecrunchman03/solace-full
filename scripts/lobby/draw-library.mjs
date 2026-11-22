// LEVEL 0's FIRST ROOM LIBRARY — the drawing script that produced
// src/backrooms/lobby-rooms.json (Josh, 2026-09-27: "All three levels now";
// "only one door per level").
//
// ONE-TIME SCAFFOLDING, like scripts/pools/draw-library.mjs: the JSON is the
// source of truth from the moment it's written. Josh edits rooms in the map
// editor and a published design is pulled back with GET /api/admin/maps/0/export.
// Re-running this OVERWRITES the library.
//
// Level 0's rooms are procedural in their DRAWING, not in the map: a maze of
// drywall, rows of offices, a pillar field are tedious by hand and exact by
// arithmetic, so they are drawn here once, seeded, and then they are just rooms.
// Every room is a whole number of 10-cell modules, filled edge to edge, with a
// 2-wide doorway slot on every module side (lobby-vocab.ts) — the generator
// decides which slots open. Every room is linted as it is drawn.
//
//   npm run build && node scripts/lobby/draw-library.mjs

import { writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const require = createRequire(path.join(ROOT, "package.json"));
const { encodeH, formatLibrary } = require(path.join(ROOT, "dist", "backrooms", "tiles.js"));
const { lintLobbyTile } = require(path.join(ROOT, "dist", "backrooms", "lobby-tiles.js"));
const { MODULE: M, SLOT_AT, SLOT_W } = require(path.join(ROOT, "dist", "backrooms", "lobby-vocab.js"));

const lcg = (seed) => {
  let s = seed >>> 0 || 1;
  return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
};

// ---- a canvas: a full rectangle of floor --------------------------------------------

class Room {
  constructor(mw, mh) {
    this.w = mw * M;
    this.h = mh * M;
    this.m = Array.from({ length: this.h }, () => Array(this.w).fill("."));
    this.z = Array.from({ length: this.h }, () => Array(this.w).fill(0));
    this.f = Array.from({ length: this.h }, () => Array(this.w).fill("."));
    this.wn = Array.from({ length: this.h }, () => Array(this.w).fill(0)); // thin wall on N edge
    this.ww = Array.from({ length: this.h }, () => Array(this.w).fill(0)); // thin wall on W edge
    this.doors = [];
    this.face = [];
  }
  in(x, y) {
    return x >= 0 && y >= 0 && x < this.w && y < this.h;
  }
  /** Every module side gets its slot. */
  allSlots() {
    for (let x = SLOT_AT; x < this.w; x += M) this.doors.push([x, 0, "N", SLOT_W], [x, this.h - 1, "S", SLOT_W]);
    for (let y = SLOT_AT; y < this.h; y += M) this.doors.push([0, y, "W", SLOT_W], [this.w - 1, y, "E", SLOT_W]);
    return this;
  }
  /** Cells that must stay clear: every slot lane and the cell inside it. */
  keep() {
    const k = new Set();
    for (const [x, y, s, n] of this.doors) {
      const lx = s === "N" || s === "S" ? 1 : 0;
      for (let q = 0; q < n; q++) {
        const cx = x + lx * q;
        const cy = y + (1 - lx) * q;
        k.add(`${cx},${cy}`);
        const ix = cx + (s === "W" ? 1 : s === "E" ? -1 : 0);
        const iy = cy + (s === "N" ? 1 : s === "S" ? -1 : 0);
        k.add(`${ix},${iy}`);
      }
    }
    return k;
  }
  /** Can the edge between two neighbouring cells be crossed? */
  open(x, y, dx, dy) {
    const nx = x + dx;
    const ny = y + dy;
    if (!this.in(nx, ny) || this.m[y][x] === "#" || this.m[ny][nx] === "#") return false;
    if (Math.abs(this.z[y][x] - this.z[ny][nx]) > 1 && this.z[ny][nx] > -9 && this.z[y][x] > -9) return false;
    if (this.z[ny][nx] <= -9 || this.z[y][x] <= -9) return false;
    if (dy === -1) return !this.wn[y][x];
    if (dy === 1) return !this.wn[ny][nx];
    if (dx === -1) return !this.ww[y][x];
    return !this.ww[ny][nx];
  }
  /** Is every open, non-shaft cell reachable from the first slot? */
  connected() {
    const [sx, sy] = this.doors[0];
    const seen = new Set([`${sx},${sy}`]);
    const st = [[sx, sy]];
    while (st.length) {
      const [x, y] = st.pop();
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        if (!this.open(x, y, dx, dy)) continue;
        const k = `${x + dx},${y + dy}`;
        if (seen.has(k)) continue;
        seen.add(k);
        st.push([x + dx, y + dy]);
      }
    }
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) if (this.m[y][x] !== "#" && this.z[y][x] > -9 && !seen.has(`${x},${y}`)) return false;
    return true;
  }
  /** A straight thin wall along cell edges; undone if it would cut the room. */
  tryWall(x, y, horiz, len) {
    // the whole segment must fit before any of it is drawn
    for (let k = 0; k < len; k++) {
      const cx = horiz ? x + k : x;
      const cy = horiz ? y : y + k;
      if (!this.in(cx, cy) || (horiz ? cy === 0 : cx === 0)) return false;
    }
    const set = [];
    for (let k = 0; k < len; k++) {
      const cx = horiz ? x + k : x;
      const cy = horiz ? y : y + k;
      const arr = horiz ? this.wn : this.ww;
      if (arr[cy][cx]) continue;
      arr[cy][cx] = 1;
      set.push([arr, cx, cy]);
    }
    if (!set.length) return false;
    if (this.connected()) return true;
    for (const [arr, cx, cy] of set) arr[cy][cx] = 0;
    return false;
  }
  def(meta) {
    const rows = (fn) => Array.from({ length: this.h }, (_, y) => Array.from({ length: this.w }, (_, x) => fn(x, y)).join(""));
    const d = { ...meta, map: rows((x, y) => this.m[y][x]) };
    if (this.z.some((r) => r.some((v) => v !== 0))) d.height = rows((x, y) => encodeH(this.z[y][x]));
    if (this.wn.some((r) => r.some(Boolean)) || this.ww.some((r) => r.some(Boolean))) d.walls = rows((x, y) => (this.wn[y][x] && this.ww[y][x] ? "+" : this.wn[y][x] ? "-" : this.ww[y][x] ? "|" : "."));
    if (this.f.some((r) => r.some((v) => v !== "."))) d.furn = rows((x, y) => this.f[y][x]);
    if (this.face.length) d.face = this.face;
    d.doors = this.doors;
    return d;
  }
}

const TILES = [];
const add = (r, meta) => TILES.push(r.def(meta));
const zoneAll = (r, ch) => {
  for (let y = 0; y < r.h; y++) for (let x = 0; x < r.w; x++) if (r.m[y][x] === ".") r.m[y][x] = ch;
};

// ---- the interiors ----------------------------------------------------------------------

/** CLASSIC: an open yellow room broken by scattered partitions. */
function classic(mw, mh, seed, density = 1) {
  const r = new Room(mw, mh).allSlots();
  const rnd = lcg(seed);
  const n = Math.round(r.w * r.h * 0.05 * density);
  for (let k = 0; k < n; k++) {
    const horiz = rnd() < 0.5;
    r.tryWall(1 + Math.floor(rnd() * (r.w - 2)), 1 + Math.floor(rnd() * (r.h - 2)), horiz, 2 + Math.floor(rnd() * 5));
  }
  return r;
}

/** WARRENS: a drywall maze, a perfect one first, then some walls knocked out. */
function warrens(mw, mh, seed, loops = 0.12) {
  const r = new Room(mw, mh).allSlots();
  const rnd = lcg(seed);
  for (let y = 0; y < r.h; y++) for (let x = 0; x < r.w; x++) {
    if (y > 0) r.wn[y][x] = 1;
    if (x > 0) r.ww[y][x] = 1;
  }
  const seen = new Set(["0,0"]);
  const st = [[0, 0]];
  while (st.length) {
    const [x, y] = st[st.length - 1];
    const opts = [[1, 0], [-1, 0], [0, 1], [0, -1]].filter(([dx, dy]) => r.in(x + dx, y + dy) && !seen.has(`${x + dx},${y + dy}`));
    if (!opts.length) {
      st.pop();
      continue;
    }
    const [dx, dy] = opts[Math.floor(rnd() * opts.length)];
    const nx = x + dx;
    const ny = y + dy;
    if (dy === -1) r.wn[y][x] = 0;
    if (dy === 1) r.wn[ny][nx] = 0;
    if (dx === -1) r.ww[y][x] = 0;
    if (dx === 1) r.ww[ny][nx] = 0;
    seen.add(`${nx},${ny}`);
    st.push([nx, ny]);
  }
  for (let y = 0; y < r.h; y++) for (let x = 0; x < r.w; x++) {
    if (y > 0 && r.wn[y][x] && rnd() < loops) r.wn[y][x] = 0;
    if (x > 0 && r.ww[y][x] && rnd() < loops) r.ww[y][x] = 0;
  }
  // the slot lanes open into the maze: clear the wall between each lane pair
  for (const [x, y, s] of r.doors) {
    if (s === "N" || s === "S") r.ww[y][x + 1] = 0;
    else r.wn[y + 1][x] = 0;
  }
  zoneAll(r, "w");
  return r;
}

/** OFFICES: a corridor down each module row, small rooms either side. */
function offices(mw, mh, seed, zone = "o", roomW = 3) {
  const r = new Room(mw, mh).allSlots();
  const rnd = lcg(seed);
  for (let my = 0; my < mh; my++) {
    const y0 = my * M;
    // the corridor at rows 4-5; rooms above (0-3) and below (6-9)
    for (let x = 0; x < r.w; x++) {
      r.wn[y0 + 4][x] = 1;
      r.wn[y0 + 6][x] = 1;
    }
    // partitions every 3 or 4 cells, each room a door onto the corridor
    for (const [ya, yb, doorRow] of [[y0, y0 + 3, y0 + 4], [y0 + 6, y0 + 9, y0 + 6]]) {
      let x = 0;
      while (x < r.w) {
        const wdt = roomW + Math.floor(rnd() * 2);
        const x1 = Math.min(r.w, x + wdt);
        if (x1 < r.w) for (let y = ya; y <= yb; y++) r.ww[y][x1] = 1;
        const dx = x + Math.floor((x1 - x) / 2);
        r.wn[doorRow][dx] = 0;
        x = x1;
      }
    }
  }
  // module seams: keep the corridors joined across (no wall between modules
  // other than what the partitions drew) and make sure every slot connects
  for (const [x, y, s, n] of r.doors) {
    for (let q = 0; q < n; q++) {
      const cx = s === "N" || s === "S" ? x + q : x;
      const cy = s === "N" || s === "S" ? y : y + q;
      if (s === "N" || s === "S") r.ww[cy][cx] = q === 0 ? r.ww[cy][cx] : 0;
    }
  }
  if (!r.connected()) {
    // knock a door through every partition that sealed something (rare)
    for (let y = 1; y < r.h - 1 && !r.connected(); y++) for (let x = 1; x < r.w - 1 && !r.connected(); x++) if (r.ww[y][x] && rnd() < 0.5) r.ww[y][x] = 0;
  }
  zoneAll(r, zone);
  return r;
}

/** HALLS: long parallel runs along the room's long axis, broken now and then. */
function halls(mw, mh, seed) {
  const r = new Room(mw, mh).allSlots();
  const rnd = lcg(seed);
  const along = r.w >= r.h;
  const L = along ? r.w : r.h;
  const S = along ? r.h : r.w;
  for (let q = 3; q < S - 2; q += 3) {
    if (q % M === SLOT_AT || q % M === SLOT_AT + 1) continue;
    for (let p = 0; p < L; p++) {
      if (rnd() < 0.08) continue; // a gap
      const x = along ? p : q;
      const y = along ? q : p;
      if (along) r.wn[y][x] = 1;
      else r.ww[y][x] = 1;
    }
  }
  if (!r.connected()) for (let k = 0; k < 400 && !r.connected(); k++) {
    const x = Math.floor(rnd() * r.w);
    const y = Math.floor(rnd() * r.h);
    r.wn[y][x] = 0;
    r.ww[y][x] = 0;
  }
  zoneAll(r, "h");
  return r;
}

/** PILLARS: a field of square columns. */
function pillars(mw, mh, seed, pitch = 5) {
  const r = new Room(mw, mh).allSlots();
  const keep = r.keep();
  for (let y = 2; y < r.h - 1; y += pitch) for (let x = 2; x < r.w - 1; x += pitch) if (!keep.has(`${x},${y}`)) r.m[y][x] = "#";
  void seed;
  zoneAll(r, "p");
  return r;
}

/** TERRACES: a slow hill — one step every few cells toward the middle. */
function terraces(mw, mh, seed) {
  const r = new Room(mw, mh).allSlots();
  const rnd = lcg(seed);
  const band = 3 + Math.floor(rnd() * 2);
  for (let y = 0; y < r.h; y++) for (let x = 0; x < r.w; x++) {
    const e = Math.min(x, y, r.w - 1 - x, r.h - 1 - y);
    r.z[y][x] = Math.min(4, Math.floor(e / band));
  }
  zoneAll(r, "t");
  return r;
}

/** SUBLEVEL: the whole room sunk, walked down into by a ramp all round. */
function sublevel(mw, mh, seed) {
  const r = new Room(mw, mh).allSlots();
  const rnd = lcg(seed);
  const depth = 3 + Math.floor(rnd() * 2);
  for (let y = 0; y < r.h; y++) for (let x = 0; x < r.w; x++) {
    const e = Math.min(x, y, r.w - 1 - x, r.h - 1 - y);
    r.z[y][x] = -Math.min(depth, Math.max(0, e - 1));
  }
  // a few partitions down in the sunk floor
  for (let k = 0; k < r.w * r.h * 0.02; k++) r.tryWall(depth + 2 + Math.floor(rnd() * (r.w - 2 * depth - 4)), depth + 2 + Math.floor(rnd() * (r.h - 2 * depth - 4)), rnd() < 0.5, 2 + Math.floor(rnd() * 3));
  zoneAll(r, "s");
  return r;
}

/** ATRIUM: the grand void — a sunken bowl ringed by columns. */
function atrium(mw, mh, seed) {
  const r = new Room(mw, mh).allSlots();
  const keep = r.keep();
  const cx = (r.w - 1) / 2;
  const cy = (r.h - 1) / 2;
  const R = Math.min(r.w, r.h) / 2;
  for (let y = 0; y < r.h; y++) for (let x = 0; x < r.w; x++) {
    const d = Math.max(Math.abs(x - cx) / (r.w / 2), Math.abs(y - cy) / (r.h / 2)) * R;
    r.z[y][x] = -Math.max(0, Math.min(3, Math.floor(R - 3 - d)));
  }
  for (let y = 3; y < r.h - 3; y += 4) for (let x = 3; x < r.w - 3; x += 4) {
    const d = Math.max(Math.abs(x - cx) / (r.w / 2), Math.abs(y - cy) / (r.h / 2)) * R;
    if (Math.abs(d - (R - 3)) < 2 && !keep.has(`${x},${y}`) && r.z[y][x] === 0) r.m[y][x] = "#";
  }
  void seed;
  zoneAll(r, "a");
  return r;
}

// ---- the Sep 2026 rooms (Josh: "more variations in its rooms type and look") -----------

/** MANILA: the older rooms — tighter partitions and the odd closet. */
function manila(mw, mh, seed) {
  const r = classic(mw, mh, seed, 1.6);
  const rnd = lcg(seed * 7 + 3);
  const keep = r.keep();
  // closets: a 2×2 box of drywall with a one-cell gap, where it fits
  for (let k = 0; k < mw * mh * 2; k++) {
    const x = 1 + Math.floor(rnd() * (r.w - 4));
    const y = 1 + Math.floor(rnd() * (r.h - 4));
    let clear = true;
    for (let yy = y; yy < y + 3 && clear; yy++) for (let xx = x; xx < x + 3 && clear; xx++) if (keep.has(`${xx},${yy}`)) clear = false;
    if (!clear) continue;
    r.tryWall(x, y, true, 2);
    r.tryWall(x, y, false, 2);
    r.tryWall(x + 2, y, false, 1);
  }
  zoneAll(r, "m");
  return r;
}

/** RESTROOMS: rows of stalls down both long walls of every module, open in
 *  the middle. Tile walls and floor (the client's look). */
function restrooms(mw, mh, seed) {
  const r = new Room(mw, mh).allSlots();
  void seed;
  const keep = r.keep();
  for (let my = 0; my < mh; my++) {
    const y0 = my * M;
    for (const [top, front] of [[y0, y0 + 2], [y0 + 7, y0 + 7]]) {
      for (let x = 1; x < r.w - 1; x += 2) {
        // a stall: side partitions, a front with its door gap
        const cells = [];
        for (let yy = top; yy < top + 3; yy++) cells.push(`${x},${yy}`, `${x + 1},${yy}`);
        if (cells.some((c) => keep.has(c))) continue;
        for (let yy = top; yy < top + 3; yy++) r.ww[yy][x] = 1;
        const fy = front === top ? top + 3 : top;
        if (fy > 0 && fy < r.h) r.wn[fy][x] = 1; // half the front is the partition, the other half the door
      }
    }
  }
  if (!r.connected()) for (let y = 1; y < r.h && !r.connected(); y++) for (let x = 1; x < r.w; x++) { r.ww[y][x] = 0; if (r.connected()) break; }
  zoneAll(r, "r");
  return r;
}

/** STORAGE: a concrete hall, tall, with rows of piers down it. */
function storage(mw, mh, seed) {
  const r = new Room(mw, mh).allSlots();
  const keep = r.keep();
  const rnd = lcg(seed);
  const pitchX = 4;
  for (let y = 2; y < r.h - 2; y += 4) {
    for (let x = 2; x < r.w - 2; x += pitchX) {
      if (rnd() < 0.15) continue; // a missing pier
      for (const [xx, yy] of [[x, y], [x + 1, y]]) if (xx < r.w - 1 && !keep.has(`${xx},${yy}`)) r.m[yy][xx] = "#";
    }
  }
  zoneAll(r, "g");
  return r;
}

/** LIGHTS OUT: an ordinary room with the power gone — the client draws no
 *  lit panels. Laid out like the classic rooms, a little more broken up. */
function unlit(mw, mh, seed) {
  const r = classic(mw, mh, seed, 1.3);
  zoneAll(r, "k");
  return r;
}

/** CUBICLES: an office floor of open-fronted three-sided cubicles. */
function cubicles(mw, mh, seed) {
  const r = new Room(mw, mh).allSlots();
  const keep = r.keep();
  const rnd = lcg(seed);
  for (let y = 2; y < r.h - 2; y += 3) {
    for (let x = 2; x < r.w - 2; x += 3) {
      if (rnd() < 0.2) continue;
      if ([[x, y], [x + 1, y], [x, y + 1], [x + 1, y + 1]].some(([a, b]) => keep.has(`${a},${b}`))) continue;
      r.tryWall(x, y, true, 2);
      r.tryWall(x, y, false, 2);
      r.tryWall(x + 2, y, false, 2);
    }
  }
  zoneAll(r, "o");
  return r;
}

/** A SHAFT: a lethal hole in the floor of an otherwise ordinary room. */
function withShaft(r, sx, sy, n = 2) {
  for (let y = sy; y < sy + n; y++) for (let x = sx; x < sx + n; x++) {
    r.z[y][x] = -12;
    r.wn[y][x] = 0;
    r.ww[y][x] = 0;
    r.wn[y + 1] && (r.wn[y + 1][x] = 0);
    if (x + 1 < r.w) r.ww[y][x + 1] = 0;
  }
  return r;
}

// ---- the rooms ------------------------------------------------------------------------------

const SIZES = [[1, 1], [2, 1], [2, 2], [3, 2], [3, 3]];
let seed = 101;
const each = (name, fn, sizes, meta) => {
  sizes.forEach(([mw, mh], k) => {
    for (let v = 0; v < (meta.variants ?? 1); v++) {
      const r = fn(mw, mh, seed++);
      add(r, { id: `${name}-${mw}x${mh}${v ? `-${String.fromCharCode(97 + v)}` : ""}`, kind: name, set: "any", role: "block", type: meta.type, weight: meta.weight?.[k] ?? meta.w ?? 1, note: meta.note });
    }
  });
};

each("classic", classic, SIZES, { type: "classic", w: 3, variants: 2, note: "Open yellow rooms broken by partitions." });
each("warrens", warrens, [[1, 1], [2, 1], [2, 2], [3, 3]], { type: "warrens", w: 2, variants: 2, note: "A drywall maze, low ceiling." });
each("offices", offices, [[1, 1], [2, 1], [2, 2], [3, 2]], { type: "offices", w: 2, variants: 2, note: "Rows of small rooms off a corridor." });
each("halls", halls, [[2, 1], [3, 1], [3, 2], [1, 3]], { type: "halls", w: 2, variants: 1, note: "Long partitioned runs." });
each("pillars", pillars, [[1, 1], [2, 2], [3, 3]], { type: "pillars", w: 2, note: "A field of square columns." });
each("terraces", terraces, [[2, 2], [3, 2], [3, 3]], { type: "terraces", w: 1.5, note: "A slow hill, one step at a time." });
each("sublevel", sublevel, [[2, 2], [3, 3]], { type: "sublevel", w: 1.2, note: "The floor sunk low, walked down into." });
each("atrium", atrium, [[3, 3], [4, 4]], { type: "atrium", w: 0.8, note: "The grand void: a sunken bowl ringed by columns." });
each("manila", manila, [[1, 1], [2, 1], [2, 2], [3, 2]], { type: "manila", w: 2, variants: 2, note: "The older rooms: darker paper, stained carpet, half the lights out." });
each("restrooms", restrooms, [[1, 1], [2, 1], [2, 2]], { type: "restrooms", w: 1.5, note: "Rows of stalls. Tile everywhere." });
each("panelled", (mw, mh, sd) => offices(mw, mh, sd, "e", 4), [[1, 1], [2, 1], [2, 2], [3, 2]], { type: "panelled", w: 1.5, variants: 2, note: "The executive floor: wood panelling, green carpet, bigger offices." });
each("storage", storage, [[2, 1], [2, 2], [3, 3]], { type: "storage", w: 1.5, note: "A tall concrete hall of piers." });
each("unlit", unlit, [[1, 1], [2, 1], [2, 2], [3, 2]], { type: "unlit", w: 1.5, note: "The power's out in here." });
each("cubicles", cubicles, [[1, 1], [2, 1], [2, 2]], { type: "offices", w: 1.5, variants: 2, note: "An open floor of cubicles." });

// shafts: a few rooms with a lethal hole
{
  const r = withShaft(classic(1, 1, 901, 0.6), 1, 6, 2);
  add(r, { id: "shaft-room", kind: "shaft", set: "any", role: "block", type: "classic", weight: 0.8, max: 8, note: "A room with a lethal shaft in its floor." });
  const r2 = withShaft(pillars(2, 2, 902), 8, 8, 3);
  add(r2, { id: "shaft-pillars", kind: "shaft", set: "any", role: "block", type: "pillars", weight: 0.6, max: 5, note: "A pillar field around a deep shaft." });
}

// ---- THE LANDMARKS: the named set pieces (the key waits in one of them) -----------------------

{
  // THE RED DOOR: a small walled room inside a module, one way into it
  const r = new Room(1, 1).allSlots();
  for (let x = 2; x <= 7; x++) (r.wn[2][x] = 1), (r.wn[8][x] = 1);
  for (let y = 2; y <= 7; y++) (r.ww[y][2] = 1), (r.ww[y][8] = 1);
  r.wn[8][5] = 0;
  zoneAll(r, "c");
  add(r, { id: "the-red-door", name: "The Red Door", kind: "landmark", set: "any", role: "landmark", type: "classic", min: 1, max: 1, note: "A small room with one way in. It doesn't open. Yet." });
}
{
  const r = new Room(2, 2).allSlots();
  const keep = r.keep();
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    const x = Math.round(9.5 + Math.cos(a) * 6);
    const y = Math.round(9.5 + Math.sin(a) * 6);
    if (!keep.has(`${x},${y}`)) r.m[y][x] = "#";
  }
  zoneAll(r, "p");
  add(r, { id: "pillar-garden", name: "Pillar Garden", kind: "landmark", set: "any", role: "landmark", type: "pillars", min: 1, max: 1, note: "A ring of columns round a bare middle." });
}
{
  const r = new Room(2, 1).allSlots();
  for (let x = 3; x <= 16; x++) r.m[5][x] = "#";
  zoneAll(r, "c");
  add(r, { id: "the-long-table", name: "The Long Table", kind: "landmark", set: "any", role: "landmark", type: "classic", min: 1, max: 1, note: "One table the length of the room." });
}
{
  const r = new Room(1, 1).allSlots();
  for (let y = 0; y < 10; y++) for (let x = 0; x < 10; x++) {
    const e = Math.min(x, y, 9 - x, 9 - y);
    r.z[y][x] = e >= 2 ? -1 : 0;
  }
  for (const [x, y] of [[1, 1], [8, 1], [1, 8], [8, 8]]) r.m[y][x] = "#";
  zoneAll(r, "c");
  add(r, { id: "the-basin", name: "The Basin", kind: "landmark", set: "any", role: "landmark", type: "classic", min: 1, max: 1, note: "A sunken square with posts at its corners." });
}
{
  const r = new Room(2, 1).allSlots();
  for (let x = 2; x < 18; x += 3) {
    if (x === 4 || x === 5 || x === 14 || x === 15) continue;
    for (const y of [1, 2, 7, 8]) r.ww[y][x] = 1;
  }
  zoneAll(r, "o");
  add(r, { id: "static-row", name: "Static Row", kind: "landmark", set: "any", role: "landmark", type: "offices", min: 1, max: 1, note: "Cubicle teeth down both long sides." });
}
{
  const r = new Room(1, 1).allSlots();
  for (let x = 0; x < 7; x++) r.wn[3][x] = 1;
  for (let x = 3; x < 10; x++) r.wn[7][x] = 1;
  r.wn[3][4] = 0;
  r.wn[3][5] = 0;
  r.wn[7][4] = 0;
  r.wn[7][5] = 0;
  zoneAll(r, "c");
  add(r, { id: "the-switchback", name: "The Switchback", kind: "landmark", set: "any", role: "landmark", type: "classic", min: 1, max: 1, note: "A serpentine of baffle walls." });
}
{
  const r = new Room(2, 2).allSlots();
  zoneAll(r, "c");
  add(r, { id: "the-hollow", name: "The Hollow", kind: "landmark", set: "any", role: "landmark", type: "classic", min: 1, max: 1, note: "A vast empty room. That's the landmark. (The hum stops here.)" });
}
{
  const r = new Room(2, 2).allSlots();
  const keep = r.keep();
  for (let y = 2; y < 19; y += 3) for (let x = 2; x < 19; x += 3) if (!keep.has(`${x},${y}`)) r.m[y][x] = "#";
  zoneAll(r, "p");
  add(r, { id: "court-of-columns", name: "Court of Columns", kind: "landmark", set: "any", role: "landmark", type: "pillars", min: 1, max: 1, note: "A tight grid of columns." });
}

{
  // THE WASHROOM: one great tiled room, a basin sunk in its floor
  const r = new Room(2, 2).allSlots();
  for (let y = 7; y <= 12; y++) for (let x = 7; x <= 12; x++) r.z[y][x] = -1;
  for (const [x, y] of [[6, 6], [13, 6], [6, 13], [13, 13]]) r.m[y][x] = "#";
  zoneAll(r, "r");
  add(r, { id: "the-washroom", name: "The Washroom", kind: "landmark", set: "any", role: "landmark", type: "restrooms", min: 1, max: 1, note: "One vast tiled room with a basin sunk in the middle." });
}
{
  // THE BOARDROOM: a panelled room round one long table
  const r = new Room(2, 1).allSlots();
  for (let x = 4; x <= 15; x++) (r.m[4][x] = "#"), (r.m[5][x] = "#");
  zoneAll(r, "e");
  add(r, { id: "the-boardroom", name: "The Boardroom", kind: "landmark", set: "any", role: "landmark", type: "panelled", min: 1, max: 1, note: "A long table nobody sits at." });
}

// ---- THE ENTRANCE: the one way in and out -------------------------------------------------------

{
  const r = new Room(2, 1).allSlots();
  // the door is marked on the room's north wall; you arrive two cells in
  r.f[0][2] = "D";
  r.face.push([2, 0, "N"]);
  for (let x = 10; x < 13; x++) r.wn[5][x] = 1;
  zoneAll(r, "c");
  add(r, { id: "the-entrance", name: "The Entrance", kind: "entrance", set: "any", role: "start", type: "classic", min: 1, max: 1, note: "The one way in and out of Level 0. Its north wall faces the edge of the map." });
}

// ---- check + write ------------------------------------------------------------------------------

let bad = 0;
for (const t of TILES) {
  const l = lintLobbyTile(t);
  if (l.errors.length) {
    bad++;
    console.log(`✗ ${t.id}:`);
    for (const e of l.errors.slice(0, 6)) console.log(`    ${e}`);
  }
}
if (bad) {
  console.log(`\n${bad} broken — nothing written.`);
  process.exit(1);
}
writeFileSync(path.join(ROOT, "src", "backrooms", "lobby-rooms.json"), formatLibrary(TILES));
console.log(`${TILES.length} rooms written to src/backrooms/lobby-rooms.json`);
