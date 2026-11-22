// LEVEL 5 — TERROR HOTEL — the shared vocabulary: the room types, the module
// the rooms are drawn to, the three zones, the deco codes the server and the
// client both read. Pure data with NO imports (the map editor, a browser page,
// reads it too). The design is BACKROOMS.md → "LEVEL 5 — TERROR HOTEL".
//
// Josh, 2026-10-13: "go with your recommendations" — THE GUEST REGISTER as the
// way down (a register in the Beverly Room names one suite; the Boiler Key
// hangs in it; the key opens the rusty door deep in the Boiler Room), THE
// DEATHMOTHS as the creature (drawn to your torch), THE LIFTS (floors 1-12
// take you across this floor, 13 and up never open again) and THE HEAT in the
// Boiler Room. One floor, the office's LATTICE: 8-cell modules packed wall to
// wall, a doorway slot in the middle of every module side.

/** The hotel's room types. APPEND ONLY: a type's index is its district id on
 *  the wire (sector.district). */
export type HotelType =
  | "landing" //    the way in: the service stair down from the office (SAFE)
  | "corridor" //   the Main Hall's corridors of numbered doors
  | "lounge" //     a lounge off the hall: palms, round tables, armchairs
  | "suite" //      a hotel room; one of them holds the Boiler Key
  | "lifthall" //   a bank of lifts (floors 1-12 go elsewhere on THIS floor)
  | "beverly" //    THE BEVERLY ROOM — the ballroom hub, the register
  | "linen" //      a linen room / service closet: dark, a moth nest
  | "dining" //     a dining room
  | "library" //    a reading room of bookshelves
  | "boilergate" // THE BOILER ROOM's door — the one way between the zones
  | "boiler" //     a furnace room
  | "pipeway" //    the Boiler Room's pipe corridors
  | "coalstore" //  a coal store: dark, a moth nest
  | "rustydoor"; // THE RUSTY DOOR, the way on to Level 6
export const HOTEL_TYPES: readonly HotelType[] = [
  "landing",
  "corridor",
  "lounge",
  "suite",
  "lifthall",
  "beverly",
  "linen",
  "dining",
  "library",
  "boilergate",
  "boiler",
  "pipeway",
  "coalstore",
  "rustydoor",
];

/** THE LATTICE: the office's — 8-cell modules (16m), a 2-wide doorway SLOT
 *  in the middle two cells of every module side. */
export const MODULE = 8;
export const SLOT_AT = 3;
export const SLOT_W = 2;

/** THE THREE ZONES, by id on the map (Sector.section — the Station's power
 *  sections, the office's blink zones). 0 is no zone (solid). */
export const ZONE_HALL = 1;
export const ZONE_BEVERLY = 2;
export const ZONE_BOILER = 3;
/** How many module rows of the map, counted from the side FARTHEST from the
 *  way in, are the Boiler Room (of 16). */
export const BOILER_ROWS = 5;

/** Ceiling height (metres) by room type: grand in the hall, a ballroom over
 *  the Beverly Room, low and close below stairs. */
export const HOTEL_CEILINGS: Readonly<Record<HotelType, number>> = {
  landing: 3.2,
  corridor: 3.4,
  lounge: 3.8,
  suite: 3.2,
  lifthall: 3.6,
  beverly: 6.5,
  linen: 2.8,
  dining: 3.8,
  library: 3.6,
  boilergate: 3.0,
  boiler: 4.2,
  pipeway: 2.9,
  coalstore: 2.7,
  rustydoor: 3.0,
};

/** Rooms the moths never enter: the way in. (The Beverly Room is not on
 *  this list — a swarm goes in, and finds the chandelier brighter than you.) */
export const HOTEL_SAFE_TYPES: readonly HotelType[] = ["landing"];
/** The rooms below stairs — the heat climbs while you are in them. */
export const HOT_TYPES: readonly HotelType[] = ["boiler", "pipeway", "coalstore", "rustydoor", "boilergate"];

/** ONE DOOR PER LEVEL: the way in, down the office's stairwell. */
export const HOTEL_DOOR_NAME = "The Service Stair";
/** The way on to Level 6, opened with the Boiler Key. */
export const RUSTYDOOR_NAME = "The Rusty Door";
/** The hub, where the register lies. */
export const BEVERLY_NAME = "The Beverly Room";

/** How many suites a map carries at least / at most — one of them holds the
 *  Boiler Key, named in the register. */
export const SUITES_MIN = 10;
export const SUITES_MAX = 16;

// ---- Deco codes (kind*16 + variant) ------------------------------------------
// Only what PLAYS or what the client must draw at a cell. Dressing is the prop
// kit's job (real models in the room designs).
export const HDECO = Object.freeze({
  none: 0,
  /** A ceiling fixture — a chandelier in the hotel, a caged bulb below stairs
   *  (the fixture law). v0 working · v1 dead · v2 flickering. */
  lamp: 1,
  /** The way in, on this cell's wall. v = wall side 0 N 1 E 2 S 3 W. */
  entrance: 2,
  /** THE RUSTY DOOR, the way on, on this cell's wall. v = wall side. */
  rustydoor: 3,
  /** A spot where a Boiler Key may hang (one in every suite; the register
   *  names which). */
  key: 4,
  /** THE GUEST REGISTER, open on the Mahjong table in the Beverly Room. */
  register: 5,
  /** A LIFT door on this cell's wall. v = wall side. */
  lift: 6,
  /** A wall SCONCE on this cell's wall. v = wall side + 4 × state (0 working,
   *  1 dead, 2 flickering). */
  sconce: 7,
  /** A FURNACE standing in this cell, its back to a wall: it glows, and burns
   *  whoever stands at its mouth. v = the side of the wall behind it (its
   *  mouth faces the opposite way). */
  furnace: 8,
  /** A MOTH NEST: a swarm sleeps here until a torch comes. */
  nest: 9,
});
export const hdecoByte = (kind: number, variant = 0): number => kind * 16 + (variant & 15);
export const hdecoKind = (b: number): number => b >> 4;
export const hdecoVar = (b: number): number => b & 15;
/** A sconce's wall side and state, from its variant. */
export const sconceSide = (v: number): number => v & 3;
export const sconceState = (v: number): number => v >> 2;
