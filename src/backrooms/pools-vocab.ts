// THE POOLROOMS — the shared vocabulary: the water table, the deco codes, the
// room types, the river's cross-section. Pure data with NO imports, so the
// generator, the room library's dialect (pools-tiles.ts), the service and the
// map editor (a browser page) all read one table.

/** THE WATER TABLE, in steps: one surface everywhere. Water is DERIVED —
 *  any open floor below it is wet — so a tile draws a pool by drawing a
 *  sunken floor. Floor -1 is a dry step down; -2 ankle, -3 waist, -4 and
 *  below you swim. */
export const WATER_TABLE = -1;
/** Depth (surface − floor, steps) at which wading becomes SWIMMING. */
export const SWIM_DEPTH_STEPS = 3;

/** Is a floor of h steps under water? */
export const wetFloor = (h: number): boolean => h < WATER_TABLE;
/** THE EFFECTIVE FLOOR: a swimmer floats at the surface, so the climb rule
 *  reads the waterline wherever a floor is under it. */
export const effFloor = (h: number): number => (h < WATER_TABLE ? WATER_TABLE : h);

// ---- Deco codes (kind*16 + variant) — the kit-dressing layer -----------------
// Purely visual; colliders remain solid/wall/floor. The client maps these to
// the Poolrooms FBX kit (client/public/assets/pools/kit).
export const DECO = Object.freeze({
  none: 0,
  /** 2×2 round pillar, anchor = NW cell of a 2×2 solid block. */
  pillar: 1,
  /** Free-standing arch over this cell. v0 = opening faces N/S, v1 = E/W. */
  arch: 2,
  /** Full-circle portal ring, anchor = CENTER cell of a 3-wide gap.
   *  v0 = passage runs N/S, v1 = E/W. */
  portal: 3,
  /** Porthole on this cell's wall. v = side: 0 N, 1 E, 2 S, 3 W. */
  porthole: 4,
  /** Bridge deck over water. v0 = span runs E/W, v1 = N/S. */
  bridge: 5,
  /** Glowing ceiling skylight panel over this cell. */
  skylight: 6,
  /** Spiral-stair core, anchor = NW of a 2×2 solid core. */
  spiralcore: 7,
  /** Wall cubby/bench. v = side like porthole. */
  cubby: 8,
  /** Chrome pool ladder on this cell's edge into water. v = side. */
  ladder: 9,
  /** A tall arched window on this cell's wall, daylight behind it (the
   *  references' sunlit baths). v = side: 0 N, 1 E, 2 S, 3 W. */
  window: 10,
});
export const decoByte = (kind: number, variant = 0): number => kind * 16 + (variant & 15);

/** Level 1's room types — a subset of worldgen.ts's DistrictType. The type
 *  is the ceiling height the client builds (world.ts HEIGHT_BY_TYPE). */
export type PoolType = "river" | "natatorium" | "vaultsea" | "portalhall" | "tunnels" | "shallows" | "rotunda" | "baths";
export const POOL_TYPES: readonly PoolType[] = ["river", "natatorium", "vaultsea", "portalhall", "tunnels", "shallows", "rotunda", "baths"];

/** Ceiling height (metres) by room type — the client builds these
 *  (world.ts HEIGHT_BY_TYPE) and the map editor's 3D preview reads them.
 *  Very high everywhere, per Josh; the tunnels and baths are the intimate
 *  exception. */
export const POOL_CEILINGS: Readonly<Record<string, number>> = {
  river: 11.0,
  natatorium: 13.0,
  vaultsea: 10.5,
  portalhall: 9.0,
  tunnels: 5.5,
  shallows: 7.5,
  rotunda: 13.5,
  baths: 5.0,
};

/** THE RIVER'S CROSS-SECTION, lane by lane: a three-cell towpath each side,
 *  banks graded one step at a time, a three-cell bed at -6 (2.5m of water).
 *  Every river piece meets the next on exactly this, so the banks run on
 *  unbroken from piece to piece. 19 cells: 11 wet, 7 deep enough to swim. */
export const RIVER_PROFILE: readonly number[] = [0, 0, 0, -1, -2, -3, -4, -5, -6, -6, -6, -5, -4, -3, -2, -1, 0, 0, 0];
export const RIVER_WIDTH = RIVER_PROFILE.length;

/** THE ALLIGATORS' WATERS: a body of water this big, and this deep somewhere
 *  (steps), gets one resident (service.ts). The generator spaces its
 *  footbridges so a reach of river clears it. */
export const GATOR_MIN_CELLS = 800;
export const GATOR_MIN_DEPTH = 2;

/** The way in and out. ONE DOOR PER LEVEL (Josh, 2026-09-27: "Just put only
 *  one door per level for entering let's make it easy"): The Landing is where
 *  Level 0's passage arrives, where the hub's enter lands you, and the way
 *  out. The Changing Rooms, the Filtration Hall and the High Dive were exits
 *  on P3; on P4 they are named halls. */
export const POOL_DOOR_NAMES: readonly string[] = ["The Landing"];
/** How far The Landing stands from the Confluence (P4/P5, the river level). */
export const LANDING_FROM_CENTRE = 80;

/** THE THREE ZONES (P6, Sep 29 2026 — Josh's references: a flooded bathhouse,
 *  not a river valley). Rooms are drawn for a zone (their `set`), and the
 *  generator lets a room stand only in its own zone, measured outward from
 *  The Landing: the SUNLIT BATHS near the door (bright, shallow, windows),
 *  the ARCADES round them (vaults and columns over water, the lap lanes and
 *  their boats), THE DEEP beyond (dim cisterns, the alligators' water).
 *  Radii are a share of the map's size. */
export type PoolZone = "baths" | "arcades" | "deep";
export const ZONE_RADII: Readonly<Record<"baths" | "arcades", number>> = { baths: 0.2, arcades: 0.36 };
