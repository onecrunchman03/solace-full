// LEVEL 4 — THE ABANDONED OFFICE — the shared vocabulary: the room types, the
// module the rooms are drawn to, the blink zones, the deco codes the server
// and the client both read. Pure data with NO imports (the map editor, a
// browser page, reads it too). The design is BACKROOMS.md → "LEVEL 4 — THE
// ABANDONED OFFICE".
//
// Josh, 2026-10-12: "Let's do the next level in order. Office, let's do the
// key card. I like your idea on the creature. I agree on 4" (Station-sized).
// So the office is the Station's LATTICE (8-cell modules packed wall to wall,
// a doorway slot in the middle of every module side), dense rooms rather than
// long halls, with THE TEMP in it — a figure that only moves while nobody is
// looking — and the light as the level's whole mechanic: most of the
// troffers are dead, and the ones that work DIP for a moment, a zone at a
// time, on a clock every player shares. A dip is when the Temp moves.

/** The office's room types. APPEND ONLY: a type's index is its district id
 *  on the wire (sector.district). */
export type OfficeType =
  | "liftlobby" //   the way in: the lift you rode down (a SAFE room)
  | "security" //    the security office, where the keycard lies
  | "stairwell" //   the stairwell door, the way down (badge reader)
  | "hallway" //    plain office corridors
  | "cubicles" //    open-plan cubicle farms
  | "openplan" //    a vast bare floor, pillars, carpet dented where desks stood
  | "conference" //  a meeting room round one long table
  | "corneroffice" // an executive's office
  | "kitchenette" //   vending machines, a water cooler
  | "copyroom" //    the photocopier and the printers
  | "records" //     rows of filing cabinets and shelving
  | "serverroom" //  racks in the dark
  | "washroom" //    a washroom
  | "reception" //   a reception desk, a waiting area
  | "supply"; //     a supply closet
export const OFFICE_TYPES: readonly OfficeType[] = [
  "liftlobby",
  "security",
  "stairwell",
  "hallway",
  "cubicles",
  "openplan",
  "conference",
  "corneroffice",
  "kitchenette",
  "copyroom",
  "records",
  "serverroom",
  "washroom",
  "reception",
  "supply",
];

/** THE LATTICE: the Station's — 8-cell modules (16m), a 2-wide doorway SLOT
 *  in the middle two cells of every module side. */
export const MODULE = 8;
export const SLOT_AT = 3;
export const SLOT_W = 2;

/** THE BLINK ZONES: the troffers dip a zone at a time. Zone ids on the map
 *  run 1..BLINK_ZONES (Sector.section, which the Station uses for its power
 *  circuits); 0 is no zone (solid). Every room sits wholly inside one, so a
 *  room's lamps always dip together. */
export const BLINK_ZONES = 8;

/** How deep a lethal shaft is (steps) — the climb rule is shared; the office
 *  has none. */
export const OFFICE_PIT = 9;

/** Ceiling height (metres) by room type — a drop ceiling everywhere, low and
 *  close; the big open floors a little higher, the closets lower. */
export const OFFICE_CEILINGS: Readonly<Record<OfficeType, number>> = {
  liftlobby: 3.4,
  security: 2.8,
  stairwell: 3.0,
  hallway: 2.8,
  cubicles: 3.0,
  openplan: 3.2,
  conference: 2.9,
  corneroffice: 2.9,
  kitchenette: 2.8,
  copyroom: 2.7,
  records: 2.8,
  serverroom: 2.6,
  washroom: 2.6,
  reception: 3.2,
  supply: 2.5,
};

/** Rooms THE TEMP never enters (the Lift Lobby — the way in is safe). */
export const OFFICE_SAFE_TYPES: readonly OfficeType[] = ["liftlobby"];

/** ONE DOOR PER LEVEL: the way in from the Station's lift shutter. */
export const OFFICE_DOOR_NAME = "The Lift";
/** The way on to Level 5, opened with the security keycard. */
export const STAIRDOOR_NAME = "The Stairwell Door";
/** Where the keycard lies. */
export const KEYCARD_ROOM_NAME = "The Security Office";

// ---- Deco codes (kind*16 + variant) ------------------------------------------
// Only what PLAYS: the lamps (the Temp's whole rule), the doors, the card.
// Dressing is the prop kit's job (real models in the room designs).
export const ODECO = Object.freeze({
  none: 0,
  /** A ceiling troffer — a fixture (the fixture law). v0 working · v1 dead
   *  · v2 flickering. A working one LIGHTS its cell and the cells round it,
   *  and dips with its zone. */
  lamp: 1,
  /** The lift doors, the way in, on this cell's wall. v = wall side
   *  0 N 1 E 2 S 3 W. */
  entrance: 2,
  /** THE STAIRWELL DOOR, the way on, on this cell's wall: steel, a badge
   *  reader beside it. v = wall side. */
  stairdoor: 3,
  /** Where the SECURITY KEYCARD lies (on the desk in the Security Office). */
  keycard: 4,
  /** A WINDOW on this cell's wall, rain and fog behind it. v = wall side. */
  window: 5,
});
export const odecoByte = (kind: number, variant = 0): number => kind * 16 + (variant & 15);
export const odecoKind = (b: number): number => b >> 4;
export const odecoVar = (b: number): number => b & 15;

/** How far a working troffer's light reaches, in cells (the Chebyshev
 *  distance from the lamp's cell): a cell within it is LIT. The Temp is
 *  watched only where it is lit — a thing you can't see isn't watched. */
export const LAMP_REACH = 2;
