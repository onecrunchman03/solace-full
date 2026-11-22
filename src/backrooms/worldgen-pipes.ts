// PIPE DREAMS — Level 2, BUILT FROM HAND-MADE ROOMS (v3, sector D3).
//
// Josh, 2026-09-27, after D2: "is there a map generator software out that is
// best in class that you can mimic … i feel like you dont have the knowledge
// or the proper tool set for realistic map generation." → "yeah lets go with
// your reccomendation."
//
// D1 was Level 0's generator in a concrete coat; D2 was a plan written as
// rules — rectangles, a program, recipes that furnished them. Both invented
// every room in code, and a room written by a rule can only ever be as good as
// the rule. The procedural games whose levels read as DESIGNED don't do that:
// a person draws the rooms, and the generator only decides how they connect.
// This is that model — DunGen's, the Unity generator Lethal Company's facility
// is built with:
//
//   1. THE LIBRARY. Every piece of the level — a gallery run, a junction, a
//      stairwell, a locker room, the turbine hall — is drawn by hand in
//      pipes-rooms.json (see pipes-tiles.ts for the format, and the room
//      editor: Admin Panel → Map editor). Nothing in this file draws a room.
//   2. THE MAIN PATH. From the drain to the pressure door, one route of
//      gallery pieces and halls, grown socket to socket and steered across the
//      map. It is cut into stretches (intake → staff → plant → machinery →
//      the valve gallery), each drawing its pieces from its own set, and it
//      goes DOWN a stairwell between them: three decks, the drain on the top
//      one and the door on the bottom. The set pieces a plant needs — a pump
//      station, the turbine hall, the boiler house, the stores, the machine
//      shop — are placed ON the route, so nobody reaches the door without
//      walking through them.
//   3. BRANCHES. Every doorway the route leaves open grows more: side
//      galleries, staff corridors, service tunnels, and at the ends of them the
//      rooms, each chosen from the stretch it hangs off. A placement that would
//      line a spare doorway up with somebody else's is preferred, and where two
//      doorways meet exactly they are opened — that is where the loops come
//      from.
//   4. SAFETY. Anywhere too far from a lit room gets one: a safe tile is hung
//      on the nearest spare doorway until nowhere is more than MAX_TO_SAFE
//      steps from a light.
//   5. LOOSE ENDS. A spare doorway that opens onto rock becomes a locked prop
//      door; a spare gallery end gets a hand-made dead end if one fits.
//
// CONNECTED BY CONSTRUCTION: a piece is only ever placed through a doorway of
// something already reachable, and every tile is checked (lintTile) to be one
// connected piece from its doors. The reach check at the end must find
// nothing to seal — the harness requires it.
//
// Walls are DERIVED: every (tile, room) is a space, and an edge between two
// spaces is a wall unless it is a joined doorway or an inner door.

import { StyleTable } from "./surfaces";
import { LID_NONE } from "./ceiling";
import { StairTable, STAIR_NONE } from "./stairs";
import { copyRoll } from "./marks";
import {
  type Sector,
  type District,
  type DistrictType,
  type Door,
  idx,
  rngFor,
  distanceMap,
  validateSector,
  sectorFingerprint,
  type SectorReport,
} from "./worldgen";
import { type PipeType, BAND, PIT_SINK, PDECO, pdecoByte, MACHINES, TANKS, WALL_A, WALL_B, FREE, SAFE_TYPES, PIPE_TYPES, HALL_TYPES } from "./pipes-vocab";

/** A sector's type, read as one of Level 2's (they are a subset). */
const pt = (t: DistrictType): PipeType => t as PipeType;
import { type TileDef, type Tile, type Side, type TileSet, type Lint, lintTile, tileVariants, DX, DY, opp } from "./pipes-tiles";
import { pieceModels } from "./pipes-models";
import LIBRARY_JSON from "./pipes-rooms.json";
import { seatWallProps } from "./kitseat";

export { BAND, PIT_SINK, PDECO, pdecoByte, MACHINES, TANKS, WALL_A, WALL_B, FREE, SAFE_TYPES, PIPE_TYPES };

// ---- The frozen Level 2 sector -------------------------------------------------
export const SECTOR_D = Object.freeze({ id: "D3", seed: 20260928, size: 256 });
/** Set when the sector is frozen (boot verifies it; a mismatch keeps Level 2 shut). */
export const SECTOR_D_FINGERPRINT = "sha256:92cfbae8da30f2727e93a463dabe26367e8fce761dfc09519ca4b6cc340b938f";

/** The library as shipped. */
export const PIPE_LIBRARY: readonly TileDef[] = (LIBRARY_JSON as unknown as { tiles: TileDef[] }).tiles;

/** The stretches of the descent, in walking order. */
export const SECTIONS: readonly TileSet[] = ["intake", "staff", "plant", "machinery", "vault"];
/** Floors a doorway may sit on: the three decks. */
const DECKS = [0, BAND, 2 * BAND];
/** Nowhere may be further than this (in steps) from a lit room. */
export const MAX_TO_SAFE = 120;
/** Stop growing branches once this share of the map is built. */
const FILL = 0.4;

// ---- The library, parsed ----------------------------------------------------------

export interface LibEntry {
  def: TileDef;
  base: Tile;
  variants: Tile[];
  lint: Lint;
  sets: TileSet[];
  safe: boolean;
  area: number;
}

/** Parse and check a library. Throws on the first broken tile unless `lax`
 *  (the editor wants the list either way). */
export function loadLibrary(defs: readonly TileDef[] = PIPE_LIBRARY, lax = false): LibEntry[] {
  const out: LibEntry[] = [];
  const ids = new Set<string>();
  for (const def of defs) {
    const l = lintTile(def);
    if (ids.has(def.id)) l.errors.push(`duplicate id "${def.id}"`);
    ids.add(def.id);
    if (l.errors.length && !lax) throw new Error(`pipes: tile "${def.id}" is broken — ${l.errors[0]}`);
    let area = 0;
    for (const c of l.tile.cell) if (c) area++;
    let safeCells = 0;
    for (let i = 0; i < l.tile.cell.length; i++) if (l.tile.cell[i] === 1 && SAFE_TYPES.has(PIPE_TYPES[l.tile.zone[i]])) safeCells++;
    out.push({
      def,
      base: l.tile,
      variants: l.errors.length ? [] : tileVariants(l.tile),
      lint: { errors: l.errors, warnings: l.warnings },
      sets: (Array.isArray(def.set) ? def.set : [def.set]) as TileSet[],
      safe: safeCells > 0,
      area,
    });
  }
  return out;
}

// ---- Plan types ----------------------------------------------------------------------

export interface PipeInst {
  id: number;
  tileId: string;
  role: TileDef["role"];
  name: string | null;
  x: number;
  y: number;
  w: number;
  h: number;
  /** Datum: the tile's floor 0 sits at this many steps. */
  z: number;
  section: TileSet;
  /** On the route from the drain to the door. */
  main: boolean;
  /** Tiles from the route (0 on it). */
  depth: number;
  /** Per socket: the instance it joins, or -1. */
  joined: number[];
}

export interface PipeRoom {
  id: number;
  inst: number;
  kind: string;
  type: DistrictType;
  safe: boolean;
  /** Bounding box. */
  x: number;
  y: number;
  w: number;
  h: number;
  doors: { x: number; y: number; side: Side; width: number }[];
}

export interface PipesPlan {
  sector: Sector;
  insts: PipeInst[];
  rooms: PipeRoom[];
  /** Space id per cell (0 = rock), rooms[id-1]. */
  space: Int32Array;
  /** Instance ids along the route, drain first. */
  mainPath: number[];
  /** Doorways opened where two spare sockets met, plus the chains the
   *  linker built between far-apart parts of the level. */
  loops: number;
  /** Of those, the chains built (cross-streets and short links). */
  links: number;
  /** Of those, the cross-streets between the route's passes. */
  crossStreets: number;
  /** Safe tiles the safety pass had to add. */
  safeAdded: number;
  /** Open cells the reach check had to turn to rock — MUST be 0. */
  lostCells: number;
  /** Main-path attempts before one got through. */
  attempts: number;
}

// ---- The builder ----------------------------------------------------------------------

interface Cand {
  e: LibEntry;
  t: Tile;
  k: number;
  x: number;
  y: number;
  z: number;
  score: number;
}

class Gen {
  readonly size: number;
  /** Instance id + 1 per cell (0 = rock). */
  readonly occ: Int32Array;
  /** Cells that must stay rock (behind a door prop). */
  readonly rock: Uint8Array;
  readonly insts: PipeInst[] = [];
  readonly tiles: Tile[] = [];
  readonly entry: LibEntry[] = [];
  readonly count = new Map<string, number>();
  readonly dead: boolean[] = [];
  area = 0;

  constructor(size: number) {
    this.size = size;
    this.occ = new Int32Array(size * size);
    this.rock = new Uint8Array(size * size);
  }

  inb(x: number, y: number): boolean {
    return x >= 2 && y >= 2 && x < this.size - 2 && y < this.size - 2;
  }

  /** A socket in world terms: its first lane, side, width, floor. */
  sock(id: number, k: number): { x: number; y: number; side: Side; w: number; z: number } {
    const inst = this.insts[id];
    const s = this.tiles[id].sockets[k];
    return { x: inst.x + s.x, y: inst.y + s.y, side: s.side, w: s.w, z: inst.z + s.z };
  }

  fits(t: Tile, ox: number, oy: number, z: number): boolean {
    for (const s of t.sockets) if (!DECKS.includes(z + s.z)) return false;
    for (let y = 0; y < t.h; y++) {
      for (let x = 0; x < t.w; x++) {
        if (!t.cell[y * t.w + x]) continue;
        const gx = ox + x;
        const gy = oy + y;
        if (!this.inb(gx, gy)) return false;
        const g = gy * this.size + gx;
        if (this.occ[g] || this.rock[g]) return false;
        const f = z + t.hgt[y * t.w + x];
        if (f < -PIT_SINK || f > 2 * BAND) return false;
      }
    }
    for (const [rx, ry] of t.reserve) {
      const gx = ox + rx;
      const gy = oy + ry;
      if (gx < 0 || gy < 0 || gx >= this.size || gy >= this.size) continue;
      if (this.occ[gy * this.size + gx]) return false;
    }
    return true;
  }

  place(e: LibEntry, t: Tile, ox: number, oy: number, z: number, section: TileSet, main: boolean, depth: number): PipeInst {
    const id = this.insts.length;
    const inst: PipeInst = {
      id,
      tileId: e.def.id,
      role: e.def.role,
      name: e.def.name ?? null,
      x: ox,
      y: oy,
      w: t.w,
      h: t.h,
      z,
      section,
      main,
      depth,
      joined: t.sockets.map(() => -1),
    };
    this.insts.push(inst);
    this.tiles.push(t);
    this.entry.push(e);
    this.dead.push(false);
    for (let y = 0; y < t.h; y++) {
      for (let x = 0; x < t.w; x++) {
        if (!t.cell[y * t.w + x]) continue;
        this.occ[(oy + y) * this.size + ox + x] = id + 1;
        this.area++;
      }
    }
    for (const [rx, ry] of t.reserve) {
      const gx = ox + rx;
      const gy = oy + ry;
      if (gx >= 0 && gy >= 0 && gx < this.size && gy < this.size) this.rock[gy * this.size + gx] = 1;
    }
    this.count.set(e.def.id, (this.count.get(e.def.id) ?? 0) + 1);
    return inst;
  }

  /** Take an instance back out (the prune). Its id stays, marked dead;
   *  compact() renumbers once the building is done. */
  remove(id: number): void {
    const inst = this.insts[id];
    const t = this.tiles[id];
    this.dead[id] = true;
    for (let y = 0; y < t.h; y++) {
      for (let x = 0; x < t.w; x++) {
        if (!t.cell[y * t.w + x]) continue;
        this.occ[(inst.y + y) * this.size + inst.x + x] = 0;
        this.area--;
      }
    }
    for (const j of inst.joined) if (j >= 0) this.insts[j].joined = this.insts[j].joined.map((q) => (q === id ? -1 : q));
    inst.joined = inst.joined.map(() => -1);
    this.count.set(inst.tileId, (this.count.get(inst.tileId) ?? 1) - 1);
    // re-derive the rock reservations still owed (two can share a cell)
    this.rock.fill(0);
    for (let j = 0; j < this.insts.length; j++) {
      if (this.dead[j]) continue;
      for (const [rx, ry] of this.tiles[j].reserve) {
        const gx = this.insts[j].x + rx;
        const gy = this.insts[j].y + ry;
        if (gx >= 0 && gy >= 0 && gx < this.size && gy < this.size) this.rock[gy * this.size + gx] = 1;
      }
    }
  }

  live(): PipeInst[] {
    return this.insts.filter((i) => !this.dead[i.id]);
  }

  /** Drop the dead and renumber. Returns old id → new id. */
  compact(): Map<number, number> {
    const map = new Map<number, number>();
    const insts: PipeInst[] = [];
    const tiles: Tile[] = [];
    const entry: LibEntry[] = [];
    this.insts.forEach((inst, k) => {
      if (this.dead[k]) return;
      map.set(k, insts.length);
      insts.push(inst);
      tiles.push(this.tiles[k]);
      entry.push(this.entry[k]);
    });
    for (const inst of insts) {
      inst.id = map.get(inst.id)!;
      inst.joined = inst.joined.map((j) => (j >= 0 ? (map.get(j) ?? -1) : -1));
    }
    this.insts.splice(0, this.insts.length, ...insts);
    this.tiles.splice(0, this.tiles.length, ...tiles);
    this.entry.splice(0, this.entry.length, ...entry);
    this.dead.splice(0, this.dead.length, ...insts.map(() => false));
    this.occ.fill(0);
    for (const inst of insts) {
      const t = tiles[inst.id];
      for (let y = 0; y < t.h; y++) for (let x = 0; x < t.w; x++) if (t.cell[y * t.w + x]) this.occ[(inst.y + y) * this.size + inst.x + x] = inst.id + 1;
    }
    return map;
  }

  /** Every way `pool` can hang off socket k of instance id. */
  candidates(id: number, k: number, pool: LibEntry[], filter?: (c: Cand) => boolean, ignoreMax = false): Cand[] {
    const P = this.sock(id, k);
    const out: Cand[] = [];
    const want = opp(P.side);
    for (const e of pool) {
      if (!ignoreMax && e.def.max !== undefined && (this.count.get(e.def.id) ?? 0) >= e.def.max) continue;
      for (const t of e.variants) {
        for (let j = 0; j < t.sockets.length; j++) {
          const s = t.sockets[j];
          if (s.side !== want || s.w !== P.w) continue;
          const ox = P.x + DX[P.side] - s.x;
          const oy = P.y + DY[P.side] - s.y;
          const z = P.z - s.z;
          if (!this.fits(t, ox, oy, z)) continue;
          const c: Cand = { e, t, k: j, x: ox, y: oy, z, score: 0 };
          if (filter && !filter(c)) continue;
          out.push(c);
        }
      }
    }
    return out;
  }

  /** Place a candidate on socket k of instance id and join them. */
  attach(id: number, k: number, c: Cand, section: TileSet, main: boolean, depth: number): PipeInst {
    const inst = this.place(c.e, c.t, c.x, c.y, c.z, section, main, depth);
    inst.joined[c.k] = id;
    this.insts[id].joined[k] = inst.id;
    return inst;
  }

  /** How many of a candidate's other sockets would line up exactly with a
   *  spare socket already in the world (a loop waiting to close). */
  aligned(c: Cand): number {
    let n = 0;
    for (let j = 0; j < c.t.sockets.length; j++) {
      if (j === c.k) continue;
      const s = c.t.sockets[j];
      const gx = c.x + s.x + DX[s.side];
      const gy = c.y + s.y + DY[s.side];
      if (gx < 0 || gy < 0 || gx >= this.size || gy >= this.size) continue;
      const o = this.occ[gy * this.size + gx] - 1;
      if (o < 0) continue;
      const ot = this.tiles[o];
      for (let q = 0; q < ot.sockets.length; q++) {
        if (this.insts[o].joined[q] >= 0) continue;
        const os = this.sock(o, q);
        if (os.side === opp(s.side) && os.w === s.w && os.x === gx && os.y === gy && Math.abs(os.z - (c.z + s.z)) <= 1) n++;
      }
    }
    return n;
  }
}

// ---- The generator ------------------------------------------------------------------

const pick = <T>(rnd: () => number, list: T[]): T => list[Math.floor(rnd() * list.length)];
function shuffle<T>(rnd: () => number, list: T[]): T[] {
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list;
}

/** The line the route follows: three passes across the map, from a corner
 *  the seed picks, running along x or along y. */
function serpentine(seed: number, size: number): { pts: { x: number; y: number }[]; project: (x: number, y: number) => number; at: (s: number) => { x: number; y: number } } {
  const r = rngFor(seed, "pd3:corner");
  const flipA = r() < 0.5;
  const flipB = r() < 0.5;
  const alongX = r() < 0.5;
  const lo = 50;
  const hi = size - 50;
  const rowsAt = [lo, size / 2, hi];
  const raw: [number, number][] = [];
  rowsAt.forEach((v, k) => {
    const a = k % 2 === 0 ? [lo, hi] : [hi, lo];
    raw.push([a[0], v], [a[1], v]);
  });
  const pts = raw.map(([u, v]) => {
    const U = flipA ? size - u : u;
    const V = flipB ? size - v : v;
    return alongX ? { x: U, y: V } : { x: V, y: U };
  });
  const segs = pts.slice(1).map((b, k) => ({ a: pts[k], b, len: Math.hypot(b.x - pts[k].x, b.y - pts[k].y) }));
  const total = segs.reduce((q, sg) => q + sg.len, 0);
  const at = (sIn: number): { x: number; y: number } => {
    let rest = Math.max(0, Math.min(total, sIn));
    for (const sg of segs) {
      if (rest <= sg.len) return { x: sg.a.x + ((sg.b.x - sg.a.x) * rest) / sg.len, y: sg.a.y + ((sg.b.y - sg.a.y) * rest) / sg.len };
      rest -= sg.len;
    }
    return pts[pts.length - 1];
  };
  const project = (x: number, y: number): number => {
    let best = Infinity;
    let bestS = 0;
    let acc = 0;
    for (const sg of segs) {
      const dx = sg.b.x - sg.a.x;
      const dy = sg.b.y - sg.a.y;
      const t = Math.max(0, Math.min(1, ((x - sg.a.x) * dx + (y - sg.a.y) * dy) / (sg.len * sg.len)));
      const d = Math.hypot(sg.a.x + dx * t - x, sg.a.y + dy * t - y);
      if (d < best) {
        best = d;
        bestS = acc + t * sg.len;
      }
      acc += sg.len;
    }
    return bestS;
  };
  return { pts, project, at };
}

/** One step of the route: a stretch, or a named piece that must stand on it. */
interface Slot {
  section: TileSet;
  kind: "run" | "node" | "stair" | "piece" | "goal";
  tile?: string;
}

function routeSchedule(lib: LibEntry[], rnd: () => number): Slot[] {
  const slots: Slot[] = [];
  const pieces = (sec: TileSet): string[] =>
    shuffle(
      rnd,
      lib.filter((e) => e.def.role === "hall" && e.def.min && e.sets.includes(sec)).flatMap((e) => Array.from({ length: e.def.min ?? 0 }, () => e.def.id)),
    );
  const stretch = (sec: TileSet, runs: number): void => {
    const req = pieces(sec);
    const total = runs + req.length;
    // spread the set pieces through the stretch, never first
    const at = new Set<number>();
    for (let k = 0; k < req.length; k++) at.add(1 + Math.floor(((k + 0.5) * (total - 1)) / req.length));
    let r = 0;
    for (let k = 0; k < total; k++) {
      if (at.has(k) && r < req.length) slots.push({ section: sec, kind: "piece", tile: req[r++] });
      // every third step is a junction: the side exits the cross-streets leave by
      else slots.push({ section: sec, kind: k % 3 === 2 ? "node" : "run" });
    }
    while (r < req.length) slots.push({ section: sec, kind: "piece", tile: req[r++] });
  };
  stretch("intake", 6);
  stretch("staff", 13);
  slots.push({ section: "plant", kind: "stair" });
  stretch("plant", 15);
  slots.push({ section: "machinery", kind: "stair" });
  stretch("machinery", 12);
  slots.push({ section: "vault", kind: "goal" });
  return slots;
}

export function planPipesSector(seed: number = SECTOR_D.seed, size: number = SECTOR_D.size, library: readonly TileDef[] = PIPE_LIBRARY): PipesPlan {
  const lib = loadLibrary(library);
  const inSet = (e: LibEntry, sec: TileSet): boolean => e.sets.includes(sec) || e.sets.includes("any");
  const start = lib.filter((e) => e.def.role === "start");
  const goal = lib.filter((e) => e.def.role === "goal");
  if (!start.length || !goal.length) throw new Error("pipes: the library needs a start tile and a goal tile");

  let g: Gen | null = null;
  let mainPath: number[] = [];
  let attempts = 0;
  // ---- THE ROUTE (restarted whole on a dead end — cheap, and deterministic)
  for (let attempt = 0; attempt < 60 && !g; attempt++) {
    attempts = attempt + 1;
    const rnd = rngFor(seed, `pd3:route:${attempt}`);
    const G = new Gen(size);
    // THE ROUTE SNAKES: three passes across the map, turning at each end, so
    // the whole map is walked and the branches off it fill the whole map.
    // It follows a carrot a fixed distance ahead along that line (pure
    // pursuit), with enough noise to wander off it and back.
    const lane = serpentine(seed, size);
    const sx = lane.pts[0].x;
    const sy = lane.pts[0].y;
    let reach = 0;
    const se = pick(rnd, start);
    const st = pick(rnd, se.variants);
    const s0 = G.place(se, st, sx - (st.w >> 1), sy - (st.h >> 1), 2 * BAND, "intake", true, 0);
    const path = [s0.id];
    const slots = routeSchedule(lib, rnd);
    let ok = true;
    const pending: string[] = [];
    for (const slot of slots) {
      const tip = path[path.length - 1];
      // the route leaves the tip by one of its spare full-width doors
      const tipT = G.tiles[tip];
      const exits = tipT.sockets.map((_, k) => k).filter((k) => G.insts[tip].joined[k] < 0 && tipT.sockets[k].w >= 3);
      if (!exits.length) {
        ok = false;
        break;
      }
      if (slot.kind === "piece" && slot.tile) pending.push(slot.tile);
      let pool: LibEntry[];
      if (slot.kind === "goal") pool = goal;
      else if (slot.kind === "stair") pool = lib.filter((e) => e.def.role === "stair");
      else if (pending.length) pool = lib.filter((e) => e.def.id === pending[0]);
      else if (slot.kind === "node") pool = lib.filter((e) => e.def.role === "gallery" && e.base.sockets.filter((so) => so.w >= 3).length >= 3 && inSet(e, slot.section));
      else pool = lib.filter((e) => (e.def.role === "gallery" || (e.def.role === "hall" && !e.def.min)) && inSet(e, slot.section));
      const zIn = (k: number): number => G.sock(tip, k).z;
      let best: (Cand & { from: number }) | null = null;
      {
        const tipI = G.insts[tip];
        reach = Math.max(reach, lane.project(tipI.x + tipI.w / 2, tipI.y + tipI.h / 2));
      }
      const target = lane.at(reach + 34);
      const consider = (list: LibEntry[]): void => {
        for (const k of exits) {
          const cands = G.candidates(tip, k, list, (c) => {
            if (slot.kind === "goal") return true;
            // the route must be able to carry on: another full-width door, on
            // the same deck (or the next one down, through a stair)
            const want = slot.kind === "stair" ? zIn(k) - BAND : zIn(k);
            return c.t.sockets.some((s, j) => j !== c.k && s.w >= 3 && c.z + s.z === want);
          });
          for (const c of cands) {
            // progress toward the far corner, measured at the new piece's
            // best onward door, with enough noise to wander
            let d = Infinity;
            for (let j = 0; j < c.t.sockets.length; j++) {
              if (j === c.k) continue;
              const s = c.t.sockets[j];
              d = Math.min(d, Math.hypot(c.x + s.x - target.x, c.y + s.y - target.y));
            }
            if (slot.kind === "goal") d = 0;
            c.score = -d + rnd() * 40 + (c.e.def.weight ?? 1) * 4;
            if (!best || c.score > best.score) best = { ...c, from: k };
          }
        }
      };
      consider(pool);
      if (!best && pending.length && slot.kind !== "goal" && slot.kind !== "stair") {
        // the set piece doesn't fit here: walk on, and try it at the next step
        consider(lib.filter((e) => e.def.role === "gallery" && inSet(e, slot.section)));
      } else if (best && pending.length && slot.kind !== "goal" && slot.kind !== "stair") pending.shift();
      if (!best) {
        ok = false;
        break;
      }
      const b = best as Cand & { from: number };
      const inst = G.attach(tip, b.from, b, slot.section, true, 0);
      path.push(inst.id);
    }
    if (ok && pending.length) ok = false;
    if (ok) {
      g = G;
      mainPath = path;
    }
  }
  if (!g) throw new Error(`pipes: no route from the drain to the door in 60 attempts (seed ${seed})`);
  const G = g;

  // ---- BRANCHES
  const bRnd = rngFor(seed, "pd3:branches");
  const byRole = (roles: string[]) => lib.filter((e) => roles.includes(e.def.role));
  const halls = byRole(["hall"]);
  const galleries = byRole(["gallery"]);
  const corridors = byRole(["corridor"]);
  const rooms = byRole(["room"]);
  const stairs = byRole(["stair"]);
  const tunnelish = (e: LibEntry): boolean => e.def.type === "tunnel";
  // ---- CLOSING LOOPS: a chain of circulation from one spare doorway that
  // lands exactly on another, found by an A* search over the library's
  // two-door pieces (plain lengths, runs, bends, stairwells). First the long
  // ones — cross-streets between the route's passes, so the level is a
  // network and not one long corridor — then short ones between neighbouring
  // branches. Only ever between parts of the level that are far apart by
  // walking: a ring round one room is not a loop anyone uses.
  let closed = 0;
  type LinkOpts = { minW: number; minD: number; maxD: number; minHops: number; budget: number; expand: number };
  const linkers: ((o: LinkOpts) => void)[] = [];
  {
    const cRnd = rngFor(seed, "pd3:close");
    const hops = (from: number): Int32Array => {
      const d = new Int32Array(G.insts.length).fill(-1);
      d[from] = 0;
      const q = [from];
      for (let h = 0; h < q.length; h++) for (const j of G.insts[q[h]].joined) if (j >= 0 && !G.dead[j] && d[j] < 0) ((d[j] = d[q[h]] + 1), q.push(j));
      return d;
    };
    const front = (S: { x: number; y: number; side: Side }): [number, number] => [S.x + DX[S.side], S.y + DY[S.side]];
    const spare = (minW: number): { id: number; k: number }[] => {
      const out: { id: number; k: number }[] = [];
      for (const inst of G.live()) G.tiles[inst.id].sockets.forEach((so, k) => inst.joined[k] < 0 && so.w >= minW && inst.role !== "room" && out.push({ id: inst.id, k }));
      return out;
    };
    // the pieces a chain is built from: plain circulation with exactly two
    // full-width doors and nothing built into it (a room in a cross-street
    // would be a room nobody chose), grouped by the side they're entered from
    type Piece = { e: LibEntry; t: Tile; a: number; b: number };
    const chainPieces = (w: number): Piece[][] => {
      const bySide: Piece[][] = [[], [], [], []];
      for (const e of [...galleries, ...stairs, ...corridors.filter((q) => !tunnelish(q))]) {
        if (e.base.roomKinds.length > 1 || e.area > 60) continue;
        for (const t of e.variants) {
          const ks = t.sockets.map((so, k) => (so.w === w ? k : -1)).filter((k) => k >= 0);
          if (ks.length !== 2) continue;
          bySide[t.sockets[ks[0]].side].push({ e, t, a: ks[0], b: ks[1] });
          bySide[t.sockets[ks[1]].side].push({ e, t, a: ks[1], b: ks[0] });
        }
      }
      return bySide;
    };
    const chainsByW = new Map<number, ReturnType<typeof chainPieces>>();
    const link = (o: LinkOpts): void => {
      let budget = o.budget;
      for (const A of shuffle(cRnd, spare(o.minW))) {
        if (budget <= 0) break;
        if (G.dead[A.id] || G.insts[A.id].joined[A.k] >= 0) continue;
        const SA = G.sock(A.id, A.k);
        const [ax, ay] = front(SA);
        const d = hops(A.id);
        const targets = spare(o.minW)
          .filter((B) => B.id !== A.id && (d[B.id] < 0 || d[B.id] >= o.minHops))
          .map((B) => ({ ...B, S: G.sock(B.id, B.k) }))
          .filter((B) => B.S.w === SA.w && Math.abs(B.S.z - SA.z) <= BAND)
          .map((B) => ({ ...B, dist: Math.abs(front(B.S)[0] - ax) + Math.abs(front(B.S)[1] - ay) }))
          .filter((B) => B.dist >= o.minD && B.dist <= o.maxD)
          .sort((a, b) => a.dist - b.dist)
          .slice(0, 2);
        if (!chainsByW.has(SA.w)) chainsByW.set(SA.w, chainPieces(SA.w));
        const pieces = chainsByW.get(SA.w)!;
        for (const B of targets) {
          budget--;
          const [bx, by] = front(B.S);
          const want = opp(B.S.side);
          // A*: a state is the doorway the chain would leave by
          interface Node { x: number; y: number; side: Side; z: number; g: number; f: number; parent: Node | null; piece: { e: LibEntry; t: Tile; a: number; b: number; ox: number; oy: number; oz: number } | null }
          const h = (x: number, y: number, z: number): number => Math.abs(x - bx) + Math.abs(y - by) + (Math.abs(z - B.S.z) / BAND) * 8;
          const heap: Node[] = [];
          const hpush = (n: Node): void => {
            heap.push(n);
            let i = heap.length - 1;
            while (i > 0) {
              const p = (i - 1) >> 1;
              if (heap[p].f <= heap[i].f) break;
              [heap[p], heap[i]] = [heap[i], heap[p]];
              i = p;
            }
          };
          const hpop = (): Node => {
            const top = heap[0];
            const last = heap.pop()!;
            if (heap.length) {
              heap[0] = last;
              let i = 0;
              for (;;) {
                const l = i * 2 + 1;
                const r = l + 1;
                let m = i;
                if (l < heap.length && heap[l].f < heap[m].f) m = l;
                if (r < heap.length && heap[r].f < heap[m].f) m = r;
                if (m === i) break;
                [heap[m], heap[i]] = [heap[i], heap[m]];
                i = m;
              }
            }
            return top;
          };
          hpush({ x: SA.x, y: SA.y, side: SA.side, z: SA.z, g: 0, f: h(ax, ay, SA.z), parent: null, piece: null });
          const seen = new Set<string>();
          let goal: Node | null = null;
          let expanded = 0;
          while (heap.length && expanded < o.expand && !goal) {
            const cur = hpop();
            const key = `${cur.x},${cur.y},${cur.side},${cur.z}`;
            if (seen.has(key)) continue;
            seen.add(key);
            expanded++;
            const wantIn = opp(cur.side);
            for (const pc of pieces[wantIn]) {
              const sa = pc.t.sockets[pc.a];
              const ox = cur.x + DX[cur.side] - sa.x;
              const oy = cur.y + DY[cur.side] - sa.y;
              const oz = cur.z - sa.z;
              if (!G.fits(pc.t, ox, oy, oz)) continue;
              const sb = pc.t.sockets[pc.b];
              const n: Node = { x: ox + sb.x, y: oy + sb.y, side: sb.side, z: oz + sb.z, g: 0, f: 0, parent: cur, piece: { ...pc, ox, oy, oz } };
              n.g = cur.g + pc.t.w * pc.t.h / SA.w + 2;
              if (n.x === bx && n.y === by && n.side === want && n.z === B.S.z) {
                goal = n;
                break;
              }
              const [fx, fy] = [n.x + DX[n.side], n.y + DY[n.side]];
              n.f = n.g + h(fx, fy, n.z) * 1.6;
              hpush(n);
            }
          }
          if (!goal) continue;
          // realise it — the search never checked the chain against itself
          const steps: NonNullable<Node["piece"]>[] = [];
          for (let n: Node | null = goal; n && n.piece; n = n.parent) steps.unshift(n.piece);
          const placed: number[] = [];
          let tip = { id: A.id, k: A.k };
          let ok = true;
          for (const st of steps) {
            if (!G.fits(st.t, st.ox, st.oy, st.oz)) {
              ok = false;
              break;
            }
            const inst = G.attach(tip.id, tip.k, { e: st.e, t: st.t, k: st.a, x: st.ox, y: st.oy, z: st.oz, score: 0 }, G.insts[A.id].section, false, G.insts[A.id].depth + 1);
            placed.push(inst.id);
            tip = { id: inst.id, k: st.b };
          }
          if (ok) {
            G.insts[tip.id].joined[tip.k] = B.id;
            G.insts[B.id].joined[B.k] = tip.id;
            // A loop may shorten the way to the door, but not skip the level:
            // the drain must stay more than half the route from the door.
            const via = hops(mainPath[0])[mainPath[mainPath.length - 1]];
            if (via >= 0 && via >= Math.floor(mainPath.length * 0.55)) {
              closed++;
              break;
            }
            G.insts[tip.id].joined[tip.k] = -1;
            G.insts[B.id].joined[B.k] = -1;
          }
          for (const id of placed.reverse()) G.remove(id);
        }
      }
    };
    linkers.push(link);
  }

  // THE CROSS-STREETS, before any room takes the ground between the passes
  linkers[0]({ minW: 3, minD: 16, maxD: 130, minHops: 12, budget: 60, expand: 2500 });
  const crossStreets = closed;

  type Front = { id: number; k: number };
  const frontier: Front[] = [];
  const push = (id: number): void => {
    const ks = G.tiles[id].sockets.map((_, k) => k).filter((k) => G.insts[id].joined[k] < 0);
    for (const k of shuffle(bRnd, ks)) frontier.push({ id, k });
  };
  for (const id of mainPath) push(id);
  for (const inst of G.live()) if (!inst.main) push(inst.id);
  const minOf = (e: LibEntry): number => e.def.min ?? 0;
  let guard = 0;
  while (frontier.length && G.area < FILL * size * size && guard++ < 6000) {
    // breadth-first, but with a little shuffle so the level doesn't grow in rings
    const at = Math.min(frontier.length - 1, Math.floor(bRnd() * Math.min(4, frontier.length)));
    const f = frontier.splice(at, 1)[0];
    if (G.insts[f.id].joined[f.k] >= 0) continue;
    const parent = G.insts[f.id];
    const P = G.sock(f.id, f.k);
    const sec = parent.section;
    const depth = parent.depth + 1;
    // A ROOM IS ENTERED FROM CIRCULATION: a gallery, a corridor or a tunnel.
    // Its other doors take only circulation back out (or a loop, or a locked
    // prop) — never another room, which is what made the rooms read as a
    // patchwork of rectangles rather than a building.
    const fromRoom = parent.role === "room";
    let pool: LibEntry[] = [];
    if (P.w >= 3) {
      pool = [...galleries.filter(() => depth <= 5), ...halls.filter(() => depth <= 3), ...stairs.filter(() => depth <= 2)];
    } else if (P.w === 2) {
      pool = [...corridors.filter((e) => !tunnelish(e) && depth <= 7), ...(fromRoom ? [] : rooms)];
    } else {
      pool = [...(fromRoom ? [] : rooms), ...corridors.filter((e) => depth <= (tunnelish(e) ? 9 : 7)), ...stairs.filter((e) => tunnelish(e) && depth <= 6)];
    }
    // lit rooms are the safety pass's to place, where they're needed
    pool = pool.filter((e) => !e.safe || (e.def.min ?? 0) > (G.count.get(e.def.id) ?? 0) || bRnd() < 0.25);
    pool = pool.filter((e) => inSet(e, sec === "vault" ? "machinery" : sec));
    const cands = G.candidates(f.id, f.k, pool);
    if (!cands.length) continue;
    for (const c of cands) {
      const unmet = minOf(c.e) > (G.count.get(c.e.def.id) ?? 0) ? 30 : 0;
      // variety: every copy already built makes the next less likely
      const seen = G.count.get(c.e.def.id) ?? 0;
      c.score = (c.e.def.weight ?? 1) * (0.5 + bRnd()) * 4 + G.aligned(c) * 6 + unmet - seen * 1.2;
    }
    cands.sort((a, b) => b.score - a.score);
    const c = cands[0];
    const inst = G.attach(f.id, f.k, c, sec, false, depth);
    push(inst.id);
  }

  // ---- THE PRUNE: circulation that leads nowhere is taken back out. A
  // gallery, corridor, tunnel or stair whose only joined door is the one it
  // hangs from is a finger into the rock — walked to the end for nothing.
  // Repeat until nothing more falls off (removing one can strand its parent).
  const CIRC = new Set(["gallery", "corridor", "stair"]);
  for (let changed = true; changed; ) {
    changed = false;
    for (const inst of G.live()) {
      if (inst.main || !CIRC.has(inst.role)) continue;
      if (inst.joined.filter((j) => j >= 0).length > 1) continue;
      G.remove(inst.id);
      changed = true;
    }
  }

  // short loops between neighbouring branches
  linkers[0]({ minW: 3, minD: 3, maxD: 40, minHops: 8, budget: 60, expand: 600 });
  linkers[0]({ minW: 2, minD: 3, maxD: 34, minHops: 7, budget: 80, expand: 500 });

  // ---- SAFETY: a lit room within reach of everywhere
  const safeTiles = rooms.filter((e) => e.safe);
  let safeAdded = 0;
  for (let pass = 0; pass < 40; pass++) {
    const built = materialize(G, seed, false);
    const s = built.sector;
    const src: { x: number; y: number }[] = [];
    for (let i = 0; i < size * size; i++) if (!s.solid[i] && SAFE_TYPES.has(pt(s.districts[s.district[i]].type))) src.push({ x: i % size, y: (i / size) | 0 });
    const d = distanceMap(s, src);
    let worst = 0;
    for (let i = 0; i < size * size; i++) if (d[i] > worst) worst = d[i];
    if (worst <= MAX_TO_SAFE) break;
    // spare sockets, farthest from a light first
    const spare: { id: number; k: number; far: number }[] = [];
    for (const inst of G.live()) {
      G.tiles[inst.id].sockets.forEach((_, k) => {
        if (inst.joined[k] >= 0) return;
        const S = G.sock(inst.id, k);
        const far = d[S.y * size + S.x];
        if (far > MAX_TO_SAFE * 0.45) spare.push({ id: inst.id, k, far });
      });
    }
    spare.sort((a, b) => b.far - a.far);
    let placed = false;
    for (const sp of spare) {
      const inst = G.insts[sp.id];
      const cands = G.candidates(sp.id, sp.k, safeTiles.filter((e) => inSet(e, inst.section === "vault" ? "machinery" : inst.section) || inSet(e, "any")), undefined, true);
      if (!cands.length) continue;
      const c = pick(bRnd, cands);
      G.attach(sp.id, sp.k, c, inst.section, false, inst.depth + 1);
      safeAdded++;
      placed = true;
      break;
    }
    if (!placed) break;
  }

  // ---- LOOPS: spare doorways that meet exactly are opened
  const lRnd = rngFor(seed, "pd3:loops");
  let loops = 0;
  for (const inst of G.live()) {
    const t = G.tiles[inst.id];
    for (let k = 0; k < t.sockets.length; k++) {
      if (inst.joined[k] >= 0) continue;
      const S = G.sock(inst.id, k);
      const gx = S.x + DX[S.side];
      const gy = S.y + DY[S.side];
      if (gx < 0 || gy < 0 || gx >= size || gy >= size) continue;
      const o = G.occ[gy * size + gx] - 1;
      if (o < 0 || o === inst.id) continue;
      const ot = G.tiles[o];
      for (let q = 0; q < ot.sockets.length; q++) {
        if (G.insts[o].joined[q] >= 0) continue;
        const O = G.sock(o, q);
        if (O.side !== opp(S.side) || O.w !== S.w || O.x !== gx || O.y !== gy || Math.abs(O.z - S.z) > 1) continue;
        if (lRnd() > (S.w >= 3 ? 1 : S.w === 2 ? 0.85 : 0.7)) continue;
        inst.joined[k] = o;
        G.insts[o].joined[q] = inst.id;
        loops++;
        break;
      }
    }
  }

  // ---- LOOSE ENDS: dead-end galleries get an end if one fits
  const caps = byRole(["cap"]);
  for (const inst of G.live()) {
    const t = G.tiles[inst.id];
    for (let k = 0; k < t.sockets.length; k++) {
      if (inst.joined[k] >= 0 || t.sockets[k].w < 3) continue;
      const cands = G.candidates(inst.id, k, caps.filter((e) => inSet(e, inst.section === "vault" ? "machinery" : inst.section)));
      if (!cands.length) continue;
      G.attach(inst.id, k, pick(bRnd, cands), inst.section, false, inst.depth + 1);
    }
  }

  const renum = G.compact();
  mainPath = mainPath.map((id) => renum.get(id)!);
  const built = materialize(G, seed, true);
  return { ...built, insts: G.insts, mainPath, loops: loops + closed, links: closed, crossStreets, safeAdded, attempts };
}

/** Write the world: spaces, floors, walls, dressing. `final` adds the prop
 *  doors, the landmarks and the reach check. */
function materialize(G: Gen, seed: number, final: boolean): { sector: Sector; rooms: PipeRoom[]; space: Int32Array; lostCells: number } {
  const size = G.size;
  const n = size * size;
  // every distinct room style (look, lights, sound) once; cells point in
  const styleTable = new StyleTable();
  const stairTable = new StairTable();
  const s: Sector = {
    seed,
    size,
    wallN: new Uint8Array(n),
    wallW: new Uint8Array(n),
    solid: new Uint8Array(n).fill(1),
    floor: new Int8Array(n),
    background: new Uint8Array(n),
    district: new Uint8Array(n),
    landmark: new Uint8Array(n),
    districts: PIPE_TYPES.map((type, id) => ({ id, type, x: 0, y: 0, w: size, h: size }) satisfies District),
    landmarks: [],
    doors: [],
    deco: new Uint8Array(n),
    kit: [],
    look: new Uint16Array(n),
    styles: styleTable.styles,
    stairSpecs: stairTable.specs,
  };
  const space = new Int32Array(n);
  const rooms: PipeRoom[] = [];
  const opened = new Set<number>();
  const openEdge = (x: number, y: number, side: Side): void => {
    if (side === 0) opened.add((y * size + x) * 2);
    else if (side === 2) opened.add(((y + 1) * size + x) * 2);
    else if (side === 3) opened.add((y * size + x) * 2 + 1);
    else opened.add((y * size + x + 1) * 2 + 1);
  };
  const lRnd = rngFor(seed, "pd3:lamps");
  for (const inst of G.insts) {
    if (G.dead[inst.id]) continue;
    const t = G.tiles[inst.id];
    const e = G.entry[inst.id];
    // one space per room of the tile
    const base = rooms.length + 1;
    // the room's look override, worn by its own-type cells only (surfaces.ts)
    const lookCode = styleTable.styleOf(t.def.look);
    const stairCode = stairTable.styleOf(t.def.stairs);
    const ownZone = t.dia.types.indexOf(t.def.type);
    const nRooms = t.roomKinds.length;
    const boxes = Array.from({ length: nRooms }, () => ({ x0: Infinity, y0: Infinity, x1: -1, y1: -1, types: new Map<number, number>() }));
    for (let y = 0; y < t.h; y++) {
      for (let x = 0; x < t.w; x++) {
        const i = y * t.w + x;
        if (!t.cell[i]) continue;
        const gx = inst.x + x;
        const gy = inst.y + y;
        const gi = gy * size + gx;
        const r = t.room[i];
        space[gi] = base + r;
        s.solid[gi] = t.cell[i] === 2 ? 1 : 0;
        // floor no door of the room reaches: drawn, never entered (tiles.ts scenery)
        if (t.scenery[i]) s.background[gi] = 1;
        s.floor[gi] = inst.z + t.hgt[i];
        // a held ceiling rides its room's deck like its floor does
        if (t.lid[i] !== LID_NONE) (s.lid ??= new Int8Array(size * size).fill(LID_NONE))[gi] = inst.z + t.lid[i];
        if (t.stair[i] >= 0) {
          (s.stair ??= new Int8Array(size * size).fill(STAIR_NONE))[gi] = t.stair[i];
          if (stairCode) (s.stairStyle ??= new Uint8Array(size * size))[gi] = stairCode;
        }
        s.district[gi] = t.zone[i];
        s.deco![gi] = t.deco[i];
        if (lookCode && t.zone[i] === ownZone) s.look![gi] = lookCode;
        const b = boxes[r];
        b.x0 = Math.min(b.x0, gx);
        b.y0 = Math.min(b.y0, gy);
        b.x1 = Math.max(b.x1, gx);
        b.y1 = Math.max(b.y1, gy);
        b.types.set(t.zone[i], (b.types.get(t.zone[i]) ?? 0) + 1);
      }
    }
    for (let r = 0; r < nRooms; r++) {
      const b = boxes[r];
      const type = PIPE_TYPES[[...b.types.entries()].sort((a, c) => c[1] - a[1])[0]?.[0] ?? 0];
      rooms.push({ id: base + r, inst: inst.id, kind: t.roomKinds[r], type, safe: SAFE_TYPES.has(type), x: b.x0, y: b.y0, w: b.x1 - b.x0 + 1, h: b.y1 - b.y0 + 1, doors: [] });
    }
    // the room's props, into map cells
    // a prop or marker with a chance appears in that share of the copies,
    // rolled per copy from the seed (the same on every boot)
    t.props.forEach((pl, k) => {
      if (pl.c < 100 && copyRoll(seed, inst.id, k) * 100 >= pl.c) return;
      const { c: _c, text, ...rest } = pl;
      s.kit!.push({ ...rest, x: inst.x + pl.x, y: inst.y + pl.y, ...(text ? { text } : {}) });
    });
    t.marks.forEach((m, k) => {
      if ((m.chance ?? 100) < 100 && copyRoll(seed, inst.id, k, 1) * 100 >= m.chance!) return;
      (s.marks ??= []).push({ ...m, x: inst.x + m.x, y: inst.y + m.y });
    });
    // the lamps: a safe tile burns steady; anywhere else a run may be dead
    const roll = lRnd();
    // the drain and the valve gallery burn every lamp: you arrive in the light,
    // and the door you've been looking for is never found in the dark
    const always = e.safe || e.def.role === "goal" || e.def.role === "start";
    const state = always ? 0 : roll < 0.28 ? 1 : roll < 0.36 ? 2 : -1;
    for (let y = 0; y < t.h; y++) {
      for (let x = 0; x < t.w; x++) {
        const gi = (inst.y + y) * size + inst.x + x;
        if (s.deco![gi] >> 4 !== PDECO.lamp) continue;
        const safeHere = SAFE_TYPES.has(PIPE_TYPES[t.zone[y * t.w + x]]);
        const v = safeHere || always ? 0 : state >= 0 ? state : lRnd() < 0.08 ? 1 : 0;
        s.deco![gi] = pdecoByte(PDECO.lamp, v);
      }
    }
    // inner doors — a door belongs to BOTH rooms it joins
    for (const d of t.inner) {
      openEdge(inst.x + d.x, inst.y + d.y, d.side);
      const nx = d.x + DX[d.side];
      const ny = d.y + DY[d.side];
      rooms[base - 1 + t.room[d.y * t.w + d.x]].doors.push({ x: inst.x + d.x, y: inst.y + d.y, side: d.side, width: 1 });
      rooms[base - 1 + t.room[ny * t.w + nx]].doors.push({ x: inst.x + nx, y: inst.y + ny, side: opp(d.side), width: 1 });
    }
    // joined sockets
    t.sockets.forEach((so, k) => {
      if (inst.joined[k] < 0) return;
      const lx = so.side === 0 || so.side === 2 ? 1 : 0;
      for (let q = 0; q < so.w; q++) openEdge(inst.x + so.x + lx * q, inst.y + so.y + (1 - lx) * q, so.side);
      const room = rooms[base - 1 + t.room[so.y * t.w + so.x]];
      room.doors.push({ x: inst.x + so.x, y: inst.y + so.y, side: so.side, width: so.w });
    });
  }
  // prop doors on spare doorways that open onto rock
  const dRnd = rngFor(seed, "pd3:locked");
  if (final) {
    for (const inst of G.insts) {
      const t = G.tiles[inst.id];
      t.sockets.forEach((so, k) => {
        if (inst.joined[k] >= 0 || so.w > 2) return;
        const gx = inst.x + so.x;
        const gy = inst.y + so.y;
        const bx = gx + DX[so.side];
        const by = gy + DY[so.side];
        const cx = bx + DX[so.side];
        const cy = by + DY[so.side];
        if (bx < 0 || by < 0 || bx >= size || by >= size || space[by * size + bx]) return;
        if (cx >= 0 && cy >= 0 && cx < size && cy < size && space[cy * size + cx]) return;
        const gi = gy * size + gx;
        const k0 = s.deco![gi] >> 4;
        if (k0 && k0 !== PDECO.lamp) return;
        // a share of them only — a wall of locked doors reads as a pattern
        if (dRnd() > 0.45) return;
        s.deco![gi] = pdecoByte(PDECO.lockeddoor, so.side);
      });
    }
  }
  // No steam at the drain: it's where everyone arrives, and a vent is a hazard.
  {
    const hi = s.deco!.findIndex((c) => c >> 4 === PDECO.hatch);
    const hx = hi % size;
    const hy = (hi / size) | 0;
    for (let y = Math.max(0, hy - 13); y <= Math.min(size - 1, hy + 13); y++) {
      for (let x = Math.max(0, hx - 13); x <= Math.min(size - 1, hx + 13); x++) {
        const i = y * size + x;
        if (s.deco![i] >> 4 === PDECO.vent && Math.hypot(x - hx, y - hy) <= 12.5) s.deco![i] = 0;
      }
    }
  }
  // walls from spaces
  for (let y = 1; y < size; y++) {
    for (let x = 1; x < size; x++) {
      const i = y * size + x;
      const a = space[i];
      if (!a) continue;
      const nn = space[i - size];
      if (nn && nn !== a && !opened.has(i * 2)) s.wallN[i] = 1;
      const ww = space[i - 1];
      if (ww && ww !== a && !opened.has(i * 2 + 1)) s.wallW[i] = 1;
    }
  }
  for (let x = 0; x < size; x++) s.wallN[x] = 1;
  for (let y = 0; y < size; y++) s.wallW[y * size] = 1;
  // the entrance
  const hatch = s.deco!.findIndex((c) => c >> 4 === PDECO.hatch);
  if (hatch < 0) throw new Error("pipes: the start tile placed no drain hatch");
  s.doors = [{ x: hatch % size, y: (hatch / size) | 0, edge: "N", name: "The Drain" } satisfies Door];
  let lostCells = 0;
  if (final) {
    // landmarks: the named set pieces, numbered from the drain
    const named = new Map<string, PipeInst[]>();
    for (const inst of G.insts) if (inst.name) named.set(inst.name, [...(named.get(inst.name) ?? []), inst]);
    const stamp = (name: string, inst: PipeInst): void => {
      const id = s.landmarks.length + 1;
      s.landmarks.push({ id, name, x: inst.x, y: inst.y, w: inst.w, h: inst.h });
      const t = G.tiles[inst.id];
      for (let y = 0; y < t.h; y++) for (let x = 0; x < t.w; x++) if (t.cell[y * t.w + x]) s.landmark[(inst.y + y) * size + inst.x + x] = id;
    };
    const d0 = distanceMap(s, s.doors.map((d) => ({ x: d.x, y: d.y })));
    const reachOf = (inst: PipeInst): number => {
      let best = Infinity;
      for (let y = inst.y; y < inst.y + inst.h; y++) for (let x = inst.x; x < inst.x + inst.w; x++) if (d0[y * size + x] >= 0) best = Math.min(best, d0[y * size + x]);
      return best;
    };
    for (const [name, list] of named) {
      list.sort((a, b) => reachOf(a) - reachOf(b));
      list.forEach((inst, k) => stamp(list.length === 1 ? name : `${name} No. ${k + 1}`, inst));
    }
    const exitInst = G.insts.find((i) => i.role === "goal");
    if (exitInst && !exitInst.name) stamp("The Pressure Door", exitInst);
    // THE REACH CHECK: nothing the drain can't reach survives — and on a map
    // built socket to socket, nothing should need to.
    for (let i = 0; i < n; i++) {
      if (s.solid[i] || s.background[i] || d0[i] >= 0) continue;
      lostCells++;
      s.solid[i] = 1;
      s.deco![i] = 0;
    }
    // THE REAL MACHINES (pipes-models.ts): the lathe, the press, the
    // transformers, the lockers, the benches and the racks the kit has a
    // model of stand on their own footprints as kit props — dressing, not
    // in the fingerprint
    for (const m of pieceModels(size, (x, y) => s.deco![y * size + x], (x, y) => x >= 0 && y >= 0 && x < size && y < size && !s.solid[y * size + x])) s.kit!.push(m);
  }
  // wall props onto the face each copy actually backs on to (Nov 2026 polish round)
  seatWallProps(s);
  return { sector: s, rooms, space, lostCells };
}

export function generatePipesSector(seed: number = SECTOR_D.seed, size: number = SECTOR_D.size): Sector {
  return planPipesSector(seed, size).sector;
}

// ---- Validation --------------------------------------------------------------------

export interface PipesReport extends SectorReport {
  safeRooms: number;
  safeCells: number;
  /** Farthest any reachable cell is from a safe cell (in steps). */
  maxToSafe: number;
  vents: number;
  lamps: number;
  deadLamps: number;
  stairCells: number;
  lockedDoors: number;
  furniture: number;
  machines: number;
  tanks: number;
  racks: number;
  decks: number[];
  /** MUST be 0: an open edge dropping 2+ steps outside an engine hall. */
  unrailedLedges: number;
  /** MUST be 0: any open edge whose drop would kill (fallDamage >= 100). */
  lethalDrops: number;
  maxDrop: number;
  exitDistance: number;
  decoByKind: Record<string, number>;
}

export function validatePipesSector(s: Sector): PipesReport {
  const base = validateSector(s);
  const size = s.size;
  const kindOf = (i: number): number => (s.deco?.[i] ?? 0) >> 4;
  const typeAt = (i: number): DistrictType => s.districts[s.district[i]].type;
  let safeCells = 0;
  let vents = 0;
  let lamps = 0;
  let deadLamps = 0;
  let stairCells = 0;
  let lockedDoors = 0;
  let furniture = 0;
  let machines = 0;
  let tanks = 0;
  let racks = 0;
  let unrailed = 0;
  let lethal = 0;
  let maxDrop = 0;
  const decoByKind: Record<string, number> = {};
  const names = Object.entries(PDECO);
  const safeSrc: { x: number; y: number }[] = [];
  let exitCell = -1;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = idx(size, x, y);
      const code = s.deco?.[i] ?? 0;
      if (code) {
        const name = names.find(([, v]) => v === code >> 4)?.[0] ?? String(code >> 4);
        decoByKind[name] = (decoByKind[name] ?? 0) + 1;
      }
      const k = kindOf(i);
      if (k === PDECO.vent) vents++;
      if (k === PDECO.lamp) {
        lamps++;
        if ((code & 15) === 1) deadLamps++;
      }
      if (k === PDECO.stairs) stairCells++;
      if (k === PDECO.lockeddoor) lockedDoors++;
      if (k === PDECO.wallA || k === PDECO.wallB || k === PDECO.free) furniture++;
      if (k === PDECO.machine) machines++;
      if (k === PDECO.tank) tanks++;
      if (k === PDECO.rack) racks++;
      if (k === PDECO.exitdoor) exitCell = i;
      if (s.solid[i]) continue;
      if (SAFE_TYPES.has(pt(typeAt(i)))) {
        safeCells++;
        safeSrc.push({ x, y });
      }
      for (const [nx, ny, blocked] of [
        [x + 1, y, x + 1 < size ? s.wallW[idx(size, x + 1, y)] : 1],
        [x, y + 1, y + 1 < size ? s.wallN[idx(size, x, y + 1)] : 1],
      ] as [number, number, number][]) {
        if (blocked || nx >= size || ny >= size) continue;
        const ni = idx(size, nx, ny);
        if (s.solid[ni]) continue;
        const drop = Math.abs(s.floor[ni] - s.floor[i]);
        if (drop > maxDrop) maxDrop = drop;
        if (drop >= 2 && !(HALL_TYPES.has(pt(typeAt(i))) && HALL_TYPES.has(pt(typeAt(ni))))) unrailed++;
        if (drop >= 11) lethal++;
      }
    }
  }
  // Safe rooms: connected pieces of safe-type floor.
  const seen = new Uint8Array(size * size);
  let safeRooms = 0;
  for (const src of safeSrc) {
    const i0 = idx(size, src.x, src.y);
    if (seen[i0]) continue;
    safeRooms++;
    const st = [i0];
    seen[i0] = 1;
    while (st.length) {
      const c = st.pop()!;
      const cx = c % size;
      const cy = (c / size) | 0;
      for (const [nx, ny] of [[cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]]) {
        if (nx < 0 || ny < 0 || nx >= size || ny >= size) continue;
        const ni = idx(size, nx, ny);
        if (seen[ni] || s.solid[ni] || !SAFE_TYPES.has(pt(typeAt(ni)))) continue;
        if (ny === cy - 1 && s.wallN[c]) continue;
        if (ny === cy + 1 && s.wallN[ni]) continue;
        if (nx === cx - 1 && s.wallW[c]) continue;
        if (nx === cx + 1 && s.wallW[ni]) continue;
        seen[ni] = 1;
        st.push(ni);
      }
    }
  }
  const toSafe = distanceMap(s, safeSrc);
  let maxToSafe = 0;
  for (let i = 0; i < size * size; i++) if (toSafe[i] > maxToSafe) maxToSafe = toSafe[i];
  const dist = distanceMap(s, s.doors.map((d) => ({ x: d.x, y: d.y })));
  const exitDistance = exitCell >= 0 ? dist[exitCell] : -1;
  const deckSet = new Set<number>();
  for (let i = 0; i < size * size; i++) {
    if (s.solid[i] || kindOf(i) === PDECO.stairs) continue;
    const t = typeAt(i);
    if (t === "pipegallery" || t === "servicering") deckSet.add(s.floor[i]);
  }
  const decks = [...deckSet].sort((a, c) => a - c);
  return {
    ...base,
    safeRooms,
    safeCells,
    maxToSafe,
    vents,
    lamps,
    deadLamps,
    stairCells,
    lockedDoors,
    furniture,
    machines,
    tanks,
    racks,
    decks,
    unrailedLedges: unrailed,
    lethalDrops: lethal,
    maxDrop,
    exitDistance,
    decoByKind,
  };
}

export { sectorFingerprint, distanceMap };
