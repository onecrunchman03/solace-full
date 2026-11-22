// LEVEL 7 — THALASSOPHOBIA — the shared vocabulary: the room types, the module
// the city is drawn to, the depths, the three zones, the deco codes the server
// and the client both read. Pure data with NO imports (the map editor, a
// browser page, reads it too). The design is BACKROOMS.md → "LEVEL 7 —
// THALASSOPHOBIA".
//
// Josh, 2026-10-14: THE DIVE as the way down (the subway stair at the bottom of
// a sunken plaza, too deep for one breath — THE DIVING HELMET is the key), THE
// THING BELOW as the creature (something enormous under the water that rises
// on whoever stays too long in the deep), and the map as proposed: ~160², the
// Tower, the Rooftops, the Drop.

/** Thalassophobia's room types. APPEND ONLY: a type's index is its district
 *  id on the wire (sector.district). Every name is the level's OWN: the client
 *  keys ceiling heights and looks by type NAME across every level. */
export type OceanType =
  | "seatower" //  the half-sunk office tower: the way in (SAFE, dry)
  | "searoof" //   a rooftop standing out of the water (dry)
  | "seawade" //   a rooftop just under the surface (wading)
  | "seacanal" //  a drowned street between the buildings (deep water)
  | "seaplaza" //  THE SUNKEN PLAZA: the subway stair, the way on (very deep)
  | "seadrop" //   past the city's edge, where the bottom drops away
  | "seasunk"; //  a rooftop well under the surface: you swim over it
export const OCEAN_TYPES: readonly OceanType[] = ["seatower", "searoof", "seawade", "seacanal", "seaplaza", "seadrop", "seasunk"];

/** THE LATTICE: 10-cell city blocks (20m). The open water between blocks is
 *  one space — no walls are ever built between two outdoor cells. */
export const MODULE = 10;
/** The Tower's doorway slots, as the office's: 2 wide, 4 cells into a side. */
export const SLOT_AT = 4;
export const SLOT_W = 2;

/** THE WATER (steps of 0.5m). The surface everywhere is WATER_LEVEL; a cell is
 *  in the water iff its floor is below it. The water types take their zone's
 *  depth whatever their drawing says — a drawing's heights only reach ±12. */
export const WATER_LEVEL = 0;
/** A drowned street: 6m down. A breath takes you there and back. */
export const STREET_FLOOR = -12;
/** THE SUNKEN PLAZA: 24m down. One breath cannot reach it; the helmet can. */
export const PLAZA_FLOOR = -48;
/** Past the city's edge: 55m — the bottom is never seen. */
export const DROP_FLOOR = -110;
/** The floor a water type always takes (others use their drawing). */
export const OCEAN_DEPTH: Readonly<Partial<Record<OceanType, number>>> = {
  seacanal: STREET_FLOOR,
  seaplaza: PLAZA_FLOOR,
  seadrop: DROP_FLOOR,
};

/** THE THREE ZONES, by id on the map (Sector.section). 0 is no zone (solid). */
export const ZONE_TOWER = 1;
export const ZONE_CITY = 2;
export const ZONE_DROP = 3;
/** How many module rings around the map's edge are the Drop (of 16). */
export const DROP_RING = 2;

/** The floors each drawn type may take (steps): a roof stands out of the
 *  water, a wading roof is under it by less than a swim, a sunk roof by more. */
export const OCEAN_FLOOR_RANGE: Readonly<Partial<Record<OceanType, [number, number]>>> = {
  seatower: [1, 6],
  searoof: [1, 12],
  seawade: [-2, -1],
  seasunk: [-10, -4],
};
/** The types standing in the water (any step a splash, deep or not). */
export const OCEAN_WET_TYPES: readonly OceanType[] = ["seawade", "seacanal", "seaplaza", "seadrop", "seasunk"];

/** Rooms the Thing Below never reaches: the dry tower. (It is in the water;
 *  every dry cell is beyond it anyway.) */
export const OCEAN_SAFE_TYPES: readonly OceanType[] = ["seatower"];

/** Ceiling height (metres) by room type: the tower's offices low, the sea's
 *  "ceiling" so far up it is lost in the fog (the canon's ocean in a room). */
export const OCEAN_CEILINGS: Readonly<Record<OceanType, number>> = {
  seatower: 3.0,
  searoof: 40,
  seawade: 40,
  seacanal: 40,
  seaplaza: 40,
  seadrop: 40,
  seasunk: 40,
};

/** ONE DOOR PER LEVEL: the way in, up through the hatch from Lights Out. */
export const OCEAN_DOOR_NAME = "The Hatch";
/** The way on to Level 8, at the bottom of the sunken plaza. */
export const SUBWAY_NAME = "The Subway Stair";
/** Level 7's key. */
export const HELMET_NAME = "the Diving Helmet";

/** How many helmet spots a map carries at least. */
export const HELMET_SPOTS_MIN = 6;

/** Breath (ms) under the water: everyone's ten seconds, a minute with the
 *  helmet. After it runs out the water drains health as it always has. */
export const BREATH_MS = 10_000;
export const HELMET_BREATH_MS = 60_000;

// ---- Deco codes (kind*16 + variant) ------------------------------------------
export const TDECO = Object.freeze({
  none: 0,
  /** A ceiling fixture in the tower (a working caged bulkhead). */
  lamp: 1,
  /** The way in, on this cell's wall. v = wall side 0 N 1 E 2 S 3 W. */
  entrance: 2,
  /** THE SUBWAY STAIR, the way on, on this cell's wall. v = wall side. */
  subway: 3,
  /** A spot the Diving Helmet may lie on (the plan picks one per map). */
  helmet: 4,
});
export const tdecoByte = (kind: number, variant = 0): number => kind * 16 + (variant & 15);
export const tdecoKind = (b: number): number => b >> 4;
export const tdecoVar = (b: number): number => b & 15;
