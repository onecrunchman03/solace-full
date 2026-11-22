// THE POOLROOMS — Level 1, BUILT FROM HAND-MADE ROOMS (v4, sector P4).
//
// Josh, 2026-09-27: "I would the editor to be available in the admin panel so
// I can design and redesigns maps … All three levels now" — and then, of the
// Poolrooms: "lets do rivers as the main path."
//
// P3 (Aug 2026) was carved by rules: districts partitioned, each FILLED by a
// recipe, rivers bezier-carved across whatever was there. It read well from
// the references, but every room was a rule's idea of a room. This is Pipe
// Dreams' model — DunGen's, the Unity generator Lethal Company's facility is
// built with — with the rivers as its spine:
//
//   1. THE LIBRARY. Every piece — a river reach, a bend, a bridge, a dock, the
//      Confluence, the culverts and springs the rivers run between, the pool
//      halls, the passages, the baths — is drawn by hand in pools-rooms.json
//      (see pools-tiles.ts for the Poolrooms' dialect, and the map editor:
//      Admin Panel → Map editor). Nothing in this file draws a room.
//   2. THE RIVERS. The Confluence stands near the middle of the map and four
//      legs of river grow out of its mouths, piece by piece, each steering for
//      its own edge of the map along a slow meander, and each ending in a
//      source piece (a culvert, a spring). Two rivers, crossing. A footbridge
//      is laid every so often — it is how walkers cross, and it is also where
//      a reach ends for the boats and the alligators (one per reach).
//   3. THE DOOR. One way in and out (Josh: "only one door per level"): The
//      Landing hangs off a towpath a short walk from the Confluence.
//   4. BRANCHES. Every towpath doorway the rivers leave open grows the rest:
//      pool halls, passages, and at the end of passages the small rooms. The
//      named halls (the Grand Lido, the Vault Sea, the Long Gallery, the Great
//      Dome, the Winding, the Bathhouse) are placed before the level is full.
//   5. LOOPS AND LOOSE ENDS. Two spare doorways that meet exactly are opened;
//      a passage that leads nowhere is taken back out.
//
// ONE WATER TABLE: water is derived from the floor (pools-vocab.ts). A tile
// draws a pool by drawing a sunken floor; nothing here floods anything.
//
// CONNECTED BY CONSTRUCTION: a piece is only ever placed through a doorway of
// something already reachable, and every tile is checked (lintPoolTile) to be
// one connected piece from its doors by the waterline climb rule. The reach
// check at the end must find nothing to seal — the harness requires it.

import { type Sector, type District, type DistrictType, type Door, WATER_NONE, idx, rngFor, distanceMap, validateSector, sectorFingerprint, heightWalkable, type SectorReport } from "./worldgen";
import { StyleTable } from "./surfaces";
import { LID_NONE } from "./ceiling";
import { StairTable, STAIR_NONE } from "./stairs";
import { copyRoll } from "./marks";
import { WATER_TABLE, SWIM_DEPTH_STEPS, DECO, decoByte, POOL_TYPES, POOL_DOOR_NAMES, GATOR_MIN_CELLS, GATOR_MIN_DEPTH, ZONE_RADII, type PoolZone, wetFloor, effFloor } from "./pools-vocab";
import { type TileDef, type Tile, type Side, type Lint, tileVariants, DX, DY, opp } from "./tiles";
import { lintPoolTile, isRiverSocket, SPINE_ROLES } from "./pools-tiles";
import LIBRARY_JSON from "./pools-rooms.json";
import { seatWallProps } from "./kitseat";

export { WATER_TABLE, SWIM_DEPTH_STEPS, DECO, decoByte, POOL_TYPES };

// ---- The frozen Level 1 sector ------------------------------------------------------
// P4 replaced P3 when the Poolrooms were rebuilt from hand-drawn rooms. A NEW
// SECTOR ID starts world state (fog, paint, bodies) clean; boot verifies the
// fingerprint — a mismatch keeps the pools shut.
//
// P5 (Sep 2026) replaced P4 for one change: The Landing's door moved from the
// middle of its room to the middle of its north wall (Josh: "make the
// entrance and exit door an actual door against the wall") — the door is in
// the fingerprint, so the map is a new sector.
//
// P6 (Sep 29 2026) REPLACED P5 — Josh: "use all those references to
// completely from scratch redesign the pools map", then: rivers out, 288²,
// boats kept as canal boats in the lap pools. A flooded bathhouse in three
// zones outward from The Landing (pools-vocab ZONE_RADII): the Sunlit Baths,
// the Arcades, the Deep.
export const SECTOR_P = Object.freeze({ id: "P6", seed: 20261101, size: 288 });
export const SECTOR_P_FINGERPRINT = "sha256:f10d4d4c336bbb57329cc0afea08964a7236477dff9b6d082c0e8a3535529617";

/** The retired P5 — the river level (P4 with The Landing's door on its wall). */
export const SECTOR_P5_RETIRED = Object.freeze({
  id: "P5",
  seed: 20260930,
  size: 384,
  fingerprint: "sha256:79af4ee5031704ca3543c78043976c99b4c15666b8dde5830a532d682544e1ef",
});

/** The retired sectors, for the record. Nothing generates them now. */
export const SECTOR_P4_RETIRED = Object.freeze({
  id: "P4",
  seed: 20260930,
  size: 384,
  fingerprint: "sha256:b573c7991c075bb42efcb9bdfe12c8eac9094a252a9aae103db0051271c9360e",
});
export const SECTOR_P3_RETIRED = Object.freeze({
  id: "P3",
  seed: 20260901,
  size: 384,
  fingerprint: "sha256:68f0b256e565d2aa724ae13fc26b893b0321f83b6e1e05a616f1ed1d539d01b1",
});
export const SECTOR_P2_RETIRED = Object.freeze({
  id: "P2",
  seed: 20260808,
  size: 322,
  fingerprint: "sha256:3af51c6f9f2fa86d524a27225007b466745a51a1c0af4ac8b9627da195054728",
});

/** The library as shipped. */
export const POOL_LIBRARY: readonly TileDef[] = (LIBRARY_JSON as unknown as { tiles: TileDef[] }).tiles;

/** Stop growing branches once this share of the map is built. */
const FILL = 0.5;
/** Wet cells a reach holds before a footbridge may end it, and after which
 *  one must. An alligator needs 800 (service.ts GATOR_MIN_CELLS). */
const REACH_MIN = 850;
const REACH_MAX = 1400;
/** How far a river keeps from the rest of the river (cells). */
const RIVER_CLEAR = 7;
/** How close to the map's edge a leg runs before it looks for its source. */
const EDGE_STOP = 42;

// ---- The library, parsed ----------------------------------------------------------

export interface PoolLibEntry {
  def: TileDef;
  base: Tile;
  variants: Tile[];
  lint: Lint;
  area: number;
  /** Wet cells in the tile. */
  wet: number;
  /** Carries a footbridge (ends a reach). */
  bridge: boolean;
}

/** Parse and check a library. Throws on the first broken tile unless `lax`. */
export function loadPoolLibrary(defs: readonly TileDef[] = POOL_LIBRARY, lax = false): PoolLibEntry[] {
  const out: PoolLibEntry[] = [];
  const ids = new Set<string>();
  for (const def of defs) {
    const l = lintPoolTile(def);
    if (ids.has(def.id)) l.errors.push(`duplicate id "${def.id}"`);
    ids.add(def.id);
    if (l.errors.length && !lax) throw new Error(`pools: tile "${def.id}" is broken — ${l.errors[0]}`);
    let area = 0;
    let wet = 0;
    for (let i = 0; i < l.tile.cell.length; i++) {
      if (!l.tile.cell[i]) continue;
      area++;
      if (l.tile.cell[i] === 1 && wetFloor(l.tile.hgt[i])) wet++;
    }
    out.push({
      def,
      base: l.tile,
      variants: l.errors.length ? [] : tileVariants(l.tile),
      lint: { errors: l.errors, warnings: l.warnings },
      area,
      wet,
      bridge: l.tile.pieces.some((p) => p.k === "bridge"),
    });
  }
  return out;
}

// ---- Plan types ----------------------------------------------------------------------

export interface PoolInst {
  id: number;
  tileId: string;
  role: string;
  name: string | null;
  x: number;
  y: number;
  w: number;
  h: number;
  /** A river piece. */
  spine: boolean;
  /** Which of the Confluence's legs a river piece belongs to (-1 not one). */
  leg: number;
  /** Tiles from the river (0 on it). */
  depth: number;
  /** Per socket: the instance it joins, or -1. */
  joined: number[];
}

export interface PoolsPlan {
  sector: Sector;
  insts: PoolInst[];
  /** The placed copy of each instance's room (turned and mirrored as built). */
  tiles: Tile[];
  /** Space id per cell (0 = rock). */
  space: Int32Array;
  /** Where The Landing's door stands — the zones are measured from it. */
  landing: { x: number; y: number };
  /** Doorways opened where two spare sockets met, plus the chains the
   *  linker built between far-apart parts of the level. */
  loops: number;
  /** Of those, the chains built. */
  links: number;
  /** Open cells the reach check had to turn to rock — MUST be 0. */
  lostCells: number;
  /** Attempts before one placed every named hall. */
  attempts: number;
  /** Named halls the library asks for (min) that could not be placed. */
  unmet: string[];
}

// ---- The builder ----------------------------------------------------------------------

interface Cand {
  e: PoolLibEntry;
  t: Tile;
  k: number;
  x: number;
  y: number;
  score: number;
}

class Gen {
  readonly size: number;
  /** Instance id + 1 per cell (0 = rock). */
  readonly occ: Int32Array;
  readonly insts: PoolInst[] = [];
  readonly tiles: Tile[] = [];
  readonly entry: PoolLibEntry[] = [];
  readonly count = new Map<string, number>();
  readonly dead: boolean[] = [];
  area = 0;

  constructor(size: number) {
    this.size = size;
    this.occ = new Int32Array(size * size);
  }

  inb(x: number, y: number): boolean {
    return x >= 2 && y >= 2 && x < this.size - 2 && y < this.size - 2;
  }

  sock(id: number, k: number): { x: number; y: number; side: Side; w: number; prof: number[] } {
    const inst = this.insts[id];
    const s = this.tiles[id].sockets[k];
    return { x: inst.x + s.x, y: inst.y + s.y, side: s.side, w: s.w, prof: s.prof };
  }

  /** The cell just outside a socket's middle lane. */
  front(id: number, k: number): { x: number; y: number } {
    const S = this.sock(id, k);
    const lx = S.side === 0 || S.side === 2 ? 1 : 0;
    const m = (S.w - 1) / 2;
    return { x: S.x + lx * m + DX[S.side], y: S.y + (1 - lx) * m + DY[S.side] };
  }

  fits(t: Tile, ox: number, oy: number): boolean {
    for (let y = 0; y < t.h; y++) {
      for (let x = 0; x < t.w; x++) {
        if (!t.cell[y * t.w + x]) continue;
        const gx = ox + x;
        const gy = oy + y;
        if (!this.inb(gx, gy)) return false;
        if (this.occ[gy * this.size + gx]) return false;
      }
    }
    return true;
  }

  /** Does a river piece keep its distance from the rest of the river (all
   *  but the pieces in `skip`)? */
  clear(t: Tile, ox: number, oy: number, skip: ReadonlySet<number>): boolean {
    const r = RIVER_CLEAR;
    for (let y = 0; y < t.h; y++) {
      for (let x = 0; x < t.w; x++) {
        if (!t.cell[y * t.w + x]) continue;
        // only the outline needs checking
        let edge = false;
        for (let s = 0; s < 4 && !edge; s++) {
          const nx = x + DX[s];
          const ny = y + DY[s];
          if (nx < 0 || ny < 0 || nx >= t.w || ny >= t.h || !t.cell[ny * t.w + nx]) edge = true;
        }
        if (!edge) continue;
        for (let dy = -r; dy <= r; dy += 2) {
          for (let dx = -r; dx <= r; dx += 2) {
            const gx = ox + x + dx;
            const gy = oy + y + dy;
            if (gx < 0 || gy < 0 || gx >= this.size || gy >= this.size) continue;
            const o = this.occ[gy * this.size + gx] - 1;
            if (o >= 0 && this.insts[o].spine && !skip.has(o)) return false;
          }
        }
      }
    }
    return true;
  }

  place(e: PoolLibEntry, t: Tile, ox: number, oy: number, spine: boolean, leg: number, depth: number): PoolInst {
    const id = this.insts.length;
    const inst: PoolInst = { id, tileId: e.def.id, role: e.def.role, name: e.def.name ?? null, x: ox, y: oy, w: t.w, h: t.h, spine, leg, depth, joined: t.sockets.map(() => -1) };
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
    this.count.set(e.def.id, (this.count.get(e.def.id) ?? 0) + 1);
    return inst;
  }

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
  }

  live(): PoolInst[] {
    return this.insts.filter((i) => !this.dead[i.id]);
  }

  compact(): Map<number, number> {
    const map = new Map<number, number>();
    const insts: PoolInst[] = [];
    const tiles: Tile[] = [];
    const entry: PoolLibEntry[] = [];
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

  /** Every way a pool of tiles can hang off socket k of instance id: the
   *  joining sockets must be the same width and the same floor profile. */
  candidates(id: number, k: number, pool: PoolLibEntry[], filter?: (c: Cand) => boolean, ignoreMax = false): Cand[] {
    const P = this.sock(id, k);
    const out: Cand[] = [];
    const want = opp(P.side);
    for (const e of pool) {
      if (!ignoreMax && e.def.max !== undefined && (this.count.get(e.def.id) ?? 0) >= e.def.max) continue;
      for (const t of e.variants) {
        for (let j = 0; j < t.sockets.length; j++) {
          const s = t.sockets[j];
          if (s.side !== want || s.w !== P.w || !sameProf(s.prof, P.prof)) continue;
          const ox = P.x + DX[P.side] - s.x;
          const oy = P.y + DY[P.side] - s.y;
          if (!this.fits(t, ox, oy)) continue;
          const c: Cand = { e, t, k: j, x: ox, y: oy, score: 0 };
          if (filter && !filter(c)) continue;
          out.push(c);
        }
      }
    }
    return out;
  }

  attach(id: number, k: number, c: Cand, spine: boolean, leg: number, depth: number): PoolInst {
    const inst = this.place(c.e, c.t, c.x, c.y, spine, leg, depth);
    inst.joined[c.k] = id;
    this.insts[id].joined[k] = inst.id;
    return inst;
  }

  /** How many of a candidate's other sockets line up exactly with a spare
   *  socket already in the world (a loop waiting to close). */
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
        if (os.side === opp(s.side) && os.w === s.w && os.x === gx && os.y === gy && sameProf(os.prof, s.prof)) n++;
      }
    }
    return n;
  }
}

const sameProf = (a: readonly number[], b: readonly number[]): boolean => a.length === b.length && a.every((v, i) => v === b[i]);
const pick = <T>(rnd: () => number, list: T[]): T => list[Math.floor(rnd() * list.length)];
function shuffle<T>(rnd: () => number, list: T[]): T[] {
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list;
}
const riverSockets = (t: Tile): number[] => t.sockets.map((s, k) => (isRiverSocket(s.prof) ? k : -1)).filter((k) => k >= 0);

// ---- The generator ------------------------------------------------------------------

export function planPoolsSector(seed: number = SECTOR_P.seed, size: number = SECTOR_P.size, library: readonly TileDef[] = POOL_LIBRARY): PoolsPlan {
  const lib = loadPoolLibrary(library);
  for (const name of POOL_DOOR_NAMES) if (!lib.some((e) => e.def.role === "door" && e.def.name === name)) throw new Error(`pools: the library needs a door tile named "${name}"`);
  if (lib.some((e) => SPINE_ROLES.has(e.def.role))) throw new Error("pools: the library still carries river pieces — the Poolrooms have no rivers now");

  // ---- THE LANDING, near the middle: the level grows out of its doorways, in
  // three zones by distance from its door (pools-vocab ZONE_RADII)
  const R1 = size * ZONE_RADII.baths;
  const R2 = size * ZONE_RADII.arcades;
  let best: { g: Gen; landing: { x: number; y: number }; attempts: number; unmet: string[]; linked: number } | null = null;
  let attempts = 0;
  for (let attempt = 0; attempt < 24; attempt++) {
    attempts = attempt + 1;
    const built = growFrom(lib, size, seed, attempt, R1, R2);
    if (!best || (built.unmet.length < best.unmet.length) || (built.unmet.length === best.unmet.length && built.g.area > best.g.area)) best = { ...built, attempts };
    if (!built.unmet.length && built.g.area >= FILL * 0.8 * size * size) break;
  }
  const g = best!.g;
  const unmet = best!.unmet;
  const linked = best!.linked;
  const loops = closeLoops(g, size);
  g.compact();
  const built = materialize(g, seed);
  return { ...built, insts: g.insts, tiles: g.tiles, landing: best!.landing, loops: loops + linked, links: linked, attempts, unmet };
}

/** Which zone a point is in, by its distance from The Landing's door. */
export function zoneAt(x: number, y: number, landing: { x: number; y: number }, size: number): PoolZone {
  const d = Math.hypot(x - landing.x, y - landing.y);
  return d < size * ZONE_RADII.baths ? "baths" : d < size * ZONE_RADII.arcades ? "arcades" : "deep";
}

/** One attempt: The Landing near the middle, then the branches. */
function growFrom(lib: PoolLibEntry[], size: number, seed: number, attempt: number, R1: number, R2: number): { g: Gen; landing: { x: number; y: number }; unmet: string[]; linked: number } {
  const g = new Gen(size);
  const lRnd = rngFor(seed, `pp6:landing:${attempt}`);
  const le = pick(lRnd, lib.filter((e) => e.def.role === "door" && e.def.name === POOL_DOOR_NAMES[0]));
  const lt = pick(lRnd, le.variants);
  const jitter = (): number => Math.round((lRnd() - 0.5) * size * 0.1);
  const l0 = g.place(le, lt, (size >> 1) - (lt.w >> 1) + jitter(), (size >> 1) - (lt.h >> 1) + jitter(), false, -1, 0);
  const dp = lt.pieces.find((p) => p.k === "door")!;
  const landing = { x: l0.x + dp.x + 0.5, y: l0.y + dp.y + 0.5 };
  const zone = (c: Cand): string => {
    const d = Math.hypot(c.x + c.t.w / 2 - landing.x, c.y + c.t.h / 2 - landing.y);
    return d < R1 ? "baths" : d < R2 ? "arcades" : "deep";
  };
  const setOf = (e: PoolLibEntry): string => (Array.isArray(e.def.set) ? e.def.set[0] : e.def.set) ?? "any";
  const inZone = (c: Cand): boolean => setOf(c.e) === "any" || setOf(c.e) === zone(c);
  const spareOf = (filter: (inst: PoolInst) => boolean): { id: number; k: number }[] => {
    const out: { id: number; k: number }[] = [];
    for (const inst of g.live()) {
      if (!filter(inst)) continue;
      g.tiles[inst.id].sockets.forEach((_, k) => inst.joined[k] < 0 && out.push({ id: inst.id, k }));
    }
    return out;
  };

  // ---- BRANCHES  // ---- BRANCHES
  const bRnd = rngFor(seed, `pp6:branches:${attempt}`);
  const byRole = (roles: string[]): PoolLibEntry[] => lib.filter((e) => roles.includes(e.def.role));
  const halls = byRole(["hall"]);
  const corridors = byRole(["corridor"]);
  const rooms = byRole(["room"]);
  // ---- CLOSING LOOPS: a chain of passages from one spare doorway that lands
  // exactly on another, found by an A* search over the library's two-door
  // passages. Only between parts of the level that are far apart by walking:
  // a ring round one room is not a loop anyone uses. (Pipe Dreams' linker,
  // with the floor profile in place of the deck.)
  let linked = 0;
  const cRnd = rngFor(seed, `pp6:close:${attempt}`);
  const hops = (from: number): Int32Array => {
    const d = new Int32Array(g.insts.length).fill(-1);
    d[from] = 0;
    const q = [from];
    for (let h = 0; h < q.length; h++) for (const j of g.insts[q[h]].joined) if (j >= 0 && !g.dead[j] && d[j] < 0) ((d[j] = d[q[h]] + 1), q.push(j));
    return d;
  };
  const frontOf = (S: { x: number; y: number; side: Side }): [number, number] => [S.x + DX[S.side], S.y + DY[S.side]];
  const spareLinks = (w: number): { id: number; k: number }[] => {
    const out: { id: number; k: number }[] = [];
    for (const inst of g.live()) g.tiles[inst.id].sockets.forEach((so, k) => inst.joined[k] < 0 && so.w === w && inst.role !== "room" && inst.role !== "door" && out.push({ id: inst.id, k }));
    return out;
  };
  type ChainPiece = { e: PoolLibEntry; t: Tile; a: number; b: number };
  const chainBySide = (w: number): ChainPiece[][] => {
    const bySide: ChainPiece[][] = [[], [], [], []];
    // the linker's chains go anywhere, so only passages drawn for anywhere
    for (const e of corridors) {
      if (e.area > 90 || setOf(e) !== "any") continue;
      for (const t of e.variants) {
        const ks = t.sockets.map((so, k) => (so.w === w ? k : -1)).filter((k) => k >= 0);
        if (ks.length !== 2) continue;
        bySide[t.sockets[ks[0]].side].push({ e, t, a: ks[0], b: ks[1] });
        bySide[t.sockets[ks[1]].side].push({ e, t, a: ks[1], b: ks[0] });
      }
    }
    return bySide;
  };
  const link = (o: { w: number; minD: number; maxD: number; minHops: number; budget: number; expand: number }): void => {
    const pieces = chainBySide(o.w);
    let budget = o.budget;
    for (const A of shuffle(cRnd, spareLinks(o.w))) {
      if (budget <= 0) break;
      if (g.dead[A.id] || g.insts[A.id].joined[A.k] >= 0) continue;
      const SA = g.sock(A.id, A.k);
      const [ax, ay] = frontOf(SA);
      const d = hops(A.id);
      const targets = spareLinks(o.w)
        .filter((B) => B.id !== A.id && (d[B.id] < 0 || d[B.id] >= o.minHops))
        .map((B) => ({ ...B, S: g.sock(B.id, B.k) }))
        .filter((B) => sameProf(B.S.prof, SA.prof))
        .map((B) => ({ ...B, dist: Math.abs(frontOf(B.S)[0] - ax) + Math.abs(frontOf(B.S)[1] - ay) }))
        .filter((B) => B.dist >= o.minD && B.dist <= o.maxD)
        .sort((a, b) => a.dist - b.dist)
        .slice(0, 2);
      for (const B of targets) {
        budget--;
        const [bx, by] = frontOf(B.S);
        const want = opp(B.S.side);
        interface Node {
          x: number;
          y: number;
          side: Side;
          g: number;
          f: number;
          parent: Node | null;
          piece: (ChainPiece & { ox: number; oy: number }) | null;
        }
        const heur = (x: number, y: number): number => Math.abs(x - bx) + Math.abs(y - by);
        const heap: Node[] = [];
        const hpush = (nd: Node): void => {
          heap.push(nd);
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
        hpush({ x: SA.x, y: SA.y, side: SA.side, g: 0, f: heur(ax, ay), parent: null, piece: null });
        const seen = new Set<string>();
        let goal: Node | null = null;
        let expanded = 0;
        while (heap.length && expanded < o.expand && !goal) {
          const cur = hpop();
          const key = `${cur.x},${cur.y},${cur.side}`;
          if (seen.has(key)) continue;
          seen.add(key);
          expanded++;
          for (const pc of pieces[opp(cur.side)]) {
            const sa = pc.t.sockets[pc.a];
            const ox = cur.x + DX[cur.side] - sa.x;
            const oy = cur.y + DY[cur.side] - sa.y;
            if (!g.fits(pc.t, ox, oy)) continue;
            const sb = pc.t.sockets[pc.b];
            const nd: Node = { x: ox + sb.x, y: oy + sb.y, side: sb.side, g: cur.g + (pc.t.w * pc.t.h) / o.w + 2, f: 0, parent: cur, piece: { ...pc, ox, oy } };
            if (nd.x === bx && nd.y === by && nd.side === want) {
              goal = nd;
              break;
            }
            const [fx, fy] = [nd.x + DX[nd.side], nd.y + DY[nd.side]];
            nd.f = nd.g + heur(fx, fy) * 1.6;
            hpush(nd);
          }
        }
        if (!goal) continue;
        // realise it — the search never checked the chain against itself
        const steps: (ChainPiece & { ox: number; oy: number })[] = [];
        for (let nd: Node | null = goal; nd && nd.piece; nd = nd.parent) steps.unshift(nd.piece);
        const placed: number[] = [];
        let tip = { id: A.id, k: A.k };
        let ok = true;
        for (const st of steps) {
          if (!g.fits(st.t, st.ox, st.oy)) {
            ok = false;
            break;
          }
          const inst = g.attach(tip.id, tip.k, { e: st.e, t: st.t, k: st.a, x: st.ox, y: st.oy, score: 0 }, false, -1, g.insts[A.id].depth + 1);
          placed.push(inst.id);
          tip = { id: inst.id, k: st.b };
        }
        if (ok) {
          g.insts[tip.id].joined[tip.k] = B.id;
          g.insts[B.id].joined[B.k] = tip.id;
          linked++;
          break;
        }
        for (const id of placed.reverse()) g.remove(id);
      }
    }
  };

  const minOf = (e: PoolLibEntry): number => e.def.min ?? 0;
  const unmetMin = (e: PoolLibEntry): boolean => minOf(e) > (g.count.get(e.def.id) ?? 0);
  type Front = { id: number; k: number };
  const frontier: Front[] = [];
  const push = (id: number): void => {
    const t = g.tiles[id];
    const ks = t.sockets.map((_, k) => k).filter((k) => g.insts[id].joined[k] < 0);
    for (const k of shuffle(bRnd, ks)) frontier.push({ id, k });
  };
  for (const inst of g.live()) push(inst.id);
  let guard = 0;
  while (frontier.length && g.area < FILL * size * size && guard++ < 8000) {
    const at = Math.min(frontier.length - 1, Math.floor(bRnd() * Math.min(5, frontier.length)));
    const f = frontier.splice(at, 1)[0];
    if (g.dead[f.id] || g.insts[f.id].joined[f.k] >= 0) continue;
    const parent = g.insts[f.id];
    const P = g.sock(f.id, f.k);
    const depth = parent.depth + 1;
    // A ROOM IS ENTERED FROM A PASSAGE OR A HALL, never from another room;
    // the named halls go first while there is room for them. Every room
    // stands in its own zone (a passage or a small room, `any`, anywhere).
    const fromRoom = parent.role === "room";
    let pool: PoolLibEntry[];
    if (P.w >= 3) pool = [...halls, ...corridors, ...(fromRoom ? [] : rooms.filter((e) => e.base.sockets.some((s) => s.w >= 3)))];
    else pool = fromRoom ? [] : [...rooms, ...corridors];
    void depth;
    const cands = g.candidates(f.id, f.k, pool, inZone);
    if (!cands.length) continue;
    for (const c of cands) {
      const seen = g.count.get(c.e.def.id) ?? 0;
      c.score = (c.e.def.weight ?? 1) * (0.5 + bRnd()) * 4 + g.aligned(c) * 6 + (unmetMin(c.e) ? 40 : 0) - seen * 1.4 + (c.e.def.role === "hall" ? 7 : c.e.def.role === "corridor" ? -3 : 0);
    }
    cands.sort((a, b) => b.score - a.score);
    const inst = g.attach(f.id, f.k, cands[0], false, -1, depth);
    push(inst.id);
  }
  // any named hall still owed: hang it on any spare doorway in its zone
  const unmet: string[] = [];
  for (const e of lib.filter((q) => unmetMin(q))) {
    while (unmetMin(e)) {
      let done = false;
      for (const sp of shuffle(bRnd, spareOf(() => true))) {
        const cs = g.candidates(sp.id, sp.k, [e], inZone, true);
        if (!cs.length) continue;
        g.attach(sp.id, sp.k, pick(bRnd, cs), false, -1, g.insts[sp.id].depth + 1);
        done = true;
        break;
      }
      if (!done) {
        unmet.push(e.def.id);
        break;
      }
    }
  }

  // ---- THE PRUNE: a passage whose only joined door is the one it hangs from
  // is a finger into the rock. Repeat until nothing more falls off.
  for (let changed = true; changed; ) {
    changed = false;
    for (const inst of g.live()) {
      if (inst.role !== "corridor") continue;
      if (inst.joined.filter((j) => j >= 0).length > 1) continue;
      g.remove(inst.id);
      changed = true;
    }
  }

  // the long loops first, then short ones between neighbouring branches
  link({ w: 3, minD: 18, maxD: 150, minHops: 8, budget: 160, expand: 4000 });
  link({ w: 3, minD: 4, maxD: 60, minHops: 6, budget: 160, expand: 1200 });

  return { g, landing, unmet, linked };
}

/** LOOPS: spare doorways that meet exactly are opened. */
function closeLoops(g: Gen, size: number): number {
  let loops = 0;
  for (const inst of g.live()) {
    const t = g.tiles[inst.id];
    for (let k = 0; k < t.sockets.length; k++) {
      if (inst.joined[k] >= 0) continue;
      const S = g.sock(inst.id, k);
      const gx = S.x + DX[S.side];
      const gy = S.y + DY[S.side];
      if (gx < 0 || gy < 0 || gx >= size || gy >= size) continue;
      const o = g.occ[gy * size + gx] - 1;
      if (o < 0 || o === inst.id) continue;
      const ot = g.tiles[o];
      for (let q = 0; q < ot.sockets.length; q++) {
        if (g.insts[o].joined[q] >= 0) continue;
        const O = g.sock(o, q);
        if (O.side !== opp(S.side) || O.w !== S.w || O.x !== gx || O.y !== gy || !sameProf(O.prof, S.prof)) continue;
        inst.joined[k] = o;
        g.insts[o].joined[q] = inst.id;
        loops++;
        break;
      }
    }
  }
  return loops;
}

/** Write the world: spaces, floors, water, walls, dressing, doors, the names,
 *  and the reach check. */
function materialize(G: Gen, seed: number): { sector: Sector; space: Int32Array; lostCells: number } {
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
    districts: POOL_TYPES.map((type, id) => ({ id, type: type as DistrictType, x: 0, y: 0, w: size, h: size }) satisfies District),
    landmarks: [],
    doors: [],
    deco: new Uint8Array(n),
    kit: [],
    look: new Uint16Array(n),
    styles: styleTable.styles,
    stairSpecs: stairTable.specs,
  };
  const space = new Int32Array(n);
  const opened = new Set<number>();
  const openEdge = (x: number, y: number, side: Side): void => {
    if (side === 0) opened.add((y * size + x) * 2);
    else if (side === 2) opened.add(((y + 1) * size + x) * 2);
    else if (side === 3) opened.add((y * size + x) * 2 + 1);
    else opened.add((y * size + x + 1) * 2 + 1);
  };
  let nextSpace = 1;
  const doors: Door[] = [];
  for (const inst of G.insts) {
    const t = G.tiles[inst.id];
    const base = nextSpace;
    nextSpace += t.roomKinds.length;
    // the room's look override, worn by its own-type cells only (surfaces.ts)
    const lookCode = styleTable.styleOf(t.def.look);
    const stairCode = stairTable.styleOf(t.def.stairs);
    const ownZone = t.dia.types.indexOf(t.def.type);
    for (let y = 0; y < t.h; y++) {
      for (let x = 0; x < t.w; x++) {
        const i = y * t.w + x;
        if (!t.cell[i]) continue;
        const gi = (inst.y + y) * size + inst.x + x;
        space[gi] = base + t.room[i];
        s.solid[gi] = t.cell[i] === 2 ? 1 : 0;
        // floor no door of the room reaches: drawn, never entered (tiles.ts scenery)
        if (t.scenery[i]) s.background[gi] = 1;
        s.floor[gi] = t.hgt[i];
        if (t.lid[i] !== LID_NONE) (s.lid ??= new Int8Array(n).fill(LID_NONE))[gi] = t.lid[i];
        if (t.stair[i] >= 0) {
          (s.stair ??= new Int8Array(n).fill(STAIR_NONE))[gi] = t.stair[i];
          if (stairCode) (s.stairStyle ??= new Uint8Array(n))[gi] = stairCode;
        }
        s.district[gi] = t.zone[i];
        s.deco![gi] = t.deco[i];
        if (lookCode && t.zone[i] === ownZone) s.look![gi] = lookCode;
      }
    }
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
    for (const d of t.inner) openEdge(inst.x + d.x, inst.y + d.y, d.side);
    t.sockets.forEach((so, k) => {
      if (inst.joined[k] < 0) return;
      const lx = so.side === 0 || so.side === 2 ? 1 : 0;
      for (let q = 0; q < so.w; q++) openEdge(inst.x + so.x + lx * q, inst.y + so.y + (1 - lx) * q, so.side);
    });
    for (const p of t.pieces) if (p.k === "door") doors.push({ x: inst.x + p.x, y: inst.y + p.y, edge: "N", name: inst.name ?? "An Exit" });
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
  // THE DOORS, The Landing first
  s.doors = POOL_DOOR_NAMES.map((name) => {
    const d = doors.find((q) => q.name === name);
    if (!d) throw new Error(`pools: ${name} was never placed`);
    return d;
  });
  buildWater(s);
  // landmarks: the named set pieces, numbered from The Landing
  const d0 = distanceMap(s, s.doors.map((d) => ({ x: d.x, y: d.y })));
  const named = new Map<string, PoolInst[]>();
  for (const inst of G.insts) if (inst.name && inst.role !== "door") named.set(inst.name, [...(named.get(inst.name) ?? []), inst]);
  const reachOf = (inst: PoolInst): number => {
    let best = Infinity;
    for (let y = inst.y; y < inst.y + inst.h; y++) for (let x = inst.x; x < inst.x + inst.w; x++) if (d0[y * size + x] >= 0) best = Math.min(best, d0[y * size + x]);
    return best;
  };
  for (const [name, list] of named) {
    list.sort((a, b) => reachOf(a) - reachOf(b));
    list.forEach((inst, k) => {
      const id = s.landmarks.length + 1;
      s.landmarks.push({ id, name: list.length === 1 ? name : `${name} No. ${k + 1}`, x: inst.x, y: inst.y, w: inst.w, h: inst.h });
      const t = G.tiles[inst.id];
      for (let y = 0; y < t.h; y++) for (let x = 0; x < t.w; x++) if (t.cell[y * t.w + x]) s.landmark[(inst.y + y) * size + inst.x + x] = id;
    });
  }
  // THE REACH CHECK: nothing the doors can't reach survives — and on a map
  // built socket to socket, nothing should need to.
  let lostCells = 0;
  for (let i = 0; i < n; i++) {
    if (s.solid[i] || s.background[i] || d0[i] >= 0) continue;
    lostCells++;
    s.solid[i] = 1;
    s.deco![i] = 0;
  }
  if (lostCells) buildWater(s);
  // wall props onto the face each copy actually backs on to (Nov 2026 polish round)
  seatWallProps(s);
  return { sector: s, space, lostCells };
}

/** Derive water + the effective floor from the one table. */
function buildWater(s: Sector): void {
  const size = s.size;
  if (!s.water) s.water = new Int8Array(size * size);
  if (!s.eff) s.eff = new Int8Array(size * size);
  for (let i = 0; i < size * size; i++) {
    const wet = !s.solid[i] && wetFloor(s.floor[i]);
    s.water[i] = wet ? WATER_TABLE : WATER_NONE;
    s.eff[i] = wet ? WATER_TABLE : effFloor(s.floor[i]);
  }
}

export function generatePoolsSector(seed: number = SECTOR_P.seed, size: number = SECTOR_P.size): Sector {
  return planPoolsSector(seed, size).sector;
}

// ---- Validation -------------------------------------------------------------------

export interface PoolsReport extends SectorReport {
  waterCells: number;
  wetPct: number;
  swimCells: number;
  swimPct: number;
  riverCells: number;
  waterOverSolid: number;
  /** Wet cells whose open-edge neighbour is DRY floor BELOW the table —
   *  impossible under derived water; must be 0. */
  spillEdges: number;
  decoCells: number;
  decoByKind: Record<string, number>;
}

export function validatePoolsSector(s: Sector): PoolsReport {
  const base = validateSector(s);
  const size = s.size;
  const water = s.water!;
  let waterCells = 0;
  let swimCells = 0;
  let riverCells = 0;
  let waterOverSolid = 0;
  let spillEdges = 0;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = idx(size, x, y);
      const w = water[i];
      if (w === WATER_NONE) continue;
      waterCells++;
      if (s.solid[i] || s.floor[i] >= w) waterOverSolid++;
      const depth = w - s.floor[i];
      if (depth >= SWIM_DEPTH_STEPS) swimCells++;
      if (depth >= 5) riverCells++;
      const edges: [number, number, boolean][] = [
        [x, y - 1, !s.wallN[i]],
        [x, y + 1, y + 1 < size && !s.wallN[idx(size, x, y + 1)]],
        [x - 1, y, !s.wallW[i]],
        [x + 1, y, x + 1 < size && !s.wallW[idx(size, x + 1, y)]],
      ];
      for (const [nx, ny, open] of edges) {
        if (!open || nx < 0 || ny < 0 || nx >= size || ny >= size) continue;
        const ni = idx(size, nx, ny);
        if (!s.solid[ni] && water[ni] === WATER_NONE && s.floor[ni] < w) spillEdges++;
      }
    }
  }
  let decoCells = 0;
  const names = Object.entries(DECO);
  const decoByKind: Record<string, number> = {};
  for (let i = 0; i < size * size; i++) {
    const code = s.deco?.[i] ?? 0;
    if (!code) continue;
    decoCells++;
    const kind = names.find(([, v]) => v === code >> 4)?.[0] ?? String(code >> 4);
    decoByKind[kind] = (decoByKind[kind] ?? 0) + 1;
  }
  return {
    ...base,
    waterCells,
    wetPct: base.walkableCells ? (waterCells / base.walkableCells) * 100 : 0,
    swimCells,
    swimPct: base.walkableCells ? (swimCells / base.walkableCells) * 100 : 0,
    riverCells,
    waterOverSolid,
    spillEdges,
    decoCells,
    decoByKind,
  };
}

/** Deep bodies of water with no way to climb out (by the waterline climb
 *  rule, onto somewhere shallower). MUST be 0 — a swimmer in one drowns. */
export function swimTraps(s: Sector): number {
  const size = s.size;
  const water = s.water!;
  const eff = s.eff!;
  const deep = (i: number): boolean => water[i] !== WATER_NONE && water[i] - s.floor[i] >= SWIM_DEPTH_STEPS;
  const seen = new Uint8Array(size * size);
  let trapped = 0;
  for (let start = 0; start < size * size; start++) {
    if (seen[start] || !deep(start)) continue;
    let exit = false;
    const stack = [start];
    seen[start] = 1;
    while (stack.length) {
      const i = stack.pop()!;
      const x = i % size;
      const y = (i / size) | 0;
      const edges: [number, number, boolean][] = [
        [x, y - 1, !s.wallN[i]],
        [x, y + 1, y + 1 < size && !s.wallN[i + size]],
        [x - 1, y, !s.wallW[i]],
        [x + 1, y, x + 1 < size && !s.wallW[i + 1]],
      ];
      for (const [nx, ny, open] of edges) {
        if (!open || nx < 0 || ny < 0 || nx >= size || ny >= size) continue;
        const ni = ny * size + nx;
        if (s.solid[ni] || !heightWalkable(eff[i], eff[ni])) continue;
        if (!deep(ni)) exit = true;
        else if (!seen[ni]) {
          seen[ni] = 1;
          stack.push(ni);
        }
      }
    }
    if (!exit) trapped++;
  }
  return trapped;
}

/** The connected bodies of water (4-connected wet cells), largest first, and
 *  whether each is big and deep enough for an alligator — the same flood the
 *  service runs at boot. */
export function waterBodies(s: Sector): { cells: number; maxDepth: number; gator: boolean; x: number; y: number }[] {
  const N = s.size;
  const water = s.water!;
  const wet = (i: number): boolean => water[i] !== WATER_NONE && !s.solid[i] && !s.background?.[i];
  const seen = new Uint8Array(N * N);
  const out: { cells: number; maxDepth: number; gator: boolean; x: number; y: number }[] = [];
  for (let si = 0; si < N * N; si++) {
    if (!wet(si) || seen[si]) continue;
    let cells = 0;
    let maxDepth = 0;
    let at = si;
    const q = [si];
    seen[si] = 1;
    while (q.length) {
      const c = q.pop()!;
      cells++;
      const d = water[c] - s.floor[c];
      if (d > maxDepth) {
        maxDepth = d;
        at = c;
      }
      const cx = c % N;
      const cy = (c / N) | 0;
      for (const [nx, ny] of [[cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]] as [number, number][]) {
        if (nx < 0 || ny < 0 || nx >= N || ny >= N) continue;
        const ni = ny * N + nx;
        if (wet(ni) && !seen[ni]) {
          seen[ni] = 1;
          q.push(ni);
        }
      }
    }
    out.push({ cells, maxDepth, gator: cells >= GATOR_MIN_CELLS && maxDepth >= GATOR_MIN_DEPTH, x: at % N, y: (at / N) | 0 });
  }
  return out.sort((a, b) => b.cells - a.cells);
}

export { sectorFingerprint, distanceMap };
