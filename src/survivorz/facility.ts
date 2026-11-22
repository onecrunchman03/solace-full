// SOLACE SURVIVORZ — the facility as LOGIC: zones, rooms, the openings between
// them, and the spots inside them the show needs (SURVIVORZ.md §3).
//
// This is deliberately not geometry. The facility is a real 3D set built from
// a bought kit (the quality bar in §3), and nothing about that set exists yet,
// so the server's opinion of the map is a graph: rooms, and doors / doorways /
// vents between them, each with the rule that decides who may pass. A room's
// `rect` is a SCHEMATIC position in metres, for the Watch page's drawing and as
// the anchor the set is built around; the navigation mesh made from the set's
// floor replaces it for walking when the kit lands. Everything that decides
// the game — zones opening by week, keycards, power, safe rooms, the vault —
// lives here and in doors.ts, and does not change when the art does.
//
// Pure: imports nothing, so the harness and the Watch route read it directly.

export type ZoneId =
  // THE BUNKER's wings (bunker-map.ts Wing, Nov 2026)
  | "entrance" | "commons" | "dorms" | "command" | "utility"
  // GLENRIDGE HALL: one zone, the house (sim/mapdef.ts)
  | "glenridge"
  // the old Halcyon facility's (kept only while the show's client still draws it; removed in step 4)
  | "lobby" | "residential" | "labs" | "medical"
  | "security" | "power" | "containment" | "deep";

export interface Zone {
  id: ZoneId;
  name: string;
  /** The week (1-4) the design EXPECTS a group to get in (§3's table ✱). Not a
   *  lock: zones open as they're earned (Josh, 2026-10-22: "earn them"), so
   *  this is only the pacing target the director and the readouts measure
   *  against. */
  expectWeek: number;
  /** On emergency power from day one; every other zone waits for its breaker. */
  emergencyPower: boolean;
}

export type RoomKind =
  | "room" | "corridor"
  | "safe"      // a safe room: zombies never enter, beds + a linked box
  | "sealed"    // where a newcomer is found (§6); shut until the admin unseals it
  | "exit";     // outside the vault: leaving the show

export interface Rect { x: number; y: number; w: number; h: number }

export type SpotKind =
  | "bed" | "box"            // safe rooms: six beds, one linked storage box
  | "terminal"               // a log (the lore-drive system, re-dressed)
  | "loot"                   // a container (lockers, desks, freezers, cabinets)
  | "keycard"                // where a keycard of `tier` is found
  | "breaker"                // throws a zone's power on (`zone`)
  | "override"               // the vault override (the escape)
  | "route-map"              // the route out of the far tunnels, mapped (the escape)
  | "lab-bench"              // working lab equipment for Lazarus (the cure; needs power)
  | "tissue"                 // where an experiment zombie's sample is taken (the cure)
  | "final-file"             // the last file (the truth)
  // THE BUNKER (bunker-map.ts BunkerSpotKind): the crank wheel, the radio set, the part and note places, the armory racks
  | "crank" | "radio" | "part" | "note" | "armory";

export interface Spot {
  id: string;
  kind: SpotKind;
  /** keycard tier (1-3) for a "keycard" spot */
  tier?: number;
  /** the zone a "breaker" powers */
  zone?: ZoneId;
}

export interface Room {
  id: string;
  name: string;
  zone: ZoneId;
  kind: RoomKind;
  /** The room's footprint in world metres (x east, y = z south), on its floor. */
  rect: Rect;
  /** Which floor (0 the upper, clean face; 1 the industrial guts; 2 the deep), FLOOR_Y deep. */
  floor: number;
  /** A stairwell or lift shaft runs through this many floors, downward from `floor` (default 1). */
  spans?: number;
  spots: Spot[];
  /** The room's outline [[x, z], ...] when it is not a rectangle square to the grid (Glenridge Hall's wings stand
   *  at 45 degrees). `rect` is then the outline's bounding box. Absent in the bunker. */
  poly?: number[][];
  /** the room's own floor height, where it is not its floor's (Glenridge Hall: the great hall is two steps down, the
   *  grounds half a metre below the door sills) */
  y?: number;
  /** out of doors: the grounds (never "inside" for the count, the dark of night, the rain) */
  outdoor?: boolean;
  /** the floor a foot lands on here, as the build laid it (Glenridge: scripts/survivorz/glenridge/floors.py) */
  surface?: string;
}

/** Each floor's level in metres (Josh, 2026-10-22: three floors, joined only by explicit links). */
export const FLOOR_Y = [0, -8, -16] as const;

/** The floors a room stands on (a shaft stands on several). */
export function floorsOf(r: Pick<Room, "floor" | "spans">): number[] {
  return Array.from({ length: r.spans ?? 1 }, (_, i) => r.floor + i);
}

export type DoorKind =
  | "doorway"   // an opening; nothing to lock or break
  | "door"      // an ordinary door: open, shut, lock from inside, barricade, break
  | "keycard"   // a steel door that needs a card of `tier`; zombies can't open or break it
  | "keypad"    // a steel door with a four-digit keypad (the bunker's radio room): whoever knows the code
  | "power"     // a powered door (airlocks, lab doors): opens only with the zone's power on
  | "lockdown"  // a specimen cell: shut while the zone's lockdown holds
  | "safe"      // a safe room's door: zombies can never open, break or pass it
  | "sealed"    // a newcomer's room: shut until the admin unseals it
  | "grate"     // a maintenance grate: a crowbar pries it open, once
  | "vault"     // the blast door: opens only in the override's one-time window
  | "vent"      // a crawl route: survivors with nimble 7+ only, zombies never
  | "window";   // a broken window (Glenridge Hall): the dead climb in through it until it is boarded; the living never use it

export interface Door {
  id: string;
  kind: DoorKind;
  a: string;
  b: string;
  name?: string;
  tier?: number;
  /** for "power" and "lockdown": the zone whose power / lockdown decides it */
  zone?: ZoneId;
  /** a safe room's first opening needs this card tier, after that it's home */
  findTier?: number;
  /** what it's made of, for the effects (default by kind: an ordinary or
   *  sealed door is wood, everything else metal) */
  material?: DoorMaterial;
  /** a window's sill above the floor, metres (the page's climb) */
  sill?: number;
  /** Where the door is, given outright, for a map whose walls are not shared rectangle edges (Glenridge Hall).
   *  Absent in the bunker, where doorPlacement works it out from the two rooms. */
  place?: DoorPlacement;
  /** what the leaf is, for a map whose page hangs its own (Glenridge Hall: scripts/survivorz/glenridge/door-styles.mjs),
   *  and how high an arched door's head rises above its transom */
  style?: string;
  rise?: number;
  /** the opening as BUILT, measured off the zone files (scripts/survivorz/glenridge/door-fit.mjs): clear width,
   *  how far its middle is from the plan's along the door's `across`, the head and the floor (world y) */
  fit?: { w: number; shift: number; top: number; sill: number };
}

export type DoorMaterial = "wood" | "metal" | "glass";

export function doorMaterial(d: Door): DoorMaterial {
  if (d.material) return d.material;
  return d.kind === "door" || d.kind === "sealed" ? "wood" : "metal";
}

/** Width and height in metres, by kind, until the set's own doors replace them. */
const DOOR_SIZE: Record<DoorKind, [number, number]> = {
  doorway: [1.6, 2.4], door: [0.9, 2.1], keycard: [1.2, 2.2], keypad: [1.0, 2.1], power: [1.4, 2.4],
  lockdown: [2.4, 2.6], safe: [1.0, 2.1], sealed: [0.9, 2.1], grate: [1.0, 1.0],
  vault: [2.0, 2.58], vent: [0.6, 0.6], window: [1.6, 1.5],
};
/** The vault door is Dekogon's Bank Vault Door at its real size (props-spec "vault-door"): the
 *  wall hole above is its FRAME, 2.0 x 2.58 m; the way through is the frame's opening. */
export const VAULT_OPENING: [number, number] = [1.07, 2.12];
/** How high the opening's centre sits off the floor. */
const DOOR_LIFT: Partial<Record<DoorKind, number>> = { vent: 2.6, grate: 0.5 };

export interface DoorPlacement {
  /** world metres: x east, y up, z the schematic's y (south) */
  centre: [number, number, number];
  /** unit vector pointing from room `a` into room `b` */
  normal: [number, number, number];
  size: [number, number];
}

/** Where a door is, which way it faces and how big it is: on the wall two rooms share, on the
 *  floor they share (a shaft's floors count), at that floor's level. A door between rooms with no
 *  floor in common is a VERTICAL link (a ladder through a grate): it sits in the middle of where
 *  the two footprints overlap, facing down, at the upper floor. Pure arithmetic. */
export function doorPlacement(f: MapShape, doorId: string): DoorPlacement | null {
  const d = f.doors.find((x) => x.id === doorId);
  const ra = f.rooms.find((r) => r.id === d?.a), rb = f.rooms.find((r) => r.id === d?.b);
  if (!d || !ra || !rb) return null;
  if (d.place) return d.place;
  const a = ra.rect, b = rb.rect;
  const [w, h] = DOOR_SIZE[d.kind];
  const shared = floorsOf(ra).filter((x) => floorsOf(rb).includes(x));
  const level = FLOOR_Y[(shared.length ? Math.min(...shared) : Math.min(ra.floor, rb.floor))] ?? 0;
  const y = level + (DOOR_LIFT[d.kind] ?? h / 2);
  const E = 0.01;
  const span = (lo1: number, hi1: number, lo2: number, hi2: number) => [Math.max(lo1, lo2), Math.min(hi1, hi2)];
  if (!shared.length) {
    const [x0, x1] = span(a.x, a.x + a.w, b.x, b.x + b.w), [z0, z1] = span(a.y, a.y + a.h, b.y, b.y + b.h);
    const upper = ra.floor < rb.floor ? ra : rb;
    return { centre: [(x0 + x1) / 2, FLOOR_Y[upper.floor] ?? 0, (z0 + z1) / 2], normal: [0, upper === ra ? -1 : 1, 0], size: [w, w] };
  }
  // a shared vertical edge (a's right on b's left, or the other way round)
  if (Math.abs(a.x + a.w - b.x) < E || Math.abs(b.x + b.w - a.x) < E) {
    const [lo, hi] = span(a.y, a.y + a.h, b.y, b.y + b.h);
    if (hi - lo > E) {
      const east = Math.abs(a.x + a.w - b.x) < E;
      return { centre: [east ? a.x + a.w : a.x, y, (lo + hi) / 2], normal: [east ? 1 : -1, 0, 0], size: [w, h] };
    }
  }
  // a shared horizontal edge
  if (Math.abs(a.y + a.h - b.y) < E || Math.abs(b.y + b.h - a.y) < E) {
    const [lo, hi] = span(a.x, a.x + a.w, b.x, b.x + b.w);
    if (hi - lo > E) {
      const south = Math.abs(a.y + a.h - b.y) < E;
      return { centre: [(lo + hi) / 2, y, south ? a.y + a.h : a.y], normal: [0, 0, south ? 1 : -1], size: [w, h] };
    }
  }
  const ca = [a.x + a.w / 2, a.y + a.h / 2], cb = [b.x + b.w / 2, b.y + b.h / 2];
  const dx = cb[0] - ca[0], dz = cb[1] - ca[1];
  const len = Math.hypot(dx, dz) || 1;
  return { centre: [(ca[0] + cb[0]) / 2, y, (ca[1] + cb[1]) / 2], normal: [dx / len, 0, dz / len], size: [w, h] };
}

/** A room's centre on the floor, world metres. */
export function roomCentre(f: Facility, roomId: string): [number, number, number] | null {
  const room = f.rooms.find((x) => x.id === roomId);
  if (!room) return null;
  const r = room.rect;
  return [r.x + r.w / 2, FLOOR_Y[room.floor] ?? 0, r.y + r.h / 2];
}

/** What the geometry needs of a map: the old Halcyon facility and the bunker (bunker-map.ts) both fit. */
export interface MapShape {
  rooms: Pick<Room, "id" | "rect" | "floor" | "spans">[];
  doors: Door[];
}

export interface Facility {
  id: string;
  zones: Zone[];
  rooms: Room[];
  doors: Door[];
  /** the room the survivors start in */
  start: string;
}

// ---- the rules of the shape (SURVIVORZ.md §3) -------------------------------

export const SAFE_ROOMS = 3;
export const SEALED_ROOMS = 6;
export const BEDS_PER_SAFE = 6;
export const MAX_SURVIVORS = 6;
export const VENT_NIMBLE = 7;
export const KEYCARD_TIERS = 3;
export const WEEKS = 4;

/** Every way the map breaks the design, in words. An empty list is a valid map. */
export function facilityProblems(f: Facility): string[] {
  const out: string[] = [];
  const zones = new Map(f.zones.map((z) => [z.id, z]));
  const rooms = new Map<string, Room>();
  for (const z of f.zones) if (!(z.expectWeek >= 1 && z.expectWeek <= WEEKS)) out.push(`zone ${z.id} expects week ${z.expectWeek}`);
  if (f.zones.length !== 8) out.push(`${f.zones.length} zones, the design has 8`);
  for (const r of f.rooms) {
    if (rooms.has(r.id)) out.push(`room id ${r.id} used twice`);
    rooms.set(r.id, r);
    if (!zones.has(r.zone)) out.push(`room ${r.id} is in an unknown zone ${r.zone}`);
  }
  const spotIds = new Set<string>();
  for (const r of f.rooms) for (const s of r.spots) {
    if (spotIds.has(s.id)) out.push(`spot id ${s.id} used twice`);
    spotIds.add(s.id);
    if (s.kind === "keycard" && !(s.tier! >= 1 && s.tier! <= KEYCARD_TIERS)) out.push(`keycard spot ${s.id} has no tier`);
    if (s.kind === "breaker" && !zones.has(s.zone!)) out.push(`breaker ${s.id} powers no zone`);
    if ((s.kind === "bed" || s.kind === "box") && r.kind !== "safe") out.push(`${s.kind} ${s.id} is outside a safe room`);
  }
  const doorIds = new Set<string>();
  const touches = new Map<string, number>();
  for (const d of f.doors) {
    if (doorIds.has(d.id)) out.push(`door id ${d.id} used twice`);
    doorIds.add(d.id);
    for (const end of [d.a, d.b]) {
      if (!rooms.has(end)) out.push(`door ${d.id} leads to unknown room ${end}`);
      touches.set(end, (touches.get(end) ?? 0) + 1);
    }
    if (d.a === d.b) out.push(`door ${d.id} leads from ${d.a} to itself`);
    if (d.kind === "keycard" && !(d.tier! >= 1 && d.tier! <= KEYCARD_TIERS)) out.push(`keycard door ${d.id} has no tier`);
    if ((d.kind === "power" || d.kind === "lockdown") && !zones.has(d.zone!)) out.push(`${d.kind} door ${d.id} names no zone`);
    const ra = rooms.get(d.a), rb = rooms.get(d.b);
    const safeEnd = ra?.kind === "safe" || rb?.kind === "safe";
    if (safeEnd && d.kind !== "safe" && d.kind !== "vent") out.push(`door ${d.id} into a safe room is a ${d.kind}, not a safe door`);
    if (d.kind === "safe" && !safeEnd) out.push(`safe door ${d.id} isn't on a safe room`);
    if (d.kind === "vent" && safeEnd) out.push(`vent ${d.id} reaches a safe room (a crawler would come through it)`);
    const sealedEnd = ra?.kind === "sealed" || rb?.kind === "sealed";
    if (sealedEnd && d.kind !== "sealed") out.push(`door ${d.id} into a sealed room is a ${d.kind}`);
    if (d.kind === "vault" && !(ra?.kind === "exit" || rb?.kind === "exit")) out.push(`vault door ${d.id} doesn't lead outside`);
  }
  for (const r of f.rooms) if (!touches.get(r.id)) out.push(`room ${r.id} has no way in`);

  const safe = f.rooms.filter((r) => r.kind === "safe");
  if (safe.length !== SAFE_ROOMS) out.push(`${safe.length} safe rooms, the design has ${SAFE_ROOMS}`);
  for (const r of safe) {
    const beds = r.spots.filter((s) => s.kind === "bed").length;
    const boxes = r.spots.filter((s) => s.kind === "box").length;
    if (beds !== BEDS_PER_SAFE) out.push(`safe room ${r.id} has ${beds} beds, not ${BEDS_PER_SAFE}`);
    if (boxes !== 1) out.push(`safe room ${r.id} has ${boxes} storage boxes, not 1`);
  }
  if (!safe.some((r) => r.zone === "residential")) out.push("no safe room in the Residential Wing (the first home)");
  if (!safe.some((r) => r.zone === "medical" || r.zone === "security")) out.push("no safe room by Medical / Security");
  if (!safe.some((r) => r.zone === "power")) out.push("no safe room in Power & Maintenance");
  const sealed = f.rooms.filter((r) => r.kind === "sealed").length;
  if (sealed !== SEALED_ROOMS) out.push(`${sealed} sealed rooms, the design has ${SEALED_ROOMS}`);
  if (f.rooms.filter((r) => r.kind === "exit").length !== 1) out.push("there must be exactly one way out (the vault)");
  if (f.doors.filter((d) => d.kind === "vault").length !== 1) out.push("there must be exactly one vault door");
  const start = rooms.get(f.start);
  if (!start || start.zone !== "lobby") out.push("the survivors don't start in the Vault Lobby");

  const all = f.rooms.flatMap((r) => r.spots);
  for (const k of ["override", "route-map", "lab-bench", "tissue", "final-file"] as SpotKind[])
    if (all.filter((s) => s.kind === k).length !== 1) out.push(`there must be exactly one ${k} spot`);
  for (let t = 1; t <= KEYCARD_TIERS; t++)
    if (!all.some((s) => s.kind === "keycard" && s.tier === t)) out.push(`no tier ${t} keycard anywhere`);
  for (const z of f.zones)
    if (!z.emergencyPower && !all.some((s) => s.kind === "breaker" && s.zone === z.id)) out.push(`zone ${z.id} has no breaker`);
  if (rooms.has(f.start) && start?.kind === "safe") out.push("the survivors start inside a safe room");
  return out;
}

/** Every way the GEOMETRY breaks: rooms overlapping on a floor, a door with no wall to sit in
 *  (its two rooms must share an edge on a floor they share, as long as the door is wide), a
 *  vertical link whose footprints don't overlap or whose floors aren't neighbours, a room off
 *  the floors. Vents are crawl routes through the ceiling and are exempt. Empty = buildable. */
export function layoutProblems(f: MapShape): string[] {
  const out: string[] = [];
  const E = 0.01;
  const rooms = new Map(f.rooms.map((r) => [r.id, r]));
  for (const r of f.rooms) {
    if (!(r.floor >= 0 && r.floor < FLOOR_Y.length) || r.floor + (r.spans ?? 1) > FLOOR_Y.length) out.push(`room ${r.id} is off the floors`);
    if (!(r.rect.w >= 2 && r.rect.h >= 2)) out.push(`room ${r.id} is too small to stand in`);
  }
  for (let i = 0; i < f.rooms.length; i++) for (let j = i + 1; j < f.rooms.length; j++) {
    const p = f.rooms[i], q = f.rooms[j];
    if (!floorsOf(p).some((x) => floorsOf(q).includes(x))) continue;
    const ox = Math.min(p.rect.x + p.rect.w, q.rect.x + q.rect.w) - Math.max(p.rect.x, q.rect.x);
    const oz = Math.min(p.rect.y + p.rect.h, q.rect.y + q.rect.h) - Math.max(p.rect.y, q.rect.y);
    if (ox > E && oz > E) out.push(`rooms ${p.id} and ${q.id} overlap on a floor`);
  }
  for (const d of f.doors) {
    if (d.kind === "vent") continue;
    const ra = rooms.get(d.a), rb = rooms.get(d.b);
    if (!ra || !rb) continue;
    const a = ra.rect, b = rb.rect;
    const shared = floorsOf(ra).some((x) => floorsOf(rb).includes(x));
    const ox = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x), oz = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
    if (!shared) {
      const gap = Math.abs(ra.floor - rb.floor) - (ra.floor < rb.floor ? (ra.spans ?? 1) - 1 : (rb.spans ?? 1) - 1);
      if (gap !== 1) out.push(`vertical link ${d.id} skips a floor`);
      if (!(ox > 1 && oz > 1)) out.push(`vertical link ${d.id}: its two rooms don't overlap from above`);
      continue;
    }
    const [w] = DOOR_SIZE[d.kind];
    const xEdge = (Math.abs(a.x + a.w - b.x) < E || Math.abs(b.x + b.w - a.x) < E) && oz >= w + 0.4;
    const zEdge = (Math.abs(a.y + a.h - b.y) < E || Math.abs(b.y + b.h - a.y) < E) && ox >= w + 0.4;
    if (!xEdge && !zEdge) out.push(`door ${d.id} has no shared wall wide enough between ${d.a} and ${d.b}`);
  }
  return out;
}

export function roomOf(f: Facility, id: string): Room | undefined {
  return f.rooms.find((r) => r.id === id);
}
