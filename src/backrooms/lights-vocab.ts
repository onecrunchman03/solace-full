// LEVEL 6 — LIGHTS OUT — the shared vocabulary: the room types, the module
// the rooms are drawn to, the two zones, the deco codes the server and the
// client both read. Pure data with NO imports (the map editor, a browser page,
// reads it too). The design is BACKROOMS.md → "LEVEL 6 — LIGHTS OUT".
//
// Josh, 2026-10-14: THE HANDWHEEL as the way down (the sea hatch's wheel lies
// somewhere in the dark; the hatch is found by ear — the sea behind it), a
// creature that HUNTS BY SOUND (blind; light means nothing to it, noise
// everything — proximity voice included), and the map as proposed: ~120², the
// office's lattice, the Stair, the Corridors, the Wet End.

/** Lights Out's room types. APPEND ONLY: a type's index is its district id
 *  on the wire (sector.district). Every name is Lights Out's OWN: the
 *  client keys ceiling heights and looks by type NAME across every level, so
 *  a shared name ("corridor") would give one level another's ceilings. */
export type LightsType =
  | "stairfoot" //  the way in: the hotel's stairs come down here (SAFE)
  | "darkhall" //   a bare concrete corridor
  | "darkroom" //   a bare concrete room, doorways cut through it
  | "storeroom" //  shelves, drums and crates — batteries turn up here
  | "piperun" //    a low run of pipes
  | "cellblock" //  a room of concrete partitions (the references' maze)
  | "rubble" //     a room half fallen in
  | "deadoffice" // a dead office: a steel table, a chair, a shelf
  | "wetway" //     a flooded corridor (the Wet End)
  | "cistern" //    a big flooded hall (the Wet End)
  | "seahatch"; //  THE SEA HATCH, the way on to Level 7 (the Wet End)
export const LIGHTS_TYPES: readonly LightsType[] = [
  "stairfoot",
  "darkhall",
  "darkroom",
  "storeroom",
  "piperun",
  "cellblock",
  "rubble",
  "deadoffice",
  "wetway",
  "cistern",
  "seahatch",
];

/** THE LATTICE: the office's and the hotel's — 8-cell modules (16m), a 2-wide
 *  doorway SLOT in the middle two cells of every module side. */
export const MODULE = 8;
export const SLOT_AT = 3;
export const SLOT_W = 2;

/** THE TWO ZONES, by id on the map (Sector.section). 0 is no zone (solid). */
export const ZONE_DARK = 1;
export const ZONE_WET = 2;
/** How many module rows of the map, counted from the side FARTHEST from the
 *  way in, are the Wet End (of 14). */
export const WET_ROWS = 3;

/** The rooms standing in water: every floor cell of these is ankle-deep —
 *  every step a splash. */
export const WET_TYPES: readonly LightsType[] = ["wetway", "cistern", "seahatch"];
/** Rooms the creature never enters: the way in. */
export const LIGHTS_SAFE_TYPES: readonly LightsType[] = ["stairfoot"];

/** Ceiling height (metres) by room type: low and close, the cistern the one
 *  big space. */
export const LIGHTS_CEILINGS: Readonly<Record<LightsType, number>> = {
  stairfoot: 3.4,
  darkhall: 2.9,
  darkroom: 3.1,
  storeroom: 3.0,
  piperun: 2.7,
  cellblock: 3.0,
  rubble: 3.1,
  deadoffice: 2.8,
  wetway: 2.9,
  cistern: 5.0,
  seahatch: 3.2,
};

/** ONE DOOR PER LEVEL: the way in, down from the hotel's rusty door. */
export const LIGHTS_DOOR_NAME = "The Stair";
/** The way on to Level 7, opened with the Handwheel. */
export const SEAHATCH_NAME = "The Sea Hatch";
/** Level 6's key. */
export const HANDWHEEL_NAME = "the Handwheel";

/** How many Handwheel spots and battery spots a map carries at least. */
export const WHEEL_SPOTS_MIN = 6;
export const BATTERY_SPOTS_MIN = 10;

// ---- Deco codes (kind*16 + variant) ------------------------------------------
// Only what PLAYS or what the client must draw at a cell. Dressing is the prop
// kit's job (real models in the room designs).
export const LDECO = Object.freeze({
  none: 0,
  /** A ceiling fixture, DEAD (the fixture law: a real lamp model, drawn dark,
   *  casting nothing). v0 a caged bulkhead · v1 a fluorescent batten. */
  lamp: 1,
  /** The way in, on this cell's wall. v = wall side 0 N 1 E 2 S 3 W. */
  entrance: 2,
  /** THE SEA HATCH, the way on, on this cell's wall. v = wall side. */
  seahatch: 3,
  /** A spot the Handwheel may lie on (the plan picks one per map). */
  wheel: 4,
  /** A spot a spare battery may lie on. */
  battery: 5,
});
export const ldecoByte = (kind: number, variant = 0): number => kind * 16 + (variant & 15);
export const ldecoKind = (b: number): number => b >> 4;
export const ldecoVar = (b: number): number => b & 15;
