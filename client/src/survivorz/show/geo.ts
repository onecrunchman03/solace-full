// SOLACE SURVIVORZ — THE DIRECTOR'S GROUND TRUTH: where a camera may stand and what it can see.
//
// Pure (no three.js, no DOM, no imports at run time) so a plain Node harness can drive it
// (scripts/checks/test_survivorz_director.mjs). It reads the same two grids the simulation does:
//   · WALK (src/survivorz/sim/walk.json — the walls AND the dressed rooms' furniture): a camera
//     stands only on a walkable cell, with walkable floor round it, so it is never inside a wall,
//     a desk or a shelf;
//   · SIGHT (src/survivorz/sim/sight.json — the walls and the tall partitions, never furniture): the
//     line from a camera at head height to a body crosses no wall or partition (it may cross a desk:
//     the camera is above it).
// Rooms come from SITE_9 (facility-map.ts) through `roomsFrom`, so the director, the scene and the
// simulation agree on where every room is and on which of the three floors (y 0 / -8 / -16).

export type V3 = [number, number, number];

interface GridFloorJson { floor: number; y: number; origin: number[]; w: number; h: number; rows: string[] }
export interface GridFile { res: number; floors: GridFloorJson[] }

interface GridFloor { floor: number; y: number; ox: number; oz: number; w: number; h: number; cells: Uint8Array }

/** A room as the director needs it: its box on its floor (a shaft spans floors downward). */
export interface GeoRoom { id: string; zone: string; floor: number; spans: number; x0: number; x1: number; z0: number; z1: number; y0: number; y1: number;
  /** its place in the map's room list (the walk map's labels name rooms by it) */
  idx: number; outdoor?: boolean }

interface SiteRoomLike { id: string; zone: string; floor: number; spans?: number; rect: { x: number; y: number; w: number; h: number }; fy?: number; outdoor?: boolean }
/** the walk map's room labels for one floor (show/site.ts): which room each cell is, -1 none */
export interface LabelGrid { y: number; ox: number; oz: number; w: number; h: number; cells: Int16Array }

/** SITE_9's rooms → boxes (the same rule show/site.ts uses: a room is 5 m tall, a shaft reaches
 *  down through every floor it spans). */
export function roomsFrom(rooms: readonly SiteRoomLike[], floorY: readonly number[]): GeoRoom[] {
  return rooms.map((r, idx) => {
    const spans = r.spans ?? 1;
    // (a room with a floor height of its own stands on it: the mansion's hall is two steps down, its grounds lower)
    const y0 = (r.fy ?? floorY[r.floor + spans - 1] ?? 0) - 0.6, y1 = (r.fy ?? floorY[r.floor] ?? 0) + (r.outdoor ? 30 : 5);
    return { id: r.id, zone: r.zone, floor: r.floor, spans, x0: r.rect.x, x1: r.rect.x + r.rect.w, z0: r.rect.y, z1: r.rect.y + r.rect.h, y0, y1, idx, outdoor: r.outdoor };
  });
}

function decode(f: GridFloorJson): Uint8Array {
  const out = new Uint8Array(f.w * f.h);
  f.rows.forEach((row, j) => {
    let i = 0, num = 0;
    for (let c = 0; c < row.length; c++) {
      const ch = row.charCodeAt(c);
      if (ch >= 48 && ch <= 57) { num = num * 10 + (ch - 48); continue; }
      if (ch === 46) out.fill(1, j * f.w + i, j * f.w + i + num);
      i += num; num = 0;
    }
  });
  return out;
}

/** How far round a camera the floor must be clear (metres): a lens in a doorway's jamb or hard
 *  against a wall films the wall. */
export const CAM_CLEAR_M = 0.35;

export class Geo {
  readonly res: number;
  private walkF: GridFloor[];
  private sightF: GridFloor[];
  readonly rooms: GeoRoom[];
  private byId = new Map<string, GeoRoom>();

  private labels: LabelGrid[] | null;
  constructor(walk: GridFile, sight: GridFile, rooms: GeoRoom[], labels: LabelGrid[] | null = null) {
    this.labels = labels;
    this.res = walk.res;
    const load = (g: GridFile): GridFloor[] => g.floors.map((f) => ({ floor: f.floor, y: f.y, ox: f.origin[0], oz: f.origin[1], w: f.w, h: f.h, cells: decode(f) }));
    this.walkF = load(walk);
    this.sightF = load(sight);
    this.rooms = rooms;
    for (const r of rooms) this.byId.set(r.id, r);
  }

  room(id: string | null | undefined): GeoRoom | undefined { return id ? this.byId.get(id) : undefined; }

  /** the room a cell is labelled as (a map with labels: Glenridge Hall, whose rooms are outlines and overlap as boxes) */
  private labelAt(x: number, y: number, z: number): number {
    const L = this.labels;
    if (!L) return -2;
    const F = L[this.floorIdx(y)];
    if (!F) return -1;
    const i = Math.floor((x - F.ox) * this.res), j = Math.floor((z - F.oz) * this.res);
    return i < 0 || j < 0 || i >= F.w || j >= F.h ? -1 : F.cells[j * F.w + i];
  }
  /** IS THIS POINT IN THAT ROOM, `m` metres clear of its edge? By the room's box where rooms are boxes; by the walk
   *  map's labels where they are outlines (the point and four round it must all be the room's own floor). */
  inRoom(r: GeoRoom, x: number, y: number, z: number, m: number): boolean {
    if (!this.labels) return x > r.x0 + m && x < r.x1 - m && z > r.z0 + m && z < r.z1 - m;
    if (this.labelAt(x, y, z) !== r.idx) return false;
    for (const [dx, dz] of [[m, 0], [-m, 0], [0, m], [0, -m]]) { const l = this.labelAt(x + dx, y, z + dz); if (l !== r.idx && l !== -1) return false; }
    return true;
  }

  /** The room a point stands in (its height decides the floor); a shaft loses to an ordinary room. */
  roomAt(x: number, y: number, z: number): GeoRoom | null {
    const l = this.labelAt(x, y, z);
    if (l >= 0) return this.rooms[l] ?? null;
    let best: GeoRoom | null = null;
    for (const r of this.rooms) {
      if (x < r.x0 || x > r.x1 || z < r.z0 || z > r.z1 || y < r.y0 || y > r.y1) continue;
      if (!best || best.spans > r.spans) best = r;
    }
    return best;
  }

  /** The floor (index) a height stands on: the highest floor at or below it (a camera 2 m up still
   *  stands on its floor). */
  floorIdx(y: number): number {
    let best = -1, by = -Infinity;
    for (let i = 0; i < this.walkF.length; i++) {
      const fy = this.walkF[i].y;
      if (fy <= y + 0.7 && fy > by) { by = fy; best = i; }
    }
    return best < 0 ? this.walkF.length - 1 : best;
  }
  floorY(y: number): number { return this.walkF[this.floorIdx(y)]?.y ?? 0; }

  private cell(F: GridFloor | undefined, x: number, z: number): number {
    if (!F) return 0;
    const i = Math.floor((x - F.ox) * this.res), j = Math.floor((z - F.oz) * this.res);
    if (i < 0 || j < 0 || i >= F.w || j >= F.h) return 0;
    return F.cells[j * F.w + i];
  }

  /** Is the floor under this point walkable (walls and furniture counted)? */
  walkable(x: number, y: number, z: number): boolean { return this.cell(this.walkF[this.floorIdx(y)], x, z) === 1; }

  /** Walkable here and in a ring of `r` round it: a camera may stand here. */
  clear(x: number, y: number, z: number, r = CAM_CLEAR_M): boolean {
    if (!this.walkable(x, y, z)) return false;
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2;
      if (!this.walkable(x + Math.cos(a) * r, y, z + Math.sin(a) * r)) return false;
    }
    return true;
  }

  /** A clear line (walls only) from a to b, on a's floor. Two different floors never see each other. */
  sees(a: V3, b: V3): boolean {
    const fa = this.floorIdx(a[1]), fb = this.floorIdx(b[1]);
    if (fa !== fb) return false;
    const F = this.sightF[fa];
    const d = Math.hypot(b[0] - a[0], b[2] - a[2]);
    const step = 0.5 / this.res;   // half a cell
    const n = Math.max(1, Math.ceil(d / step));
    // the last 0.3 m is the body itself (its cell can be a wall's edge in a doorway)
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      if (d * (1 - t) < 0.3) break;
      if (this.cell(F, a[0] + (b[0] - a[0]) * t, a[2] + (b[2] - a[2]) * t) !== 1) return false;
    }
    return true;
  }
}
