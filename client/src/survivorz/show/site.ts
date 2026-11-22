// SOLACE SURVIVORZ — THE SHOW: the map as the screen needs it. Pure (three-free).
//
// THE MAP IN PLAY. The show draws whichever map the run is on (the snapshot names it: sim/wire.ts Snapshot.map).
// `useMap(id)` chooses it — before the scene is built — and everything here answers for that map from then on:
// where every room is, which door joins which, the baked sets it is drawn from, a room's own floor height.
//
// THE BUNKER (docs/survivorz/BUNKER.md): Civil Defence Shelter 14 (src/survivorz/bunker-map.ts, in the sim's shape
// as src/survivorz/sim/map.ts MAP). One floor, rooms square to the grid, and ONE baked set ("bunker") holds every
// room; a room's wing (entrance · commons · dorms · command · utility) is kept beside it for the sound.
//
// GLENRIDGE HALL (docs/survivorz/GLENRIDGE.md): src/survivorz/glenridge-site.json and glenridge-walk.json, written
// by scripts/survivorz/glenridge/walkmap.py. Three floors and the grounds, wings at 45 degrees (a room is an
// OUTLINE, and "which room is this point in" is read off the walk map's own room labels), every room with a floor
// height of its own, and FOUR baked sets (ground, upper, basement, outside) that are all drawn at once: the house
// is seen from its grounds and the grounds through its windows.
import { MAP as BUNKER_SITE } from "../../../../src/survivorz/sim/map";
import { BUNKER } from "../../../../src/survivorz/bunker-map";
import { FLOOR_Y as BUNKER_FLOOR_Y, doorPlacement, type Door, type Facility, type Room } from "../../../../src/survivorz/facility";
import GLEN_SITE_JSON from "../../../../src/survivorz/glenridge-site.json";
import GLEN_WALK_JSON from "../../../../src/survivorz/glenridge-walk.json";
import GLEN_SIGHT_JSON from "../../../../src/survivorz/glenridge-sight.json";
import BUNKER_WALK_JSON from "../../../../src/survivorz/sim/walk.json";
import BUNKER_SIGHT_JSON from "../../../../src/survivorz/sim/sight.json";
import type { ZoneId } from "../room/lobby";

/** a baked set the show streams (room/lobby.ts ZONES): the bunker is one, the mansion four */
export type SiteZone = ZoneId;
export type Wing = "entrance" | "commons" | "dorms" | "command" | "utility" | "house" | "grounds";
export type V3 = [number, number, number];
export type MapId = "bunker" | "glenridge";

/** the baked set → the map's set and back (one and the same since the mansion: kept for the callers that ask) */
export const SITE_OF = new Proxy({} as Record<ZoneId, SiteZone>, { get: (_t, k) => k as SiteZone });
export const BAKED_OF = new Proxy({} as Record<SiteZone, ZoneId>, { get: (_t, k) => k as ZoneId });

/** how high a room stands above its floor, for "is this point in it" */
const ROOM_H = 5;

export interface RoomInfo {
  id: string; zone: SiteZone; wing: Wing; floor: number;
  /** the room's own floor height (the bunker: 0; the mansion: each room's) */
  fy: number;
  y0: number; y1: number; x0: number; x1: number; z0: number; z1: number;
  /** its outline when it is not its bounding box (the mansion's rooms) */
  poly?: number[][];
  outdoor?: boolean;
  room: Room;
}

interface LabelFloor { y: number; ox: number; oz: number; w: number; h: number; cells: Int16Array }
export interface GridJson { res: number; floors: { floor: number; y: number; origin: number[]; w: number; h: number; rows: string[]; label?: number[][] }[] }

interface SiteDef {
  id: MapId;
  facility: Facility;
  rooms: RoomInfo[];
  /** the baked sets it is drawn from; `all`: every one of them is kept on screen (the mansion) */
  zones: ZoneId[]; all: boolean;
  floorY: number[];
  ceiling: Map<string, number>;
  walk: GridJson; sight: GridJson;
  /** the walk map's room labels, floor by floor, top first (the mansion); none = rooms are their boxes */
  labels: LabelFloor[] | null;
  /** what the overlay calls the place */
  brand: string; title: string; sub: string;
}

export function inPoly(poly: number[][], x: number, z: number): boolean {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i], [xj, zj] = poly[j];
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) c = !c;
  }
  return c;
}

function bunkerDef(): SiteDef {
  const rooms: RoomInfo[] = BUNKER_SITE.rooms.map((r) => ({
    id: r.id, zone: "bunker", wing: r.zone as Wing, floor: 0, fy: 0, y0: -0.6, y1: ROOM_H,
    x0: r.rect.x, x1: r.rect.x + r.rect.w, z0: r.rect.y, z1: r.rect.y + r.rect.h, room: r,
  }));
  return {
    id: "bunker", facility: BUNKER_SITE, rooms, zones: ["bunker"], all: false, floorY: [...BUNKER_FLOOR_Y],
    ceiling: new Map(BUNKER.rooms.map((r) => [r.id, (r.height ?? (r.kind === "corridor" ? 3.0 : 3.2)) - 0.25])),
    walk: BUNKER_WALK_JSON as unknown as GridJson, sight: BUNKER_SIGHT_JSON as unknown as GridJson, labels: null,
    brand: "THE BUNKER", title: "Civil Defence Shelter 14", sub: "one hour",
  };
}

function glenDef(): SiteDef {
  const site = GLEN_SITE_JSON as unknown as { rooms: (Room & { h?: number })[]; doors: Door[] };
  const walk = GLEN_WALK_JSON as unknown as GridJson;
  const floorY = walk.floors.map((f) => f.y);
  const zoneOf = (r: Room): ZoneId => (r.outdoor ? "glen-outside" : r.floor === 0 ? "glen-upper" : r.floor === 2 ? "glen-basement" : "glen-ground") as ZoneId;
  const rooms: RoomInfo[] = site.rooms.map((r) => {
    const fy = r.y ?? floorY[r.floor] ?? 0;
    return {
      id: r.id, zone: zoneOf(r), wing: r.outdoor ? "grounds" : "house", floor: r.floor, fy, y0: fy - 0.6, y1: fy + (r.outdoor ? 30 : Math.max(ROOM_H, (r.h ?? 3) + 0.5)),
      x0: r.rect.x, x1: r.rect.x + r.rect.w, z0: r.rect.y, z1: r.rect.y + r.rect.h, poly: r.poly, outdoor: !!r.outdoor, room: r,
    };
  });
  const labels: LabelFloor[] = walk.floors.map((f) => {
    const cells = new Int16Array(f.w * f.h).fill(-1);
    (f.label ?? []).forEach((row, j) => { let i = 0; for (let q = 0; q < row.length; q += 2) { if (row[q + 1] >= 0) cells.fill(row[q + 1], j * f.w + i, j * f.w + i + row[q]); i += row[q]; } });
    return { y: f.y, ox: f.origin[0], oz: f.origin[1], w: f.w, h: f.h, cells };
  });
  return {
    id: "glenridge", facility: { id: "glenridge-v1", zones: [{ id: "glenridge", name: "Glenridge Hall", expectWeek: 1, emergencyPower: true }], rooms: site.rooms, doors: site.doors, start: "great-hall" } as Facility,
    rooms, zones: ["glen-ground", "glen-upper", "glen-basement", "glen-outside"] as ZoneId[], all: true, floorY,
    // (under the ceiling by a hand: the great hall is open to its roof, the grounds to the sky)
    ceiling: new Map(site.rooms.map((r) => [r.id, r.outdoor ? 14 : Math.max(2.1, (r.h ?? 2.8) - 0.3)])),
    walk, sight: GLEN_SIGHT_JSON as unknown as GridJson, labels,
    brand: "GLENRIDGE HALL", title: "Glenridge Hall", sub: "one night, in the storm",
  };
}

const DEFS: Record<MapId, () => SiteDef> = { bunker: bunkerDef, glenridge: glenDef };
const made = new Map<MapId, SiteDef>();
let cur: SiteDef = bunkerDef(); made.set("bunker", cur);

/** the map in play */
export let MAP_ID: MapId = "bunker";
export let ROOMS: RoomInfo[] = cur.rooms;
export let DOORS: Door[] = cur.facility.doors;
export let SITE_9: Facility = cur.facility;
export let FLOOR_Y: readonly number[] = cur.floorY;
let ROOM_BY_ID = new Map(ROOMS.map((r) => [r.id, r]));
let NEIGHBOURS = new Map<string, Set<string>>();
function index(): void {
  ROOM_BY_ID = new Map(ROOMS.map((r) => [r.id, r]));
  NEIGHBOURS = new Map();
  for (const d of DOORS) for (const [a, b] of [[d.a, d.b], [d.b, d.a]]) {
    if (!NEIGHBOURS.has(a)) NEIGHBOURS.set(a, new Set());
    NEIGHBOURS.get(a)!.add(b);
  }
}
index();

/** CHOOSE THE MAP IN PLAY (the snapshot's `map`; anything unknown is the bunker). True if it changed: whatever was
 *  built for the old one (the scene, its zones, the director's geometry) must be built again. */
export function useMap(id: string | null | undefined): boolean {
  const want: MapId = id === "glenridge" ? "glenridge" : "bunker";
  if (want === MAP_ID) return false;
  if (!made.has(want)) made.set(want, DEFS[want]());
  cur = made.get(want)!;
  MAP_ID = want; ROOMS = cur.rooms; DOORS = cur.facility.doors; SITE_9 = cur.facility; FLOOR_Y = cur.floorY;
  index();
  return true;
}
/** the baked sets the map in play is drawn from, and whether all of them stay on screen */
export const zonesInPlay = (): ZoneId[] => cur.zones;
export const allZonesAlways = (): boolean => cur.all;
/** the map's walk and sight grids (the director's geometry), and its room labels if it has them */
export const gridsInPlay = () => ({ walk: cur.walk, sight: cur.sight, labels: cur.labels });
export const brandInPlay = () => ({ brand: cur.brand, title: cur.title, sub: cur.sub });

export const roomInfo = (id: string | null | undefined): RoomInfo | undefined => (id ? ROOM_BY_ID.get(id) : undefined);

/** The room a point stands in, or null between rooms. */
export function roomAt(x: number, y: number, z: number): RoomInfo | null {
  const L = cur.labels;
  if (L) {
    // the floor a height stands on: the highest at or below it (a head 2 m up is still on its floor)
    let f = L.length - 1, by = -Infinity;
    for (let i = 0; i < L.length; i++) if (L[i].y <= y + 0.7 && L[i].y > by) { by = L[i].y; f = i; }
    const F = L[f], i = Math.floor((x - F.ox) * cur.walk.res), j = Math.floor((z - F.oz) * cur.walk.res);
    if (i >= 0 && j >= 0 && i < F.w && j < F.h) { const r = F.cells[j * F.w + i]; if (r >= 0) return ROOMS[r] ?? null; }
    for (const r of ROOMS) if (r.floor === f && x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1 && (!r.poly || inPoly(r.poly, x, z))) return r;
    return null;
  }
  for (const r of ROOMS) if (x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1) return r;
  return null;
}

/** THE ROOM A POINT IS IN OR OVER: the room at it, or the one below it when it hangs in the air of a tall room or
 *  over a stair (the upper floor has no cells there, so `roomAt` says "between rooms"). For the camera: over the
 *  Great Hall's void or climbing a stair it counted as out of doors, and the lightning lit the furniture at full
 *  (the code review's D-8). */
export function roomUnder(x: number, y: number, z: number): RoomInfo | null {
  for (let d = 0; d <= 9; d += 1.5) {
    const r = roomAt(x, y - d, z);
    // (under ITS ceiling, at the point's own height too: a camera above the roof of a two-storey part read as
    // inside the upper room: the re-grade's N4)
    if (r && y <= r.y1 + 0.05) return r;
  }
  return null;
}

/** ROOFS THAT ARE NO ROOM'S (the re-grade's N2): a cover standing out of doors, open at the sides. The rain stops
 *  at it; the ear and the lightning still count it as out of doors. Glenridge Hall's porte-cochere, outside the
 *  front door: its posts stand at x ±4.1 from z 3.8 to 10.0 and its boarded ceiling is at 3.02 m
 *  (scripts/survivorz/glenridge/build.py, the "porte" group). */
export interface Cover { x0: number; x1: number; z0: number; z1: number; top: number }
const COVERS_OF: Record<string, Cover[]> = { glenridge: [{ x0: -4.2, x1: 4.2, z0: 3.6, z1: 10.2, top: 3.02 }] };
export const coversOf = (): Cover[] => COVERS_OF[MAP_ID] ?? [];

/** A ROOM WITH A ROOF AND NO WALL TO THE WEATHER (a porch, the arcade): the rain is heard and seen from it as from
 *  out of doors, and it does not fall in it. One word for it, used by the sound's rain bed and the picture's rain
 *  switch alike: they disagreed, and from a porch the rain was heard and not seen (the re-grade's N3). */
export const OPEN_AIR = /porch|arcade/;
export const underTheSky = (r: RoomInfo | null | undefined): boolean => !r || !!r.outdoor || OPEN_AIR.test(r.id);

/** Open floor at a point: a cell a body can stand on (the walk map's: walls, furniture and the edges of rooms are
 *  not). Where a map has no cell grid, any point inside a room. */
export function walkableAt(x: number, y: number, z: number): boolean {
  const L = cur.labels;
  if (!L) return !!roomAt(x, y, z);
  let f = L.length - 1, by = -Infinity;
  for (let i = 0; i < L.length; i++) if (L[i].y <= y + 0.7 && L[i].y > by) { by = L[i].y; f = i; }
  const F = L[f], i = Math.floor((x - F.ox) * cur.walk.res), j = Math.floor((z - F.oz) * cur.walk.res);
  return i >= 0 && j >= 0 && i < F.w && j < F.h && F.cells[j * F.w + i] >= 0;
}

/** A room's floor height under a point. */
export function floorOf(room: RoomInfo, _y: number): number { return room.fy; }

export interface ZoneBox { min: V3; max: V3; floors: number[] }

/** a set's box in the world, from its rooms */
export function zoneBox(z: SiteZone): ZoneBox {
  const min: V3 = [Infinity, Infinity, Infinity], max: V3 = [-Infinity, -Infinity, -Infinity]; const floors = new Set<number>();
  for (const r of ROOMS) {
    if (r.zone !== z) continue;
    min[0] = Math.min(min[0], r.x0); max[0] = Math.max(max[0], r.x1);
    min[1] = Math.min(min[1], r.y0); max[1] = Math.max(max[1], r.y1);
    min[2] = Math.min(min[2], r.z0); max[2] = Math.max(max[2], r.z1);
    floors.add(r.floor);
  }
  if (!floors.size) return { min: [0, -0.6, 0], max: [0, ROOM_H, 0], floors: [0] };
  return { min, max, floors: [...floors] };
}

/** how far a point is from a box (0 inside) */
export function distToBox(p: V3, b: ZoneBox): number {
  const dx = Math.max(b.min[0] - p[0], 0, p[0] - b.max[0]);
  const dz = Math.max(b.min[2] - p[2], 0, p[2] - b.max[2]);
  return Math.hypot(dx, dz);
}

/** The doors a screen draws a leaf in (the rest are openings, the blast door's own prop, a window, floor that opens). */
export const LEAF_KINDS = new Set<Door["kind"]>(["door", "keycard", "keypad", "power", "lockdown", "safe", "sealed"]);
export const placeOf = (id: string) => doorPlacement(SITE_9, id);

/** THE WALLS BETWEEN TWO POINTS, for the sound (engine.setOcclusion): the same room none, a room through one
 *  door one, further two. */
export function wallsBetween(a: V3, b: V3): number {
  const ra = roomAt(a[0], a[1], a[2]), rb = roomAt(b[0], b[1], b[2]);
  if (!ra || !rb) return ra === rb ? 0 : 1;
  if (ra.id === rb.id) return 0;
  return NEIGHBOURS.get(ra.id)?.has(rb.id) ? 1 : 2;
}

/** THE CEILINGS: each room's height from the map, a little under it for the light fittings a camera mustn't rise
 *  into (BUNKER.md: 3.2 a room, 3.0 a hall, unless it says; the mansion's are its own). */
export const ceilingOf = (id: string): number => cur.ceiling.get(id) ?? 2.95;

/** rooms joined by a door: for paths */
export const neighbours = (id: string): string[] => [...(NEIGHBOURS.get(id) ?? [])];
