// SOLACE SURVIVORZ — WALKING THE FACILITY: the walk grid, which room a spot is in, line of sight,
// and routes from anywhere to anywhere across the three floors (SURVIVORZ.md §3, §9).
//
// Two grids, the same cells (4 a metre): WALK (walk.json — the grey box's walls AND the dressed
// rooms' furniture, scripts/survivorz/sim-walk.mjs) decides where a body may stand; SIGHT
// (sight.json, the same bake — the walls plus the shells' tall opaque architecture: the cell and
// interview partitions, the guard booth's pier) decides what can be seen, so a zombie sees you over a
// desk but not through a partition.
// Doors are not in either grid: a door is STATE (doors.ts). Each door's opening is a short run of
// cells through the wall that this file knows belongs to that door, and a mover's `gate` decides
// whether those cells are passable for it right now.
//
// A ROUTE is planned in two levels, which is what keeps it cheap enough for ninety bodies on one core:
//   1. a portal graph — every door, shaft, ladder and vent is a PORTAL between two (room, floor)
//      nodes — searched by distance (Dijkstra over portals, ~80 of them);
//   2. inside each room on the way, an A* over that room's own cells from portal to portal,
//      string-pulled into straight runs. A run between two portals never changes (furniture doesn't
//      move; doors are at the ends), so those are CACHED forever.
// Pure and deterministic: no clock, no randomness.
import WALK_JSON from "./walk.json";
import SIGHT_JSON from "./sight.json";
import { MAP as SITE_9 } from "./map";
import { FLOOR_Y, VAULT_OPENING, doorPlacement, floorsOf, type Door, type Room } from "../facility";

interface FloorJson { floor: number; y: number; origin: number[]; w: number; h: number; rows: string[] }
interface LinkJson { shaft?: string; grate?: string; upper: { floor: number; at: number[] }; lower: { floor: number; at: number[] }; lift?: boolean; ladder?: boolean;
  /** a stair between two DIFFERENT rooms (Glenridge Hall: the stair hall below, the landing above), in place of one shaft room on both floors */
  upperRoom?: string; lowerRoom?: string;
  /** the stair's own line, [x, y, z] points end to end with its landings: a body on it follows this, not a straight slide */
  line?: number[][] }
export interface SpotJson { room: string; kind: string; floor: number; at: number[]; stand: number[] }
export interface BedJson { id: string; at: number[]; stand: number[]; real: boolean }
const WALK = WALK_JSON as unknown as { res: number; bodyR: number; floors: FloorJson[]; links: LinkJson[]; spots: Record<string, SpotJson>; beds: Record<string, BedJson[]> };
const SIGHT = SIGHT_JSON as unknown as { floors: FloorJson[] };

/** What a Nav is built from. The default is the map in play (the bunker); another map's walk and sight grids and its
 *  rooms and doors can be handed in (scripts/survivorz/glenridge/test-nav.mjs walks Glenridge Hall this way). */
export interface NavSource { walk: typeof WALK; sight: typeof SIGHT; site: { rooms: Room[]; doors: Door[] } }

export const RES = WALK.res;
const INV = 1 / RES;

export interface Floor { floor: number; y: number; ox: number; oz: number; w: number; h: number; base: number }

/** A portal: a way between two (room, floor) nodes. */
export interface Portal {
  idx: number;
  kind: "door" | "stairs" | "lift" | "ladder" | "vent" | "window";
  /** the door it's gated by (index into SITE_9.doors), -1 for an ungated shaft */
  door: number;
  /** the two node ids and, at each, the cell a body stands on to use it */
  na: number; nb: number; ca: number; cb: number;
  /** milliseconds to get through (0 for a door: you walk it) */
  ms: number;
  /** a stair with a shape: [x, y, z] points from the `a` end (the upper) to the `b` end, landings and all */
  line?: number[][];
}

/** how fast a body takes a stair that has a line, metres a second along it */
export const STAIR_PACE = 0.9;

/**
 * Where a body is on a stair with a shape, `u` (0..1) of the way through: from where it stood (`from`), along the
 * stair's line (stored upper end first; turned to run the way the body is going), to where it steps off (`to`).
 * Returns [x, y, z, heading], heading NaN where the piece it is on has no run (straight up).
 */
export function alongStair(line: number[][], from: number[], to: number[], u: number): [number, number, number, number] {
  const n = line.length, down = to[1] < from[1];
  const at = (i: number): number[] => (i === 0 ? from : i === n + 1 ? to : line[down ? i - 1 : n - i]);
  let total = 0;
  for (let i = 1; i <= n + 1; i++) { const p = at(i - 1), q = at(i); total += Math.hypot(q[0] - p[0], q[1] - p[1], q[2] - p[2]); }
  let want = total * Math.min(1, Math.max(0, u));
  for (let i = 1; i <= n + 1; i++) {
    const p = at(i - 1), q = at(i), d = Math.hypot(q[0] - p[0], q[1] - p[1], q[2] - p[2]);
    if (want <= d || i === n + 1) {
      const k = d > 1e-6 ? Math.min(1, want / d) : 1;
      const run = Math.abs(q[0] - p[0]) + Math.abs(q[2] - p[2]) > 0.05;
      return [p[0] + (q[0] - p[0]) * k, p[1] + (q[1] - p[1]) * k, p[2] + (q[2] - p[2]) * k, run ? Math.atan2(q[0] - p[0], q[2] - p[2]) : NaN];
    }
    want -= d;
  }
  return [to[0], to[1], to[2], NaN];
}

/** Whether a door is passable for whoever is asking: 0 no, 1 yes, 2 "only by breaking it" (a zombie). */
export type Gate = (doorIdx: number) => 0 | 1 | 2;

export const NODE_FLOORS = 3;
export const nodeOf = (room: number, floor: number) => room * NODE_FLOORS + floor;
export const roomOfNode = (n: number) => Math.floor(n / NODE_FLOORS);
export const floorOfNode = (n: number) => n % NODE_FLOORS;

/** A planned path: waypoints of [x, z, floor, tag] (tag: -1 plain, 1000+door a door's centre to cross,
 *  2000+portal the near end of a shaft/ladder/vent whose far end is the next waypoint). */
export interface Path { pts: number[]; /** a closed door the route stops at (a zombie to break, or nothing further) */ blockedDoor: number; reached: boolean }

class Heap {
  ids = new Int32Array(1024); keys = new Float64Array(1024); n = 0;
  clear() { this.n = 0; }
  push(id: number, key: number) {
    if (this.n === this.ids.length) {
      const ni = new Int32Array(this.n * 2); ni.set(this.ids); this.ids = ni;
      const nk = new Float64Array(this.n * 2); nk.set(this.keys); this.keys = nk;
    }
    let i = this.n++;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (this.keys[p] <= key) break;
      this.ids[i] = this.ids[p]; this.keys[i] = this.keys[p]; i = p;
    }
    this.ids[i] = id; this.keys[i] = key;
  }
  pop(): number {
    const top = this.ids[0];
    const id = this.ids[--this.n], key = this.keys[this.n];
    let i = 0;
    for (;;) {
      let c = 2 * i + 1;
      if (c >= this.n) break;
      if (c + 1 < this.n && this.keys[c + 1] < this.keys[c]) c++;
      if (this.keys[c] >= key) break;
      this.ids[i] = this.ids[c]; this.keys[i] = this.keys[c]; i = c;
    }
    this.ids[i] = id; this.keys[i] = key;
    return top;
  }
}

/** is (x, z) inside an outline [[x, z], ...]? */
function inPoly(poly: number[][], x: number, z: number): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i][0], zi = poly[i][1], xj = poly[j][0], zj = poly[j][1];
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

function decode(f: FloorJson, into: Uint8Array, base: number) {
  f.rows.forEach((row, j) => {
    let i = 0, num = 0;
    for (let c = 0; c < row.length; c++) {
      const ch = row.charCodeAt(c);
      if (ch >= 48 && ch <= 57) { num = num * 10 + (ch - 48); continue; }
      if (ch === 46) into.fill(1, base + j * f.w + i, base + j * f.w + i + num);
      i += num; num = 0;
    }
  });
}

export class Nav {
  readonly floors: Floor[] = [];
  readonly total: number;
  /** 1 walkable (furniture counted) */
  readonly walk: Uint8Array;
  /** 1 see-through (walls and tall partitions block; furniture doesn't) */
  readonly sight: Uint8Array;
  /** room index per cell, -1 none */
  readonly room: Int16Array;
  /** door index per cell (its opening through the wall), -1 none */
  readonly door: Int16Array;
  readonly rooms: Room[];
  readonly doors: Door[];
  readonly roomIdx = new Map<string, number>();
  readonly doorIdx = new Map<string, number>();
  readonly portals: Portal[] = [];
  /** portals touching each node */
  readonly at: Portal[][] = [];
  /** room-hop distance between rooms (ignoring door state), for "how far from home" */
  readonly hops: Int16Array;
  readonly spots: Record<string, SpotJson>;
  readonly beds: Record<string, BedJson[]>;
  /** each door's centre, world metres (on its shared floor) */
  readonly doorCentre: [number, number, number][] = [];
  private segCache = new Map<string, number[]>();
  private g: Float64Array; private parent: Int32Array; private stamp: Uint32Array; private closedStamp: Uint32Array;
  private gen = 0;
  private heap = new Heap();
  /** room-local search bounds */
  private allowRoom = -1; private allowFloor = -1;

  constructor(src: NavSource = { walk: WALK, sight: SIGHT, site: SITE_9 }) {
    const WALK = src.walk, SIGHT = src.sight, SITE_9 = src.site;      // (shadowing the module's: everything below reads the map handed in)
    this.rooms = SITE_9.rooms; this.doors = SITE_9.doors; this.spots = WALK.spots ?? {}; this.beds = WALK.beds ?? {};
    let base = 0;
    for (const f of WALK.floors) {
      this.floors.push({ floor: f.floor, y: f.y, ox: f.origin[0], oz: f.origin[1], w: f.w, h: f.h, base });
      base += f.w * f.h;
    }
    this.total = base;
    this.walk = new Uint8Array(base);
    this.sight = new Uint8Array(base);
    WALK.floors.forEach((f, i) => decode(f, this.walk, this.floors[i].base));
    SIGHT.floors.forEach((f, i) => decode(f, this.sight, this.floors[i].base));
    this.room = new Int16Array(base).fill(-1);
    this.door = new Int16Array(base).fill(-1);
    this.g = new Float64Array(base);
    this.parent = new Int32Array(base);
    this.stamp = new Uint32Array(base);
    this.closedStamp = new Uint32Array(base);
    this.rooms.forEach((r, i) => this.roomIdx.set(r.id, i));
    this.doors.forEach((d, i) => this.doorIdx.set(d.id, i));

    // which room each cell is in: the map's own labels where it carries them (a house of overlapping outlines says
    // which room each cell is itself), else by outline (a cell on a shared edge goes to the first room listed)
    const labelled = new Set<number>();
    WALK.floors.forEach((f, fi) => {
      const label = (f as { label?: number[][] }).label;
      if (!label) return;
      labelled.add(fi);
      const F = this.floors[fi];
      label.forEach((row, j) => {
        let i = 0;
        for (let q = 0; q < row.length; q += 2) { const n = row[q], v = row[q + 1]; if (v >= 0) this.room.fill(v, F.base + j * F.w + i, F.base + j * F.w + i + n); i += n; }
      });
    });
    this.rooms.forEach((r, ri) => {
      for (const fl of floorsOf(r)) {
        if (labelled.has(fl)) continue;
        const F = this.floors[fl];
        const i0 = Math.max(0, Math.floor((r.rect.x - F.ox) * RES)), i1 = Math.min(F.w - 1, Math.ceil((r.rect.x + r.rect.w - F.ox) * RES));
        const j0 = Math.max(0, Math.floor((r.rect.y - F.oz) * RES)), j1 = Math.min(F.h - 1, Math.ceil((r.rect.y + r.rect.h - F.oz) * RES));
        for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
          const cx = F.ox + (i + 0.5) * INV, cz = F.oz + (j + 0.5) * INV;
          const k = F.base + j * F.w + i;
          if (cx >= r.rect.x && cx <= r.rect.x + r.rect.w && cz >= r.rect.y && cz <= r.rect.y + r.rect.h && this.room[k] < 0 && (!r.poly || inPoly(r.poly, cx, cz))) this.room[k] = ri;
        }
      }
    });

    // each door's opening: the walkable cells through the wall at its centre
    this.doors.forEach((d, di) => {
      if (d.kind === "vent" || d.kind === "grate") { this.doorCentre.push([0, 0, 0]); return; }
      // a window is climbed, not walked: it has a place (where hands go to board it) and no opening of cells
      if (d.kind === "window") { this.doorCentre.push(doorPlacement(SITE_9, d.id)!.centre); return; }
      const p = doorPlacement(SITE_9, d.id)!;
      this.doorCentre.push(p.centre);
      const ra = this.rooms[this.roomIdx.get(d.a)!], rb = this.rooms[this.roomIdx.get(d.b)!];
      const fl = floorsOf(ra).find((x) => floorsOf(rb).includes(x))!;
      const F = this.floors[fl];
      const half = (d.kind === "vault" ? VAULT_OPENING[0] : p.size[0]) / 2;
      const nx = p.normal[0], nz = p.normal[2];
      const ci = Math.floor((p.centre[0] - F.ox) * RES), cj = Math.floor((p.centre[2] - F.oz) * RES);
      for (let j = cj - 8; j <= cj + 8; j++) for (let i = ci - 8; i <= ci + 8; i++) {
        if (i < 0 || j < 0 || i >= F.w || j >= F.h) continue;
        const cx = F.ox + (i + 0.5) * INV, cz = F.oz + (j + 0.5) * INV;
        const dx = cx - p.centre[0], dz = cz - p.centre[2];
        const across = dx * nx + dz * nz, along = -dx * nz + dz * nx;
        // the wall is 0.2 thick and a body keeps 0.3 off it: the band a door can close is ±0.5 across
        if (Math.abs(across) <= 0.5 && Math.abs(along) <= half) {
          const k = F.base + j * F.w + i;
          if (this.walk[k]) this.door[k] = di;
        }
      }
    });

    for (let n = 0; n < this.rooms.length * NODE_FLOORS; n++) this.at.push([]);
    const add = (p: Omit<Portal, "idx">) => {
      const q = { ...p, idx: this.portals.length };
      this.portals.push(q);
      this.at[q.na].push(q); this.at[q.nb].push(q);
    };
    // doors: one portal on the floor the two rooms share, both ends at the opening's middle cell
    this.doors.forEach((d, di) => {
      if (d.kind === "vent" || d.kind === "grate" || d.kind === "window") return;
      const ra = this.roomIdx.get(d.a)!, rb = this.roomIdx.get(d.b)!;
      const fl = floorsOf(this.rooms[ra]).find((x) => floorsOf(this.rooms[rb]).includes(x))!;
      const c = this.doorCentre[di];
      let best = -1, bd = Infinity;
      for (let k = 0; k < this.total; k++) {
        if (this.door[k] !== di) continue;
        const [x, , z] = this.centre(k);
        const dd = (x - c[0]) ** 2 + (z - c[2]) ** 2;
        if (dd < bd) { bd = dd; best = k; }
      }
      if (best < 0) throw new Error(`door ${d.id}: no walkable cell in its opening`);
      add({ kind: "door", door: di, na: nodeOf(ra, fl), nb: nodeOf(rb, fl), ca: best, cb: best, ms: 0 });
    });
    // the shafts, the ladder
    for (const l of WALK.links) {
      const up = this.cellAt(l.upper.floor, l.upper.at[0], l.upper.at[2]), lo = this.cellAt(l.lower.floor, l.lower.at[0], l.lower.at[2]);
      const cu = this.nearestWalk(up), cl = this.nearestWalk(lo);
      if (l.grate && !(l.upperRoom && l.lowerRoom)) {
        const di = this.doorIdx.get(l.grate)!;
        const d = this.doors[di];
        const ra = this.roomIdx.get(d.a)!, rb = this.roomIdx.get(d.b)!;
        const upperRoom = this.rooms[ra].floor === l.upper.floor ? ra : rb, lowerRoom = upperRoom === ra ? rb : ra;
        add({ kind: "ladder", door: di, na: nodeOf(upperRoom, l.upper.floor), nb: nodeOf(lowerRoom, l.lower.floor), ca: cu, cb: cl, ms: 7000 });
      } else if (l.upperRoom && l.lowerRoom) {
        // its line runs from the upper end to the lower; the time through is its length at a stair's pace
        let line = l.line && l.line.length >= 2 ? l.line.map((p) => [p[0], p[1], p[2]]) : undefined;
        if (line && line[0][1] < line[line.length - 1][1]) line = line.reverse();
        let len = 0;
        if (line) for (let i = 1; i < line.length; i++) len += Math.hypot(line[i][0] - line[i - 1][0], line[i][1] - line[i - 1][1], line[i][2] - line[i - 1][2]);
        // (a stair under floor that opens — the hearth stone — is gated by that floor's own "door")
        add({ kind: "stairs", door: l.grate ? this.doorIdx.get(l.grate) ?? -1 : -1, na: nodeOf(this.roomIdx.get(l.upperRoom)!, l.upper.floor), nb: nodeOf(this.roomIdx.get(l.lowerRoom)!, l.lower.floor), ca: cu, cb: cl, ms: line ? Math.round(len / STAIR_PACE * 1000) : 9000, line });
      } else {
        const r = this.roomIdx.get(l.shaft!)!;
        add({ kind: l.lift ? "lift" : "stairs", door: -1, na: nodeOf(r, l.upper.floor), nb: nodeOf(r, l.lower.floor), ca: cu, cb: cl, ms: l.lift ? 18000 : 9000 });
      }
    }
    // windows: a climb over the sill, from the walkable cell nearest it on each side (the wall stays a wall)
    this.doors.forEach((d, di) => {
      if (d.kind !== "window") return;
      const ra = this.roomIdx.get(d.a)!, rb = this.roomIdx.get(d.b)!, p = doorPlacement(SITE_9, d.id)!;
      const A = this.rooms[ra], B = this.rooms[rb];
      // (the placement's normal runs from a into b: stand 0.9 m back from the wall on each side)
      const ca = this.nearestInRoom(ra, A.floor, p.centre[0] - p.normal[0] * 0.9, p.centre[2] - p.normal[2] * 0.9);
      const cb = this.nearestInRoom(rb, B.floor, p.centre[0] + p.normal[0] * 0.9, p.centre[2] + p.normal[2] * 0.9);
      if (ca < 0 || cb < 0) throw new Error(`window ${d.id}: nowhere to stand on one side`);
      // (OVER THE SILL, not through the wall under it: the way in rises to the middle of the sill and comes down the
      // other side. One point, so it reads the same from either side.)
      add({ kind: "window", door: di, na: nodeOf(ra, A.floor), nb: nodeOf(rb, B.floor), ca, cb, ms: 2600, line: [[p.centre[0], p.centre[1] - p.size[1] / 2, p.centre[2]]] });
    });
    // vents: a crawl between two rooms, from the walkable cell nearest the other room
    this.doors.forEach((d, di) => {
      if (d.kind !== "vent") return;
      const ra = this.roomIdx.get(d.a)!, rb = this.roomIdx.get(d.b)!;
      const A = this.rooms[ra], B = this.rooms[rb];
      const ca = this.nearestInRoom(ra, A.floor, B.rect.x + B.rect.w / 2, B.rect.y + B.rect.h / 2);
      const cb = this.nearestInRoom(rb, B.floor, A.rect.x + A.rect.w / 2, A.rect.y + A.rect.h / 2);
      const [ax, , az] = this.centre(ca), [bx, , bz] = this.centre(cb);
      add({ kind: "vent", door: di, na: nodeOf(ra, A.floor), nb: nodeOf(rb, B.floor), ca, cb, ms: Math.round(Math.hypot(ax - bx, az - bz) / 0.7 * 1000) });
    });

    // room hops (every way through, whatever its state)
    const R = this.rooms.length;
    this.hops = new Int16Array(R * R).fill(-1);
    const adj: number[][] = Array.from({ length: R }, () => []);
    for (const p of this.portals) { const a = roomOfNode(p.na), b = roomOfNode(p.nb); if (a !== b) { adj[a].push(b); adj[b].push(a); } }
    for (let s = 0; s < R; s++) {
      const q = [s]; this.hops[s * R + s] = 0;
      for (let h = 0; h < q.length; h++) for (const o of adj[q[h]]) if (this.hops[s * R + o] < 0) { this.hops[s * R + o] = this.hops[s * R + q[h]] + 1; q.push(o); }
    }
  }

  // ---- cells ---------------------------------------------------------------------------------------
  floorOfCell(k: number): number {
    for (let f = this.floors.length - 1; f >= 0; f--) if (k >= this.floors[f].base) return f;
    return 0;
  }
  cellAt(floor: number, x: number, z: number): number {
    const F = this.floors[floor];
    if (!F) return -1;
    const i = Math.floor((x - F.ox) * RES), j = Math.floor((z - F.oz) * RES);
    if (i < 0 || j < 0 || i >= F.w || j >= F.h) return -1;
    return F.base + j * F.w + i;
  }
  /** world [x, y, z] of a cell's centre */
  centre(k: number): [number, number, number] {
    const f = this.floorOfCell(k), F = this.floors[f];
    const local = k - F.base, j = Math.floor(local / F.w), i = local - j * F.w;
    return [F.ox + (i + 0.5) * INV, F.y, F.oz + (j + 0.5) * INV];
  }
  isWalk(k: number): boolean { return k >= 0 && this.walk[k] === 1; }
  /** the nearest walkable cell to k (spiral search) */
  nearestWalk(k: number, room = -1): number {
    if (k >= 0 && this.walk[k] && (room < 0 || this.room[k] === room)) return k;
    const f = this.floorOfCell(Math.max(0, k)), F = this.floors[f];
    const local = Math.max(0, k) - F.base, j0 = Math.floor(local / F.w), i0 = local - j0 * F.w;
    for (let r = 1; r < 80; r++) {
      for (let j = j0 - r; j <= j0 + r; j++) for (let i = i0 - r; i <= i0 + r; i++) {
        if (Math.max(Math.abs(i - i0), Math.abs(j - j0)) !== r || i < 0 || j < 0 || i >= F.w || j >= F.h) continue;
        const kk = F.base + j * F.w + i;
        if (this.walk[kk] && (room < 0 || this.room[kk] === room)) return kk;
      }
    }
    return -1;
  }
  nearestInRoom(room: number, floor: number, x: number, z: number): number {
    const r = this.rooms[room].rect;
    const cx = Math.min(r.x + r.w - 0.5, Math.max(r.x + 0.5, x)), cz = Math.min(r.y + r.h - 0.5, Math.max(r.y + 0.5, z));
    return this.nearestWalk(this.cellAt(floor, cx, cz), room);
  }
  /** a random walkable cell of a room, by a 0..1 pair the caller rolled */
  cellInRoom(room: number, floor: number, u: number, v: number): number {
    const r = this.rooms[room].rect;
    return this.nearestInRoom(room, floor, r.x + 0.5 + u * (r.w - 1), r.y + 0.5 + v * (r.h - 1));
  }
  roomOfCell(k: number): number { return k >= 0 ? this.room[k] : -1; }
  nodeOfCell(k: number): number { const r = this.room[k]; return r < 0 ? -1 : nodeOf(r, this.floorOfCell(k)); }

  // ---- seeing -----------------------------------------------------------------------------------------
  /** Line of sight on one floor through see-through cells, a closed door blocking it.
   *  `doorOpen(i)` says whether door i is open (or broken). */
  sees(floor: number, x0: number, z0: number, x1: number, z1: number, doorOpen: (d: number) => boolean): boolean {
    const F = this.floors[floor];
    let i = Math.floor((x0 - F.ox) * RES), j = Math.floor((z0 - F.oz) * RES);
    const i1 = Math.floor((x1 - F.ox) * RES), j1 = Math.floor((z1 - F.oz) * RES);
    const di = Math.abs(i1 - i), dj = Math.abs(j1 - j), si = i < i1 ? 1 : -1, sj = j < j1 ? 1 : -1;
    let err = di - dj;
    for (let n = 0; n < 400; n++) {
      if (i < 0 || j < 0 || i >= F.w || j >= F.h) return false;
      const k = F.base + j * F.w + i;
      if (!this.sight[k] && !this.walk[k]) return false;
      const d = this.door[k];
      if (d >= 0 && !doorOpen(d)) return false;
      if (i === i1 && j === j1) return true;
      const e2 = 2 * err;
      if (e2 > -dj) { err -= dj; i += si; }
      if (e2 < di) { err += di; j += sj; }
    }
    return false;
  }

  /** Can a body walk the straight line between two cells (same floor), every cell on it (and the
   *  ones a corner-cut would clip) walkable and allowed? */
  walkLine(a: number, b: number, ok: (k: number) => boolean): boolean {
    const f = this.floorOfCell(a);
    const [ax, , az] = this.centre(a), [bx, , bz] = this.centre(b);
    return this.segLine(f, ax, az, bx, bz, ok);
  }
  /** THE EXACT LINE (Nov 13 2026). Is the straight segment from (ax, az) to (bx, bz) on floor `f` walkable all
   *  along, as a body's centre would take it? Every cell the segment touches must be walkable and `ok`, and it never
   *  slips between two refused cells across their shared corner. The old test walked a line of CELLS (Bresenham),
   *  which is not the line a body walks: between two points off their cells' centres (a route's lanes), or along a
   *  wall that runs at 45 degrees (Glenridge Hall's wings), the true line clips a cell the cell-line skipped, and
   *  the body stopped against it — "stuck", over and over, at the foot of the mansion's cellar stair. */
  segLine(f: number, ax: number, az: number, bx: number, bz: number, ok: (k: number) => boolean): boolean {
    const F = this.floors[f];
    const dist = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.ceil(dist / 0.05));
    let pi = -1, pj = -1;
    for (let s = 0; s <= n; s++) {
      const x = ax + (bx - ax) * s / n, z = az + (bz - az) * s / n;
      const i = Math.floor((x - F.ox) * RES), j = Math.floor((z - F.oz) * RES);
      if (i === pi && j === pj) continue;
      if (i < 0 || j < 0 || i >= F.w || j >= F.h) return false;
      const k = F.base + j * F.w + i;
      if (!this.walk[k] || !ok(k)) return false;
      if (pi >= 0 && i !== pi && j !== pj) {
        // across a corner: both cells beside it must be walkable too (no corner-cutting)
        const ka = F.base + pj * F.w + i, kb = F.base + j * F.w + pi;
        if (!this.walk[ka] || !ok(ka) || !this.walk[kb] || !ok(kb)) return false;
      }
      pi = i; pj = j;
    }
    return true;
  }

  // ---- inside one room --------------------------------------------------------------------------------
  /** a cell a room-local search may use: the room's own, or a door opening on its edge */
  private allowed = (k: number): boolean => {
    if (!this.walk[k]) return false;
    const r = this.room[k];
    if (r === this.allowRoom) return true;
    const d = this.door[k];
    if (d < 0) return false;
    const D = this.doors[d];
    return D.a === this.rooms[this.allowRoom].id || D.b === this.rooms[this.allowRoom].id;
  };

  /** A* from a to b inside one room node; the cells on the way, string-pulled. null when walled off. */
  segment(node: number, a: number, b: number, cacheable: boolean, variant = 0): number[] | null {
    const key = cacheable ? `${node}|${a}|${b}|${variant}` : "";
    if (cacheable) { const c = this.segCache.get(key); if (c) return c; }
    this.allowRoom = roomOfNode(node); this.allowFloor = floorOfNode(node);
    this.noiseSeed = variant;
    const out = this.astar(a, b);
    if (out && cacheable) {
      if (this.segCache.size > 6000) this.segCache.clear();
      this.segCache.set(key, out);
    }
    return out;
  }

  /** a walk's own noise (0 none): which side of a desk it goes round (THE WALK MAP's idea, casino walknav.ts) */
  private noiseSeed = 0;
  private noiseAt(k: number): number {
    if (!this.noiseSeed) return 0;
    // coarse — one value a metre square — so a route bends round a thing rather than jittering
    const [x, , z] = this.centre(k);
    let h = (Math.imul(this.noiseSeed, 0x27d4eb2d) ^ Math.imul(Math.floor(x) + 1013, 0x9e3779b1) ^ Math.imul(Math.floor(z) + 7919, 0x85ebca77)) >>> 0;
    h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d) >>> 0;
    h = Math.imul(h ^ (h >>> 12), 0x297a2d39) >>> 0;
    return ((h ^ (h >>> 15)) >>> 0) / 4294967296;
  }

  private astar(a: number, b: number): number[] | null {
    if (a === b) return [a];
    const F = this.floors[this.allowFloor];
    if (!this.allowed(a)) { const n = this.nearestAllowed(a); if (n < 0) return null; a = n; }
    if (!this.allowed(b)) { const n = this.nearestAllowed(b); if (n < 0) return null; b = n; }
    const gen = ++this.gen;
    const heap = this.heap; heap.clear();
    const [bx, , bz] = this.centre(b);
    const h = (k: number) => { const [x, , z] = this.centre(k); const dx = Math.abs(x - bx), dz = Math.abs(z - bz); return (Math.max(dx, dz) + 0.4142 * Math.min(dx, dz)) * RES; };
    this.stamp[a] = gen; this.g[a] = 0; this.parent[a] = -1;
    heap.push(a, h(a));
    const W = F.w;
    let found = false, iter = 0;
    while (heap.n) {
      const k = heap.pop();
      if (this.closedStamp[k] === gen) continue;
      this.closedStamp[k] = gen;
      if (k === b) { found = true; break; }
      if (++iter > 60000) break;
      const local = k - F.base, j = Math.floor(local / W), i = local - j * W;
      for (let d = 0; d < 8; d++) {
        const di = DI[d], dj = DJ[d];
        const ni = i + di, nj = j + dj;
        if (ni < 0 || nj < 0 || ni >= W || nj >= F.h) continue;
        const nk = F.base + nj * W + ni;
        if (this.closedStamp[nk] === gen || !this.allowed(nk)) continue;
        if (di && dj && (!this.allowed(F.base + j * W + ni) || !this.allowed(F.base + nj * W + i))) continue;
        const ng = this.g[k] + (di && dj ? 1.4142 : 1) * (1 + this.noiseAt(nk) * 1.2);
        if (this.stamp[nk] === gen && ng >= this.g[nk]) continue;
        this.stamp[nk] = gen; this.g[nk] = ng; this.parent[nk] = k;
        heap.push(nk, ng + h(nk));
      }
    }
    if (!found) return null;
    const cells: number[] = [];
    for (let k = b; k >= 0; k = this.parent[k]) cells.push(k);
    cells.reverse();
    // string-pull: keep a cell only when the straight line past it would leave the allowed cells
    const out = [cells[0]];
    let anchor = 0;
    for (let i = 2; i < cells.length; i++) {
      if (i - anchor > 60 || !this.walkLine(cells[anchor], cells[i], this.allowed)) { out.push(cells[i - 1]); anchor = i - 1; }
    }
    out.push(cells[cells.length - 1]);
    return out;
  }

  private nearestAllowed(k: number): number {
    const f = this.floorOfCell(k), F = this.floors[f];
    const local = k - F.base, j0 = Math.floor(local / F.w), i0 = local - j0 * F.w;
    for (let r = 1; r < 40; r++) for (let j = j0 - r; j <= j0 + r; j++) for (let i = i0 - r; i <= i0 + r; i++) {
      if (Math.max(Math.abs(i - i0), Math.abs(j - j0)) !== r || i < 0 || j < 0 || i >= F.w || j >= F.h) continue;
      const kk = F.base + j * F.w + i;
      if (this.allowed(kk)) return kk;
    }
    return -1;
  }

  // ---- across the facility -------------------------------------------------------------------------------
  private pDist = new Float64Array(256);
  private pPrev = new Int32Array(256);
  private pEnd = new Int8Array(256);     // which end of portal i we arrived at: 0 = a, 1 = b

  /**
   * A route from cell `from` to cell `to` for a mover whose doors are judged by `gate`.
   * If `to` can't be reached, the route goes as near as it can: to the shut door (or wall of portals)
   * closest to the goal, `blockedDoor` set to that door — the zombie's cue to bang on it.
   * `breakCost` is the extra metres a door the mover can only break costs (zombies).
   */
  route(from: number, to: number, gate: Gate, opts: { nimbleVents?: boolean; breakCost?: number; roomOk?: (room: number) => boolean; variant?: number } = {}): Path | null {
    const sn = this.nodeOfCell(from), gn = this.nodeOfCell(to);
    if (sn < 0 || gn < 0) return null;
    const roomOk = opts.roomOk, variant = opts.variant ?? 0;
    // a mover who plans only with what it knows: no route through, or to, a room it can't picture
    if (roomOk && !roomOk(roomOfNode(gn))) return null;
    if (sn === gn) {
      const seg = this.segment(sn, from, to, false, variant);
      if (!seg) return null;
      return { pts: this.toPts(seg, -1), blockedDoor: -1, reached: true };
    }
    const P = this.portals.length;
    const dist = this.pDist.fill(Infinity, 0, P), prev = this.pPrev.fill(-1, 0, P), end = this.pEnd;
    const heap = this.heap; heap.clear();
    const [fx, , fz] = this.centre(from), [tx, , tz] = this.centre(to);
    const passOf = (p: Portal): number => {
      if (p.kind === "vent" && !opts.nimbleVents) return 0;
      if (roomOk && (!roomOk(roomOfNode(p.na)) || !roomOk(roomOfNode(p.nb)))) return -1;
      if (p.door < 0) return 1;
      return gate(p.door);
    };
    const costOf = (p: Portal, pass: number) => (p.ms / 1000) * 1.2 + (pass === 2 ? (opts.breakCost ?? 40) : 0);
    // blocked portals we could stand at: [portal, cost to reach its near side, end index]
    let bestBlocked = -1, bestBlockedScore = Infinity, bestBlockedEnd = 0, bestBlockedFrom = -1;
    const consider = (p: Portal, endAt: number, cost: number, fromP: number) => {
      const c = endAt === 0 ? p.ca : p.cb;
      const [x, , z] = this.centre(c);
      const score = cost + Math.hypot(x - tx, z - tz) * 1.5 + (this.floorOfCell(c) !== this.floorOfCell(to) ? 50 : 0);
      if (score < bestBlockedScore) { bestBlockedScore = score; bestBlocked = p.idx; bestBlockedEnd = endAt; bestBlockedFrom = fromP; }
    };
    for (const p of this.at[sn]) {
      const endAt = p.na === sn ? 0 : 1;
      const c = endAt === 0 ? p.ca : p.cb;
      const [x, , z] = this.centre(c);
      const d0 = Math.hypot(x - fx, z - fz);
      const pass = passOf(p);
      if (pass < 0) continue;
      if (!pass) { consider(p, endAt, d0, -1); continue; }
      const d = d0 + costOf(p, pass);
      if (d < dist[p.idx]) { dist[p.idx] = d; end[p.idx] = endAt; prev[p.idx] = -1; heap.push(p.idx, d); }
    }
    let goalPortal = -1, goalCost = Infinity;
    const done = new Uint8Array(P);
    while (heap.n) {
      const pi = heap.pop();
      if (done[pi]) continue;
      done[pi] = 1;
      const p = this.portals[pi];
      const outEnd = end[pi] === 0 ? 1 : 0;     // we come out at the other end
      const outNode = outEnd === 0 ? p.na : p.nb, outCell = outEnd === 0 ? p.ca : p.cb;
      const [ox, , oz] = this.centre(outCell);
      if (outNode === gn) {
        const c = dist[pi] + Math.hypot(ox - tx, oz - tz);
        if (c < goalCost) { goalCost = c; goalPortal = pi; }
      }
      for (const q of this.at[outNode]) {
        if (q.idx === pi) continue;
        const qEnd = q.na === outNode ? 0 : 1;
        const qc = qEnd === 0 ? q.ca : q.cb;
        const [qx, , qz] = this.centre(qc);
        const step = dist[pi] + Math.hypot(qx - ox, qz - oz);
        const pass = passOf(q);
        if (pass < 0) continue;
        if (!pass) { consider(q, qEnd, step, pi); continue; }
        const d = step + costOf(q, pass);
        if (d < dist[q.idx]) { dist[q.idx] = d; end[q.idx] = qEnd; prev[q.idx] = pi; heap.push(q.idx, d); }
      }
    }
    // the portal chain (each with the end we enter by)
    const chain: [number, number][] = [];
    let blockedDoor = -1, reached = true, last: number;
    if (goalPortal >= 0) {
      for (let p = goalPortal; p >= 0; p = prev[p]) chain.push([p, end[p]]);
      last = to;
    } else {
      if (bestBlocked < 0) return null;
      reached = false;
      for (let p = bestBlockedFrom; p >= 0; p = prev[p]) chain.push([p, end[p]]);
      const bp = this.portals[bestBlocked];
      blockedDoor = bp.door;
      last = bestBlockedEnd === 0 ? bp.ca : bp.cb;
    }
    chain.reverse();
    const pts: number[] = [];
    let cur = from, node = sn;
    for (const [pi, e] of chain) {
      const p = this.portals[pi];
      const nearCell = e === 0 ? p.ca : p.cb, farCell = e === 0 ? p.cb : p.ca, farNode = e === 0 ? p.nb : p.na;
      const seg = this.segment(node, cur, nearCell, cur !== from, variant);
      if (!seg) return null;
      this.appendPts(pts, seg, p.kind === "door" ? 1000 + p.door : 2000 + pi);
      if (p.kind !== "door") this.appendPts(pts, [farCell], -1);
      cur = farCell; node = farNode;
    }
    const seg = this.segment(node, cur, last, false, variant);
    if (!seg) return null;
    this.appendPts(pts, seg, -1);
    return { pts, blockedDoor, reached };
  }

  /**
   * A LANE OF ITS OWN (the casino walk map's lanes(), adapted — src/casino/walknav.ts): a route's
   * corners pushed sideways by this walk's own offset, and a long straight run given a gentle bend
   * somewhere along it — each kept only where the walk stays on walkable cells of the same room. Door
   * crossings, both ends of a shaft and the last point never move. So two people walking between the
   * same two rooms take two lines, not one behind the other. `rand` is the caller's seeded roll.
   */
  lanes(pts: number[], rand: () => number): number[] {
    const n = pts.length / 4;
    if (n < 2) return pts;
    const lane = (rand() * 2 - 1) * 0.75;
    const fixed = (i: number) => i === 0 || i === n - 1 || pts[i * 4 + 3] !== -1 || Nav.tagPortal(pts[(i - 1) * 4 + 3]) >= 0;
    const okLine = (ax: number, az: number, bx: number, bz: number, f: number) => {
      const a = this.cellAt(f, ax, az), b = this.cellAt(f, bx, bz);
      if (a < 0 || b < 0 || !this.walk[a] || !this.walk[b]) return false;
      const ra = this.room[a] >= 0 ? this.room[a] : this.room[b];
      if (ra < 0) return false;
      const da = this.door[a], db = this.door[b];
      // (the exact line between the two POINTS, not between their cells: a lane's point is off its cell's middle)
      return this.segLine(f, ax, az, bx, bz, (k) => (this.door[k] >= 0 ? this.door[k] === da || this.door[k] === db : this.room[k] === ra));
    };
    const out: number[] = [pts[0], pts[1], pts[2], pts[3]];
    for (let i = 1; i < n; i++) {
      const L = out.length;
      const px = out[L - 4], pz = out[L - 3], pf = out[L - 2];
      let cx = pts[i * 4], cz = pts[i * 4 + 1];
      const cf = pts[i * 4 + 2], tag = pts[i * 4 + 3];
      const crossing = Nav.tagPortal(out[L - 1]) >= 0;   // the step from a shaft's near end to its far end
      if (!fixed(i) && cf === pf && pts[(i + 1) * 4 + 2] === cf) {
        const nx = pts[(i + 1) * 4], nz = pts[(i + 1) * 4 + 1];
        const dx = nx - px, dz = nz - pz, l = Math.hypot(dx, dz) || 1;
        // (its own side first, then the other: the exact line refuses a side a wall's corner sits on, and a walk
        // with no lane at all shares its line with whoever else is going that way)
        lanes: for (let k = lane; Math.abs(k) > 0.1; k *= 0.5) {
          for (const kk of [k, -k]) {
            const qx = cx - (dz / l) * kk, qz = cz + (dx / l) * kk;
            if (okLine(px, pz, qx, qz, cf) && okLine(qx, qz, nx, nz, cf)) { cx = qx; cz = qz; break lanes; }
          }
        }
      }
      // a long straight run bends a little, somewhere along it
      const dx = cx - px, dz = cz - pz, len = Math.hypot(dx, dz);
      if (cf === pf && !crossing && len > 5) {
        const u = 0.3 + rand() * 0.4;
        for (let k = (rand() * 2 - 1) * 0.9; Math.abs(k) > 0.12; k *= 0.5) {
          const qx = px + dx * u - (dz / len) * k, qz = pz + dz * u + (dx / len) * k;
          if (okLine(px, pz, qx, qz, cf) && okLine(qx, qz, cx, cz, cf)) { out.push(qx, qz, cf, -1); break; }
        }
      }
      out.push(cx, cz, cf, tag);
    }
    return out;
  }

  private toPts(cells: number[], tagLast: number): number[] {
    const pts: number[] = [];
    this.appendPts(pts, cells, tagLast);
    return pts;
  }
  /** append cells as waypoints; the LAST one gets `tagLast` (a door or a portal's near end) */
  private appendPts(pts: number[], cells: number[], tagLast: number) {
    for (let i = 0; i < cells.length; i++) {
      const [x, , z] = this.centre(cells[i]);
      const f = this.floorOfCell(cells[i]);
      const n = pts.length;
      // drop a duplicate of the last waypoint
      if (n >= 4 && pts[n - 4] === x && pts[n - 3] === z && pts[n - 2] === f) { if (i === cells.length - 1) pts[n - 1] = tagLast; continue; }
      pts.push(x, z, f, i === cells.length - 1 ? tagLast : -1);
    }
  }

  /** The nearest "door" portal waypoint tag → the door index (or -1). */
  static tagDoor(tag: number): number { return tag >= 1000 && tag < 2000 ? tag - 1000 : -1; }
  static tagPortal(tag: number): number { return tag >= 2000 ? tag - 2000 : -1; }
  /** room-hop distance between two rooms (-1 unreachable) */
  hop(a: number, b: number): number { return this.hops[a * this.rooms.length + b]; }
  floorY(f: number): number { return this.floors[f]?.y ?? FLOOR_Y[f] ?? 0; }
  /** the height a body stands at on this cell: its room's own floor where the room has one (Glenridge Hall: the
   *  great hall two steps down, the grounds below the door sills), else its floor's */
  yAt(k: number): number {
    const r = k >= 0 ? this.room[k] : -1;
    const y = r >= 0 ? this.rooms[r].y : undefined;
    return y !== undefined ? y : this.floorY(this.floorOfCell(k));
  }
}

const DI = [1, -1, 0, 0, 1, 1, -1, -1];
const DJ = [0, 0, 1, -1, 1, -1, 1, -1];
