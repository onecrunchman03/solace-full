// LEVEL 3 — THE ELECTRICAL STATION — the shared vocabulary: the room types, the
// module the rooms are drawn to, the sections, the deco codes the server and
// the client both read. Pure data with NO imports (the map editor, a browser
// page, reads it too). The design is BACKROOMS.md → "LEVEL 3 — ELECTRICAL
// STATION"; the wiring list is docs/backrooms/LEVEL3-WIRING.md.
//
// Josh, Oct 2026: smaller and denser than Pipe Dreams — tight service
// corridors and machine rooms. So the station is a LATTICE like Level 0
// (rooms packed wall to wall on a module grid, doorway slots on every module
// side), with smaller modules, and its rooms belong to SIX SECTIONS: each
// section is one power circuit with its own breaker, its own cutoff, its own
// lights and its own live water.

/** The station's room types. APPEND ONLY: a type's index is its district id
 *  on the wire (sector.district). */
export type StationType =
  | "intake" //       the arrival hall, behind Pipe Dreams' pressure door
  | "lifthall" //     the exit: the roller shutter to Level 4
  | "switchroom" //   a section's breaker room
  | "serviceway" //   the tight corridors
  | "cablevault" //   cramped cable runs and trays
  | "controldesk" //  a small control room
  | "batteryroom" //  battery racks in rows
  | "xfmrbay" //      a transformer bay — tall, live
  | "substation" //   the big switchgear hall
  | "workshop" //     maintenance: benches, lockers
  | "floodroom"; //   a pump room with the floor under water
export const STATION_TYPES: readonly StationType[] = [
  "intake",
  "lifthall",
  "switchroom",
  "serviceway",
  "cablevault",
  "controldesk",
  "batteryroom",
  "xfmrbay",
  "substation",
  "workshop",
  "floodroom",
];

/** THE LATTICE: every room is a whole number of MODULES a side; every module
 *  side carries a doorway SLOT in the same place. 8 cells (16m), against
 *  Level 0's 10: the station is denser. */
export const MODULE = 8;
/** A slot: SLOT_W cells wide, SLOT_AT cells into its module side (the
 *  middle two of eight). */
export const SLOT_AT = 3;
export const SLOT_W = 2;

/** THE SIX SECTIONS (Josh: "there will be 6 breakers"). Section ids on the
 *  map run 1..SECTIONS; 0 is no section (rock). */
export const SECTIONS = 6;

/** How deep a lethal shaft is (steps) — worldgen.ts PIT_LETHAL. The station
 *  has none, but the climb rule is shared. */
export const STATION_PIT = 9;

/** Ceiling height (metres) by room type — the client builds these
 *  (world.ts HEIGHT_BY_TYPE) and the editor's preview reads them. Low and
 *  close in the corridors and vaults; tall where the big machines stand. */
export const STATION_CEILINGS: Readonly<Record<StationType, number>> = {
  intake: 4.4,
  lifthall: 6.0,
  switchroom: 3.8,
  serviceway: 3.0,
  cablevault: 2.7,
  controldesk: 3.4,
  batteryroom: 3.4,
  xfmrbay: 6.4,
  substation: 7.0,
  workshop: 3.6,
  floodroom: 4.0,
};

/** ONE DOOR PER LEVEL: the way in from Pipe Dreams, and the way out. */
export const STATION_DOOR_NAME = "The Pressure Door";
/** The way on to Level 4, opened by all six breakers. */
export const SHUTTER_NAME = "The Lift Shutter";

// ---- Deco codes (kind*16 + variant) ------------------------------------------
// Everything the server reads and the client draws, per cell. Dressing is
// the prop kit's job (real models in the room designs), so the deco is only
// what PLAYS: the lamps, the doors, the breakers and cutoffs, the hazards.
export const SDECO = Object.freeze({
  none: 0,
  /** A ceiling lamp — a fixture model (the fixture law). v0 working · v1 dead
   *  · v2 flickering. It is lit when its section has power. */
  lamp: 1,
  /** The arrival door, on this cell's wall. v = wall side 0 N 1 E 2 S 3 W. */
  entrance: 2,
  /** The roller shutter to Level 4, on this cell's wall. v = wall side. */
  shutter: 3,
  /** A section's BREAKER, on this cell's wall. v = wall side. Thrown once,
   *  thrown forever (backrooms_flags). */
  breaker: 4,
  /** A section's CUTOFF, on this cell's wall. v = wall side. Kills the
   *  section's power for a while: its lights go dark, its water goes safe. */
  cutoff: 5,
  /** An ARCING PANEL on this cell's wall: it crackles, then arcs, on a clock
   *  every client hears together. Live while its section has power. v = side. */
  arc: 6,
  /** ELECTRIFIED WATER standing on this cell: live while its section has
   *  power, safe while the section is cut. */
  puddle: 7,
});
export const sdecoByte = (kind: number, variant = 0): number => kind * 16 + (variant & 15);
export const sdecoKind = (b: number): number => b >> 4;
export const sdecoVar = (b: number): number => b & 15;
